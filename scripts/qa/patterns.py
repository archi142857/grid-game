"""무늬 고르기·RLE: 규칙마다 맞는 무늬만 나오는지, 놓은 무늬가 기준 구현(refs.py)과 같이 자라는지,
RLE 붙여 넣기·파일·내려받기와 못 놓는 까닭.

    python3 scripts/qa/patterns.py [주소] [--out 폴더]

- 도감의 생명 게임 계열·조건표 규칙: 더 보기의 '무늬' 단추 = data/patterns 가운데 RLE 머리 줄 rule 이 같은 것.
  누르면 0세대·멈춤(동작 줄이기), 산 칸(전자 머리) 수가 무늬와 같고 → 로 넘기면 기준 구현과 같다
- 붙여 넣기: 같은 규칙, 같은 계열 다른 규칙(규칙이 바뀌고 주소·원래대로가 따라옴), 육각·다른 계열·태어남 0·못 읽는 글·모르는 rule
- RLE 파일 불러오기, RLE 내려받기(다시 읽으면 같은 무늬). 개미·1차원에는 무늬 칸이 없고, 고친 조건표면 내려받기가 숨는다
"""

import json
import re

from refs import WIREWORLD, RefLife, RefTable, parse_rle, rle_rule
from common import RULE_NUMS, Checks, Log, args, blur, launch, new_context, nums, play_label, settle, sync_playwright

a = args(__doc__)
check = Checks("patterns", a.out)
MARKS = [1, 2, 5, 10, 30]


def counts(page):
    return nums(page, RULE_NUMS)[:2]


def open_hash(page, h):
    if page.evaluate("location.hash") == h:
        page.reload(wait_until="networkidle")
    else:
        page.goto(a.url + h, wait_until="networkidle")
    settle(page, 400)
    blur(page)
    page.mouse.move(2, 2)


def open_more(page):
    page.locator("details.more summary").click()
    page.wait_for_timeout(400)  # 무늬 모음을 처음 불러온다


def ref_for(code, cells):
    return RefTable(WIREWORLD, cells) if code == "WireWorld" else RefLife(code, cells)


def steps(page, marks):
    blur(page)
    got, done = [], counts(page)[0]
    for m in marks:
        for _ in range(m - done):
            page.keyboard.press("ArrowRight")
        done = m
        page.wait_for_timeout(60)
        got.append(counts(page))
    return got


def paste(page, text):
    box = page.locator(".pattern-box")
    if not page.locator(".rle-paste").is_visible():
        box.locator("button", has_text="RLE 붙여 넣기").click()
    page.locator(".rle-in").fill(text)
    page.locator(".rle-paste button", has_text="놓기").click()
    page.wait_for_timeout(250)
    return " ".join(page.locator(".pattern-box .errs li").all_text_contents())


def flash(page):
    f = page.locator(".board-wrap .stage-flash")
    return (f.text_content() or "") if f.is_visible() else ""


