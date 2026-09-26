"""AI connection, Start-up Packs and request documents through the running app.

  phase "setup":  as the customer Admin, in a new (non-demo) customer: show
                  agents blocked without configuration; configure the AI
                  connection; add a Knowledge Library document; copy, edit,
                  publish and assign a Start-up Pack; create a request with a
                  synthetic PDF; refine it; check citations, run records and
                  the blocking cases (forbidden tool, disabled pack, revoked key).
  phase "verify": after a backend restart, in a NEW browser: everything is
                  still there, and another customer cannot see it.

The backend runs with JADE_AI_TEST_PROVIDER_URL pointing at
scripts/fake_anthropic_provider.py (backend repository): the real backend and
the real Claude Code CLI run; the MODEL is a scripted fake on 127.0.0.1. This
is not evidence about Anthropic's API -- that is a separate, approved test.
"""
import json
import os
import sys
import tempfile

from playwright.sync_api import expect, sync_playwright

PW = os.environ["JADE_E2E_PASSWORD"]
KEY = os.environ.get("JADE_E2E_SYNTHETIC_AI_KEY", "sk-ant-api03-SYNTHETIC-DEMO-KEY-not-real-000000")  # never a real key
BASE = os.environ.get("JADE_E2E_BASE_URL", "http://localhost:5173")
API = os.environ.get("JADE_E2E_API_URL", "http://localhost:8000")
SHOTS = os.environ.get("JADE_E2E_SHOTS", os.path.join(os.path.dirname(__file__), "shots"))
CUSTOMER = "Synthetic Parts BV"
PHASE = sys.argv[1] if len(sys.argv) > 1 else "setup"
os.makedirs(SHOTS, exist_ok=True)
STATE = os.path.join(SHOTS, "state.json")
results = []


def check(name, cond):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name, flush=True)


def nav(page, group, label):
    page.click(f"button:has-text('{group}')")
    page.click(f".navgroup >> text={label}")
    page.wait_for_timeout(900)


def shot(page, name):
    page.screenshot(path=f"{SHOTS}/{name}.png", full_page=True)


def synthetic_pdf() -> bytes:
    """Two pages of synthetic text (a minimal, valid PDF)."""
    pages = ["SYNTHETIC delivery standard, page one: orders ship within two working days.",
             "SYNTHETIC delivery standard, page two: public holidays are not working days."]
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>",
            f"<< /Type /Pages /Kids [{' '.join(f'{4 + 2 * i} 0 R' for i in range(len(pages)))}] /Count {len(pages)} >>".encode(),
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    for i, t in enumerate(pages):
        stream = f"BT /F1 11 Tf 50 720 Td ({t}) Tj ET".encode()
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> "
                    f"/Contents {5 + 2 * i} 0 R >>".encode())
        objs.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    out, offs = bytearray(b"%PDF-1.4\n"), []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    x = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offs)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n".encode()
    return bytes(out)


def api(page, method, path, body=None, customer=None):
    """A request from the signed-in page itself (session cookie + CSRF), for the checks a person cannot click."""
    return page.evaluate("""async ([api, method, path, body, customer]) => {
        const csrf = (document.cookie.match(/(?:^|; )jde_csrf=([^;]*)/) || [])[1];
        const h = {"Content-Type": "application/json", "X-Customer-Id": customer};
        if (csrf) h["X-CSRF-Token"] = decodeURIComponent(csrf);
        const r = await fetch(api + path, {method, headers: h, credentials: "include",
                                           body: body === null ? undefined : JSON.stringify(body)});
        return {status: r.status, body: await r.text()};
    }""", [API, method, path, body, customer])


def active_customer_id(page):
    return page.evaluate("""async (api) => (await (await fetch(api + '/session', {credentials: 'include'})).json())""", API)


def switch_customer(page, name):
    if page.locator(f".cscope >> text={name}").count():
        return
    page.click(".cscope-btn")
    page.click(f".cscope-menu >> text={name}")
    page.wait_for_selector(f".cscope >> text={name}")


def open_request(page, title):
    nav(page, "Demand", "User Stories")
    page.click(f"text={title}")
    page.wait_for_timeout(800)


