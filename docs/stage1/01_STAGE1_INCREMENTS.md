# Jade: Stage 1 delivery increments

| | |
|---|---|
| Design baseline | **V11**, maintained through 20 September 2026 (backend `docs/JDE_AI_Driven_Change_Factory_Design_Document_v11.docx`, last changed in `fb1e05a`). The proposed update is `docs/stage0/04_JADE_DESIGN_V13_DRAFT.md`. |
| Starting point | Stage 0 audit at frontend `d109e9c` and backend `20574b7`: `docs/stage0/01`–`05` |
| Branches | Frontend `claude/focused-gates-gtay96`; backend `claude/stage1-setup-and-safeguards` (new; it starts from `main` at `20574b7`) |
| Status | Nothing is merged or deployed, and nothing has been purchased. No JDE reads or writes were made; the JDE connection stayed in mock mode throughout. |

Stage 1 is split into four increments. Each one can be demonstrated on its own.

| Increment | What it delivers | State |
|---|---|---|
| **S1-1** Reliable saved setup and user identity | Code and tests | **Implemented on branch**, demonstrated locally |
| **S1-2** Execution safeguards | Code and tests | **Implemented on branch**, demonstrated locally |
| **S1-3** Minimal shared-backend deployment | Proposal (`02_SHARED_BACKEND_DEPLOYMENT_PROPOSAL.md`) | **Proposal only.** Its code prerequisites R-1 to R-3 are implemented on the branch (review pass, `04_REVIEW_PACK.md` §5). |
| **S1-4** First JDE DEV experiments | Prerequisites and bounded test plans (`03_JDE_DEV_EXPERIMENT_PLANS.md`) | **Plan only.** Waiting on DEV access (D-3). |

Recommended order: S1-4's access requests go out **now**, because their lead time is the longest. S1-1 and S1-2 are ready for review. S1-3 needs owner decisions and fix R-1. The Experiment E technical session is planned in parallel with Experiment A, not after it.

---

## S1-1 Reliable saved setup and user identity

### Scope delivered

| Problem (Stage 0 defect) | Change | Where |
|---|---|---|
| Typed "Your name" and the `ciq_approver` key (P-3) | Removed. Every setup save records the signed-in user. A client-sent `updatedBy` is ignored. | API: `routers/admin.py`, `services/engagement_scope_service.py`, `jira_*_service.py`, `business_domain_service.py`. FE: `ErpLandscape.tsx`, `Integrations.tsx` |
| Silent concurrent overwrite (P-4) | Setup records carry a `revision`. A save states the revision it was based on. A stale save gets 409 with the current revision. Saving an existing record without a revision gets 428. Old records load as revision 1. | API: `persistence/revisions.py`, `main.py` handlers, migration 2. FE: `services/saveErrors.ts`, `httpApi.ts` |
| Non-atomic JSON writes (P-4) | Temp file, `fsync`, `os.replace`, under a per-directory lock. Exact-change records too (S1-2). | API: `persistence/json_file_store.py`. MCP: `approval.py` |
| Stuck or silent saves (P-6) | Load, save, create and status-change errors are shown. On a conflict, typed edits are kept, with "Discard my edits and reload". | FE: `ErpLandscape.tsx`, `BusinessDomains.tsx`, `Integrations.tsx`, `CustomerSetup.tsx` |
| Browser-only dashboard thresholds (P-5) | Now a company setting. `GET` for any member, `PUT` for Admin only, revisioned and attributed. An Admin is shown any value an older build left in the browser, and can import it once or discard it. The import can never overwrite a value already on the server. | API: `company_settings` table, `services/company_settings_service.py`, `/admin/dashboard-thresholds`. FE: `dashboardThresholds.ts`, `CustomerSetup.tsx`, `Dashboard.tsx` |
| Mock/real drift | The mock service applies the same revision and actor rules, so the demo site behaves the same way. | FE: `mockApi.ts` |

**Not in S1-1 (remains for later):**

- the business-domain edit endpoint, and deriving `domain_owner` from `domain_assignments` (P-9);
- a Playwright suite running in CI (the B-6 remainder).

### Demonstration that proves completion

1. **Backend tests.** `python3 -m pytest api_service/tests/ -q`: 207 pass. The S1-1 cases are in `api_service/tests/test_stage1_saved_setup.py` (15 tests):
   - the actor comes from the session;
   - 409 and 428 responses;
   - thresholds: defaults, Admin-only writes, company isolation, persistence after re-instantiation;
   - atomic writes, including a failed write that leaves the old record intact.
