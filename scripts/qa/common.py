"""검수 스크립트가 같이 쓰는 것: 브라우저 띄우기, 화면 크기, 콘솔 기록, 판 읽기, 손가락 흉내, 결과 모으기.

레포의 web/ 은 건드리지 않는다. 결과(캡처·JSON)는 레포 밖 임시 폴더에 쓴다.
"""

import argparse
import base64
import io
import json
import os
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright  # noqa: F401  (다른 스크립트가 여기서 가져다 쓴다)

SITE = "https://archi142857.github.io/grid-game/"
REPO = Path(__file__).resolve().parents[2]
ANDROID_UA = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
)

# 기획서의 검수 크기: PC 1440×900·1024×700, 폰 390×844
VIEWPORTS = {
    "pc1440": dict(viewport={"width": 1440, "height": 900}, device_scale_factor=1),
    "pc1024": dict(viewport={"width": 1024, "height": 700}, device_scale_factor=1),
    "phone390": dict(
        viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=ANDROID_UA
    ),
}


def args(desc, extra=None):
    """공통 인자: 주소(기본은 사이트), --out 결과 폴더"""
    p = argparse.ArgumentParser(description=desc)
    p.add_argument("url", nargs="?", default=SITE, help="사이트 주소. 로컬은 http://localhost:8000/ 처럼 / 로 끝나게")
    p.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "grid-qa"), help="캡처·JSON 을 둘 곳")
    if extra:
        extra(p)
    a = p.parse_args()
    if not a.url.endswith("/"):
        a.url += "/"
    os.makedirs(a.out, exist_ok=True)
    return a


def launch(p):
    """GRID_QA_CHROME 이 있으면 그 크롬, 없으면 /usr/bin/google-chrome, 그것도 없으면 Playwright 크로미움"""
    exe = os.environ.get("GRID_QA_CHROME") or ("/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None)
    return p.chromium.launch(executable_path=exe, headless=True) if exe else p.chromium.launch(headless=True)


def new_context(browser, vp, scheme="light", motion="no-preference"):
    return browser.new_context(color_scheme=scheme, reduced_motion=motion, locale="ko-KR", accept_downloads=True, **VIEWPORTS[vp])


class Log:
    """쪽 하나의 콘솔 오류·경고, 페이지 오류, 실패한 요청"""

    def __init__(self, page):
        self.items = []
        page.on("console", lambda m: m.type in ("error", "warning") and self.items.append(f"console.{m.type}: {m.text}"))
        page.on("pageerror", lambda e: self.items.append(f"pageerror: {e}"))
        page.on("requestfailed", lambda r: self.items.append(f"requestfailed: {r.url} {r.failure}"))
        page.on("response", lambda r: r.status >= 400 and self.items.append(f"http {r.status}: {r.url}"))


class Checks:
    """PASS/FAIL 을 찍고 모은다. done() 은 실패가 있으면 1 로 끝낸다"""

    def __init__(self, name, out):
        self.name, self.out, self.rows = name, out, []

    def __call__(self, label, ok, info=""):
        self.rows.append([label, bool(ok), str(info)])
        print(("PASS " if ok else "FAIL ") + label + (f"  [{info}]" if str(info) else ""), flush=True)
        return bool(ok)

    def done(self):
        fails = [r[0] for r in self.rows if not r[1]]
        with open(os.path.join(self.out, f"{self.name}.json"), "w", encoding="utf-8") as f:
            json.dump(self.rows, f, ensure_ascii=False, indent=1)
        print(f"\n{self.name}: {len(self.rows) - len(fails)} PASS / {len(fails)} FAIL")
        for x in fails:
            print("  FAIL", x)
        sys.exit(1 if fails else 0)


def settle(page, ms=700):
    page.evaluate("document.fonts.ready.then(() => true)")
    page.wait_for_timeout(ms)


def blur(page):
    page.evaluate("document.activeElement && document.activeElement.blur()")


def play_label(page):
    return page.locator(".capsule .play").get_attribute("aria-label")


# 첫 화면 기록(세대, 산 칸)과 규칙 화면 기록(세대, 산 칸, 바뀐 칸)
HOME_NUMS = "() => [...document.querySelectorAll('.console .readout .num')].map(e => +e.textContent.replace(/,/g, ''))"
RULE_NUMS = "() => [...document.querySelectorAll('.side .readout .num')].map(e => +e.textContent.replace(/,/g, ''))"


def nums(page, js):
    return page.evaluate(js)


def canvas_img(page, sel):
    """캔버스를 그대로 읽는다(쪽을 굴리지 않는다)"""
    url = page.evaluate("(sel) => document.querySelector(sel).toDataURL('image/png')", sel)
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(url.split(",")[1]))).convert("RGB")).astype(int)


def diff(a, b):
    """두 그림에서 달라진 픽셀 비율"""
    if a.shape != b.shape:
        return 1.0
    return float((np.abs(a - b).sum(axis=2) > 30).mean())


def box(page, sel):
    return page.evaluate(
        "(sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom, r: r.right}; }",
        sel,
    )


def center_into_view(page, sel):
    page.evaluate("(sel) => document.querySelector(sel).scrollIntoView({block: 'center'})", sel)
    page.wait_for_timeout(300)


