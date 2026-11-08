"""검수가 쪽지로 보낸 버그를 다시 확인한다. 고쳐지면 PASS 가 된다.

    python3 scripts/qa/regress.py [주소] [--out 폴더]

261108 쪽지
- 프론트엔드 · 스페이스가 눌린 단추로 감
- 프론트엔드 · 그래프가 멈춘 뒤 안 맞음
- 프론트엔드 · 폰 첫 화면 끌기 안내
- 프론트엔드 · 없는 화면 탭 제목
- 디자인 · 옅은 글씨 대비
"""

from common import (
    HOME_NUMS, RULE_NUMS, Checks, Touch, args, box, cell_center, center_into_view, launch, new_context, nums, play_label,
    settle, sync_playwright,
)

a = args(__doc__)
check = Checks("regress", a.out)

# 글씨색과 그 뒤의 첫 불투명한 바탕색으로 대비를 잰다
CONTRAST_JS = r"""
(sel) => {
  const parse = (c) => { const p = c.match(/[\d.]+/g).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const el = document.querySelector(sel);
  let bg = [255, 255, 255, 1];
  for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0.5) { bg = c; break; } }
  const a = L(parse(getComputedStyle(el).color)), b = L(bg);
  return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
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
    page.keyboard.press("Space")  # 멈춰 둔다
    page.wait_for_timeout(200)
    g0 = nums(page, RULE_NUMS)[0]
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(300)
    check("→ after tool click steps (tool stays)", page.locator(".stage").get_attribute("data-tool") == "draw" and nums(page, RULE_NUMS)[0] == g0 + 1,
          f"tool={page.locator('.stage').get_attribute('data-tool')} gen {g0}->{nums(page, RULE_NUMS)[0]}")

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

    # 5. 옅은 글씨 대비(밝은·어두운)
    for scheme in ("light", "dark"):
        c2 = new_context(b, "pc1440", scheme, "reduce")
        pg = c2.new_page()
        pg.goto(a.url + "#/r/conway-life", wait_until="networkidle")
        settle(pg, 300)
        r1 = pg.evaluate(CONTRAST_JS, ".status")
        pg.goto(a.url + "#/", wait_until="networkidle")
        settle(pg, 300)
        r2 = pg.evaluate(CONTRAST_JS, ".spec-meta")
        check(f"small gray text >= 4.5:1 ({scheme})", r1 >= 4.5 and r2 >= 4.5, f".status {r1}, .spec-meta {r2}")
        c2.close()
    ctx.close()

    # 3. 폰 첫 화면: 한 손가락으로 옆으로 끌면 안내가 뜬다
    ctx = new_context(b, "phone390", "light")
    page = ctx.new_page()
    t = Touch(ctx, page)
    page.goto(a.url + "#/", wait_until="networkidle")
    settle(page)
    center_into_view(page, ".hero .stage")
    t.tap_el(".hero .capsule .play")
    cv = box(page, ".hero canvas")
    t.drag(cv["x"] + cv["w"] * 0.2, cv["y"] + cv["h"] / 2, cv["x"] + cv["w"] * 0.8, cv["y"] + cv["h"] / 2 + 4)
    fl = page.locator(".hero .stage-flash")
    check("phone home: sideways drag shows a hint", fl.is_visible(), fl.text_content() if fl.count() else "")
    ctx.close()
    b.close()
check.done()
