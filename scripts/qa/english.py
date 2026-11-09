"""영어판: ?lang=en 과 바닥 줄 언어 단추, 남겨 둔 언어(store 'grid.lang'), 화면마다 남은 한글, 영어일 때 겉모습.

    python3 scripts/qa/english.py [주소] [--out 폴더]

- 화면마다(첫 화면, 계열별 규칙 화면, 만들기 네 계열, 소개, 없는 화면) 글·aria-label·title·placeholder·탭 제목에 한글이
  남았는지 본다. 더 보기를 열고, 살펴보기 말풍선과 안내 글도 본다. 언어 단추의 '한국어'는 일부러 한국어라 뺀다
- 단추로 바꾸면 그 자리에서 다시 그리고(쪽 위치 그대로), 새로 고쳐도 남고, ?lang=ko 가 남긴 것보다 먼저다
- PC 1440·1024, 폰 390(밝은·어두운)에서 가로 넘침·삐져나옴·잘린 글·격자 위 겹침
"""

import json

from common import Checks, Log, args, blur, launch, layout, new_context, settle, sync_playwright

a = args(__doc__)
check = Checks("english", a.out)
PAGES = [
    ("home", "#/"),
    ("conway", "#/r/conway-life"),
    ("brian", "#/r/brians-brain"),
    ("ant", "#/r/langtons-ant"),
    ("turmite", "#/r/fibonacci-turmite"),
    ("rule30", "#/r/rule-30"),
    ("wireworld", "#/r/wireworld"),
    ("make", "#/make"),
    ("makeant", "#/make?family=ant"),
    ("make1d", "#/make?family=elementary"),
    ("maketable", "#/make?family=table"),
    ("about", "#/about"),
    ("nf", "#/nope"),
]

HANGUL_JS = r"""() => {
  const ko = /[ㄱ-ㆎ가-힣]/;
  const skip = (el) => el.closest('#lang-btn, [lang=ko], noscript');  // noscript 는 두 언어를 같이 적어 둔다
  const out = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!ko.test(n.data) || skip(n.parentElement)) continue;
    const el = n.parentElement;
    out.add(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') + ': ' + n.data.trim().slice(0, 50));
  }
  for (const el of document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')) {
    if (skip(el)) continue;
    for (const at of ['aria-label', 'title', 'placeholder', 'alt']) {
      const v = el.getAttribute(at);
      if (v && ko.test(v)) out.add(`${el.tagName.toLowerCase()}[${at}]: ${v.slice(0, 50)}`);
    }
  }
  if (ko.test(document.title)) out.add('title: ' + document.title);
  return [...out];
}"""


def open_en(page, h, lang="en"):
    page.goto(a.url + f"?lang={lang}" + h, wait_until="networkidle")
    settle(page, 400)
    blur(page)


def board_texts(page):
    """살펴보기 말풍선과 안내·알림 글을 띄워 본다(있는 화면만)"""
    look = page.locator(".transport [role=radio][data-id='look']")
    if not look.count():
        return []
    page.evaluate("document.querySelector(\".transport [role=radio][data-id='look']\").click()")
    page.evaluate("scrollTo(0, 0)")
    cv = page.locator(".board-wrap canvas").bounding_box()
    page.mouse.move(cv["x"] + cv["width"] / 2, cv["y"] + min(cv["height"], 600) / 2)
    page.wait_for_timeout(300)
    out = page.evaluate(HANGUL_JS)
    page.keyboard.press("Escape")
    page.mouse.move(2, 2)
    clear = page.locator(".board-wrap .capsule button").last
    clear.click()  # 비우기 → 안내 글
    page.wait_for_timeout(200)
    out += page.evaluate(HANGUL_JS)
    return out


