# Jade — prioritised implementation backlog (Stage 0 output)

**Ordering rules:**

- Persistence defects come first (Assessment §17.5).
- Shared foundations are built once.
- Technical feasibility (Experiment E) starts **alongside** the functional proof, not after it.
- Every increment is a bounded change with an evidence gate.
- Nothing here authorises hosting purchases, deployment, merges, or JDE writes. Each JDE experiment needs its own approved DEV scope.

**Estimates:** person-days for one engineer familiar with this codebase. Low/base/high ranges come from the Stage 0 repository inspection. They exclude review, JDE specialist or CNC time, and customer wait time. **Stage 2 and later are deliberately not estimated with confidence until experiments report measured effort.**

**Module shorthand:**
- FE = frontend `src/`
- API = backend `api_service/jde_api_service/`
- MCP = backend `mcp_server/jde_mcp_server/`

> **Stage 1 status (23 September).** Stage 1 is now delivered as four increments (`docs/stage1/01_STAGE1_INCREMENTS.md`):
>
> - **S1-1** saved setup and identity: B-2 (most), B-3, and part of B-6;
> - **S1-2** execution safeguards: B-4 (gate part), B-5 (company level), and parts of B-6 and B-7;
> - **S1-3** shared-backend proposal: new; hosting was Stage 6 before;
> - **S1-4** JDE experiment plans: A and E. B-9 is its first executed step.
>
> S1-1 and S1-2 are implemented on review branches, not merged. The mapping of the 26 / 44 / 74 person-day estimate onto those increments and later expansion is in that document. The items below are kept as written for traceability.

---

## Stage 1 — common foundation (starting with persistence)

### B-1 Make the live site honest now · fixes P-1 (interim) · 0.5 / 1 / 2 d

- **Outcome:** anyone opening `jade.consultiq.nl` sees a persistent "Demonstration — mock data, nothing is saved or shared" banner. Save actions say "not saved (demo)".
- **Reuse:** the existing `IS_MOCK_MODE` flag.
- **Change:** FE `App.tsx` banner, plus save-button copy in mock mode.
- **Gate:** screenshot of the deployed site; a reload shows state reset, as disclosed.
- **Decision:** D-2. Connecting the live site to a real backend needs hosting, which stays parked. Until then, honesty is the fix.
- **Risk:** none.

### B-2 Revisioned, audited setup records · fixes P-3, P-4, P-6, P-9 · 3 / 5 / 8 d

- **Outcome:** every setup save records the **authenticated** user and a revision. A stale save returns 409 with a "reload" prompt. Failed saves show "not saved — retry".
- **Reuse:** SQLite, the `resolve_identity` context, and the existing Jira tables.
- **Change:**
  - API: `revision` column/field and `If-Match`-style check on engagement scope, Jira config/credentials and business domains;
  - API: derive `updated_by` from the session and drop it from request payloads;
  - API: atomic JSON writes (temp file plus `os.replace`) until those records move to SQLite;
  - API: business domain edit endpoint, with `domain_owner` derived from `domain_assignments`;
  - FE: remove the `ciq_approver` field; add `catch` and error states to `ErpLandscape.tsx` and `BusinessDomains.tsx`.
- **Gate:** storage-audit acceptance tests 1, 5, 6, 7 and 8 (see B-6).
- **Risk:** existing local JSON data needs a migration default (`revision = 1`).
- **Recovery:** the migration is additive.

### B-3 Dashboard thresholds become company settings · fixes P-5 · 0.5 / 1 / 2 d

- **Outcome:** thresholds are shared by all users of a company and survive a cleared browser.
- **Change:**
  - API: `GET/PUT /admin/dashboard-thresholds` (Admin write);
  - FE: read from the API; offer an Admin a one-time, previewable import of any local value. **The import never overwrites a newer server value.**
- **Gate:** acceptance tests 2 and 4.

### B-4 Per-company capability enablement and policy in the database, read by the gate · fixes P-2, P-7 · 3 / 5 / 8 d

- **Outcome:** the ERP Landscape scope a company Admin saves is exactly what the execution gate enforces.
- **Reuse:** `scope.py` checks, `EngagementScope`, and `capability_catalog.py`.
- **Change:**
  - a `CompanyCapabilityEnablement` record, extending `EngagementScope` with capability binding, environment binding, isolation-verification reference, spike experiments with **enforced `expires_at`**, protected scope, mechanisms and test scope;
  - MCP gate functions take a company ID and read the record through an interface (not the file);
  - `scope.json` becomes import-only;
  - every section is either enforced or removed from the schema. **No documented-but-ignored fields.**
