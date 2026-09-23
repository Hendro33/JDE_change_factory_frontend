# Jade Stage 0 — storage audit

**Scope:** every business and setup screen, traced from the frontend Save/Load handlers through the API and backend service to durable storage, at frontend `d109e9c` and backend `20574b7`.
**Requirement being audited:** Assessment section 17.4. All mutable company and business setup must resolve to a durable, audited, company-scoped backend record. Browser storage is acceptable only for preferences, temporary input and caches.
**Method:** code inspection plus the Actions build log for the live deployment. Nothing here was inferred from earlier conversation reports.

## 0. Headline findings

1. **The live site is not connected to any backend.** `jade.consultiq.nl` is built with `VITE_USE_MOCK_API=true` (Actions run 35890323129, build-step env). In that mode:
   - login is skipped entirely (persona picker instead);
   - all business and setup data lives in a JavaScript object in page memory (`mockApi.ts:118-147`, zero storage calls);
   - **every save on the live site is lost on page reload**, and nothing is shared between browsers or users.

   The real backend (SQLite plus JSON files) has been exercised **only locally**. This is the answer to the staged plan's question "verify whether the tested real backend is actually connected to the UI in use": it is not.
2. **In real (HTTP) mode there is no silent fallback to mock or browser storage.** Unimplemented methods throw an explicit error (`httpApi.ts:142-147`). The four throwing methods are superseded pre-governance flows.
3. **Only one piece of company setup is browser-only in real mode:** dashboard alert thresholds, stored in `localStorage` (`dashboardThresholds.ts`). The screen itself says so.
4. **Several requirements have no storage at all because the feature does not exist:** the APQC reference model and selections, process maps, approval policies, per-company JDE environment profiles, per-company capability enablement and editable agent runtime configuration.
5. **One setup record saves durably but has no effect.** The per-company Engagement Scope (ERP Landscape screen) is never read by the JDE execution gate. The gate reads one global, hand-edited `scope.json` file instead. The screen discloses this (`routers/admin.py:128-132`).
6. **Audit attribution on settings saves is a client-typed name, not the logged-in user.** The name is also cached in `localStorage` (`ciq_approver`).
7. **No record revisions or conflict detection exist anywhere.** Concurrent edits silently overwrite each other. JSON-file writes are also non-atomic (`json_file_store.py:35-37`).

## 1. Storage mechanisms in the backend

| Store | Holds | Durability | Tenant scoping | Concurrency |
|---|---|---|---|---|
| SQLite `jde.sqlite3` (`JDE_API_DB_PATH`; migrations in `persistence/migrations.py`) | companies, users, company memberships, membership roles, domain assignments, sessions, invitations, password-reset tokens, access audit log, Jira integration settings, Jira credentials | Durable while the file is on persistent disk. Schema migrations are idempotent. | `company_id` columns; enforced in services and dependencies | Upserts, last-writer-wins, no revision column |
| `JsonFileStore` under `JDE_API_DATA_DIR` (one JSON file per record) | change requests, customer links, business domains, domain reviews, delivery queue, architecture reviews, decision feedback, engagement scope, enhancement runs, agent runs | Durable on persistent disk. **Writes are non-atomic** (plain `open(..., "w")`, no temp-file rename), so a crash mid-write can corrupt a record. | A `customer_id` field is filtered in each service. Agent runs are cross-company by design. | No locking and no revisions; last-writer-wins; single process only |
| `mcp_server` file stores (`JDE_BACKLOG_DIR`, `JDE_CHANGE_DIR`, `JDE_EVIDENCE_DIR`) | backlog stories, exact-change approval records, hash-chained evidence | Durable on persistent disk. Evidence is tamper-evident but not atomic. | **None.** Company membership is inferred through the API's customer-link sidecar. | None |
| Repository files (version-controlled) | `capability_catalog.json`, `.claude/agents/*.md`, driver constants, seed files | Durable via git; changed only by commit and deploy | Global | Git review |
| Gitignored operator file `scope.json` (`JDE_SCOPE_FILE`) | Engagement scope actually enforced by the JDE gate | Whatever the operator keeps. **Absent in this checkout.** | **Global, one per deployment, not per company** | Manual edits |
| Process memory | FastAPI `BackgroundTasks` agent runs (10 call sites) | **Lost on restart.** No startup recovery, so an interrupted run stays in "analyzing" or "receiving". | n/a | n/a |

