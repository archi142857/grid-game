"""PC 에서 마우스·키보드로 해 본다(첫 화면, 규칙 화면, 만들기).

    python3 scripts/qa/pc.py [주소] [--vp pc1440|pc1024] [--out 폴더]

키보드(스페이스·→·R·+·−·0·F·Esc·Shift+화살표), 끌기·휠·Ctrl+휠, 칸 누르기,
비우기 → 칸 고르기 → 재생, 칩·숫자 점, 전체 화면, 밝기, 세 단계 설명, 도감 그림,
손(그리기·살펴보기), 표기 입력, 상태 수, 규칙 파일 내려받기·불러오기, 볼 것 카드.
"""

import json

from common import (
    HOME_NUMS, REPO, RULE_NUMS, Checks, Log, args, blur, canvas_img, cell_center, center_into_view, diff, launch, layout,
    new_context, nums, play_label, safe_point, settle, sync_playwright, VIEWPORTS,
)

a = args(__doc__, lambda p: p.add_argument("--vp", default="pc1440", choices=["pc1440", "pc1024"]))
check = Checks(f"pc_{a.vp}", a.out)
HERO = ".hero canvas"
BOARD = ".board-wrap canvas"
Z_HOME = 8.5 if VIEWPORTS[a.vp]["viewport"]["width"] < 560 else 11  # home.js 의 처음 칸 크기

