"""A local HTTPS stand-in for a customer's JD Edwards web client, for the journey walkthrough only.

It serves the backend's test fixture (api_service/tests/fixtures/fake_web_client.py) over real TLS on 127.0.0.1
with its own self-signed certificate, and shares the DEV state of the AIS stand-in (ais_server.py), so a
processing option the agent saves in the web client is what AIS reads back. Jade's real browser executor --
Chromium, the certificate pin, the host guard, Jade's own sign-in, the screenshots -- runs unchanged. It never
contacts a real JDE. It writes the certificate and the address to the work folder (web_cert.pem, web_url.txt)."""
import datetime, ipaddress, os, sys, time

BACKEND = os.environ.get("JADE_BACKEND_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../JDE_change_factory_backend"))
sys.path.insert(0, os.path.join(BACKEND, "api_service"))
HERE = os.environ.get("JADE_E2E_WORK", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".work"))
os.makedirs(HERE, exist_ok=True)
os.environ.setdefault("JDE_SIM_ESTATE_DIR", os.path.join(HERE, "ais_state"))
from tests.fixtures.fake_web_client import FakeWebClient  # noqa: E402


def cert():
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "walkthrough-web-client")])
    now = datetime.datetime.now(datetime.timezone.utc)
    c = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
         .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(days=1))
         .not_valid_after(now + datetime.timedelta(days=30))
         .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
         .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
         .sign(key, hashes.SHA256()))
    cp, kp = os.path.join(HERE, "web_cert.pem"), os.path.join(HERE, "web_key.pem")
    open(kp, "wb").write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                           serialization.NoEncryption()))
    open(cp, "wb").write(c.public_bytes(serialization.Encoding.PEM))
    return cp, kp


cp, kp = cert()
web = FakeWebClient(cp, kp, company=os.environ.get("AIS_COMPANY", "acme"), environment="JDV920",
                    username="JADEWRITE", password=os.environ["JADE_E2E_WRITE_PW"])
open(os.path.join(HERE, "web_url.txt"), "w").write(web.url)
print(f"fake JD Edwards web client on {web.url}", flush=True)
while True:
    time.sleep(3600)