## 2. Screen-by-screen trace (real mode unless stated)

Status key: **OK** = durable, company-scoped and access-checked · **DEFECT** = authoritative data not durably or correctly owned · **MISSING** = feature does not exist · **UNWIRED** = stored but not used where it matters · **LEGIT-UI** = acceptable browser state.

### 2.1 Companies (Admin > Customer Setup)

- **Load:** `api.getCustomerProfile` → `GET /admin/customer-profile` (`require_customer_access`) → SQLite `companies` plus membership data.
- **Save:** none for company attributes. Name, Tools release and environment come from `persistence/seed_customers.json`, inserted at startup (`ensure_seed_companies`). No API creates or edits a company.

**Status:** OK for read. **MISSING:** company creation and editing, and the audit trail for them.

### 2.2 Dashboard alert thresholds (Customer Setup)

- **Load and save:** `dashboardThresholds.ts` → `localStorage["jade_dashboard_thresholds"]`. There is no API.

**Status: DEFECT.** These are company-level KPI thresholds that should be shared by every user of the company. Today they are per browser and vanish when storage is cleared. The screen discloses this (`CustomerSetup.tsx:78`).

### 2.3 Business domains (Admin / Knowledge > Business Domains)

- **Load:** `GET /business-domains` → `business_domain_service.list_for_customer` → `JsonFileStore("business_domains")`, filtered by `customer_id`.
- **Save:** `POST /admin/business-domains` and `PUT /admin/business-domains/{id}/status` (`require_role(admin)`) → the same store.
- **Seeding:** BicycleWorks domains are seeded idempotently at startup.

**Status:** OK for durability and scoping (single process). **DEFECTS:**

- (a) `domain_owner` is a free-text name, while *authorisation* uses SQLite `domain_assignments`. Two unsynchronised sources of truth for "who owns this domain".
- (b) The save UI has no error message. `BusinessDomains.tsx:30-45` has a `finally` block but no `catch`, and the status change has no handling at all.
- (c) No edit endpoint exists for name, code or owner. Only create and status change are possible.

### 2.4 APQC selections

The only APQC data is a free-text `apqcCode` and `level` on each business domain. There is no reference hierarchy, edition, source/attribution, import, applicability selection, overlay or upgrade reconciliation.

**Status: MISSING.** Required by Assessment section 17.1.

### 2.5 Process maps (base templates and customer as-is/to-be maps)

No model, endpoint, store or screen exists. No story-to-map or map-to-JDE links exist either.

**Status: MISSING.** Required by Assessment section 17.1.

### 2.6 Integrations — Jira (Admin > Integrations)

- **Load:**
  - `GET /admin/jira-integration` (Admin role) → SQLite `jira_integrations`.
  - `GET /admin/jira-integration/status` (any member) → derived booleans.
- **Save:**
  - `PUT /admin/jira-integration` (Admin) → SQLite upsert.
  - `PUT` or `DELETE /admin/jira-credentials` (Admin) → SQLite `jira_credentials`.
  - `POST .../test-connection` makes a live check and saves nothing.
- **Tests:** restart persistence is covered (`test_jira_integration.py:342` `test_jira_settings_survive_a_simulated_restart`). The save UI surfaces errors.

**Status:** OK for durability, scoping and role checks. **DEFECTS:**

- (a) `updated_by` is client-supplied (`payload.updated_by`, pre-filled from `localStorage["ciq_approver"]`, `Integrations.tsx:57, 92`), so the audit attribution can be spoofed.
- (b) The API token is stored in plaintext in SQLite. Pilot-scoped by design (V11 §19.7), but it is not the "protected server-side secret storage" §17.4 requires.
- (c) No revision or conflict detection.

### 2.7 JDE environment profiles and connection (Admin > ERP / JDE Landscape)

- **Load:** `GET /admin/erp-landscape` combines:
  - the company's seeded `tools_release` and `environment`;
  - **global** AIS settings from process environment variables (`JDE_AIS_*`, `JDE_MCP_MOCK_MODE`), shown as status only;
  - the company's Engagement Scope.
