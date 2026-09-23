"""S1-1 demonstration: saved setup and user identity (see README.md)."""
import os
import sys

from playwright.sync_api import expect, sync_playwright

# Never hard-code a password here: pass it in the environment.
PW = os.environ["JADE_E2E_PASSWORD"]
EMAIL = os.environ.get("JADE_E2E_EMAIL", "admin@e2e.local")
ADMIN_NAME = os.environ.get("JADE_E2E_ADMIN_NAME", "E2E Admin")
BASE = os.environ.get("JADE_E2E_BASE_URL", "http://localhost:5173")
CHROMIUM = os.environ.get("JADE_E2E_CHROMIUM") or None
SHOTS = os.environ.get("JADE_E2E_SHOTS", os.path.join(os.path.dirname(__file__), "shots"))
os.makedirs(SHOTS, exist_ok=True)
results = []



def check(name, cond):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)


def login(page):
    page.goto(BASE)
    page.fill("#loginEmail", EMAIL)
    page.fill("#loginPassword", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("text=Jade Dashboard", timeout=15000)


def admin(page, label):
    page.click("button:has-text('Admin')")
    page.click(f".navgroup >> text={label}")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM)
    a = browser.new_context().new_page()
    b = browser.new_context().new_page()
    sent_bodies = []
    a.on("request", lambda r: sent_bodies.append(r.post_data or "") if r.method == "PUT" else None)

    # --- Thresholds: legacy browser value, previewed and imported once -----
    a.goto(BASE)
    a.evaluate("localStorage.setItem('jade_dashboard_thresholds', JSON.stringify({warnAt: 3, criticalAt: 7}))")
    login(a)
    admin(a, "Customer Setup")
    expect(a.locator("text=Thresholds found in this browser")).to_be_visible()
    check("legacy browser thresholds are previewed, not auto-applied", a.input_value("#warnAt") == "10")
    a.click("text=Import these values")
    expect(a.locator(f"text=by {ADMIN_NAME}")).to_be_visible()
    check("import saved on server under signed-in name", a.input_value("#warnAt") == "3")
    check("legacy key cleared after import", a.evaluate("localStorage.getItem('jade_dashboard_thresholds')") is None)
    a.screenshot(path=f"{SHOTS}/1-thresholds-imported.png", full_page=True)

    # A second browser (no local value) sees the company-wide setting.
    login(b)
    admin(b, "Customer Setup")
    expect(b.locator("#warnAt")).to_have_value("3")
    check("second browser sees the same server-saved thresholds", True)
    check("no import prompt when nothing local", b.locator("text=Thresholds found in this browser").count() == 0)

    # --- Engagement scope: concurrent edit is refused, not overwritten -----
    admin(a, "ERP / JDE Landscape")
    a.click("button:has-text('Edit')")
    check("no typed 'Your name' field", a.locator("#updatedBy").count() == 0)
    a.fill("#toolsRelease", "9.2.8.A")

    admin(b, "ERP / JDE Landscape")
    b.click("button:has-text('Edit')")
    b.fill("#toolsRelease", "9.2.9.B")
    b.click("text=Save engagement scope")
    expect(b.locator(f"text=by {ADMIN_NAME}")).to_be_visible()

    a.click("text=Save engagement scope")
    expect(a.locator("text=Someone else saved this")).to_be_visible()
    check("stale save shows a visible conflict message", True)
    check("typed edits kept after the conflict", a.input_value("#toolsRelease") == "9.2.8.A")
    a.screenshot(path=f"{SHOTS}/2-scope-conflict.png", full_page=True)
    a.click("text=Discard my edits and reload")
    expect(a.locator(f"text=by {ADMIN_NAME}")).to_be_visible()
    a.click("button:has-text('Edit')")
    check("the other user's save survived", a.input_value("#toolsRelease") == "9.2.9.B")
    a.click("button:has-text('Cancel')")
    check("no client updatedBy sent", not any("updatedBy" in body for body in sent_bodies))

    # --- Business domain status: stale change is refused visibly -----------
    admin(a, "Business Domains")
    admin(b, "Business Domains")
    rows_a = a.locator("table.data tbody tr")
    if rows_a.count() == 0:
        print("no business domains seeded for this company; skipping domain conflict")
    else:
        b.locator("table.data tbody tr").first.locator("select").select_option("proposed")
        b.wait_for_timeout(800)
        rows_a.first.locator("select").select_option("retired")
        expect(a.locator("text=Not saved")).to_be_visible()
        check("stale domain status change refused visibly", True)
        a.screenshot(path=f"{SHOTS}/3-domain-conflict.png", full_page=True)
        expect(rows_a.first.locator("select")).to_have_value("proposed")
        check("selector falls back to the stored value", True)

    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
