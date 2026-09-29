"""Journey 1 -- the Jade Administrator sets up a customer from an empty installation, entirely in the browser:
own account, customer, people, AI key and agent packs, Jira, the JD Edwards connection (certificate, credential,
evidence, Test Connection, approved reads, Enable), agent execution (web client, DEV write user, Test, switches),
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
          "0\nstories in progress" in page.inner_text("main"))
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
                  "Functional Agent", "Technical Agent", "Process Analyst"):
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
    go(page, "/admin/connections/jde")
    page.click("button:has-text('Set up')")
    page.wait_for_timeout(800)
    check("there is no simulation choice: the connection is always the customer's live AIS",
          page.locator("text=/[Ss]imulation/").count() == 0)
    fill(page, "Connection name", "Acme DEV (JDV920)")
    fill(page, "AIS HTTPS address", AIS)
    page.set_input_files("input[aria-label='AIS certificate file']", CERT)
    page.wait_for_selector("[aria-label='Uploaded certificate']", timeout=10000)
    for label, value in (("JDE environment", "JDV920"), ("JDE role", "JADEDISC"), ("Application release", "9.2"),
                         ("Tools release", "9.2.8.2"), ("Path code", "DV920"), ("Customer contact", "Acme IT (Pat)"),
                         ("CNC contact", "Acme CNC (Chris)"),
                         ("Network access notes", "Site-to-site VPN from the Jade backend to the DEV AIS server only"),
                         ("Isolation evidence", "CNC ticket CNC-12: JDV920 maps to DEV data only"),
                         ("Privilege statement", "JADEDISC: read-only role limited to the approved tables"),
                         ("Runtime attestation", "CNC (Chris, CNC-12): JDV920 runs path code DV920 on Tools 9.2.8.2"),
                         ("Verified JDE user", "JADEDISC"), ("Verified role", "JADEDISC"),
                         ("Verified by", "Acme security lead"), ("Verified on", "2026-09-25"),
                         ("Backend source address", "203.0.113.10"),
                         ("Network restriction evidence", "Acme firewall rule 7 allows the AIS port from 203.0.113.10 only")):
        fill(page, label, value)
    for box in ("Routing and isolation confirmed", "Privilege confirmed", "Runtime attested", "Permits approved reads",
                "Rejects prohibited operations", "Restricted to source"):
        page.get_by_label(box, exact=True).check()
    page.get_by_label("Verification method", exact=True).select_option(index=1)
    reads = [("udc_values", "00/DT", "DRSY, DRRT, DRKY, DRDL01, DRSPHD", "DRKY"),
             ("processing_option_values", "P4210|CIQ0001", "", ""),
             ("table_browse", "F00941, F40039", "EMENHV, EMPATHCD, DCTO, DCT4, DCDL01", "EMENHV, DCTO")]
    for i, (cap, target, fields, filt) in enumerate(reads, start=1):
        page.click("button:has-text('Add approved read')")
        page.wait_for_timeout(400)
        page.select_option(f"select[aria-label='Read {i} capability']", cap)
        page.get_by_label(f"Read {i} targets").fill(target)
        if fields:
            page.get_by_label(f"Read {i} fields").fill(fields)
        if filt:
            page.get_by_label(f"Read {i} filter fields").fill(filt)
    fill(page, "Records per query", "5")
    page.click("button:has-text('Save')")
    page.wait_for_timeout(2500)
    check("the JD Edwards connection settings are saved", "Edit settings" in buttons(page))

    # Credential
    page.get_by_label("JDE user", exact=True).fill("JADEDISC")
    page.get_by_label("JDE password", exact=True).fill(os.environ["JADE_E2E_JDE_PW"])
    page.click("button:has-text('Save credential')")
    page.wait_for_timeout(1500)
    check("the JDE password is stored encrypted and never shown", os.environ["JADE_E2E_JDE_PW"] not in page.content())

    # Evidence that the JDE user is narrowly privileged: imported, then linked without reloading the page.
    evidence = os.path.join(WORK, "security_workbench_export.txt")
    open(evidence, "w").write("Security Workbench export -- user JADEDISC, role JADEDISC. Read-only; approved tables only.\n")
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
    page.click("button:has-text('Edit settings')")
    page.wait_for_timeout(800)
    boxes = page.locator("input[aria-label^='Verification evidence documents: ']")
    check("a newly imported document can be linked as verification evidence straight away", boxes.count() >= 1)
    boxes.first.check()
    page.locator("button:text-is('Save')").click()
    page.wait_for_timeout(2000)

    # Test Connection, approved sample reads, Enable
    page.click("button:has-text('Test Connection')")
    page.wait_for_selector("text=/Test Connection: /", timeout=60000)
    check("Test Connection reaches the AIS server over verified TLS and signs in",
          "ok" in page.locator("[role=status]").first.inner_text().lower())
    for cap, target in (("udc_values", "00/DT"), ("processing_option_values", "P4210|CIQ0001"), ("table_browse", "F00941")):
        page.get_by_label("Sample read capability", exact=True).select_option(cap)
        page.wait_for_timeout(300)
        t = page.get_by_label("Sample read target", exact=True)
        t.select_option(target) if t.evaluate("e => e.tagName") == "SELECT" else t.fill(target)
        page.click("button:has-text('Preview exact request')")
        page.wait_for_timeout(800)
        page.click("button:has-text('Run Approved Sample Read')")
        page.wait_for_timeout(2500)
        check(f"approved sample read {cap} {target} succeeds",
              "ok" in page.locator("[role=status]").first.inner_text().lower())
    go(page, "/admin/connections/jde")
    enable = page.locator("button:has-text('Enable Architect Discovery')")
    check("with every readiness item satisfied, Enable is available", enable.is_enabled())
    enable.click()
    page.wait_for_timeout(2500)
    go(page, "/admin/connections/jde")
    check("the JD Edwards connection is enabled",
          "Readiness for discovery: ready" in page.inner_text("main")
          and not page.locator("button:has-text('Enable Architect Discovery')").is_enabled())
    shot(page, "admin-jde")


def agent_execution(page):
    """The agents' access to DEV: the web client, its certificate, the DEV write user (separate from the read-only
    discovery user), Test -- and the switches under Governance."""
    go(page, "/admin/connections/jde")
    panel = page.locator("section[aria-label='Agent execution']")
    panel.locator("button:has-text('Set up')").click()
    page.wait_for_timeout(500)
    page.fill("#exec-web", open(os.path.join(WORK, "web_url.txt")).read().strip())
    page.set_input_files("input[aria-label='Web client certificate file']", os.path.join(WORK, "web_cert.pem"))
    page.wait_for_timeout(800)
    page.fill("#exec-role", "JADEWRITE")
    panel.locator("button:has-text('Save settings')").click()
    page.wait_for_timeout(1500)
    page.fill("#exec-user", "JADEWRITE")
    page.fill("#exec-password", os.environ["JADE_E2E_WRITE_PW"])
    panel.locator("button:has-text('Save write user')").click()
    page.wait_for_timeout(1500)
    check("the DEV write user is stored encrypted and never shown",
          os.environ["JADE_E2E_WRITE_PW"] not in page.content() and "encrypted" in panel.inner_text())
    panel.locator("button:text-is('Test')").click()
    page.wait_for_selector("text=/Test: /", timeout=90000)
    status = panel.locator("[role=status]").first.inner_text()
    check("Test signs the write user in to AIS and to the web client (in the agents' browser)",
          "signs in to AIS: ok" in status and "signs in to the web client: ok" in status)
    routes = page.locator("table[aria-label='Agent routes']").inner_text()
    check("both agent routes are ready", routes.count("Ready") >= 2 and "Not ready" not in routes)
    shot(page, "admin-agent-execution")
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
    page.fill("#toolsRelease", "9.2.8.2")
    page.locator("fieldset:has(legend:has-text('Approval policy')) label:has-text('Application Manager') input").check()
    page.fill("#policyHours", "72")
    page.fill("#devEnvironmentId", "JDV920")
    page.fill("#devPathCode", "DV920")
    page.fill("#aisDataSourceName", "Business Data - DEV")
    page.locator("label:has-text('OCM mappings') input[type=checkbox]").check()
    page.fill("#isolationEvidence", "CNC checked OCM for JDV920: business data maps to the DEV data source only (CNC-118)")
    page.locator("label:has-text('Configuration change') input").check()
    page.locator("label:has-text('AIS orchestration') input").check()
    page.fill("#approvedVersions",
              "processing_option_update|document_and_order_types|P4210|CIQ0001|PDOCTYPE|SO,SW|Webshop order entry")
    page.fill("#approvedConfiguration",
              "udc_value_maintenance|document_and_order_types|00/DT|DRDL01,DRSPHD|add,update||Order types\n"
              "document_type_definition|document_and_order_types|F40039:DCTO=SW|DCT4,DCDL01|add|DCT4=SO|Webshop order type")
    page.fill("#approvedTests", "ORCH_SO|creates_dev_transaction|Creates one DEV sales order and reads it back")
    page.fill("#functionalApprovers", "Sanne (Application Manager)")
    page.fill("#objectTypes", "BSFN\nER")
    page.fill("#reservedProductCode", "55")
    page.fill("#namingPrefix", "CIQ")
    page.click("button:has-text('Save engagement scope')")
    page.wait_for_timeout(2500)
    main = page.inner_text("main")
    check("the engagement scope is saved with its approved version, configuration, test and DEV binding",
          "never configured" not in main and "P4210" in main and "ORCH_SO" in main and "JDV920" in main
          and "F40039:DCTO=SW" in main and "00/DT" in main)
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