with sync_playwright() as p:
    b = launch(p)
    ctx = new_context(b, "pc1440", "light", "reduce")
    page = ctx.new_page()
    log = Log(page)
    page.goto(a.url, wait_until="networkidle")  # 빈 쪽에서 fetch 하면 로컬 서버에서 막힌다
    index = page.evaluate("async (u) => (await (await fetch(u + 'data/patterns/index.json')).json())", a.url)
    texts = {x["id"]: page.evaluate("async ([u, i]) => await (await fetch(u + `data/patterns/${i}.rle`)).text()", [a.url, x["id"]]) for x in index}
    check("pattern files: header rule = index rule", all(rle_rule(texts[x["id"]]) == x["rule"] for x in index), [x["id"] for x in index if rle_rule(texts[x["id"]]) != x["rule"]])
    ids = page.evaluate("async (u) => (await (await fetch(u + 'data/rules/index.json')).json())", a.url)
    rules = {i: page.evaluate("async ([u, i]) => (await (await fetch(u + `data/rules/${i}.json`)).json())", [a.url, i]) for i in ids}

    # ── 규칙마다 무늬 단추, 놓고 넘기기 ──
    for rid in ids:
        fam = rules[rid]["family"]
        open_hash(page, f"#/r/{rid}")
        if fam not in ("life", "table"):
            check(f"{rid}: no pattern box ({fam})", page.locator(".pattern-box").count() == 0)
            continue
        open_more(page)
        code = "WireWorld" if rid == "wireworld" else page.locator(".code-in").input_value()
        mine = [x for x in index if x["rule"] == code]
        btns = page.locator(".pattern-list .pattern-pick")
        shown = page.locator(".pattern-list").is_visible()
        check(f"{rid} ({code}): {len(mine)} pattern buttons", btns.count() == len(mine) and shown == bool(mine), f"{btns.count()} shown={shown}")
        for i, x in enumerate(mine):
            btns.nth(i).click()
            page.wait_for_timeout(200)
            ref = ref_for(code, parse_rle(texts[x["id"]]))
            c0 = counts(page)
            ok0 = c0 == [0, ref.count(1)] and play_label(page) == "재생"
            got = steps(page, MARKS)
            want = [[m, ref.step(m - ref.gen)] for m in MARKS]
            check(f"{rid}: pattern {x['id']} placed at gen 0, paused, grows like reference", ok0 and got == want, f"{c0} site {got[-2:]} / ref {want[-2:]}")
            page.locator("details.more summary").scroll_into_view_if_needed()
    page.screenshot(path=f"{a.out}/patterns_wireworld.png")
    check("no console errors (pattern buttons)", not log.items, log.items)

    # ── 붙여 넣기 ──
    open_hash(page, "#/r/conway-life")
    open_more(page)
    errs = paste(page, texts["glider"])
    check("paste glider (same rule): placed, gen 0, paused", not errs and counts(page) == [0, 5] and play_label(page) == "재생" and page.locator(".code-in").input_value() == "B3/S23", f"{errs} {counts(page)}")
    check("paste box closes after placing", not page.locator(".rle-paste").is_visible())
    errs = paste(page, texts["replicator"])
    fl = flash(page)
    check("paste B36/S23 pattern: rule switches with a note", not errs and page.locator(".code-in").input_value() == "B36/S23" and "B36/S23" in fl, f"{errs} / {fl}")
    check("…url and 원래대로 follow", "rule=B36%2FS23" in page.evaluate("location.hash") and page.locator(".side .text-btn", has_text="원래대로").is_visible(), page.evaluate("location.hash"))
    got = steps(page, MARKS)
    ref = RefLife("B36/S23", parse_rle(texts["replicator"]))
    want = [[m, ref.step(m - ref.gen)] for m in MARKS]
    check("…and it runs as HighLife (replicator)", got == want, f"site {got[-2:]} / ref {want[-2:]}")
    page.locator(".side .text-btn", has_text="원래대로").click()
    page.wait_for_timeout(200)
    c_before = counts(page)
    for name, text, why in (
        ("hex", texts["hex-glider"], "육각"),
        ("other family", texts["wireworld-diode"], "조건표"),
        ("birth 0", "x = 3, y = 1, rule = B03/S23\n3o!", "태어남"),
        ("unreadable", "그냥 글이에요", "읽을 수 없어요"),
    ):
        errs = paste(page, text)
        check(f"paste refused ({name}) with a reason, board unchanged", why in errs and counts(page) == c_before and page.locator(".code-in").input_value() == "B3/S23", f"{errs} {counts(page)}")
    errs = paste(page, "x = 3, y = 1, rule = Foo\n3o!")
    fl = flash(page)
    check("paste with unknown rule: placed with the current rule + note", not errs and counts(page) == [0, 3] and "Foo" in fl and page.locator(".code-in").input_value() == "B3/S23", f"{errs} / {fl}")

    # ── RLE 파일, 내려받기 ──
    page.locator(".pattern-box input[type=file]").set_input_files(files=[{"name": "gun.rle", "mimeType": "text/plain", "buffer": texts["gosper-glider-gun"].encode()}])
    page.wait_for_timeout(300)
    check("RLE file: gosper gun placed", counts(page) == [0, 36], counts(page))
    steps(page, [7])
    with page.expect_download() as dl:
        page.get_by_role("button", name="RLE 내려받기").click()
    txt = open(dl.value.path(), encoding="utf-8").read()
    back = parse_rle(txt)
    ref = RefLife("B3/S23", parse_rle(texts["gosper-glider-gun"]))
    ref.step(7)
    norm = lambda cells: (lambda mx, my: {(x - mx, y - my): s for (x, y), s in cells.items()})(min(x for x, _ in cells), min(y for _, y in cells))
    check("RLE download: header rule B3/S23, same cells as the board", rle_rule(txt) == "B3/S23" and norm(back) == norm(ref.cells), dl.value.suggested_filename)
    page.locator(".board-wrap .capsule button", has_text="비우기").click()
    page.get_by_role("button", name="RLE 내려받기").click()
    page.wait_for_timeout(200)
    check("RLE download on an empty board says why", "비어" in " ".join(page.locator(".pattern-box .errs li").all_text_contents()))
    open_hash(page, "#/r/wireworld")
    open_more(page)
    page.locator(".pattern-list .pattern-pick").first.click()
    with page.expect_download() as dl:
        page.get_by_role("button", name="RLE 내려받기").click()
    txt = open(dl.value.path(), encoding="utf-8").read()
    first = next(x for x in index if x["rule"] == "WireWorld")
    check("wireworld RLE download: rule WireWorld, same states", rle_rule(txt) == "WireWorld" and norm(parse_rle(txt)) == norm(parse_rle(texts[first["id"]])), txt.splitlines()[:2])
    open_hash(page, "#/make?family=table")
    open_more(page)
    down = page.get_by_role("button", name="RLE 내려받기")
    v0 = down.is_visible()
    page.locator('.trs [data-k="2:c2"]').click()
    page.wait_for_timeout(150)
    check("table: RLE download shown for WireWorld rows, hidden once edited", v0 and not down.is_visible() and not page.locator(".pattern-list").is_visible(), f"{v0} → {down.is_visible()}")
    errs = paste(page, texts["wireworld-diode"])
    check("table edited + paste WireWorld RLE: rows go back to WireWorld", not errs and page.evaluate("[...document.querySelectorAll('.trs .count[aria-pressed=true]')].map(b => b.textContent).join('')") == "12", errs)
    errs = paste(page, texts["glider"])
    check("table: Life pattern refused (other family)", "생명 게임" in errs, errs)
    check("no console errors (rle)", not log.items, log.items)
    ctx.close()

    # ── 동작 줄이지 않으면 무늬를 놓고 바로 돈다 ──
    ctx = new_context(b, "pc1440", "light")
    page = ctx.new_page()
    log = Log(page)
    open_hash(page, "#/r/conway-life")
    if play_label(page) == "일시정지":
        page.keyboard.press("Space")
    open_more(page)
    page.locator(".pattern-list .pattern-pick").first.click()
    page.wait_for_timeout(600)
    check("pattern button runs right away (no reduced motion)", play_label(page) == "일시정지" and counts(page)[0] > 0, counts(page))
    check("no console errors (run)", not log.items, log.items)
    ctx.close()
    b.close()
check.done()