- **Save:** none for the connection or environment.

**Status: MISSING.** There is no per-company environment profile: application/Tools/component versions, ESUs, modules, path code, data-source isolation, verification source and date, or history. The one AIS connection is shared by the whole deployment.

### 2.8 Engagement scope, i.e. capability enablement per company (ERP Landscape)

- **Load:** `GET /admin/engagement-scope` → `JsonFileStore("engagement_scope")`, one document per company.
- **Save:** `PUT /admin/engagement-scope` (`require_role(admin)`) → the same store.

**Status: UNWIRED plus DEFECTS:**

- (a) The JDE execution gate (`mcp_server/jde_mcp_server/scope.py`) reads only the global `scope.json`. Saving here authorises nothing. This is disclosed in the UI.
- (b) The model lacks the fields the enforced file now needs: `capability_id` binding, environment binding, isolation confirmation and spike experiments. The UI therefore cannot express what enforcement requires.
- (c) `updated_by` is client-supplied (`ErpLandscape.tsx:42, 63`).
- (d) The save has no error handling. `ErpLandscape.tsx:61-80` has no `try/catch/finally`, so a failed save leaves the button on "Saving…" with no message.
- (e) No revisions.

### 2.9 Global `scope.json`, i.e. the enforced capability settings

This is an operator-edited file outside the database, with no UI, no audit trail and no company key.

Sections **enforced** by code:

- `environment`
- `functional_agent.approved_versions` (including `capability_id` and `allowed_values`)
- `functional_agent.spike_experiments`
- `technical_agent.authorized_object_types`
- `scope_revision` (stamped onto records)

Sections documented in `scope.example.json` but **read by no code**:

- `protected_scope`
- `mechanisms`
- `governance`
- `test_scope`
- `never_touch_categories`
- `approvers`

Also, `spike_experiments[].expires_at` is **not checked** (`scope.py:192`, `find_spike_experiment`), so a spike approval never expires. These gaps were introduced by the previous increment's documentation and are recorded here, not hidden.

**Status: DEFECT.** Authoritative per-company business setup lives in a global file, partly unenforced.

### 2.10 Capability catalogue (Admin > Agents > Functional Agent)

- **Load:** `GET /admin/capabilities` → the repository file `capability_catalog.json`.
- **Save:** none, by design. Promotion to Validated is a human edit to the file, reviewed through git.

**Status: LEGIT as versioned product definitions.** The catalogue is not customer setup. Per-company *enablement* belongs to 2.8 and 2.9 and is defective there.

### 2.11 Users, roles and domain assignments (Admin > Users)

- **Load and save:** `/admin/users/*` (`require_role(admin)`) → SQLite users, memberships, roles, domain assignments and invitations.
- **Protections:** a last-active-Admin guard exists; the UI surfaces errors.
- **Tests:** `test_auth_and_membership.py`. Restart persistence was verified manually on 21 September, locally only.

**Status: OK.** Minor gap: no automated restart test.

### 2.12 Approval policies

Approval authority is hard-coded as role checks in routers. Exact-change expiry comes from one global environment variable (`JDE_CHANGE_APPROVAL_EXPIRY_SECONDS`). There is no per-company, per-domain or per-action policy record.

A related governance gap: exact-change approval (`POST /changes/{id}/approve-change`, `architecture_review.py:147-148`) requires only `require_write_access`. **Any non-viewer role, including Admin, can approve an exact change.** The Assessment (section 6) says Admin must not be an implicit execution approver.

**Status: MISSING (policy records) plus DEFECT (approver entitlement).**

### 2.13 Agent configuration (Admin > Agents)

- **Load:** `GET /admin/agents` → parses `.claude/agents/*.md` frontmatter plus hard-coded driver constants.
- **Save:** none, by design (`agent_registry_service.py` docstring).

**Status:** LEGIT as versioned defaults. **MISSING:** per-company runtime configuration (model choice, budgets, retry limits, enabled agents), with audited revisions, as §17.4 lists.

### 2.14 Operational records: changes, governance, queue, architecture, evidence

- change requests, domain reviews, delivery queue, architecture reviews and decision feedback → `JsonFileStore`;
- backlog, exact changes and evidence → `mcp_server` file stores.

