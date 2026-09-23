# Jade Stage 0 — review hand-off

**Prepared:** 23 September 2026, by Claude (Claude Code session `session_01Cf9gYf7g8aB9jD2ihtCDww`).
**Purpose:** give an independent reviewer (Codex) the exact code, state and instructions needed to review the same Jade build this baseline describes.
**Evidence labels used in all Stage 0 documents:** *vendor-documented* · *implemented* (code exists) · *locally tested* (automated or manual test in a dev environment) · *customer-DEV validated* · *reported but unverified* · *proposed*.

> **Stage 1 update (23 September).** This hand-off describes the Stage 0 baseline and is kept unchanged as that record, apart from §6 (V11 is now the confirmed baseline). The Stage 1 work sits on review branches and is described in `docs/stage1/01_STAGE1_INCREMENTS.md`:
>
> - frontend `claude/focused-gates-gtay96`;
> - backend `claude/stage1-setup-and-safeguards`.
>
> From Stage 1 on, the gate reads per-company scope, not `scope.json`. The Stage 1 document explains how to run it.

## 1. Code under review

| | Frontend | Backend |
|---|---|---|
| Repository | https://github.com/Hendro33/JDE_change_factory_frontend | https://github.com/Hendro33/jde_change_factory_backend (GitHub reports it moved to `Hendro33/JDE_change_factory_backend`; both URLs resolve) |
| Branch under review | `main` | `main` |
| Exact commit | `d109e9cc8a613b3c40ddef72f4308440185535c0` (2026-09-23) | `20574b72a709e37db94ac51de7056f9f69f229eb` (2026-09-21) |
| Local path (this session) | `/home/user/JDE_change_factory_frontend` | `/home/user/jde_change_factory_backend` |
| Local vs `origin/main` | identical (0 ahead / 0 behind) | identical (0 ahead / 0 behind) |

**Review the two commits above.** These Stage 0 documents live on the frontend branch `claude/focused-gates-gtay96`, one documentation-only commit on top of `d109e9c`. They change no code. Neither `main` was modified by this pass.

### Other branches (not part of the reviewed build)

| Repo / branch | Tip | Status |
|---|---|---|
| backend `claude/focused-gates-gtay96` | `a4f711b` (2026-09-20) | Stale. Its one unique commit landed on `main` as `4722e3f` with the same subject, rebased onto a different parent, so the patches are not byte-identical. 72 files differ between it and `main`. Left untouched; do not review it as current. |
| backend `claude/focused-gates-gtay96-admin` | `13617c1` | Fully contained in `main`. |
| backend `claude/business-domain-governance` | `0f68618` | Fully contained in `main`. |
| frontend `claude/focused-gates-gtay96` | this documentation commit | `d109e9c` + Stage 0 documents only. |

## 2. Uncommitted work

**None.** Both working trees were clean with no stashes when this baseline was taken. The only local-only file of relevance is the gitignored frontend `.env.local` (see section 5). It contains two public, non-secret build settings:

