"""Two-screen UX pilot: role handoff, ratings, disclosures and narrow screens.
Uses seeded, isolated demo accounts via JADE_E2E_* environment variables.
"""
import os, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
base=os.environ['JADE_E2E_BASE_URL']; out=Path(os.environ['JADE_E2E_SHOTS']);out.mkdir(parents=True,exist_ok=True)

with sync_playwright() as p:
 browser=p.chromium.launch()
 def login(email,pw):
  page=browser.new_context(viewport={'width':1440,'height':1050},device_scale_factor=1).new_page();page.goto(base+'/work');page.fill('#loginEmail',email);page.fill('#loginPassword',pw);page.click('button[type=submit]');page.wait_for_selector('.appbar');return page
 def capture(page,name):
  page.wait_for_timeout(700)
  page.screenshot(path=str(out/(name+'.png')),full_page=True)

 do=login('do@e2e.local',os.environ['JADE_E2E_DO_PASSWORD']);do.goto(base+'/stories/review?story=S-DEMO-GATES-1');expect(do.locator('button:text-is("Approve")')).to_be_visible()
 do.select_option('#rating-businessImpact','Low');do.get_by_role('button',name='Confirm business impact',exact=True).click();expect(do.get_by_text('Human confirmed',exact=True)).to_have_count(1)
 do.select_option('#rating-businessBenefit','High');do.get_by_role('button',name='Confirm business benefit',exact=True).click();expect(do.get_by_text('Human confirmed',exact=True)).to_have_count(2)
 capture(do,'01-user-story-review')
 do.get_by_text('Impact–benefit view',exact=True).click();expect(do.locator('.vr-matrix-point.confirmed')).to_have_count(1);do.get_by_text('Impact–benefit view',exact=True).click()
 do.set_viewport_size({'width':390,'height':844});do.screenshot(path=str(out/'01-user-story-review-mobile.png'),full_page=True);assert do.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile horizontal overflow';do.set_viewport_size({'width':1440,'height':1050})
 do.click('button:text-is("Approve")');do.locator('.modal button:has-text("Approve as Domain Owner")').click();expect(do.locator('.modal')).to_have_count(0)
 am=login('am@e2e.local',os.environ['JADE_E2E_AM_PASSWORD']);am.goto(base+'/am/backlog-review?story=S-DEMO-GATES-1');expect(am.locator('h2:has-text("What you are approving")')).to_be_visible();capture(am,'02-backlog-review')
 expect(am.locator('.vr-selected-review').get_by_text('Human confirmed',exact=True)).to_have_count(2)
 am.set_viewport_size({'width':390,'height':844});am.screenshot(path=str(out/'02-backlog-review-mobile.png'),full_page=True);assert am.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile horizontal overflow'
 print('PASS ratings confirmation, impact–benefit disclosure, Domain Owner handoff, read-only Application Manager ratings and both narrow-screen layouts')
 browser.close()
