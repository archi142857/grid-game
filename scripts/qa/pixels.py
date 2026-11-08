"""두 판(예: 바꾸기 전과 뒤)의 격자 그림을 같은 장면에서 픽셀로 견준다. board·theme 를 바꿀 때(WebGL 등) 쓴다.

    python3 scripts/qa/pixels.py 앞_주소 뒤_주소 [--out 폴더]

장면은 무작위가 없게 만든다: 동작 줄이기에서 '놓아 보기' 무늬를 놓고 → 로 몇 세대 넘긴 다음, 확대·축소로
점(칸 10px)·네모·픽셀 그리기를 차례로 본다. 커서 고리는 빼려고 마우스는 격자 밖에 둔다.
PC(dpr 1)·폰(dpr 3), 밝은·어두운 화면에서 캔버스를 그대로 읽어 달라진 픽셀 비율을 적는다.
"""

import argparse
import os
import tempfile

import numpy as np

from common import Checks, blur, canvas_img, launch, new_context, settle, sync_playwright

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("old")
p.add_argument("new")
p.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "grid-qa"))
a = p.parse_args()
os.makedirs(a.out, exist_ok=True)
urls = [u if u.endswith("/") else u + "/" for u in (a.old, a.new)]
check = Checks("pixels", a.out)
BOARD = ".board-wrap canvas"

# (규칙, 무늬 카드, 넘길 세대): Life 두 상태와, 사라지는 칸이 있는 규칙(상태 3개)
SCENES = [("conway-life", "R-펜토미노", 40), ("brians-brain", "켜진 네 칸", 9)]
# 확대·축소: 처음(점) → '-' 몇 번(네모) → 더(픽셀) → 0(모두 보이게)
ZOOMS = [("dots", []), ("small", ["-"] * 5), ("pixel", ["-"] * 9), ("fit", ["0"])]


# 세대가 넘어가는 중간 그림을 보려고 시계를 멈춘다: __freeze(t) 뒤로는 performance.now 와 rAF 시각이 t 다
CLOCK_JS = """(() => {
  let fake = 0, frozen = false;
  const realNow = performance.now.bind(performance);
  performance.now = () => (frozen ? fake : realNow());
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((ts) => cb(frozen ? fake : ts));
  window.__freeze = (v) => { frozen = true; fake = v; };
})();"""


def tween(page, url, rule, card, gens, keys):
    """gens-1 세대까지 넘긴 다음, 한 세대를 더 넘기는 그림의 한가운데(진행도 0.5)"""
    page.emulate_media(reduced_motion="reduce")
    scene(page, url, rule, card, gens - 1, keys)
    page.evaluate("__freeze(100000)")
    page.emulate_media(reduced_motion="no-preference")
    page.keyboard.press("ArrowRight")  # pulse: 180ms 동안 이어 그린다
    page.wait_for_timeout(150)
    page.evaluate("__freeze(100090)")
    page.wait_for_timeout(300)
    img = canvas_img(page, BOARD)
    page.evaluate("__freeze(200000)")
    return img


def scene(page, url, rule, card, gens, keys):
    page.goto(url + f"#/r/{rule}", wait_until="networkidle")
    settle(page, 300)
    c = page.locator(".cards .card", has=page.locator("h3", has_text=card)).first
    c.scroll_into_view_if_needed()
    c.locator("button").click()
    page.wait_for_timeout(200)
    blur(page)
    page.mouse.move(2, 2)
    for _ in range(gens):
        page.keyboard.press("ArrowRight")
    for k in keys:
        page.keyboard.press(k)
    page.wait_for_timeout(400)
    return canvas_img(page, BOARD)


with sync_playwright() as pw:
    b = launch(pw)
    for vp in ("pc1440", "phone390"):
        for scheme in ("light", "dark"):
            # 쪽은 하나만 연다. 뒤에 깔린 탭은 브라우저가 그리기(rAF)를 멈춰서 캔버스가 옛 모습으로 남는다
            ctx = new_context(b, vp, scheme, "reduce")
            page = ctx.new_page()
            for rule, card, gens in SCENES:
                for zname, keys in ZOOMS:
                    imgs = [scene(page, u, rule, card, gens, keys) for u in urls]
                    same = imgs[0].shape == imgs[1].shape
                    frac = float((np.abs(imgs[0] - imgs[1]).sum(axis=2) > 0).mean()) if same else 1.0
                    big = float((np.abs(imgs[0] - imgs[1]).sum(axis=2) > 30).mean()) if same else 1.0
                    tag = f"{vp}_{scheme}_{rule}_{zname}"
                    if frac:
                        from PIL import Image

                        Image.fromarray(np.concatenate(imgs, axis=1).astype("uint8")).save(f"{a.out}/pixels_{tag}.png")
                    check(f"{tag}: same pixels", frac == 0, f"달라진 픽셀 {frac:.4%} (눈에 띄게 {big:.4%})" if frac else "")
            ctx.close()
            # 넘어가는 중간 그림(태어나는 점이 자라고 사라지는 점이 줄어드는 중). 픽셀 그리기는 사이를 잇지 않아서 뺀다
            ctx = new_context(b, vp, scheme, "reduce")
            ctx.add_init_script(CLOCK_JS)
            page = ctx.new_page()
            for rule, card, gens in SCENES:
                for zname, keys in ZOOMS[:2]:
                    imgs = [tween(page, u, rule, card, gens, keys) for u in urls]
                    frac = float((np.abs(imgs[0] - imgs[1]).sum(axis=2) > 0).mean()) if imgs[0].shape == imgs[1].shape else 1.0
                    tag = f"{vp}_{scheme}_{rule}_{zname}_tween"
                    if frac:
                        from PIL import Image

                        Image.fromarray(np.concatenate(imgs, axis=1).astype("uint8")).save(f"{a.out}/pixels_{tag}.png")
                    check(f"{tag}: same pixels", frac == 0, f"달라진 픽셀 {frac:.4%}" if frac else "")
            ctx.close()
    b.close()
check.done()
