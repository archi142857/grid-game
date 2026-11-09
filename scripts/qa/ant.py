"""개미·터마이트: 걸음마다 칠한 칸 수를 작은 파이썬 기준 구현과 견주고, 개미 화면을 손으로 해 본다.

    python3 scripts/qa/ant.py [주소] [--out 폴더]

- 기준 구현(RefAnts): 밟은 칸 색대로 돌고 → 칠하고 → 한 칸 간다. 개미가 여럿이면 놓인 차례대로(설계 3절).
  방향 0 위·1 오른쪽·2 아래·3 왼쪽, 위가 y−1(core/ant.js 와 같은 약속). 랭턴의 개미는 1만 걸음쯤 뒤 104걸음마다 12칸씩
  느는 고속도로가 나오는 것으로 기준 구현부터 확인한다
- 도감의 개미 규칙마다: → 로 넘기며 칠한 칸 수, 처음으로, 빠르게(1초 3000걸음) 돌린 뒤의 칸 수
- 개미 손(놓기 → 시계 방향 → 왼쪽 보던 개미는 치우기), 이동 손으로 칸 색 바꾸기, 그리기, 살펴보기
- 회전 글자 단추·색 더하기·빼기, 표기 칸(LLRR, 틀린 글자, Life 표기), 만들기의 계열 고르기, 터마이트 표
- 키(스페이스·→·R·F·Esc), 빠르기 세 가지가 내는 걸음/초, 첫 화면 칩은 Life 만·도감 묶음, 폰 손가락
"""

from common import (
    RULE_NUMS, Checks, Log, Touch, args, blur, box, canvas_img, cell_center, center_into_view, diff, launch, new_context,
    nums, play_label, settle, sync_playwright,
)

a = args(__doc__)
check = Checks("ant", a.out)
BOARD = ".board-wrap canvas"
Z = 8  # families.js 개미 zoom
TURN = {"N": 0, "R": 1, "U": 2, "L": 3}
DX, DY = [0, 1, 0, -1], [-1, 0, 1, 0]


class RefAnts:
    def __init__(self, rule, agents):
        if "machine" in rule:
            self.m = rule["machine"]
        else:
            t = rule["turns"]
            self.m = [[[(c + 1) % len(t), t[c], 0] for c in range(len(t))]]
        self.cells, self.steps = {}, 0
        self.ants = [{"x": g["x"], "y": g["y"], "dir": "NESW".index(g["dir"]), "state": 0} for g in agents]

    def step(self, n=1):
        for _ in range(n):
            for g in self.ants:
                p = (g["x"], g["y"])
                w, turn, nxt = self.m[g["state"]][self.cells.get(p, 0)]
                g["dir"] = (g["dir"] + TURN[turn]) % 4
                if w:
                    self.cells[p] = w
                else:
                    self.cells.pop(p, None)
                g["state"] = nxt
                g["x"] += DX[g["dir"]]
                g["y"] += DY[g["dir"]]
            self.steps += 1
        return len(self.cells)

    def cycle(self, x, y):
        """개미 손과 같게: 없으면 위를 보는 개미, 있으면 시계 방향, 왼쪽을 보던 개미는 치운다"""
        for i, g in enumerate(self.ants):
            if (g["x"], g["y"]) == (x, y):
                if g["dir"] == 3:
                    self.ants.pop(i)
                    return "remove"
                g["dir"] += 1
                return "turn"
        self.ants.append({"x": x, "y": y, "dir": 0, "state": 0})
        return "add"


def press(page, key, n):
    for _ in range(n):
        page.keyboard.press(key)


def counts(page):
    return nums(page, RULE_NUMS)[:2]  # [걸음, 칠한 칸]


def open_rule(page, rid):
    """같은 주소로 다시 가면 화면이 새로 안 그려져서(hashchange 가 없다) 그때는 새로 고친다"""
    if page.evaluate("location.hash") == f"#/r/{rid}":
        page.reload(wait_until="networkidle")
    else:
        page.goto(a.url + f"#/r/{rid}", wait_until="networkidle")
    settle(page, 400)
    blur(page)
    page.mouse.move(2, 2)


# 기준 구현부터: 랭턴의 개미 고속도로(104걸음마다 12칸)
ref = RefAnts({"turns": "RL"}, [{"x": 0, "y": 0, "dir": "N"}])
ref.step(11000)
gains = []
for _ in range(5):
    c0 = len(ref.cells)
    gains.append(ref.step(104) - c0)
