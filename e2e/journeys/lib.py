"""Shared helpers for the journey walkthrough (see README.md)."""
import json
import os
import sys

from playwright.sync_api import sync_playwright  # noqa: F401 -- re-exported for the phases

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("JADE_E2E_WORK", os.path.join(HERE, ".work"))
BASE = os.environ.get("JADE_E2E_UI", "http://localhost:5173")
SHOTS = os.path.join(WORK, "shots")
os.makedirs(SHOTS, exist_ok=True)
CHROMIUM = os.environ.get("JADE_E2E_CHROMIUM") or None  # e.g. /opt/pw-browsers/chromium

PEOPLE = {
    "setup": ("setup@jade.local", "JADE_E2E_SETUP_PW"),
    "owner": ("owner@consultiq.example", "JADE_E2E_OWNER_PW"),
    "do": ("do@acme.example", "JADE_E2E_DO_PW"),
    "am": ("am@acme.example", "JADE_E2E_AM_PW"),
    "cnc": ("cnc@acme.example", "JADE_E2E_CNC_PW"),
}
results = []


def pw(who: str) -> str:
    return os.environ[PEOPLE[who][1]]


def check(name, cond):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name, flush=True)


def shot(page, name):
    page.screenshot(path=f"{SHOTS}/{name}.png", full_page=True)


def browser(p):
    return p.chromium.launch(executable_path=CHROMIUM) if CHROMIUM else p.chromium.launch()


def new_page(b):
    return b.new_context(viewport={"width": 1400, "height": 1100}).new_page()


def login(page, who_or_email, password=None):
    email, password = (PEOPLE[who_or_email][0], pw(who_or_email)) if password is None else (who_or_email, password)
    page.goto(BASE)
    page.fill("#loginEmail", email)
    page.fill("#loginPassword", password)
    page.click("button[type=submit]")
    page.wait_for_selector(".appbar", timeout=20000)
    page.wait_for_timeout(800)


def go(page, path):
    page.goto(BASE + path)
    page.wait_for_selector(".appbar")
    page.wait_for_timeout(1200)


def labels(page):
    return page.eval_on_selector_all(
        "label, [aria-label]", "els => els.map(e => (e.getAttribute('aria-label') || e.innerText || '').trim()).filter(Boolean)")


def buttons(page):
    return page.eval_on_selector_all("button", "els => els.map(e => e.innerText.trim()).filter(Boolean)")


def save(name, value):
    json.dump(value, open(os.path.join(WORK, name), "w"))


def load(name):
    return json.load(open(os.path.join(WORK, name)))


def next_step(page) -> str:
    """The story page's next-step panel, as text."""
    main = page.inner_text("main")
    for key in ("DECISION NEEDED", "NEXT STEP", "WAITING FOR", "NEEDS ATTENTION"):
        i = main.find(key)
        if i >= 0:
            return main[i:i + 700]
    return main[:700]


def act(page, *actions):
    """Perform UI actions: ("select", label, option), ("fill", label, text), ("click", button text),
    ("aria", exact button name), ("link", link text), ("confirm", dialog button), ("goto", path), ("wait", ms)."""
    for a in actions:
        kind = a[0]
        if kind == "select":
            page.get_by_label(a[1]).first.select_option(label=a[2])
        elif kind == "fill":
            page.get_by_label(a[1]).first.fill(a[2])
        elif kind == "click":
            page.locator(f"button:has-text('{a[1]}')").first.click()
        elif kind == "aria":
            page.get_by_role("button", name=a[1], exact=True).first.click()
        elif kind == "link":
            page.locator(f"a:has-text('{a[1]}')").first.click()
        elif kind == "summary":
            page.locator(f"summary:has-text('{a[1]}')").first.click()
        elif kind == "confirm":
            page.locator(f"[role=dialog] button:has-text('{a[1]}')").first.click()
        elif kind == "goto":
            page.goto(BASE + a[1])
            page.wait_for_selector(".appbar")
        elif kind == "wait":
            page.wait_for_timeout(a[1])
            continue
        page.wait_for_timeout(1800)


def summary():
    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    for n in failed:
        print("  FAILED:", n)
    return 1 if failed else 0


def done():
    sys.exit(summary())