```
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Consequence: **any local `npm run build` or `npm run dev` in this checkout targets a real local backend**, while CI builds without this file target the mock (section 3). Reviewers should create their own `.env.local` from `.env.example` if they want real mode.

Gitignored runtime data that is **not** in the repositories and must not be assumed present: `api_service/api_data/` (JSON stores and SQLite database), `backlog/`, `changes/`, `evidence/`, and `scope.json`. No `scope.json` exists in this checkout; only `scope.example.json`.

## 3. What is merged, deployed, mocked, tested and demonstrated

| Question | Answer | Evidence |
|---|---|---|
| Merged to `main` | Frontend: everything, including login/CSRF/reviewer attribution, capability catalogue UI and branding. Backend: everything, committed directly to `main`. | `git log origin/main` in both repos |
| Deployed frontend | `https://jade.consultiq.nl` (GitHub Pages) serves `d109e9c`. | Actions run 35890323129, 2026-09-23, conclusion success |
| **Deployed frontend mode** | **Mock.** The deploy build received `VITE_API_BASE_URL=""` and `VITE_USE_MOCK_API=true`. In mock mode the app **skips login** (persona picker instead) and keeps all data **in page memory**; every "save" is lost on reload. | Same run, job 107280857050, "Run npm run build" env block; `src/App.tsx:282-287`; `src/services/mockApi.ts:118-147` (no storage calls) |
| Deployed backend | **None.** `render.yaml` exists in the backend repo but no hosting account or service exists. | Backend `render.yaml`; no `VITE_API_BASE_URL` repository variable |
| Real login, CSRF, roles, invitations, password reset | Implemented and **locally tested** only (pytest, plus manual Playwright runs against a local backend on 21–23 September). Never exercised on the live site. | `api_service/tests/test_auth_and_membership.py` |
| Receive/Improve/Check and Architect agents | Implemented via Claude Agent SDK background tasks. Pytest replaces the SDK with fakes. **No live-run records exist in this environment**, so live model execution is *reported but unverified* here. | `services/orchestration_driver.py`, `services/architecture_driver.py`; `api_service/api_data/enhancement_runs/` empty |
| JDE connectivity | **Never demonstrated against JDE.** AIS reads are coded but untested live. The processing-option write has no Form Service Request payload (`FSR_SET_PROCESSING_OPTION = None`) and runs only in mock mode. | `mcp_server/jde_mcp_server/ais_client.py:34, 143-150` |
| V11's claim of a "validated" processing-option write | **Contradicted by the code.** No recorded FSR, fixture or JDE evidence exists in either repository. Only the approval/scope/evidence *gate* is proven, and only in mock mode. | V11 section 7.3; `prove_the_gate.py` |
| Jira | Implemented with a real HTTP gateway, idempotent get-before-create intake and SQLite settings. Mock gateway by default. Live Jira use is *reported but unverified* here. | `services/jira_gateway.py`, `services/jira_sync_service.py` |
| Email | Not configured. Invitation and reset links are returned in API responses (dev preview). | `services/email_service.py` |

### Test results at the reviewed commits (re-run 23 September 2026)

| Suite | Command | Result |
|---|---|---|
| Backend API | `python3 -m pytest api_service/tests/ -q` | **173 passed**, 1 deprecation warning, ~12 s |
| Safety-gate proof (mock JDE) | `python3 prove_the_gate.py` | **10/10 PASS** |
| Frontend typecheck and build | `npx tsc --noEmit` and `npm run build` | clean at `d109e9c` (merge validation, 23 September) |
| `mcp_server` unit tests | — | **none exist** (only `prove_the_gate.py`) |
| Frontend unit tests | — | **none exist** (no test runner configured) |

## 4. Startup and test instructions

### Backend (Python 3.11)

```bash
cd jde_change_factory_backend
pip install -e ./mcp_server -e ./api_service
python3 -m pytest api_service/tests/ -q      # isolated temp dirs; no JDE, no model calls
python3 prove_the_gate.py                     # mock JDE; backs up and restores any scope.json
# Run the API. The data dir defaults to api_service/api_data; override for a throwaway run:
JDE_API_DATA_DIR=/tmp/jade/api_data JDE_BACKLOG_DIR=/tmp/jade/backlog \
JDE_CHANGE_DIR=/tmp/jade/changes JDE_EVIDENCE_DIR=/tmp/jade/evidence \
JDE_API_ALLOWED_ORIGINS=http://localhost:5173 JDE_COOKIE_SECURE=false \
JDE_BOOTSTRAP_ADMIN_EMAIL=<you> JDE_BOOTSTRAP_ADMIN_PASSWORD=<choose one locally> \
uvicorn jde_api_service.main:app --app-dir api_service --port 8000
```

The agent drivers (Receive/Improve/Check, Architect, "Ask Jade") need Claude Agent SDK credentials in the environment. The SDK reads these itself: `ANTHROPIC_API_KEY`, or an existing Claude Code login. Project code never reads them.

### Frontend (Node 20)

```bash
cd JDE_change_factory_frontend
npm ci
cp .env.example .env.local        # real mode against http://localhost:8000; delete for mock mode
npm run dev                        # http://localhost:5173
npx tsc --noEmit && npm run build  # what CI runs (without .env.local, so CI builds mock mode)
```

