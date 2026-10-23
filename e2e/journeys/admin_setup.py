"""Journey 1 -- the Jade Administrator sets up a customer from an empty installation, entirely in the browser:
own account, customer, people, AI key and agent packs, Jira, the JD Edwards connection (addresses, certificates,
read and change users, Test; optional customer assurance), the agent execution switches,
engagement scope and approval policy, business domain,
invitations accepted, Domain Owner assigned."""
import os
import re

from lib import (WORK, act, browser, buttons, check, done, go, labels, load, login, new_page, pw, save,
                 shot, sync_playwright)

AIS = os.environ.get("JADE_E2E_AIS", "https://127.0.0.1:7443")
CERT = os.path.join(WORK, "ais_cert.pem")
FAKE_AI_KEY = "sk-ant-api03-journey-NOT-A-REAL-KEY-" + "x" * 30


def fill(page, label, value):
    page.get_by_label(label, exact=True).first.fill(value)


def finish_setup(b):
    page = new_page(b)
    login(page, "setup")
    check("a fresh installation starts with one ordinary customer and no stories",
          re.search(r"Stories in progress\s*0\b", page.inner_text("main")) is not None)
    fill(page, "Your email", "owner@consultiq.example")
    fill(page, "Your name", "Hendro Owner")
    fill(page, "Choose a password", pw("owner"))
    fill(page, "Repeat the password", pw("owner"))
    page.click("button:has-text('Create my account and switch off the setup account')")
    page.wait_for_timeout(2500)
    login(page, "owner")
    check("the owner signs in with their own administrator account", "Finish setup" not in page.inner_text("body"))
    page.context.close()


def customer_and_people(page):
    go(page, "/admin/organisation")
    page.click("button:has-text('Edit customer')")
    fill(page, "Customer name", "Acme Manufacturing BV")
    fill(page, "Short name", "Acme")
    fill(page, "JDE Tools Release", "9.2.8.2")
    fill(page, "JDE environment", "JDV920")
    page.click("button:has-text('Save customer')")
    page.wait_for_timeout(1500)
    go(page, "/admin/organisation")
    check("the first customer is renamed and saved", "Acme Manufacturing BV" in page.inner_text("main"))
    links = {}
    go(page, "/admin/organisation/users")
    for email, role in (("do@acme.example", "Domain Owner"), ("am@acme.example", "Application Manager"),
                        ("cnc@acme.example", "CNC Operator")):
        page.click("button:has-text('Invite user')")
        page.fill("#inviteEmail", email)
        page.get_by_label(role, exact=True).check()
        page.click("button:has-text('Send invitation')")
        note = page.locator("[role=status]:has-text('Not e-mailed')")
        note.wait_for(timeout=10000)
        text = note.inner_text()
        links[email] = re.search(r"(http\S+acceptInvitation=\S+)", text).group(1)
        check(f"inviting {email} says truthfully it was not e-mailed and gives the link",
              "not set up on this server" in text and "acceptInvitation=" in text)
        page.click("button:has-text('Close')")
        page.wait_for_timeout(500)
    save("links.json", links)


def ai_connection(page):
    go(page, "/admin/agents/ai")
    key = page.get_by_label("Anthropic API key", exact=True)
    if key.count() == 0:
        key = page.get_by_label("Replace the API key", exact=True)
    check("the API key can be entered before any other AI setting", key.is_enabled())
    key.fill(FAKE_AI_KEY)
    page.click("button:has-text('Save key')")
    page.wait_for_timeout(2000)
    check("saving the key says what was stored, and never shows the key",
          FAKE_AI_KEY not in page.content() and "…xxxx" in page.inner_text("main"))
    go(page, "/admin/agents/configuration")
    for agent in ("Receive Agent", "Improve Agent", "Requirements (Check) Agent", "Architect Agent",
                  "Functional Agent", "Technical Agent", "Process Analyst", "Test Design Agent",
                  "Regression Scope Agent", "Test Execution Agent", "Result Assessment Agent", "Validation Summary Agent"):
        sel = page.locator(f"select[aria-label='Pack for {agent}']")
        if sel.count() == 0:
            continue
        sel.select_option(index=1)
        page.wait_for_timeout(300)
        sel.locator("xpath=following::button[1]").click()
        page.wait_for_timeout(1200)
    go(page, "/admin/agents/configuration")
    check("every agent has a Start-up Pack assigned", page.locator("text=none — this agent cannot run").count() == 0)


