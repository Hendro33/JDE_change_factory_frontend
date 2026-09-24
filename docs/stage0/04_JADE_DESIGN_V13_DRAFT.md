# Jade — AI-Driven JDE Change Factory
## Design update to V11 (DRAFT for review; working title "V13")

| | |
|---|---|
| Status | **Draft update, not yet accepted.** V11 remains the authoritative design until the owner accepts this update. |
| Authoritative baseline | **V11**, maintained through 20 September 2026: backend `docs/JDE_AI_Driven_Change_Factory_Design_Document_v11.docx`, last changed in `fb1e05a`. The owner confirmed on 23 September that V11 is the baseline; no other version is to be reconciled. |
| Also based on | The Full Product Architecture Assessment (21 September 2026, including the 23 September §17); the Staged Delivery Plan; the Design Update Brief; the Stage 0 repository audit (`01`–`03` in this folder) |
| Code baseline | Audited: frontend `d109e9c`, backend `20574b7` (23 September 2026). Stage 1 work since then is on review branches (frontend `claude/focused-gates-gtay96`, backend `claude/stage1-setup-and-safeguards`). See `docs/stage1/`. Statements marked *implemented (Stage 1 branch)* are not merged or deployed. |
| Format | Markdown so it can be reviewed and diffed. Render to Word once accepted, then check tables, contents and links. |

> **We are designing the full product, validating it incrementally, and testing its difficult assumptions early.** Neither a one-case MVP success nor an untested capability list proves broad automation coverage.

### How to read status in this document

Every capability statement carries one evidence label:

| Label | Meaning |
|---|---|
| **vendor-documented** | Oracle or another vendor documents the mechanism. |
| **implemented** | The code exists. |
| **locally tested** | Automated or manual tests pass in a development environment, with mocks where stated. |
| **customer-DEV validated** | Observed working in the customer's JDE DEV environment. **No capability currently has this label.** |
| **reported but unverified** | Someone reported it; no evidence was found. |
| **proposed** | Design intent only. |

Three dimensions are always kept separate:

- **product inclusion:** is it in the product scope?
- **implementation maturity:** the labels above;
- **execution permission:** capability status plus company policy.

---

## 0. Owner summary

### What remains sound

The product architecture from V11 stands:

- an Application Change Workbench with a continuous Delivery Queue;
- the Receive, Improve and Check pipeline and refinement;
- Architect, Functional Agent, Technical Agent and Human Implementation;
- company and domain isolation, DEV-only execution, exact-change approval, test binding, evidence, and CNC-controlled promotion.

The governance skeleton is **implemented and well tested**: 173 API tests, plus 10 mock-JDE safety-gate checks. No rewrite is needed.

### What has become more demanding

1. **Setup data is not yet authoritative anywhere a user can reach.** The public site runs entirely on browser-memory mock data, with no login and no persistence. The per-company scope screen saves durably but is not what the execution gate reads. Fixing this is Stage 1's first job.
2. **The processing-option "validated write" was never validated.** No Form Service Request was recorded. Jade has not yet performed any JDE operation, read or write.
3. **Durable execution is missing.** Agent runs are lost on restart, and nothing reconciles or retries safely.
4. **The full product needs subsystems that do not exist yet:**
   - a per-customer environment model;
   - a Knowledge Library;
   - a governed tool gateway with adapters;
   - a durable run and Change Set engine;
   - a customer-side runner;
   - usage metering;
   - the APQC reference model and process maps;
   - defect reproduction;
   - backlog integrity checks.
5. **Technical-object automation is the largest unknown.** It must be tested early (Experiment E), not after the functional MVP.

### What evidence could change the plan

| If this happens | Then |
|---|---|
| Experiment A fails | The processing-option route needs a customer Orchestration or a different mechanism; re-estimate the functional families. |
| Experiment E shows ER, application or C-function changes cannot be applied and built reliably through supported tools | Those families become Human Implementation and the commercial claims change. |
| Customers' real request samples are dominated by excluded families (tax, AAIs, security) | Execution coverage targets fall; the analysis value remains. |
| Every request needs a bespoke Orchestration | Treat it as manual engineering, not automation. |

---

## 1. Product scope

### 1.1 Mandate

Jade investigates the customer's actual JDE environment and produces customer- and release-appropriate implementation specifications. Under exact-change approval, it executes a substantial range of **functional and technical** changes in **DEV**, verifies them, and prepares a CNC-controlled release hand-off.

The MVP is the first integrated proof of this architecture (Stage 3). It is not the product boundary. Jade must not silently become an advisory-only assistant. Human Implementation is an explicit, governed route for excluded or unproven work, and it is never counted as automation.

### 1.2 Target coverage

| Area | Target content |
|---|---|
| Functional changes | processing options; saved data selection and sequencing; UDC values; selected constants and setup masters; document and line types; order activity/status rules; coordinated Change Sets |
| Technical changes | orchestrations and UDOs; selected report and application changes; event rules and NERs; C business functions; selected supporting objects. Exact coverage by family is subject to qualification (§11). |
| Architecture | standard-function assessment; configuration discovery; customisation and dependency inspection; alternatives; Implementation Specification; test design |
| Process context (§17.1) | full selected APQC hierarchy; base process maps; customer as-is and to-be maps linked to stories |
| Defects (§17.2) | fault-ticket intake, controlled DEV reproduction, regression tests |
| Integrity (§17.3) | impact manifests; deterministic and semantic conflict checks across the backlog |
| Verification | technical, behavioural and regression evidence; business acceptance; release readiness |
| Operations | onboarding; identities and roles; knowledge; credentials; run control; cost accounting; support; recovery |

### 1.3 Standing restrictions

The following remain restricted:

- tax, AAIs and core GL posting;
- security, users/roles, OCM and data sources;
- payment, bank and payroll;
- production access and non-DEV writes;
- destructive data or schema operations;
- unresolved shared-environment effects;
- direct database or specification writes (exception-only).

A restriction can change only through a reviewed change to a specific capability. A broad functional label never grants permission.

