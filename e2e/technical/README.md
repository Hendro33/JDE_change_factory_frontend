# Technical Work — browser demonstration

`technical_work.py` drives the real frontend against a real local backend with throwaway data. Everything runs against the backend's **simulated** DEV estate, on a **synthetic** customer-owned event-rule object (`jade_sim_er`, a simulation format, not a JD Edwards export). No JDE is contacted, and nothing is written to any JDE.

The design and package revision 1 are prepared by `scripts/seed_demo_technical.py` in the backend repo. Scripted stand-ins play the Architect and the Technical Agent, through the same governed code the real agents use; this is **not a model run**. The real-model run is recorded separately, in the backend's `docs/proof/technical_agent_run/`.

What the demonstration checks:
- The SIMULATION and synthetic-format labels are shown.
- The design, its baseline and the design approval are shown.
- The package shows objects, provenance, toolchain, the unavailable live adapter and the exact diff.
- Generated source is never shown as an implemented change.
- Exact approval makes the revision eligible to apply (simulation only). Apply and build are separate milestones.
- Verification is refused until the CNC activation is recorded, and only a CNC operator can record it.
- Positive, negative and neighbouring tests pass against the active simulated runtime.

## Run

Keep the passwords local to your shell. Never commit them.

```bash
export JADE_E2E_PASSWORD='<choose one locally>'        # throwaway e2e admin
export JADE_E2E_CNC_PASSWORD='<choose another locally>' # throwaway CNC operator
DATA=$(mktemp -d)
export JDE_API_DATA_DIR=$DATA/api JDE_BACKLOG_DIR=$DATA/backlog JDE_CHANGE_DIR=$DATA/changes JDE_EVIDENCE_DIR=$DATA/evidence
export JDE_CREDENTIAL_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

# 1. Backend (backend repo)
JDE_API_ALLOWED_ORIGINS=http://localhost:5173 JDE_COOKIE_SECURE=false \
JDE_BOOTSTRAP_ADMIN_EMAIL=admin@e2e.local JDE_BOOTSTRAP_ADMIN_NAME="E2E Admin" \
JDE_BOOTSTRAP_ADMIN_PASSWORD="$JADE_E2E_PASSWORD" \
uvicorn jde_api_service.main:app --app-dir api_service --port 8000 &
python3 scripts/seed_demo_technical.py bwm

# 2. Frontend (this repo), real-backend mode
VITE_USE_MOCK_API=false VITE_API_BASE_URL=http://localhost:8000 npx vite --port 5173 &

# 3. Demonstration
python3 e2e/technical/technical_work.py
```

Screenshots go to `e2e/technical/shots/`, which is gitignored.
