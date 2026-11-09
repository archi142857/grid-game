"""검수가 쪽지로 보낸 버그를 다시 확인한다. 고쳐지면 PASS 가 된다.

    python3 scripts/qa/regress.py [주소] [--out 폴더]

261108 쪽지
- 프론트엔드 · 스페이스가 눌린 단추로 감
- 프론트엔드 · 그래프가 멈춘 뒤 안 맞음
- 프론트엔드 · 폰 첫 화면 끌기 안내
- 프론트엔드 · 없는 화면 탭 제목
- 디자인 · 옅은 글씨 대비(화면마다 작은 글씨를 다 잰다)
- 문구 · 폰에는 커서가 없음

고친 뒤 생길 수 있는 것
- 키보드로 고른 단추는 스페이스로 그대로 눌린다(포커스도 남는다)
- 전체 화면 단추를 마우스로 누른 뒤 스페이스는 재생·일시정지를 한 번만
- 표기를 고쳐 쓰다 격자를 누르면 고친 표기가 들어간다
- 폰 안내는 세로로 쓸 때·전체 화면에서 끌 때는 안 뜬다
"""

from common import (
    HOME_NUMS, RULE_NUMS, Checks, Touch, args, blur, box, cell_center, center_into_view, launch, new_context, nums,
    play_label, settle, sync_playwright,
)

a = args(__doc__)
check = Checks("regress", a.out)

# 보이는 글씨마다 글씨색과 뒤 바탕(반투명은 겹쳐서)의 대비를 잰다. 꺼진 단추는 뺀다(WCAG 도 뺀다).
# 작은 글씨 4.5:1, 큰 글씨(24px 이상, 굵으면 18.66px 이상) 3:1 밑인 것을 돌려준다
CONTRAST_SCAN_JS = r"""
() => {
  // rgb()/rgba() 는 0–255, color-mix 가 내놓는 color(srgb …) 는 0–1. 다른 꼴이면 잴 수 없어서 null
  const parse = (c) => {
    const m = c.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/);
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : +m[4]];
    if (!/^rgba?\(/.test(c)) return null;
    const p = c.match(/[\d.]+/g).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const blend = (top, bot) => { const k = top[3]; return [top[0] * k + bot[0] * (1 - k), top[1] * k + bot[1] * (1 - k), top[2] * k + bot[2] * (1 - k), 1]; };
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (!c) return null; if (c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } }
    let col = [255, 255, 255, 1]; for (let i = stack.length - 1; i >= 0; i--) col = blend(stack[i], col); return col; };
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.textContent.trim(); if (!text) continue;
    const el = n.parentElement; const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (el.closest('[hidden], .sr, .skip, noscript, [aria-disabled="true"], :disabled')) continue;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity;
    if (op === 0) continue;
    const bg = bgOf(el); const c = parse(s.color);
    if (!bg || !c) { out.push(`${el.tagName.toLowerCase()} "${text.slice(0, 16)}" 잴 수 없는 색 ${s.color}`); continue; }
    const fg = blend([c[0], c[1], c[2], c[3] * op], bg);
    const ratio = (Math.max(L(fg), L(bg)) + 0.05) / (Math.min(L(fg), L(bg)) + 0.05);
    const size = parseFloat(s.fontSize), big = size >= 24 || (+s.fontWeight >= 700 && size >= 18.66);
    if (ratio < (big ? 3 : 4.5)) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${text.slice(0, 16)}" ${ratio.toFixed(2)}`);
  }
  return [...new Set(out)].slice(0, 8);
}
"""