def jira(page):
    go(page, "/admin/connections/jira")
    page.click("button:has-text('Configure')")
    page.wait_for_timeout(600)
    page.fill("#jiraBaseUrl", "https://acme-journey.atlassian.net")
    page.fill("#jiraProjectKey", "ACM")
    page.fill("#jiraEmail", "jade-bot@acme.example")
    page.fill("#jiraPickupStatus", "Ready for Jade")
    page.fill("#jiraPostPickupStatus", "With Jade")
    page.fill("#jiraJadeIdField", "customfield_10100")
    page.click("button:has-text('Save Jira configuration')")
    page.wait_for_timeout(1500)
    txt = page.inner_text("main").lower()
    check("a Jira configuration without an API token is refused with the reason",
          "token" in txt and ("nothing was saved" in txt or "enter" in txt))
    if page.locator("#jiraApiToken").count() == 0:
        page.click("button:has-text('Configure')")
        page.wait_for_timeout(600)
    page.fill("#jiraApiToken", "journey-token-not-real")
    page.click("button:has-text('Save Jira configuration')")
    page.wait_for_timeout(2000)
    go(page, "/admin/connections/jira")
    check("the Jira site and credential are stored, the token never shown",
          "acme-journey.atlassian.net" in page.inner_text("main") and "journey-token-not-real" not in page.content())


