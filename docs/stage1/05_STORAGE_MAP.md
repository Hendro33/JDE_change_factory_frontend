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
| Memberships, roles, domain assignments | `company_memberships`, `membership_roles`, `domain_assignments` | Every row keyed by company; domain IDs must be the same company's (new) | Transactions, plus a "last Admin" check. **Revisioned** (migration 4): a role, domain or status change needs the revision the Admin loaded (409 stale, 428 absent), runs under `BEGIN IMMEDIATE`, and re-checks inside that transaction that the caller is still an Admin |
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
| Change requests, domain reviews, delivery queue, architecture reviews, enhancement runs, agent runs, decision feedback | `api_data/<collection>/<id>.json` | `customer_id` in the record, or reached only through a customer-checked change | Atomic writes. Domain-review decisions (assign domain, start, edit, approve, reject, Application Manager approve/reject, reconsideration) are a **stage compare-and-set under the store lock**, with the caller's roles and domain assignment re-read from SQLite inside the lock: the second of two simultaneous decisions gets 409. Other collections: no revision. |

## 3. Execution records (`mcp_server`)

| Entity | Location | Company isolation | Concurrent-update protection |
|---|---|---|---|
| Stories (Gate 2 decisions) | `backlog/<story>.json` | Through the story → company link | Written by explicit human decisions |
| Exact changes: approval, approver authority, **execution attempts, reconciliations** | `changes/<change>.json` | `company_id` stamped at proposal; re-checked against the link before execution | Atomic writes plus a **per-change file lock** (works across processes, so the API and any MCP server process see the same state). Approve, reject, attempts and reconciliations all take it; the approver's current roles are re-read from SQLite (read-only, `JDE_AUTH_DB_PATH`) inside it before dispatch |
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

The procedure is in backend `docs/OPERATIONS.md`, and is automated in `scripts/jade_backup.py` (backup / verify / restore). It is tested end to end in `tests/test_backup_restore.py`:

1. **Writes are paused.** The flag file `JDE_WRITE_PAUSE_FILE` makes the API answer mutating requests with 503 and makes the gate refuse to start a JDE attempt. The backup is refused while an agent run or JDE attempt is in progress.
2. SQLite is copied with its online-backup API, and every JSON location is copied in the same pause, so both describe one moment.
3. A manifest records:
   - a sha256 for every file;
   - row counts;
   - a summary of memberships, approvals and execution states, scope revisions and evidence-chain validity;
   - the **ids** of the credential keys the tokens need. The key itself is never included.
4. **Restore** runs these steps:
   - it verifies every checksum first;
   - it moves the current data aside, never deleting it;
   - it restores under a pause and runs `integrity_check`;
   - it compares the restored state with the manifest;
   - it reports whether the current key can read the tokens.

   Then restart the service.
5. Encrypt the archive before it leaves the host. The matching key is recovered separately, by its id, from the password manager.

On the proposed host, Render's daily encrypted disk snapshot, kept at least 7 days, is a second layer. It is not paused, so it is not guaranteed consistent across SQLite and JSON.

**Limits:**

- There is no point-in-time recovery between backups.
- The pause is a flag file honoured by this single process and by the gate. A second instance would not see it (see §6.1).
- If the credential key is lost, only the Jira tokens are lost; each company's Admin re-enters them. Meanwhile Jira is shown as Unavailable, with no fallback to simulated data.

## 6. Why the JSON stores were not moved into database tables yet

**Why it was deferred.** Moving them (backlog B-4 remainder, D-7) is a real piece of work, not a rename:

- The execution gate runs in the MCP server, a separate process that Claude Code starts. Today it reads the company scope and the story links as plain files, which is the tested contract between the two processes. Moving those records into the database means giving the MCP server its own database access, or an API call back into the backend. Both change the trust boundary of the gate, and deserve their own review.
- The gaps that mattered for Stage 1 were silent overwrites, missing attribution and non-atomic writes. They are closed at the record level (revisions, locks, atomic writes), so the move would not have changed what the pilot can safely do.

**Does it limit the proposed shared pilot?** Not for a single instance, which is what the proposal is. The limits are stated so they are not discovered later:

1. **One backend process only.** The per-directory lock works within one process. The proposal's start command runs one Uvicorn worker, and a Render service with a disk cannot scale beyond one instance, so this holds. Adding workers or instances requires the database move first. The execution records in `changes/` use a cross-process file lock and are not affected.
2. **Workflow records other than domain reviews have no revisions.** Domain-review decisions and exact-change decisions are compare-and-set under a lock. Other collections (change requests, delivery queue, architecture reviews) remain last-write-wins where no stage check catches a race. The lock is per process, which is enough for one worker.
3. **Reporting and search** across companies need a scan of the files. This is fine at pilot volume (tens or hundreds of records), and slow at thousands.
4. ~~Role edits on memberships have no revision~~ — closed: revisioned, with the Admin re-checked inside the transaction (§1).

None of these affects company isolation or execution safety. The gate's inputs (scope, links, change records) are the revisioned or locked ones.