### 1.4 Roles

| Role | Authority | Change from V11 |
|---|---|---|
| **Domain Owner** | Approves the business requirement for their assigned domains | Unchanged. Assignment is explicit (`domain_assignments`), never inferred from an APQC code. |
| **Product Manager** | Delivery authorisation: Gate 1, admission to the Delivery Queue. **This role carries V11's "Application Manager" responsibilities.** | The code already requires `product_manager` (`domain_governance.py:367`). The UI label should read "Product Manager". |
| **Exact-change approver** | Approves one specific operation | ***Implemented (Stage 1 branch):*** each company's approval policy names the roles allowed to approve (Admin, Product Manager and/or Domain Owner) and how long an approval stays valid. There is no default. With no policy, nobody can approve and nothing executes. The approver's roles come from the session and are re-checked against the current policy before execution. **Still proposed:** policy per domain and action type. |
| **Admin** | Company users, invitations, settings, integrations, the company's approval policy | **Never** an implicit business or execution approver. An Admin approves exact changes only if the company's policy explicitly lists the Admin role. |
| **Dashboard Viewer** | Read only | Unchanged |
| **CNC (external)** | Package build and deploy, promotion, configuration-row migration between environments | Unchanged. Jade waits for CNC and never promotes. |

---

## 2. Current state — evidence-based

The detail is in `01_REVIEW_HANDOFF.md`, `02_STORAGE_AUDIT.md` and `03_CAPABILITY_RECONCILIATION.md`. In summary:

| Area | State |
|---|---|
| Public site (`jade.consultiq.nl`) | Frontend `d109e9c` in **mock mode**. No login and no persistence. |
| Hosted backend | None. The hosting migration **remains parked** (separate decision). |
| Real backend | FastAPI, SQLite (identity, auth, Jira) and JSON files (business records), plus MCP-server file stores (backlog, approvals, evidence). **Locally tested only.** |
| Agents | Receive, Improve, Check, Reviewer and Architect via the Claude Agent SDK as in-process background tasks. Live runs are *reported but unverified* in this environment. The Functional Agent is run manually via Claude Code. There is no Technical Agent. |
| JDE | Never called. The processing-option write payload is absent. |
| Governance gate | Story approval + exact-change hash + expiry + XJDE/ZJDE rule + global scope file + capability status + DEV binding. **Locally tested in mock mode.** |
| Known defects | P-1 to P-12 (storage audit §3), led by: live site not connected; per-company scope not enforced; typed audit attribution; no revisions; runs lost on restart; open exact-change approver. |

**Correction to V11:** V11 §7.2–7.3 call `set_processing_option` "the single validated functional write". That claim is withdrawn. Its status is **proposed / Needs spike**, pending Experiment A.

---

## 3. Operating model and lifecycle

Retained from V11 §3: intake routes, Receive → Improve → Check, the business approval gates, the Architect's "why not?" sequence (standard function → configuration → existing customisation → validated configuration capability → validated technical capability → Human Implementation), delivery, verification, CNC hand-off and closure back to the source.

### 3.1 Additions

1. **Two intake types, enhancement and fault** (§8). A fault keeps its own identity, source ticket and history. It can link to a story or change, to a duplicate, to a known error, or to a no-change resolution.
2. **Process context at refinement.** The affected APQC nodes and process-map steps are proposed during Improve. The Domain Owner confirms them, and approval binds to the story revision *and* the process-map revision (§7).
3. **Integrity checks at fixed points:**
   - intake/triage;
   - specification change;
   - queue admission;
   - exact approval;
   - immediately before execution;
   - after completion.

### 3.2 Human-readable progress states (UI)

- awaiting information
- awaiting approval
- queued
- running
- awaiting CNC
- verification required
- failed / partial
- complete
- stopped: not executable (Human Implementation)

### 3.3 Run and job states (engine, §9.4)

The engine distinguishes these states, which are mapped onto the UI states above:

- proposed
- awaiting approval
- queued
- executing
- awaiting human / CNC
- reconciling
- failed / partial
- verification pending
- technically verified
- business accepted

***Implemented (Stage 1 branch):*** at startup, any Receive/Improve/Check, Architect or agent run still marked in progress is set to failed with "interrupted by a backend restart; retry". A run can no longer look as if it is running forever, and the retry endpoints accept it. Runs are **not** resumed automatically; resuming is part of the durable engine (§6.5).

---

## 4. Agent contracts

Logical agents do **not** imply separate services or a model call per step. Deterministic work is ordinary code: hashing, scope checks, parsing, job control and cost calculation. Workflow control is never delegated to a model.

| Agent | Mandate | Inputs | Outputs | Knowledge and tools | Forbidden | Escalation, completion and budget | Maturity |
|---|---|---|---|---|---|---|---|
| **Receive** | Normalise source, company, attachments | Raw ticket | Canonical request with provenance | None needed | Inventing customer facts | Stop on missing mandatory fields. One call. | implemented; live unverified |
| **Improve** | Develop requirement, acceptance criteria, business rules, assumptions, questions, test intent; propose process context | Canonical request; permitted knowledge; read-only discovery | Versioned story | Knowledge Library (proposed); AIS reads | Silent business decisions | Bounded loop with Check. Maximum iterations recorded. | implemented; live unverified |
| **Check** | Detect omissions, contradictions, unsupported claims | Story | Structured findings | Checklist | Replacing human approval | Escalate after N failed loops | implemented; live unverified |
| **Reviewer / refinement** | Reconcile Domain Owner amendments | Story version + edits | New story version | Same as Improve | Overwriting history | Route back for approval | implemented; live unverified |
| **Architect** | Investigation and solution design. **Owns discovery; there are no separate discovery agents.** | Approved story + process context; environment profile; knowledge; bounded live DEV reads; technical exports with verified provenance | **Structured Implementation Specification** (§4.1) | Read-only discovery adapters; knowledge retrieval with citations | Any JDE write; self-approval; inferring absence from missing evidence | Report inaccessible evidence explicitly. Per-run token budget. | implemented (thin spec); live unverified |
| **Functional** | Prepare and execute approved setup and configuration operations | Approved exact operation or Change Set manifest | Precise diff; adapter invocation; per-step evidence; recovery state | Capability adapters (§6.3) | Anything not in its catalogue entry; alternative write paths; direct DB/spec writes | Stop on any unexpected warning, outcome or drift | gate implemented (mock); **no real adapter** |
| **Technical** | Inspect, prepare, implement and verify supported technical-object changes | Approved patch, object manifest, toolchain profile | Source/spec-aware diff; dependency manifest; object lifecycle evidence; build and test results | Development runner (§6.6); export/inspection tools | Package build, deploy or promotion; counting generated code as delivered | Pause for CNC. A new approval is required if the approved artefact changes. | **proposed** |
| **Verification** | Independent read-back, behaviour, regression, interrupted-run checks | Test manifest + approved scope for test writes | Acceptance evidence and limitations | Read adapters; approved test fixtures | Test writes outside test scope; posting, payments, external messages | Business acceptance stays human | **proposed** (instructions only today) |
| **Workflow control** | State transitions, approvals, retries, budgets, hand-offs | Everything | Durable state | — | — | Deterministic code, never a model | partial (gates); engine proposed |

