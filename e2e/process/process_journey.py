"""Process framework -> story -> maps -> design -> implementation -> as-built,
in the browser against the real backend (see README.md).

Run against the local preview (backend scripts/run_local_preview.sh), which
seeds the BicycleWorks dealer-returns story with scripted stand-ins, a
SYNTHETIC framework fixture and SIMULATED delivery. PHASE=1 walks the
journey and changes things; PHASE=2 (after restarting the preview) checks
that everything survived and works in a fresh browser.
"""
import os
import sys

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("JADE_E2E_BASE_URL", "http://localhost:5173")
ADMIN_PW = os.environ["JADE_E2E_PASSWORD"]
DO_PW = os.environ["JADE_E2E_DO_PASSWORD"]
CNC_PW = os.environ["JADE_E2E_CNC_PASSWORD"]
FIXTURES = os.environ["JADE_E2E_FIXTURES"]
CHROMIUM = os.environ.get("JADE_E2E_CHROMIUM") or None
SHOTS = os.environ.get("JADE_E2E_SHOTS", os.path.join(os.path.dirname(__file__), "shots"))
PHASE = os.environ.get("PHASE", "1")
STORY = "S-BW-RETURNS"
os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, cond):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)


def login(browser, email, pw):
    page = browser.new_context(viewport={"width": 1360, "height": 1000}, accept_downloads=True).new_page()
    page.goto(BASE)
    page.fill("#loginEmail", email)
    page.fill("#loginPassword", pw)
    page.click("button[type=submit]")
    page.wait_for_selector("text=Jade Dashboard")
    return page


def go(page, group, item):
    page.click(f"nav button:has-text('{group}')")
    page.click(f".navgroup-menu >> text={item}")