## 5. Environment variable names (values never included)

**Frontend (build-time, public):** `VITE_USE_MOCK_API`, `VITE_API_BASE_URL`.
CI derives both from the repository variable `VITE_API_BASE_URL`, which is currently unset.

**Backend, api_service:**
- Storage: `JDE_API_DATA_DIR`, `JDE_API_DB_PATH`, `JDE_API_REPO_ROOT`
- CORS and cookies: `JDE_API_ALLOWED_ORIGINS`, `JDE_COOKIE_SECURE`, `JDE_COOKIE_SAMESITE`, `JDE_COOKIE_DOMAIN`
- Admin bootstrap: `JDE_BOOTSTRAP_ADMIN_EMAIL`, `JDE_BOOTSTRAP_ADMIN_PASSWORD` *(secret)*, `JDE_BOOTSTRAP_ADMIN_NAME`, `JDE_BOOTSTRAP_ADMIN_COMPANIES`
- Email and Jira: `JDE_EMAIL_DEV_PREVIEW`, `JDE_JIRA_MOCK_MODE`

**Backend, mcp_server:**
- JDE mode and AIS connection: `JDE_MCP_MOCK_MODE` (default `true`), `JDE_AIS_BASE_URL`, `JDE_AIS_USERNAME`, `JDE_AIS_PASSWORD` *(secret)*, `JDE_AIS_ENVIRONMENT`, `JDE_AIS_ROLE`
- Storage: `JDE_BACKLOG_DIR`, `JDE_CHANGE_DIR`, `JDE_EVIDENCE_DIR`
- Governance files and expiry: `JDE_SCOPE_FILE`, `JDE_CAPABILITY_CATALOG_FILE`, `JDE_CHANGE_APPROVAL_EXPIRY_SECONDS`

**Model credentials (read by the Claude Agent SDK, not by project code):** `ANTHROPIC_API_KEY` *(secret)*.

**Stored secrets:** Jira API tokens are entered through Admin > Integrations and stored **in plaintext** in the SQLite `jira_credentials` table. This is documented as pilot-scoped in `models/jira_integration.py` and V11 section 19.7. It is not a secrets store.

## 6. Authoritative design document

| Version | Location | Status |
|---|---|---|
| **V11** | backend `docs/JDE_AI_Driven_Change_Factory_Design_Document_v11.docx`. Content last changed in `fb1e05a` (2026-09-20); the title page reads "Design Document — Version 11". It includes the 19–20 September increments (§1.3 "What's new since v11", §19 Administration Area, §19.7 credential handling). | **The authoritative baseline.** Confirmed by the owner on 23 September: V11 as maintained through 20 September. |
| Design update draft | `docs/stage0/04_JADE_DESIGN_V13_DRAFT.md` (this branch) | Proposes changes to V11 from the 21 and 23 September assessment and brief, and records what Stage 1 implemented. V11 stays authoritative until the owner accepts it. |

The owner-supplied inputs (`JADE_Full_Product_Architecture_Assessment.md` including its 23 September section 17, `JADE_Staged_Delivery_Plan.md` and `JADE_Claude_Design_Update_Brief.md`) were read from session uploads. They are not committed to either repository.

## 7. What this pass did not do

This pass did not merge to `main`, deploy, purchase or provision infrastructure, write to JDE, run experiments, or change application code. Existing work, including the stale backend branch, is untouched.

## 8. Other Stage 0 documents

- `02_STORAGE_AUDIT.md`: every setup screen traced from the UI through the API to storage, with a defect list.
- `03_CAPABILITY_RECONCILIATION.md`: implemented, partial, missing and unverified capabilities against the full-product requirements, with code and test references.
- `04_JADE_DESIGN_V13_DRAFT.md`: design update, change log, feasibility matrix, cost assumptions, decision register and owner summary.
- `05_IMPLEMENTATION_BACKLOG.md`: prioritised backlog with persistence defects first and early technical experiments retained.
