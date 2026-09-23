# Architect Environment Discovery — browser demonstrations

These scripts drive the real frontend against a real local backend, using throwaway data. JDE discovery runs in **simulation** mode: the backend's labelled, simulated AIS endpoint. No customer JD Edwards system is contacted, and nothing is written anywhere in JDE.

| Script | What it shows |
|---|---|
| `discovery_admin.py` | <ul><li>Admin > Integrations > JDE: a profile is saved as revision 1, labelled SIMULATION.</li><li>Saving contacts nothing.</li><li>Enable is refused, with reasons, until the checks pass.</li><li>The credential is masked, and the password never comes back to the page.</li><li>Test Connection, the approved sample reads and Enable Discovery.</li><li>Four health states, with the unavailable capabilities stated.</li><li>Sanitised activity.</li><li>ERP Landscape and the Integrations summary point at the profile instead of copying it.</li></ul> |
| `discovery_evidence.py` | <ul><li>The Architect design screen shows the environment investigated, what was read (observation ids and times), citations marked observed or assumption, and a missing source file as a gap with a question.</li><li>Refresh Evidence creates baseline 2 and keeps baseline 1.</li><li>The activity view links each read to its story and run.</li></ul> |

## Run

Keep both passwords local to your shell. Never commit them.

```bash
export JADE_E2E_PASSWORD='<choose one locally>'
export JADE_E2E_DISCOVERY_PASSWORD='<any throwaway value; the simulation accepts it>'
DATA=$(mktemp -d)
export JDE_API_DATA_DIR=$DATA/api JDE_BACKLOG_DIR=$DATA/backlog JDE_CHANGE_DIR=$DATA/changes JDE_EVIDENCE_DIR=$DATA/evidence
export JDE_CREDENTIAL_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

# 1. Backend (backend repo)
JDE_API_ALLOWED_ORIGINS=http://localhost:5173 JDE_COOKIE_SECURE=false \
JDE_BOOTSTRAP_ADMIN_EMAIL=admin@e2e.local JDE_BOOTSTRAP_ADMIN_NAME="E2E Admin" \
JDE_BOOTSTRAP_ADMIN_PASSWORD="$JADE_E2E_PASSWORD" \
uvicorn jde_api_service.main:app --app-dir api_service --port 8000 &
python3 scripts/seed_demo_pending_change.py bwm

# 2. Frontend (this repo), real-backend mode
VITE_USE_MOCK_API=false VITE_API_BASE_URL=http://localhost:8000 npx vite --port 5173 &

# 3. Demonstrations
python3 e2e/discovery/discovery_admin.py
# The design: a scripted stand-in calls the governed discovery tools (not a model run)
(cd ../jde_change_factory_backend && python3 scripts/seed_demo_design_evidence.py bwm)
python3 e2e/discovery/discovery_evidence.py
```

Screenshots go to `e2e/discovery/shots/`, which is gitignored. Use a fresh data directory for each run.