with sync_playwright() as p:
    b = launch(p)
    ctx = new_context(b, a.vp, "light")

    # ── 첫 화면 ──
    page = ctx.new_page()
    log = Log(page)
    page.goto(a.url + "#/", wait_until="networkidle")
    settle(page)
    check("home: autoplay on load", play_label(page) == "일시정지", play_label(page))
    blur(page)
    y0 = page.evaluate("scrollY")
    page.keyboard.press("Space")
    page.wait_for_timeout(150)
    check("home: Space pauses", play_label(page) == "재생", play_label(page))
    check("home: Space does not scroll", page.evaluate("scrollY") == y0)
    g = nums(page, HOME_NUMS)[0]
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(250)
    check("home: → steps one generation", nums(page, HOME_NUMS)[0] == g + 1, f"{g}->{nums(page, HOME_NUMS)[0]}")
    page.keyboard.press("r")
    page.wait_for_timeout(200)
    check("home: R back to gen 0", nums(page, HOME_NUMS)[0] == 0)
    for key, name in (("+", "zoom in"), ("-", "zoom out"), ("0", "fit")):
        x = canvas_img(page, HERO)
        page.keyboard.press(key)
        page.wait_for_timeout(200)
        check(f"home: {key} {name}", diff(x, canvas_img(page, HERO)) > 0.005)
    for _ in range(25):
        page.keyboard.press("+")
    page.wait_for_timeout(150)
    check("home: zoom-in disabled at max", page.locator(".hero .zoom button[aria-label='확대']").is_disabled())
    for _ in range(40):
        page.keyboard.press("-")
    page.wait_for_timeout(150)
    check("home: zoom-out disabled at min", page.locator(".hero .zoom button[aria-label='축소']").is_disabled())
    page.keyboard.press("0")

    # 그냥 휠은 알림 + 쪽 내려가기, Ctrl+휠은 확대
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(200)
    px, py = safe_point(page, HERO)
    page.mouse.move(px, py)
    page.mouse.wheel(0, 300)
    page.wait_for_timeout(400)
    fl = page.locator(".hero .stage-flash")
    check("home: plain wheel shows Ctrl hint", fl.is_visible() and "휠" in (fl.text_content() or ""), fl.text_content())
    check("home: plain wheel scrolls page", page.evaluate("scrollY") > 0, page.evaluate("scrollY"))
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(200)
    px, py = safe_point(page, HERO)
    page.mouse.move(px, py)
    x, ys = canvas_img(page, HERO), page.evaluate("scrollY")
    page.keyboard.down("Control")
    page.mouse.wheel(0, -300)
    page.keyboard.up("Control")
    page.wait_for_timeout(300)
    check("home: Ctrl+wheel zooms", diff(x, canvas_img(page, HERO)) > 0.01)
    check("home: Ctrl+wheel does not scroll", page.evaluate("scrollY") == ys)

    # 끌면 둘러보고 칸은 안 바뀐다
    page.reload(wait_until="networkidle")
    settle(page)
    blur(page)
    page.keyboard.press("Space")
    page.wait_for_timeout(300)
    n0, x = nums(page, HOME_NUMS)[1], canvas_img(page, HERO)
    sx, sy = safe_point(page, HERO)
    sx, sy = sx - 60, sy - 20
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(sx + 60, sy + 30, steps=6)
    page.mouse.move(sx + 120, sy + 40, steps=6)
    page.mouse.up()
    page.wait_for_timeout(250)
    check("home: mouse drag pans", diff(x, canvas_img(page, HERO)) > 0.01)
    check("home: drag does not toggle cells", nums(page, HOME_NUMS)[1] == n0)

    # 비우기 → 칸 고르기 → 재생(단추로)
    page.reload(wait_until="networkidle")
    settle(page)
    center_into_view(page, ".hero .stage")
    page.locator(".hero .capsule button", has_text="비우기").click()
    page.wait_for_timeout(250)
    check("home: 비우기 -> 0 cells, paused", nums(page, HOME_NUMS)[1] == 0 and play_label(page) == "재생")
    hint = page.locator(".hero .stage-hint")
    check("home: 비우기 shows pick hint", hint.is_visible(), hint.text_content())
    for cx in (-1, 0, 1):
        page.mouse.click(*cell_center(page, HERO, cx, 0, Z_HOME))
        page.wait_for_timeout(80)
    page.wait_for_timeout(150)
    check("home: clicking 3 cells -> 3 alive", nums(page, HOME_NUMS)[1] == 3, nums(page, HOME_NUMS))
    check("home: hint hides after picking", not hint.is_visible())
    page.locator(".hero .capsule .play").click()
    page.wait_for_timeout(1300)
    check("home: play runs blinker", nums(page, HOME_NUMS)[0] >= 5 and nums(page, HOME_NUMS)[1] == 3, nums(page, HOME_NUMS))
    page.locator(".hero .capsule .play").click()
    page.locator(".hero .capsule button[aria-label='처음으로']").click()
    page.wait_for_timeout(150)
    check("home: 처음으로 -> gen 0", nums(page, HOME_NUMS) == [0, 3], nums(page, HOME_NUMS))
    page.mouse.click(*cell_center(page, HERO, 0, 0, Z_HOME))
    page.wait_for_timeout(150)
    check("home: click live cell clears it", nums(page, HOME_NUMS)[1] == 2)
    page.locator(".hero .capsule button", has_text="흩뿌리기").click()
    page.wait_for_timeout(200)
    check("home: 흩뿌리기 -> many cells, gen 0", nums(page, HOME_NUMS)[1] > 50 and nums(page, HOME_NUMS)[0] == 0)

    # 칩과 숫자 점
    page.locator(".hero .chips button", has_text="하이라이프").click()
    page.wait_for_timeout(200)
    check("home: chip selects + note link", page.locator(".console-note a").get_attribute("href") == "#/r/highlife")
    page.locator(".console .pad-row").nth(0).locator("button.count").nth(6).click()
    page.wait_for_timeout(150)
    note = page.locator(".console-note").text_content()
    check("home: pad edit -> custom note", "직접 고친" in note and page.locator(".hero .chips [aria-checked='true']").count() == 0, note)
    page.locator(".console .pad-row").nth(0).locator("button.count").nth(0).click(force=True)
    page.wait_for_timeout(150)
    check("home: locked B0 explains", "태어남 0" in (page.locator(".console .say").text_content() or ""))

    # 전체 화면
    blur(page)
    page.keyboard.press("f")
    page.wait_for_timeout(600)
    st = page.evaluate("() => ({on: document.documentElement.classList.contains('has-full') && !!document.querySelector('.hero-board.is-full'), focus: document.activeElement.className})")
    check("home: F enters fullscreen + focus play", st["on"] and st["focus"] == "play", st)
    page.screenshot(path=f"{a.out}/{a.vp}_home_full.png")
    check("home: fullscreen no overlaps", not layout(page)["overlaps"], layout(page)["overlaps"])
    l0 = play_label(page)
    page.keyboard.press("Space")
    page.wait_for_timeout(200)
    check("home: Space in fullscreen toggles once", play_label(page) != l0)
    bb = page.locator(".hero-board canvas").bounding_box()
    page.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)
    x = canvas_img(page, HERO)
    page.mouse.wheel(0, -300)
    page.wait_for_timeout(300)
    check("home: plain wheel zooms in fullscreen", diff(x, canvas_img(page, HERO)) > 0.01)
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    check("home: Esc leaves fullscreen", not page.evaluate("document.documentElement.classList.contains('has-full') || !!document.fullscreenElement"))
    page.locator(".hero .zoom button[aria-label='전체 화면']").click()
    page.wait_for_timeout(500)
    page.locator(".hero .zoom button[aria-label='전체 화면 끝내기']").click()
    page.wait_for_timeout(500)
    check("home: fullscreen button in/out", not page.evaluate("document.documentElement.classList.contains('has-full')"))

    # 밝기: 기기 설정 → 밝게 → 어둡게 → 기기 설정
    seq = []
    for _ in range(3):
        page.locator("#theme-btn").click()
        page.wait_for_timeout(250)
        seq.append(page.evaluate("document.documentElement.dataset.scheme"))
    check("theme: cycles", seq == ["light", "dark", "light"], seq)

    # 세 단계 설명
    page.locator(".lesson .mini button").nth(3 * 7 + 3).click()
    check("lesson: neighbor count", "2" in page.locator(".lesson .bubble").text_content())
    page.locator(".lesson .steps button").nth(2).click()
    check("lesson: step 3 explains", "살아요" in page.locator(".lesson .bubble").text_content())
    page.locator(".lesson button", has_text="한 세대 더").click()
    check("lesson: 한 세대 더", page.locator(".lesson .mini button.on").count() == 3)

    # 도감 그림: 올리면 움직이고, 누르면 규칙 화면
    th = page.locator(".specimens li").nth(0)
    th.scroll_into_view_if_needed()
    x = canvas_img(page, ".specimens li canvas")
    th.hover()
    page.wait_for_timeout(1200)
    check("shelf: hover plays thumbnail", diff(x, canvas_img(page, ".specimens li canvas")) > 0.002)
    th.click()
    page.wait_for_timeout(600)
    check("shelf: click opens rule page", page.evaluate("location.hash") == "#/r/conway-life")
    check("home: console clean", not log.items, log.items)
    page.close()

    # ── 규칙 화면 ──
    page = ctx.new_page()
    log = Log(page)
    page.goto(a.url + "#/r/conway-life", wait_until="networkidle")
    settle(page)
    check("rule: autoplay", play_label(page) == "일시정지")
    blur(page)
    page.keyboard.press("Space")
    page.wait_for_timeout(150)
    check("rule: Space pauses", play_label(page) == "재생")
    g = nums(page, RULE_NUMS)[0]
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(250)
    check("rule: → steps", nums(page, RULE_NUMS)[0] == g + 1)
    page.keyboard.press("R")
    page.wait_for_timeout(150)
    check("rule: R back to 0", nums(page, RULE_NUMS)[0] == 0)
    x = canvas_img(page, BOARD)
    page.keyboard.press("Shift+ArrowLeft")
    page.wait_for_timeout(200)
    check("rule: Shift+← pans", diff(x, canvas_img(page, BOARD)) > 0.01 and page.evaluate("scrollX") == 0)

    # 그리기 손: 끌면 그리고, 오른쪽 단추로 끌면 둘러본다
    page.locator(".board-wrap .capsule button", has_text="비우기").click()
    page.locator(".transport [role=radio][data-id='draw']").click()
    bb = page.locator(BOARD).bounding_box()
    sx, sy = bb["x"] + bb["width"] * 0.3, bb["y"] + bb["height"] * 0.4
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(sx + 150, sy, steps=15)
    page.mouse.up()
    page.wait_for_timeout(150)
    drawn = nums(page, RULE_NUMS)[1]
    check("rule: draw stroke paints a line", drawn >= 12, drawn)
    x = canvas_img(page, BOARD)
    page.mouse.move(sx, sy + 60)
    page.mouse.down(button="right")
    page.mouse.move(sx + 83, sy + 107, steps=8)
    page.mouse.up(button="right")
    page.wait_for_timeout(150)
    check("rule: right-drag pans in draw tool", diff(x, canvas_img(page, BOARD)) > 0.01 and nums(page, RULE_NUMS)[1] == drawn)

    # 살펴보기 손
    page.locator(".transport [role=radio][data-id='look']").click()
    page.keyboard.press("0")
    page.wait_for_timeout(200)
    bb = page.locator(BOARD).bounding_box()
    cx, cy = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
    page.mouse.move(cx, cy)
    page.wait_for_timeout(250)
    peek = page.locator(".peek")
    check("rule: look hover shows peek + marks a number", peek.is_visible() and page.locator(".pad .count.why").count() == 1)
    page.mouse.click(cx, cy)
    page.mouse.move(bb["x"] + 5, bb["y"] + 5)
    page.wait_for_timeout(150)
    check("rule: clicked look stays", peek.is_visible())
    check("rule: peek no overlaps", not layout(page)["overlaps"], layout(page)["overlaps"])
    page.keyboard.press("Escape")
    page.mouse.move(bb["x"] + bb["width"] + 50, bb["y"] - 30)
    page.wait_for_timeout(200)
    check("rule: Esc releases look", not peek.is_visible())
    page.locator(".transport [role=radio][data-id='pan']").click()

    # 표기 입력
    inp = page.locator(".code-in")
    inp.fill("B36/S23")
    inp.press("Enter")
    page.wait_for_timeout(200)
    check("rule: notation applies + url", "rule=B36%2FS23" in page.evaluate("location.hash") and page.locator(".side .text-btn").is_visible())
    page.locator(".side .text-btn", has_text="원래대로").click()
    page.wait_for_timeout(150)
    check("rule: 원래대로 restores", page.evaluate("location.hash") == "#/r/conway-life" and inp.input_value() == "B3/S23")
    inp.fill("B0/S23")
    inp.press("Enter")
    check("rule: B0 refused with reason", "태어남 0" in page.locator(".code-err").text_content())
    inp.press("Escape")
    check("rule: Esc in field reverts", inp.input_value() == "B3/S23" and not page.locator(".code-err").text_content())
    inp.fill("hello")
    inp.press("Enter")
    check("rule: bad notation error", "읽을 수 없는" in page.locator(".code-err").text_content())
    inp.press("Escape")
    inp.fill("23/36")
    inp.press("Enter")
    page.wait_for_timeout(150)
    check("rule: S/B order accepted", inp.input_value() == "B36/S23", inp.input_value())
    page.locator(".side .text-btn", has_text="원래대로").click()

    # 더 보기: 상태 수, 규칙 파일
    page.locator("details.more summary").click()
    page.locator(".stepper button[aria-label='상태 하나 더하기']").click()
    check("rule: states + -> C3", inp.input_value() == "B3/S23/C3")
    page.locator(".stepper button[aria-label='상태 하나 빼기']").click()
    check("rule: states - -> back", inp.input_value() == "B3/S23")
    with page.expect_download() as dl:
        page.get_by_role("button", name="내려받기", exact=True).click()  # RLE 내려받기와 따로
    j = json.loads(open(dl.value.path(), encoding="utf-8").read())
    check("rule: download is a rule file", j.get("family") == "life" and j.get("rule", {}).get("birth") == [3], dl.value.suggested_filename)
    hl = (REPO / "web/data/rules/highlife.json").read_text(encoding="utf-8")
    up = page.locator(".file-row input[type=file][accept*=json]")  # RLE 파일 칸과 따로
    up.set_input_files(files=[{"name": "hl.json", "mimeType": "application/json", "buffer": hl.encode()}])
    page.wait_for_timeout(300)
    check("rule: upload applies", inp.input_value() == "B36/S23", inp.input_value())
    up.set_input_files(files=[{"name": "bad.json", "mimeType": "application/json", "buffer": b"{oops"}])
    page.wait_for_timeout(300)
    check("rule: bad upload shows error", page.locator(".errs li").count() >= 1)
    page.locator(".transport [role=radio][data-id='fast']").click()
    check("rule: speed saved", "fast" in (page.evaluate("localStorage.getItem('grid.speed')") or ""))
    page.locator(".transport [role=radio][data-id='normal']").click()

    # 볼 것: 글라이더 놓기
    page.goto(a.url + "#/r/conway-life", wait_until="networkidle")
    settle(page)
    card = page.locator(".cards .card", has_text="글라이더").first
    card.scroll_into_view_if_needed()
    card.locator("button").click()
    page.wait_for_timeout(900)
    st = page.evaluate("() => ({focus: document.activeElement.className, top: document.querySelector('.board-wrap').getBoundingClientRect().top})")
    check("rule: 놓아 보기 places 5 cells + plays", play_label(page) == "일시정지" and nums(page, RULE_NUMS)[1] == 5, nums(page, RULE_NUMS))
    check("rule: 놓아 보기 shows board + focus play", st["focus"] == "play" and -50 < st["top"] < 400, st)

    # 전체 화면
    blur(page)
    page.keyboard.press("F")
    page.wait_for_timeout(600)
    check("rule: F fullscreen", page.evaluate("!!document.querySelector('.board-wrap.is-full')"))
    page.screenshot(path=f"{a.out}/{a.vp}_rule_full.png")
    check("rule: fullscreen no overlaps", not layout(page)["overlaps"], layout(page)["overlaps"])
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    check("rule: Esc exits fullscreen", not page.evaluate("document.documentElement.classList.contains('has-full')"))
    check("rule: console clean", not log.items, log.items)
    page.close()

    # ── 만들기, 주소로 나누기 ──
    page = ctx.new_page()
    log = Log(page)
    page.goto(a.url + "#/make", wait_until="networkidle")
    settle(page)
    check("make: url + title", page.evaluate("location.hash") == "#/make?rule=B3%2FS23" and page.title().startswith("B3/S23"), page.title())
    c = page.locator(".cards .card").first
    c.scroll_into_view_if_needed()
    want = c.locator(".code").text_content()
    c.locator("button").click()
    page.wait_for_timeout(300)
    check("make: 써 보기 applies", page.locator(".code-in").input_value() == want, want)
    page.goto(a.url + "#/make?rule=B36/S23", wait_until="networkidle")
    settle(page, 300)
    check("make: ?rule= from link", page.locator(".code-in").input_value() == "B36/S23")
    page.goto(a.url + "#/r/highlife?rule=B3%2FS23", wait_until="networkidle")
    settle(page, 300)
    check("rule: ?rule= on preset -> edited", page.locator(".code-in").input_value() == "B3/S23" and page.locator(".side .text-btn").is_visible())
    check("make: console clean", not log.items, log.items)
    ctx.close()
    b.close()
check.done()
