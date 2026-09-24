# Jade Stage 1: independent review pack

Prepared on 23 September 2026 for an independent reviewer (Codex or a person).

This pack covers:

- the Stage 1 increments S1-1 and S1-2;
- the review-readiness pass that followed them (sections 3–7);
- the acceptance pass that followed that review (**§8**; it updates §1–§5 and §7 where noted);
- the Architect Environment Discovery increment (**§9**).

**Status:** nothing is merged or deployed, nothing has been purchased, and no JDE system has been contacted.

## 1. What to review

| | Frontend | Backend |
|---|---|---|
| Repository | https://github.com/Hendro33/JDE_change_factory_frontend | https://github.com/Hendro33/jde_change_factory_backend |
| Branch | `claude/focused-gates-gtay96` | `claude/stage1-setup-and-safeguards` |
| Base (audited, `main`) | `d109e9c` | `20574b7` |
| Head at time of writing | the commit that adds this update (§1.1, row 16) | `e1336e6` |
| Full diff | [compare `main`…branch](https://github.com/Hendro33/JDE_change_factory_frontend/compare/main...claude/focused-gates-gtay96) | [compare `main`…branch](https://github.com/Hendro33/jde_change_factory_backend/compare/main...claude/stage1-setup-and-safeguards) |
| Size vs base | Code, demos and CI: 24 files, +1773 / −199. Documentation: 10 files, about +2,500. | 78 files, +6529 / −680 (about half of it tests) |
| Acceptance pass only | [compare `661dd1c`…branch](https://github.com/Hendro33/JDE_change_factory_frontend/compare/661dd1c...claude/focused-gates-gtay96) | [compare `2860fdd`…branch](https://github.com/Hendro33/jde_change_factory_backend/compare/2860fdd...claude/stage1-setup-and-safeguards): 47 files, +2889 / −330 |

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
| 10 | `2860fdd` | `661dd1c` | This pack, the storage map, and document updates |
| 11 | `d727a69` | `ea3648e` | §8 A1: no simulated Jira outside explicit demo mode; explicit "unavailable" state |
| 12 | `331e539` | `7d38638` | §8 A2: enforced capability boundaries (target, mechanism, protected categories, test side effects) |
| 13 | `708c701` | `f5f56d1` | §8 A3: membership revisions, locked workflow transitions, authority re-checked at dispatch |
| 14 | `1b2b2fa` | `3c1b53f` | §8 A4: audited reconciliation; write and test reconciliation separate |
| 15 | `d010bea` | — | §8 A5: consistent backup and restore with a write pause |
| 16 | `29a801e`, `e1336e6` | `7afa173`, this documentation commit | §8 A6: CI, and this update |

The stale backend branch `claude/focused-gates-gtay96` (`a4f711b`) was not touched.

## 2. Evidence, by kind

Three kinds of evidence, kept separate. Do not read one as another.

### 2.1 Repeatable automated tests (run on any machine; no network, no JDE)

| Suite | Command | Result at head |
|---|---|---|
| Backend API and gate | `python -m pytest -q` (from `api_service/`) | **291 passed** (235 before the acceptance pass, 173 before Stage 1) |
| Gate proof script | `python3 prove_the_gate.py` | **22 steps, 29/29 checks pass**. Uses a temporary company and temporary directories. |
| Frontend type check and build | `npx tsc -b && npx vite build` | Pass |

New backend test files and what each proves:

| File | Tests | Proves |
|---|---:|---|
| `test_stage1_saved_setup.py` | 15 | <ul><li>Setup saves are attributed to the signed-in user.</li><li>409 and 428 responses.</li><li>Thresholds: Admin-only, company-isolated, persistent.</li><li>Atomic writes.</li></ul> |
| `test_stage1_execution_safeguards.py` | 19 | One refusal per test: company scope, policy, approver role, expiry, spike window; plus restart recovery |
| `test_domain_owner_authority.py` | 5 | <ul><li>No domain means no Domain Owner.</li><li>A story cannot be moved into an owner's own domain.</li><li>A story cannot be moved after review has started.</li><li>Owners are derived from assignments.</li><li>A domain from another company is refused.</li></ul> |
| `test_execution_attempts.py` | 12 | <ul><li>An interrupted write is recorded as unknown.</li><li>A blind retry is refused.</li><li>Reconciliation ends as applied, not applied or diverged.</li><li>A change applies once, and its test runs once.</li><li>Live mode is simulated with the HTTP call replaced: the environment must match, and an HTTP 200 still counts as unknown.</li></ul> |
| `test_login_and_credential_security.py` | 11 | <ul><li>Sign-in limits per account and per client, surviving a restart.</li><li>Tokens encrypted at rest.</li><li>Missing, wrong or rotated key; legacy plaintext.</li><li>Reset-link rules.</li></ul> |
| `test_jira_no_silent_mock.py` (§8 A1) | 4 | Nothing configured, an unreadable token, or a token Jira rejects: sync refused, nothing imported. Simulated Jira appears only in explicit demo mode |
| `test_capability_boundaries.py` (§8 A2) | 22 | <ul><li>Exactly one capability is executable.</li><li>A capability with no enforcement contract cannot be proposed; an incomplete contract blocks an approved change.</li><li>Mechanism not allowed; target approved for another capability.</li><li>Protected, undeclared and never-touch categories.</li><li>Free text is kept as notes and never enforced.</li><li>Unapproved tests and forbidden side effects.</li><li>API rejects unknown values (422); preflight lists every boundary.</li></ul> |
| `test_concurrency_and_stale_authority.py` (§8 A3) | 15 | <ul><li>Stale or missing membership revisions: 409 and 428.</li><li>Two concurrent edits land exactly once.</li><li>An Admin demoted mid-request changes nothing.</li><li>A domain assignment removed mid-request blocks the approval.</li><li>Approve racing reject lands once (domain review and exact change).</li><li>A Product Manager demoted mid-request cannot authorise delivery.</li><li>A role, membership or user lost after approval blocks execution, including between the tool's checks and dispatch.</li><li>No membership database, or no approver id: nothing runs.</li></ul> |
| `test_audited_reconciliation.py` (§8 A4) | 9 | <ul><li>Target, observation, actor, time and evidence are recorded, and chained.</li><li>An evidence reference and actor are required.</li><li>"Not applied" keeps expiry, current scope, current policy and current authority.</li><li>Only a policy approver can reconcile.</li><li>Write and test reconciliation cannot cross.</li></ul> |
| `test_backup_restore.py` (§8 A5) | 6 | <ul><li>Restore after later changes brings back SQLite and JSON state together; after a restart, the approval and execution states behave as at backup time.</li><li>Writes are refused during a backup.</li><li>No backup while an attempt is in flight.</li><li>A tampered archive is refused.</li><li>A key mismatch is reported, then recovered with the old key.</li></ul> |

Twenty-nine existing governance tests were changed. They had passed only because an all-roles test user acted as Domain Owner on stories that had no domain (§6). They now triage the story first, through `conftest.place_in_owned_domain`.

**CI (§8 A6).** `.github/workflows/ci.yml` in each repository runs on every pull request, on pushes to `main` and to the `claude/**` working branches, and by hand. It never deploys.

- **Backend:** clean install, then `pytest`, then `prove_the_gate.py`.
- **Frontend:** `npm ci`, `tsc -b`, then `vite build`.

The frontend still has no unit-test runner (backlog B-13; not required for this increment).

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
- equal to the value before: `not applied`. The change may run again, but only through every normal check: approval expiry (never refreshed by reconciling), current scope, current policy and the approver's current authority (§8 A4);
- anything else: `diverged`, and the change never runs again.

**Reading the target.** Mock mode reads the mock JDE state itself. In live mode, the response shape for reading one processing option has not been validated yet (Experiment A step A1). So a person reads the value in JDE and records it, with a note, and it is labelled "human-verified".

**Live writes.** Until Experiment A validates the response, even an HTTP 200 from a live write is recorded as `unknown`. Every live write therefore needs this read-back, which is plan step A4 anyway.

**Audit (§8 A4).** Each reconciliation records the exact target, the observation, the actor's id and name, the time, the attempt it settles and an evidence reference, and is appended to the story's evidence chain. Write and test reconciliation are separate actions and records.

**UI.** Architecture Review and Change Detail show the write and test state, separate write and test reconciliation logs, and a reconcile form (with an evidence reference) when needed.

## 4. Execution safeguards: implemented, invoked, enforced

### 4.1 Checks

| Check | Where | Invoked before a JDE write? | Before a test run? | Notes |
|---|---|---|---|---|
| Story approved (Gate 2) | `backlog.require_approved` | Yes | Yes | |
| Exact change approved, unexpired, same company, approver's role still allowed by the current policy | `approval._require_live_approval` | Yes | Yes | Expiry is now checked for test runs too |
| Operation identical to the approved one | `approval.require_exact_change` | Yes | n/a | **Fixed:** a change bound to a test could never execute, because the test name was part of the hash |
| Capability has a complete **enforcement contract**, and the tool matches it | `approval.require_supported_operation`, `capability_catalog.require_enforcement` | Yes, and at proposal | Yes | Only `processing_option_update` via `set_processing_option` (§8 A2) |
| Target approved for this capability; mechanism allowed; option category declared, not protected, not never-touch | `ais_client.set_processing_option`, `scope.check_mechanism`, `scope.check_option_category` | Yes | n/a | **New** (§8 A2) |
| Test is an approved test; its mechanism allowed; its declared side effects permitted | `scope.check_test_boundary` | n/a | Yes | **New** (§8 A2) |
| Approver still holds an allowed role, active membership, active user | `authority.require_current_approver` (read-only SQLite) | Yes, inside the attempt lock | Yes, inside the attempt lock | **New** (§8 A3). Also re-read at approval |
| Writes not paused for backup/restore | `execution.begin` | Yes | Yes | **New** (§8 A5) |
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
| `functional_agent.approved_versions[].option_category` | **Yes** (§8 A2). Empty blocks execution |
| `functional_agent.never_touch_categories` (closed list) | **Yes** (§8 A2) |
| `mechanisms_allowed`, `test_scope.approved_tests` (with side effects) | **Yes** (§8 A2) |
| `functional_agent.never_touch_notes`, free-text `approvers` | **No.** Reference only; labelled "not enforced" in the UI |
| `technical_agent.*` | **No.** No technical tool; labelled "no technical write tool exists" |
| Protected categories | **Yes**, from the capability's enforcement contract. A company cannot unprotect them |
| Catalogue `risk.restricted_fields` and other descriptive text | **No.** Descriptive only. The enforced version is the `enforcement` block |

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
| **Jira token encryption** | <ul><li>Fernet (`cryptography`).</li><li>The key is only in `JDE_CREDENTIAL_KEY`, never on disk or in backups.</li><li>No key: saving is refused.</li><li>A wrong or lost key: reported as unreadable, and Jira is shown as Unavailable; sync is refused (§8 A1).</li><li>Legacy plaintext is encrypted on start.</li><li>Rotation through `JDE_CREDENTIAL_KEY_PREVIOUS`.</li></ul> | 5 tests, including that the database file never contains the token |
| **R-1 anonymous reset link** | <ul><li>`/auth/forgot-password` never returns a link.</li><li>Admins issue reset links under Admin > Users.</li><li>An Admin cannot for someone who also belongs to a company they don't administer.</li></ul> | 2 new tests; 3 updated |

Backup and recovery implications are in backend `docs/OPERATIONS.md`, updated in this pass:

- consistent backup of SQLite **and** the JSON records under a write pause, with a tested restore (§8 A5);
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
| Acceptance pass (§8) | 19:23 | 19:59 (this commit) | about 40 min, including a summarised context hand-over | 1 request. No edits or approvals during the pass. |
| **Total, all four passes** | | | **about 2 h** of session time | 5 messages with instructions |

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

## 8. Acceptance pass (A1–A6)

Six acceptance points followed the review of §1–§7. Each is listed with where it is implemented, how it is tested, and what remains.

### A1. No simulated Jira in real mode

- **What changed:** `registry.jira_mode()` returns one of three states:
  - `demo`: only when `JDE_JIRA_MOCK_MODE=true`;
  - `live`: a readable credential and a complete configuration;
  - `unavailable`, with a reason: anything else. Nothing falls back.
- **When Jira is unavailable:**
  - sync is refused with 409 "Jira integration unavailable: …";
  - a Jira error such as 401, an HTTP failure or a gateway error returns 502;
  - nothing is imported.
- **UI:** Integrations shows Live, Demo (simulated Jira) or Unavailable, with the reason. User Stories disables retrieval and says why.
- **Tests:** `test_jira_no_silent_mock.py`, plus 10 earlier tests rewritten to this contract.

### A2. Enumerated executable capabilities, enforced boundaries

- **Enumeration:** `capability_catalog.executable_capabilities()` returns only capabilities with a complete, machine-readable `enforcement` block. Today that is **`processing_option_update` only**. Its contract covers:
  - **tool:** `set_processing_option`;
  - **mechanism:** `ais_form_service_request`;
  - **target:** a customer-owned version listed in the company's approved versions;
  - **option categories:** 3 open and 6 protected (pricing, tax, GL/AAI, security, payments, outbound integration);
  - **test:** `ais_orchestration`, with side effects limited to `none` or `creates_dev_transaction`.
- **Refused at proposal and at execution:** any capability without a complete contract ("restrictions exist only as documentation").
- **Checked at each write, against closed values in the company's saved scope:**
  - the target is approved for this capability;
  - the mechanism is allowed;
  - the category is declared, known, not protected and not never-touch.
- **Checked at each test:** the test is approved, its mechanism is allowed, and its declared side effects are permitted.
- **Free text:** free-text never-touch entries are moved to `never_touch_notes` on save and never read by the gate.
- **UI:** ERP Landscape edits these values as checkboxes and closed lists. It shows unclassified or protected targets as refused, and notes as "not enforced".
- **Tests:** `test_capability_boundaries.py` and gate-proof steps 19–21.

### A3. Concurrency and stale authority

- **Memberships:**
  - a `revision` column (migration 4);
  - a role, domain or status change needs `expectedRevision` (409 if stale, 428 if absent);
  - the change runs under `BEGIN IMMEDIATE` and re-checks, inside that transaction, that the caller is still an Admin;
  - the Users screen sends the revision.
- **Domain-review decisions:** a stage compare-and-set under the review store's lock. The caller's roles and domain assignment are re-read from SQLite inside the lock.
- **Exact-change approve and reject:** these run under the per-change lock. Approval re-reads the approver's roles and records `approver_user_id`.
- **Dispatch:**
  - every write and test check is re-run inside the attempt lock (`execution.begin(revalidate=…)`);
  - this includes the approver's **current** roles, active membership and active user, read from SQLite in read-only mode (`JDE_AUTH_DB_PATH`, exported at startup);
  - a missing database or a missing approver id blocks execution.
- **Tests:** `test_concurrency_and_stale_authority.py` (threads, and mid-request revocation injected at the exact window) and gate-proof step 22.

### A4. Audited reconciliation

- **Recorded for each reconciliation:**
  - the exact target: company, story, change, capability and revision, environment, bound JDE environment, and application/version/option with the approved value (or the orchestration, for a test);
  - the observation;
  - the actor's user id and name;
  - the time, in ISO format;
  - the attempt it settles;
  - an evidence reference. This is required; the automated mock read supplies its own.
- **Evidence chain:** each reconciliation is appended to the story's tamper-evident chain.
- **"Not applied"** makes the change ready again. A retry passes every normal check, and the approval expiry is never refreshed.
- **Separation:** write and test reconciliations are separate records and API fields, and each refuses the other's state.
- **Tests:** `test_audited_reconciliation.py`.
- **Incidental fix:** `evidence.py` bound its directory at import time. That was a test-isolation defect, and it now reads the directory at call time.

### A5. Consistent backup and restore

- **Tool:** `scripts/jade_backup.py`, with the `backup`, `verify` and `restore` commands, over `services/backup_restore.py`.
- **Write pause:** a flag file makes the API answer mutating requests with 503 and makes the gate refuse to dispatch. A backup is also refused while an agent run or JDE attempt is in progress.
- **Manifest:**
  - a checksum for every file;
  - a summary of memberships, approvals and execution states, scope revisions and evidence chains;
  - the credential **key ids** needed. The key is never included.
- **Restore:**
  - it verifies the checksums first;
  - it moves the current data aside, never deleting it;
  - it runs `integrity_check`;
  - it compares the restored state with the manifest;
  - it reports whether the current key can read the tokens.
- **Key recovery:** documented in backend `docs/OPERATIONS.md`, "Recovering the matching credential key". Keys are stored in the password manager under their key id, and supplied as current or previous key.
- **Tests:** `test_backup_restore.py`.

### A6. CI

See §2.1. First runs, started by this pass's pushes, both passed: [backend run 35912807199](https://github.com/Hendro33/jde_change_factory_backend/actions/runs/35912807199) on `e1336e6` (tests and gate proof), and [frontend run 35912824563](https://github.com/Hendro33/JDE_change_factory_frontend/actions/runs/35912824563) on `7afa173` (type-check and build).

### Remaining limitations (after this pass)

1. **Single process only.** The review-store lock and the write-pause flag are honoured within one API process, and by the gate that runs with it. The per-change file lock and SQLite work across processes. A second worker or instance needs the JSON-to-database move first (storage map §6).
2. **Some workflow records are still last-write-wins.** Collections other than domain reviews, exact changes and memberships have no compare-and-set: change requests, the delivery queue and architecture reviews.
3. **A Domain Owner's exact-change approval is re-checked by role, not by domain assignment.** At dispatch, the approver must still hold an allowed role. Whether they are still assigned to the story's domain is checked for domain-review decisions only. The default policy allows only Product Managers to approve exact changes.
4. **The live processing-option write is still unavailable.** `FSR_SET_PROCESSING_OPTION` is `None` (Experiment A, A-P5), and live read-back remains human-verified. Nothing in this pass contacted JDE.
5. **Test side effects are declared by a person, not observed.** The gate enforces what is declared.
6. **Backups are not scheduled.** The script is run by hand, and Render's snapshot is not paused.
7. **The Claude Code approval hook** is still a pilot mechanism (§4.1).
8. **Not done here:** no deployment, merge, pull request or JDE write.

## 9. Architect Environment Discovery

This increment lets the Architect research a company's DEV installation through governed, read-only discovery; approved technical exports and reference documents; and an immutable evidence baseline for every design. It is administered under Admin → Integrations → JDE. It was built on top of the hardening in §8, which was complete (CI green) before this work started.

**Status:** not merged, not deployed. No customer JDE was contacted. Every JDE interaction described here ran against the backend's labelled simulated endpoint, or against an HTTP mock in tests.

### 9.1 Where to review it

| | Backend | Frontend |
|---|---|---|
| Compare (this increment only) | [`e1336e6`…branch](https://github.com/Hendro33/jde_change_factory_backend/compare/e1336e6...claude/stage1-setup-and-safeguards) | [`375a419`…branch](https://github.com/Hendro33/JDE_change_factory_frontend/compare/375a419...claude/focused-gates-gtay96) |
| Commits | `2e80b82` (discovery), `0fd5c90` (integrations row, demo seed), `e5dd5e7` (operations) | `35f43ff` (UI and demonstrations), this documentation commit |

**Backend code:**
- `api_service/jde_api_service/discovery/`:
  - `capabilities`;
  - `models`;
  - `profile_service`;
  - `transport`;
  - `service`;
  - `artifacts`;
  - `baseline`;
  - `architect_tools`.
- `routers/discovery.py`;
- migration 5;
- `services/architecture_driver.py`;
- `mcp_server/jde_mcp_server/design_baseline.py`;
- the agent definitions `architect.md` and `functional-agent.md`.

**Frontend code:**
- `services/discoveryApi.ts`;
- `components/JdeDiscoveryPanel.tsx`;
- `components/DesignEvidencePanel.tsx`;
- ERP Landscape;
- Integrations;
- Architecture Review.

### 9.2 Design decisions a reviewer should check

- **Tools, not agents.** The Architect gets four typed tools: `list_discovery_capabilities`, `discovery_read`, `list_baseline_artifacts` and `read_baseline_artifact`. They run as an **in-process** MCP server inside the API, built for one run and bound to the story's company. Credentials never reach the agent runtime or the `mcp_server` subprocess.
- **Company from records.** The company comes from the story's own backend link, and is re-checked on every call. The model never chooses it.
- **Ungoverned reads removed.** The old `get_object`, `get_version` and `get_processing_options` tools are no longer offered to the Architect or to the solution conversation. They are not company-scoped.
- **Capabilities are a closed list**, each one supported, unverified or unavailable:
  - **Unavailable:** source code, event rules and full object specifications. AIS does not expose them; the tool points to the baseline import instead.
  - **Unverified:** everything else, until an approved sample read succeeds for the current profile revision.
- **Requests are built from typed parameters.** Before dispatch, the semantics are checked: BROWSE only; no form, batch or business-function fields; no paging; at most 10 records.
- **The manifest records what the run actually did** (the run ledger), not what the model says. A citation to evidence the run did not gather is marked unvalidated and downgraded to an assumption. System gaps are added for:
  - refused or unavailable reads;
  - incompatible documentation;
  - exports whose correspondence to the runtime is unknown;
  - simulated evidence;
  - redaction.
- **Changed evidence never edits a manifest.** Refresh Evidence creates a new baseline revision. A changed observation, a newer artifact revision or a material profile change flags the design `needs_reassessment`. The flag reaches the downstream hand-off copy too.
- **Execution never reads a baseline.** A test asserts that the gate's modules do not import it.

### 9.3 Implementation and test evidence

**Automated tests:**
- **Backend:** 350 passed (291 before this increment).
- **Gate proof:** 22 steps, all checks pass (unchanged).
- **Frontend:** type-check and build pass.

**New test files:**

| File | Tests | Covers |
|---|---:|---|
| `test_discovery_profile.py` | 20 | <ul><li>Versioned persistence; saving never contacts JDE.</li><li>409 and 428 revision handling.</li><li>The credential is encrypted, masked and never returned. With no key it is refused; with a lost key it is unreadable and blocks the connection.</li><li>A material change, or a new credential, switches discovery off; contact names do not.</li><li>Company scope and Admin-only access.</li><li>Unsafe settings refused (422).</li><li>Enable needs every check and both attestations.</li><li>Environment mismatch detected.</li><li>Capability status is stated explicitly.</li></ul> |
| `test_discovery_policy.py` | 29 | <ul><li>Twelve kinds of out-of-scope call are blocked with **zero** requests sent: an execution tool name, an unavailable or unapproved capability, a wrong target, a field or filter outside scope, a disallowed operator, a wildcard, an extra filter key, and record limits.</li><li>Sanitised evidence and provenance; exactly auth, one read, logout.</li><li>The 10-record cap, with "more available" reported.</li><li>`metadata_only` redaction.</li><li>Window, forged-company and changed-profile grants are refused.</li><li>One request at a time.</li><li>Disable blocks queued calls and reports in-flight ones.</li><li>Sanitised activity.</li><li>No write capability: endpoint set, semantic checks, and no imports of the execution tools.</li><li>Live transport against an HTTP mock: deployment switch, allowlist, fixed endpoints, no redirects, unverifiable environment, circuit breaker, and saving sends nothing.</li></ul> |
| `test_architect_discovery.py` | 10 | Acceptance 1–8 and 10 through the real Architect driver, with a scripted model calling the same tools: correct company profile; cited observations; artifact provenance; missing code and incompatible documents become gaps; cross-company isolation; refresh and reassessment; the same manifest reaches downstream agents, with tamper detection; the baseline grants nothing to execution; immutable artifact revisions; domain scoping; data-sharing withholding. |

**How the ten acceptance points map to the tests:**

| # | Acceptance point | Where it is shown |
|---|---|---|
| 1 | Correct company's profile | `test_acceptance_1_to_4…`, `test_acceptance_5…` |
| 2 | Permitted read becomes cited evidence | `test_acceptance_1_to_4…` (validated `observed` citation, observation in the manifest); browser demo |
| 3 | Imported artifact with exact provenance | `test_acceptance_1_to_4…` (id, revision, sha256, repository, commit, runtime statement) |
| 4 | Missing code and incompatible documents reported | `test_acceptance_1_to_4…`; `test_without_an_enabled_profile…`; browser demo |
| 5 | Another company's evidence unreachable | `test_acceptance_5…`; forged grant in `test_discovery_policy.py` |
| 6 | Out-of-scope calls blocked before dispatch | `test_out_of_scope_calls_are_blocked_before_network_dispatch` (12 cases, zero requests) |
| 7 | Changed evidence gives a new baseline and a reassessment flag | `test_acceptance_7…` |
| 8 | Downstream agents receive the manifest | `test_acceptance_8…` (the MCP `get_design_baseline` and the API hand-off, with matching checksum) |
| 9 | No discovery action can invoke a write | `test_no_discovery_action_can_invoke_a_write_capability` |
| 10 | Everything testable against a labelled simulation | Every test above; `SIMULATION` labels asserted in evidence, profile, manifest and UI |

**Browser demonstrations** (`e2e/discovery/`, run locally against a real backend in simulation mode on 23 September 2026, about 22:42 UTC):
- `discovery_admin.py`: **10/10**.
- `discovery_evidence.py`: **7/7**.

The design shown in the second demonstration was recorded by `scripts/seed_demo_design_evidence.py`. It is a scripted stand-in that calls the same governed tools, **not a model run**.

### 9.4 Needs customer-JDE validation (not demonstrated)

1. **Live AIS response shapes.** The shapes of `defaultconfig`, `dataservice` BROWSE and `poservice` are implemented from documentation and unverified. Parsing is labelled "unverified", and the environment check fails closed if AIS does not report the environment or Tools release. This needs a supervised session (the Experiment A1 equivalent).
2. **The token request and logout flow** against the customer's AIS release and authentication setup.
3. **The customer-side controls:** the narrowly privileged JDE role, the network route and DEV isolation. Jade records the customer's confirmations and requires them before contacting anything, but cannot verify them itself.
4. **Whether AIS on the customer's Tools release exposes any source, event rules or specifications** that this increment treats as unavailable.
5. ~~A real model run.~~ Done in §10 (simulated endpoint).
6. ~~The Functional Agent's use of `get_design_baseline`.~~ Done in §10, non-executing.

### 9.5 Limitations of this increment

1. **One process.** The one-at-a-time lock, the in-flight registry, the circuit breaker and the simulated estate are all per process. This matches the single-worker pilot.
2. **Refresh.** It re-reads the same targets under the current profile. It does not re-run the Architect; a person decides whether to.
3. **Artifacts.** Text formats only, 2 MB per file, first 60,000 characters analysed. No PAR or ZIP unpacking, no PDF or DOCX extraction.
4. **Observations.** They store what the model was allowed to see, after redaction, plus a hash of the full payload for change detection. Unredacted values are not kept.
5. **The Technical Agent** does not exist yet. The hand-off format and tool are ready for it.
6. **Health checks are manual.** There is no background polling, as specified.

## 10. Architect discovery: integration proof

This pass completes the discovery integration before any new feature and before any customer JDE connection. It also closes the gaps the proof exposed.

**Status:**
- not merged, not deployed;
- no customer JDE contacted;
- nothing written to any JDE.

Every JDE interaction ran against the backend's labelled simulated AIS endpoint.

### 10.1 Where to review it

| | Backend (`claude/stage1-setup-and-safeguards`) | Frontend (`claude/focused-gates-gtay96`) |
|---|---|---|
| Compare (this pass only) | [`e5dd5e7`…branch](https://github.com/Hendro33/jde_change_factory_backend/compare/e5dd5e7...claude/stage1-setup-and-safeguards) | [`6bdc052`…branch](https://github.com/Hendro33/JDE_change_factory_frontend/compare/6bdc052...claude/focused-gates-gtay96) |
| Commits | <ul><li>`195b565`: unrestricted read tools removed</li><li>`06a2dd7`: environment verification</li><li>`e7fbdb6`: evidence limitations</li><li>`f8c6534`: Architect tool context, proof harness</li><li>`018eaf5`: restricted agent runtime</li><li>`400a2a5`: change binding, catalogue in the prompt, proof phases</li><li>`ef96f8e`: recorded proof</li><li>`cc2c940`: OPERATIONS</li></ul> | <ul><li>`4299887`: UI</li><li>`e6e3561`: demonstration selectors</li><li>this documentation commit</li></ul> |
| Recorded proof | [`docs/proof/architect_discovery_run/summary.md`](https://github.com/Hendro33/jde_change_factory_backend/blob/claude/stage1-setup-and-safeguards/docs/proof/architect_discovery_run/summary.md) and `trace.json` | — |

### 10.2 The real Architect run

`scripts/prove_architect_discovery.py` sets up the run through the real Admin API:
- a simulation profile;
- a credential;
- Test Connection and the approved sample reads;
- Enable;
- one imported artifact (custom business function `B5542001`, with repository, commit and a CNC runtime statement);
- one approved story.

The story is a credit hold for webshop orders on `P4210|CIQ0001`.

It then runs `run_architecture_review` **unchanged**: the real `claude_agent_sdk.query`, the Claude CLI, the project `.mcp.json` server and the in-process discovery server. The stream is observed, not altered.

**Runtime recorded:**
- **Model reported by the runtime:** `claude-sonnet-5`.
- **Versions:** Claude CLI 2.1.281 (the runtime reported 2.1.277); claude-agent-sdk 0.2.157.
- **Mode:** `dontAsk`, 40 turns maximum.
- **Code:** backend `400a2a5`, frontend `4299887`.

**What the run showed:**

| Required | Shown by |
|---|---|
| Resolves the correct company profile | `list_discovery_capabilities`: environment JDV920, path code DV920, profile revision 2, SIMULATION |
| Reads an approved target | `discovery_read processing_option_values P4210\|CIQ0001` gave `OBS-045baa1f9b` (PCREDCHK blank); three `object_librarian` reads |
| Consults an imported artifact | `read_baseline_artifact ART-BSFN-B5542001@r1`; cited with sha256, repository, commit and runtime statement |
| Design, immutable manifest, valid citations | `propose_change` (`processing_option_update`, PCREDCHK set to 1). Route: Functional Agent, confidence 0.85. Baseline `BL-0399192a27`, manifest sha256 `148bb40a…`. Five `observed` citations and one `customer_attestation` citation validated against the run ledger; one stated as an assumption |
| A missing piece of evidence reported as a gap | The P554210 event rules (the call to B5542001) are unavailable through AIS and were not imported. They are reported as a gap, with a question for the CNC and the blocked step |
| Out-of-scope read rejected before any network request | An explicit probe through the same runtime: `F0301` (not approved), `F4211.UPRC` (field not approved) and `source_code P554210` (unavailable) were all blocked. **Simulated endpoint requests during the probe: none.** Three blocked activity rows |

In an earlier run on `018eaf5` (not kept), the Architect itself tried two out-of-scope reads: `version_list P554210`, and processing options on `P554210`. Both were blocked, with no request sent.

The run-to-run variation is real. On an earlier fixture that contradicted itself, one run resolved without a change and another stopped without a terminal call. The driver recorded the second as failed, and no design was stored. The fixture now matches the story: the credit check is off in the simulated DEV.

### 10.3 No entry point exposes the old unrestricted tools

- **Removed from the code.** `get_object`, `get_version` and `get_processing_options` are gone from the `.mcp.json` server and from `AISClient`.
- **Replacement.** `read_approved_target(story_id, change_id)` reads only the target of an approved change for the story's own company.
- **Pinned by tests.** `test_tool_surface.py` (8 tests) checks:
  - the server registry and `.mcp.json`;
  - every agent definition's `tools:`;
  - every driver's allowlist;
  - `settings.json` pre-approvals;
  - that the Architect runtime is denied every other project tool;
  - that every driver uses the restricted runtime;
  - that the Architect's prompt carries every catalogue id.
- **Built-in tools restricted.** The first real run showed that the runtime also offers its built-in tools, and that some of them (`ScheduleWakeup`) run even under `dontAsk`. Every agent run now goes through `services/agent_runtime.py`: `Task` is the only built-in tool, and secrets are blanked in the agent process. The recorded inventories:
  - **Architect:** `Task` plus its seven MCP tools;
  - **Functional Agent:** `Task`, `get_design_baseline`, `get_capability_status`, `read_approved_target`.

### 10.4 Environment verification against the AIS contract

Test Connection keeps four sources of information apart, and shows each one under Admin → Integrations → JDE:

1. **Expected:** the profile.
2. **Server defaults:** `defaultconfig`. Recorded, never used as evidence.
3. **Session context:** the v2 token response: `environment`, `role`, `userInfo.appsRelease`.
4. **Attested:** the Tools release and path code (the CNC runtime attestation), and OCM routing and isolation. AIS reports none of these.

Handling:
- A mismatch fails the check.
- A missing item leaves the check `unknown`. Enable is blocked, and the check names the missing evidence.
- The check never falls back to `defaultconfig`.

The contract basis and its sources are in the backend `docs/OPERATIONS.md`. docs.oracle.com could not be fetched from the build environment, so those pages were read through search results. The live response shapes remain to be confirmed with the customer (§9.4).

### 10.5 Evidence limits made explicit

**Truncation.** Text artifacts are analysed up to 60,000 characters. The artifact record, the manifest, the Architect's tool result and the design screen all state "N of M characters analysed", and citations of a truncated artifact carry the limitation.

**Hashes.** An observation's full-result SHA-256 is labelled as a change detector. Unredacted values are not retained. A test shows that the hash detects a change in a value the model never saw.

**Refresh Evidence**, shown in the real run after the simulated DEV value changed to 2:
- Baseline 2 was created, with four new observations. The changed one is flagged: `OBS-045baa1f9b` became `OBS-47f683a0c0`.
- Baseline 2 is `needs_reassessment`; baseline 1 is kept, `superseded`.
- The design history stayed at one revision.
- The change stayed `approved`, with an unchanged `approved_at`.
- The Functional Agent's `get_design_baseline` now returns `needs_reassessment`, which its definition treats as a stop.

### 10.6 Hand-off status

**Functional Agent: complete, non-executing.** The existing entry point is the `functional-agent` subagent definition. No new driver was built.

In the recorded run:
1. The change the Architect proposed was approved through the API.
2. The subagent ran through the same runtime, with every write, orchestration and evidence tool removed from its context.
3. It called `get_design_baseline`, `get_capability_status` and `read_approved_target`.
4. It reported design revision 1, baseline `BL-0399192a27` and manifest sha256 `148bb40a…`. All three equal the database.
5. It reported that the given `change_id` equals the change bound to that design revision, and that the change is approved.

It then said it would **stop**, correctly: `processing_option_update` is `needs_spike` (the AIS write adapter is not implemented). The change record was unchanged, and no execution was recorded.

The proof exposed a gap that is now closed: the hand-off did not say which change a design proposed. The package now binds the proposed `change_id`; a refresh keeps it; a later design revision that proposes nothing is unbound. The agent definition stops on any mismatch.

Limitation: the Functional Agent's `read_approved_target` goes to the execution server's own mock AIS, which returned `MOCK-INITIAL`. It does not go to the discovery simulator. The two simulations do not share state, and the agent noticed and reported the difference.

**Technical Agent: incomplete.** There is no Technical Agent definition or driver. The hand-off format and `get_design_baseline` are ready for it; nothing has been demonstrated.

### 10.7 Verification

| Check | Result |
|---|---|
| Backend tests | 366 passed |
| Gate proof | all checks pass |
| Frontend | type-check and build pass |
| Browser demonstrations (local, simulation, 24 September 2026) | `discovery_admin.py` 11/11; `discovery_evidence.py` 7/7 |
| Real-runtime proof | recorded (above); needs a Claude login, not in CI |
| CI on the final commit of each branch | see the delivery report |

### 10.8 Decisions for the reviewer

1. **Execution credentials in agent runs.** `agent_runtime` blanks `JDE_AIS_USERNAME` and `JDE_AIS_PASSWORD` in every agent process, and so also in the project MCP server it starts. Safe today (it fails closed, and no live execution is authorised). Live execution through an agent run would therefore be unable to authenticate. Decide deliberately before any authorised live execution:
   - either the credential reaches only the execution server;
   - or execution moves out of the agent process.
2. **One simulation for discovery and execution.** The Functional Agent's target read should see the same simulated DEV as discovery. This is a test-harness change, not yet made.