with sync_playwright() as p:
    b = launch(p)

    # ── 화면마다 남은 한글 ──
    ctx = new_context(b, "pc1440", "light", "reduce")
    page = ctx.new_page()
    log = Log(page)
    left = {}
    for name, h in PAGES:
        open_en(page, h)
        ok_lang = page.evaluate("document.documentElement.lang") == "en"
        more = page.locator("details.more summary")
        if more.count():
            more.click()
            page.wait_for_timeout(400)
        found = page.evaluate(HANGUL_JS) + board_texts(page)
        found = sorted(set(found))
        left[name] = found
        check(f"{name}: lang=en, no Korean left", ok_lang and not found, f"{len(found)}: {found[:6]}")
    with open(f"{a.out}/english_left.json", "w", encoding="utf-8") as f:
        json.dump(left, f, ensure_ascii=False, indent=1)
    nav = page.evaluate("[...document.querySelectorAll('header nav a')].map(e => e.textContent.trim())")
    check("nav in English", nav[:3] == ["Catalog", "Make", "About"], nav)
    check("no console errors (pages)", not log.items, log.items)
    ctx.close()

    # ── 언어 단추, 남겨 둔 언어, ?lang=ko ──
    ctx = new_context(b, "pc1440", "light", "reduce")
    page = ctx.new_page()
    log = Log(page)
    page.goto(a.url + "#/", wait_until="networkidle")
    settle(page, 400)
    check("first visit: Korean", page.evaluate("document.documentElement.lang") == "ko" and page.locator("#lang-btn").text_content().strip() == "English")
    page.evaluate("scrollTo(0, 900)")
    page.wait_for_timeout(200)
    y0 = page.evaluate("scrollY")
    page.evaluate("document.getElementById('lang-btn').click()")
    page.wait_for_timeout(500)
    y1 = page.evaluate("scrollY")
    stored = page.evaluate("localStorage.getItem('grid.lang')")
    check("lang button → English in place (scroll kept), stored", page.evaluate("document.documentElement.lang") == "en" and abs(y1 - y0) <= 2 and "en" in (stored or ""), f"y {y0}→{y1}, store {stored}")
    check("lang button now says 한국어", page.locator("#lang-btn").text_content().strip() == "한국어")
    page.reload(wait_until="networkidle")
    settle(page, 300)
    check("reload keeps English", page.evaluate("document.documentElement.lang") == "en")
    page.goto(a.url + "?lang=ko#/r/conway-life", wait_until="networkidle")
    settle(page, 300)
    check("?lang=ko beats the stored English", page.evaluate("document.documentElement.lang") == "ko" and "ko" in (page.evaluate("localStorage.getItem('grid.lang')") or ""))
    page.evaluate("document.getElementById('lang-btn').click()")
    page.wait_for_timeout(400)
    title = page.locator("h1").first.text_content().strip()
    check("switch on a rule page: rule name in English", page.evaluate("document.documentElement.lang") == "en" and title.isascii(), title)
    check("no console errors (switch)", not log.items, log.items)
    ctx.close()

    # ── 영어일 때 겉모습 ──
    for vp, scheme in (("pc1440", "light"), ("pc1024", "light"), ("phone390", "light"), ("phone390", "dark")):
        ctx = new_context(b, vp, scheme, "reduce")
        page = ctx.new_page()
        log = Log(page)
        bad = []
        for name, h in PAGES:
            open_en(page, h)
            more = page.locator("details.more summary")
            if more.count():
                more.click()
                page.wait_for_timeout(300)
            lay = layout(page)
            if lay["hOverflow"] or lay["sticking"] or lay["clipped"] or lay["overlaps"]:
                bad.append((name, lay["sticking"][:2], lay["clipped"][:2], lay["overlaps"][:2]))
            page.screenshot(path=f"{a.out}/en_{vp}_{scheme}_{name}.png")
        check(f"{vp} {scheme}: English pages lay out cleanly", not bad, bad[:4])
        check(f"no console errors ({vp} {scheme})", not log.items, log.items)
        ctx.close()

    # 360px 폰: 머리 줄 메뉴(영어는 두 줄이 된다고 알려짐, 디자인에 부탁) — 높이만 적는다
    ctx = b.new_context(viewport={"width": 360, "height": 780}, device_scale_factor=3, is_mobile=True, has_touch=True, locale="ko-KR", reduced_motion="reduce")
    page = ctx.new_page()
    hs = {}
    for lang in ("ko", "en"):
        open_en(page, "#/", lang)
        hs[lang] = page.evaluate("Math.round(document.querySelector('header nav').getBoundingClientRect().height)")
    check("info: header nav height at 360px (ko vs en)", True, hs)
    page.screenshot(path=f"{a.out}/en_phone360_home.png")
    ctx.close()
    b.close()
check.done()
