"""1차원 기본(규칙 0–255): 세대마다 켜진 칸 수를 작은 파이썬 기준 구현과 견주고, 1차원 화면을 해 본다.

    python3 scripts/qa/elementary.py [주소] [--out 폴더]

- 기준 구현: 한 칸에서 시작해 윗줄 세 칸 무늬(111 … 000)로 다음 줄. 규칙 90 은 t세대 켜진 칸이 2^(t 의 이진수 1 개수)
  (시에르핀스키 삼각형)라는 알려진 답으로 기준부터 확인한다
- 규칙 30·90·110: → 로 넘기며 지금 줄의 켜진 칸 수, 처음으로
- 표기(W90, 홀수는 잠금, 틀린 표기, 다른 계열 표기), 무늬 8개 단추, 지금 줄만 켜고 끄기, 살펴보기, 키, 빠르기
- 도감에 들어가기 전이면 만들기(#/make?rule=W30)로 연다
"""

import base64
import io

import numpy as np
from PIL import Image

from common import RULE_NUMS, Checks, Log, args, blur, launch, new_context, nums, play_label, settle, sync_playwright

a = args(__doc__)
check = Checks("elementary", a.out)
BOARD = ".board-wrap canvas"
Z = 8  # families.js 1차원 zoom


def ref_counts(number, gens):
    row, out = {0}, [1]
    for _ in range(gens):
        cand = {x + d for x in row for d in (-1, 0, 1)}
        row = {x for x in cand if (number >> ((x - 1 in row) * 4 + (x in row) * 2 + (x + 1 in row))) & 1}
        out.append(len(row))
    return out


def counts(page):
    return nums(page, RULE_NUMS)[:2]  # [세대, 켜진 칸]


def open_make(page, code):
    url = a.url + f"#/make?rule={code}"
    if page.evaluate("location.href") == url:
        page.reload(wait_until="networkidle")
    else:
        page.goto(url, wait_until="networkidle")
    settle(page, 400)
    blur(page)
    page.mouse.move(2, 2)


def top_dot(page):
    """켜진 칸 점(진한 잉크·신호색) 가운데 맨 위 줄의 맨 왼쪽 점 가운데(화면 자리). 0세대 줄의 첫 칸"""
    url = page.evaluate("(s) => document.querySelector(s).toDataURL('image/png')", BOARD)
    img = np.asarray(Image.open(io.BytesIO(base64.b64decode(url.split(",")[1]))).convert("RGB")).astype(int)
    mask = (img.mean(axis=2) < 90) | ((img.max(axis=2) - img.min(axis=2)) > 90)
    ys, xs = np.nonzero(mask)
    r = page.evaluate("(s) => { const c = document.querySelector(s); const b = c.getBoundingClientRect(); return [b.left, b.top, c.width / b.width]; }", BOARD)
    if not len(ys):
        return None
    c = Z * r[2]
    band = ys < ys.min() + c * 0.9
    bx, by = xs[band], ys[band]
    left = bx < bx.min() + c * 0.9
    return (r[0] + bx[left].mean() / r[2], r[1] + by[left].mean() / r[2])


def dark_dots(page):
    """캔버스에서 켜진 칸 점(진한 잉크·신호색)의 가운데들을 화면 자리로"""
    url = page.evaluate("(s) => document.querySelector(s).toDataURL('image/png')", BOARD)
    img = np.asarray(Image.open(io.BytesIO(base64.b64decode(url.split(",")[1]))).convert("RGB")).astype(int)
    lum = img.mean(axis=2)
    sat = img.max(axis=2) - img.min(axis=2)
    mask = (lum < 90) | (sat > 90)
    ys, xs = np.nonzero(mask)
    r = page.evaluate("(s) => { const c = document.querySelector(s); const b = c.getBoundingClientRect(); return [b.left, b.top, c.width / b.width]; }", BOARD)
    if not len(xs):
        return []
    return [(r[0] + xs.mean() / r[2], r[1] + ys.mean() / r[2])]