def open_story(page, story=STORY):
    go(page, "Delivery", "Process & Maps")
    page.click(f"button:has-text('{story}')")
    expect(page.locator(f"h2:has-text('{story}:')")).to_be_visible()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM)
    admin = login(browser, "admin@e2e.local", ADMIN_PW)

    if PHASE == "1":
        # 1. Admin > Process Framework: the synthetic fixture, clearly labelled, with provenance.
        go(admin, "Admin", "Process Framework")
        expect(admin.locator("h1:has-text('Process Framework')")).to_be_visible()
        check("the framework is labelled SYNTHETIC and selected for the company",
              admin.locator(".badge:has-text('SYNTHETIC fixture')").count() >= 1
              and admin.locator("text=Selected for this company").count() == 1)
        check("version 1 is active with its original file and checksum",
              admin.locator("td >> text=SYNTHETIC_bicycleworks_process_framework_v1.xlsx").count() == 1
              and admin.locator("td >> .badge:has-text('active')").count() == 1)
        admin.click("button.linkish:has-text('SYN-5.2.2')")
        expect(admin.locator("h3:has-text('SYN-5.2.2')")).to_be_visible()
        expect(admin.locator(f"li >> button:has-text('{STORY}')")).to_be_visible()
        check("a process node lists the stories mapped to it", admin.locator(f"li >> button:has-text('{STORY}')").count() == 1)
        check("the status says official APQC content is not loaded",
              admin.locator("[aria-label='Framework status'] >> text=not loaded").count() == 1)
        admin.screenshot(path=f"{SHOTS}/1-framework.png", full_page=True)

        # 2. Hierarchy -> story: mapping, suggestions labelled as scripted, maps and diagram.
        admin.click(f"li >> button:has-text('{STORY}')")
        expect(admin.locator(f"h2:has-text('{STORY}:')")).to_be_visible()
        check("the agent suggestions are labelled as a scripted stand-in",
              admin.locator("text=SCRIPTED STAND-IN -- not a model run").count() == 1)
        check("the reviewer's confirmed processes carry exact version references",
              admin.locator("text=Processes confirmed").count() == 1 and admin.locator("text=SYNTHETIC BicycleWorks process framework v1").count() >= 4)
        check("the to-be map is drawn from the structured map, assumptions distinguished",
              admin.locator("svg[aria-label^='Process map diagram']").count() == 1
              and admin.locator("text=assumption (proposed, not confirmed)").count() == 1)
        check("the design used this process context and is current",
              admin.locator("text=consulted by the Architect").count() == 1
              and admin.locator("text=matches the story's processes now").count() == 1)
        admin.screenshot(path=f"{SHOTS}/2-story-processes.png", full_page=True)

        # 3. Journey: design -> implementation -> as-built.
        admin.click("nav[aria-label='Story journey'] >> text=Design")
        expect(admin.locator(f".mono:has-text('{STORY}')").first).to_be_visible()
        check("the journey reaches the Architect's design for the same story", admin.locator("text=Technical Agent").count() >= 1)
        admin.click("nav[aria-label='Story journey'] >> text=Implementation")
        expect(admin.locator(".badge:has-text('Verified: done')")).to_be_visible()
        check("implementation is labelled SIMULATION", admin.locator("text=SIMULATION -- simulated DEV estate").count() >= 1)
        admin.click("nav[aria-label='Story journey'] >> text=As-built record")
        expect(admin.locator("h1:has-text('As-built Records')")).to_be_visible()
        expect(admin.locator(".badge:has-text('complete')").first).to_be_visible()
        check("every required delivery checkpoint is complete", admin.locator(".badge:has-text('missing')").count() == 0
              and admin.locator(".badge:has-text('complete')").count() == 10)
        admin.click("button:has-text('Generate new version')")
        expect(admin.locator("h2:has-text('version 1')")).to_be_visible()
        check("the record states simulated delivery, deviations and limitations",
              admin.locator("text=SIMULATED DELIVERY").count() >= 1
              and admin.locator("text=The design names R55RET01").count() == 1
              and admin.locator("text=are assumptions, not confirmed customer practice").count() >= 1)
        admin.click("button:has-text('Finalise this version')")
        expect(admin.locator(".badge:has-text('FINAL')")).to_be_visible()
        with admin.expect_download() as dl:
            admin.click("button:has-text('Download Markdown')")
        md = open(dl.value.path(), encoding="utf-8").read()
        check("the Markdown download is the final record, labelled simulated",
              "status **FINAL**" in md and "SIMULATED DELIVERY" in md and "```mermaid" in md)
        admin.screenshot(path=f"{SHOTS}/3-as-built-final.png", full_page=True)

        # 3b. The Functional route: a simulated processing-option change, into a finalised record.
        admin.click("button:has-text('S-BW-RETURNTYPE')")
        expect(admin.locator(".badge:has-text('complete')").first).to_be_visible()
        admin.click("button:has-text('Generate new version')")
        expect(admin.locator("h2:has-text('S-BW-RETURNTYPE as-built record')")).to_be_visible()
        check("the Functional record shows the actual change and its read-back, labelled simulated",
              admin.locator("strong:has-text('S3 → CR')").count() == 1
              and admin.locator(".badge:has-text('matches the approved value')").count() == 1
              and admin.locator("text=SIMULATED DELIVERY").count() >= 1)
        admin.click("button:has-text('Finalise this version')")
        expect(admin.locator(".badge:has-text('FINAL')")).to_be_visible()
        check("the Functional as-built record is finalised", admin.locator("button:has-text('v1 · final')").count() == 1)
        admin.screenshot(path=f"{SHOTS}/3b-functional-as-built.png", full_page=True)

        # 4. A framework update keeps historical references and flags the design.
        go(admin, "Admin", "Process Framework")
        admin.set_input_files("input[aria-label='Framework workbook']",
                              os.path.join(FIXTURES, "SYNTHETIC_bicycleworks_process_framework_v2.xlsx"))
        admin.select_option("#pf-target", label="New version of SYNTHETIC BicycleWorks process framework")
        admin.click("button:has-text('Validate and preview')")
        expect(admin.locator("h3:has-text('Preview:')")).to_be_visible()
        check("the preview compares with the active version", admin.locator("text=1 changed (SYN-5.2.2)").count() == 1)
        admin.click("button:has-text('Activate version 2')")
        expect(admin.locator(f"text=Activated SYNTHETIC BicycleWorks process framework version 2")).to_be_visible()
        check("activation reports the affected story", admin.locator(f"text={STORY} (SYN-5.2.2 (changed))").count() == 1)
        open_story(admin)
        check("the story still references version 1, marked as changed in the active version",
              admin.locator(".badge:has-text('changed in the active version')").count() == 1
              and admin.locator("text=SYNTHETIC BicycleWorks process framework v1").count() >= 4)
        check("the design is flagged for reassessment", admin.locator("text=process framework revised").count() == 1)
        admin.screenshot(path=f"{SHOTS}/4-framework-v2-flags.png", full_page=True)

        # 4b. Story refinement: a reviewed diff becomes an attributed story revision.
        check("the seeded revision shows what the demo admin applied earlier",
              admin.locator("#story-refinement >> text=by E2E Admin").count() == 1)
        admin.check("input[aria-label='Select finding State who may override a classification']")
        admin.click("button:has-text('Preview story changes (1)')")
        expect(admin.locator("text=+ Requirement: State who may override a classification")).to_be_visible()
        check("the proposed change is shown as a diff against the approved story",
              admin.locator("text=Proposed change to the approved story (revision 2 → 3)").count() == 1)
        admin.click("button:has-text('Apply as a new story revision')")
        expect(admin.locator("text=Story revision 3 saved")).to_be_visible()
        admin.fill("input[aria-label='Reason for State how long a return authorisation number stays valid']", "ask the dealer council first")
        admin.click("tr:has-text('State how long a return authorisation number stays valid') >> button:has-text('Defer')")
        expect(admin.locator(".badge:has-text('deferred')")).to_be_visible()
        check("the revision is attributed and the design is flagged", admin.locator("text=story revised").count() >= 1
              and admin.locator(".badge:has-text('applied in r3')").count() == 1)
        admin.screenshot(path=f"{SHOTS}/4b-story-refinement.png", full_page=True)

        # 5. Another authorised browser: the Domain Owner assigned to the story's domain.
        do = login(browser, "do@e2e.local", DO_PW)
        open_story(do)
        check("the Domain Owner sees the same persisted mapping and can review",
              do.locator("text=Processes confirmed").count() == 1 and do.locator("button:has-text('Confirm selected processes')").count() == 1)
        do.click("summary:has-text('Edit this map')")
        do.select_option("select[aria-label='Step 3 basis']", "confirmed")
        do.fill("input[aria-label='Step 3 confirmation']", "walkthrough with the warehouse lead (demo)")
        do.fill("input[aria-label='Map change note']", "inspection step confirmed")
        do.click("button:has-text('Save as new version')")
        expect(do.locator("text=Saved to-be map version 2 (material change)")).to_be_visible()
        expect(do.locator("button:has-text('v2')").first).to_be_visible()
        check("a material map change is a new version", do.locator("button:has-text('v2')").count() >= 1)
        open_story(do, "S-BW-WRITEOFF")
        do.fill("input[aria-label='Add process node ids']", "SYN-6.1.2")
        do.click("button:has-text('Confirm selected processes')")
        expect(do.locator("text=Processes confirmed")).to_be_visible()
        check("the Domain Owner confirmed a mapping for a second story in the domain",
              do.locator("text=by E2E Domain Owner (returns)").count() == 1)
        do.screenshot(path=f"{SHOTS}/5-domain-owner.png", full_page=True)

        cnc = login(browser, "cnc@e2e.local", CNC_PW)
        open_story(cnc)
        check("a CNC operator cannot decide processes or edit maps",
              cnc.locator("text=Only a Product Manager, or the Domain Owner assigned").count() == 1
              and cnc.locator("summary:has-text('Edit this map')").count() == 0)

    else:
        # After a restart, in a fresh browser: everything is still there.
        go(admin, "Admin", "Process Framework")
        expect(admin.locator(".badge:has-text('superseded')").first).to_be_visible()
        check("after restart: framework v2 active, v1 superseded and still viewable",
              admin.locator("td >> .badge:has-text('active')").count() == 1 and admin.locator("td >> .badge:has-text('superseded')").count() == 1)
        open_story(admin)
        check("after restart: mapping, references and the map versions survive",
              admin.locator(".badge:has-text('changed in the active version')").count() == 1
              and admin.locator("button:has-text('v2')").count() >= 1)
        admin.click("nav[aria-label='Story journey'] >> text=As-built record")
        expect(admin.locator("button:has-text('v1 · final')")).to_be_visible()
        check("after restart: the finalised record survives and new drafts cannot be finalised while the design is flagged",
              admin.locator("button:has-text('v1 · final')").count() == 1
              and admin.locator("li:has-text('Design not awaiting reassessment') >> .badge:has-text('missing')").count() == 1)
        admin.click("button:has-text('Generate new version')")
        expect(admin.locator("h2:has-text('version 2')")).to_be_visible()
        check("a new draft lists the framework change as an unresolved limitation and cannot be finalised",
              admin.locator("text=Cannot finalise: required checkpoints are missing.").count() == 1
              and admin.locator("text=differs in active version 2").count() >= 1)
        open_story(admin)
        expect(admin.locator("#story-refinement >> .badge:has-text('deferred')")).to_be_visible()
        check("after restart: story revisions and finding decisions survive",
              admin.locator("#story-refinement >> text=r3").count() >= 1
              and admin.locator("text=ask the dealer council first").count() == 1)
        admin.screenshot(path=f"{SHOTS}/6-after-restart.png", full_page=True)
    browser.close()

passed = sum(ok for _, ok in results)
print(f"{passed}/{len(results)} checks passed (phase {PHASE})")
sys.exit(0 if passed == len(results) else 1)
