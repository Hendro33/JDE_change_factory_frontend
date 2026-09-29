"""What a person does in JD Edwards DEV, on the AIS stand-in:
    python3 dev_apply.py P4210 CIQ0001 PDOCTYPE SO             set a processing option
    python3 dev_apply.py row F0005 DRSY=00,DRRT=DT,DRKY=SW DRDL01="Sales Order - Webshop"
                                                               add or update a configuration row"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.environ.get("JADE_BACKEND_DIR", os.path.join(HERE, "../../../JDE_change_factory_backend"))
WORK = os.environ.get("JADE_E2E_WORK", os.path.join(HERE, ".work"))
os.environ.setdefault("JDE_SIM_ESTATE_DIR", os.path.join(WORK, "ais_state"))
sys.path.insert(0, os.path.join(BACKEND, "api_service"))
from tests.fixtures.fake_ais import apply_in_dev, apply_row_in_dev  # noqa: E402

company = os.environ.get("AIS_COMPANY", "acme")


def pairs(text):
    return dict(p.split("=", 1) for p in text.split(",") if p)


if sys.argv[1] == "row":
    table, key, values = sys.argv[2], pairs(sys.argv[3]), pairs(sys.argv[4])
    apply_row_in_dev(company, table, key, values)
    print(f"DEV: {table} {key} {values}")
else:
    app, version, option, value = sys.argv[1:5]
    apply_in_dev(company, app, version, option, value)
    print(f"DEV: {app}|{version} {option} = {value}")
