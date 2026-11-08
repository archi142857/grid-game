"""성능 재기: 큰 판에서 한 장 그리는 데 걸리는 시간(WebGL 을 할지 정하는 데 쓴다, 설계 6절).

    python3 scripts/qa/perf.py [주소] [--quick] [--out 폴더]

규칙 화면(생명 게임)을 전체 화면으로 열고 칸을 가장 작게(1 css px) 줄인 뒤 흩뿌린다. 보이는 칸이 PC 에서 약 120만,
뿌린 넓이는 그 70% 다. 그다음 칸 1px·2px·10px 에서
- 멈춘 채 끌기: 한 장마다 그리기만 한다(board.draw 와 기록 글자)
- 빠르게 돌리기: 한 장 안에서 세대 넘기기 + 그리기
rAF 콜백 시간을 한 장(같은 시각)마다 더해 잰다. 16ms 를 넘는 장의 몫, 가운데값·90%·가장 큰 값, 초당 장 수, 초당 세대를 적는다.
기기: PC 1440×900 dpr 1·2, 폰 390×844 dpr 3(그대로, CPU 4배 느리게). 헤드리스 크롬(GPU 없음)이라 진짜 기기와 다를 수 있다.
"""

import json
import statistics

from common import Checks, args, blur, box, launch, new_context, nums, play_label, settle, sync_playwright, RULE_NUMS, VIEWPORTS

def _extra(p):
    p.add_argument("--quick", action="store_true", help="PC dpr 1 만")
    p.add_argument("--only", default="", help="이 글자가 든 기기만(예: CPU)")


a = args(__doc__, _extra)
check = Checks("perf", a.out)

PERF_JS = """(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__perf = { on: false, rows: [] };
  window.requestAnimationFrame = (cb) => raf((ts) => {
    const t0 = performance.now(); cb(ts); const d = performance.now() - t0;
    if (window.__perf.on) window.__perf.rows.push([ts, d]);
  });
})();"""

CONFIGS = [
    ("pc1440 dpr1", "pc1440", 1, 1),
    ("pc1440 dpr2", "pc1440", 2, 1),
    ("phone390 dpr3", "phone390", 3, 1),
    ("phone390 dpr3 CPU×4", "phone390", 3, 4),
]
ZOOMS = [("1px", 0), ("2px", 3), ("10px", 10)]  # 가장 작게에서 + 를 몇 번(×1.25 씩)


def stats(rows, secs):
    frames = {}
    for ts, d in rows:
        frames[ts] = frames.get(ts, 0) + d
    work = sorted(frames.values())
    if not work:
        return {"frames": 0}
    q = lambda f: work[min(len(work) - 1, int(f * len(work)))]  # noqa: E731
    return {
        "frames": len(work),
        "fps": round(len(work) / secs, 1),
        "median": round(statistics.median(work), 1),
        "p90": round(q(0.9), 1),
        "max": round(work[-1], 1),
        "over16": round(sum(1 for w in work if w > 16) / len(work), 2),
    }


def measure(page, secs):
    page.evaluate("window.__perf.rows = []; window.__perf.on = true")
    page.wait_for_timeout(int(secs * 1000))
    page.evaluate("window.__perf.on = false")
    return page.evaluate("window.__perf.rows")


def drag_for(page, secs):
    """멈춘 채 판을 천천히 끌며(한 장마다 다시 그린다) 잰다"""
    cv = box(page, ".board-wrap canvas")
    cx, cy = cv["x"] + cv["w"] / 2, cv["y"] + cv["h"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.evaluate("window.__perf.rows = []; window.__perf.on = true")
    steps = int(secs * 60)
    for i in range(steps):
        dx = 120 * ((i % 120) / 60 - 1)
        page.mouse.move(cx + dx, cy + dx / 3)
        page.wait_for_timeout(16)
    page.evaluate("window.__perf.on = false")
    page.mouse.up()
    return page.evaluate("window.__perf.rows")


results = []
with sync_playwright() as pw:
    b = launch(pw)
    for name, vp, dpr, slow in [c for c in (CONFIGS[:1] if a.quick else CONFIGS) if a.only in c[0]]:
        opts = dict(VIEWPORTS[vp])
        opts["device_scale_factor"] = dpr
        ctx = b.new_context(color_scheme="light", reduced_motion="no-preference", locale="ko-KR", **opts)
        ctx.add_init_script(PERF_JS)
        page = ctx.new_page()
        cdp = ctx.new_cdp_session(page)
        page.goto(a.url + "#/r/conway-life", wait_until="networkidle")
        settle(page, 500)
        blur(page)
        if play_label(page) == "일시정지":
            page.keyboard.press("Space")
        page.keyboard.press("f")
        page.wait_for_timeout(600)
        for _ in range(40):
            page.keyboard.press("-")
        page.wait_for_timeout(200)
        page.locator(".board-wrap .capsule button", has_text="흩뿌리기").click()
        page.wait_for_timeout(300)
        page.locator(".transport [role=radio][data-id='fast']").click()
        blur(page)
        cells = page.evaluate("(() => { const c = document.querySelector('.board-wrap canvas'); return [c.width, c.height]; })()")
        if slow > 1:
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": slow})
        pressed = 0
        for zname, plus in ZOOMS:
            for _ in range(plus - pressed):
                page.keyboard.press("+")
            pressed = plus
            page.wait_for_timeout(300)
            idle = stats(drag_for(page, 2.0), 2.0)
            g0 = nums(page, RULE_NUMS)[0]
            page.keyboard.press("Space")
            run_rows = measure(page, 3.0)
            page.keyboard.press("Space")
            g1 = nums(page, RULE_NUMS)[0]
            run = stats(run_rows, 3.0)
            run["gens_per_s"] = round((g1 - g0) / 3.0, 1)
            row = {"config": name, "zoom": zname, "canvas": cells, "alive": nums(page, RULE_NUMS)[1], "drag": idle, "run": run}
            results.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
            # 돌다가 너무 넓어지면(멈춤) 다시 흩뿌린다
            if "너무 넓게" in (page.locator(".board-wrap .stage-flash").text_content() or ""):
                page.locator(".board-wrap .capsule button", has_text="흩뿌리기").click()
        if slow > 1:
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
        ctx.close()
    b.close()

with open(f"{a.out}/perf.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=1)
print("\n| 기기 | 칸 | 산 칸 | 끌기: 가운데·90%·최대 ms (16ms 넘는 몫) | 돌기: 가운데·90%·최대 ms (16ms 넘는 몫), 장/초, 세대/초 |")
print("|---|---|---|---|---|")
for r in results:
    d, u = r["drag"], r["run"]
    print(f"| {r['config']} | {r['zoom']} | {r['alive']:,} | {d.get('median')}·{d.get('p90')}·{d.get('max')} ({d.get('over16')}) | {u.get('median')}·{u.get('p90')}·{u.get('max')} ({u.get('over16')}), {u.get('fps')}, {u.get('gens_per_s')} |")
check("measured", bool(results), len(results))
check.done()