### 4.1 Implementation Specification (structured)

Fields:

- environment and evidence snapshot, with citations;
- requirement and process context;
- alternatives and route rationale;
- prerequisites;
- affected objects and records;
- dependency limits and unknowns;
- exact proposed change or patch;
- required capabilities, with **compatibility vs. Jade executability shown separately**;
- test manifest;
- risk;
- delivery classification (object / configuration-data / mixed);
- open questions.

Today the specification holds only four free-text lists (`models/change.py:82-86`). Extending it is part of Stage 1 (backlog B-8).

---

## 5. Platform architecture

### 5.1 Logical flow

```
Workbench UI ─► Workflow/policy/approvals/run control ─► Specialist agents
                         │                                 │
                         ▼                                 ├─► Environment model + knowledge retrieval
                 Durable records, jobs,                     └─► Governed tool gateway ─► Capability/adapter registry
                 artefacts, usage ledger                                 │
                         ▲                                               ▼
                         │                           Approved execution jobs
                         │                             ├─► API execution worker ─► JDE DEV (AIS, approved forms/orchestrations)
                         └──── evidence ◄──────────────└─► Customer-side runner (technical tooling), when required
```

These are logical modules inside one modular backend, plus a separate worker process when needed. **They are not one microservice per agent.** MCP is a calling protocol. It is neither proof of capability nor an authorisation boundary.

### 5.2 Where each module runs

| Module | Runs in | Today |
|---|---|---|
| Control application (records, approvals, policy, UI API) | Jade backend | implemented (FastAPI) |
| Customer environment model | Jade backend (DB) | **missing** |
| Knowledge Library | Jade backend DB + object storage | **missing** |
| Capability / adapter registry | Jade backend (versioned definitions + per-company enablement) | partial (global JSON file) |
| Governed tool gateway and JDE connector | Jade worker, or the customer runner | partial (MCP tools call the gates directly) |
| Durable run and Change Set engine | Jade backend + worker | **missing** |
| Customer-side runner | Customer network, near JDE DEV (Windows where the toolchain requires it) | **missing** |
| Evidence lineage and cost ledger | Jade backend DB + object storage | partial (file hash chain); ledger missing |

### 5.3 Vendor-native vs. Jade-added

| Source | Mechanisms |
|---|---|
| **Vendor-native AIS** (*vendor-documented*) | processing-option read service; table/view queries; Form Service Requests; Orchestrator execution |
| **Jade-added** | adapters; policy; job control; evidence |
| **Customer-supplied, classified per capability** | custom Orchestrations, Form Requests or UDOs. Never assumed to be universal prerequisites. |

---

## 6. Platform modules

### 6.1 Customer environment model (*proposed*)

Per company and environment:

- application and exact Tools release;
- AIS and Orchestrator components;
- relevant ESUs;
- modules and entitlements;
- customisations;
- versions;
- path code;
- **data-source isolation**, with source and date of verification (CNC-confirmed OCM mapping, not a boolean);
- history of all the above.

Non-DEV facts come from CNC; agents never connect to non-DEV systems. Relationships between applications, versions, options, setup records, reports, business functions and dependencies are relational records. Each carries provenance and confidence, and unknowns stay explicit.

### 6.2 Knowledge Library (*proposed*)

Contents: Oracle references, private customer documents, technical exports and validated capability evidence. Each item carries source, revision and release applicability.

- **Retrieval is filtered by company permission first**, then by release, domain, module and identifier.
- Citations are mandatory.
- Conflicts between published material and live observation are surfaced.
- No training on customer material by default.

### 6.3 Capability and adapter registry (*partially implemented*)

A single registry covers discovery, preparation, execution and verification capabilities, each with distinct permissions. **Implemented:** `capability_catalog.json` with 11 field groups, 5 statuses, separate technical-validation and policy-restriction fields, revision binding, and no self-promotion.

**To add:**

- toolchain fingerprint;
- a compatibility profile per adapter (never a blanket "JDE 9.2");
- input/output schemas;
- revalidation triggers wired to environment-model changes;
- per-company **enablement** stored in the database (it lives in the global `scope.json` today).

Promotion stays a reviewed human change.

### 6.4 Governed tool gateway (*partial*)

The gateway registers bounded operations and never arbitrary SQL, REST or browser access. A common connector handles sessions, environment resolution, errors and redaction. Capability adapters bind permitted targets. Agents propose calls; **server policy decides.**

The gate checks already implemented (`approval.py`, `scope.py`, `capability_catalog.py`) move behind this gateway, so they apply whether the caller is MCP, an API worker or a runner. The illustrative operation names from Assessment §5.3 remain **proposed contracts**.

### 6.5 Durable run and Change Set engine (*proposed*)

