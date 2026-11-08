"""폰(390×844, dpr 3)에서 손가락으로 해 본다. 진짜 터치 이벤트(CDP)라 쪽 굴리기·핀치도 브라우저가 받는다.

    python3 scripts/qa/phone.py [주소] [--nofs] [--out 폴더]

--nofs 는 아이폰처럼 요소 전체 화면 API 가 없는 브라우저를 흉내 낸다(쪽을 덮는 전체 화면).
"""

from common import (
    HOME_NUMS, RULE_NUMS, Checks, Log, Touch, args, box, canvas_img, cell_center, center_into_view, diff, launch, layout,
    new_context, nums, play_label, settle, sync_playwright,
)

a = args(__doc__, lambda p: p.add_argument("--nofs", action="store_true", help="전체 화면 API 없이"))
tag = "phone390" + ("_nofs" if a.nofs else "")
check = Checks(tag, a.out)
HERO = ".hero canvas"
BOARD = ".board-wrap canvas"
full_on = lambda pg: pg.evaluate("document.documentElement.classList.contains('has-full')")  # noqa: E731

with sync_playwright() as p:
    b = launch(p)
    ctx = new_context(b, "phone390", "light")
    if a.nofs:
        ctx.add_init_script(
            "delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen;"
            "Object.defineProperty(Element.prototype, 'requestFullscreen', {value: undefined});"
        )

    # ── 첫 화면 ──
    page = ctx.new_page()
    log = Log(page)
    t = Touch(ctx, page)
    page.goto(a.url + "#/", wait_until="networkidle")
    settle(page)
    check("home: autoplay", play_label(page) == "일시정지")
    center_into_view(page, ".hero .stage")
    t.tap_el(".hero .capsule .play")
    check("home: tap play pauses", play_label(page) == "재생")
    t.tap_el(".hero .capsule button.wide:last-of-type")
    check("home: tap 비우기 clears + hint", nums(page, HOME_NUMS)[1] == 0 and page.locator(".hero .stage-hint").is_visible())
    for x in (-1, 0, 1):
        t.tap(*cell_center(page, HERO, x, 0, 8.5))
    check("home: tap 3 cells", nums(page, HOME_NUMS)[1] == 3, nums(page, HOME_NUMS))
    t.tap_el(".hero .capsule .play")
    page.wait_for_timeout(1300)
    check("home: play blinker", nums(page, HOME_NUMS)[0] >= 5 and nums(page, HOME_NUMS)[1] == 3, nums(page, HOME_NUMS))
    t.tap_el(".hero .capsule .play")
    page.wait_for_timeout(200)

    # 세로로 쓸면 쪽이 내려가고 격자는 그대로
    cv = box(page, HERO)
    y0, x = page.evaluate("scrollY"), canvas_img(page, HERO)
    t.drag(cv["x"] + cv["w"] / 2, cv["y"] + cv["h"] * 0.7, cv["x"] + cv["w"] / 2, cv["y"] + cv["h"] * 0.2)
    page.wait_for_timeout(400)
    check("home: vertical swipe scrolls page", page.evaluate("scrollY") > y0 + 50, f"{y0}->{page.evaluate('scrollY')}")
    check("home: vertical swipe leaves grid", diff(x, canvas_img(page, HERO)) < 0.002 and nums(page, HOME_NUMS)[1] == 3)
    center_into_view(page, ".hero .stage")
    cv = box(page, HERO)
    x = canvas_img(page, HERO)
    t.pinch(cv["x"] + cv["w"] / 2, cv["y"] + cv["h"] / 2, 80, 220)
    check("home: pinch zooms grid, not page", diff(x, canvas_img(page, HERO)) > 0.01 and page.evaluate("visualViewport.scale") == 1)
    x = canvas_img(page, HERO)
    t.drag(cv["x"] + cv["w"] * 0.3, cv["y"] + cv["h"] / 2, cv["x"] + cv["w"] * 0.6, cv["y"] + cv["h"] / 2)
    check("home: one-finger sideways drag does nothing", diff(x, canvas_img(page, HERO)) < 0.002 and nums(page, HOME_NUMS)[1] == 3)

    # 전체 화면: 한 손가락으로 끌고 핀치
    t.tap_el(".hero .zoom button[aria-label='전체 화면']")
    page.wait_for_timeout(600)
    vw, vh = page.evaluate("[innerWidth, innerHeight]")
    hb, cap = box(page, ".hero-board"), box(page, ".hero-board .capsule")
    check("home full: fills screen", full_on(page) and abs(hb["w"] - vw) < 2 and abs(hb["h"] - vh) < 2, hb)
    check("home full: bar inside screen", cap["b"] <= vh + 1 and cap["x"] >= 0 and cap["r"] <= vw + 1, cap)
    check("home full: no overlaps", not layout(page)["overlaps"], layout(page)["overlaps"])
    page.screenshot(path=f"{a.out}/{tag}_home_full.png")
    cv = box(page, HERO)
    x = canvas_img(page, HERO)
    t.drag(cv["x"] + cv["w"] * 0.3, cv["y"] + cv["h"] * 0.4, cv["x"] + cv["w"] * 0.6, cv["y"] + cv["h"] * 0.55)
    check("home full: one-finger drag pans", diff(x, canvas_img(page, HERO)) > 0.01)
    x = canvas_img(page, HERO)
    t.pinch(cv["x"] + cv["w"] / 2, cv["y"] + cv["h"] / 2, 200, 90)
    check("home full: pinch zooms", diff(x, canvas_img(page, HERO)) > 0.01)
    t.tap_el(".hero .zoom button[aria-label='전체 화면 끝내기']")
    page.wait_for_timeout(500)
    check("home: fullscreen off", not full_on(page))
    check("home: console clean", not log.items, log.items)
    page.close()

    # ── 규칙 화면 ──
    page = ctx.new_page()
    log = Log(page)
    t = Touch(ctx, page)
    page.goto(a.url + "#/r/conway-life", wait_until="networkidle")
    settle(page)
    center_into_view(page, ".board-wrap .stage")
    t.tap_el(".board-wrap .capsule .play")
    check("rule: tap pauses", play_label(page) == "재생")
    cv = box(page, BOARD)
    y0, x, n0 = page.evaluate("scrollY"), canvas_img(page, BOARD), nums(page, RULE_NUMS)[1]
    t.drag(cv["x"] + cv["w"] * 0.5, cv["y"] + cv["h"] * 0.7, cv["x"] + cv["w"] * 0.4, cv["y"] + cv["h"] * 0.25)
    check("rule: one-finger drag pans, page stays", diff(x, canvas_img(page, BOARD)) > 0.01 and page.evaluate("scrollY") == y0)
    check("rule: drag doesn't toggle", nums(page, RULE_NUMS)[1] == n0)
    t.tap(cv["x"] + cv["w"] / 2, cv["y"] + cv["h"] / 2)
    check("rule: tap toggles a cell", abs(nums(page, RULE_NUMS)[1] - n0) == 1)
    x = canvas_img(page, BOARD)
    t.pinch(cv["x"] + cv["w"] / 2, cv["y"] + cv["h"] / 2, 80, 200)
    check("rule: pinch zooms", diff(x, canvas_img(page, BOARD)) > 0.01 and page.evaluate("visualViewport.scale") == 1)
    t.tap_el(".board-wrap .capsule button.wide:last-of-type")
    t.tap_el(".transport [role=radio][data-id='draw']")
    center_into_view(page, ".board-wrap .stage")
    cv = box(page, BOARD)
    t.drag(cv["x"] + cv["w"] * 0.2, cv["y"] + cv["h"] / 2, cv["x"] + cv["w"] * 0.8, cv["y"] + cv["h"] / 2, steps=20)
    check("rule: finger draws a line", nums(page, RULE_NUMS)[1] >= 8, nums(page, RULE_NUMS))
    t.tap_el(".transport [role=radio][data-id='look']")
    center_into_view(page, ".board-wrap .stage")
    cv = box(page, BOARD)
    t.tap(cv["x"] + cv["w"] * 0.85, cv["y"] + cv["h"] / 2)
    page.wait_for_timeout(200)
    ok = page.locator(".peek").is_visible()
    check("rule: look tap shows peek", ok)
    if ok:
        pr, sr = box(page, ".peek"), box(page, ".board-wrap .stage")
        check("rule: peek inside stage", pr["x"] >= sr["x"] and pr["r"] <= sr["r"] + 1 and pr["y"] >= sr["y"] and pr["b"] <= sr["b"] + 1)
    t.tap_el(".board-wrap .zoom button[aria-label='전체 화면']")
    page.wait_for_timeout(600)
    page.screenshot(path=f"{a.out}/{tag}_rule_full.png")
    vw, vh = page.evaluate("[innerWidth, innerHeight]")
    for sel in (".board-wrap .capsule", ".board-wrap .transport .seg:first-child", ".board-wrap .transport .seg:last-child", ".board-wrap .zoom"):
        r = box(page, sel)
        check(f"rule full: {sel.split()[-1]} inside screen", r["x"] >= -1 and r["r"] <= vw + 1 and r["y"] >= -1 and r["b"] <= vh + 1, r)
    check("rule full: no overlaps", not layout(page)["overlaps"], layout(page)["overlaps"])
    t.tap_el(".board-wrap .zoom button[aria-label='전체 화면 끝내기']")
    page.wait_for_timeout(500)
    check("rule: fullscreen off", not full_on(page))
    check("rule: console clean", not log.items, log.items)
    ctx.close()
    b.close()
check.done()
