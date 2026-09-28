"""Journeys 2 and 3 -- a Domain Owner's request taken through to a verified change and a final as-built record,
with the Application Manager's decisions and recorded delivery in between. Runs against the model-boundary backend
(model_boundary_backend.py) so the agents' answers are scripted; everything else is the real application, and the
Architect's reads, the before-value, the read-back and the test Orchestration go over TLS to the AIS stand-in."""
import os
import subprocess
import sys

from lib import HERE, act, browser, check, done, go, login, new_page, next_step, save, shot, sync_playwright

TITLE = os.environ.get("JADE_E2E_STORY_TITLE", "Webshop orders should be normal sales orders")


def dev_apply(value):
    """A person sets the processing option in JD Edwards DEV."""
    subprocess.run([sys.executable, os.path.join(HERE, "dev_apply.py"), "P4210", "CIQ0001", "PDOCTYPE", value], check=True)


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
    dev_apply("S3")  # DEV holds the value before the change

    # Domain Owner raises the request; the agents write the story.
    page = new_page(b)
    login(page, "do")
    go(page, "/stories/new")
    page.fill("#nr-title", TITLE)
    page.select_option("#nr-source", "Support / Topdesk")
    page.fill("#nr-ref", "Topdesk #4521")
    page.fill("#nr-req", "Orders from the webshop come in as S3 direct ship. They should be normal SO orders so the "
                         "warehouse picks them. Version CIQ0001 of sales order entry is the webshop one.")
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
    check("after approval for delivery the Architect proposes a solution with its exact change",
          "Review JADE's proposed solution" in step)
    pg.context.close()

    pg, step, full = as_(b, "am", path, ("link", "Open in Architecture Review"))
    check("before approval, the current value is announced as read at approval (never shown as empty)",
          "read live from JD Edwards when the change is approved" in full)
    act(pg, ("click", "Approve exact change"), ("confirm", "Approve exact change"), ("wait", 3000))
    full = pg.inner_text("main")
    check("approving reads the current value live and shows it", "S3" in full and "read when approved: live AIS read" in full)
    pg.context.close()

    dev_apply("SO")  # a person applies exactly the approved value in DEV

    pg, step, full = as_(b, "am", path, ("link", "Open in Delivery"),
                         ("fill", "Note", "Set PDOCTYPE to SO in P4210 processing options, version CIQ0001 (DEV)"),
                         ("click", "Record applied in DEV"), ("wait", 3000))
    check("recording the change reads the applied value back live", "Read back live by JADE" in full and "SO" in full)
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