2. **Browser demonstration.** `e2e/stage1/s1_1_saved_setup.py` runs against a real local backend: **12/12 checks pass**.
   - Browser-held thresholds are previewed and imported once, then seen from a second browser.
   - Two users edit the engagement scope. The later save is refused with a visible message, and the edits already typed are kept.
   - A stale business-domain status change is refused, and the selector returns to the stored value.
   - The form has no name field, and no request sends `updatedBy`.

Storage-audit acceptance tests (`02_STORAGE_AUDIT.md` §4) now covered:

| Test | Status |
|---|---|
| 1 | Covered |
| 2 | Covered |
| 3 | Restart and re-instantiation covered; a clean-container redeploy needs hosting (S1-3) |
| 4 | Covered |
| 5 | Covered |
| 6 | Covered |
| 7 | Covered: the error is visible, though a network failure shows the browser's raw message |
| 8 | Covered |

### Effort and dependencies

- **Effort:** 3.5 / 5.75 / 9.75 person-days (low / base / high), taken from backlog B-2, B-3 and part of B-6 (see the mapping below).
- **Dependencies:** none. Built on the existing auth, SQLite and JSON stores.

---

## S1-2 Execution safeguards

### Scope delivered

| Problem | Change | Where |
|---|---|---|
| Enforced scope was one global `scope.json`, while the per-company screen was not wired to it (P-2) | The gate now reads **the story's own company** record:<ul><li>the company comes from the story's intake link, never from the caller;</li><li>the record is the one the company's Admin saves on ERP / JDE Landscape.</li></ul>The global file is no longer read. No link, no saved scope, or a mismatch refuses. Change records carry `company_id`. Approve and reject must come from the same company. Execution re-checks the link. | MCP: `scope.py`, `approval.py`, `ais_client.py`. API: `main._wire_execution_gate`, `change_service.py` |
| Any writer, including an Admin, could approve an exact change (P-8) | Each company has an **approval policy**: the approver roles (Admin, Product Manager and/or Domain Owner) and how long an approval stays valid (1–168 hours). There is no default.<ul><li>No policy: 409, nothing can be approved.</li><li>An approver without an allowed role: 403.</li><li>A policy version or field the gate does not recognise: refused.</li></ul>The approval records the approver's matching roles, the policy version and the scope revision. The **current** policy is re-checked before execution, so tightening it withdraws earlier approvals. | MCP: `scope.require_approval_policy`, `approval.approve_change`. API: `models/engagement_scope.ApprovalPolicy`, `routers/architecture_review.py`. FE: `ErpLandscape.tsx` |
| Spike `expires_at` ignored; test runs ignored approval expiry (P-7) | Spikes must be dated (checked on save) and must match the capability revision. An expired or undated spike allows nothing. An approval with a missing or past expiry refuses writes **and** `run_orchestration`. | MCP: `scope.find_spike_experiment`, `approval._require_live_approval`. API: `SpikeExperiment` validator |
| Documented but unenforced sections (P-7) | Labelled "reference only" in the UI. In `scope.example.json` they move under `_proposed_not_enforced`. | FE `ErpLandscape.tsx`; backend `scope.example.json`, README, GETTING_STARTED |
| Runs stuck as "running" after a restart (P-11, first part) | On startup, interrupted Receive/Improve/Check, Architect and agent runs are marked failed with "interrupted by a backend restart; retry". Nothing is re-run automatically. | API: `services/run_recovery.py`, `main._lifespan` |
| Unauthenticated local approval tools | `backlog_review.py` and `review_ui.py` still list and show exact changes, but refuse to decide them. That decision needs the approver's company roles, which only Jade's login establishes. | backend root |
| A refused approval left the screen busy | Architecture Review and Change Detail show the server's reason. | FE `ArchitectureReview.tsx`, `ChangeDetail.tsx` |
| Admin had no way to set the gate's inputs | ERP / JDE Landscape now edits these, and shows expired spikes:<ul><li>the approval policy;</li><li>the DEV environment binding, with an explicit isolation confirmation;</li><li>dated spike experiments;</li><li>the capability each approved version is bound to.</li></ul>The server stamps who confirmed isolation and who approved each spike. | FE `ErpLandscape.tsx`, `types/domain.ts` |

**Not in S1-2 (remains for later):**

- moving these records from JSON files into the relational database, and making `scope.json` import-only (the B-4 remainder);
- enforcing or removing `protected_scope`, `mechanisms` and `test_scope`;
- policies per domain and action type (the B-5 remainder);
- a worker process with resume and idempotent attempts (the B-7 remainder).

### Demonstration that proves completion

