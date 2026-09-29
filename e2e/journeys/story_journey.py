"""Journeys 2 and 3 -- a Domain Owner's request taken through to a verified change and a final as-built record,
with the Application Manager's decisions in between and the agents applying the approved change set in DEV.
Runs against the model-boundary backend (model_boundary_backend.py) so the agents' answers are scripted;
everything else is the real application: the Architect's reads, the before-values, the agents' AIS form
requests, the agents' browser in the web client stand-in, the read-backs and the test Orchestration."""
import os
import subprocess
import sys

from lib import HERE, act, browser, check, done, go, login, new_page, next_step, save, shot, sync_playwright

TITLE = os.environ.get("JADE_E2E_STORY_TITLE", "Webshop orders need their own order type")


def dev_apply(*args):
    """Set up JD Edwards DEV as it is before the change (a processing option, or a configuration row)."""
    subprocess.run([sys.executable, os.path.join(HERE, "dev_apply.py"), *args], check=True)


def as_(b, who, path, *actions):
    page = new_page(b)
    login(page, who)
    go(page, path)
    act(page, *actions)
    text = next_step(page)
    full = page.inner_text("main")
    return page, text, full


with sync_playwright() as p:
    b = browser(p)
    dev_apply("P4210", "CIQ0001", "PDOCTYPE", "S3")  # DEV holds the value before the change

    # Domain Owner raises the request; the agents write the story.
    page = new_page(b)
    login(page, "do")
    go(page, "/stories/new")
    page.fill("#nr-title", TITLE)
    page.select_option("#nr-source", "Support / Topdesk")
    page.fill("#nr-ref", "Topdesk #4521")
    page.fill("#nr-req", "Orders from the webshop come in as S3 direct ship. They need their own order type that works "
                         "like SO, so the warehouse picks them and we can report webshop sales separately. Version "
                         "CIQ0001 of sales order entry is the webshop one.")
    page.click("button:has-text('Create request')")
    page.wait_for_url("**/stories/**", timeout=30000)
    page.wait_for_timeout(6000)
    story = page.url.split("/stories/")[1].split("/")[0]
    save("story.json", {"id": story})
    path = f"/stories/{story}"
    check("the Domain Owner's request is analysed into a story awaiting Application Management",
          "Story Review" in page.inner_text("main"))
    page.context.close()

    pg, step, _ = as_(b, "am", path, ("select", "Business domain", "Order to Cash"), ("click", "Assign domain"))
    check("the Application Manager places the story in its business domain", "Order to Cash" in pg.inner_text("main"))
    pg.context.close()

    pg, step, _ = as_(b, "do", path, ("link", "Open in User Story Review"),
                      ("select", "Business impact", "Medium"), ("aria", "Confirm business impact"),
                      ("select", "Business benefit", "Medium"), ("aria", "Confirm business benefit"),
                      ("click", "Approve"), ("confirm", "Approve as Domain Owner"), ("goto", path), ("wait", 1500))
    check("the Domain Owner approves the story; it waits for Application Management", "APPLICATION MANAGEMENT" in step)
    pg.context.close()

    pg, step, _ = as_(b, "am", path, ("link", "Open in Backlog Review"), ("click", "Approve for Delivery"),
                      ("confirm", "Approve for Delivery"), ("wait", 6000), ("goto", path), ("wait", 1500))
    check("after approval for delivery the Architect designs and the Functional Agent proposes the exact change",
          "Review JADE's proposed solution" in step)
    pg.context.close()

    pg, step, full = as_(b, "am", path, ("link", "Open in Architecture Review"))
    check("the exact change is a configuration change set of three items, in the order they are applied",
          "Configuration change set of 3 items" in full and "UDC 00/DT code 'SW'" in full and "F40039" in full
          and "PDOCTYPE = SW" in full)
    check("before approval, the current values are announced as read at approval (never shown as empty)",
          "read live from JD Edwards when the change is approved" in full)
    act(pg, ("click", "Approve exact change"), ("confirm", "Approve exact change"), ("wait", 3000))
    full = pg.inner_text("main")
    check("approving reads the current values live and shows them",
          "S3" in full and "does not exist yet" in full and "read when approved: live AIS read" in full)
    pg.context.close()

    # The agents apply the items in DEV themselves, in order -- I1 and I2 through AIS form requests, I3 in the
    # web client (the agents' browser) -- each read before and after; the person applies nothing.
    pg, step, full = as_(b, "am", path, ("link", "Open in Delivery"))
    for _ in range(40):
        full = pg.inner_text("main")
        if "Applied in DEV (recorded)" in full:
            break
        pg.wait_for_timeout(3000)
        pg.reload(); pg.wait_for_timeout(1500)
    check("each item shows who applies it: the agent through AIS, or in the web client",
          full.count("Agent · AIS") >= 2 and "Agent · web client" in full)
    ok = full.count("Applied by the agent · read back live") >= 3 and "Applied in DEV (recorded)" in full
    if not ok:
        print(full[:3000])
    check("the agents applied every item in DEV and each was read back live", ok)
    check("no item was left for a person to record", "Record I1 applied in DEV" not in full)
    act(pg, ("click", "I3"), ("wait", 2500))
    shots = pg.locator("[aria-label='Screenshots of I3'] img").count()
    check("a screenshot of every step the agent took in the web client is kept", shots >= 5)
    shot(pg, "delivery-agents")
    pg.reload(); pg.wait_for_timeout(2000)
    act(pg, ("click", "Run approved test"), ("wait", 4000))
    full = pg.inner_text("main")
    check("the approved test Orchestration runs live and passes", "ran live" in full and "Passed" in full)
    pg.context.close()

    pg, step, full = as_(b, "am", path, ("link", "Open in As-Built"), ("click", "Generate the as-built record"),
                         ("wait", 2500), ("click", "Finalise and complete the story"), ("wait", 3000))
    check("every delivery checkpoint is complete and the as-built record is final",
          "Every required delivery checkpoint is complete" in full and "final" in full)
    shot(pg, "as-built")
    pg.context.close()

    pg, step, full = as_(b, "do", path)
    check("the Domain Owner sees the story as delivered", "Delivered" in full)
    pg.context.close()
    b.close()
done()
