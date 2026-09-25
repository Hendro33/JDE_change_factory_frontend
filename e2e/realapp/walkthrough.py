"""Walk the real application as a customer administrator (see README.md).

  phase "setup":  create a real customer, edit it, switch an agent off,
                  configure JDE (live) and Jira, press their Test Connection
                  buttons, create a business domain and a request.
  phase "verify": after the backend has been restarted, everything saved in
                  "setup" is still there.

Nothing here fakes a result: Test Connection calls whatever is configured and
the script records exactly what the screen says.
"""
import json
import os
import sys

from playwright.sync_api import expect, sync_playwright

PW = os.environ["JADE_E2E_PASSWORD"]
JDE_PW = os.environ["JADE_E2E_DISCOVERY_PASSWORD"]   # throwaway value, never a real JDE password
BASE = os.environ.get("JADE_E2E_BASE_URL", "http://localhost:5173")
CHROMIUM = os.environ.get("JADE_E2E_CHROMIUM") or None
SHOTS = os.environ.get("JADE_E2E_SHOTS", os.path.join(os.path.dirname(__file__), "shots"))
STATE = os.path.join(SHOTS, "state.json")
AIS = os.environ.get("JADE_E2E_AIS", "https://141.144.202.25:7077")
os.makedirs(SHOTS, exist_ok=True)
PHASE = sys.argv[1] if len(sys.argv) > 1 else "setup"
results = []


def check(name, cond):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)


def nav(page, group, label):
    page.click(f"button:has-text('{group}')")
    page.click(f".navgroup >> text={label}")
    page.wait_for_timeout(800)


