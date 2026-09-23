# S1-3 Proposal: a minimal shared backend for the pilot

| | |
|---|---|
| Status | **Proposal only.** Nothing has been purchased, created or deployed. The Azure / full-hosting migration stays parked. |
| Goal | Give the pilot one shared, durable backend, so that setup saved by one person is seen by another and survives restarts. Today the live site `jade.consultiq.nl` runs mock-only (P-1). |
| Principle | Use the **existing application unchanged**: one FastAPI process, SQLite plus JSON files on one persistent disk. No database migration, container rewrite or new services. |
| Budget | EUR 100/month for infrastructure, **AI usage excluded** |
| Prices | Published list prices as found on 23 September 2026 (see Sources). `render.com` itself could not be opened from this environment, so each figure must be confirmed on the Render pricing page before purchase. None is a quote. |

---

## 1. Recommendation

Deploy the existing backend as **one Render web service with a persistent disk**, using the `render.yaml` blueprint already in the backend repo, with the changes in §5. Keep the frontend on GitHub Pages, switched to real mode.

**Why Render rather than a plain VM (e.g. a small Hetzner server):**

- It needs no server administration. HTTPS certificates, OS patching and restarts are the platform's job.
- It deploys from GitHub.
- The disk is encrypted at rest and snapshotted daily.
- A VM would cost less (single-digit euros) but adds patching, TLS and backup chores that nobody on the pilot is staffed to own.

This choice is easy to reverse: the data is one directory tree, and §4 describes moving it.

```
Browser ──HTTPS──> jade.consultiq.nl   (GitHub Pages, static React build, real mode)
   │
   └──HTTPS, session cookie──> api.consultiq.nl   (Render web service, 1 instance)
                                 ├─ FastAPI (api_service)
                                 ├─ agent runs: Claude Agent SDK (bundled CLI) + MCP server subprocess
                                 └─ /data  (persistent disk: SQLite + JSON stores + evidence)
                                        ├─ daily platform snapshots (≥7 days)
                                        └─ weekly encrypted copy off-platform
```

JDE remains in **mock mode** on this host. It has no network path to any customer JDE, and none is proposed here (see §7).

## 2. Recurring cost

| Item | Choice | USD / month (list) |
|---|---|---:|
| Web service | **Standard**: 2 GB RAM, 1 CPU. See the note below on why not Starter. | 25.00 |
| Persistent disk | 5 GB at USD 0.25/GB. Current data is well under 1 GB; the headroom covers evidence growth. | 1.25 |
| Disk snapshots | Daily, automatic, retained ≥ 7 days | included |
| Workspace plan | **Hobby** (free; 5 GB bandwidth/month) is enough for a single operator. **Pro** (USD 25/month flat, unlimited members, 25 GB bandwidth) if more than one person needs dashboard access. | 0 or 25.00 |
| Custom domain + TLS | `api.consultiq.nl` CNAME; certificate managed by Render | included |
| Frontend hosting | GitHub Pages (existing) | 0 |
| Off-platform backup storage | A few GB in any S3-compatible bucket, or the owner's own storage | ≈ 0–1 (to confirm) |
| Uptime check | Any free external monitor, or Render's own health check | 0 |
| **Total** | | **≈ 26–52** |

- **Budget fit:** USD 26–52/month is inside EUR 100/month at any realistic exchange rate, leaving room for an email provider (§6). Currencies are kept separate until the owner applies an agreed rate (design §15.1).
- **Why Standard, not Starter** (USD 7, 512 MB): each agent run starts the Claude Code CLI (Node) plus a Python MCP server subprocess next to the API process. 512 MB is very likely too small for even one run; this is a judgement, not measured. Start on Standard. Downgrade only after measuring memory during a real run. Moving between plans is a setting change.

**Excluded from the EUR 100:**

- AI model usage (Anthropic API; metered separately, see design §15.2–15.3);
- any JDE connectivity: VPN, customer network path, AIS licences;
- the Windows development runner (Stage 5);
- an email provider (§6);
- a relational database and secret manager (Stage 6);
- the domain itself (already owned);
- engineering and support time.

## 3. Persistent storage

Everything durable lives under the one mounted disk, as in `docs/OPERATIONS.md`:

| Path on the disk | Contents |
|---|---|
| `/data/api_data/jde.sqlite3` | Users, password hashes, sessions, companies, memberships, roles, invitations, Jira configuration and credentials, company settings (thresholds) |
| `/data/api_data/*/` | JSON stores. This includes each company's engagement scope, the record the execution gate enforces, and the story → company links. |
| `/data/backlog`, `/data/changes`, `/data/evidence` | Gate records, exact-change approvals, the evidence chain |

**Constraints this design accepts, all consequences of SQLite and files on one disk:**

