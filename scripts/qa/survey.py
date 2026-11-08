"""화면마다 캡처하고 겉모습을 잰다: 크기 3가지 × 밝은·어두운, 그리고 동작 줄이기.

    python3 scripts/qa/survey.py [주소] [--out 폴더]

화면을 위에서 아래로 굴리며 캡처하고(<크기>_<밝기>_<화면>_<n>.png), 콘솔 오류·가로 넘침·
화면 밖으로 삐져나온 것·잘린 글·격자 위 조각끼리 겹침을 찾는다. 동작 줄이기에서는 스스로 돌지 않는지 본다.
"""

from common import VIEWPORTS, Checks, Log, args, launch, layout, new_context, nums, play_label, settle, sync_playwright, HOME_NUMS, RULE_NUMS

PAGES = {
    "home": "#/",
    "conway": "#/r/conway-life",
    "brian": "#/r/brians-brain",
    "starwars": "#/r/star-wars",
    "make": "#/make",
    "about": "#/about",
    "nf": "#/r/nope",
}

a = args(__doc__)
check = Checks("survey", a.out)
with sync_playwright() as p:
    b = launch(p)
    for vp in VIEWPORTS:
        for scheme in ("light", "dark"):
            ctx = new_context(b, vp, scheme)
            for name, frag in PAGES.items():
                page = ctx.new_page()
                log = Log(page)
                page.goto(a.url + frag, wait_until="networkidle")
                settle(page, 900)
                tag = f"{vp}_{scheme}_{name}"
                lay = layout(page)
                y, k = 0, 0
                while y < lay["docH"] and k < 6:
                    page.evaluate(f"window.scrollTo(0, {y})")
                    page.wait_for_timeout(250)
                    page.screenshot(path=f"{a.out}/{tag}_{k}.png")
                    y += int(lay["innerH"] * 0.9)
                    k += 1
                problems = {k2: lay[k2] for k2 in ("sticking", "clipped", "overlaps") if lay[k2]}
                if lay["hOverflow"]:
                    problems["hOverflow"] = lay["scrollW"]
                if log.items:
                    problems["log"] = log.items[:4]
                check(tag, not problems, problems or "")
                page.close()
            ctx.close()
    # 동작 줄이기: 첫 화면과 규칙 화면이 스스로 돌지 않아야 한다
    for vp in ("pc1440", "phone390"):
        ctx = new_context(b, vp, "light", "reduce")
        for name, js in (("home", HOME_NUMS), ("conway", RULE_NUMS)):
            page = ctx.new_page()
            page.goto(a.url + PAGES[name], wait_until="networkidle")
            settle(page, 300)
            g0 = nums(page, js)[0]
            page.wait_for_timeout(1500)
            g1 = nums(page, js)[0]
            page.screenshot(path=f"{a.out}/{vp}_reduce_{name}.png")
            check(f"{vp} reduce {name}: no autoplay", g0 == g1 and play_label(page) == "재생", f"gen {g0}->{g1}, {play_label(page)}")
            page.close()
        ctx.close()
    b.close()
print("캡처:", a.out)
check.done()
