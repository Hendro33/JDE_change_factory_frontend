"""What a person does in JD Edwards DEV: set a processing option on the AIS stand-in.
    python3 dev_apply.py P4210 CIQ0001 PDOCTYPE SO"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.environ.get("JADE_BACKEND_DIR", os.path.join(HERE, "../../../JDE_change_factory_backend"))
WORK = os.environ.get("JADE_E2E_WORK", os.path.join(HERE, ".work"))
os.environ.setdefault("JDE_SIM_ESTATE_DIR", os.path.join(WORK, "ais_state"))
sys.path.insert(0, os.path.join(BACKEND, "api_service"))
from tests.fixtures.fake_ais import apply_in_dev  # noqa: E402

app, version, option, value = sys.argv[1:5]
apply_in_dev(os.environ.get("AIS_COMPANY", "acme"), app, version, option, value)
print(f"DEV: {app}|{version} {option} = {value}")
