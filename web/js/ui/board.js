// 격자를 점으로 그린다. 빈칸은 작은 점, 산 칸은 큰 점, 방금 태어난 칸은 신호색 점.
// 세대가 바뀔 때 점이 자라고(태어남) 줄어들며(죽음) 이어지도록, 앞 세대(prev)와 진행도(t)를 받아 사이를 그린다.
// 칸이 아주 작으면(기기 픽셀 3.5개 미만) 점 대신 픽셀로 그린다.

const TAU = Math.PI * 2;
const ease = (t) => 1 - (1 - t) ** 3;
const css = ([r, g, b], a = 1) => (a === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${a})`);

export function makeBoard(canvas, { onResize = null } = {}) {
  const ctx = canvas.getContext("2d");
  const off = document.createElement("canvas");
  const octx = off.getContext("2d");
  let img = null;
  let u32 = null;
  let w = 1;
  let h = 1;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let sx = 1;
  let sy = 1;
  let c = 1; // 칸 한 변(기기 픽셀)
  let C = 2; // 상태 수
  let col = null;
  let layer = null;

  function setGrid(nw, nh) {
    w = nw;
    h = nh;
    if (!img || off.width !== w || off.height !== h) {
      off.width = w;
      off.height = h;
      img = octx.createImageData(w, h);
      u32 = new Uint32Array(img.data.buffer);
    }
    measure(true);
  }

  /** 화면 크기를 다시 잰다. 크기가 그대로면 거짓 */
  function measure(force = false) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    dpr = window.devicePixelRatio || 1;
    const nW = Math.max(1, Math.round(r.width * dpr));
    const nH = Math.max(1, Math.round(r.height * dpr));
    if (!force && nW === W && nH === H) return false;
    if (canvas.width !== nW) canvas.width = nW;
    if (canvas.height !== nH) canvas.height = nH;
    W = nW;
    H = nH;
    sx = W / w;
    sy = H / h;
    c = Math.min(sx, sy);
    layer = null;
    return true;
  }

  /** colors: theme.js 의 boardColors 꼴, states: 상태 수 */
  function setColors(colors, states = 2) {
    col = colors;
    C = states;
    layer = null;
  }

  const pixel = () => c < 3.5;
  /** 상태별 점 반지름 */
  const R = (s) => (s === 1 ? c * 0.4 : s >= 2 ? c * 0.4 * (0.74 - (0.44 * (s - 2)) / Math.max(1, C - 2)) : 0);

  function buildLayer() {
    layer = document.createElement("canvas");
    layer.width = W;
    layer.height = H;
    const g = layer.getContext("2d");
    g.fillStyle = css(col.bg);
    g.fillRect(0, 0, W, H);
    if (pixel()) return;
    g.fillStyle = css(col.empty);
    g.beginPath();
    const r = Math.max(0.7 * dpr, c * 0.1);
    for (let y = 0; y < h; y++) {
      const cy = (y + 0.5) * sy;
      for (let x = 0; x < w; x++) {
        const cx = (x + 0.5) * sx;
        g.moveTo(cx + r, cy);
        g.arc(cx, cy, r, 0, TAU);
      }
    }
    g.fill();
  }

  /**
   * cells 를 그린다. prev(앞 세대)가 있으면 t(0–1)만큼 앞 세대에서 넘어가는 중으로 그린다.
   * hover: 커서 아래 칸 [x, y], look: { x, y, neighbors } 살펴보는 칸
   */
  function draw(cells, prev = null, { t = 1, hover = null, look = null } = {}) {
    if (!W || !col) return;
    if (!layer) buildLayer();
    ctx.drawImage(layer, 0, 0);
    if (pixel()) drawPixels(cells, prev);
    else drawDots(cells, prev, ease(Math.max(0, Math.min(1, t))));
    if (hover && !look) ring(hover[0], hover[1], css(col.ring), 1.25);
    if (look) drawLook(look);
  }

  function drawDots(cells, prev, e) {
    const live = new Path2D();
    const born = new Path2D();
    const fade = new Path2D(); // 죽어서 줄어드는 산 칸
    const dying = [];
    const R1 = R(1);
    for (let i = 0, n = w * h; i < n; i++) {
      const v = cells[i];
      const p = prev ? prev[i] : v;
      if (!v && !p) continue;
      const x = i % w;
      const y = (i / w) | 0;
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
      const cx = (x + 0.5) * sx;
      const cy = (y + 0.5) * sy;
      path.moveTo(cx + r, cy);
      path.arc(cx, cy, r, 0, TAU);
    }
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

  function drawPixels(cells, prev) {
    const pack = ([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    const bg = pack(col.bg);
    const ink = pack(col.ink);
    const sig = pack(col.signal);
    const dy = col.dying.map((x) => (x ? pack(x) : ink));
    for (let i = 0, n = w * h; i < n; i++) {
      const v = cells[i];
      u32[i] = v === 0 ? bg : v === 1 ? (prev && prev[i] !== 1 ? sig : ink) : dy[v] || ink;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, W, H);
  }

  function ring(x, y, color, width, extra = 1.5) {
    const lw = Math.max(1, width * dpr);
    ctx.lineWidth = lw;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc((x + 0.5) * sx, (y + 0.5) * sy, Math.max(R(1), 2 * dpr) + extra * dpr, 0, TAU);
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
      ctx.arc((x + 0.5) * sx, (y + 0.5) * sy, Math.max(c * 2.4, 18 * dpr), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 화면 좌표 아래의 칸 [x, y]. 격자 밖이면 null */
  function cellAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return null;
    const x = Math.floor(((clientX - r.left) / r.width) * w);
    const y = Math.floor(((clientY - r.top) / r.height) * h);
    return x >= 0 && y >= 0 && x < w && y < h ? [x, y] : null;
  }

  /** 칸 가운데의 자리(캔버스 왼쪽 위에서 css px)와 칸 크기 */
  function cellBox(x, y) {
    return { x: ((x + 0.5) * sx) / dpr, y: ((y + 0.5) * sy) / dpr, size: c / dpr };
  }

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => measure() && onResize && onResize()) : null;
  ro?.observe(canvas);

  return {
    setGrid,
    measure,
    setColors,
    draw,
    cellAt,
    cellBox,
    disconnect: () => ro?.disconnect(),
  };
}