- Persist state **before** dispatch and on every transition.
- Job records carry company, environment, capability/adapter revision, operation hash, expiry, approval identity, prerequisites and **attempt identity**.
- Supports approval waits, leases and fencing where JDE supports them, checkpoints, reconciliation, partial failure and **separately approved** compensation.
- **A timeout is not proof of failure.** Reconcile remote state before any retry. Never blindly repeat a JDE mutation. No exactly-once or atomic Change Set is claimed.
- The existing in-process `BackgroundTasks` agent runs migrate onto this engine (P-11).

### 6.6 Customer-side execution runner (*proposed*)

An infrastructure component, not an agent.

- Isolated customer/environment identity.
- Outbound job retrieval preferred; JDE is never exposed publicly.
- Signed or otherwise integrity-protected, version-bound jobs, with replay prevention and revocation checked at dispatch **and** immediately before the write.
- Credential references, health status and evidence upload.
- Separate read and write identities where practical.
- If authorisation state cannot be confirmed, **it does not write.**

A Windows runner for FDA, RDA, ER or C tooling needs a maintained development client, compatible compiler, controlled sessions, object reservation and isolated workspaces. No cross-customer leakage is permitted.

### 6.7 Evidence lineage and cost ledger (*partial / proposed*)

**Implemented:** a hash-chained evidence file per story.

**To add:**

- company key;
- artefact store for large files;
- lineage from evidence to operation, approval, run and step;
- a usage ledger per company, run and stage, keyed to a **versioned provider/model rate card**;
- budgets, retry limits and concurrency quotas;
- safe stopping, and cost per accepted outcome.

---

## 7. Conceptual data model

All records are company-scoped and revisioned where mutable. Authoritative setup lives in the database; large files live in object storage referenced from tables.

```
Company ─┬─ Environment ─┬─ EnvironmentFact (versioned, provenance)
         │               └─ IsolationVerification (CNC, date)
         ├─ Membership ── Role / DomainAssignment
         ├─ BusinessDomain ── APQCApplicability ─► APQCNode (reference edition, separate)
         ├─ ProcessMap (base|as-is|to-be, revision, provenance) ── Step/Flow/Decision/Actor/System/Control ─► JDE app/version links
         ├─ SetupRecord<kind> (integration, thresholds, policy, agent runtime, capability enablement, test definitions,
         │                     delivery rules, cost limits)  — each: revision, updated_by(identity), audit trail
         ├─ WorkItem (enhancement|fault) ─ StoryVersion ─ ProcessContext(map revision, steps)
         │     ├─ ImpactManifest (targets, keys/fields, before/after, deps, tests; completeness flag)
         │     ├─ IntegrityFinding (type, severity, affected item revisions, owner, decision)
         │     ├─ Reproduction (plan, fixtures, scope, outcome state, evidence) ─► RegressionTest
         │     └─ ImplementationSpecification (structured §4.1)
         ├─ Operation / ChangeSet manifest (immutable, hashed) ─ Approval (approver identity, authority, expiry)
         │     └─ Run ─ Step ─ Attempt ─ Evidence/Artefact
         ├─ KnowledgeSource (revision, applicability, permission) ─ Passage/Citation
         └─ UsageEntry (provider, model, rate-card revision, tokens, cost, run/stage)
CapabilityDefinition (global, revisioned) ─ AdapterRevision ─ CompatibilityProfile
CompanyCapabilityEnablement (company, capability revision, targets, limits, restrictions, test scope)
```

### 7.1 Scope contract: from global file to per-company records

***Implemented (Stage 1 branch):*** the global `scope.json` is no longer read. The execution gate:

- takes the story's company from its intake link, never from the caller;
- reads that company's Admin-saved engagement scope, which is revisioned and attributed;
- enforces these sections:
  - `environment`, including an explicit isolation confirmation;
  - `approved_versions`, with capability binding and allowed values;
  - `spike_experiments`, each bound to a capability revision and valid only before its `expires_at`;
  - `approval_policy`.

`technical_agent.authorized_object_types` has a check (`scope.check_technical_scope`), but nothing calls it yet, because Jade has no technical write tool.

A missing link, a missing scope or a missing or unrecognised policy blocks execution. `scope.example.json` documents the stored format.

The following remain documented but unenforced, and are labelled so in the UI and the example file:

- `protected_scope`, `mechanisms` and `test_scope` (listed under `_proposed_not_enforced` in `scope.example.json`);
- `never_touch_categories`;
- the free-text `approvers` lists.

**Target:** the same records in the database as `CompanyCapabilityEnablement` and policy records, holding:

- environment identity;
- permitted capabilities, targets and fields;
- value constraints;
- record and Change Set limits;
- protected scope;
- mechanisms allowlist;
- governance (approver authority, validity);
- test scope.

The Stage 1 file format is the contract to migrate from.

---

## 8. Process architecture, defects, integrity, setup persistence (Assessment §17)

### 8.1 APQC and process maps (*proposed*; today only a free-text code per domain)

- Import the **complete hierarchy of the selected APQC framework and edition** with authoritative identifiers, version, source and attribution. **Confirm licensing and permitted product use when obtaining the source;** never fabricate missing content, and do not merge industry frameworks into one model.
- Keep reference content separate from customer applicability and overlays. On upgrade, preserve historical mappings and reconcile changed identifiers explicitly.
- Base process maps are reusable templates mapped to APQC nodes, with provenance: customer-confirmed, reference template or generated draft. Customer as-is and to-be maps are separately versioned and hold structure (steps, flows, decisions, actors, systems, controls) linked to JDE applications and versions and to domains.
- **Draft maps require functional review** and are never presented as Oracle or APQC best practice.
- The UI shows the relevant map beside the story, highlights affected steps, and binds approval to the story and map revisions. The relationship is many-to-many. Domain ownership is never inferred from APQC.
- Full reference availability does not require generating all customer maps upfront.

### 8.2 Defect intake and reproduction (*proposed*)

