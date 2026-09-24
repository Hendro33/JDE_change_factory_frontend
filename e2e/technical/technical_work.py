"""Technical Work demonstration (see README.md).

Run after scripts/seed_demo_technical.py (backend repo). The throwaway e2e
admin approves the prepared package revision, requests the simulated apply
and build, sees the CNC checkpoint, then a throwaway CNC operator records the
simulated hand-off and the admin runs the verification tests. Everything is
SIMULATION against a SYNTHETIC object; no JDE is contacted.
"""
import os
import sys

from playwright.sync_api import expect, sync_playwright

PW = os.environ["JADE_E2E_PASSWORD"]
CNC_PW = os.environ["JADE_E2E_CNC_PASSWORD"]
EMAIL = os.environ.get("JADE_E2E_EMAIL", "admin@e2e.local")
BASE = os.environ.get("JADE_E2E_BASE_URL", "http://localhost:5173")
CHROMIUM = os.environ.get("JADE_E2E_CHROMIUM") or None
SHOTS = os.environ.get("JADE_E2E_SHOTS", os.path.join(os.path.dirname(__file__), "shots"))
STORY = "S-DEMO-TECH-1"
os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, cond):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)


def login(browser, email, pw):
    page = browser.new_context(viewport={"width": 1280, "height": 1100}).new_page()
    page.goto(BASE)
    page.fill("#loginEmail", email)
    page.fill("#loginPassword", pw)
    page.click("button[type=submit]")
    page.wait_for_selector("text=Jade Dashboard")
    page.click("button:has-text('Delivery')")
    page.click(".navgroup >> text=Technical Work")
    page.click(f"button:has-text('{STORY}')")
    expect(page.locator("h3:has-text('Package revision 1')")).to_be_visible()
    return page


def badge(page, text):
    return page.locator(f".badge:has-text('{text}')").count()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM)
    page = login(browser, EMAIL, PW)
    check("the screen is labelled SIMULATION and names the synthetic format",
          page.locator("text=SIMULATION -- simulated DEV estate").count() >= 1 and page.locator("text=SYNTHETIC simulation format").count() >= 1)
    check("the design, its evidence baseline and the design approval are shown",
          page.locator("text=route Technical Agent").count() == 1 and page.locator("text=Approved by E2E Admin").count() == 1)
    check("the package shows objects, source provenance, toolchain and the unavailable live adapter",
          page.locator("text=P554210 (ER, system code 55, jade_sim_er)").count() == 1
          and page.locator("text=Live adapter: unavailable").count() == 1)
    check("the exact diff is inspectable", page.locator("pre >> text=+IF BC OrderType").count() == 1)
    check("generated source is not presented as an implemented change",
          page.locator("text=Generated source is a candidate, not an implemented JDE change").count() == 1)
    check("prepared but not approved: not eligible, awaiting a decision",
          badge(page, "Exact approval: waiting") == 1 and page.locator("text=Eligibility to apply: not eligible").count() == 1)
    page.screenshot(path=f"{SHOTS}/1-technical-prepared.png", full_page=True)

    page.click("button:has-text('Approve this exact revision')")
    expect(page.locator(".badge:has-text('Exact approval: done')")).to_be_visible()
    check("after exact approval the revision is eligible (simulation only)",
          page.locator("text=Eligibility to apply: eligible (simulation only)").count() == 1)
    page.click("button:has-text('Apply (simulation)')")
    expect(page.locator(".badge:has-text('Applied (checked in, not active): done')")).to_be_visible()
    page.click("button:has-text('Build (simulation)')")
    expect(page.locator(".badge:has-text('Built: done')")).to_be_visible()
    check("apply and build are separate milestones; the CNC step waits for a human",
          badge(page, "Human CNC activation: waiting") == 1
          and page.locator("text=Only a CNC operator can record it").count() == 1)
    page.click("button:has-text('Run verification tests')")
    expect(page.locator("text=awaiting human CNC activation")).to_be_visible()
    check("verification is refused until the CNC activation is recorded",
          page.locator("text=awaiting human CNC activation").count() >= 1)
    page.screenshot(path=f"{SHOTS}/2-technical-awaiting-cnc.png", full_page=True)

    cnc = login(browser, "cnc@e2e.local", CNC_PW)
    cnc.fill("input[aria-label='Package name']", "DV920DEMO01")
    cnc.fill("input[aria-label='Evidence reference']", "synthetic CNC ticket CNC-DEMO-1")
    cnc.click("button:has-text('Record CNC activation')")
    expect(cnc.locator(".badge:has-text('Human CNC activation: done')")).to_be_visible()
    check("a CNC operator recorded the simulated hand-off", cnc.locator("text=cnc activation by E2E CNC Operator").count() == 1)

    page.reload()
    page.click("button:has-text('Delivery')")
    page.click(".navgroup >> text=Technical Work")
    page.click(f"button:has-text('{STORY}')")
    page.click("button:has-text('Run verification tests')")
    expect(page.locator(".badge:has-text('Verified: done')")).to_be_visible()
    check("positive, negative and neighbouring tests pass against the active simulated runtime",
          page.locator("td >> .badge:has-text('passed')").count() == 3
          and page.locator("text=Active simulated runtime IS the approved artifact").count() == 1)
    check("the estate shows the package active in the simulated DEV",
          page.locator("text=(DV920DEMO01)").count() == 1)
    page.screenshot(path=f"{SHOTS}/3-technical-verified.png", full_page=True)
    browser.close()

passed = sum(ok for _, ok in results)
print(f"{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
