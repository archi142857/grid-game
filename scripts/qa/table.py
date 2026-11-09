"""조건표(와이어월드 꼴): 세대마다 상태 1 칸 수를 작은 파이썬 기준 구현과 견주고, 조건표 화면을 해 본다.

    python3 scripts/qa/table.py [주소] [--out 폴더]

- 기준 구현: 줄을 위에서부터 보고 처음 맞는 줄(지금 상태, 무어 이웃 8칸 가운데 셀 상태인 칸 수)대로, 맞는 줄이 없으면 그대로.
  곧은 도선 위 전자가 한 세대에 한 칸씩 가다 끝에서 없어지는 것(알려진 답)으로 기준부터 확인한다
- 만들기(#/make?family=table)와 도감 와이어월드(#/r/wireworld): → 로 넘기며 전자 머리 수
- 줄 고치기: 상태 단추(Shift 는 앞), '늘' → 조건, 셀 상태를 마지막 다음으로 → 다시 '늘', 이웃 수, 줄 더하기·지우기,
  막는 것(이웃 없는 빈칸이 바뀌는 줄은 건너뜀·0 단추 잠금, 셋째 세는 상태). 고친 줄로 다시 기준과 견준다
- 칠할 상태(조건표·브라이언의 뇌·스타워즈·LLRR), 그리기, 살펴보기(맞은 줄, 이웃 수), 더 보기 상태 수, 규칙 파일, 키, 빠르기, 폰
"""

import json
import re

from refs import WIREWORLD, RefTable, parse_rle
from common import (
    RULE_NUMS, Checks, Log, Touch, args, blur, cell_center, launch, layout, new_context, nums, play_label, settle, sync_playwright,
)

a = args(__doc__)
check = Checks("table", a.out)
BOARD = ".board-wrap canvas"
Z = 12  # families.js 조건표 zoom(PC)
NAMES = ["빈칸", "전자 머리", "전자 꼬리", "도선"]
SEED = ".BAC$C3.25C$.3C!"  # 만들기의 처음 회로(시계)
LOCK = "이웃이 없는 빈칸이 바뀌는 줄"
MANY = "세는 상태는 2가지까지"


def ref_counts(transitions, seed, marks):
    r = RefTable(transitions, parse_rle(seed))
    return [[m, r.step(m - r.gen)] for m in marks]


def counts(page):
    return nums(page, RULE_NUMS)[:2]  # [세대, 상태 1 칸 수]


def open_hash(page, h):
    """같은 주소로 다시 가면 화면이 새로 안 그려져서 그때는 새로 고친다"""
    if page.evaluate("location.hash") == h:
        page.reload(wait_until="networkidle")
    else:
        page.goto(a.url + h, wait_until="networkidle")
    settle(page, 400)
    blur(page)
    page.mouse.move(2, 2)


def site_counts(page, marks):
    got, done = [], counts(page)[0]
    for m in marks:
        for _ in range(m - done):
            page.keyboard.press("ArrowRight")
        done = m
        page.wait_for_timeout(60)
        got.append(counts(page))
    return got


ROWS_JS = """() => [...document.querySelectorAll('.trs > li.tr')].map(li => {
  const lab = (b) => (b.getAttribute('aria-label') || '').split(': ').pop();
  const st = [...li.querySelectorAll(':scope > .tr-st:not(.tr-always)')];
  const of = li.querySelector('.tr-of .tr-st');
  const cs = [...li.querySelectorAll('.count')];
  return { from: lab(st[0]), to: lab(st[1]), of: of ? lab(of) : null, always: !!li.querySelector('.tr-always'),
    counts: cs.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => +b.textContent),
    locked: cs.filter(b => b.classList.contains('locked') && b.getAttribute('aria-disabled') === 'true').map(b => +b.textContent),
    why: li.classList.contains('why'), cwhy: cs.filter(b => b.classList.contains('why')).map(b => +b.textContent) };
})"""


def rows(page):
    return page.evaluate(ROWS_JS)


def as_transitions(rs):
    """화면 줄 → 규칙 파일의 transitions"""
    out = []
    for r in rs:
        tr = {"from": NAMES.index(r["from"]), "to": NAMES.index(r["to"])}
        if r["of"]:
            tr["when"] = {"state": NAMES.index(r["of"]), "count": r["counts"]}
        out.append(tr)
    return out


def k(page, key):
    return page.locator(f'.trs [data-k="{key}"]')


def say(page):
    return (page.locator(".side .say").text_content() or "").strip()


def scroll_top(page):
    page.evaluate("scrollTo(0, 0)")
    page.wait_for_timeout(100)