- **Gate:**
  - `prove_the_gate.py`, extended per company;
  - a new test: company A's enablement cannot authorise company B;
  - a new test: an expired spike is refused.
- **Risk:** MCP's multi-tenancy touches the Functional Agent's manual invocation. Keep the CLI path working.
- **Decision:** none.

### B-5 Exact-change approver policy · fixes P-8 · 1 / 2 / 3 d

- **Outcome:** only the authorised approver for a company, domain and action can approve an exact change (default: Product Manager). Admin is never an implicit approver.
- **Change:** API policy record plus a check in `architecture_review.approve_exact_change`.
- **Gate:**
  - a test that Admin-only and Domain Owner-only users get 403;
  - a test that the approver's authority is stored on the approval.
- **Decision:** D-6 (policy defaults).

### B-6 Persistence acceptance suite · fixes P-12 · 2 / 3 / 5 d

- **Outcome:** the §17.4 acceptance criteria are automated.
- **Change:**
  - API pytest: restart/re-instantiation tests for every setup record; cross-user reads; cross-company 403; stale 409;
  - FE: a Playwright suite, run against a local backend in CI (two browser contexts, cleared storage, backend restart).
- **Gate:** CI green. This becomes the release gate for any later setup feature.
- **Hosting implication:** runs locally and in CI only; no hosting needed.

### B-7 Durable runs · fixes P-11 · 4 / 6 / 10 d

- **Outcome:** agent runs survive an API restart. Interrupted runs are shown as "interrupted — resume or retry", never stuck as "running".
- **Reuse:** the `EnhancementRun` and `ArchitectureReviewRun` records.
- **Change:**
  - API: a `Run`, `Step` and `Attempt` table; state persisted before dispatch;
  - a worker process (not in-request `BackgroundTasks`);
  - startup reconciliation;
  - idempotency via an attempt identity.
- **Gate:** kill the API mid-run; restart; the state is correct and the run resumes or retries **without a duplicated side effect** (Jira comment, backlog record).
- **Hosting implication:** introduces the worker process the shared pilot will need.

### B-8 Structured Implementation Specification and exact-change fields · 2 / 4 / 6 d

- **Outcome:** the Architect's output carries:
  - an evidence snapshot with citations;
  - dependency limits;
  - compatibility vs. executability;
  - a test manifest;
  - open questions.

  Exact-change records carry the story/spec revision, typed before/after state, dependency fingerprint and approver authority.
- **Change:** API models, `architect.md` output contract, `approval.py` record.
- **Gate:** schema tests; a spec missing required sections is rejected.

### B-9 Minimal verified environment profile plus one real read · 2 / 4 / 8 d · access-dependent

- **Outcome:** the Architect reads **one real DEV setting**, cites its source, and the profile records the Tools release, path code, and the CNC isolation confirmation with its date. This is the Stage 1 exit demonstration.
- **Change:** an API `Environment` record; the MCP `ais_client` read path, executed live.
- **Decision:** D-3 (DEV access, a read-only service account, CNC isolation confirmation).
- **Risk:** if access is unavailable, record it as **untested**. Fixtures do not qualify it.

### B-10 Usage ledger · 2 / 3 / 5 d

- **Outcome:** every model call records company, run, stage, model, rate-card revision, tokens and cost. Per-run budgets stop safely.
- **Change:** API driver wrappers (the SDK result usage fields) plus a rate-card table.
- **Gate:** a run report showing cost per stage. A budget breach stops the run at a safe boundary.

### B-11 Linking data model for Stage 4 slices · 3 / 5 / 8 d

- **Outcome:** schemas and APIs, with minimal UI, for:
  - the APQC reference edition and nodes, plus company applicability;
  - process maps (base, as-is, to-be) with revisions and provenance;
  - work item type (enhancement or fault) with fault fields;
  - impact manifest;
  - integrity finding.

  Story approval binds to the map revision.
- **Decision:** D-5 (APQC edition and licence) before any content import. The schema does not need the content.
- **Gate:** migration tests; the approval record stores the map revision.

### B-12 Real / mock / human labels in the UI · 1 / 2 / 4 d