def jde_connection(page):
    """The JD Edwards connection on one form: AIS and web client addresses (with their self-signed certificates),
    the environment, and the JD Edwards users -- a read user and a change user (the change user also signs in to
    the web client when no separate web client user is given). Save, then Test: the agents can use it at once.
    Customer assurance is optional and recorded under the collapsed section."""
    go(page, "/admin/connections/jde")
    page.wait_for_selector("#jde-ais", timeout=10000)
    check("there is no simulation choice: the connection is always the customer's live AIS",
          page.locator("text=/[Ss]imulation/").count() == 0)
    check("a new connection opens straight on the form, with no attestations or window to fill first",
          page.locator("text=/attest|isolation|window/i").count() == 0)
    page.fill("#jde-ais", AIS)
    page.set_input_files("input[aria-label='AIS certificate file']", CERT)
    page.wait_for_selector("[aria-label='Uploaded certificate']", timeout=10000)
    page.fill("#jde-env", "JDV920")
    page.fill("#jde-web", open(os.path.join(WORK, "web_url.txt")).read().strip())
    page.set_input_files("input[aria-label='Web client certificate file']", os.path.join(WORK, "web_cert.pem"))
    page.wait_for_timeout(800)
    users = page.locator("table[aria-label='JD Edwards users']")
    read, change = users.locator("tbody tr").nth(0), users.locator("tbody tr").nth(1)
    read.locator("input").nth(0).fill("JADEDISC")
    read.locator("input").nth(1).fill("JADEDISC")
    read.locator("input").nth(2).fill(os.environ["JADE_E2E_JDE_PW"])
    change.locator("input").nth(0).fill("JADEWRITE")
    change.locator("input").nth(1).fill("JADEWRITE")
    change.locator("input").nth(2).fill(os.environ["JADE_E2E_WRITE_PW"])
    shot(page, "admin-jde-form")
    page.locator("section[aria-label='JD Edwards connection'] button:text-is('Save')").click()
    page.wait_for_selector("text=/Saved: /", timeout=20000)
    check("the connection, read user, web client and change user are saved in one go",
          all(w in page.inner_text("main") for w in ("read user JADEDISC", "change user JADEWRITE", "web client")))
    check("the JD Edwards passwords are stored encrypted and never shown",
          os.environ["JADE_E2E_JDE_PW"] not in page.content() and os.environ["JADE_E2E_WRITE_PW"] not in page.content())

    page.locator("section[aria-label='JD Edwards connection'] button:text-is('Test')").click()
    page.wait_for_selector("table[aria-label='Test results']", timeout=120000)
    rows = page.locator("table[aria-label='Test results'] tbody tr")
    states = [rows.nth(i).locator("td").nth(1).inner_text().strip() for i in range(rows.count())]
    check("Test signs in the read user (AIS, verified TLS), the change user (AIS) and the web client user",
          states == ["ok", "ok", "ok"])
    main = page.inner_text("main")
    check("after a passed Test the agents can use the connection -- no attestations, window or Enable step",
          "Agents can use this connection" in main)
    routes = page.locator("table[aria-label='Agent routes']").inner_text()
    check("research, AIS changes and web client changes are all ready", "Not ready" not in routes and routes.count("Ready") >= 3)
    check("the path code is read from JD Edwards (F00941) during Test", "DV920" in main)
    shot(page, "admin-jde")

    # Optional: customer assurance, recorded -- it never blocks the agents.
    page.click("summary:has-text('Optional: customer assurance')")
    evidence = os.path.join(WORK, "security_workbench_export.txt")
    open(evidence, "w").write("Security Workbench export -- user JADEDISC, role JADEDISC. Read-only.\n")
    page.click("summary:has-text('Import an approved export or document')")
    d = page.locator("details:has(summary:has-text('Import an approved export'))")
    d.get_by_label("Kind").select_option("reference_document")
    d.get_by_label("Format").select_option("text")
    d.get_by_label("Object name").fill("JADEDISC")
    d.get_by_label("Object type").fill("SECURITY")
    d.get_by_label("Exported at").fill("2026-09-27T10:00")
    d.get_by_label("Document title").fill("Security Workbench export for JADEDISC")
    d.locator("input[type=file]").set_input_files(evidence)
    d.locator("button:has-text('Import')").click()
    page.wait_for_timeout(2000)
    page.click("button:has-text('Edit customer assurance and restrictions')")
    page.wait_for_timeout(600)
    for label, value in (("Connection name", "Acme DEV (JDV920)"), ("Customer contact", "Acme IT (Pat)"),
                         ("CNC contact", "Acme CNC (Chris)"),
                         ("Privilege statement", "JADEDISC: read-only role"),
                         ("Verified JDE user", "JADEDISC"), ("Verified role", "JADEDISC"),
                         ("Verified by", "Acme security lead"), ("Verified on", "2026-09-25")):
        fill(page, label, value)
    page.get_by_label("Privilege confirmed", exact=True).check()
    boxes = page.locator("input[aria-label^='Verification evidence documents: ']")
    check("a newly imported document can be linked as verification evidence straight away", boxes.count() >= 1)
    boxes.first.check()
    page.locator("details:has(summary:has-text('Optional: customer assurance')) button:text-is('Save')").click()
    page.wait_for_timeout(2000)
    go(page, "/admin/connections/jde")
    check("recording customer assurance keeps the connection usable", "Agents can use this connection" in page.inner_text("main"))


def agent_execution(page):
    """The switches under Governance: agent execution on/off per capability, recorded with name and reason."""
    go(page, "/admin/governance/agent-execution")
    page.fill("#switch-reason", "walkthrough: switch test")
    page.locator("tr:has-text('document_type_definition') button:has-text('Switch off')").click()
    page.wait_for_timeout(1200)
    page.locator("tr:has-text('document_type_definition') button:has-text('Switch on')").click()
    page.wait_for_timeout(1200)
    page.click("summary:has-text('Change log')")
    log = page.inner_text("main")
    check("switching agent execution off and on is recorded with name and reason",
          "switched off for document_type_definition (walkthrough: switch test)" in log
          and "switched on for document_type_definition" in log)


