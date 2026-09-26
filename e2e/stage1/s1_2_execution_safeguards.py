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


# Every screen has its own address; the old menu labels map onto them.
ROUTES = {
    ("Admin", "Customer Setup"): "/admin/organisation",
    ("Admin", "Users"): "/admin/organisation/users",
    ("Admin", "Agents"): "/admin/agents",
    ("Admin", "Agent Configuration"): "/admin/agents/configuration",
    ("Admin", "AI Connections"): "/admin/agents/ai",
    ("Admin", "Knowledge Library"): "/knowledge",
    ("Admin", "Integrations"): "/admin/connections/jde",
    ("Admin", "Jira"): "/admin/connections/jira",
    ("Admin", "Connections"): "/admin/connections",
    ("Admin", "ERP / JDE Landscape"): "/admin/governance",
    ("Admin", "Business Domains"): "/admin/business-model",
    ("Demand", "Create Request"): "/stories/new",
    ("Demand", "Requests"): "/stories?phase=understand",
    ("Demand", "User Stories"): "/stories",
}


def nav(page, group, label):
    page.goto(BASE + ROUTES[(group, label)])
    page.wait_for_selector(".appbar")
    page.wait_for_timeout(600)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM)
    page = browser.new_context(viewport={"width": 1280, "height": 900}).new_page()
    page.goto(BASE)
    page.fill("#loginEmail", EMAIL)
    page.fill("#loginPassword", PW)
    page.click("button[type=submit]")
    page.wait_for_selector(".appbar")

    # 1. No approval policy yet: the ERP screen says so.
    nav(page, "Admin", "ERP / JDE Landscape")
    expect(page.locator("text=Nobody can approve an exact change for this company")).to_be_visible()
    check("missing policy is shown as 'nobody can approve'", True)

    # 2. Approving the pending exact change (from the story's Decision card) is refused, visibly.
    page.goto(BASE + "/stories/S12-DEMO-1")
    page.click("#next-action >> button:has-text('Approve solution')")
    page.locator(".modal button:has-text('Approve solution')").last.click()
    # The gate refuses with its own reason: no saved scope, or a scope without an approval policy.
    expect(page.locator("#next-action >> text=/has no (approval policy|saved engagement scope)/")).to_be_visible()
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
    page.goto(BASE + "/stories/S12-DEMO-1")
    page.click("#next-action >> button:has-text('Approve solution')")
    page.locator(".modal button:has-text('Approve solution')").last.click()
    expect(page.locator("#next-action >> text=Decision needed")).to_have_count(0)
    page.goto(BASE + "/stories/S12-DEMO-1/solution")
    expect(page.locator(f"text=Exact change approved by {ADMIN_NAME}")).to_be_visible()
    check("approval accepted once a policy allows the approver's role", True)

    # 5. Approved is not the same as executable: the gate's preflight (Technical view) says why not.
    page.goto(BASE + "/stories/S12-DEMO-1/technical")
    expect(page.locator("text=Would the execution gate allow this write now?")).to_be_visible()
    expect(page.locator("text=DEV environment bound and isolation confirmed")).to_be_visible()
    check("preflight lists the gate's remaining blockers after approval",
          page.locator("text=does not confirm DEV isolation").count() >= 1)
    page.screenshot(path=f"{SHOTS}/5-approved-with-policy.png", full_page=True)
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
