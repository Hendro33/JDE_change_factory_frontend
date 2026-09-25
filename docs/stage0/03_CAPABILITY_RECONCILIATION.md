# Jade Stage 0 — capability reconciliation

**Baseline:** frontend `d109e9c`, backend `20574b7`. Tests re-run 23 September 2026: 173 API tests pass; `prove_the_gate.py` 10/10 (mock JDE).
**Requirements source:** `JADE_Full_Product_Architecture_Assessment.md` (21 September, plus the 23 September section 17), the staged delivery plan and the design-update brief.

## Status definitions

| Status | Meaning |
|---|---|
| **Implemented** | Code exists and has automated tests at the reviewed commits. |
| **Partial** | Some required behaviour exists; named gaps remain. |
| **Missing** | No code. |
| **Unverified** | Code exists, but the behaviour that matters (a live model run, live JDE, live Jira, deployed use) has no evidence in this environment. |

No row is **customer-DEV validated**: nothing in either repository has run against JDE. "Mock" means the deterministic fixture paths (`JDE_MCP_MOCK_MODE=true` default, `JDE_JIRA_MOCK_MODE`, or the frontend mock API).

## A. Intake, requirements and governance

| Capability | Status | Evidence (code / tests) | Gap |
|---|---|---|---|
| Direct-entry intake, canonical ChangeRequest, company isolation | Implemented | `routers/change_requests.py`; `test_change_request_api.py` (5), `test_customer_isolation.py` (4) | Not connected on the live site (mock mode) |
| Jira intake (pickup status, idempotent import, Jade ID write-back, transition last) | Implemented, **Unverified live** | `services/jira_sync_service.py`, `jira_gateway.py`; `test_jira_integration.py` (30), `test_jira_http_gateway.py` (7), `test_jira_test_connection.py` (12) | No live-Jira evidence here. Field/status ownership rules are not documented as a contract. |
| Receive / Improve / Check pipeline | Implemented, **Unverified live** | `services/orchestration_driver.py`; `test_orchestration.py` (7), with the SDK faked | No live run records in this environment. Runs are in-process `BackgroundTasks`, lost on restart. No evaluation corpus. |
| Domain Owner review, edit and refinement; Reviewer Agent re-pass; "Ask Jade about this requirement" | Implemented | `routers/domain_governance.py`, `services/review_driver.py`, `conversation_driver.py`; `test_domain_governance.py` (24), `test_requirement_conversation.py` (12) | Model calls unverified live |
| Product Manager ("Application Manager") delivery authorisation (Gate 1) | Implemented | `domain_governance.py:363-367` requires `require_role("product_manager")` | UI label still says "Application Manager". Mapping holds in code; V13 makes it explicit. |
| Roles, identities, invitations, sessions, CSRF, reviewer auto-attribution | Implemented, locally tested | SQLite auth tables; `test_auth_and_membership.py` (20), `test_session_api.py` (4) | Never used on the live site. Email is dev-preview only. |
| Domain entitlement for Domain Owners | Implemented | `dependencies.py:135` `require_domain_owner_access` | — |
| Exact-change approver entitlement | **Partial** | `architecture_review.py:147` uses `require_write_access` | Any non-viewer role, including Admin, can approve. No policy record. (P-8) |
| Defect/fault intake and DEV reproduction (§17.2) | **Missing** | Only a "Support / Topdesk" source label (`models/change.py:15`) | No fault type, expected/actual behaviour, reproduction plan, outcome states or regression test linkage |
| Backlog integrity: impact manifests, overlap/stale/dependency checks (§17.3) | **Missing** | — | No impact manifest, dependency graph, conflict records or reservations |
| APQC reference model and customer applicability (§17.1) | **Missing** (free-text code only) | `models/business_domain.py` `apqc_code` | No hierarchy, edition, import, selection or upgrade path |
| Process maps (base, as-is, to-be), linked to stories (§17.1) | **Missing** | — | — |
| Authoritative backend persistence of all setup (§17.4) | **Partial** | See `02_STORAGE_AUDIT.md` | Live site mock-only; scope unwired; typed attribution; no revisions; thresholds browser-only |

## B. Architect and knowledge

| Capability | Status | Evidence | Gap |
|---|---|---|---|
| Architect: route decision, alternatives ("why not?"), objects, rollback, Implementation Specification | Implemented, **Unverified live** | `services/architecture_driver.py`, `.claude/agents/architect.md`; `test_architecture_collaboration.py` (9) | The spec is thin (`models/change.py:82-86`): no evidence snapshot, citations, dependency limits, test manifest, compatibility vs. executability, or open questions as structured fields |
| "Ask Jade about this solution" | Implemented | `conversation_driver.py`; `test_architecture_collaboration.py` | Unverified live |
| Resolve without Change | Implemented | `backlog.resolve_without_change`; `prove_the_gate.py` step 6 | — |
| Discovery reads (object, version, processing options) | Implemented (mock); **Unverified live** | `ais_client.py:80-108` real AIS REST paths | Never called against AIS |
| Customer environment model (§5.2) | **Missing** | Only seeded `tools_release`/`environment` strings and a global AIS connection | Versions, ESUs, modules, path code, isolation, provenance and history |
| Knowledge Library (§5.2) | **Missing** | — | No document store, retrieval, permissions or citations |
| Targeted dependency/relationship model | **Missing** | — | — |

## C. Execution, governance at the execution boundary

