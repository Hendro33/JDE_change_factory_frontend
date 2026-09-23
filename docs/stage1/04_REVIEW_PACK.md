# Jade Stage 1: independent review pack

Prepared on 23 September 2026 for an independent reviewer (Codex or a person).

This pack covers:

- the Stage 1 increments S1-1 and S1-2;
- the review-readiness pass that followed them (sections 3–7).

**Status:** nothing is merged or deployed, nothing has been purchased, and no JDE system has been contacted.

## 1. What to review

| | Frontend | Backend |
|---|---|---|
| Repository | https://github.com/Hendro33/JDE_change_factory_frontend | https://github.com/Hendro33/jde_change_factory_backend |
| Branch | `claude/focused-gates-gtay96` | `claude/stage1-setup-and-safeguards` |
| Base (audited, `main`) | `d109e9c` | `20574b7` |
| Head at time of writing | the commit that adds this document (§1.1, row 10) | `2860fdd` |
| Full diff | [compare `main`…branch](https://github.com/Hendro33/JDE_change_factory_frontend/compare/main...claude/focused-gates-gtay96) | [compare `main`…branch](https://github.com/Hendro33/jde_change_factory_backend/compare/main...claude/stage1-setup-and-safeguards) |
| Size vs base | Code and demos: 22 files, +1428 / −180. Documentation: 8 files, +2035. | 61 files, +3780 / −500 (including about 1,300 lines of new tests) |

Locally: `git diff d109e9c..claude/focused-gates-gtay96` and `git diff 20574b7..claude/stage1-setup-and-safeguards`.

### 1.1 Commits, oldest first (each one reviewable on its own)

| # | Backend | Frontend | What |
|---|---|---|---|
| 1 | — | `937e8ce`, `9e60015` | Stage 0 baseline documents |
| 2 | `4184721` | `1c9fc89` | S1-1: session actor, revisions (409/428), atomic writes, server-side thresholds, visible save errors |
| 3 | `679710d` | `2c5e9dc` | S1-2: per-company gate, approval policy, dated spikes, restart recovery, Admin UI for the gate's inputs |
| 4 | `4600736` | `6a941b2` | Browser demonstrations and their seed script |
| 5 | — | `df67f3a` | Stage 1 plan documents |
| 6 | `1a7b822` | `75f6531` | Domain Owner authority fix (§6) |
| 7 | `90c9225` | `1557df3` | Unknown JDE outcomes, reconciliation, connected checks, preflight (§3, §4) |
| 8 | `e38f710` | `a481adc` | Sign-in rate limiting, encrypted Jira tokens, no anonymous reset links (§5) |
| 9 | `972e22d` | `c4d31a8` | Preflight completeness, found by the browser demonstration |
| 10 | `2860fdd` | this documentation commit | This pack, the storage map, and document updates |

The stale backend branch `claude/focused-gates-gtay96` (`a4f711b`) was not touched.

## 2. Evidence, by kind

Three kinds of evidence, kept separate. Do not read one as another.

### 2.1 Repeatable automated tests (run on any machine; no network, no JDE)

| Suite | Command | Result at head |
|---|---|---|
| Backend API and gate | `python3 -m pytest api_service/tests -q` (from the backend root) | **235 passed** (173 before Stage 1) |
| Gate proof script | `python3 prove_the_gate.py` | **20/20 checks pass**. Uses a temporary company and temporary directories. |
| Frontend type check and build | `npx tsc --noEmit -p . && npm run build` | Pass |

New backend test files and what each proves:

| File | Tests | Proves |
|---|---:|---|
| `test_stage1_saved_setup.py` | 15 | <ul><li>Setup saves are attributed to the signed-in user.</li><li>409 and 428 responses.</li><li>Thresholds: Admin-only, company-isolated, persistent.</li><li>Atomic writes.</li></ul> |
| `test_stage1_execution_safeguards.py` | 19 | One refusal per test: company scope, policy, approver role, expiry, spike window; plus restart recovery |
| `test_domain_owner_authority.py` | 5 | <ul><li>No domain means no Domain Owner.</li><li>A story cannot be moved into an owner's own domain.</li><li>A story cannot be moved after review has started.</li><li>Owners are derived from assignments.</li><li>A domain from another company is refused.</li></ul> |
| `test_execution_attempts.py` | 12 | <ul><li>An interrupted write is recorded as unknown.</li><li>A blind retry is refused.</li><li>Reconciliation ends as applied, not applied or diverged.</li><li>A change applies once, and its test runs once.</li><li>Live mode is simulated with the HTTP call replaced: the environment must match, and an HTTP 200 still counts as unknown.</li></ul> |
| `test_login_and_credential_security.py` | 11 | <ul><li>Sign-in limits per account and per client, surviving a restart.</li><li>Tokens encrypted at rest.</li><li>Missing, wrong or rotated key; legacy plaintext.</li><li>Reset-link rules.</li></ul> |

Twenty-nine existing governance tests were changed. They had passed only because an all-roles test user acted as Domain Owner on stories that had no domain (§6). They now triage the story first, through `conftest.place_in_owned_domain`.

**No CI runs any of these.** The only workflow in either repository is the frontend Pages deploy (`deploy-pages.yml`), which builds but does not test. The frontend has no unit-test runner (backlog B-13).

### 2.2 Local browser demonstrations (repeatable, but they need two local servers; not in CI)

These are Playwright scripts. They drive the real frontend against a real local backend, on throwaway data, with JDE in mock mode. `e2e/stage1/README.md` says how to run them. Credentials come from environment variables only.

| Script | Last run | Result |
|---|---|---|
| `e2e/stage1/s1_1_saved_setup.py` | 23 Sep 2026, about 19:01 UTC, fresh data, at head | **12/12** |
| `e2e/stage1/s1_2_execution_safeguards.py` (after `scripts/seed_demo_pending_change.py`) | same run | **6/6**. The sixth check was added in this pass. |

The screenshots are not committed; the scripts write them to a git-ignored folder. The demonstration found one real defect, which is fixed in commit 9 (§1.1).

### 2.3 Deployed behaviour: none

- **Live site:** `jade.consultiq.nl` serves frontend `main` (`d109e9c`) in **mock mode**. None of the code on these branches is deployed there.
- **Backend:** no hosted backend exists. The deployment proposal is `02_SHARED_BACKEND_DEPLOYMENT_PROPOSAL.md`, not acted on.
- **JDE:** no system has been contacted. Every JDE statement here is from mock mode or from reading code.

## 3. Interrupted runs and unknown JDE outcomes

**The problem.** An agent run that stops is simply retried; it never writes to JDE. A JDE write or test run is different. Once its request has left, an interruption means nobody knows whether JDE applied it.

**What was built:** `mcp_server/jde_mcp_server/execution.py`.

**Attempt recording:**

- Every write and test run is recorded as an attempt **before** anything is sent.
- The attempt is closed with what is actually known:
  - `applied` or `completed`;
  - `not_sent`: provably never left, for example a refused connection;
  - `unknown`.
- `unknown` covers:
  - a timeout or error after sending;
  - a crash, since the attempt stays in progress;
  - a restart, which marks in-flight attempts unknown on startup;
  - an attempt in progress for more than 15 minutes.

**Blocking:**

- Anything other than `ready` blocks the next attempt at the gate, so there is no blind retry.
- A write known to be applied never runs again under the same approval.
- A test runs only after its write is applied, and only once.

**Reconciliation.** Only someone with the company's approval authority can reconcile. It compares the **actual target value** with the approved value and the value before:

- equal to the approved value: `applied`;
- equal to the value before: `not applied`, and the change may run again under its still-valid approval;
- anything else: `diverged`, and the change never runs again.

**Reading the target.** Mock mode reads the mock JDE state itself. In live mode, the response shape for reading one processing option has not been validated yet (Experiment A step A1). So a person reads the value in JDE and records it, with a note, and it is labelled "human-verified".

**Live writes.** Until Experiment A validates the response, even an HTTP 200 from a live write is recorded as `unknown`. Every live write therefore needs this read-back, which is plan step A4 anyway.

**UI.** Architecture Review and Change Detail show the write and test state, the reconciliation history, and a reconcile form when needed.

## 4. Execution safeguards: implemented, invoked, enforced

### 4.1 Checks

| Check | Where | Invoked before a JDE write? | Before a test run? | Notes |
|---|---|---|---|---|
| Story approved (Gate 2) | `backlog.require_approved` | Yes | Yes | |
| Exact change approved, unexpired, same company, approver's role still allowed by the current policy | `approval._require_live_approval` | Yes | Yes | Expiry is now checked for test runs too |
| Operation identical to the approved one | `approval.require_exact_change` | Yes | n/a | **Fixed:** a change bound to a test could never execute, because the test name was part of the hash |
| Capability has an execution adapter, and the tool matches it | `approval.require_supported_operation` | Yes, and at proposal | n/a | **New.** Only `processing_option_update` via `set_processing_option` |
| Capability validated, or inside a current spike window for the same capability revision | `capability_catalog.require_executable`, `scope.find_spike_experiment` | Yes | n/a | |
| DEV binding present and isolation confirmed | `scope.check_environment_binding` | Yes | No (the test runs after its write) | |
| JDE connection's environment equals the bound DEV environment | `ais_client.require_bound_environment` | Yes (live mode) | Yes (live mode) | **New.** Previously never compared |
| Target in approved versions; value allowed | `scope.check_functional_scope`, `check_allowed_value` | Yes | n/a | |
| Not an XJDE/ZJDE version | `scope.reject_if_oracle_owned_version` | Yes | n/a | |
| No attempt in flight, applied or unknown | `execution.require_ready` | Yes | Yes | **New** (§3) |
| Test name is the approved one; write already applied | `approval.require_change_covers_test` | n/a | Yes | "Write applied" is new |
| Live write payload recorded | `ais_client.FSR_SET_PROCESSING_OPTION` | Yes (live): it is `None`, so every live write refuses | n/a | Experiment A prerequisite A-P5 |
| Interactive human confirmation (Claude Code hook) | `.claude/hooks/approve_writes.py` | Only when an agent runs in Claude Code with a terminal; no terminal means refused | Now also | Pilot mechanism; its JSON output format is unverified against the current Claude Code version |
| Technical object type authorised | `scope.check_technical_scope` | **Not invoked:** no technical write tool exists | | Correct to leave until a technical tool exists (Experiment E) |
| Custom product code 55–59 | `scope.check_custom_product_code` | **Not invoked:** same reason | | Same |
| Change Sets | `change_set.propose_change_set` | Always refuses | | Deliberate |

A read-only **preflight** (`GET /changes/{id}/execution/preflight`) evaluates every applicable check at once and shows the result in the UI. It never records an attempt.

### 4.2 Scope sections

| Section | Enforced? |
|---|---|
| `environment` (binding, isolation) | Yes |
| `approval_policy` | Yes, at approval and before execution |
| `functional_agent.approved_versions` (with `capability_id`, `allowed_values`) | Yes |
| `functional_agent.spike_experiments` (dated, per capability revision) | Yes |
| `functional_agent.never_touch_categories`, free-text `approvers` | **No.** Reference only; labelled in the UI |
| `technical_agent.*` | **No.** No technical tool; labelled "no technical write tool exists" |
| `protected_scope`, `mechanisms`, `test_scope` | **No.** Not stored; listed under `_proposed_not_enforced` in `scope.example.json` |
| Catalogue `risk.restricted_fields` | **No.** Descriptive text only |

ERP / JDE Landscape now has a "What the execution gate enforces" panel with these same three lists: enforced, recorded but not enforced, and not available.

### 4.3 What the first experiments need, and its state

| Experiment A needs | State |
|---|---|
| Per-company scope, policy, dated spike, DEV binding | Enforced (S1-2) |
| JDE connection bound to the scoped DEV environment | **Connected in this pass** |
| A change bound to its acceptance test can execute | **Fixed in this pass** |
| Unknown outcome recorded, and the read-back recorded (A4) | **Built in this pass**; live read-back is human-verified |
| Live write payload | Still missing (A-P5): a reviewed code change, after a read-only field-ID capture |
| Automated live read-back | Not built. It needs the A1 response shape. |

Experiment E does not go through Jade's gate: it is human-run with agent assistance. There is no technical write tool, and none was added.

## 5. Before public deployment or real-token use

| Item | Implemented | Test |
|---|---|---|
| **Sign-in rate limiting** | <ul><li>5 failures per account, or 20 per client address, in 15 minutes: refused with 429 and `Retry-After`.</li><li>Refused attempts are never checked against the password.</li><li>Counted in SQLite, so the limit survives a restart.</li><li>`JDE_TRUST_PROXY_HEADERS` behind Render.</li></ul> | 4 tests |
| **Jira token encryption** | <ul><li>Fernet (`cryptography`).</li><li>The key is only in `JDE_CREDENTIAL_KEY`, never on disk or in backups.</li><li>No key: saving is refused.</li><li>A wrong or lost key: reported as unreadable, and falls back to mock Jira.</li><li>Legacy plaintext is encrypted on start.</li><li>Rotation through `JDE_CREDENTIAL_KEY_PREVIOUS`.</li></ul> | 5 tests, including that the database file never contains the token |
| **R-1 anonymous reset link** | <ul><li>`/auth/forgot-password` never returns a link.</li><li>Admins issue reset links under Admin > Users.</li><li>An Admin cannot for someone who also belongs to a company they don't administer.</li></ul> | 2 new tests; 3 updated |

Backup and recovery implications are in backend `docs/OPERATIONS.md`, updated in this pass:

- consistent SQLite copy, verified by a local dry run;
- encrypting the archive;
- which key a restore needs;
- lost-key recovery (re-enter tokens);
- rotation;
- unlocking an account.

No key or secret value appears in any file.

Deployment still needs the owner's decisions and approval (D-2, D-10, the purchase). Nothing here deploys anything.

## 6. The Domain Owner duplication defect (P-9)

**What it was.** `BusinessDomain.domain_owner` is a free-text name, while real authority comes from `domain_assignments` (Admin > Users). The UI showed the free text as "Domain Owner".

**Did it affect approval authority?** **Yes, but not through the free text.** Looking into P-9 exposed two real gaps in the authority check itself:

1. **A story with no business domain could be approved by any Domain Owner in the company.** `require_domain_owner_access` skipped the assignment check when the story had no domain.
2. **Any writer, a Domain Owner included, could re-point a story's domain, even mid-review.** They could move it into their own domain and then approve it.

**Did it affect company isolation?** No. Domains and stories are always company-scoped. One data-quality gap was found and closed: an Admin could assign another company's domain ID to a member. It granted nothing across companies, but it is now refused.

**Fixed before any execution testing:**

- no domain means no Domain Owner;
- assigning a domain is a Product Manager or Admin action, closed once review starts;
- member domains must belong to the same company;
- the UI shows the assigned owners, derived on every read; the free text is a legacy note only.

Twenty-nine existing tests had relied on gap 1 (§2.1).

## 7. Elapsed time and human involvement

These are actual timestamps from the session transcript and git, not estimates.

| Pass | Request received (UTC) | Last commit (UTC) | Elapsed | Human involvement during the pass |
|---|---|---|---|---|
| Stage 0 audit and baseline documents | 16:51 | 17:05 (plus a V11 pin at 17:19, after a follow-up question at 17:18) | about 14 min (plus 1 min) | 1 request with 3 documents attached, 1 follow-up question. No review, edits or approvals during the pass. |
| Stage 1: S1-1, S1-2, S1-3/S1-4 documents | 17:25 | 18:00 | about 35 min | 1 request. Then "stop" (18:33) after the report. No edits or approvals during the pass. |
| This review-readiness pass (§3–§6) | 18:39 | 19:06 (this commit) | about 27 min | 1 request. No edits or approvals during the pass. |
| **Total, all three passes** | | | **about 77 min** of session time | 4 messages with instructions |

Human time spent writing the requests and reading the reports is not measured here.

The work was done by one AI coding session. It includes writing tests and running the local servers and browser demonstrations. It does **not** include independent review, which has not happened yet, or any JDE, CNC or customer time.

**Estimated equivalent person-days** are a different measure. They are what an engineer who knows this codebase would need, and they come from `05_IMPLEMENTATION_BACKLOG.md` and `01_STAGE1_INCREMENTS.md`:

- S1-1: 3.5 / 5.75 / 9.75 (low / base / high);
- S1-2: 4 / 6.75 / 10.75.

This pass was not in any earlier estimate. As person-days for the same engineer:

- the domain-owner fix: about 1 / 1.5 / 2.5;
- unknown outcomes and reconciliation: about 2 / 3 / 5;
- the safeguard wiring and preflight: about 1 / 2 / 3;
- sign-in limiting, encryption and the reset-link fix: about 1.5 / 2.5 / 4;
- **total: 5.5 / 9 / 14.5.**

The gap between elapsed minutes and estimated days should **not** be read as a productivity ratio for later stages:

- Review has not happened yet.
- Nothing has touched a real JDE system.
- The hardest work (Experiments A and E) is gated on access and CNC time, not typing.