with sync_playwright() as p:
    b = launch(p)
    ctx = new_context(b, "pc1440", "light")
    page = ctx.new_page()

    # 1. 스페이스가 눌린 단추로 감
    page.goto(a.url + "#/", wait_until="networkidle")
    settle(page)
    center_into_view(page, ".hero .stage")
    page.locator(".hero .capsule button", has_text="비우기").click()
    for x in (-1, 0, 1):
        page.mouse.click(*cell_center(page, ".hero canvas", x, 0, 11))
        page.wait_for_timeout(60)
    page.keyboard.press("Space")
    page.wait_for_timeout(500)
    n = nums(page, HOME_NUMS)
    check("space after 비우기 + picking cells plays (cells kept)", n[1] == 3 and play_label(page) == "일시정지", f"{n} {play_label(page)}")
    page.keyboard.press("Space")
    page.locator(".hero .chips button", has_text="하이라이프").click()
    page.wait_for_timeout(800)
    l0, g0 = play_label(page), nums(page, HOME_NUMS)[0]
    page.keyboard.press("Space")
    page.wait_for_timeout(300)
    check("space after chip click toggles play (no reseed)", play_label(page) != l0 and nums(page, HOME_NUMS)[0] >= g0, f"{l0}->{play_label(page)}")
    page.goto(a.url + "#/r/conway-life", wait_until="networkidle")
    settle(page)
    page.locator(".side .pad-row").nth(0).locator("button.count").nth(6).click()
    l0 = play_label(page)
    page.keyboard.press("Space")
    page.wait_for_timeout(300)
    check("space after pad click toggles play (B6 stays)", page.locator(".code-in").input_value() == "B36/S23" and play_label(page) != l0)
    page.locator(".transport [role=radio][data-id='draw']").click()
    if play_label(page) == "일시정지":  # 멈춰 둔다
        page.keyboard.press("Space")
    page.wait_for_timeout(200)
    g0 = nums(page, RULE_NUMS)[0]
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(300)
    check("→ after tool click steps (tool stays)", page.locator(".stage").get_attribute("data-tool") == "draw" and nums(page, RULE_NUMS)[0] == g0 + 1,
          f"tool={page.locator('.stage').get_attribute('data-tool')} gen {g0}->{nums(page, RULE_NUMS)[0]}")

    # 고친 뒤: 키보드로 고른 단추는 스페이스로 눌리고 포커스가 남는다
    page.goto(a.url + "#/", wait_until="networkidle")
    settle(page)
    page.evaluate("document.getElementById('main').focus()")
    for _ in range(30):
        page.keyboard.press("Tab")
        if (page.evaluate("document.activeElement.textContent") or "").strip() == "비우기":
            break
    page.keyboard.press("Space")
    page.wait_for_timeout(300)
    st = page.evaluate("(document.activeElement.textContent || '').trim()")
    check("keyboard: Tab to 비우기 + Space clears, focus stays", nums(page, HOME_NUMS)[1] == 0 and st == "비우기", f"{nums(page, HOME_NUMS)} focus={st}")

    # 고친 뒤: 전체 화면 단추를 마우스로 누른 뒤 스페이스는 한 번만
    page.locator(".hero .zoom button[aria-label='전체 화면']").click()
    page.wait_for_timeout(600)
    focus = page.evaluate("document.activeElement.className")
    l0 = play_label(page)
    page.keyboard.press("Space")
    page.wait_for_timeout(300)
    check("fullscreen by mouse, then Space toggles once", play_label(page) != l0, f"focus={focus} {l0}->{play_label(page)}")
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    # 고친 뒤: 표기를 고쳐 쓰다 격자를 누르면 들어간다
    page.goto(a.url + "#/r/conway-life", wait_until="networkidle")
    settle(page)
    page.locator(".code-in").fill("B36/S23")
    bb = page.locator(".board-wrap canvas").bounding_box()
    page.mouse.click(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 3)
    page.wait_for_timeout(300)
    check("typed notation is applied when the grid is clicked", "rule=B36%2FS23" in page.evaluate("location.hash"), page.evaluate("location.hash"))

    # 2. 그래프가 멈춘 뒤 안 맞음(빠르게로 돌리다 여러 번 멈춰 본다)
    page.goto(a.url + "#/r/conway-life", wait_until="networkidle")
    settle(page)
    page.locator(".transport [role=radio][data-id='fast']").click()
    bad = []
    for k in range(8):
        page.wait_for_timeout(450 + 97 * k)
        page.locator(".capsule .play").click()
        page.wait_for_timeout(400)
        gen = nums(page, RULE_NUMS)[0]
        right = page.evaluate("document.querySelectorAll('.side .spark-label span')[1].textContent").replace(",", "")
        if right != f"{gen}세대":
            bad.append(f"{gen}/{right}")
        page.locator(".capsule .play").click()
    page.locator(".transport [role=radio][data-id='normal']").click()
    check("graph matches gen after pause", not bad, bad)

    # 4. 없는 화면 탭 제목
    page.goto(a.url + "#/about", wait_until="networkidle")
    settle(page, 300)
    page.goto(a.url + "#/r/nope", wait_until="networkidle")
    settle(page, 300)
    check("404 sets its own title", not page.title().startswith("소개"), page.title())

    # 6. 폰에는 커서가 없음: 도감 머리 글
    page.goto(a.url + "#/", wait_until="networkidle")
    settle(page, 300)
    head = page.locator("#rules .section-head p").text_content()
    check("shelf intro doesn't talk about a cursor", "커서" not in head, head)
    ctx.close()

    # 5. 옅은 글씨 대비: 화면마다 보이는 글씨를 다 잰다(PC·폰, 밝은·어두운, 규칙 화면 전체 화면까지)
    for vp in ("pc1440", "phone390"):
        for scheme in ("light", "dark"):
            c2 = new_context(b, vp, scheme, "reduce")
            pg = c2.new_page()
            low = []
            for frag in ("#/", "#/r/brians-brain", "#/make", "#/about", "#/r/nope"):
                pg.goto(a.url + frag, wait_until="networkidle")
                settle(pg, 300)
                if pg.locator("details.more summary").count():
                    pg.locator("details.more summary").click()
                low += [f"{frag} {x}" for x in pg.evaluate(CONTRAST_SCAN_JS)]
            blur(pg)
            pg.keyboard.press("f")
            pg.wait_for_timeout(500)
            low += [f"full {x}" for x in pg.evaluate(CONTRAST_SCAN_JS)]
            check(f"text contrast ({vp} {scheme})", not low, low[:6])
            c2.close()

    # 3. 폰 첫 화면 끌기 안내: 옆으로 끌면 뜨고, 세로로 쓸 때·전체 화면에서는 안 뜬다
    #    옆으로 끌기를 맨 먼저 한다(전체 화면을 나온 바로 뒤에는 자리가 덜 잡혀 가끔 안 떴다)
    ctx = new_context(b, "phone390", "light")
    page = ctx.new_page()
    t = Touch(ctx, page)
    page.goto(a.url + "#/", wait_until="networkidle")
    settle(page)
    center_into_view(page, ".hero .stage")
    t.tap_el(".hero .capsule .play")
    fl = page.locator(".hero .stage-flash")
    cv = box(page, ".hero canvas")
    t.drag(cv["x"] + cv["w"] * 0.2, cv["y"] + cv["h"] / 2, cv["x"] + cv["w"] * 0.8, cv["y"] + cv["h"] / 2 + 4)
    try:  # 2.4초 떠 있으니 뜰 때까지 조금 기다린다
        fl.wait_for(state="visible", timeout=2000)
    except Exception:
        pass
    check("phone home: sideways drag shows a hint", fl.is_visible(), fl.text_content() if fl.count() else "")
    page.screenshot(path=f"{a.out}/phone390_touch_hint.png")
    page.wait_for_timeout(2800)  # 안내가 사라질 때까지
    cv = box(page, ".hero canvas")
    t.drag(cv["x"] + cv["w"] / 2, cv["y"] + cv["h"] * 0.7, cv["x"] + cv["w"] / 2 + 6, cv["y"] + cv["h"] * 0.2)
    check("phone home: vertical swipe shows no hint", not fl.is_visible(), fl.text_content())
    center_into_view(page, ".hero .stage")
    t.tap_el(".hero .zoom button[aria-label='전체 화면']")
    page.wait_for_timeout(500)
    cv = box(page, ".hero canvas")
    t.drag(cv["x"] + cv["w"] * 0.2, cv["y"] + cv["h"] / 2, cv["x"] + cv["w"] * 0.8, cv["y"] + cv["h"] / 2 + 4)
    check("phone full: one-finger drag shows no hint", not fl.is_visible(), fl.text_content())
    t.tap_el(".hero .zoom button[aria-label='전체 화면 끝내기']")
    page.wait_for_timeout(500)
    ctx.close()
    b.close()
check.done()
