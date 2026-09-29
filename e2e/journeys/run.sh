#!/usr/bin/env bash
# The three main journeys against the real application, from an empty installation:
#   1. the Administrator sets up a customer (admin_setup.py)
#   2+3. a Domain Owner's request goes through the Application Manager to a verified change (story_journey.py)
#   then the backend restarts and everything is still there (restart_check.py).
#
# Only three things are stood in, at their boundary: the customer's AIS server and JD Edwards web client (local
# HTTPS servers serving the backend's test fixtures) and, for journeys 1-3, the language model (scripted answers at
# the Agent SDK boundary). The agents' browser (Chromium) runs for real.
# The restart check runs the real backend. Nothing contacts a real JD Edwards system, and throwaway passwords are
# generated for this run only.
#
#   e2e/journeys/run.sh            (needs: the backend repository next to this one, its virtualenv, npm, playwright)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
FRONTEND=$(cd "$HERE/../.." && pwd)
export JADE_BACKEND_DIR=${JADE_BACKEND_DIR:-$(cd "$FRONTEND/../JDE_change_factory_backend" && pwd)}
PY=${JADE_E2E_PYTHON:-$JADE_BACKEND_DIR/.venv/bin/python}
export JADE_E2E_WORK=${JADE_E2E_WORK:-$(mktemp -d)}
# Ports: override when a local preview already uses the defaults.
API_PORT=${JADE_E2E_API_PORT:-8000}
UI_PORT=${JADE_E2E_UI_PORT:-5173}
export JADE_API_PORT=$API_PORT JADE_E2E_UI=${JADE_E2E_UI:-http://localhost:$UI_PORT}
DATA=$JADE_E2E_WORK/data
mkdir -p "$DATA"
echo "Working folder: $JADE_E2E_WORK"

secret() { "$PY" -c 'import secrets; print(secrets.token_urlsafe(18))'; }
export JADE_E2E_SETUP_PW=$(secret) JADE_E2E_OWNER_PW=$(secret) JADE_E2E_DO_PW=$(secret) JADE_E2E_AM_PW=$(secret)
export JADE_E2E_CNC_PW=$(secret) JADE_E2E_JDE_PW=$(secret) JADE_E2E_WRITE_PW=$(secret)
export JDE_CREDENTIAL_KEY=$("$PY" -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')
export JDE_API_DATA_DIR=$DATA/api JDE_API_ALLOWED_ORIGINS=http://localhost:$UI_PORT JDE_COOKIE_SECURE=false
export JDE_BOOTSTRAP_ADMIN_EMAIL=setup@jade.local JDE_BOOTSTRAP_ADMIN_NAME="Jade setup"
export JDE_BOOTSTRAP_ADMIN_PASSWORD=$JADE_E2E_SETUP_PW JDE_BOOTSTRAP_CUSTOMER_NAME="First customer"
unset JDE_DATABASE_URL JDE_SMTP_HOST 2>/dev/null || true

PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

wait_for() { for _ in $(seq 1 60); do curl -sfk "$1" >/dev/null 2>&1 && return 0; sleep 1; done; echo "$1 did not start"; exit 1; }
start_backend() {  # $1 = model_boundary | real
  [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null && sleep 1
  cd "$JADE_BACKEND_DIR"
  if [ "$1" = model_boundary ]; then "$PY" "$HERE/model_boundary_backend.py" >> "$JADE_E2E_WORK/backend.log" 2>&1 &
  else "$PY" -m uvicorn jde_api_service.main:app --app-dir api_service --port "$API_PORT" >> "$JADE_E2E_WORK/backend.log" 2>&1 &
  fi
  BACKEND_PID=$!; PIDS+=("$BACKEND_PID"); cd - >/dev/null
  wait_for "http://localhost:$API_PORT/health"
}

"$PY" "$HERE/ais_server.py" > "$JADE_E2E_WORK/ais.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 30); do [ -f "$JADE_E2E_WORK/ais_cert.pem" ] && break; sleep 0.5; done
"$PY" "$HERE/web_client_server.py" > "$JADE_E2E_WORK/web_client.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 30); do [ -f "$JADE_E2E_WORK/web_url.txt" ] && break; sleep 0.5; done
if ! curl -sf "http://localhost:$UI_PORT" >/dev/null; then
  (cd "$FRONTEND" && VITE_API_BASE_URL="http://localhost:$API_PORT" npx vite --port "$UI_PORT" --strictPort > "$JADE_E2E_WORK/vite.log" 2>&1) & PIDS+=($!)
  wait_for "http://localhost:$UI_PORT"
fi

start_backend model_boundary
cd "$HERE"
"$PY" admin_setup.py
"$PY" story_journey.py
start_backend real
"$PY" restart_check.py
echo "All journeys passed. Screenshots: $JADE_E2E_WORK/shots"
