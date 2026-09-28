"""A local HTTPS stand-in for a customer's AIS server, for the journey walkthrough only.

It serves the backend's test fixture (api_service/tests/fixtures/fake_ais.py) over real TLS on
127.0.0.1:<port>, with a self-signed certificate written next to it, so Jade's real connection code --
certificate pinning, sign-in, reads, orchestrations -- runs unchanged. It never contacts a real JDE."""
import datetime, ipaddress, json, os, ssl, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BACKEND = os.environ.get("JADE_BACKEND_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../JDE_change_factory_backend"))
sys.path.insert(0, os.path.join(BACKEND, "api_service"))
import httpx
from tests.fixtures.fake_ais import FakeAis

HERE = os.environ.get("JADE_E2E_WORK", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".work"))
os.makedirs(HERE, exist_ok=True)
os.environ.setdefault("JDE_SIM_ESTATE_DIR", os.path.join(HERE, "ais_state"))
COMPANY = os.environ.get("AIS_COMPANY", "acme")
PORT = int(os.environ.get("AIS_PORT", "7443"))


class Fake(FakeAis):
    def _company(self, request):
        return COMPANY


fake = Fake()
fake.orchestrations["ORCH_SO"] = lambda payload: (200, {"salesOrder": "10077", "orderType": "SO"})


def cert():
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "walkthrough-ais")])
    now = datetime.datetime.now(datetime.timezone.utc)
    c = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
         .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(days=1))
         .not_valid_after(now + datetime.timedelta(days=30))
         .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
         .add_extension(x509.KeyUsage(True, False, False, False, False, True, True, False, False), critical=True)
         .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
         .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
         .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(key.public_key()), critical=False)
         .sign(key, hashes.SHA256()))
    cp, kp = os.path.join(HERE, "ais_cert.pem"), os.path.join(HERE, "ais_key.pem")
    open(cp, "wb").write(c.public_bytes(serialization.Encoding.PEM))
    open(kp, "wb").write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                           serialization.NoEncryption()))
    return cp, kp


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _do(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        req = httpx.Request(self.command, f"https://127.0.0.1:{PORT}{self.path}", headers=dict(self.headers), content=body)
        try:
            resp = fake.handle(req)
        except httpx.HTTPError as exc:
            self.send_response(503); self.end_headers(); return
        data = resp.content
        self.send_response(resp.status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        with open(os.path.join(HERE, "ais_calls.log"), "a") as f:
            f.write(f"{self.command} {self.path} -> {resp.status_code}\n")

    do_GET = do_POST = _do


cp, kp = cert()
srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(cp, kp)
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
print(f"fake AIS on https://127.0.0.1:{PORT}", flush=True)
srv.serve_forever()
