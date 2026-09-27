"""Discovery demonstration, part 2: the evidence behind a design (see README.md).

Run after discovery_admin.py and scripts/seed_demo_design_evidence.py.
"""
import os
import sys

from playwright.sync_api import expect, sync_playwright

PW = os.environ["JADE_E2E_PASSWORD"]
EMAIL = os.environ.get("JADE_E2E_EMAIL", "admin@e2e.local")
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
    ("Admin", "Knowledge Library"): "/admin/connections/references",
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
    page = browser.new_context(viewport={"width": 1280, "height": 1000}).new_page()
    page.goto(BASE)
    page.fill("#loginEmail", EMAIL)
    page.fill("#loginPassword", PW)
    page.click("button[type=submit]")
    page.wait_for_selector(".appbar")

    # The design evidence baseline is in the story's Technical view (and behind "View supporting evidence" on Solution).
    page.goto(BASE + "/stories/S12-DEMO-1/technical")
    expect(page.locator("text=Evidence behind this design")).to_be_visible()
    expect(page.locator("text=Environment investigated")).to_be_visible()
    check("the investigated environment is shown, labelled SIMULATION",
          page.locator("text=PS920 · path code PS920").count() == 1 and page.locator(".badge:has-text('SIMULATION')").count() >= 1)
    check("what was read is listed with observation ids",
          page.locator("text=processing_option_values P4210|CIQ0001").count() >= 1 and page.locator("td.mono:has-text('OBS-')").count() >= 2)
    check("citations show observed vs assumption",
          page.locator(".badge:has-text('observed')").count() >= 2 and page.locator(".badge:has-text('assumption')").count() >= 1)
    check("missing source code is a gap with a question, not an assumption",
          page.locator("text=source_code on B5542001 was not read").count() == 1
          and page.locator("text=Question: Can the CNC export B5542001").count() == 1)
    page.screenshot(path=f"{SHOTS}/3-design-evidence.png", full_page=True)

    page.click("button:has-text('Refresh Evidence')")
    expect(page.locator("text=Show earlier baselines (1)")).to_be_visible()
    check("Refresh Evidence creates a new baseline and keeps the earlier one",
          page.locator("text=baseline 2 (refresh)").count() == 1)
    page.click("button:has-text('Show earlier baselines')")
    page.screenshot(path=f"{SHOTS}/4-evidence-refreshed.png", full_page=True)

    nav(page, "Admin", "Integrations")
    expect(page.locator("text=S12-DEMO-1 DEMO-SCRIPTED-RUN").first).to_be_visible()
    check("the activity view links the reads to the story and the run",
          page.locator("text=S12-DEMO-1 DEMO-SCRIPTED-RUN").count() >= 1)
    check("the blocked source-code request is in the activity", page.locator("td:has-text('source_code B5542001')").count() >= 1)
    page.locator("text=Discovery activity").scroll_into_view_if_needed()
    page.screenshot(path=f"{SHOTS}/5-activity.png", full_page=True)
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