- **One instance only.** Render cannot scale a service with a disk beyond one instance. Stage 1 concurrency safety (per-directory locks, SQLite `BEGIN IMMEDIATE`) assumes a single process.
- **A few seconds of downtime per deploy.** Render stops the old instance before starting the new one when a disk is attached, so there are no zero-downtime deploys.
- **Deploys interrupt agent runs.** S1-2 now marks an interrupted run as failed with "retry" on startup, instead of leaving it looking like it is still running. Deploy outside working sessions.
- **Scaling beyond one instance is Stage 6 work** (PostgreSQL, a worker process, object storage), not a setting.

## 4. Backups and restore

| Layer | What | Cadence | Retention |
|---|---|---|---|
| Platform snapshot | Render's automatic snapshot of the whole disk, encrypted at rest | Daily | ≥ 7 days (platform) |
| Off-platform copy | `tar` of `/data`, **encrypted before download** (e.g. `age` or `gpg`), stored outside Render | Weekly, and before every schema-changing deploy | 8 weekly + 3 monthly (proposed) |

- **Why encrypt the off-platform copy:** the archive contains password hashes, session hashes and Jira API tokens (see R-3).
- **How:** the procedure is `docs/OPERATIONS.md` §Backup/Restore, plus the encryption step. It starts manual; scripting it is a small follow-up if the cadence holds.
- **Restore drill (required before real customer data):** restore the latest off-platform copy into a *fresh* service, start it, log in, and check a known engagement scope and approval record. Record the time taken; that is the recovery-time evidence.
- **Moving off Render later:** restore the same archive onto any host.

## 5. Changes before go-live

| # | Change | Kind | Blocking? | Effort (d) |
|---|---|---|---|---|
| **R-1** | **The anonymous forgot-password endpoint returns a working reset link in dev-preview mode.** `JDE_EMAIL_DEV_PREVIEW` defaults to true, and `render.yaml` does not change it, so on a public host anyone who knows a user's email could reset that user's password. Fix: the anonymous endpoint never returns a link. Without an email provider, an Admin issues a reset link from Users (a new Admin-only endpoint) and hands it over out of band, as invitation links are today. | Code + test | **Yes** | 0.5 / 1 / 1.5 |
| R-2 | Login has no rate limiting or lockout. Add a per-account and per-IP attempt limit with a short cool-down. | Code + test | Yes before any external user is invited; optional for owner-only use | 0.5 / 0.5 / 1 |
| R-3 | Jira API tokens are stored in plaintext in SQLite (P-10). The disk and snapshots are encrypted at rest by the platform, but tokens are readable by anyone with shell access and appear in backups. Recommended: encrypt the token column with a key held only in the platform's secret environment (`JDE_SECRET_KEY`), with rotation by re-entry. Alternative: accept for the pilot, with no production Jira token stored. | Code or decision | Yes before a real customer's Jira token is entered | 0.5 / 1 / 2 |
| R-4 | Update `render.yaml`: plan `standard`, disk 5 GB, and the environment in §5.1. | Config | Yes | incl. below |
| R-5 | Merge S1-1 and S1-2 first. The shared setup depends on revisions, the session actor and per-company gate records. | Review | Yes | — |
| R-6 | Configure, deploy, verify the eight storage acceptance tests on the host (including a redeploy with the same disk), then run the restore drill. | Ops | Yes | 1 / 1.5 / 2.5 |
| | **Total to carry out** | | | **2.5 / 4 / 7** (without R-2: 2 / 3.5 / 6) |

### 5.1 Configuration

Set in the Render dashboard. **Values marked secret are never committed, pasted into chat or put in `render.yaml`.**

| Variable | Value |
|---|---|
| `JDE_API_DATA_DIR`, `JDE_BACKLOG_DIR`, `JDE_CHANGE_DIR`, `JDE_EVIDENCE_DIR` | Under `/data` (as in `render.yaml`) |
| `JDE_API_ALLOWED_ORIGINS` | `https://jade.consultiq.nl` (exact origin) |
| `JDE_COOKIE_DOMAIN` | `.consultiq.nl` |
| `JDE_COOKIE_SAMESITE` | `lax` |
| `JDE_COOKIE_SECURE` | `true` |
| `JDE_MCP_MOCK_MODE` | `true`, explicitly: there is no JDE on this host |
| `JDE_EMAIL_DEV_PREVIEW` | `true` only **after** R-1. It then only shows invitation and reset links to an Admin. Set it to `false` once a real email provider is added. |
| `JDE_BOOTSTRAP_ADMIN_EMAIL`, `JDE_BOOTSTRAP_ADMIN_PASSWORD` *(secret)* | Set once. Remove the password after the first login (see `OPERATIONS.md`). |
| `ANTHROPIC_API_KEY` *(secret)* | Only if agent runs are to happen on the host; the AI cost falls outside this budget. |
| `JDE_SECRET_KEY` *(secret)* | If R-3 is implemented |