def cell_center(page, sel, x, y, z):
    """보는 곳이 (0, 0), 칸 한 변이 z css px 일 때 칸 (x, y) 가운데의 화면 자리(board.js 와 같은 셈)"""
    return page.evaluate(
        """([sel, x, y, z]) => { const cv = document.querySelector(sel); const r = cv.getBoundingClientRect(); const d = devicePixelRatio;
        const c = Math.max(1, Math.round(z * d));
        return [r.left + (Math.round(cv.width / 2) + (x + 0.5) * c) / d, r.top + (Math.round(cv.height / 2) + (y + 0.5) * c) / d]; }""",
        [sel, x, y, z],
    )


def safe_point(page, sel):
    """캔버스에서 화면 안이면서 다른 것(재생 막대 등)에 가리지 않은, 보이는 가운데에 가장 가까운 자리"""
    return page.evaluate(
        """(sel) => {
        const cv = document.querySelector(sel); const r = cv.getBoundingClientRect();
        const top = Math.max(r.top, 0), bot = Math.min(r.bottom, innerHeight), left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
        const mx = (left + right) / 2, my = (top + bot) / 2; let best = null, bd = 1e9;
        for (let y = top + 6; y < bot - 6; y += 7) for (let x = left + 6; x < right - 6; x += 7) {
          if (document.elementFromPoint(x, y) !== cv) continue;
          const d = Math.hypot(x - mx, (y - my) * 1.5); if (d < bd) { bd = d; best = [x, y]; }
        }
        return best; }""",
        sel,
    )


# ── 손가락 흉내(CDP 터치. 쪽 굴리기·핀치까지 브라우저가 진짜 터치로 받는다) ──
class Touch:
    def __init__(self, ctx, page):
        self.page = page
        self.cdp = ctx.new_cdp_session(page)

    def _send(self, kind, pts):
        self.cdp.send(
            "Input.dispatchTouchEvent",
            {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i + 1, "radiusX": 4, "radiusY": 4, "force": 1} for i, (x, y) in enumerate(pts)]},
        )

    def tap(self, x, y):
        self._send("touchStart", [(x, y)])
        self.page.wait_for_timeout(40)
        self._send("touchEnd", [])
        self.page.wait_for_timeout(120)

    def tap_el(self, sel):
        b = box(self.page, sel)
        self.tap(b["x"] + b["w"] / 2, b["y"] + b["h"] / 2)

    def drag(self, x0, y0, x1, y1, steps=12):
        self._send("touchStart", [(x0, y0)])
        for i in range(1, steps + 1):
            self._send("touchMove", [(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)])
            self.page.wait_for_timeout(16)
        self._send("touchEnd", [])
        self.page.wait_for_timeout(250)

    def pinch(self, cx, cy, d0, d1, steps=12):
        pts = lambda d: [(cx - d / 2, cy), (cx + d / 2, cy)]  # noqa: E731
        self._send("touchStart", pts(d0))
        for i in range(1, steps + 1):
            self._send("touchMove", pts(d0 + (d1 - d0) * i / steps))
            self.page.wait_for_timeout(16)
        self._send("touchEnd", [])
        self.page.wait_for_timeout(250)


# ── 겉모습 검사: 가로 넘침, 화면 밖으로 삐져나온 것, 잘린 글, 격자 위 조각끼리 겹침 ──
LAYOUT_JS = r"""
() => {
  const de = document.documentElement;
  const out = { hOverflow: de.scrollWidth > innerWidth + 1, scrollW: de.scrollWidth, innerW: innerWidth, innerH: innerHeight, docH: de.scrollHeight };
  const vis = (el) => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true; } return false; };
  // 1px 로 숨긴 이름(좁은 화면의 단추 이름)은 잘린 것으로 보지 않는다
  const srOnly = (el) => el.clientWidth <= 1 && el.clientHeight <= 1;
  const desc = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  out.sticking = []; out.clipped = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || el.classList.contains('skip')) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > innerWidth + 1 || r.left < -1) && !inScroller(el)) out.sticking.push(desc(el) + ' ' + (el.textContent || '').trim().slice(0, 30));
    const s = getComputedStyle(el);
    if (el.tagName === 'CANVAS' || el.tagName === 'svg' || srOnly(el)) continue;
    if ((/(hidden|clip)/.test(s.overflowX + s.overflowY) || s.textOverflow === 'ellipsis') && (el.textContent || '').trim()
        && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) out.clipped.push(desc(el) + ' ' + el.textContent.trim().slice(0, 30));
  }
  out.sticking = out.sticking.slice(0, 10); out.clipped = out.clipped.slice(0, 10);
  const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  out.overlaps = [];
  for (const wrap of document.querySelectorAll('.hero-board, .board-wrap')) {
    const bs = ['.zoom', '.capsule', '.stage-hint', '.stage-stats', '.stage-flash', '.peek'].map((q) => [q, wrap.querySelector(q)])
      .filter(([, e]) => e && vis(e)).map(([q, e]) => [q, e.getBoundingClientRect()]);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (hit(bs[i][1], bs[j][1])) out.overlaps.push(bs[i][0] + ' x ' + bs[j][0]);
  }
  return out;
}
"""


def layout(page):
    return page.evaluate(LAYOUT_JS)
