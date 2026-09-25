# Stage 1 browser demonstrations

These two scripts are the completion demonstrations for increments S1-1 and S1-2. They drive the real frontend against a real local backend that uses throwaway data. JD Edwards stays in mock mode, so nothing is ever written to JDE.

| Script | Increment | What it proves |
|---|---|---|
| `s1_1_saved_setup.py` | S1-1 Saved setup and user identity | <ul><li>Thresholds live on the server: a second browser sees them, and a value an older build left in the browser is previewed and imported once.</li><li>A stale engagement-scope save is refused with a visible message, and the edits already typed are kept.</li><li>A stale business-domain status change is refused.</li><li>No typed "Your name" field remains, and no client-supplied `updatedBy` is sent.</li></ul> |
| `s1_2_execution_safeguards.py` | S1-2 Execution safeguards | <ul><li>With no approval policy, the exact-change approval is refused with the reason shown.</li><li>An Admin sets the policy and DEV binding on the ERP / JDE Landscape screen.</li><li>The same approval then succeeds, recorded under the signed-in name.</li></ul> |

The rest of S1-2 has no UI of its own and is proven by backend tests and `prove_the_gate.py` in the backend repository: per-company scope, expiring windows, and restart recovery.

## Run

Choose a local password and keep it in your shell only. Never commit it.

```bash
export JADE_E2E_PASSWORD='<choose one locally>'
DATA=$(mktemp -d)

# 1. Backend (from the backend repo), throwaway data
cd jde_change_factory_backend
JDE_API_DATA_DIR=$DATA/api JDE_BACKLOG_DIR=$DATA/backlog JDE_CHANGE_DIR=$DATA/changes \
JDE_EVIDENCE_DIR=$DATA/evidence JDE_API_ALLOWED_ORIGINS=http://localhost:5173 JDE_COOKIE_SECURE=false \
JDE_BOOTSTRAP_ADMIN_EMAIL=admin@e2e.local JDE_BOOTSTRAP_ADMIN_NAME="E2E Admin" \
JDE_BOOTSTRAP_ADMIN_PASSWORD="$JADE_E2E_PASSWORD" \
uvicorn jde_api_service.main:app --app-dir api_service --port 8000 &

# 2. One pending exact change for the S1-2 demo (same data directories)
JDE_API_DATA_DIR=$DATA/api JDE_BACKLOG_DIR=$DATA/backlog JDE_CHANGE_DIR=$DATA/changes \
JDE_EVIDENCE_DIR=$DATA/evidence python3 scripts/seed_demo_pending_change.py bwm

# 3. Frontend (from this repo), real-backend mode
VITE_USE_MOCK_API=false VITE_API_BASE_URL=http://localhost:8000 npx vite --port 5173 &

# 4. Demonstrations (pip install playwright; set JADE_E2E_CHROMIUM to a Chromium binary if needed)
python3 e2e/stage1/s1_1_saved_setup.py
python3 e2e/stage1/s1_2_execution_safeguards.py
```

Each script prints one PASS/FAIL line per check and exits non-zero on any failure. Screenshots go to `e2e/stage1/shots/`, which is gitignored.

Run each script once against fresh data. They change what they check, for example by saving a policy, so running one again needs a new data directory.