check("reference: Langton highway adds 12 cells per 104 steps", gains == [12] * 5, gains)

with sync_playwright() as p:
    b = launch(p)
    ctx = new_context(b, "pc1440", "light", "reduce")
    page = ctx.new_page()
    log = Log(page)
    ids = page.evaluate("async (u) => (await (await fetch(u + 'data/rules/index.json')).json())", a.url)
    rules = {i: page.evaluate("async ([u, i]) => (await (await fetch(u + `data/rules/${i}.json`)).json())", [a.url, i]) for i in ids}
    ants = [i for i in ids if rules[i].get("family") == "ant"]
    check("catalog lists ant rules", len(ants) >= 4, ants)

    # ── 칠한 칸 수: → 로 넘기며 ──
    MARKS = [1, 2, 5, 10, 50, 200, 500]
    for rid in ants:
        open_rule(page, rid)
        check(f"{rid}: starts at 0 steps, no hint", counts(page) == [0, 0] and not page.locator(".board-wrap .stage-hint").is_visible(), counts(page))
        r = RefAnts(rules[rid]["rule"], rules[rid]["agents"])
        got, want, done = [], [], 0
        for m in MARKS:
            press(page, "ArrowRight", m - done)
            done = m
            page.wait_for_timeout(60)
            got.append(counts(page))
            want.append([m, r.step(m - r.steps)])
        check(f"{rid}: painted cells match reference ({MARKS[-1]} steps)", got == want, f"site {got[-3:]} / ref {want[-3:]}")
        page.keyboard.press("r")
        page.wait_for_timeout(150)
        check(f"{rid}: R back to start", counts(page) == [0, 0], counts(page))
    check("no console errors (counts)", not log.items, log.items)
    ctx.close()

    # ── 빠르게 돌린 뒤(동작 줄이지 않음): 1초 3000걸음 ──
    ctx = new_context(b, "pc1440", "light")
    page = ctx.new_page()
    log = Log(page)
    for rid in ants:
        open_rule(page, rid)
        if play_label(page) == "일시정지":
            page.keyboard.press("Space")
        page.keyboard.press("r")
        page.locator(".transport [role=radio][data-id='fast']").click()
        blur(page)
        page.keyboard.press("Space")
        page.wait_for_timeout(4000)
        page.keyboard.press("Space")
        page.wait_for_timeout(200)
        s, c = counts(page)
        r = RefAnts(rules[rid]["rule"], rules[rid]["agents"])
        rc = r.step(s)
        check(f"{rid}: after {s:,} fast steps cells match reference", c == rc and s > 8000, f"site {c} / ref {rc}, {s / 4:.0f} 걸음/초")
    # 빠르기 세 가지가 내는 걸음/초(랭턴의 개미)
    open_rule(page, "langtons-ant")
    if play_label(page) == "일시정지":
        page.keyboard.press("Space")
    for sid, want in (("slow", 30), ("normal", 300), ("fast", 3000)):
        page.locator(".transport [role=radio][data-id='%s']" % sid).click()
        blur(page)
        s0 = counts(page)[0]
        page.keyboard.press("Space")
        page.wait_for_timeout(2000)
        page.keyboard.press("Space")
        rate = (counts(page)[0] - s0) / 2
        check(f"speed {sid}: about {want} steps/s", 0.8 * want <= rate <= 1.2 * want, f"{rate:.0f}")
    page.locator(".transport [role=radio][data-id='normal']").click()
    check("no console errors (fast)", not log.items, log.items)
    ctx.close()

    # ── 손: 개미 놓기·돌리기·치우기, 칸 색 바꾸기, 그리기, 살펴보기 ──
    ctx = new_context(b, "pc1440", "light", "reduce")
    page = ctx.new_page()
    log = Log(page)
    open_rule(page, "langtons-ant")
    r = RefAnts(rules["langtons-ant"]["rule"], rules["langtons-ant"]["agents"])
    page.locator(".transport [role=radio][data-id='ant']").click()
    for _ in range(3):  # 놓기 → 돌리기 → 돌리기(위 → 오른쪽 → 아래)
        page.mouse.click(*cell_center(page, BOARD, 10, 0, Z))
        r.cycle(10, 0)
    page.mouse.move(2, 2)
    press(page, "ArrowRight", 3)
    page.wait_for_timeout(100)
    check("ant hand: new ant walks too (2 ants)", counts(page) == [3, r.step(3)], f"{counts(page)} / ref {r.steps}, {len(r.cells)}")
    g = r.ants[1]
    acts = []
    for _ in range(4):  # 돌리기 → … → 왼쪽을 보면 치운다
        x, y = g["x"], g["y"]
        page.mouse.click(*cell_center(page, BOARD, x, y, Z))
        act = r.cycle(x, y)
        acts.append(act)
        press(page, "ArrowRight", 2)
        page.wait_for_timeout(80)
        want = r.step(2)
        if counts(page)[1] != want:
            break
        if act == "remove":
            break
        g = next(q for q in r.ants if q is g)
    check("ant hand: turn clockwise, then remove (matches reference)", counts(page)[1] == len(r.cells) and acts[-1] == "remove", f"{acts} site {counts(page)} ref {len(r.cells)}")
    page.locator(".transport [role=radio][data-id='pan']").click()
    page.mouse.click(*cell_center(page, BOARD, -12, 6, Z))
    r.cells[(-12, 6)] = 1
    page.wait_for_timeout(100)
    check("pan hand: click paints the next color", counts(page)[1] == len(r.cells), f"{counts(page)} / ref {len(r.cells)}")
    page.locator(".transport [role=radio][data-id='draw']").click()
    c0 = counts(page)[1]
    sx, sy = cell_center(page, BOARD, -20, -8, Z)
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(sx + 12 * Z, sy, steps=12)
    page.mouse.up()
    page.wait_for_timeout(150)
    check("draw hand: a stroke paints a line", counts(page)[1] >= c0 + 10, f"{c0}->{counts(page)[1]}")
    # 살펴보기: 개미가 있는 칸, 빈칸
    open_rule(page, "langtons-ant")
    page.locator(".transport [role=radio][data-id='look']").click()
    page.mouse.move(*cell_center(page, BOARD, 0, 0, Z))
    page.wait_for_timeout(250)
    peek = page.locator(".peek")
    txt = peek.text_content() if peek.is_visible() else ""
    check("look: ant cell explains the turn", "도는 쪽" in txt and "개미가 있어요" in txt, txt)
    page.mouse.move(*cell_center(page, BOARD, 5, 5, Z))
    page.wait_for_timeout(250)
    txt = peek.text_content() if peek.is_visible() else ""
    check("look: empty cell says what an ant would do", "개미가 밟으면" in txt, txt)
    page.screenshot(path=f"{a.out}/ant_look.png")

    # ── 회전 글자·색 수·표기 ──
    page.goto(a.url + "#/make?family=ant", wait_until="networkidle")
    settle(page, 300)
    inp = page.locator(".code-in")
    check("make ant: starts as RL", inp.input_value() == "RL", inp.input_value())
    page.locator(".ant-pad .pad-row").nth(0).locator("button.count", has_text="L").click()
    check("turn letter: color 0 → L gives LL", inp.input_value() == "LL", inp.input_value())
    page.locator(".ant-pad button", has_text="색 더하기").click()
    check("색 더하기 → LLL", inp.input_value() == "LLL" and page.locator(".ant-pad .pad-row").count() == 3, inp.input_value())
    page.locator(".ant-pad .pad-row").nth(2).locator("button.count", has_text="U").click()
    check("turn letter U on color 2 → LLU", inp.input_value() == "LLU", inp.input_value())
    page.locator(".ant-pad button", has_text="색 빼기").click()
    check("색 빼기 → LL", inp.input_value() == "LL", inp.input_value())
    check("can't go below 2 colors (색 빼기 off)", page.locator(".ant-pad button", has_text="색 빼기").is_disabled() and inp.input_value() == "LL", inp.input_value())
    check("url carries the ant notation", "rule=LL" in page.evaluate("location.hash"), page.evaluate("location.hash"))
    inp.fill("LLRR")
    inp.press("Enter")
    page.wait_for_timeout(200)
    check("notation LLRR → 4 colors", page.locator(".ant-pad .pad-row").count() == 4 and "rule=LLRR" in page.evaluate("location.hash"))
    inp.fill("LLXR")
    inp.press("Enter")
    check("bad letters → error", "읽을 수 없는" in (page.locator(".code-err").text_content() or ""), page.locator(".code-err").text_content())
    inp.press("Escape")
    inp.fill("B3/S23")
    inp.press("Enter")
    page.wait_for_timeout(400)
    check("make: Life notation switches family", "rule=B3%2FS23" in page.evaluate("location.hash") and page.locator(".pad").count() > 0, page.evaluate("location.hash"))
    page.locator("[role=radio]", has_text="개미").first.click()
    page.wait_for_timeout(400)
    check("make: family picker → ant", page.locator(".ant-pad").count() == 1, page.evaluate("location.hash"))
    open_rule(page, "langtons-ant")
    page.locator(".code-in").fill("B3/S23")
    page.locator(".code-in").press("Enter")
    check("ant rule page: Life notation is refused", "개미 표기" in (page.locator(".code-err").text_content() or ""), page.locator(".code-err").text_content())
    open_rule(page, "fibonacci-turmite")
    check("turmite: table shown, turn rows hidden", page.locator("table.machine tbody tr").count() == 2 and page.locator(".ant-pad .turns").is_hidden())

    # ── 키 ──
    ctx2 = new_context(b, "pc1440", "light")
    pg = ctx2.new_page()
    open_rule(pg, "langtons-ant")
    check("ant page autoplays", play_label(pg) == "일시정지")
    pg.keyboard.press("Space")
    pg.wait_for_timeout(150)
    s0 = counts(pg)[0]
    pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(150)
    check("keys: Space pauses, → one step", play_label(pg) == "재생" and counts(pg)[0] == s0 + 1, f"{s0}->{counts(pg)[0]}")
    pg.keyboard.press("r")
    pg.wait_for_timeout(150)
    check("keys: R back", counts(pg)[0] == 0)
    pg.keyboard.press("f")
    pg.wait_for_timeout(500)
    on = pg.evaluate("document.documentElement.classList.contains('has-full')")
    pg.screenshot(path=f"{a.out}/ant_full.png")
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(400)
    check("keys: F / Esc fullscreen", on and not pg.evaluate("document.documentElement.classList.contains('has-full')"))
    ctx2.close()

    # ── 첫 화면: 칩은 Life 만, 도감은 계열별 묶음 ──
    page.goto(a.url + "#/", wait_until="networkidle")
    settle(page, 400)
    chips = page.locator(".hero .chips button").all_text_contents()
    life_names = [rules[i]["name"] for i in ids if rules[i].get("family") == "life"]
    check("home chips: Life only", len(chips) == len(life_names), chips)
    groups = page.locator(".shelf-group").count()
    thumbs = page.locator(".specimens li a[href^='#/r/']").count()  # '새 규칙 만들기' 카드는 빼고
    check("home shelf: grouped by family, every rule there", groups >= 2 and thumbs == len(ids), f"groups {groups}, thumbs {thumbs}/{len(ids)}")
    ant_li = page.locator(".specimens li", has_text=rules["langtons-ant"]["name"]).first
    ant_li.scroll_into_view_if_needed()
    check("no console errors (hands, editor, home)", not log.items, log.items)
    ctx.close()

    # ── 폰: 개미 손으로 톡, 한 손가락 끌기 ──
    ctx = new_context(b, "phone390", "light", "reduce")
    page = ctx.new_page()
    log = Log(page)
    t = Touch(ctx, page)
    open_rule(page, "langtons-ant")
    center_into_view(page, ".board-wrap .stage")
    t.tap_el(".transport [role=radio][data-id='ant']")
    center_into_view(page, ".board-wrap .stage")
    r = RefAnts(rules["langtons-ant"]["rule"], rules["langtons-ant"]["agents"])
    t.tap(*cell_center(page, BOARD, 6, 0, Z))
    r.cycle(6, 0)
    t.tap_el(".board-wrap .capsule .play")
    page.wait_for_timeout(600)
    t.tap_el(".board-wrap .capsule .play")
    page.wait_for_timeout(150)
    s, c = counts(page)
    check("phone: tapped ant walks (2 ants)", s > 0 and c == r.step(s), f"site {counts(page)} ref {len(r.cells)}")
    t.tap_el(".transport [role=radio][data-id='pan']")
    center_into_view(page, ".board-wrap .stage")
    cv = box(page, BOARD)
    y0, x = page.evaluate("scrollY"), canvas_img(page, BOARD)
    t.drag(cv["x"] + cv["w"] * 0.6, cv["y"] + cv["h"] * 0.6, cv["x"] + cv["w"] * 0.3, cv["y"] + cv["h"] * 0.3)
    check("phone: one-finger drag pans the ant board", diff(x, canvas_img(page, BOARD)) > 0.005 and page.evaluate("scrollY") == y0)
    page.screenshot(path=f"{a.out}/ant_phone.png")
    check("no console errors (phone)", not log.items, log.items)
    ctx.close()
    b.close()
check.done()