def shot(page, name):
    page.screenshot(path=f"{SHOTS}/{name}.png", full_page=True)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM)
    page = browser.new_context(viewport={"width": 1400, "height": 1000}).new_page()
    page.goto(BASE)
    page.fill("#loginEmail", "admin@e2e.local")
    page.fill("#loginPassword", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("text=Jade Dashboard")
    page.wait_for_selector(".cscope")
    check("footer shows the running frontend and backend commits",
          page.locator("text=/frontend [0-9a-f]{7,} · backend [0-9a-f]{7,}/").count() == 1)

    if PHASE == "setup":
        nav(page, "Admin", "Customer Setup")
        page.click("button:has-text('New customer')")
        page.get_by_label("New customer name", exact=True).fill("Walkthrough Foods BV")
        page.get_by_label("New customer Tools Release").fill("9.2.26.2")
        page.get_by_label("New customer JDE environment").fill("JPS920")
        page.click("button:has-text('Create customer')")
        page.wait_for_selector(".cscope >> text=Walkthrough Foods BV")
        check("the new customer is active and is not a demo customer",
              page.locator(".cscope >> text=Walkthrough Foods BV").count() == 1
              and page.locator(".cscope .badge:has-text('DEMO')").count() == 0
              and page.locator("text=Demo customer — test data.").count() == 0)
        nav(page, "Admin", "Customer Setup")
        page.click("button:has-text('Edit customer')")
        page.get_by_label("Short name", exact=True).fill("Walkthrough")
        page.click("button:has-text('Save customer')")
        expect(page.locator("text=Saved.")).to_be_visible()
        shot(page, "1-customer-setup")

        nav(page, "Admin", "Agents")
        page.click(".agentcard:has-text('Architect Agent')")
        page.get_by_label("Architect Agent enabled for this customer").click()
        page.wait_for_timeout(1200)
        check("the Architect can be switched off for this customer",
              page.locator(".agentcard:has-text('Architect Agent') >> text=Off for this customer").count() == 1)
        check("the Technical Agent that exists is listed", page.locator(".agentcard:has-text('Technical Agent')").count() == 1)
        shot(page, "2-agents")

        nav(page, "Admin", "Integrations")
        page.click("button:has-text('Set up')")
        check("a real customer cannot choose a simulated JDE", page.locator("text=(demo customers only)").count() == 0)
        page.get_by_label("Connection name").fill("Walkthrough JPS920")
        page.get_by_label("AIS HTTPS address").fill(AIS)
        page.get_by_label("JDE environment", exact=True).fill("JPS920")
        page.get_by_label("JDE role", exact=True).fill("JADEREAD")
        page.get_by_label("Application release", exact=True).fill("9.2")
        page.get_by_label("Tools release", exact=True).fill("9.2.26.2")
        page.get_by_label("Customer contact").fill("Walkthrough IT")
        page.get_by_label("CNC contact").fill("Walkthrough CNC")
        page.get_by_label("Network access notes").fill("Backend machine to the AIS address directly")
        page.get_by_label("Isolation evidence").fill("Walkthrough: isolated trial environment")
        page.get_by_label("Routing and isolation confirmed").check()
        page.get_by_label("Privilege statement").fill("Walkthrough: dedicated read-only role")
        page.get_by_label("Privilege confirmed").check()
        page.get_by_label("Runtime attestation", exact=True).fill("Walkthrough CNC statement")
        page.get_by_label("Runtime attested").check()
        page.click("button:has-text('Add approved read')")
        page.select_option("select[aria-label='Read 1 capability']", "udc_values")
        page.get_by_label("Read 1 targets").fill("00/DT")
        page.get_by_label("Read 1 fields").fill("DRSY, DRRT, DRKY, DRDL01")
        page.get_by_label("Records per query").fill("5")
        page.click("button:has-text('Save')")
        expect(page.locator("text=Save: saved")).to_be_visible()
        page.get_by_label("JDE user").fill("JADEWALK")
        page.get_by_label("JDE password").fill(JDE_PW)
        page.click("button:has-text('Save credential')")
        expect(page.locator("text=Save credential: saved")).to_be_visible()
        check("the JDE password is masked and never shown", JDE_PW not in page.content()
              and page.get_by_label("JDE password").input_value() == "")
        page.click("button:has-text('Test Connection')")
        page.wait_for_selector("text=/Test Connection: /", timeout=60000)
        jde_msg = page.locator("[role=status]").first.inner_text()
        print("JDE Test Connection said:", jde_msg)
        check("JDE Test Connection shows a real outcome, never a simulated success",
              "SIMULATION" not in jde_msg and "Test Connection:" in jde_msg)
        shot(page, "3-jde-connection")

        page.click("button:has-text('Configure')")
        page.fill("#jiraBaseUrl", "https://jade-walkthrough-nonexistent.atlassian.net")
        page.fill("#jiraProjectKey", "JWT")
        page.fill("#jiraEmail", "walkthrough@example.com")
        page.fill("#jiraApiToken", "not-a-real-token")
        page.fill("#jiraPickupStatus", "Ready for Jade")
        page.fill("#jiraPostPickupStatus", "With Jade")
        page.fill("#jiraJadeIdField", "customfield_10100")
        jira_test = page.locator("#jiraApiToken").locator("xpath=../following-sibling::div[1]//button")
        jira_test.click()
        result_box = page.locator("#jiraApiToken").locator("xpath=../following-sibling::div[contains(@class,'callout')][1]")
        result_box.wait_for(timeout=60000)
        jira_msg = result_box.inner_text()
        print("Jira Test Connection said:", jira_msg[:300])
        page.click("button:has-text('Save Jira configuration')")
        page.wait_for_timeout(1500)
        check("Jira configuration saved with the token masked", "not-a-real-token" not in page.content()
              and page.locator("text=https://jade-walkthrough-nonexistent.atlassian.net").count() >= 1)
        shot(page, "4-jira")

        nav(page, "Admin", "Business Domains")
        page.click("button:has-text('New domain')")
        page.fill("#apqcCode", "4.4")
        page.fill("#level", "4.4")
        page.fill("#name", "Walkthrough Logistics")
        page.click("button:has-text('Create domain')")
        page.wait_for_timeout(1000)
        check("a business domain is created for the new customer", page.locator("text=Walkthrough Logistics").count() >= 1)
        shot(page, "5-domains")

        nav(page, "Demand", "Create Request")
        page.fill("#t", "Walkthrough: delivery date default")
        page.fill("#req", "The default delivery date on sales orders should be two working days after the order date.")
        page.click("button:has-text('Create story')")
        page.wait_for_timeout(1500)
        nav(page, "Demand", "Requests")
        check("the request is listed under the new customer, not marked as demo data",
              page.locator("text=Walkthrough: delivery date default").count() >= 1
              and page.locator("text=Demo customer — test data.").count() == 0)
        shot(page, "6-requests")
        json.dump({"jde": jde_msg, "jira": jira_msg}, open(STATE, "w"))

    else:
        # A new browser opens the first customer; switch the way a person does.
        page.click(".cscope-btn")
        page.click(".cscope-menu >> text=Walkthrough Foods BV")
        page.wait_for_timeout(1000)
        check("after a restart the real customer is still there and selectable",
              page.locator(".cscope >> text=Walkthrough Foods BV").count() == 1)
        nav(page, "Admin", "Customer Setup")
        check("customer edits persisted", page.locator("dd:text-is('Walkthrough')").count() == 1
              and page.locator("dd:text-is('JPS920')").count() == 1)
        nav(page, "Admin", "Agents")
        check("agent switch persisted",
              page.locator(".agentcard:has-text('Architect Agent') >> text=Off for this customer").count() == 1)
        nav(page, "Admin", "Integrations")
        page.wait_for_selector("text=AIS address")
        check("JDE connection persisted, credential masked",
              AIS in page.inner_text("main") and "user JA•••••• encrypted" in page.inner_text("main"))
        page.click("button:has-text('Test Connection') >> nth=0")
        page.wait_for_selector("text=/Test Connection: /", timeout=90000)
        jde_msg = page.locator("[role=status]").first.inner_text()
        print("JDE Test Connection said:", jde_msg)
        check("JDE Test Connection reports the real network outcome", "SIMULATION" not in jde_msg)
        shot(page, "7-jde-after-restart")
        check("Jira configuration persisted",
              page.locator("text=https://jade-walkthrough-nonexistent.atlassian.net").count() >= 1)
        nav(page, "Admin", "Business Domains")
        check("business domain persisted", page.locator("text=Walkthrough Logistics").count() >= 1)
        nav(page, "Demand", "Requests")
        check("request persisted", page.locator("text=Walkthrough: delivery date default").count() >= 1)
        shot(page, "7-after-restart")
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
