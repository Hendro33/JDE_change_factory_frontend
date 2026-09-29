"""After the backend restarts, everything the Administrator configured is still there, and the journeys continue.
Run it after stopping and starting the backend (run.sh does this)."""
import os

from lib import browser, buttons, check, done, go, labels, load, login, new_page, sync_playwright

with sync_playwright() as p:
    b = browser(p)
    page = new_page(b)
    login(page, "owner")
    go(page, "/admin/connections/jde")
    check("the JD Edwards connection is remembered and still enabled",
          "Readiness for discovery: ready" in page.inner_text("main")
          and not page.locator("button:has-text('Enable Architect Discovery')").is_enabled())
    check("the JDE credential is remembered and never shown",
          "Replace credential" in buttons(page) and os.environ["JADE_E2E_JDE_PW"] not in page.content())
    agents = page.locator("section[aria-label='Agent execution']").inner_text()
    check("the agents' DEV write user and web client are remembered, the password never shown",
          "JA" in agents and "encrypted" in agents and "Ready" in page.locator("table[aria-label='Agent routes']").inner_text()
          and os.environ["JADE_E2E_WRITE_PW"] not in page.content())
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