- **Outcome:** every executed action, evidence entry and capability shows whether it was real JDE, mock, or done by a person.
- **Change:** an evidence-record source field; UI badges.

### B-13 Test coverage gaps · 2 / 3 / 5 d

- **Outcome:** an `mcp_server` pytest suite (negative cases for every gate) and a frontend unit-test runner (Vitest) wired into CI.

### Stage 1 summary

- **Total, preliminary:** about 26 / 44 / 74 person-days of engineering, excluding access lead time for B-9.
- **Stage 1 exit evidence (staged plan):**
  - the Architect cites one real DEV setting (B-9);
  - a run survives a restart (B-7);
  - an invalid or changed approval blocks execution (B-4, B-5, B-8);
  - all storage acceptance tests pass (B-6).

---

## Stage 2 — early breadth experiments

Run in parallel where access allows. **E starts with A.** Each needs its own approved DEV scope, before/after evidence, expected failure cases and human acceptance, and reports effort split into: vendor-native / platform / reusable capability / customer setup / bespoke.

| ID | Experiment | Depends on | Output |
|---|---|---|---|
| X-A | Processing option: real read → approved write (FSR or governed Orchestration) → new-session read-back → behaviour → second target | B-4, B-8, B-9, D-3 | First customer-DEV-validated capability, or a precise limitation |
| X-E | Representative hard technical change chosen from the real workload (ER/application, RDA or C function): correct source → modify → apply/compile with real tools → CNC step if needed → test | D-3, D-4, D-8; development workstation access | **Decides the Technical Agent's scope and runner requirement.** Untested if access is missing. |
| X-B | Saved selection/sequencing with spec provenance | X-A patterns | Persistence vs. override answered |
| X-C | Setup Change Set with injected failure and reconciliation | B-7 engine | Partial-failure semantics |
| X-D | Orchestration/UDO change through the supported lifecycle | D-3 | First technical family on web tooling |
| X-F | Repeat a success on a second profile | a second environment | Reuse vs. re-engineering |

---

## Stage 3 — first complete customer journey

Ticket → refinement → environment-aware Architect → approval → execution → verification → CNC hand-off, on one supported scenario. Repeat it on a second target. Keep manual steps visible.

**Gate:** a real request becomes an approved, persisted DEV change with test evidence, a CNC hand-off record and automatic reviewer attribution. A non-executable request stops honestly.

---

## Stage 4 — functional coverage and process context (vertical slices on the B-11 model)

- **S4-1** APQC full-hierarchy import (after D-5), applicability UI, upgrade reconciliation.
- **S4-2** Process-map viewer and editor beside the story, with affected-step highlighting. Draft maps are flagged for review.
- **S4-3** Fault intake → reproduction plan → approved DEV reproduction → outcome states → regression test → verified fix.
- **S4-4** Integrity gates: deterministic overlap, stale-baseline and dependency checks at the six checkpoints, plus semantic Architect review. Reservations at runtime.
- **S4-5** Change Set engine enabled (after X-C). Catalogue expansion across families 2–7, each with targeted discovery.
- **S4-6** Knowledge Library with permission-filtered retrieval and citations.

**Gate:** a coverage report against the representative request sample, not a count of tools.

---

## Stage 5 — technical delivery and runner

Productionise the families proven in X-D and X-E:

- runner protocol (identity, signed jobs, replay prevention, revocation);
- object reservation;
- source and diff views;
- exact patch approval;
- CNC pause and resume.

**Gate:** real technical changes accepted in DEV, with explicit unsupported cases and operating costs.

---

## Stage 6 — shared pilot hardening (hosting decision resumes here)

This can move earlier if shared access becomes necessary; the D-2 decision is then taken first.

Includes:

- relational DB (D-7);
- protected secret store (D-9; fixes P-10);
- email (D-10);
- auth operations;
- monitoring;
- a **restore drill**;
- tenant isolation tests on the hosted environment;
- a quoted bill of services.

The live site then switches to real mode, and B-1's banner is removed.

## Stage 7 — repeatability

A second customer or profile. Measure onboarding effort, adapter reuse, reliability, human minutes saved and cost per accepted change.

---

## Carry-forward note

Defects P-1 to P-12 are defined in `02_STORAGE_AUDIT.md` §3. Decisions D-1 to D-10 are defined in `04_JADE_DESIGN_V13_DRAFT.md` §17.
