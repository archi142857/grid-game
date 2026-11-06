// 격자를 점으로 그린다. 빈칸은 작은 점, 산 칸은 큰 점, 방금 태어난 칸은 신호색 점.
// 세대가 바뀔 때 점이 자라고(태어남) 줄어들며(죽음) 이어지도록, 앞 세대와 진행도(t)를 받아 사이를 그린다.
// 보는 곳: 화면 가운데의 칸 자리(cx, cy)와 칸 한 변(기기 픽셀, 늘 정수라 점이 흐려지지 않는다).
// 칸이 작아지면 점 → 네모 → 픽셀 순으로 바꿔 그려서, 멀리서 보아도 빠르다.
//
// 그릴 거리(src)는 blocks(x0, y0, x1, y1, fn) 하나만 있으면 된다.
//   fn(왼쪽 위 x, y, 너비, 높이, 지금 칸, 앞 세대 칸 | null) 을 보이는 범위에 걸친 덩어리마다 부른다.

const TAU = Math.PI * 2;
const ease = (t) => 1 - (1 - t) ** 3;
const css = ([r, g, b], a = 1) => (a === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${a})`);
const mod = (a, n) => ((a % n) + n) % n;

const PIXEL_BELOW = 4; // 칸이 이보다 작으면(기기 픽셀) 픽셀로
const SQUARE_BELOW = 6; // 이보다 작으면 둥근 점 대신 네모로, 빈칸 점은 그리지 않는다

/** min·max 는 칸 한 변의 css px */
export function makeBoard(canvas, { onResize = null, min = 1, max = 48 } = {}) {
  const ctx = canvas.getContext("2d");
  const off = document.createElement("canvas");
  const octx = off.getContext("2d");
  let img = null;
  let u32 = null;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let cx = 0;
  let cy = 0;
  let zf = 10; // 칸 한 변(기기 픽셀, 끊김 없이). 그릴 때는 반올림한 c 를 쓴다
  let c = 10;
  let ox = 0; // 칸 (0, 0) 왼쪽 위의 기기 픽셀 자리
  let oy = 0;
  let C = 2;
  let col = null;
  let lattice = null;
  let latticeKey = "";
  let frameSize = null; // 끝이 있는 격자를 꼭 맞게 보일 때 { w, h }

  const cmin = () => Math.max(1, Math.round(min * dpr));
  const cmax = () => Math.round(max * dpr);

  function settle() {
    zf = Math.min(cmax(), Math.max(cmin(), zf));
    c = Math.max(1, Math.round(zf));
    ox = Math.round(W / 2 - cx * c);
    oy = Math.round(H / 2 - cy * c);
  }

  /** 화면 크기를 다시 잰다. 크기가 그대로면 거짓 */
  function measure(force = false) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const nd = window.devicePixelRatio || 1;
    const nW = Math.max(1, Math.round(r.width * nd));
    const nH = Math.max(1, Math.round(r.height * nd));
    if (!force && nW === W && nH === H && nd === dpr) return false;
    if (nd !== dpr) zf = (zf / dpr) * nd;
    dpr = nd;
    if (canvas.width !== nW) canvas.width = nW;
    if (canvas.height !== nH) canvas.height = nH;
    W = nW;
    H = nH;
    if (frameSize) applyFrame();
    settle();
    return true;
  }

  /** colors: theme.js 의 boardColors 꼴, states: 상태 수 */
  function setColors(colors, states = 2) {
    col = colors;
    C = states;
    latticeKey = "";
  }

  // ── 보는 곳 ─────────────────
  function setView({ cx: x, cy: y, z } = {}) {
    if (x !== undefined) cx = x;
    if (y !== undefined) cy = y;
    if (z !== undefined) zf = z * dpr;
    settle();
  }
  const view = () => ({ cx, cy, z: c / dpr });

  /** 화면을 css px 만큼 끈다 */
  function panBy(dx, dy) {
    cx -= (dx * dpr) / c;
    cy -= (dy * dpr) / c;
    settle();
  }

  /** (clientX, clientY) 아래의 자리를 그대로 둔 채 f 배 키운다 */
  function zoomAt(clientX, clientY, f) {
    const r = canvas.getBoundingClientRect();
    const px = (clientX - r.left) * dpr - W / 2;
    const py = (clientY - r.top) * dpr - H / 2;
    const wx = cx + px / c;
    const wy = cy + py / c;
    zf *= f;
    settle();
    cx = wx - px / c;
    cy = wy - py / c;
    settle();
  }

  /** 가운데를 그대로 둔 채 f 배 */
  function zoomBy(f) {
    const r = canvas.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
  }

  /** 네모 b(양 끝 포함)가 화면의 fill 만큼을 채우게. 칸은 zmax css px 보다 커지지 않는다 */
  function fit(b, { fill = 0.7, zmax = 24 } = {}) {
    if (!W || !H) return;
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    zf = Math.min(zmax * dpr, (W * fill) / bw, (H * fill) / bh);
    zf = Math.max(1, Math.floor(zf));
    cx = b.x0 + bw / 2;
    cy = b.y0 + bh / 2;
    settle();
  }

  /** 끝이 있는 w×h 격자를 화면에 꼭 맞게 둔다(도감 그림). 크기가 바뀌어도 맞춘다 */
  function frame(w, h) {
    frameSize = { w, h };
    applyFrame();
    settle();
  }
  function applyFrame() {
    if (!W || !H) return;
    zf = Math.max(1, Math.floor(Math.min(W / frameSize.w, H / frameSize.h)));
    cx = frameSize.w / 2;
    cy = frameSize.h / 2;
  }

  /** 화면에 보이는 칸 범위(양 끝 포함) */
  function visible() {
    return { x0: Math.floor(-ox / c), y0: Math.floor(-oy / c), x1: Math.floor((W - 1 - ox) / c), y1: Math.floor((H - 1 - oy) / c) };
  }

  // ── 그리기 ─────────────────
  /** 상태별 점 반지름 */
  const R = (s) => (s === 1 ? c * 0.4 : s >= 2 ? c * 0.4 * (0.74 - (0.44 * (s - 2)) / Math.max(1, C - 2)) : 0);

  /** 빈칸 점: 칸 하나짜리 무늬를 깔아 둔다(칸이 정수 픽셀이라 어긋나지 않는다) */
  function drawLattice() {
    const key = `${c}|${col.empty.join()}|${col.bg.join()}`;
    if (key !== latticeKey) {
      const tile = document.createElement("canvas");
      tile.width = c;
      tile.height = c;
      const g = tile.getContext("2d");
      g.fillStyle = css(col.empty);
      g.beginPath();
      g.arc(c / 2, c / 2, Math.max(0.7 * dpr, c * 0.1), 0, TAU);
      g.fill();
      lattice = ctx.createPattern(tile, "repeat");
      latticeKey = key;
    }
    ctx.save();
    ctx.translate(mod(ox, c), mod(oy, c));
    ctx.fillStyle = lattice;
    ctx.fillRect(-c, -c, W + 2 * c, H + 2 * c);
    ctx.restore();
  }

  /**
   * src 를 그린다. 앞 세대가 있으면 t(0–1)만큼 앞 세대에서 넘어가는 중으로 그린다.
   * hover: 커서 아래 칸 [x, y], look: { x, y, neighbors } 살펴보는 칸
   */
  function draw(src, { t = 1, hover = null, look = null } = {}) {
    if (!W || !col) return;
    ctx.fillStyle = css(col.bg);
    ctx.fillRect(0, 0, W, H);
    const v = visible();
    if (frameSize) {
      v.x0 = Math.max(v.x0, 0);
      v.y0 = Math.max(v.y0, 0);
      v.x1 = Math.min(v.x1, frameSize.w - 1);
      v.y1 = Math.min(v.y1, frameSize.h - 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, frameSize.w * c, frameSize.h * c);
      ctx.clip();
    }
    if (c >= SQUARE_BELOW) drawLattice();
    if (c < PIXEL_BELOW) drawPixels(src, v);
    else drawDots(src, v, ease(Math.max(0, Math.min(1, t))));
    if (frameSize) ctx.restore();
    if (hover && !look) ring(hover[0], hover[1], css(col.ring), 1.25);
    if (look) drawLook(look);
  }

  function drawDots(src, { x0, y0, x1, y1 }, e) {
    const live = new Path2D();
    const born = new Path2D();
    const fade = new Path2D(); // 죽어서 줄어드는 산 칸
    const dying = [];
    const R1 = R(1);
    const square = c < SQUARE_BELOW;
    src.blocks(x0, y0, x1, y1, (bx, by, bw, bh, cells, prev) => {
      const xa = Math.max(x0, bx);
      const xb = Math.min(x1, bx + bw - 1);
      const ya = Math.max(y0, by);
      const yb = Math.min(y1, by + bh - 1);
      for (let y = ya; y <= yb; y++) {
        const row = (y - by) * bw - bx;
        const py = oy + (y + 0.5) * c;
        for (let x = xa; x <= xb; x++) {
          const i = row + x;
          const v = cells[i];
          const p = prev ? prev[i] : v;
          if (!v && !p) continue;
          let r;
          let path;
          if (v === 1) {
            if (p === 1) {
              r = R1;
              path = live;
            } else {
              r = R(p) + (R1 - R(p)) * e;
              path = born;
            }
          } else if (v >= 2) {
            r = R(p) + (R(v) - R(p)) * e;
            path = dying[v] || (dying[v] = new Path2D());
          } else {
            r = R(p) * (1 - e);
            path = p === 1 ? fade : dying[p] || (dying[p] = new Path2D());
          }
          if (r < 0.4) continue;
          const px = ox + (x + 0.5) * c;
          if (square) path.rect(px - r, py - r, 2 * r, 2 * r);
          else {
            path.moveTo(px + r, py);
            path.arc(px, py, r, 0, TAU);
          }
        }
      }
    });
    ctx.fillStyle = css(col.ink, 0.45);
    ctx.fill(fade);
    for (let k = 2; k < dying.length; k++) {
      if (!dying[k]) continue;
      ctx.fillStyle = css(col.dying[k] || col.ink);
      ctx.fill(dying[k]);
    }
    ctx.fillStyle = css(col.ink);
    ctx.fill(live);
    ctx.fillStyle = css(col.signal);
    ctx.fill(born);
  }

  /** 칸 하나 = 픽셀 하나인 그림을 만들어 c 배로 늘려 붙인다 */
  function drawPixels(src, { x0, y0, x1, y1 }) {
    const cols = x1 - x0 + 1;
    const rows = y1 - y0 + 1;
    if (cols <= 0 || rows <= 0) return;
    if (!img || img.width !== cols || img.height !== rows) {
      off.width = cols;
      off.height = rows;
      img = octx.createImageData(cols, rows);
      u32 = new Uint32Array(img.data.buffer);
    } else u32.fill(0);
    const pack = ([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    const ink = pack(col.ink);
    const sig = pack(col.signal);
    const dy = col.dying.map((x) => (x ? pack(x) : ink));
    src.blocks(x0, y0, x1, y1, (bx, by, bw, bh, cells, prev) => {
      const xa = Math.max(x0, bx);
      const xb = Math.min(x1, bx + bw - 1);
      const ya = Math.max(y0, by);
      const yb = Math.min(y1, by + bh - 1);
      for (let y = ya; y <= yb; y++) {
        const row = (y - by) * bw - bx;
        const out = (y - y0) * cols - x0;
        for (let x = xa; x <= xb; x++) {
          const v = cells[row + x];
          if (!v) continue;
          u32[out + x] = v === 1 ? (prev && prev[row + x] !== 1 ? sig : ink) : dy[v] || ink;
        }
      }
    });
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, ox + x0 * c, oy + y0 * c, cols * c, rows * c);
  }

  function ring(x, y, color, width, extra = 1.5) {
    ctx.lineWidth = Math.max(1, width * dpr);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(ox + (x + 0.5) * c, oy + (y + 0.5) * c, Math.max(R(1), 2 * dpr) + extra * dpr, 0, TAU);
    ctx.stroke();
  }

  function drawLook({ x, y, neighbors }) {
    ctx.save();
    ctx.setLineDash([2 * dpr, 2 * dpr]);
    for (const [nx, ny] of neighbors) ring(nx, ny, css(col.ring), 1.25, 1);
    ctx.setLineDash([]);
    ring(x, y, css(col.bg), 4.5, 2.5);
    ring(x, y, css(col.signal), 2, 2.5);
    if (c < 12 * dpr) {
      // 칸이 작으면 둘레에 큰 고리를 하나 더 그려 찾기 쉽게 한다
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = css(col.signal, 0.6);
      ctx.beginPath();
      ctx.arc(ox + (x + 0.5) * c, oy + (y + 0.5) * c, Math.max(c * 2.4, 18 * dpr), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 화면 좌표 아래의 칸 [x, y] */
  function cellAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return null;
    const px = (clientX - r.left) * (W / r.width);
    const py = (clientY - r.top) * (H / r.height);
    return [Math.floor((px - ox) / c), Math.floor((py - oy) / c)];
  }

  /** 칸 가운데의 자리(캔버스 왼쪽 위에서 css px)와 칸 크기 */
  function cellBox(x, y) {
    return { x: (ox + (x + 0.5) * c) / dpr, y: (oy + (y + 0.5) * c) / dpr, size: c / dpr };
  }

  /** 보이는 넓이(칸 수) */
  function span() {
    return { w: W / c, h: H / c };
  }

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => measure() && onResize && onResize()) : null;
  ro?.observe(canvas);

  return {
    measure,
    setColors,
    setView,
    view,
    panBy,
    zoomAt,
    zoomBy,
    fit,
    frame,
    visible,
    span,
    draw,
    cellAt,
    cellBox,
    /** 더 키울 수 있는가, 더 줄일 수 있는가 */
    canZoom: () => ({ in: c < cmax(), out: c > cmin() }),
    get ready() {
      return W > 0 && H > 0;
    },
    disconnect: () => ro?.disconnect(),
  };
}