| Capability | Status | Evidence | Gap |
|---|---|---|---|
| Story gate + exact-change hash binding + expiry | Implemented (mock) | `mcp_server/.../approval.py`, `backlog.py`; `prove_the_gate.py` checks 1–4 | Record lacks story revision, before-state, dependency fingerprint, test manifest and approver authority (§10) |
| Capability registry (5 statuses, revisions, technical vs policy fields, no self-promotion) | Implemented | `capability_catalog.json`, `capability_catalog.py`; `test_capability_catalog.py` (4); `prove_the_gate.py` 7–10 | Single global catalogue. No toolchain fingerprint or compatibility profile per customer. |
| DEV-only environment binding with human-confirmed isolation | **Partial** | `scope.py` `check_environment_binding` | Global `scope.json`, not per company; isolation is a human boolean, not a verified OCM check |
| Spike-experiment approval | **Partial** | `scope.py:192` | `expires_at` not enforced (P-7) |
| Engagement scope per company | **Partial** (stored, unwired) | `engagement_scope_service.py` | Not read by the gate (P-2) |
| Processing-option write | **Missing** (mock only) | `ais_client.py:34` `FSR_SET_PROCESSING_OPTION = None` | **Contradicts V11 §7.3 "validated".** No FSR, fixture or DEV evidence. |
| Other functional families: saved selection, sequencing, UDC, constants, document/line types, activity rules | **Missing** (catalogued, Needs spike) | `capability_catalog.json` priorities 2–7 | No adapters |
| Change Sets | **Missing** (explicitly blocked) | `change_set.py` raises `ChangeSetNotSupportedError` | Engine, manifest, checkpoints and recovery |
| Technical Agent (any family) | **Missing** | No `.claude/agents` file; UI shows "Development Agent — Planned" | All §8.2 families unproven |
| Governed tool gateway (server-side policy on calls) | **Partial** | MCP tools call the gates directly; PreToolUse CLI hook (`.claude/hooks/approve_writes.py`) | No gateway independent of MCP. The hook needs a TTY. Functional Agent has no API driver (run manually via Claude Code). |
| Durable jobs, run states, reconciliation, leases (§10) | **Missing** | `BackgroundTasks` (10 sites), no recovery | Restart loses runs; no attempt identity; no reconciliation |
| Customer-side runner (§5.4) | **Missing** | — | — |
| Test binding to approved change | Implemented (mock) | `approval.require_change_covers_test`; `run_orchestration` | Real Orchestrator call untested |
| Independent verification (read-back, behaviour, regression) | **Missing** | Instructions only (`functional-agent.md`) | No enforced read-back step or verification record |
| Evidence: append-only, hash-chained | Implemented (mock) | `evidence.py`; `prove_the_gate.py` step 5 | File per story, no company key, non-atomic, no artefact store |
| CNC hand-off record | **Missing** | Lifecycle label only | — |
| Human Implementation route | **Partial** | `ImplementationRoute` literal; capability statuses | No hand-off artefact or tracking |

## D. Platform operations

| Capability | Status | Evidence | Gap |
|---|---|---|---|
| Agent registry, versions, health, run history, decision feedback | Implemented | `agent_registry_service.py`, `agent_run_service.py`; `test_admin_api.py` (10) | Version is a content hash of the `.md` file. No per-company runtime config. |
| AI usage and cost metering (§12) | **Missing** | No usage fields anywhere | Rate card, run/stage budgets, retry limits |
| Hosting (shared pilot) | **Missing** (parked, by decision) | `render.yaml` unused; no backend hosted | Correctly parked; Stage 6 |
| Email delivery | **Missing** | `email_service.py` dev preview | — |
| Secrets storage | **Partial** | Jira token plaintext in SQLite; AIS password as env var | Protected secret store needed before shared hosting |
| Backup/restore procedure | **Partial** (documented, not drilled) | backend `docs/OPERATIONS.md` | Restore not demonstrated |
| Frontend automated tests | **Missing** | No test runner | — |
| `mcp_server` unit tests | **Missing** (script only) | `prove_the_gate.py` | Pytest suite with negative cases |

## E. Reconciliation of prior claims

| Claim | Source | Finding |
|---|---|---|
| "Validated" processing-option FSR write | V11 §7.2–7.3; Assessment §2 (V12 wording) | **Not supported by evidence.** The payload is `None`; only mock. Reclassify as *proposed/unproven*. Needs Experiment A. |
| "165 tests passed" / administration tests | Earlier implementation report | Superseded: **173** pass today. They are API/unit tests with mocked SDK, JDE and Jira, and **establish no JDE capability**. |
| "Backend on main; frontend branch unmerged; public site mocked; no backend hosted" | Assessment §2 | Frontend is **now merged** to `main` (`436c64d`, `3c6258f`, `d109e9c`). The public site is **still mocked** (confirmed from the build log). No backend is hosted. |
| "Real backend connected to the UI in use" | Staged plan Stage 1 question | **No.** The live UI never talks to a backend. |
| Change Sets, Technical Agent, knowledge layer | V11 §7.3.1, §4.5, §4.3.1 | Design only (Change Sets explicitly blocked) |
| Reviewer auto-attribution | 21 September increment | Implemented for governance decisions. **Not** for settings saves (P-3). |

## F. Summary counts, for orientation only

Across the 45 rows in sections A–D:

| Status | Rows |
|---|---|
| Implemented (incl. locally tested / mock-tested; several also unverified live) | 16 |
| Partial (incl. backup documented but not drilled) | 9 |
| Missing (incl. explicitly blocked, and hosting parked by decision) | 20 |
| Customer-DEV validated | 0 |

The **governance and review skeleton** is real and well tested. The **execution, environment, durability and process-context** layers the full product depends on are largely missing. This is consistent with the Assessment's judgement, now evidenced against code.