# 기준 구현부터: 규칙 90 = 시에르핀스키
ref90 = ref_counts(90, 127)
check("reference: rule 90 counts are 2^popcount(t)", all(ref90[t] == 2 ** bin(t).count("1") for t in range(128)), ref90[:9])

with sync_playwright() as p:
    b = launch(p)
    ctx = new_context(b, "pc1440", "light", "reduce")
    page = ctx.new_page()
    log = Log(page)

    # ── 켜진 칸 수 ──
    MARKS = [1, 2, 3, 5, 10, 20, 50, 100]
    for n in (30, 90, 110):
        open_make(page, f"W{n}")
        check(f"W{n}: opens as 1-D, gen 0 with one cell", counts(page) == [0, 1] and page.locator(".pats .count").count() == 8, counts(page))
        ref = ref_counts(n, MARKS[-1])
        got, done = [], 0
        for m in MARKS:
            for _ in range(m - done):
                page.keyboard.press("ArrowRight")
            done = m
            page.wait_for_timeout(60)
            got.append(counts(page))
        want = [[m, ref[m]] for m in MARKS]
        check(f"W{n}: on-cells per generation match reference", got == want, f"site {got[-3:]} / ref {want[-3:]}")
        page.keyboard.press("r")
        page.wait_for_timeout(150)
        check(f"W{n}: R back to one cell", counts(page) == [0, 1], counts(page))
    check("no console errors (counts)", not log.items, log.items)

    # ── 표기·무늬 단추 ──
    open_make(page, "W30")
    inp = page.locator(".code-in")
    pressed = page.evaluate("[...document.querySelectorAll('.pats .count')].map(b => b.getAttribute('aria-pressed') === 'true' ? 1 : 0)")
    check("pattern buttons show 30 = 00011110 (111 … 000)", pressed == [0, 0, 0, 1, 1, 1, 1, 0], pressed)
    zero = page.locator(".pats .count").nth(7)
    check("000 button is locked", zero.get_attribute("aria-disabled") == "true")
    page.locator(".pats .count").nth(0).click()  # 111 켜기 → 30 + 128
    check("111 on → W158 (url too)", inp.input_value() == "W158" and "rule=W158" in page.evaluate("location.hash"), inp.input_value())
    inp.fill("W90")
    inp.press("Enter")
    page.wait_for_timeout(200)
    check("notation W90 → buttons follow", page.evaluate("[...document.querySelectorAll('.pats .count')].map(b => b.getAttribute('aria-pressed') === 'true' ? 1 : 0)") == [0, 1, 0, 1, 1, 0, 1, 0])
    for bad in ("W31", "W256", "W", "abc"):
        inp.fill(bad)
        inp.press("Enter")
        page.wait_for_timeout(150)
        err = page.locator(".code-err").text_content() or ""
        check(f"notation {bad} refused with a reason", bool(err.strip()) and inp.input_value() != "W90" or bool(err.strip()), err)
        inp.press("Escape")
    inp.fill("LLRR")
    inp.press("Enter")
    page.wait_for_timeout(400)
    check("make: ant notation switches family", page.locator(".ant-pad").count() == 1, page.evaluate("location.hash"))

    # ── 지금 줄만 켜고 끄기 ──
    open_make(page, "W90")
    dots = dark_dots(page)
    check("seed cell visible", len(dots) == 1, dots)
    if dots:
        x0, y0 = dots[0]
        page.mouse.click(x0 + 3 * Z, y0)
        page.wait_for_timeout(150)
        c1 = counts(page)[1]
        page.mouse.click(x0 + 3 * Z, y0)
        page.wait_for_timeout(150)
        c2 = counts(page)[1]
        check("tap on the current row toggles a cell", (c1, c2) == (2, 1), (c1, c2))
        page.mouse.click(x0 + 3 * Z, y0 + 4 * Z)
        page.wait_for_timeout(200)
        fl = page.locator(".board-wrap .stage-flash")
        check("tap on another row explains", counts(page)[1] == 1 and "맨 아래" in (fl.text_content() or ""), fl.text_content())
        # 살펴보기: 손 고르기 단추는 판 아래라 누르면 화면이 내려간다 → 맨 위로 올리고 점을 다시 찾는다
        # (보는 곳이 새 줄을 따라 내려가니 넘긴 뒤에도 다시 찾는다)
        page.locator(".transport [role=radio][data-id='look']").click()
        page.evaluate("scrollTo(0, 0)")
        page.wait_for_timeout(150)
        x0, y0 = top_dot(page)
        pk = page.locator(".peek")

        def peek_at(x, y):
            page.mouse.move(x, y, steps=3)
            page.wait_for_timeout(250)
            return pk.text_content() if pk.is_visible() else ""

        txt = peek_at(x0, y0)
        check("look on row 0 says it's the start row", "0세대" in txt, txt)
        txt = peek_at(x0 + Z, y0 + Z)  # 아직 안 만든 1세대 줄: (1, 1) 은 윗줄 100 → 규칙 90 이면 켜짐
        check("look on the next row says it comes next (100)", "다음 세대에 생길" in txt and "100" in txt, txt)
        txt = peek_at(x0, y0 + 2 * Z)
        check("look two rows down says not made yet", "아직 만들지 않았" in txt, txt)
        page.keyboard.press("ArrowRight")  # 규칙 90: 1세대 줄은 (-1, 1)·(1, 1)
        page.mouse.move(2, 2)
        page.wait_for_timeout(250)
        x0, y0 = top_dot(page)
        txt = peek_at(x0, y0 + Z)  # 0세대 점 바로 아래 (0, 1): 윗줄 010 → 꺼짐
        why = page.evaluate("[...document.querySelectorAll('.pats .count')].findIndex(b => b.classList.contains('why'))")
        check("look on row 1 explains 010 and marks that button", "010" in txt and "윗줄" in txt and why == 5, f"{txt} / why={why}")
        page.screenshot(path=f"{a.out}/elementary_look.png")
        txt = peek_at(x0, y0 - 3 * Z)
        check("look above row 0 says not made", "아직 만들지 않았" in txt, txt)
    check("no console errors (editor)", not log.items, log.items)
    ctx.close()

    # ── 키·빠르기 ──
    ctx = new_context(b, "pc1440", "light")
    page = ctx.new_page()
    log = Log(page)
    open_make(page, "W30")
    check("1-D make autoplays", play_label(page) == "일시정지")
    page.keyboard.press("Space")
    page.wait_for_timeout(150)
    g0 = counts(page)[0]
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(150)
    check("keys: Space pauses, → one row", play_label(page) == "재생" and counts(page)[0] == g0 + 1)
    page.keyboard.press("r")
    page.wait_for_timeout(150)
    check("keys: R back", counts(page) == [0, 1])
    for sid, want in (("slow", 8), ("normal", 30), ("fast", 120)):
        page.locator(".transport [role=radio][data-id='%s']" % sid).click()
        blur(page)
        s0 = counts(page)[0]
        page.keyboard.press("Space")
        page.wait_for_timeout(2500)
        page.keyboard.press("Space")
        rate = (counts(page)[0] - s0) / 2.5
        check(f"speed {sid}: about {want} gens/s", 0.75 * want <= rate <= 1.2 * want, f"{rate:.0f}")
    page.screenshot(path=f"{a.out}/elementary_run.png")
    page.keyboard.press("f")
    page.wait_for_timeout(500)
    on = page.evaluate("document.documentElement.classList.contains('has-full')")
    page.screenshot(path=f"{a.out}/elementary_full.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    check("keys: F / Esc fullscreen", on and not page.evaluate("document.documentElement.classList.contains('has-full')"))
    check("no console errors (keys)", not log.items, log.items)
    ctx.close()
    b.close()
check.done()