- Faults are first-class: original ticket, type, attachments, source IDs and history are preserved, and nothing is silently mirrored both ways.
- Capture: expected vs. actual behaviour, reported environment, affected application and version, data conditions, steps, frequency and evidence. **Identify differences between the reported environment and DEV** before concluding anything.
- The reproduction plan has scoped fixtures. Read-only inspection is separate from test writes, **which need approval**. No production connection and no indiscriminate data copying.
- Outcome states:
  - Not attempted
  - Awaiting information
  - Reproduced
  - Not reproduced under stated conditions
  - Blocked
  - Inconclusive

  Non-reproduction is not proof of no defect, and root causes stay hypotheses until supported.
- A reproduced fault becomes a **regression test**. Demonstrate the fix plus neighbouring behaviour.
- Responsibilities: the Architect plans the diagnosis, Verification executes the approved reproduction, and Functional or Technical agents implement only the approved fix. No new agents are needed.

### 8.3 Backlog and delivery integrity (*proposed*)

- An **impact manifest** per sufficiently developed item: company and environment, process steps, applications and versions, objects, setup keys and fields, configuration dependencies, before/after state and tests. Incompleteness is flagged.
- The comparison set covers queued, approved, in-flight and relevant recently completed items.
- Classified finding types:
  - duplicate
  - overlapping target
  - contradictory outcome
  - prerequisite dependency
  - cyclic dependency
  - stale baseline
  - shared-object build collision
  - incompatible fixture

  Shared objects signal possible interference, not automatically a conflict.
- Deterministic checks run first, with Architect-assisted semantic review on top. **Never claim that an AI review guarantees there are no conflicts.**
- Findings record severity, the affected item revisions, the owner and the decision. The Product Manager resolves ordering; Domain Owners resolve business intent. Neither can waive runtime scope or exact-change requirements.
- Runtime reservations and leases apply where supported. When a change lands, relevant pending work is revalidated, and a changed baseline invalidates execution readiness.
- No cross-company visibility. Shared physical targets are checked without revealing another customer's records.

### 8.4 Business setup is authoritative backend data (*required; partially met*)

The database owns: companies, domains, APQC selections, maps, environment profiles, integration settings, memberships and roles, capability enablement, approval policies, test definitions, agent runtime configuration, delivery rules and cost limits.

- Repository defaults and templates are allowed. **Active settings resolve to an audited backend revision.**
- Browser storage is limited to preferences, temporary input and caches.
- Secrets go to protected server-side secret storage.
- Saves carry the **authenticated** identity and a revision. A stale revision gets 409. *Implemented (Stage 1 branch)* for engagement scope, Jira configuration, business-domain status and dashboard thresholds. A save of an existing record with no revision gets 428.
- Saves **fail visibly** when the backend is unavailable, with no browser fallback. *Implemented (Stage 1 branch)* on Customer Setup, ERP / JDE Landscape, Integrations, Business Domains and exact-change decisions.
- Existing browser setup is migrated only by a previewable, authenticated import that never overwrites a newer server value. *Implemented (Stage 1 branch)* for dashboard thresholds, the only browser-stored setting found by the audit.
- The acceptance tests are those in `02_STORAGE_AUDIT.md` §4.

---

## 9. Execution: exact changes, Change Sets, concurrency, recovery

### 9.1 Exact-change record

**Implemented:**

- story ID;
- operation hash;
- environment;
- `capability_id` and revision;
- catalogue and scope revisions;
- approver and expiry.

***Implemented (Stage 1 branch):***