All are durable on disk and company-scoped via customer links. **Risks:** non-atomic writes, no revisions, single-process assumption. Agent runs in progress are lost on restart and not recovered (section 1). Not setup data, but it shares the same storage weaknesses.

### 2.15 Legitimate browser state (not defects)

| Key | Purpose | Assessment |
|---|---|---|
| `ciq_http_active_customer` (`httpApi.ts:65-73`) | Which of the user's entitled companies is active | **LEGIT-UI.** The server re-checks entitlement on every request. |
| `jde_session` and `jde_csrf` cookies | Session and CSRF | LEGIT. Authoritative session state is server-side (SQLite `sessions`). |
| `ciq_persona` and `ciq_active_customer` (`session.ts:48-49`) | Mock-mode persona picker | Mock only. Harmless locally, **but it is the live site's only "login".** |
| `ciq_approver` | Pre-fills a name field | UI convenience in principle. **Defect in effect**, because the value becomes the stored audit attribution (2.6, 2.8). |
| Unsaved form input (React state) | Temporary input | LEGIT-UI |

## 3. Defect list, in priority order

| ID | Defect | Where | Severity |
|---|---|---|---|
| P-1 | Live site runs mock-only: no login, no persistence, no sharing | `deploy-pages.yml`; repo variable unset | Critical (functional correctness) |
| P-2 | Enforced engagement scope is a global file, not per-company DB state; the per-company Engagement Scope UI is unwired | `scope.py`, `engagement_scope_service.py`, `routers/admin.py:128-132` | Critical |
| P-3 | Settings audit attribution is client-typed; `ciq_approver` localStorage | `engagement_scope_service.py:38`, `jira_*_service.py`, `ErpLandscape.tsx`, `Integrations.tsx` | High |
| P-4 | No revision or conflict detection on any setup record; JSON writes non-atomic | `json_file_store.py:35-37`; all upserts | High |
| P-5 | Dashboard thresholds browser-only | `dashboardThresholds.ts` | Medium |
| P-6 | Save failures invisible (ERP Landscape stuck "Saving…", Business Domains silent) | `ErpLandscape.tsx:61`, `BusinessDomains.tsx:30-45` | Medium |
| P-7 | `scope.json` sections documented but unenforced; spike `expires_at` ignored | `scope.py`, `scope.example.json` | High (governance) |
| P-8 | Exact-change approval open to any writer, including Admin | `architecture_review.py:147` | High (governance) |
| P-9 | Domain owner held twice (free text vs `domain_assignments`) | `models/business_domain.py:42` | Medium |
| P-10 | Jira token stored in plaintext | `jira_credentials` table | Medium (pilot-accepted; must change before shared hosting) |
| P-11 | In-flight agent runs lost on restart, left in running state | `BackgroundTasks` usage; no recovery | High (Stage 1 durability) |
| P-12 | Only Jira has an automated restart-persistence test | `api_service/tests` | Medium |
| M-1 to M-6 | Missing: company CRUD; APQC reference model and selections; process maps; per-company environment profiles; approval-policy records; per-company agent runtime config | — | Required scope (Stage 1 data model; Stage 4 slices) |

## 4. Acceptance tests needed to close this audit

These apply the §17.4 acceptance criteria to the current build. **None of them is run today**, except the restart test for Jira.

1. Save as Admin A, reload, log out and in: the record persists.
2. Read the same record as an authorised user B in a second browser.
3. Restart the backend: the record persists. Redeploy from a clean container with the same volume: the record persists.
4. Clear browser storage: no company setup is lost; the user may be logged out.
5. A user from company X gets 403 on company Y's record. A non-Admin gets 403 on writes.
6. Two stale concurrent edits: the second receives 409 (needs revisions, P-4).
7. With the backend down, a save shows "not saved — retry" and never falls back to the browser (P-6).
8. The stored audit record names the authenticated user, not a typed name (P-3).

A browser-to-backend import is **not needed for existing live-site data**, because mock-mode data was never persisted anywhere. The one real candidate for import is `jade_dashboard_thresholds`: a per-browser value, to be offered once as a previewable import to an Admin and never applied silently over an existing server value.
