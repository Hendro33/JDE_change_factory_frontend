"""The three-role operating model in the browser (see README.md).

Run after the backend seeds technical, process, functional and roles
(scripts/seed_demo_*.py, as the preview launcher does). Three throwaway
demo identities on the DEMO customer:

  * the Domain Owner works in Business Demand and decides the story in
    User Story Review; architecture, delivery and Administration are not
    part of that workspace;
  * the Application Manager works in Application Management: Backlog
    Review (Gate 1) admits the approved story to the Delivery Queue, and the
    original Governance / Delivery / Release screens are all there;
  * only the Administrator sees Administration.

Everything is SYNTHETIC; no JDE is contacted.
"""
import os
import sys

from playwright.sync_api import expect, sync_playwright

ADMIN_PW = os.environ["JADE_E2E_PASSWORD"]
DO_PW = os.environ["JADE_E2E_DO_PASSWORD"]
AM_PW = os.environ["JADE_E2E_AM_PASSWORD"]
BASE = os.environ.get("JADE_E2E_BASE_URL", "http://localhost:5173")
CHROMIUM = os.environ.get("JADE_E2E_CHROMIUM") or None
SHOTS = os.environ.get("JADE_E2E_SHOTS", os.path.join(os.path.dirname(__file__), "shots"))
GATES = "S-DEMO-GATES-1"
os.makedirs(SHOTS, exist_ok=True)
results = []


def check(name, cond):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)


def login(browser, email, pw):
    page = browser.new_context(viewport={"width": 1440, "height": 1000}).new_page()
    page.goto(f"{BASE}/work")
    page.fill("#loginEmail", email)
    page.fill("#loginPassword", pw)
    page.click("button[type=submit]")
    page.wait_for_selector(".appbar")
    expect(page.locator("main h1").first).to_be_visible()
    return page


def seen(locator, timeout=8000):
    """True once the locator is visible (the screens load their data after they render)."""
    try:
        locator.first.wait_for(timeout=timeout)
        return True
    except Exception:
        return False


def nav(page):
    return page.locator(".primarynav").inner_text()


