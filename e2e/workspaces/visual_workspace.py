"""Visual rollout checks against isolated seeded demo data; never live JDE."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE=os.environ['JADE_E2E_BASE_URL']
OUT=Path(os.environ['JADE_E2E_SHOTS']);OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch()
    def login(email,key):
        page=browser.new_context(viewport={'width':1440,'height':1050}).new_page()
        page.set_default_navigation_timeout(60000)
        page.goto(BASE+'/work');page.fill('#loginEmail',email);page.fill('#loginPassword',os.environ[key]);page.click('button[type=submit]');expect(page.locator('.appbar')).to_be_visible();return page
    def shot(page,name):
        page.wait_for_timeout(300);page.screenshot(path=str(OUT/(name+'.png')),full_page=True)
    do=login('do@e2e.local','JADE_E2E_DO_PASSWORD')
    for sid in ['S-DEMO-GATES-1','S-UX-RETURNS','S-UX-INVOICE','S-UX-CONTACT']:
        do.goto(BASE+'/stories/review?story='+sid)
        expect(do.get_by_role('button',name='Approve',exact=True)).to_be_visible()
        do.get_by_role('button',name='Approve',exact=True).click();do.locator('.modal button:has-text("Approve as Domain Owner")').click();expect(do.locator('.modal')).to_have_count(0)
    am=login('am@e2e.local','JADE_E2E_AM_PASSWORD');am.goto(BASE+'/am/backlog-review')
    grid=am.locator('[aria-label="Backlog grid"]')
    expect(grid.locator('tbody tr')).to_have_count(4)
    expect(am.locator('.vr-selected-review')).to_have_count(0)
    expect(grid.get_by_text('High',exact=True).first).to_be_visible()
    grid.get_by_role('columnheader',name='Benefit',exact=True).focus();am.keyboard.press('Enter')
    expect(grid.get_by_role('columnheader',name='Benefit',exact=True)).to_have_attribute('aria-sort','ascending')
    expect(grid.locator('tbody tr').first).to_contain_text('S-DEMO-GATES-1')
    am.fill('#wq-search','invoice');expect(grid.locator('tbody tr')).to_have_count(1)
    am.fill('#wq-search','');expect(grid.locator('tbody tr')).to_have_count(4)
    shot(am,'01-backlog-grid')
    grid.locator('button.vr-grid-story').first.click();expect(am.locator('.vr-selected-review')).to_be_visible()
    am.get_by_role('button',name='Close review',exact=True).click();expect(am.locator('.vr-selected-review')).to_have_count(0)
    am.set_viewport_size({'width':390,'height':844});shot(am,'01-backlog-grid-mobile')
    assert am.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Backlog page overflows on mobile'
    am.set_viewport_size({'width':1440,'height':1050})
    am.goto(BASE+'/am/architecture-review?story=S-BW-RETURNTYPE');expect(am.get_by_role('heading',name='Solution at a glance')).to_be_visible();expect(am.get_by_role('heading',name='System integrity')).to_be_visible();shot(am,'02-architecture-review')
    am.goto(BASE+'/stories/S-DEMO-TECH-1/delivery');expect(am.locator('[aria-label="Requirement to delivery evidence"]')).to_be_visible();expect(am.locator('[aria-label="Validation results"]')).to_be_visible();shot(am,'03-delivery-validation')
    am.goto(BASE+'/am/as-built?story=S-BW-RETURNS');expect(am.get_by_role('heading',name='As-Built',exact=True)).to_be_visible()
    generate=am.get_by_role('button',name='Generate the as-built record',exact=True)
    expect(generate).to_be_visible();generate.click()
    expect(am.locator('[aria-label="As-built summary"]')).to_be_visible();shot(am,'04-as-built')
    admin=login('admin@e2e.local','JADE_E2E_PASSWORD');admin.goto(BASE+'/admin/connections');expect(admin.locator('.vr-connection').first).to_be_visible();shot(admin,'05-connections')
    admin.goto(BASE+'/admin/agents');expect(admin.locator('.vr-agent-health').first).to_be_visible();shot(admin,'06-agents')
    admin.goto(BASE+'/reports?period=lifetime');expect(admin.get_by_role('heading',name='Confirmed business benefit')).to_be_visible();expect(admin.locator('#insight-period option')).to_have_count(4);shot(admin,'07-insights')
    am.goto(BASE+'/am');expect(am.get_by_role('heading',name='Application Management Dashboard')).to_be_visible();shot(am,'08-dashboard')
    print('PASS multi-story grid, no default selection, keyboard sorting, search, selection/close, mobile overflow, architecture, delivery evidence, validation, as-built, connections, agent health, Insights periods and dashboard.')
    browser.close()
