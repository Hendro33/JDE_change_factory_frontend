"""After the backend restarts, everything the Administrator configured is still there, and the journeys continue.
Run it after stopping and starting the backend (run.sh does this)."""
import os

from lib import browser, check, done, go, labels, load, login, new_page, sync_playwright

with sync_playwright() as p:
    b = browser(p)
    page = new_page(b)
    login(page, "owner")
    go(page, "/admin/connections/jde")
    page.wait_for_selector("section[aria-label='JD Edwards connection']", timeout=15000)
    main = page.inner_text("main")
    check("the JD Edwards connection is remembered and the agents can still use it",
          "Agents can use this connection" in main and "JDV920" in main)
    check("the read and change users are remembered (masked), their passwords never shown",
          main.count("JA•") >= 2 and os.environ["JADE_E2E_JDE_PW"] not in page.content()
          and os.environ["JADE_E2E_WRITE_PW"] not in page.content())
    routes = page.locator("table[aria-label='Agent routes']").inner_text()
    check("the web client is remembered and every agent route is still ready", "Not ready" not in routes)
    go(page, "/admin/connections/jira")
    check("the Jira connection is remembered", "acme-journey.atlassian.net" in page.inner_text("main"))
    go(page, "/admin/agents/ai")
    check("the AI key is remembered (masked)", "Replace the API key" in labels(page))
    go(page, "/admin/governance")
    main = page.inner_text("main")
    check("the engagement scope is remembered", "P4210" in main and "ORCH_SO" in main and "JDV920" in main)
    go(page, "/admin/governance/agent-execution")
    page.click("summary:has-text('Change log')")
    check("the agent execution switches and their change log are remembered",
          "switched off for document_type_definition" in page.inner_text("main"))
    page.context.close()
    page = new_page(b)
    login(page, "do")
    go(page, f"/stories/{load('story.json')['id']}")
    check("the Domain Owner's delivered story is still delivered", "Delivered" in page.inner_text("main"))
    b.close()
done()
