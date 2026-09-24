"""Discovery demonstration, part 1: Admin > Integrations > JDE (see README.md).

Sets up a SIMULATION profile through the UI, proves saving contacts nothing,
saves a masked credential, tests the connection, runs the approved sample
reads, enables discovery, and shows the sanitised activity and the ERP
Landscape reference. No customer JDE is contacted.
"""
import os
import sys

from playwright.sync_api import expect, sync_playwright

PW = os.environ["JADE_E2E_PASSWORD"]          # never hard-coded
DISCOVERY_PW = os.environ["JADE_E2E_DISCOVERY_PASSWORD"]  # a throwaway value for the simulated endpoint
EMAIL = os.environ.get("JADE_E2E_EMAIL", "admin@e2e.local")
BASE = os.environ.get("JADE_E2E_BASE_URL", "http://localhost:5173")
CHROMIUM = os.environ.get("JADE_E2E_CHROMIUM") or None
SHOTS = os.environ.get("JADE_E2E_SHOTS", os.path.join(os.path.dirname(__file__), "shots"))
os.makedirs(SHOTS, exist_ok=True)
results = []

READS = "\n".join([
    "udc_values; 00/DT; DRSY,DRRT,DRKY,DRDL01",
    "processing_option_values; P4210|CIQ0001",
    "table_browse; F4211; DOCO,DCTO,LNID,LTTR; DCTO",
])


def check(name, cond):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)


def nav(page, group, label):
    page.click(f"button:has-text('{group}')")
    page.click(f".navgroup >> text={label}")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM)
    page = browser.new_context(viewport={"width": 1280, "height": 1000}).new_page()
    page.goto(BASE)
    page.fill("#loginEmail", EMAIL)
    page.fill("#loginPassword", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("text=Jade Dashboard")

    nav(page, "Admin", "Integrations")
    expect(page.locator("text=JDE — Architect environment discovery")).to_be_visible()
    page.click("button:has-text('Set up')")
    page.get_by_label("HTTPS AIS endpoint").fill("https://ais-dev.customer.example")
    page.get_by_label("DEV environment").fill("JDV920")
    page.get_by_label("JDE role (explicit)").fill("JADEDISC")
    page.get_by_label("Application release").fill("9.2")
    page.get_by_label("Tools release", exact=True).fill("9.2.8.2")
    page.get_by_label("Path code", exact=True).first.fill("DV920")  # the import form below has one too
    page.get_by_label("Customer contact").fill("Pat Customer")
    page.get_by_label("CNC contact").fill("Chris CNC")
    page.get_by_label("Network route").fill("site-to-site VPN to the DEV AIS server only")
    page.get_by_label("Isolation evidence").fill("CNC ticket 12: environment maps to DEV data only")
    page.check("label:has-text('route reaches DEV only') input")
    page.get_by_label("Privilege statement").fill("JADEDISC: read-only role on the listed tables")
    page.check("label:has-text('narrowly privileged') input")
    page.locator("label:has-text('Runtime attestation') textarea").fill("CNC (Chris, ticket 12): JDV920 runs path code DV920 on Tools 9.2.8.2")
    page.check("label:has-text('attested the Tools release and path code') input")
    page.locator("label:has-text('Approved reads') textarea").fill(READS)
    page.get_by_label("Customer data in model prompts").select_option("configuration_and_artifacts")
    page.click("button:has-text('Save profile')")
    expect(page.locator("text=Profile revision 1")).to_be_visible()
    check("saved as revision 1, labelled SIMULATION, discovery off",
          page.locator("text=SIMULATION -- simulated AIS endpoint").count() >= 1 and page.locator("text=Discovery off").count() == 1)
    check("saving contacted nothing (no activity yet)", page.locator("text=No activity yet.").count() == 1)
    check("Enable is refused with reasons before any check",
          page.locator("text=Discovery cannot be enabled yet").count() == 1 and page.locator("button:has-text('Enable Discovery')").is_disabled())

    page.get_by_label("JDE user").fill("JADEDISC")
    page.get_by_label("JDE password").fill(DISCOVERY_PW)
    page.click("button:has-text('Save credential')")
    expect(page.locator("text=Save credential: done")).to_be_visible()
    page.locator("text=JA••••••").first.wait_for(timeout=10_000)  # the refreshed view renders after the message
    check("credential saved, username masked, password field cleared",
          page.locator("text=JA••••••").count() >= 1 and page.get_by_label("JDE password").input_value() == "")
    check("the password is not on the page", DISCOVERY_PW not in page.content())

    page.click("button:has-text('Test Connection')")
    expect(page.locator("text=Test Connection: ok")).to_be_visible()
    for cap in ("udc_values", "processing_option_values", "table_browse"):
        page.select_option("select[aria-label='Capability for the sample read']", cap)
        page.click("button:has-text('Run Approved Sample Read')")
        expect(page.locator("text=Approved sample read: ok")).to_be_visible()
    page.click("button:has-text('Enable Discovery')")
    expect(page.locator(".badge:has-text('Discovery enabled')")).to_be_visible()
    check("four health checks ok, discovery enabled", page.locator("td >> .badge.ok").count() >= 4)
    check("environment verified from the session response, releases and routing shown as attested",
          page.locator("text=Environment verification, by source").count() == 1
          and page.locator("tr:has(td:text-is('session environment')) .badge:has-text('verified')").count() == 1
          and page.locator("tr:has(td:text-is('path code')) .badge:has-text('attested')").count() == 1
          and page.locator("text=not evidence of the session").count() >= 1)
    check("unavailable capabilities stated (source, event rules, specifications)",
          page.locator("text=AIS does not expose business function source code.").count() == 1)
    check("activity shows the test and sample reads, sanitised",
          page.locator("text=test_connection").count() >= 1 and page.locator("text=table_browse F4211").count() >= 1
          and page.locator("text=where DCTO").count() == 0)
    page.screenshot(path=f"{SHOTS}/1-jde-discovery-enabled.png", full_page=True)

    nav(page, "Admin", "ERP / JDE Landscape")
    expect(page.locator("text=Connection settings live in one place")).to_be_visible()
    check("ERP Landscape references the profile instead of repeating it",
          page.locator("text=discovery enabled").count() == 1 and page.locator("text=AIS base URL").count() == 0)
    page.screenshot(path=f"{SHOTS}/2-erp-landscape-reference.png", full_page=True)
    nav(page, "Admin", "Integrations")
    expect(page.locator("text=JD Edwards discovery (Architect)")).to_be_visible()
    check("the integrations summary shows discovery as its own, simulated connection",
          page.locator("text=SIMULATION, JDV920, profile revision").count() == 1
          and page.locator("text=JD Edwards execution gate").count() == 1)
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