Nothing else is needed for the gate. At startup the backend points `JDE_COMPANY_SCOPE_DIR` and `JDE_STORY_COMPANY_DIR` at its own data directory (S1-2).

**Frontend:** set the GitHub repository variable `VITE_API_BASE_URL=https://api.consultiq.nl`. The existing Pages workflow then builds real mode automatically (`deploy-pages.yml` switches `VITE_USE_MOCK_API` on that variable). **Owner decision D-2:** this replaces the open mock demo with a login screen. If a public demo is still wanted, it needs its own address.

## 6. Login, sessions and email

**Login and session requirements, as implemented:**

- **Invite-only.** There is no self-registration. The first Admin is created by the bootstrap variables.
- **Passwords** are hashed with bcrypt.
- **Sessions** are random tokens stored hashed, in an `httponly` cookie.
  - They last 14 days and can be revoked.
  - With the cookie domain above, the cookie is `Secure` and `SameSite=Lax`.
- **CSRF protection** uses a double-submit cookie checked on every state-changing request.
- **CORS** is limited to the exact frontend origin, with credentials.
- **Company access and roles** are checked on every request from the session, never from the client.

**Limits that remain, stated plainly:**

- **No email is sent.** There is no email provider. Invitation links, and after R-1 reset links, are shown to the Admin, who passes them on by hand.
  - **Consequence:** a user who forgets their password needs an Admin.
  - **To remove this limit:** choose a transactional email provider (D-10), implement `EmailService.send` (the interface already exists), store its API key as a secret and set `JDE_EMAIL_DEV_PREVIEW=false`. Pilot-volume plans are typically free or low-cost; the price is to be quoted when chosen, and it fits within the remaining budget.
- **No MFA or SSO.** Acceptable for a small invite-only pilot. Revisit before customers' own users log in.
- **No login rate limiting** until R-2 is done.
- **Sessions cannot be managed from the UI.** Logout revokes the current session only. An Admin cannot yet revoke all of a user's sessions; deactivating the membership blocks access.
- **Jira tokens are stored in plaintext** until R-3 is done.

## 7. What this deployment does not do

- It does not connect to any customer's JDE. AIS stays in mock mode. Real JDE work (Experiments A and E, `03_JDE_DEV_EXPERIMENT_PLANS.md`) runs from an approved location with DEV access, not from this host.
- It does not add a relational database, worker process, object storage, secret manager or monitoring stack (Stage 6).
- It does not scale beyond one instance or avoid brief deploy downtime.
- It does not migrate to Azure; that remains parked.

## 8. Demonstration that proves completion (once approved)

1. All eight storage acceptance tests (`docs/stage0/02_STORAGE_AUDIT.md` §4) pass against `api.consultiq.nl`. That includes a redeploy with the same disk and a save attempt while the service is stopped.
2. The Stage 1 browser demonstrations (`e2e/stage1/`) pass against the hosted pair with `JADE_E2E_BASE_URL=https://jade.consultiq.nl`, using a throwaway company.
3. The restore drill completes into a fresh service. The time taken is recorded.
4. The anonymous forgot-password response contains no link (R-1 test), and the login limit engages (R-2 test, if in scope).
5. The first invoice or usage page matches §2 within a few dollars.

## 9. Decisions needed from the owner

| # | Decision |
|---|---|
| D-2 | Switch `jade.consultiq.nl` to the real, login-only app, or keep an open mock demo on a separate address |
| D-9 (narrowed) | Implement R-3 token encryption now, or accept plaintext for the pilot without production tokens |
| D-10 | Email provider now, or accept Admin-relayed links for the pilot |
| — | Workspace plan: Hobby (one operator) or Pro (team access) |
| — | Approval to purchase and deploy. **Not given; not assumed.** |

## Sources

Prices and platform behaviour, as found on 23 September 2026. Confirm on `render.com/pricing` before purchase.

- Render persistent disks: USD 0.25/GB/month; encrypted at rest; daily snapshots retained at least 7 days; a service with a disk cannot scale beyond one instance and has no zero-downtime deploys. [Render Docs: Persistent Disks](https://render.com/docs/disks)
- Web service instance prices: Starter USD 7 (512 MB, 0.5 CPU), Standard USD 25 (2 GB, 1 CPU). [srvrlss.io summary of Render pricing, 2026](https://www.srvrlss.io/provider/render/)
- Workspace plans: Hobby free, Pro USD 25 flat, Scale USD 499; Hobby 5 GB and Pro 25 GB bandwidth. [Render changelog: updated plans for workspaces](https://render.com/changelog/updated-plans-for-render-workspaces)
- Repository evidence:
  - backend `render.yaml` and `docs/OPERATIONS.md`;
  - `services/email_service.py` (dev-preview default);
  - `routers/auth.py` `forgot_password` (R-1);
  - `services/auth_service.py` (14-day sessions, bcrypt);
  - the bundled Claude Code CLI in the installed `claude_agent_sdk` package.