1. **Backend tests.** `api_service/tests/test_stage1_execution_safeguards.py` has 19 tests, **one refusal per test**, plus the success path. Each of these refuses:
   - an unlinked story;
   - a company with no scope;
   - approval from another company;
   - a story moved to another company after approval;
   - DEV isolation not confirmed;
   - no policy (API 409);
   - a role outside the policy (API 403);
   - an unknown policy version or field;
   - a policy tightened after approval;
   - a policy the API cannot enforce (422);
   - an expired approval, for both the write and the test run;
   - an approval with no expiry;
   - an expired spike;
   - an undated spike (422);
   - a spike for the wrong capability revision.

   The suite also covers server-stamped spike approval and restart recovery. As a mutation check, removing the spike-expiry check makes the matching test fail.
2. **`python3 prove_the_gate.py`: 17/17 checks pass.** Steps 11–16 are new:
   - expired spike;
   - unlinked story;
   - company without a scope;
   - no policy;
   - disallowed role;
   - expired approval for both write and test run.

   It now uses a temporary company and never touches local data.
3. **Browser demonstration.** `e2e/stage1/s1_2_execution_safeguards.py`, with a pending change seeded by backend `scripts/seed_demo_pending_change.py`: **5/5 checks pass**.
   - Approval is refused, with the reason shown, while the company has no policy.
   - The Admin sets a Product-Manager policy and a DEV binding.
   - The same approval then succeeds under the signed-in name.

### Effort and dependencies

- **Effort:** 4 / 6.75 / 10.75 person-days, taken from B-4, B-5 and parts of B-6 and B-7.
- **Dependency:** S1-1, for revisions and the session actor on the scope record.

**Operational note.** The MCP server started by Claude Code for agent runs inherits `JDE_COMPANY_SCOPE_DIR` and `JDE_STORY_COMPANY_DIR` from the backend process. If someone starts Claude Code **directly**, those are unset, so every write and test run is refused (fail-closed). That is intended. Set both variables to the backend's data directories to use the CLI path.

---

## S1-3 Minimal shared-backend deployment (proposal)

See `02_SHARED_BACKEND_DEPLOYMENT_PROPOSAL.md`.

- **Scope:** one always-on instance of the existing application with a persistent disk, daily platform snapshots plus weekly off-platform backups, secrets in the platform's environment, login on `api.consultiq.nl`, and the email limits stated plainly.
- **Cost:** about USD 27/month at list prices, or about USD 52 with the Pro workspace; either way well inside the EUR 100 infrastructure target, with AI excluded.
- **Blocking prerequisite (R-1):** today the anonymous forgot-password endpoint returns a working reset link in the default dev-preview mode. On a public host that is an account-takeover path, so it must be fixed first.
- **Before external users or real Jira tokens:** R-2 (login rate limiting) and R-3 (Jira token encryption, or an explicit owner decision to accept plaintext).
- **Effort to carry out, once approved:** 2 / 3.5 / 6 person-days (low / base / high), or 2.5 / 4 / 7 including R-2. That covers R-1, R-3, configuration, verification of the storage acceptance tests on the host, and a restore drill.
- **Dependencies:** S1-1 and S1-2 merged, and owner decision D-2.
- **Demonstration:** all eight storage acceptance tests pass on the host, including a redeploy with the same disk, plus a restore from backup into a fresh service.

## S1-4 JDE DEV experiments (prerequisites and bounded plans)

See `03_JDE_DEV_EXPERIMENT_PLANS.md`. It covers Experiment A (a real processing-option change) and Experiment E (a representative technical-object change), started together. Each plan lists:

- exact access and CNC prerequisites;
- a bounded, reversible test sequence with stop conditions;
- the evidence to capture;
- what counts as success, partial success or "not automatable yet".

- **Effort:**
  - planning: done;
  - B-9 (first real read): 2 / 4 / 8 person-days once access exists;
  - A and E themselves: not estimated with confidence until they report (Stage 2 rule).
- **Dependencies:** D-3 (DEV access, service accounts, CNC isolation confirmation). S1-2 must be merged before A's write step.
- **Demonstration:**
  - A: a customer-DEV-validated write with before/after evidence, or a precise recorded limitation;
  - E: a measured result for the technical change;
  - for either, "untested" if access is not granted.

---

## How the 26 / 44 / 74 person-day estimate maps

The Stage 0 estimate (`05_IMPLEMENTATION_BACKLOG.md`) totals 26 / 44 / 74 person-days (low / base / high) across B-1 to B-13. Part of it is now delivered by S1-1 and S1-2. Part belongs to S1-4's first execution step. The remainder is later product expansion.

