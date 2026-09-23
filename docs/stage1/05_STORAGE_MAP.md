# Where each entity is stored

This map is taken from the code on the review branches. It shows, for each entity:

- where it is stored;
- how one company is kept from another's data;
- what protects it from concurrent overwrites;
- how it is backed up.

**Paths.** All paths are relative to the backend's data locations, which are set by environment variables:

| Variable | Default | Example on the proposed host |
|---|---|---|
| `JDE_API_DATA_DIR` | `./api_data` | `/data/api_data` |
| `JDE_BACKLOG_DIR` | `./backlog` | |
| `JDE_CHANGE_DIR` | `./changes` | |
| `JDE_EVIDENCE_DIR` | `./evidence` | |
| `JDE_API_DB_PATH` | `api_data/jde.sqlite3` | |

On the proposed host all of these live on the one persistent disk.

## 1. Relational: SQLite `jde.sqlite3`

| Entity | Table | Company isolation | Concurrent-update protection |
|---|---|---|---|
| Users, password hashes | `users` | Global (a person can belong to several companies) | Transactions; single-row updates |
| Sessions | `sessions` (token hash only) | Per user; company access re-checked on every request | Insert or revoke only |
| Invitations, reset tokens | `invitations`, `password_reset_tokens` (hashes only) | Invitation carries `company_id`; tokens are single-use | Transactions |
| Companies | `companies` | — (seeded; no create/edit screen yet, M-1) | — |
| Memberships, roles, domain assignments | `company_memberships`, `membership_roles`, `domain_assignments` | Every row keyed by company; domain IDs must be the same company's (new) | Transactions, plus a "last Admin" check. **No revision:** two Admins editing one member's roles at the same moment means the later save wins |
| Access audit | `access_audit_log` | `company_id` column | Append-only |
| Jira configuration | `jira_integrations` | Primary key `company_id` | **Revision (409 stale, 428 missing)**; `BEGIN IMMEDIATE` |
| Jira credentials | `jira_credentials` | Primary key `company_id` | Deliberate overwrite, revision incremented. **Token encrypted**; key only in the environment |
| Company settings (dashboard thresholds) | `company_settings` | Primary key `(company_id, key)` | **Revision**; `BEGIN IMMEDIATE` |
| Failed sign-ins | `login_failures` | Per account or per client | Append-only; rows older than a day are pruned |

## 2. Documents: one JSON file per record (`JsonFileStore`)

Every file is written atomically: temp file, `fsync`, then rename. An interrupted write leaves the previous version intact; this is tested.

| Entity | Location | Company isolation | Concurrent-update protection |
|---|---|---|---|
| **Engagement scope**: approved versions, spikes, DEV binding, approval policy | `api_data/engagement_scope/<company>.json` | One file per company. Written from the session's company. **Read by the execution gate for the story's own company only.** | **Revision** under a per-directory lock |
| **Story → company link** | `api_data/customer_links/<story>.json` | Is the isolation record: stories without one are invisible and cannot execute | Written once at intake |
| Business domains | `api_data/business_domains/<id>.json` | `customer_id` in the record, filtered on every read | Status changes **revisioned** under the lock. Creation makes a new file. Other fields are not editable. |
| Change requests, domain reviews, delivery queue, architecture reviews, enhancement runs, agent runs, decision feedback | `api_data/<collection>/<id>.json` | `customer_id` in the record, or reached only through a customer-checked change | Atomic writes and workflow-stage checks, **no revision**. Two people acting on the same workflow step at the same moment: the second is usually refused by the stage check; where it is not, the later write wins. |

## 3. Execution records (`mcp_server`)

| Entity | Location | Company isolation | Concurrent-update protection |
|---|---|---|---|
| Stories (Gate 2 decisions) | `backlog/<story>.json` | Through the story → company link | Written by explicit human decisions |
| Exact changes: approval, approver authority, **execution attempts, reconciliations** | `changes/<change>.json` | `company_id` stamped at proposal; re-checked against the link before execution | Atomic writes plus a **per-change file lock** (works across processes, so the API and any MCP server process see the same state) |
| Evidence chain | `evidence/<story>.json` | Through the story | Hash chain (tamper-evident) |
| Mock JDE values (mock mode only) | `JDE_MOCK_JDE_STATE_FILE` | — | Atomic write |

## 4. Not in the data directory

| Entity | Where | Why |
|---|---|---|
| Capability catalogue | `capability_catalog.json` in the repository | Version-controlled on purpose: promotion to Validated is a reviewed code change |
| Agent definitions | `.claude/agents/*.md` in the repository | Same |
| Credential encryption key | Host environment (`JDE_CREDENTIAL_KEY`) and the team password manager | Must never be stored with the data it protects |
| Browser | `ciq_http_active_customer` (which company is selected); demo persona keys (mock mode only); `jade_dashboard_thresholds` (legacy, read only for the one-time import) | Preferences, never business data |

## 5. Backup and restore

The procedure is in backend `docs/OPERATIONS.md`, and was verified by a local dry run:

1. Take a consistent copy of `jde.sqlite3` with SQLite's own backup, not a file copy of the live database.
2. Tar the rest of the data directories together with that copy.
3. Encrypt the archive before it leaves the host.
4. Restoring reverses this. It needs the credential key that was current when the backup was taken.

On the proposed host, Render's daily encrypted disk snapshot, kept at least 7 days, is a second layer.

**Limits:**

- Each JSON file in a backup is whole. A change made while the archive is being written may or may not be included.
- There is no point-in-time recovery between backups.
- If the credential key is lost, only the Jira tokens are lost; each company's Admin re-enters them.

## 6. Why the JSON stores were not moved into database tables yet

**Why it was deferred.** Moving them (backlog B-4 remainder, D-7) is a real piece of work, not a rename:

- The execution gate runs in the MCP server, a separate process that Claude Code starts. Today it reads the company scope and the story links as plain files, which is the tested contract between the two processes. Moving those records into the database means giving the MCP server its own database access, or an API call back into the backend. Both change the trust boundary of the gate, and deserve their own review.
- The gaps that mattered for Stage 1 were silent overwrites, missing attribution and non-atomic writes. They are closed at the record level (revisions, locks, atomic writes), so the move would not have changed what the pilot can safely do.

**Does it limit the proposed shared pilot?** Not for a single instance, which is what the proposal is. The limits are stated so they are not discovered later:

1. **One backend process only.** The per-directory lock works within one process. The proposal's start command runs one Uvicorn worker, and a Render service with a disk cannot scale beyond one instance, so this holds. Adding workers or instances requires the database move first. The execution records in `changes/` use a cross-process file lock and are not affected.
2. **Workflow records have no revisions.** A near-simultaneous action on the same review step by two people can end last-write-wins where no stage check catches it. This is acceptable for a small invite-only pilot. Revisions on those records should be added before customers' own users work on the same items (with B-8).
3. **Reporting and search** across companies need a scan of the files. This is fine at pilot volume (tens or hundreds of records), and slow at thousands.
4. **Role edits on memberships** have no revision (§1).

None of these affects company isolation or execution safety. The gate's inputs (scope, links, change records) are the revisioned or locked ones.
