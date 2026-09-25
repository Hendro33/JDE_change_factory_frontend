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

READS = [  # capability, exact targets, columns, filter columns
    ("udc_values", "00/DT", "DRSY, DRRT, DRKY, DRDL01", ""),
    ("processing_option_values", "P4210|CIQ0001", "", ""),
    ("table_browse", "F4211", "DOCO, DCTO, LNID, LTTR", "DCTO"),
]


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
    page.click("button:has-text('Set up')")
    page.get_by_label("Connection name").fill("BicycleWorks PS920 trial (simulated)")
    page.get_by_label("AIS HTTPS address").fill("https://ais-dev.customer.example:9302/jderest")
    page.get_by_label("JDE environment", exact=True).fill("PS920")
    page.get_by_label("Environment purpose").select_option("isolated_trial")
    page.get_by_label("Trial approval reference").fill("Customer IT lead e-mail 2026-09-25: PS920 approved for a read-only trial")
    page.get_by_label("JDE role", exact=True).fill("JADEDISC")
    page.get_by_label("Application release", exact=True).fill("9.2")
    page.get_by_label("Tools release", exact=True).fill("9.2.8.2")
    page.get_by_label("Path code", exact=True).first.fill("PS920")
    check("unsupported authentication methods are listed honestly and cannot be chosen",
          page.locator("select[aria-label='Authentication method'] option[disabled]").count() == 4
          and page.locator("text=OAuth 2.0 / OpenID Connect").count() >= 1)
    page.get_by_label("Customer contact").fill("Pat Customer")
    page.get_by_label("CNC contact").fill("Chris CNC")
    page.get_by_label("Network access notes").fill("VPN from the backend machine to the AIS server only")
    page.get_by_label("Isolation evidence").fill("CNC ticket 12: PS920 maps to its own isolated data only")
    page.get_by_label("Routing and isolation confirmed").check()
    page.get_by_label("Privilege statement").fill("JADEDISC: read-only role on the listed tables")
    page.get_by_label("Privilege confirmed").check()
    page.get_by_label("Runtime attestation", exact=True).fill("CNC (Chris, ticket 12): PS920 runs path code PS920 on Tools 9.2.8.2")
    page.get_by_label("Runtime attested").check()
    for i, (cap, targets, fields, filters) in enumerate(READS, start=1):
        page.click("button:has-text('Add approved read')")
        page.select_option(f"select[aria-label='Read {i} capability']", cap)
        if targets:
            page.get_by_label(f"Read {i} targets").fill(targets)
        page.get_by_label(f"Read {i} fields").fill(fields)
        page.get_by_label(f"Read {i} filter fields").fill(filters)
    page.get_by_label("Customer data in AI prompts").select_option("configuration_and_artifacts")
    page.click("button:text-is('Save')")
    expect(page.locator("text=profile revision 1")).to_be_visible()
    check("saved as revision 1, labelled SIMULATION, discovery off; the address is normalised",
          page.locator("text=SIMULATION -- simulated AIS endpoint").count() >= 1 and page.locator("text=Architect discovery off").count() == 1
          and page.locator("text=https://ais-dev.customer.example:9302/jderest/v2/tokenrequest").count() == 1
          and page.locator("text=jderest/jderest").count() == 0)
    check("the environment purpose is shown as stated, with its approval",
          page.locator("text=approved isolated trial").count() >= 1)
    check("saving contacted nothing (no activity yet)", page.locator("text=No activity yet.").count() == 1)
    check("prerequisites distinguish customer attestations from machine-verified checks",
          page.locator("text=Customer attestation -- Jade cannot check this").count() == 1
          and page.locator("text=Checked by Jade for this profile revision").count() == 1
          and page.locator("text=does not verify that the").count() == 1)
    check("Enable is refused with reasons before any check",
          page.locator("button:has-text('Enable Architect Discovery')").is_disabled() and page.locator("text=Blocked by:").count() == 1)

    page.get_by_label("JDE user").fill("JADEDISC")
    page.get_by_label("JDE password").fill(DISCOVERY_PW)
    page.click("button:has-text('Save credential')")
    expect(page.locator("text=Save credential: saved")).to_be_visible()
    page.locator("text=JA••••••").first.wait_for(timeout=10_000)
    check("credential saved, username masked, password field cleared",
          page.locator("text=JA••••••").count() >= 1 and page.get_by_label("JDE password").input_value() == ""
          and page.locator("button:has-text('Replace credential')").count() == 1)
    check("the password is not on the page", DISCOVERY_PW not in page.content())

    page.click("button:has-text('Test Connection')")
    expect(page.locator("text=Test Connection: ok")).to_be_visible()
    for cap, target in (("udc_values", "00/DT"), ("processing_option_values", "P4210|CIQ0001"), ("table_browse", "F4211")):
        page.select_option("select[aria-label='Sample read capability']", cap)
        page.select_option("select[aria-label='Sample read target']", target)
        if cap == "table_browse":
            page.get_by_label("Sample read max records").fill("2")
            page.select_option("select[aria-label='Sample read filter column']", "DCTO")
            page.get_by_label("Sample read filter value").fill("SO")
        check(f"{cap}: run stays off until the exact request is previewed",
              page.locator("button:has-text('Run Approved Sample Read')").is_disabled())
        page.click("button:has-text('Preview exact request')")
        expect(page.locator("[aria-label='Sample read request preview']")).to_be_visible()
        check(f"{cap}: preview shows method, URL, body and request sha256, nothing sent",
              page.locator("[aria-label='Sample read request preview'] >> text=request sha256").count() == 1
              and page.locator("[aria-label='Sample read request preview'] >> text=nothing was sent").count() == 1)
        page.click("button:has-text('Run Approved Sample Read')")
        expect(page.locator("text=Approved sample read: ok")).to_be_visible()
    page.click("button:has-text('Enable Architect Discovery')")
    expect(page.locator(".badge:has-text('Architect discovery enabled')")).to_be_visible()
    check("four health checks ok, discovery enabled", page.locator("td >> .badge.ok").count() >= 4)
    check("environment verified from the session response, releases and routing shown as attested",
          page.locator("text=Environment verification, by source").count() == 1
          and page.locator("tr:has(td:text-is('session environment')) .badge:has-text('verified')").count() == 1
          and page.locator("tr:has(td:text-is('path code')) .badge:has-text('attested')").count() == 1
          and page.locator("text=not evidence of the session").count() >= 1)
    check("five separately visible readiness statuses",
          all(page.locator(f"[aria-label='Readiness: {g}']").count() == 1 for g in
              ("Connectivity", "Identity", "JDE authorisation", "Network restriction", "Jade runtime safeguards")))
    check("identity table shows configured and reported values side by side",
          page.locator("th:text-is('Configured')").count() == 1 and page.locator("th:text-is('Reported by JDE')").count() == 1)
    check("unavailable capabilities stated (source, event rules, specifications)",
          page.locator("text=AIS does not expose business function source code.").count() == 1)
    check("activity shows the test and sample reads; the filter value is masked",
          page.locator("text=test_connection").count() >= 1 and page.locator("text=table_browse F4211").count() >= 1
          and page.locator("td:has-text('where DCTO = ?')").count() >= 1 and page.locator("td:has-text('DCTO = SO')").count() == 0)
    page.screenshot(path=f"{SHOTS}/1-jde-discovery-enabled.png", full_page=True)

    nav(page, "Admin", "ERP / JDE Landscape")
    expect(page.locator("text=Connection settings live in one place")).to_be_visible()
    check("ERP Landscape references the profile instead of repeating it",
          page.locator("text=discovery enabled").count() == 1 and page.locator("text=AIS base URL").count() == 0
          and page.locator("text=approved isolated trial").count() == 1)
    page.screenshot(path=f"{SHOTS}/2-erp-landscape-reference.png", full_page=True)
    nav(page, "Admin", "Integrations")
    expect(page.locator("text=JD Edwards discovery (Architect)")).to_be_visible()
    check("the integrations summary shows discovery as its own, simulated connection",
          page.locator("text=SIMULATION, PS920, profile revision").count() == 1
          and page.locator("text=JD Edwards execution gate").count() == 1)
    page.click("button:has-text('Disable Connection')")
    expect(page.locator(".badge:has-text('Connection disabled')")).to_be_visible()
    check("Disable is a kill switch: discovery off, checks cleared, Enable needs a fresh test",
          page.locator("button:has-text('Enable Architect Discovery')").is_disabled()
          and page.locator("[aria-label='Readiness: Jade runtime safeguards'] >> text=disabled -- run Test Connection to re-check").count() == 1)
    page.screenshot(path=f"{SHOTS}/3-jde-disabled.png", full_page=True)
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