| Backlog item | Original | In S1-1 | In S1-2 | S1-4 (execution) | Later expansion | What remains |
|---|---|---|---|---|---|---|
| B-1 Honest demo banner | 0.5/1/2 | | | | 0.5/1/2 | Needed while the live site stays mock. Dropped if S1-3 goes live. |
| B-2 Revisioned, attributed setup | 3/5/8 | 2.5/4/6.5 | | | 0.5/1/1.5 | Domain edit endpoint; domain owner derived from assignments (P-9) |
| B-3 Thresholds as company setting | 0.5/1/2 | 0.5/1/2 | | | — | — |
| B-4 Per-company enablement read by the gate | 3/5/8 | | 2/3.5/5.5 | | 1/1.5/2.5 | Move into DB tables; `scope.json` import-only; enforce or remove proposed sections |
| B-5 Approver policy | 1/2/3 | | 1/1.5/2.5 | | 0/0.5/0.5 | Per domain and action type |
| B-6 Persistence acceptance suite | 2/3/5 | 0.5/0.75/1.25 | 0.5/0.75/1.25 | | 1/1.5/2.5 | Playwright in CI; hosted redeploy test |
| B-7 Durable runs | 4/6/10 | | 0.5/1/1.5 | | 3.5/5/8.5 | Worker, run/step/attempt tables, resume, idempotency |
| B-8 Structured spec and exact-change fields | 2/4/6 | | | | 2/4/6 | (approver authority is already done by S1-2) |
| B-9 Environment profile and one real read | 2/4/8 | | | 2/4/8 | | The first step of Experiment A once access exists |
| B-10 Usage ledger | 2/3/5 | | | | 2/3/5 | |
| B-11 Linking data model (APQC, maps, faults) | 3/5/8 | | | | 3/5/8 | |
| B-12 Real/mock/human labels | 1/2/4 | | | | 1/2/4 | |
| B-13 Test coverage gaps | 2/3/5 | | | | 2/3/5 | (gate negatives are partly covered by the S1-2 tests) |
| **Total** | **26/44/74** | **3.5/5.75/9.75** | **4/6.75/10.75** | **2/4/8** | **16.5/27.5/45.5** | |

Work that was **not** in the 26/44/74 estimate:

- **S1-3 documentation:** 0.5 / 1 / 1.5 days, done.
- **S1-3 execution:** 2 / 3.5 / 6 days, or 2.5 / 4 / 7 with R-2. Hosting was Stage 6 and was not estimated before.
- **S1-4 plans:** 0.5 / 1 / 1.5 days, done.
- **Experiments A and E:** Stage 2, not estimated until measured.

These are estimates for one engineer who knows the codebase. They exclude review, JDE specialist or CNC time, and customer waiting time.

## Storage-audit defects after S1-1 and S1-2

| Defect | Status |
|---|---|
| P-1 Live site is mock only | Open. Resolved by S1-3 if approved; until then B-1. |
| P-2 Global scope file | **Fixed on branch** (S1-2) |
| P-3 Typed attribution | **Fixed on branch** (S1-1) |
| P-4 No revisions; non-atomic writes | **Fixed on branch** for the setup records audited (S1-1) |
| P-5 Browser-only thresholds | **Fixed on branch** (S1-1) |
| P-6 Silent or stuck saves | **Fixed on branch** (S1-1, plus S1-2 for exact-change decisions) |
| P-7 Unenforced sections; spike expiry | Spike expiry **fixed**. Unenforced sections **labelled**; enforcing or removing them is the B-4 remainder. |
| P-8 Any writer approves | **Fixed on branch** (S1-2) |
| P-9 Domain owner held twice | **Fixed on branch** (review pass). It also exposed two approval-authority gaps, fixed too; see `04_REVIEW_PACK.md` §6. |
| P-10 Jira token plaintext | **Fixed on branch** (review pass): tokens encrypted, key only in the environment |
| P-11 Runs lost on restart | **Partly fixed**: agent runs no longer stay "running". JDE writes and test runs caught mid-flight are recorded as **unknown** and block any retry until reconciled (review pass). Resume is the B-7 remainder. |
| P-12 Only Jira had restart tests | **Fixed on branch** for thresholds and engagement scope. Other records are covered via the shared store tests. |

## Review references

| Repo | Branch | Commits (oldest first) |
|---|---|---|
| backend `Hendro33/jde_change_factory_backend` | `claude/stage1-setup-and-safeguards` | `4184721` S1-1 · `679710d` S1-2 · `4600736` demo seed script · review pass: `1a7b822`, `90c9225`, `e38f710`, `972e22d` (see `04_REVIEW_PACK.md` §1.1) |
| frontend `Hendro33/JDE_change_factory_frontend` | `claude/focused-gates-gtay96` | `1c9fc89` S1-1 · `2c5e9dc` S1-2 · `6a941b2` browser demonstrations · this document set |

The stale backend branch `claude/focused-gates-gtay96` (`a4f711b`) was not touched.
