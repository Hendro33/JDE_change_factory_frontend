"""S1-2 demonstration: approval authority from the company policy (see README.md)."""
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


def nav(page, group, label):
    page.click(f"button:has-text('{group}')")
    page.click(f".navgroup >> text={label}")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM)
    page = browser.new_context(viewport={"width": 1280, "height": 900}).new_page()
    page.goto(BASE)
    page.fill("#loginEmail", EMAIL)
    page.fill("#loginPassword", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("text=Jade Dashboard")

    # 1. No approval policy yet: the ERP screen says so.
    nav(page, "Admin", "ERP / JDE Landscape")
    expect(page.locator("text=Nobody can approve an exact change for this company")).to_be_visible()
    check("missing policy is shown as 'nobody can approve'", True)

    # 2. Approving the pending exact change is refused, visibly.
    nav(page, "Governance", "Architecture Review")
    page.click("text=S12-DEMO-1")
    page.click("button:has-text('Approve exact change')")
    page.locator(".modal button:has-text('Approve exact change'), [role=dialog] button:has-text('Approve exact change')").last.click()
    expect(page.locator("text=has no approval policy")).to_be_visible()
    check("approval refused without a policy, with a visible reason", True)
    page.screenshot(path=f"{SHOTS}/4-approval-refused-no-policy.png", full_page=True)

    # 3. Admin sets the policy (Product Manager, 8 hours) and the DEV binding.
    nav(page, "Admin", "ERP / JDE Landscape")
    page.click("button:has-text('Edit')")
    page.check("label:has-text('Product Manager') input[type=checkbox]")
    page.fill("#policyHours", "8")
    page.fill("#devEnvironmentId", "JDV920")
    page.fill("#devPathCode", "DV920")
    page.click("text=Save engagement scope")
    expect(page.locator("text=Exact changes may be approved by: Product Manager")).to_be_visible()
    check("policy saved and shown", True)
    check("isolation stays unconfirmed until ticked", page.locator("text=Not confirmed").count() == 1)

    # 4. The same approval now succeeds, recorded under the signed-in name.
    nav(page, "Governance", "Architecture Review")
    page.click("text=S12-DEMO-1")
    page.click("button:has-text('Approve exact change')")
    page.locator(".modal button:has-text('Approve exact change'), [role=dialog] button:has-text('Approve exact change')").last.click()
    expect(page.locator(f"text=Exact change approved by {ADMIN_NAME}")).to_be_visible()
    check("approval accepted once a policy allows the approver's role", True)

    # 5. Approved is not the same as executable: the gate's preflight says why not.
    expect(page.locator("text=Would the execution gate allow this write now?")).to_be_visible()
    expect(page.locator("text=DEV environment bound and isolation confirmed")).to_be_visible()
    check("preflight lists the gate's remaining blockers after approval",
          page.locator("text=does not confirm DEV isolation").count() >= 1)
    page.screenshot(path=f"{SHOTS}/5-approved-with-policy.png", full_page=True)
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
