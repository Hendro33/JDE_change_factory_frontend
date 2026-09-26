"""Technical delivery demonstration (see README.md).

Run after scripts/seed_demo_technical.py (backend repo). In the story's
workspace the throwaway e2e admin approves the prepared package revision from
the Decision card, applies and builds it, sees the CNC checkpoint, then a
throwaway CNC operator records the simulated hand-off and the admin runs the
verification tests. The Technical tab shows every package detail and
milestone. Everything is SIMULATION against a SYNTHETIC object; no JDE is
contacted.
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
    page.goto(f"{BASE}/stories/{STORY}")
    page.fill("#loginEmail", email)
    page.fill("#loginPassword", pw)
    page.click("button[type=submit]")
    # A shared story link lands on the story after sign-in.
    expect(page.locator("#next-action")).to_be_visible()
    return page


def technical(page):
    page.goto(f"{BASE}/stories/{STORY}/technical")
    expect(page.locator("h3:has-text('Package revision 1')")).to_be_visible()


def badge(page, text):
    return page.locator(f".badge:has-text('{text}')").count()


def phase(page):
    return page.locator(".storyheader .phase-strong").inner_text()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM)
    page = login(browser, EMAIL, PW)
    check("the story is in Delivery, waiting for the implementation decision",
          phase(page) == "Delivery" and page.locator("#next-action >> text=Decision needed").count() == 1
          and page.locator("#next-action >> button:has-text('Approve implementation')").count() == 1)

    technical(page)
    check("the technical view is labelled SIMULATION and names the synthetic format",
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
          badge(page, "Exact approval: waiting") == 1 and page.locator("text=Next milestone: apply -- not eligible").count() == 1)
    page.screenshot(path=f"{SHOTS}/1-technical-prepared.png", full_page=True)

    # The decision, from the Decision card, with its confirmation dialog.
    page.goto(f"{BASE}/stories/{STORY}")
    page.click("#next-action >> button:has-text('Approve implementation')")
    expect(page.locator(".modal >> text=What happens next")).to_be_visible()
    page.click(".modal >> button:has-text('Approve implementation')")
    expect(page.locator("#next-action >> button:has-text('Apply and build in DEV')")).to_be_visible()
    check("after approval the next step is to apply and build in DEV", phase(page) == "Delivery")
    page.click("#next-action >> button:has-text('Apply and build in DEV')")
    expect(page.locator("#next-action >> text=Waiting for: CNC")).to_be_visible()
    check("apply and build ran; the next step waits for a human CNC activation",
          page.locator("#next-action >> text=Activate the built package in DEV").count() == 1)

    technical(page)
    check("apply and build are separate milestones; the CNC step waits for a human",
          badge(page, "Applied (checked in, not active): done") == 1 and badge(page, "Built: done") == 1
          and badge(page, "Human CNC activation: waiting") == 1
          and page.locator("text=Only a CNC operator can record it").count() >= 1)
    page.click("button:has-text('Run verification tests')")
    expect(page.locator("text=awaiting human CNC activation").first).to_be_visible()
    check("verification is refused until the CNC activation is recorded",
          page.locator("text=awaiting human CNC activation").count() >= 1)
    page.screenshot(path=f"{SHOTS}/2-technical-awaiting-cnc.png", full_page=True)

    cnc = login(browser, "cnc@e2e.local", CNC_PW)
    check("the CNC operator sees the activation as their next step",
          cnc.locator("#next-action >> text=Activate the built package in DEV").count() == 1)
    cnc.fill("#next-action >> input[aria-label='Package name']", "DV920DEMO01")
    cnc.fill("#next-action >> input[aria-label='Evidence reference']", "synthetic CNC ticket CNC-DEMO-1")
    cnc.click("#next-action >> button:has-text('Record activation')")
    expect(cnc.locator(".storyheader .phase-strong:has-text('Validation')")).to_be_visible()
    technical(cnc)
    check("a CNC operator recorded the simulated hand-off", cnc.locator("text=cnc activation by E2E CNC Operator").count() == 1)

    page.goto(f"{BASE}/stories/{STORY}")
    expect(page.locator("#next-action >> button:has-text('Run validation')")).to_be_visible()
    page.click("#next-action >> button:has-text('Run validation')")
    expect(page.locator(".storyheader .phase-strong:has-text('Release')")).to_be_visible()
    check("validation passed: the story moves to Release", phase(page) == "Release")
    page.goto(f"{BASE}/stories/{STORY}/delivery")
    expect(page.locator("td >> .tag:has-text('Passed')").first).to_be_visible()
    check("the Delivery tab shows the business-level test results",
          page.locator("td >> .tag:has-text('Passed')").count() == 3
          and page.locator("text=Tested against exactly the approved, active change.").count() == 1)
    technical(page)
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