def governance(page):
    go(page, "/admin/governance")
    page.click("button:has-text('Edit')")
    page.wait_for_timeout(800)
    page.locator("fieldset:has(legend:has-text('Functional Agent may change')) label:has-text('User defined codes') input").check()
    page.locator("fieldset:has(legend:has-text('Technical Agent may prepare')) label:has-text('(BSFN)') input").check()
    page.locator("fieldset:has(legend:has-text('Technical Agent may prepare')) label:has-text('(NER)') input").check()
    page.locator("fieldset:has(legend:has-text('Who approves a change')) label:has-text('Application Manager') input").check()
    page.fill("#policyHours", "72")
    page.fill("#devEnvironmentId", "JDV920")
    page.fill("#devPathCode", "DV920")
    page.click("summary:has-text('Advanced')")
    page.fill("#toolsRelease", "9.2.8.2")
    page.fill("#aisDataSourceName", "Business Data - DEV")
    page.locator("label:has-text('Configuration change') input").check()
    page.locator("label:has-text('AIS orchestration') input").check()
    page.fill("#approvedVersions",
              "processing_option_update|document_and_order_types|P4210|CIQ0001|PDOCTYPE|SO,SW|Webshop order entry")
    page.fill("#approvedConfiguration",
              "udc_value_maintenance|document_and_order_types|00/DT|DRDL01,DRSPHD|add,update||Order types\n"
              "document_type_definition|document_and_order_types|F40039:DCTO=SW|DCT4,DCDL01|add|DCT4=SO|Webshop order type")
    page.fill("#approvedTests", "ORCH_SO|creates_dev_transaction|Creates one DEV sales order and reads it back")
    page.fill("#functionalApprovers", "Sanne (Application Manager)")
    page.fill("#reservedProductCode", "55")
    page.fill("#namingPrefix", "CIQ")
    page.click("button:has-text('Save engagement scope')")
    page.wait_for_timeout(2500)
    main = page.inner_text("main")
    check("the engagement scope is saved with its approved version, configuration, test and DEV binding",
          "never configured" not in main and "P4210" in main and "ORCH_SO" in main and "JDV920" in main
          and "F40039:DCTO=SW" in main and "00/DT" in main and "User defined codes (UDC values)" in main
          and "BSFN, NER" in main)
    check("the JD Edwards connection is shown as this customer's own", "deployment-wide" not in main)


def domain_and_people(b, page):
    go(page, "/admin/business-model")
    page.click("button:has-text('New domain')")
    page.wait_for_timeout(600)
    page.get_by_label("Domain code (customer reference)").fill("2.0")
    lv = page.get_by_label("Level (dotted depth, matches the domain code)")
    lv.select_option(index=1) if lv.evaluate("e => e.tagName") == "SELECT" else lv.fill("2")
    page.get_by_label("Name", exact=True).fill("Order to Cash")
    page.get_by_label("Description (optional)").fill("Sales order entry through invoicing")
    page.click("button:has-text('Create domain')")
    page.wait_for_timeout(1500)
    check("the Order to Cash domain exists", "Order to Cash" in page.inner_text("main"))
    names = {"do@acme.example": ("Daan Domain", "do"), "am@acme.example": ("Sanne Appman", "am"),
             "cnc@acme.example": ("Kees CNC", "cnc")}
    for email, url in load("links.json").items():
        name, who = names[email]
        pg = new_page(b)
        pg.goto(url)
        pg.wait_for_timeout(1200)
        pg.get_by_label("Your name").fill(name)
        pg.get_by_label("Choose a password").fill(pw(who))
        pg.click("button:has-text('Create account and join')")
        try:
            pg.wait_for_selector(".appbar", timeout=15000)
            ok = True
        except Exception:  # noqa: BLE001
            ok = False
        check(f"{email} accepts the invitation and is signed in", ok)
        pg.context.close()
    go(page, "/admin/organisation/users")
    page.locator("tr:has-text('do@acme.example') button:has-text('Edit roles')").click()
    page.wait_for_timeout(600)
    page.get_by_label("Order to Cash").check()
    page.locator("button:text-is('Save')").click()
    page.wait_for_timeout(1500)
    go(page, "/admin/business-model")
    check("Daan owns Order to Cash", "Daan Domain" in page.inner_text("main"))


with sync_playwright() as p:
    b = browser(p)
    finish_setup(b)
    page = new_page(b)
    login(page, "owner")
    customer_and_people(page)
    ai_connection(page)
    jira(page)
    jde_connection(page)
    agent_execution(page)
    governance(page)
    domain_and_people(b, page)
    b.close()
done()