def pick(page, group, id_):
    """판 아래 손·빠르기 단추나 칠할 상태 단추. 누르면 쪽이 내려가니 다시 맨 위로"""
    page.locator(f".{group} [role=radio][data-id='{id_}']").click()
    scroll_top(page)


def peek_at(page, x, y):
    page.mouse.move(*cell_center(page, BOARD, x, y, Z), steps=3)
    page.wait_for_timeout(250)
    pk = page.locator(".peek")
    return re.sub(r"\s+", " ", pk.text_content() or "").strip() if pk.is_visible() else ""


# 기준 구현부터: 곧은 도선 위 전자(꼬리·머리)는 한 세대에 한 칸씩 가고, 끝에 닿으면 없어진다
r = RefTable(WIREWORLD, parse_rle("BA8C!"))
heads = [r.count(1)] + [r.step() for _ in range(10)]
r2 = RefTable(WIREWORLD, parse_rle("BA8C!"))
r2.step(5)
check("reference: electron moves 1 cell/gen on a wire, gone at the end", heads == [1] * 9 + [0, 0] and r2.cells.get((6, 0)) == 1, heads)

with sync_playwright() as p:
    b = launch(p)
    ctx = new_context(b, "pc1440", "light", "reduce")
    page = ctx.new_page()
    log = Log(page)
    MARKS = [1, 2, 3, 5, 8, 10, 20, 50, 100]

    # ── 처음 화면과 전자 머리 수 ──
    open_hash(page, "#/make?family=table")
    rs = rows(page)
    check("make table: starts with the WireWorld rows", as_transitions(rs) == WIREWORLD and all(r["always"] == (r["of"] is None) for r in rs), rs)
    lab = page.evaluate("[...document.querySelectorAll('.side .readout > *')].map(e => e.textContent.trim())")
    check("make table: readout counts 전자 머리, gen 0 with 1 head", lab[2] == "전자 머리" and counts(page) == [0, 1], lab)
    paints = page.evaluate("[...document.querySelectorAll('.paints [role=radio]')].map(b => [b.dataset.id, b.textContent.trim(), b.getAttribute('aria-checked')])")
    check("paint picker: 4 states, 도선 picked first", [x[1] for x in paints] == NAMES and paints[3][2] == "true", paints)
    got = site_counts(page, MARKS)
    want = ref_counts(WIREWORLD, SEED, MARKS)
    check(f"make table: heads per generation match reference ({MARKS[-1]} gens)", got == want, f"site {got[-4:]} / ref {want[-4:]}")
    page.keyboard.press("r")
    page.wait_for_timeout(150)
    check("make table: R back to gen 0", counts(page) == [0, 1], counts(page))

    # 도감의 와이어월드
    ids = page.evaluate("async (u) => (await (await fetch(u + 'data/rules/index.json')).json())", a.url)
    tables = [i for i in ids if page.evaluate("async ([u, i]) => (await (await fetch(u + `data/rules/${i}.json`)).json()).family", [a.url, i]) == "table"]
    check("catalog lists table rules", "wireworld" in tables, tables)
    for rid in tables:
        rf = page.evaluate("async ([u, i]) => (await (await fetch(u + `data/rules/${i}.json`)).json())", [a.url, rid])
        open_hash(page, f"#/r/{rid}")
        check(f"{rid}: rows match the rule file", as_transitions(rows(page)) == rf["rule"]["transitions"], rows(page))
        got = site_counts(page, MARKS)
        want = ref_counts(rf["rule"]["transitions"], rf["seed"]["data"], MARKS)
        check(f"{rid}: heads per generation match reference", got == want, f"site {got[-4:]} / ref {want[-4:]}")
    check("no console errors (counts)", not log.items, log.items)

    # ── 줄 고치기 ──
    open_hash(page, "#/make?family=table")
    k(page, "0:from").click()
    a1 = rows(page)[0]["from"]
    k(page, "0:from").click(modifiers=["Shift"])
    check("state button: click → next, Shift+click → back", a1 == "전자 꼬리" and rows(page)[0]["from"] == "전자 머리", a1)
    k(page, "0:of").click()  # '늘' → 조건
    r0 = rows(page)[0]
    check("'늘' → condition on 전자 머리 with 0–8 all on", r0["of"] == "전자 머리" and r0["counts"] == list(range(9)) and not r0["always"], r0)
    seq = []
    for _ in range(3):
        k(page, "0:of").click()
        seq.append(rows(page)[0]["of"])
    check("count-state button: 전자 꼬리 → 도선 → back to '늘'", seq == ["전자 꼬리", "도선", None] and rows(page)[0]["always"], seq)
    # 셋째 세는 상태는 건너뛴다: 0번 줄은 전자 꼬리를, 2번 줄은 전자 머리를 세는데 1번 줄이 도선을 세려 하면
    k(page, "0:of").click()
    k(page, "0:of").click()  # 0번 줄: 이웃의 전자 꼬리
    k(page, "1:of").click()  # 1번 줄 '늘' → 조건(세는 상태 첫째 = 전자 꼬리)
    r1 = rows(page)[1]
    k(page, "1:of").click()  # 도선은 셋째라 건너뛰고 '늘'
    check("third counted state is skipped with a reason", r1["of"] == "전자 꼬리" and rows(page)[1]["always"] and MANY in say(page), f"{r1['of']} → {rows(page)[1]} / {say(page)}")
    # 이웃 없는 빈칸이 바뀌는 줄은 건너뛴다
    open_hash(page, "#/make?family=table")
    seq = []
    for _ in range(2):
        k(page, "1:from").click()
        seq.append(rows(page)[1]["from"])
    check("'빈칸 → 도선 늘' is skipped (도선 → 전자 머리) with a reason", seq == ["도선", "전자 머리"] and LOCK in say(page), f"{seq} / {say(page)}")
    # 줄 더하기·지우기
    open_hash(page, "#/make?family=table")
    page.locator(".table-pad button", has_text="줄 더하기").click()
    rs = rows(page)
    check("add row: '전자 머리 → 전자 머리 늘' at the end", len(rs) == 4 and (rs[3]["from"], rs[3]["to"], rs[3]["always"]) == ("전자 머리", "전자 머리", True), rs[-1:])
    k(page, "3:del").click()
    check("delete row", as_transitions(rows(page)) == WIREWORLD)
    # 이웃 수 단추: 2번 줄을 [1] 로 → 기준과 견줌
    k(page, "2:c2").click()
    rs = rows(page)
    tr = as_transitions(rs)
    check("count button toggles (2 off)", tr[2]["when"]["count"] == [1] and "rule=" not in page.evaluate("location.hash"), rs[2])
    got = site_counts(page, MARKS[:7])
    want = ref_counts(tr, SEED, MARKS[:7])
    check("edited rule (wire needs exactly 1 head) matches reference", got == want, f"site {got[-3:]} / ref {want[-3:]}")
    page.keyboard.press("r")
    # 빈칸에서 바뀌는 줄: 0 이 빠져 있으면 쓸 수 있고, 0 단추는 잠긴다 → 기준과 견줌
    open_hash(page, "#/make?family=table")
    page.locator(".table-pad button", has_text="줄 더하기").click()
    k(page, "3:of").click()
    k(page, "3:c0").click()
    seq = []
    for _ in range(3):
        k(page, "3:from").click()
        seq.append(rows(page)[3]["from"])
    rs = rows(page)
    check("row '빈칸 → 전자 머리 when 1–8' allowed, its 0 button locked", seq == ["전자 꼬리", "도선", "빈칸"] and rs[3]["locked"] == [0] and rs[3]["counts"] == list(range(1, 9)), f"{seq} {rs[3]}")
    k(page, "3:c0").dispatch_event("click")  # aria-disabled 라 Playwright 는 안 누른다. 사람은 누를 수 있다
    check("locked 0 button says why and changes nothing", LOCK in say(page) and rows(page)[3]["counts"] == list(range(1, 9)), say(page))
    tr = as_transitions(rows(page))
    got = site_counts(page, [1, 2, 3, 5, 10, 20])
    want = ref_counts(tr, SEED, [1, 2, 3, 5, 10, 20])
    check("edited rule (heads spread into empty cells) matches reference", got == want, f"site {got[-3:]} / ref {want[-3:]}")
    page.screenshot(path=f"{a.out}/table_spread.png")
    check("no console errors (editing)", not log.items, log.items)

    # ── 칠하기·그리기·살펴보기 ──
    open_hash(page, "#/make?family=table")
    page.locator(".board-wrap .capsule button", has_text="비우기").click()
    page.wait_for_timeout(150)
    hint = page.locator(".board-wrap .stage-hint")
    check("cleared: hint asks to pick a state and paint", hint.is_visible() and "칠할 상태" in (hint.text_content() or ""), hint.text_content() if hint.is_visible() else "")
    page.mouse.click(*cell_center(page, BOARD, 0, 0, Z))
    page.wait_for_timeout(150)
    check("tap paints 도선 (no head), hint goes", counts(page)[1] == 0 and not hint.is_visible(), counts(page))
    pick(page, "paints", 1)
    page.mouse.click(*cell_center(page, BOARD, 1, 0, Z))
    page.wait_for_timeout(150)
    check("pick 전자 머리, tap paints a head", counts(page)[1] == 1, counts(page))
    pick(page, "transport", "look")
    txt = peek_at(page, 0, 0)
    rs = rows(page)
    check("look on wire next to a head: row 3 + count 1 marked", "3번째 줄이 맞아요" in txt and "지금 도선, 다음 세대 전자 머리" in txt and rs[2]["why"] and rs[2]["cwhy"] == [1] and not rs[0]["why"], f"{txt} / {[(r['why'], r['cwhy']) for r in rs]}")
    txt = peek_at(page, 1, 0)
    check("look on a head: row 1", "1번째 줄이 맞아요" in txt and "다음 세대 전자 꼬리" in txt and rows(page)[0]["why"], txt)
    txt = peek_at(page, 5, 5)
    check("look on empty: no row, stays", "맞는 줄이 없어서 그대로예요" in txt and not any(r["why"] for r in rows(page)), txt)
    page.screenshot(path=f"{a.out}/table_look.png")
    pick(page, "transport", "pan")
    page.mouse.click(*cell_center(page, BOARD, 1, 0, Z))
    page.wait_for_timeout(150)
    check("tap the same state again clears it", counts(page)[1] == 0, counts(page))
    pick(page, "transport", "draw")
    sx, sy = cell_center(page, BOARD, -6, 4, Z)
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(sx + 10 * Z, sy, steps=12)
    page.mouse.up()
    page.wait_for_timeout(150)
    check("draw with 전자 머리 paints a line of heads", counts(page)[1] >= 9, counts(page))
    pick(page, "transport", "pan")
    check("no console errors (paint, look)", not log.items, log.items)

    # ── 더 보기: 상태 수, 규칙 파일 ──
    open_hash(page, "#/make?family=table")
    page.locator("details.more summary").click()
    page.locator(".stepper button[aria-label='상태 하나 빼기']").click()
    rs = rows(page)
    np_ = page.locator(".paints [role=radio]").count()
    check("states 4 → 3: rows using 도선 are removed", len(rs) == 1 and (rs[0]["from"], rs[0]["to"]) == ("전자 머리", "전자 꼬리") and np_ == 3, f"{rs} paints {np_}")
    page.locator(".stepper button[aria-label='상태 하나 빼기']").click()
    check("states 3 → 2: paint picker hides, rows left fit", page.locator(".paints").count() == 0 or not page.locator(".paints").is_visible(), rows(page))
    page.locator(".stepper button[aria-label='상태 하나 더하기']").click()
    page.locator(".stepper button[aria-label='상태 하나 더하기']").click()
    check("states back to 4", page.locator(".stepper output").text_content() == "4" and page.locator(".paints [role=radio]").count() == 4)
    open_hash(page, "#/make?family=table")
    page.locator("details.more summary").click()
    with page.expect_download() as dl:
        page.get_by_role("button", name="내려받기", exact=True).click()
    j = json.loads(open(dl.value.path(), encoding="utf-8").read())
    check("download: a table rule file with the WireWorld rows", j.get("family") == "table" and j.get("rule", {}).get("transitions") == WIREWORLD and [s["name"] for s in j.get("states", [])] == NAMES, dl.value.suggested_filename)
    up = page.locator(".file-row input[type=file][accept*=json]")
    mod = json.loads(json.dumps(j))
    mod["rule"]["transitions"][2]["when"]["count"] = [2]
    up.set_input_files(files=[{"name": "t.json", "mimeType": "application/json", "buffer": json.dumps(mod).encode()}])
    page.wait_for_timeout(300)
    check("upload applies the rows", as_transitions(rows(page)) == mod["rule"]["transitions"], rows(page)[2:])
    for name, trs, why in (
        ("lock", WIREWORLD + [{"from": 0, "to": 3}], "이웃이 없는 빈칸"),
        ("many", [{"from": 1, "to": 2, "when": {"state": 1, "count": [1]}}, {"from": 2, "to": 3, "when": {"state": 2, "count": [1]}}, {"from": 3, "to": 1, "when": {"state": 3, "count": [1]}}], "세는 상태는 2가지"),
        ("zero", [{"from": 1, "to": 2, "when": {"state": 0, "count": [1]}}], "셀 수 없어요"),
    ):
        bad = json.loads(json.dumps(j))
        bad["rule"]["transitions"] = trs
        up.set_input_files(files=[{"name": f"{name}.json", "mimeType": "application/json", "buffer": json.dumps(bad).encode()}])
        page.wait_for_timeout(300)
        errs = " ".join(page.locator(".more .errs li").all_text_contents())
        check(f"upload refused ({name}) with a reason, rows unchanged", why in errs and as_transitions(rows(page)) == mod["rule"]["transitions"], errs)
    check("no console errors (more)", not log.items, log.items)
    ctx.close()

    # ── 칠할 상태 고르기: 다른 계열 ──
    ctx = new_context(b, "pc1440", "light", "reduce")
    page = ctx.new_page()
    log = Log(page)
    for rid, n in (("brians-brain", 3), ("star-wars", 4), ("ant-llrr", 4), ("conway-life", 0), ("langtons-ant", 0)):
        open_hash(page, f"#/r/{rid}")
        btns = page.locator(".paints [role=radio]")
        shown = page.locator(".paints").count() > 0 and page.locator(".paints").is_visible()
        first = btns.nth(1).get_attribute("aria-checked") if n else None
        check(f"{rid}: paint picker {'shows ' + str(n) + ' states, 1 picked' if n else 'hidden'}", (shown and btns.count() == n and first == "true") if n else not shown, f"{btns.count()} {first}")
    open_hash(page, "#/r/brians-brain")
    page.locator(".board-wrap .capsule button", has_text="비우기").click()
    pick(page, "paints", 2)
    page.mouse.click(*cell_center(page, BOARD, 0, 0, 10))  # Life zoom 10
    page.wait_for_timeout(150)
    c2 = nums(page, RULE_NUMS)[1]
    pick(page, "paints", 1)
    page.mouse.click(*cell_center(page, BOARD, 3, 0, 10))
    page.wait_for_timeout(150)
    check("brians-brain: painting state 2 is not a live cell, state 1 is", (c2, nums(page, RULE_NUMS)[1]) == (0, 1), (c2, nums(page, RULE_NUMS)[1]))
    check("no console errors (paints)", not log.items, log.items)
    ctx.close()

    # ── 키·빠르기 ──
    ctx = new_context(b, "pc1440", "light")
    page = ctx.new_page()
    log = Log(page)
    open_hash(page, "#/make?family=table")
    if play_label(page) == "일시정지":
        page.keyboard.press("Space")
        page.wait_for_timeout(150)
    page.keyboard.press("r")
    g0 = counts(page)[0]
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(150)
    check("keys: → one gen", counts(page)[0] == g0 + 1)
    for sid, want in (("slow", 4), ("normal", 10), ("fast", 30)):
        pick(page, "transport", sid)
        blur(page)
        s0 = counts(page)[0]
        page.keyboard.press("Space")
        page.wait_for_timeout(3000)
        page.keyboard.press("Space")
        rate = (counts(page)[0] - s0) / 3
        check(f"speed {sid}: about {want} gens/s", 0.75 * want <= rate <= 1.25 * want, f"{rate:.1f}")
    page.keyboard.press("r")
    page.wait_for_timeout(150)
    check("keys: R back", counts(page) == [0, 1], counts(page))
    page.keyboard.press("f")
    page.wait_for_timeout(500)
    on = page.evaluate("document.documentElement.classList.contains('has-full')")
    page.screenshot(path=f"{a.out}/table_full.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    check("keys: F / Esc fullscreen", on and not page.evaluate("document.documentElement.classList.contains('has-full')"))
    check("no console errors (keys)", not log.items, log.items)
    ctx.close()

    # ── 폰: 단추 톡, 칸 톡 ──
    for scheme in ("light", "dark"):
        ctx = new_context(b, "phone390", scheme, "reduce")
        page = ctx.new_page()
        log = Log(page)
        t = Touch(ctx, page)
        open_hash(page, "#/make?family=table")
        lay = layout(page)
        check(f"phone {scheme}: no sideways overflow or overlaps", not lay["hOverflow"] and not lay["overlaps"], lay["overlaps"][:3])
        page.locator('.trs [data-k="0:to"]').scroll_into_view_if_needed()
        t.tap_el('.trs [data-k="0:to"]')
        page.wait_for_timeout(150)
        check(f"phone {scheme}: tap a state button", rows(page)[0]["to"] == "도선", rows(page)[0])
        page.screenshot(path=f"{a.out}/table_phone_{scheme}.png", full_page=True)
        check(f"no console errors (phone {scheme})", not log.items, log.items)
        ctx.close()
    b.close()
check.done()
