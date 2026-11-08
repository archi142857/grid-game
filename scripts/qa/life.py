"""Life 가 그대로인지: 정해진 무늬를 정해진 세대만큼 넘겨 산 칸 수를 견준다. 엔진이 바뀌어도(예: world.js → sim.js) 같아야 한다.

    python3 scripts/qa/life.py [주소] [--save] [--out 폴더]

- 알려진 답: R-펜토미노는 1102세대 118칸 → 1103세대 116칸에서 잠잠해지고, 고스퍼 글라이더 총은 30세대마다 5칸씩 는다(36 → 300세대 86).
  글라이더는 늘 5칸. 이 값은 작은 파이썬 시뮬레이터로 따로 셈해 맞춰 봤다
- 기준값: Life 계열 도감 규칙마다 '볼 것'의 무늬 카드를 놓고 세대마다 산 칸 수를 적어 둔 것(life_baseline.json).
  --save 는 지금 사이트로 기준값을 새로 쓴다. 엔진을 바꾸기 전에 한 번 저장해 두고, 바꾼 뒤에 견준다

무늬는 '놓아 보기' 로 놓고(동작 줄이기라 스스로 돌지 않는다) → 키로 한 세대씩 넘긴다. 무작위로 뿌리는 모습은 쓰지 않는다.
"""

import json
from pathlib import Path

from common import RULE_NUMS, Checks, args, blur, launch, new_context, nums, settle, sync_playwright

a = args(__doc__, lambda p: p.add_argument("--save", action="store_true", help="지금 사이트로 기준값을 새로 쓴다"))
check = Checks("life", a.out)
BASE_FILE = Path(__file__).with_name("life_baseline.json")
MARKS = [1, 2, 3, 5, 10, 20, 50, 100, 200]  # 산 칸 수를 적어 둘 세대


def place(page, rule_id, name):
    """규칙 화면을 열고 그 이름의 무늬 카드를 놓는다. 놓인 뒤 (세대, 산 칸)"""
    page.goto(a.url + f"#/r/{rule_id}", wait_until="networkidle")
    settle(page, 300)
    card = page.locator(".cards .card", has=page.locator("h3", has_text=name)).first
    card.scroll_into_view_if_needed()
    card.locator("button").click()
    page.wait_for_timeout(200)
    blur(page)
    return nums(page, RULE_NUMS)[:2]


def run_to(page, gen):
    """→ 를 눌러 gen 세대까지 넘기고 산 칸 수"""
    now = nums(page, RULE_NUMS)[0]
    for _ in range(gen - now):
        page.keyboard.press("ArrowRight")
    page.wait_for_timeout(150)
    g, pop = nums(page, RULE_NUMS)[:2]
    return pop if g == gen else f"gen {g} != {gen}"


with sync_playwright() as p:
    b = launch(p)
    ctx = new_context(b, "pc1440", "light", "reduce")
    page = ctx.new_page()

    # ── 알려진 답 ──
    check("R-pentomino placed", place(page, "conway-life", "R-펜토미노") == [0, 5])
    got = {g: run_to(page, g) for g in (1102, 1103, 1110)}
    check("R-pentomino: 1102 → 118, 1103 → 116, 1110 → 116", got == {1102: 118, 1103: 116, 1110: 116}, got)
    page.keyboard.press("r")
    page.wait_for_timeout(150)
    check("R-pentomino: R goes back to the 5 cells", nums(page, RULE_NUMS)[:2] == [0, 5], nums(page, RULE_NUMS))
    check("Gosper gun placed", place(page, "conway-life", "고스퍼 글라이더 총") == [0, 36])
    got = {g: run_to(page, g) for g in (30, 60, 300)}
    check("Gosper gun: 36 + 5 per 30 gens", got == {30: 41, 60: 46, 300: 86}, got)
    place(page, "conway-life", "글라이더")
    check("glider stays 5 cells for 100 gens", all(run_to(page, g) == 5 for g in (4, 37, 100)))

    # ── 기준값: Life 계열 도감 규칙의 무늬 카드 전부 ──
    ids = page.evaluate("fetch('data/rules/index.json').then(r => r.json())")
    seen = {}
    for rid in ids:
        rule = page.evaluate("(id) => fetch(`data/rules/${id}.json`).then(r => r.json())", rid)
        if rule.get("family") != "life":
            continue
        page.goto(a.url + f"#/r/{rid}", wait_until="networkidle")
        settle(page, 300)
        names = page.evaluate(
            "() => [...document.querySelectorAll('.cards .card')].filter(c => c.querySelector('button')?.textContent.trim() === '놓아 보기').map(c => c.querySelector('h3').textContent.trim())"
        )
        for name in names:
            g0, p0 = place(page, rid, name)
            seen[f"{rid}/{name}"] = [p0] + [run_to(page, g) for g in MARKS]

    if a.save:
        BASE_FILE.write_text(json.dumps({"marks": [0] + MARKS, "pops": seen}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"기준값 저장: {BASE_FILE} ({len(seen)}개)")
        check("baseline saved", bool(seen), len(seen))
    else:
        base = json.loads(BASE_FILE.read_text(encoding="utf-8"))["pops"]
        for key in sorted(set(base) | set(seen)):
            check(f"baseline {key}", base.get(key) == seen.get(key), f"기준 {base.get(key)} / 지금 {seen.get(key)}")
    ctx.close()
    b.close()
check.done()