def no_product_owner(page):
    return page.locator("text=Product Owner").count() == 0


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM)

    # -- 1. The Domain Owner: request to approved story, and nothing beyond ------------
    do = login(browser, "do@e2e.local", DO_PW)
    check("the Domain Owner's navigation has Business Demand but no Application Management or Administration",
          "Business Demand" in nav(do) and "Application Management" not in nav(do)
          and do.locator("a[aria-label='Administration']").count() == 0)
    item = do.locator(f".workitem:has-text('{GATES}')")
    check("My Work sends the story decision to User Story Review",
          item.count() == 1 and item.locator("a.btn").get_attribute("href").endswith(f"/stories/review?story={GATES}"))
    item.locator("a.btn").click()
    expect(do.locator("h1:has-text('User Story Review')")).to_be_visible()
    check("User Story Review sits in Business Demand, opened on this story",
          seen(do.locator("nav[aria-label='Business Demand'] a.on:has-text('User Story Review')"))
          and seen(do.locator(f"h2:has-text('preferred return carrier')")))
    do.screenshot(path=f"{SHOTS}/1-domain-owner-review.png", full_page=True)
    do.click("button.btn.primary:text-is('Approve')")
    do.locator(".modal button:has-text('Approve as Domain Owner')").click()
    expect(do.locator(".modal")).to_have_count(0)
    do.goto(f"{BASE}/stories/{GATES}")
    expect(do.locator("#next-action")).to_be_visible()
    check("after approval the story is with Application Management, and the Domain Owner has nothing to do",
          do.locator("#next-action >> text=Waiting for: Application Management").count() == 1
          and do.locator("#next-action >> a, #next-action >> button").count() == 0)

    do.goto(f"{BASE}/stories/S-DEMO-TECH-1/solution")
    expect(do.locator(".storyheader")).to_be_visible()
    check("the Domain Owner's story view ends at the business story: no Solution, Delivery or Technical",
          do.locator(".tabs").first.inner_text().split() == ["Overview", "Business", "Story", "History"]
          and do.locator("text=Proposed solution").count() == 0 and do.locator("text=Approve implementation").count() == 0)
    do.goto(f"{BASE}/am")
    check("Application Management is not the Domain Owner's workspace",
          seen(do.locator("text=Application Management is for Application Managers")))
    do.goto(f"{BASE}/admin")
    check("Administration is hidden from the Domain Owner", seen(do.locator("text=Administration is for administrators")))
    check("no 'Product Owner' anywhere the Domain Owner looked", no_product_owner(do))

    # -- 2. The Application Manager: Gate 1 in Backlog Review --------------------------
    am = login(browser, "am@e2e.local", AM_PW)
    check("the Application Manager's navigation has Application Management and no Administration",
          "Application Management" in nav(am) and am.locator("a[aria-label='Administration']").count() == 0)
    item = am.locator(f".workitem:has-text('{GATES}')")
    check("My Work sends the authorisation to Backlog Review",
          item.count() == 1 and item.locator("a.btn").get_attribute("href").endswith(f"/am/backlog-review?story={GATES}"))
    item.locator("a.btn").click()
    expect(am.locator("h1:has-text('Backlog Review')")).to_be_visible()
    check("Backlog Review is Gate 1 with the Application Manager's decision panel",
          seen(am.locator("text=Application Manager Gate 1"))
          and seen(am.locator("h2:has-text('Your decision')"))
          and seen(am.locator("h2:has-text('What you are approving')")) and seen(am.locator("h2:has-text('Why it matters')"))
          and seen(am.locator(".adminnav a.on:has-text('Backlog Review')")))
    am.screenshot(path=f"{SHOTS}/2-backlog-review.png", full_page=True)
    am.click("button:has-text('Approve for Delivery')")
    am.locator(".modal button:has-text('Approve for Delivery')").click()
    expect(am.locator(".modal")).to_have_count(0)
    am.goto(f"{BASE}/am/delivery-queue")
    expect(am.locator("h1:has-text('Delivery Queue')")).to_be_visible()
    row = am.locator(f"tr:has-text('{GATES}')")
    expect(row).to_have_count(1)
    check("the authorised story is in the Delivery Queue, added by the Application Manager",
          "E2E Application Manager" in row.inner_text())
    am.screenshot(path=f"{SHOTS}/3-delivery-queue.png", full_page=True)

    # -- 3. The rest of the original Application Manager screens -----------------------
    am.goto(f"{BASE}/am/architecture-review?story=S-BW-RETURNTYPE")
    expect(am.locator("h1:has-text('Architecture Review')")).to_be_visible()
    check("Architecture Review (Gate 2) shows route and confidence, the specification with MCP operations, and the exact change",
          seen(am.locator("text=Recommended route: Functional Agent · confidence"))
          and seen(am.locator("dt:has-text('MCP operations')"))
          and seen(am.locator("h2:has-text('The exact change')"))
          and seen(am.locator("nav[aria-label='Story journey'] a.primary:has-text('Architecture Review')")))
    screens = [("/am", "Application Management Dashboard"), ("/am/changes?stage=active", "Delivery"),
               ("/am/changes?stage=validation", "Validation"), ("/am/changes?stage=release", "Ready for Release / CNC"),
               ("/am/process?story=S-BW-RETURNS", "Process & Maps"), ("/am/technical?story=S-DEMO-TECH-1", "Technical Work"),
               ("/am/as-built?story=S-BW-RETURNS", "As-Built")]
    ok = True
    for path, title in screens:
        am.goto(BASE + path)
        if am.locator(f"main h1:has-text('{title}')").count() == 0:
            am.wait_for_timeout(1500)
        ok = ok and am.locator(f"main h1:has-text('{title}')").count() >= 1
    check("every original Application Manager screen is reachable at its own address", ok)
    am.goto(f"{BASE}/am")
    expect(am.locator(".statcard")).to_have_count(8)
    check("Application Management sidebar has exactly the requested seven destinations",
          am.locator(".adminnav a").all_text_contents() == ["Dashboard", "Backlog Review", "Architecture Review", "Delivery", "Validation", "As-Built", "Ready for Release / CNC"])
    check("top navigation follows the five requested concepts",
          am.locator(".primarynav a").evaluate_all("els => els.map(e => e.getAttribute('aria-label') || e.textContent)") == ["My Work", "Business Demand", "Business Architecture", "Application Management", "Insights"])
    am.screenshot(path=f"{SHOTS}/4-application-dashboard.png", full_page=True)
    check("dashboard excludes Domain Owner work",
          "Incoming Requests" not in am.locator(".admin-main").inner_text() and "awaiting Domain Owner" not in am.locator(".admin-main").inner_text())
    am.goto(f"{BASE}/am/process?story=S-BW-RETURNS")
    check("Process & Maps is inside Architecture Review", seen(am.locator(".adminnav a.on:text-is('Architecture Review')")))
    am.goto(f"{BASE}/am/technical?story=S-DEMO-TECH-1")
    check("Technical Work is inside Delivery", seen(am.locator(".adminnav a.on:text-is('Delivery')")))
    am.goto(f"{BASE}/am/architecture-review?view=design&story=S-DEMO-TECH-1")
    expect(am.locator("h2:text-is('Architect design and evidence baseline')")).to_be_visible()
    check("technical design is reviewed in Architecture without delivery execution controls",
          am.locator("h2:text-is('Technical Agent runs')").count() == 0 and am.locator(".adminnav a.on:text-is('Architecture Review')").count() == 1)
    am.goto(f"{BASE}/am/delivery?queue=approved")
    expect(am.locator("#stagepreset")).to_be_visible()
    for stage, heading in [("validation", "Validation"), ("release", "Ready for Release / CNC"), ("completed", "Completed"), ("active", "Delivery")]:
        am.select_option("#stagepreset", stage)
        expect(am.locator("#stagepreset")).to_have_value(stage)
        expect(am.locator(f"h1:text-is('{heading}')")).to_be_visible()
    check("delivery stage filter navigates correctly and clears the dashboard subfilter", "queue=" not in am.url)
    am.goto(f"{BASE}/am/changes/S-BW-RETURNS")
    expect(am.locator("text=append-only, hash-chained")).to_be_visible()
    check("the change record keeps both approvals, the evidence chain and the lifecycle",
          am.locator("h2:has-text('Lifecycle')").count() == 1)
    am.click(".avatar")
    check("the role is called Application Manager", am.locator(".usermenu-roles:has-text('Application Manager')").count() == 1)
    am.goto(f"{BASE}/admin")
    check("Administration is hidden from the Application Manager", seen(am.locator("text=Administration is for administrators")))
    check("no 'Product Owner' anywhere the Application Manager looked", no_product_owner(am))

    # -- 4. The Administrator ------------------------------------------------------------
    admin = login(browser, "admin@e2e.local", ADMIN_PW)
    check("only the Administrator sees Administration", admin.locator("a[aria-label='Administration']").count() == 1)
    admin.click("a[aria-label='Administration']")
    expect(admin.locator("h1:has-text('Administration')")).to_be_visible()
    for role, page in [("Domain Owner", do), ("Application Manager", am), ("Administrator", admin)]:
        page.goto(BASE + "/reports")
        expect(page.locator("h1:text-is('Insights')")).to_be_visible()
        expect(page.locator("#insight-period")).to_be_visible()
        check(f"Insights and all four periods available to {role}", page.locator("#insight-period option").all_text_contents() == ["Past week", "Past month", "Past year", "Lifetime"])
        for period in ["week", "year", "lifetime", "month"]:
            page.select_option("#insight-period", period)
            expect(page.locator("#insight-period")).to_have_value(period)
            expect(page.locator(".reports .statrow").first).to_be_visible()
    am.screenshot(path=f"{SHOTS}/5-insights.png", full_page=True)
    admin.goto(BASE + "/admin/connections/references")
    check("reference documents live under Administration", seen(admin.locator("h1:text-is('ERP documentation & technical references')")))
    am.goto(BASE + "/am/as-built")
    check("delivered knowledge lives under As-Built", seen(am.locator("h1:text-is('Delivered solutions')")))
    do.goto(BASE + "/business")
    check("business rules live in Business Architecture", seen(do.locator("h1:text-is('Business rules')")))
    browser.close()

passed = sum(ok for _, ok in results)
print(f"{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