- the company (from the story's intake link);
- the approver's authority (the roles that matched, the policy version and the scope revision);
- an expiry set by the company's policy.

A missing expiry now refuses, as does a past one; test runs are included. Records are written atomically.

**To add:**

- data-source identity;
- story and specification revision;
- typed before-state and exact after-state, or a patch hash;
- affected keys and objects;
- dependency fingerprint;
- toolchain revision;
- test manifest.

### 9.2 No unreviewed generation after approval

If a repair loop changes the approved artefact, a new approval is required. Templates must resolve to an inspectable target and diff before the write gate. Material drift invalidates readiness.

### 9.3 Single operation vs. Change Set

A single operation is one bounded semantic change, which may involve several form interactions. A Change Set enumerates dependent operations with commit boundaries, checkpoints and before-states. **No atomicity across JDE forms or objects is claimed.** Compensation is a separately approved operation. Change Sets are explicitly blocked today (`change_set.py`).

### 9.4 Concurrency

A read-before-write check reduces risk but **is not atomic protection.** Use leases, locks or fencing where JDE supports them. Otherwise block, or require a controlled human maintenance window.

Jade's own setup records are a separate matter. They use optimistic revisions (*implemented, Stage 1 branch*), with atomic file writes under a per-directory lock and SQLite `BEGIN IMMEDIATE`. That is safe for **one** backend process. More than one process needs the relational database (D-7).

### 9.5 Test writes

Order creation, reports with side effects and external calls are separately scoped operations. Cancellation stops subsequent writes but does not undo committed ones. Recovery evidence is part of acceptance.

---

### 9.6 Approval basis and execution eligibility (*implemented*)

An approval is history; eligibility is computed. Each exact-change approval, Functional or Technical, records the basis it was given against:
- the Architect design revision;
- its evidence baseline and manifest checksum;
- the artifact revisions the design used;
- the change's own dependencies;
- the target's before-state.

The approval record itself is never edited, and an unchanged approval time implies nothing about eligibility.

Before every dispatch the executor re-derives:
- the approval and its expiry;
- the approver's current authority;
- the company scope;
- that the operation or package is byte-for-byte the approved one;
- that the design revision is still current (a later design or baseline is never substituted);
- that no invalidation is recorded;
- that the target is still in its before-state.

Refresh Evidence, a new artifact revision or a material profile change records a permanent invalidation on the work whose own dependencies it touches. That work needs a fresh proposal and approval. Unaffected work stays eligible, while the design as a whole is flagged for a person.

*Evidence:* `mcp_server/jde_mcp_server/binding.py`, `api_service/.../services/work_invalidation.py`, `tests/test_approval_binding.py`.

### 9.7 One authoritative simulated estate (*implemented; simulation only*)

Discovery and simulated execution read and change one persisted estate, scoped by company, environment and target (`jde_mcp_server/sim_estate.py`). An approved simulated change is visible to the next discovery read. Drift, failures and timeouts exist only as explicit, recorded test conditions. Every estate change records who made it and why, and every result is labelled SIMULATION.

## 10. Functional capability families

All are *Needs spike*; the definitions are in `capability_catalog.json`.

| # | Family | Initial boundary | Key restriction |
|---|---|---|---|
| 1 | Processing-option update | Low-risk fields on customer-owned versions; allowed values | Tax, GL, AAI and security options; XJDE/ZJDE |
| 2 | Saved data selection | One non-posting report version; complete expression | Runtime override is not proof of persistence |
| 3 | Saved sequencing | One report version; ordered fields, grouping | Same as 2 |
| 4 | UDC values | Allowlisted lists; add/update values and descriptions | Hard-coded codes, special handling, deletion |
| 5 | Constants / setup masters | One chosen application and field allowlist | No blanket access |
| 6a / 6b | Document types / line types | Separate sub-capabilities; approved templates | Inherited tax, ledger and inventory effects; unsafe line types stay Restricted |
| 7 | Order activity/status rules | One isolated order-type/line-type combination | Combinations with dependent transactions are out of scope |

---

## 11. Technical Agent families

All are **proposed**. None is qualified.

| Family | Discovery | Authoring / apply | Build / activation | Verification | Host | CNC | Uncertainty |
|---|---|---|---|---|---|---|---|
| Orchestrations / service components | Studio/UDO inspection, export | Supported Studio/UDO lifecycle | Activate in DEV under controls | Invoke + diff | API worker (web tooling) | Promotion only | H: route-dependent |
| Queries, form extensions, other UDOs | Release-specific UDO tools | Same | Sharing/activation permissions | Behaviour | API worker | Promotion | H |
| Report layout (BI Publisher) | Template export | Template designer | Publish template | Render and compare | API worker or runner | Promotion | H |
| Report logic (RDA) | Spec/source inspection | RDA (Windows) | Build | Run in DEV | **Windows runner** | May need a package step before DEV test | VH |
| Applications with embedded ER | Web OMW export; ER extraction (Tools ≥ 9.2.26.2; changes project membership) | FDA (Windows) | Build/activation | Behaviour + regression | **Windows runner** | Package step likely | **VH: major unresolved** |
| Named Event Rules | Extraction where supported | ER design tooling | Compile | Test harness | **Windows runner** | Package step | **VH** |
| C business functions | Approved source checkout | Patch | Compatible compiler build | Unit and behaviour | **Windows runner** | Package step, human CNC | H–VH: operationally intensive |
| Business views / data structures | Designers; Web OMW-native types from Tools 9.2.6–9.2.8 | Supported designers or FSR | Object lifecycle | Dependency impact | API worker or runner | Promotion | H–VH |
| Tables / indexes / data dictionary | — | — | — | — | — | — | **Restricted initially** (schema/data risk) |

Report these milestones separately:

1. prepared
2. object modified
3. built
4. activated in DEV
5. accepted

**Generated code alone is not a delivered change.** Web OMW export/import is **not** assumed to be a general editing API.

### 11.1 Technical Agent status after the Technical increment

| Category | Status | What exists |
|---|---|---|
| Agent workflow | **Implemented** | `technical-agent.md` and its driver. The run uses the restricted runtime: Task only, secrets blanked, project tools removed. Its tools are typed and bound to one run, resolved from backend records. There is an isolated workspace; runs are durable (progress, failures, model usage, outcome); stale responses are discarded by compare-and-set. Design approval and exact implementation approval are separate. Unresolved business questions are recorded as outcomes (clarification required, inconclusive, blocked), not failures. |
| Artifact preparation | **Supported for text source** | Candidate text and an exact diff are prepared from a complete, authorised, non-stale text export. The immutable original and its checksum are kept. `c_source` can be prepared for a developer but never applied. ER print exports, specification exports, archives and documents cannot be edited as text; partial exports are refused. |
| Application, build and verification | **Simulation only** | The adapter works on a SYNTHETIC event-rule format (`jade_sim_er`) that the simulation genuinely parses, builds (syntax, types, interface, customer build rules) and executes. Apply, build, the human CNC activation (by a `cnc_operator`, re-checked) and verification are separate milestones. Attempts are recorded before dispatch; unknown outcomes are reconciled against the estate; evidence is hash-chained to the approved package. |
| Live JDE mechanisms | **Unverified -- unavailable** | No mechanism for editing or importing any real object type is qualified. The live adapter reports unavailable. No speculative JDE import or edit commands exist. Execution credentials never reach any agent; a governed executor would retrieve them server-side only after checking the exact approved operation (not built: no live execution in this increment). |

Real-model evidence: backend `docs/proof/technical_agent_run/`.

---

## 12. Feasibility and runtime-validation matrix

Each row lists: family · business value · discovery route · write route · release prerequisites · execution host · customer setup · test/recovery · evidence strength today · engineering uncertainty · next experiment.

| Family | Value | Discovery | Write route | Prereqs | Host | Customer setup | Test / recovery | Evidence today | Uncertainty | Experiment |
|---|---|---|---|---|---|---|---|---|---|---|
| Environment inventory | High (grounds everything) | CNC baseline + AIS metadata | n/a | AIS | API worker | CNC input | Compare with CNC | none | M | Stage 1 real read |
| Processing options | High, frequent | AIS PO service (*vendor-documented*) | FSR on PO Revisions, or governed Orchestration | Tools/AIS version; FSR recording | API worker | Service account, versions | New-session read-back; behaviour; revert as a new approval | **mock only** | M–H | **A** |
| Saved selection / sequencing | Medium–High | Version inspection | Version maintenance | Spec/deployment state | API worker or runner | Target versions | Spec provenance; behaviour | none | H | **B** |
| UDC | Medium | Setup inquiry | Form maintenance | — | API worker | Allowlist | Read-back | none | M | after A |
| Constants / setup masters | Medium | Family-specific | Family-specific forms | — | API worker | Allowlist | Dependency checks | none | H | **C** (as a Change Set) |
| Document / line types | Medium | Setup + dependency | Separate adapters | — | API worker | Templates | Full-record check | none | H | **C** |
| Activity rules | High | Targeted reads | Transition edits | — | API worker | Isolated combination | Permitted + prohibited transitions | none | H | later |
| Change Sets | Platform | — | Engine | Engine built | Backend | — | Injected failure + reconcile | blocked | H | **C** |
| Orchestration / UDO | High | Studio/UDO | Supported lifecycle | Orchestrator version | API worker | Studio access | Diff + activate + exercise + recover | none | H | **D** |
| ER / application / RDA / C function | **Very high** (economic core) | Source/spec, provenance | Dev tools | Dev client, compiler | Windows runner | Runner, workstation | Build + CNC + test | none | **VH** | **E** |
| Customer variant | Commercial | — | Reuse | Second profile | — | Second environment | Repeat A or D | none | M | **F** |

---

## 13. Early experiments

Not authorised by this document. Each needs its own approved DEV scope, observable before/after evidence, expected failure cases and human acceptance. Model-drafted code is not success evidence.

| ID | Proof | Answers |
|---|---|---|
| A | Real read → approved persistent write → new-session read-back → behaviour → repeat on a second target | Is the native read plus supported write reusable? |
| B | Persist the full selection/sequencing definition; subsequent behaviour; spec provenance | Version/spec interaction vs. overrides |
| C | Coupled customer-owned setup records; inject a failure; reconcile | Ordered commits, partial recovery |
| D | Inspect, edit via a supported path, approve diff, activate under DEV controls, exercise, recover | One web-oriented technical family |
| E | From the real workload: inspect correct source, modify, apply and compile via actual tools, CNC step if needed, test | **Is the economically important technical work automatable?** Starts **in parallel with A**. It cannot be replaced by a text-generation test. If access is unavailable, it is recorded as untested. |
| F | Repeat a successful family on a second release/customisation profile | Onboarding vs. per-request re-engineering |

For each experiment, record effort split into: vendor-native, Jade platform code, reusable capability code, customer setup, and bespoke request work.

Exact prerequisites and bounded test plans for A and E, the two experiments to run first and in parallel, are in `docs/stage1/03_JDE_DEV_EXPERIMENT_PLANS.md`.

---

## 14. Hosting topology

**The Azure / full-hosting migration stays parked.** No purchase or migration is implied.

A separate, minimal proposal covers one shared backend for the pilot, using the existing application unchanged: `docs/stage1/02_SHARED_BACKEND_DEPLOYMENT_PROPOSAL.md`. It gives recurring costs within the EUR 100/month infrastructure target (AI excluded), storage, backups, secrets, login/session and email limits. It is a proposal only. Nothing has been purchased or deployed.

| Scale | Topology |
|---|---|
| Immediate validation | Local backend and frontend plus approved DEV access. Persist job state and meter AI now. |
| Shared pilot | Modest hosted control application; durable relational DB (PostgreSQL remains a suitable target); private object storage; secret management; real auth/email; worker. Azure remains a candidate; GitHub and Jira stay. |
| Full product | API capacity separated from agent jobs, indexing and runners. |

**SQLite on a shared mounted file does not support distributed runners.** Windows development tooling cannot run in Linux Container Apps and needs a separate host or a customer-side runner. Human-wait states must not hold paid live sessions where safe resume is possible.

---

## 15. Economics

### 15.1 Budgets kept separate

- control-application hosting;
- background processing;
- customer connectivity and runners;
- file and search storage;
- model usage;
- JDE and tool licences;
- engineering and support.

Currencies stay separate until an agreed FX rate is applied. Development subscriptions (Claude, Codex) do not cover runtime API usage.

### 15.2 Model cost

Per accepted request:

```
AI cost = Σ(uncached input × rate + cached input × rate + cache writes × rate
           + billable output × rate + tool charges) / 1,000,000
```

Use the provider's actual usage fields without double-counting reasoning tokens. Add ingestion and failed or abandoned work to monthly totals.

### 15.3 Illustrative scenarios (hypothetical, not measured)

The rates are **as recorded by the Assessment on 21 September 2026**: USD 3/15 and USD 5/25 per million input/output tokens (its source S12). **They were not re-checked in this pass.** The arithmetic was re-verified.

| Scenario | Tokens across the whole request | At USD 3/15 | At USD 5/25 |
|---|---|---:|---:|
| Small | 100k in / 10k out | $0.45 | $0.75 |
| Medium | 500k in / 50k out | $2.25 | $3.75 |
| Heavy | 2M in / 200k out | $9.00 | $15.00 |
| Month: 60 small + 30 medium + 10 heavy | — | $184.50 | $307.50 |

Retries that double token volume double these figures. Real technical tasks can far exceed "Heavy".

### 15.4 Infrastructure

- **Pilot control application:** a sub-EUR 100/month target. The Stage 1 proposal (`docs/stage1/02_…`) prices a minimal shared backend from published list prices, which have not been quoted to us. The EUR 40–90 figure is superseded for that scope.
- **Runner:** at an *assumed* EUR 0.20/hour, 80 hours cost EUR 16 and 730 hours cost EUR 146. Disks, network, licences and maintenance come on top. This is not a quote.

### 15.5 Controls

- Models reason; deterministic adapters execute.
- Retrieve passages, not whole manuals.
- Cache per company and revision.
- Stage and run budgets, retry limits and concurrency quotas, with safe stops.
- Choose models by **cost per accepted outcome**, backed by evaluations.
- Metering starts from the first real run (backlog B-10).

### 15.6 Effort

Stage 1 packages are estimated in the backlog from repository inspection (low/base/high person-days).

**Stage 2 onward (the technical families especially) are not estimated with confidence until experiments A–E report measured effort.** No whole-product calendar date is given.

---

## 16. Security invariants (retained and extended)

- DEV-only. No production connection.
- Documents, tickets, tool output and source comments **never grant authority.**
- Approvals and business state live outside model memory.
- Enforcement sits at the execution boundary (gateway and runner), not in prompts.
- Company isolation extends to documents, caches, source, queues, files, credentials and model context.
- Active-run revocation is checked immediately before every write.
- Audit identity always comes from the authenticated session.

---

## 17. Decision register and unknowns

| # | Decision / unknown | Owner | Needed by |
|---|---|---|---|
| D-1 | ~~Reconcile with V12~~. **Resolved 23 September:** V11 (through 20 September) is the authoritative baseline. Remaining: accept or amend this update, then render it next to V11 in backend `docs/`. | Owner | Before this update is final |
| D-2 | Connect the live UI to a backend (requires hosting), or restrict it to a labelled demo until Stage 6 | Owner | Stage 1 |
| D-3 | Approved JDE DEV access, service accounts, CNC isolation confirmation | Owner / customer / CNC | Experiments A–E |
| D-4 | Representative request sample (30–50, including technical and fault work) | Owner / customer | Stage 0–2 |
| D-5 | APQC framework/edition and licence for product use | Owner | Stage 1 data model; Stage 4 import |
| D-6 | Exact-change approver policy per company. **Implemented without a default (Stage 1 branch):** each company's Admin must choose explicitly. Open: whether new companies should get a proposed default (e.g. Product Manager, 24 h) that still needs explicit confirmation. | Owner | Stage 1 review |
| D-7 | Relational DB choice for the shared pilot (PostgreSQL candidate) | Owner, at the hosting decision | Stage 6 |
| D-8 | Windows runner feasibility (customer workstation vs. VM) | After Experiment E | Stage 5 |
| D-9 | Secret store for Jira/AIS credentials | Owner | Before shared hosting |
| D-10 | Email provider | Owner | Stage 6 |
| U-1 | Customer Tools release, ESUs, Orchestrator availability | — | Experiment A |
| U-2 | Whether a supported ER/application authoring route exists for the target release | — | Experiment E |
| U-3 | Model cost per accepted change (not yet measured) | — | Stage 3 |

---

## Appendix A — Change log (V11 → V13 draft)

| V11 section | V13 draft | Change |
|---|---|---|
| 1 Executive Summary | 0, 1 | Full-product mandate; MVP as a validation milestone; owner summary |
| 2 Objectives | 1.1–1.3 | Consolidated scope and restrictions |
| 3 Operating model | 3 | Fault intake type; process context; integrity checkpoints; progress and job states |
| 4.1–4.8 Agents | 4 | Contract table for every agent. Verification added as a logical role. Technical Agent is implementation-responsible and feasibility-gated. |
| 4.3.1 JDE knowledge layer | 6.2 | Knowledge Library with permission-filtered retrieval |
| 5 Receive/Improve/Check | 4 | Retained; bounded loops and evaluation corpus |
| 6 Artefacts | 4.1, 7, 9.1 | Structured Implementation Specification; conceptual data model; exact-change fields |
| 7.2–7.3 Capability status / MVP tools | 2, 6.3, 10 | **"Validated" processing-option write withdrawn → Needs spike**; registry and statuses |
| 7.3.1 Change Set | 9.3 | Engine requirements; no atomicity claim; blocked today |
| 7.5–7.7 Technical ladder, Web OMW | 11 | Family table; Web OMW export ≠ editing API; ER extraction limits |
| 8 Security / HITL | 16 | Enforcement at the execution boundary; the CLI hook is noted as pilot-only |
| 9 Target flow | 5 | Logical architecture with runner and worker |
| 10 MVP approach | 13, backlog | Replaced by staged plan and early experiments |
| 11 Risks | 0, 17 | Evidence-change triggers; decision register |
| 12 Reference implementation | 2, 5.2 | Current state from the repository audit |
| 13 Success criteria | backlog gates | Stage exit evidence |
| 15–16 Target architecture | 5–7, 9 | Consolidated |
| 17 MVP validation checks | 13, storage audit §4 | Extended with persistence acceptance |
| 18 Maturity model | status labels | Six evidence labels |
| 19 Administration area | 8.4, storage audit | Setup authoritative on the backend; defects P-1 to P-12 |
| — (new) | 8.1–8.3 | APQC and process maps; defect reproduction; backlog integrity |
| — (new) | 6.5–6.7, 15 | Durable engine, runner, cost ledger, economics |
| Appendices B–E | retained by reference | To be carried over verbatim into the rendered update once accepted |
| 19 Administration area (Stage 1) | 1.4, 3.3, 7.1, 8.4, 9.1, 9.4 | Approval policy; per-company scope enforced; revisions and visible save errors; restart recovery. See `docs/stage1/` |
| 4.5 Technical Agent; 6.5 Approval Record; 8.4 Rollback | 9.6, 9.7, 11.1 | Approval basis and computed eligibility; one simulated estate; Technical Agent workflow implemented, with text-source preparation and simulated application only; live mechanisms unverified. See `docs/stage1/04_REVIEW_PACK.md` §11 |
| 3 Story refinement; 4.1 Architect; 13 Knowledge layer | new | Company process frameworks (xlsx import, immutable versions, original-file provenance); reviewer-confirmed story process mappings pinned to framework/version/node; versioned as-is/to-be process maps (assumption vs confirmed practice); Architect process context via company-scoped tool; material process changes flag the design; versioned as-built records finalised only when delivery checkpoints are complete. Synthetic framework fixture only; no APQC content. See backend `docs/OPERATIONS.md` |

## Appendix B — Sources

- Vendor sources S1–S18, as listed in `JADE_Full_Product_Architecture_Assessment.md`. Interpret each only for its documented release and prerequisites.
- APQC framework vs. process maps: https://www.apqc.org/How-Can-Organizations-Classify-and-Organize-Their-Processes-Using-a-Common-Framework
- Repository evidence: `01_REVIEW_HANDOFF.md`, `02_STORAGE_AUDIT.md`, `03_CAPABILITY_RECONCILIATION.md`.