def create_request(page, title, files=()):
    nav(page, "Demand", "Create Request")
    page.fill("#t", title)
    page.fill("#req", "SYNTHETIC: the promised delivery date is wrong. See the attached standard.")
    if files:
        page.set_input_files("input[aria-label='Add documents']", list(files))
        page.wait_for_selector("[data-testid='draft-documents'] >> text=Ready", timeout=30000)
    shot(page, f"req-{title[:12].replace(' ', '_')}")
    page.click("button:has-text('Create story')")
    page.wait_for_timeout(1500)


def enhance_and_wait(page, timeout_s=240):
    page.click("button:has-text('Enhance story')")
    for _ in range(timeout_s):
        page.wait_for_timeout(1000)
        if page.locator("text=Not started").count() or page.locator("text=Enhancement failed").count() \
                or page.locator("text=Enhanced story").count() or page.locator("[data-testid='document-citations']").count():
            break


def run_phase(page):
    if PHASE == "setup":
        tmp = tempfile.mkdtemp()
        pdf = os.path.join(tmp, "delivery-standard.pdf")
        open(pdf, "wb").write(synthetic_pdf())
        lib = os.path.join(tmp, "holiday-calendar.txt")
        open(lib, "w").write("SYNTHETIC holiday calendar\nChristmas Day and New Year's Day are not working days.\n")

        nav(page, "Admin", "Customer Setup")
        page.click("button:has-text('New customer')")
        page.get_by_label("New customer name", exact=True).fill(CUSTOMER)
        page.get_by_label("New customer Tools Release").fill("9.2.8")
        page.get_by_label("New customer JDE environment").fill("JDV920")
        page.click("button:has-text('Create customer')")
        page.wait_for_selector(f".cscope >> text={CUSTOMER}")
        cid = next(c["id"] for c in active_customer_id(page)["customers"] if c["name"] == CUSTOMER)

        # 1. Nothing configured: agents are blocked, and say why.
        nav(page, "Admin", "Agent Configuration")
        row = page.locator("tr[data-role='improve-agent']").first
        check("without configuration the Improve Agent is 'not configured' with the reason",
              "not configured" in row.inner_text() and "no AI connection" in row.inner_text())
        shot(page, "01-health-unconfigured")
        create_request(page, "Blocked request", [pdf])
        open_request(page, "Blocked request")
        enhance_and_wait(page, 10)
        check("refining without an AI connection is refused and explained",
              page.locator("text=Not started").count() == 1 and page.locator("text=no AI connection").count() >= 1)
        shot(page, "02-blocked-no-connection")

        # 2. AI connection (saving never contacts the provider; the test is explicit).
        nav(page, "Admin", "AI Connections")
        check("the page says a company key is used and no personal AI account is needed",
              page.locator("text=Individual Jade users never need an AI account").count() == 1)
        page.select_option("#ai-model", "claude-sonnet-5")
        page.check("input[name='ai-policy'] >> nth=1")  # permitted content
        page.select_option("select[aria-label='Model for Verification']", "claude-haiku-4-5")
        page.click("button:has-text('Save settings')")
        expect(page.locator("text=Settings saved.")).to_be_visible()
        page.fill("#ai-key", KEY)
        page.click("button:has-text('Save key')")
        expect(page.locator("text=API key stored.")).to_be_visible()
        check("the key is never shown again, only its last four characters",
              KEY not in page.content() and f"(ends …{KEY[-4:]})" in page.content())
        page.click("button:has-text('Test connection…')")
        check("the test explains that it is billable before anything is sent",
              page.locator("text=billed to this API key").count() == 1)
        page.click("button:has-text('Send the billable test')")
        page.wait_for_selector("text=Connection works", timeout=30000)
        check("the connection test passes (against the loopback test provider, which the page says)",
              page.locator("text=Test provider active").count() == 1)
        shot(page, "03-ai-connection")

        # 3. Knowledge Library.
        nav(page, "Admin", "Knowledge Library")
        page.fill("#kl-title", "Holiday calendar")
        page.set_input_files("input[aria-label='Document file']", lib)
        page.click("button:has-text('Add to library')")
        page.wait_for_selector("text=readable by agents")
        shot(page, "04-knowledge-library")

        # 4. Start-up Pack: copy the Jade standard Improve Agent, add a skill and knowledge, publish, assign.
        nav(page, "Admin", "Agent Configuration")
        page.once("dialog", lambda d: d.accept("Synthetic Parts improve"))
        page.locator("tr:has-text('Jade standard -- Improve Agent') >> button:has-text('Copy')").click()
        page.wait_for_selector("[data-testid='pack-editor']")
        page.click("button:has-text('Add skill')")
        page.fill("input[aria-label='Skill name']", "Delivery vocabulary")
        page.fill("textarea[aria-label='Skill text']", "Say 'promised date', never 'ETA'.")
        page.check("[data-testid='pack-editor'] >> text=Holiday calendar")
        page.fill("[data-testid='pack-editor'] input[placeholder='What changed and why']", "Customer vocabulary and calendar")
        page.click("button:has-text('Save draft')")
        page.wait_for_timeout(1000)
        page.locator("tr:has-text('Synthetic Parts improve') >> button:has-text('Publish')").click()
        page.wait_for_selector("text=published.")
        packs = json.loads(api(page, "GET", "/admin/ai/packs", None, cid)["body"])
        mine = next(p for p in packs["packs"] if p["name"] == "Synthetic Parts improve")
        for role, value in (("receive-agent", "tpl-receive-agent@1"), ("check-agent", "tpl-check-agent@1"),
                            ("improve-agent", f"{mine['packId']}@1")):
            page.select_option(f"tr[data-role='{role}'] select", value)
            page.locator(f"tr[data-role='{role}'] >> button:has-text('Assign')").click()
            page.wait_for_timeout(900)
        check("the three refinement agents have published packs assigned",
              all(page.locator(f"tr[data-role='{r}'] >> text=none — this agent cannot run").count() == 0
                  for r in ("receive-agent", "improve-agent", "check-agent")))
        r = api(page, "PUT", f"/admin/ai/packs/{mine['packId']}/draft",
                {"content": {**json.loads(api(page, "GET", f"/admin/ai/packs/{mine['packId']}/revisions/1", None, cid)["body"])["content"],
                             "capabilities": ["Bash"]}}, cid)
        check("a pack cannot request a tool outside the reviewed policy (Bash refused)",
              r["status"] == 422 and "not allowed" in r["body"])
        shot(page, "05-agent-configuration")

        # 5. A request with a document, refined with the published pack.
        create_request(page, "Delivery date rule", [pdf])
        open_request(page, "Delivery date rule")
        check("the request shows its document, ready, with checksum",
              page.locator("[data-testid='request-documents'] >> text=delivery-standard.pdf").count() == 1
              and page.locator("[data-testid='request-documents'] >> text=sha256").count() >= 1)
        enhance_and_wait(page)
        page.wait_for_timeout(1500)
        cites = page.locator("[data-testid='document-citations']")
        check("the refined story cites the document by page, verified by Jade",
              cites.count() >= 1 and "[delivery-standard.pdf, page 2]" in cites.first.inner_text()
              and "Verified source" in cites.first.inner_text())
        shot(page, "06-refined-with-citations")

        nav(page, "Admin", "Agent Configuration")
        runs = json.loads(api(page, "GET", "/admin/ai/runs", None, cid)["body"])
        done = next((x for x in runs if x["status"] == "completed"), None)
        check("the run record shows configured and reported model, key source, pack revision and documents read",
              done is not None and done["configured_model"] == "claude-sonnet-5"
              and (done["reported_model"] or "").startswith("claude-sonnet-5")
              and done["credential_source"] == "ANTHROPIC_API_KEY"
              and any(pk["role"] == "improve-agent" and pk["revision"] == 1 for pk in done["packs"])
              and any(k.get("action") == "read" for k in done["knowledge"]))
        check("each agent ran on its activity's model (Verification override) and the run names its context package",
              done is not None and done["models"].get("check-agent") == "claude-haiku-4-5"
              and done["models"].get("improve-agent") == "claude-sonnet-5"
              and done["context"] and done["context"][0]["version"] >= 1 and done["runtime"].startswith("claude-agent-sdk"))
        check("the run is marked as a TEST PROVIDER run, not real evidence",
              done is not None and done["provider"] == "anthropic-test-provider"
              and page.locator("tr[data-role='improve-agent'] >> text=none yet").count() == 1)
        shot(page, "07-runs")

        # 6. Blocking cases: a disabled pack, then a revoked key.
        page.locator("tr:has-text('Synthetic Parts improve') >> button:has-text('Disable')").click()
        page.wait_for_timeout(900)
        create_request(page, "Second request")
        open_request(page, "Second request")
        enhance_and_wait(page, 10)
        check("a disabled pack blocks the agent with the reason",
              page.locator("text=Not started").count() == 1 and page.locator("text=is disabled").count() >= 1)
        nav(page, "Admin", "Agent Configuration")
        page.locator("tr:has-text('Synthetic Parts improve') >> button:has-text('Enable')").click()
        page.wait_for_timeout(900)
        nav(page, "Admin", "AI Connections")
        page.click("button:has-text('Revoke key')")
        page.click(".modal button:has-text('Revoke')")
        page.wait_for_selector("text=API key revoked")
        open_request(page, "Second request")
        enhance_and_wait(page, 10)
        check("a revoked key blocks the agents with the reason",
              page.locator("text=Not started").count() == 1 and page.locator("text=revoked").count() >= 1)
        shot(page, "08-blocked-revoked")
        nav(page, "Admin", "AI Connections")
        page.fill("#ai-key", KEY)
        page.click("button:has-text('Save key')")
        expect(page.locator("text=API key stored.")).to_be_visible()
        json.dump({"customer_id": cid}, open(STATE, "w"))

    else:
        cid = json.load(open(STATE))["customer_id"]
        switch_customer(page, CUSTOMER)
        nav(page, "Admin", "AI Connections")
        check("after a restart, in a new browser: the AI connection and its stored key are still there",
              page.locator("text=Configured and connection tested").count() == 1
              or page.locator("text=Configured — connection not tested yet").count() == 1)
        check("the key is still write-only", KEY not in page.content())
        check("the Verification model override survived",
              page.locator("select[aria-label='Model for Verification']").input_value() == "claude-haiku-4-5")
        nav(page, "Admin", "Agent Configuration")
        check("the pack assignment survived the restart",
              "Synthetic Parts improve" in page.locator("tr[data-role='improve-agent']").nth(1).inner_text())
        nav(page, "Admin", "Knowledge Library")
        check("the Knowledge Library document survived", page.locator("text=Holiday calendar").count() >= 1)
        open_request(page, "Delivery date rule")
        check("the request's document and the citations survived",
              page.locator("[data-testid='request-documents'] >> text=delivery-standard.pdf").count() == 1
              and page.locator("[data-testid='document-citations'] >> text=Verified source").count() >= 1)
        with page.expect_download() as dl:
            page.locator("[data-testid='request-documents'] >> button:has-text('Download')").first.click()
        check("the original can be downloaded unchanged", open(dl.value.path(), "rb").read() == synthetic_pdf())
        shot(page, "09-after-restart")
        # Another customer cannot reach this customer's request or documents.
        req_id = next(c["id"] for c in json.loads(api(page, "GET", "/changes", None, cid)["body"])
                      if c["title"] == "Delivery date rule")
        other = next(c["id"] for c in active_customer_id(page)["customers"] if c["id"] != cid)
        r = api(page, "GET", f"/change-requests/{req_id}/attachments", None, other)
        check("under another customer the request's documents do not exist (404)", r["status"] == 404)
        r = api(page, "GET", "/admin/ai/connection", None, other)
        check("another customer's AI connection is separate (not configured there)",
              r["status"] == 200 and json.loads(r["body"])["configured"] is False)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("JADE_E2E_CHROMIUM") or None)
    page = browser.new_context(viewport={"width": 1400, "height": 1000}, accept_downloads=True).new_page()
    page.goto(BASE)
    page.fill("#loginEmail", "admin@e2e.local")
    page.fill("#loginPassword", PW)
    page.click("button[type=submit]")
    page.wait_for_selector(".cscope")

    try:
        run_phase(page)
    except Exception:
        shot(page, "zz-failure")
        raise
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
