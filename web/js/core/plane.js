// 끝없는 격자. 판을 32×32 조각으로 나누고, 칸이 있는 조각만 Map 에 둔다.
// 한 세대를 넘길 때는 조각마다 둘레 한 줄을 이웃 조각에서 빌려 와(34×34) 표만 찾는다(core/life.js 의 표와 같다).
// 세는 이웃은 기본으로 산 칸(상태 1)이다. 조건표처럼 다른 상태를 셀 때는 상태마다 무게(weights)를 주고, 표는 무게를 더한 수로 찾는다.
// 가장자리에 세는 칸이 닿은 조각은 그쪽 이웃 조각을 미리 만들어 두어, 무늬가 어디로든 자라 나갈 수 있게 한다.
// 비어 있는 조각은 한 세대 더 두었다가(사라지는 모습을 그릴 수 있게) 지운다.

export const TILE = 32;
const S = TILE;
const SHIFT = 5;
const MASK = S - 1;
const P = S + 2;
const N = S * S;
const LIMIT = 30000; // 조각 좌표의 끝(가운데에서 약 96만 칸). 그 밖으로 나간 칸은 사라진다

/** 칸을 둘 수 있는 끝: -REACH ≤ x, y < REACH */
export const REACH = LIMIT * TILE;

const keyOf = (tx, ty) => tx * 65536 + ty;
const isLive = (v) => (v === 1 ? 1 : 0);
const raw = (v) => v;
/** 칸 값을 그대로 판에 옮기는 무게(순환이 쓴다) */
const RAW = Uint8Array.from({ length: 256 }, (_, i) => i);
const NO_OPTS = Object.freeze({});

// 가장자리 표시: 그 줄에 산 칸이 있으면 그쪽 이웃 조각이 있어야 한다
const EDGE_N = 1;
const EDGE_S = 2;
const EDGE_W = 4;
const EDGE_E = 8;
const EDGE_NW = 16;
const EDGE_NE = 32;
const EDGE_SW = 64;
const EDGE_SE = 128;
const DIRS = [
  [EDGE_N, 0, -1],
  [EDGE_S, 0, 1],
  [EDGE_W, -1, 0],
  [EDGE_E, 1, 0],
  [EDGE_NW, -1, -1],
  [EDGE_NE, 1, -1],
  [EDGE_SW, -1, 1],
  [EDGE_SE, 1, 1],
];

/** 산 칸(1)만 볼 때의 가장자리 표시(Life 가 쓰는 빠른 길) */
function edgeLive(c) {
  let e = 0;
  for (let i = 0; i < S; i++) {
    if (c[i] === 1) e |= EDGE_N;
    if (c[N - S + i] === 1) e |= EDGE_S;
    if (c[i * S] === 1) e |= EDGE_W;
    if (c[i * S + MASK] === 1) e |= EDGE_E;
  }
  if (c[0] === 1) e |= EDGE_NW;
  if (c[MASK] === 1) e |= EDGE_NE;
  if (c[N - S] === 1) e |= EDGE_SW;
  if (c[N - 1] === 1) e |= EDGE_SE;
  return e;
}

/** 가장자리 표시. w 가 없으면 산 칸(1)을, 있으면 무게가 0 이 아닌 상태를 본다 */
function edgeOf(c, w = null) {
  if (!w) return edgeLive(c);
  const on = (v) => w[v] !== 0;
  let e = 0;
  for (let i = 0; i < S; i++) {
    if (on(c[i])) e |= EDGE_N;
    if (on(c[N - S + i])) e |= EDGE_S;
    if (on(c[i * S])) e |= EDGE_W;
    if (on(c[i * S + MASK])) e |= EDGE_E;
  }
  if (on(c[0])) e |= EDGE_NW;
  if (on(c[MASK])) e |= EDGE_NE;
  if (on(c[N - S])) e |= EDGE_SW;
  if (on(c[N - 1])) e |= EDGE_SE;
  return e;
}

function makeTile(tx, ty) {
  return {
    tx,
    ty,
    cells: new Uint8Array(N),
    next: new Uint8Array(N), // 세대를 넘긴 뒤에는 바로 앞 세대
    pop: 0, // 빈칸이 아닌 칸 수
    live: 0, // 산 칸(상태 1) 수
    prevPop: 0,
    edge: 0,
    dirty: false, // 손으로 바꿔서 edge 를 다시 세야 한다
    nPop: 0,
    nLive: 0,
  };
}

export function makePlane() {
  const tiles = new Map();
  const pad = new Uint8Array(P * P);
  const pad32 = new Uint32Array(P * P); // 무게가 큰 코드 규칙이 쓴다
  let alive = 0;
  let filled = 0; // 빈칸이 아닌 칸 수

  function tileAt(tx, ty, create = false) {
    const k = keyOf(tx, ty);
    let t = tiles.get(k);
    if (!t && create) {
      if (tx > LIMIT || tx < -LIMIT || ty > LIMIT || ty < -LIMIT) return null;
      t = makeTile(tx, ty);
      tiles.set(k, t);
    }
    return t || null;
  }

  function get(x, y) {
    const t = tiles.get(keyOf(x >> SHIFT, y >> SHIFT));
    return t ? t.cells[(y & MASK) * S + (x & MASK)] : 0;
  }

  /** 칸 하나를 바꾸고 원래 값을 돌려준다 */
  function set(x, y, v) {
    const t = tileAt(x >> SHIFT, y >> SHIFT, v !== 0);
    if (!t) return 0;
    const i = (y & MASK) * S + (x & MASK);
    const old = t.cells[i];
    if (old === v) return old;
    t.cells[i] = v;
    if (old === 0) {
      t.pop++;
      filled++;
    } else if (v === 0) {
      t.pop--;
      filled--;
    }
    if (old === 1) {
      t.live--;
      alive--;
    }
    if (v === 1) {
      t.live++;
      alive++;
    }
    t.dirty = true;
    return old;
  }

  /** 가장자리에 세는 칸이 닿은 조각 둘레에 빈 조각을 만들어 둔다 */
  function expand(w) {
    for (const t of tiles.values()) {
      if (t.dirty) {
        t.edge = edgeOf(t.cells, w);
        t.dirty = false;
      }
      if (!t.edge) continue;
      for (const [bit, dx, dy] of DIRS) if (t.edge & bit) tileAt(t.tx + dx, t.ty + dy, true);
    }
  }

  /** 조각과 둘레 한 줄을 34×34 판 b 에 옮긴다. w 는 조각 칸의 무게(없으면 '산 칸인가'), val 은 둘레 칸의 무게 */
  function fillPad(t, w, val, b = pad) {
    const c = t.cells;
    for (let y = 0; y < S; y++) {
      const o = (y + 1) * P + 1;
      const r = y * S;
      if (w) for (let x = 0; x < S; x++) b[o + x] = w[c[r + x]];
      else for (let x = 0; x < S; x++) b[o + x] = c[r + x] === 1 ? 1 : 0;
    }
    fillRim(t, val, b);
  }

  /** 둘레 한 줄을 이웃 조각에서 빌려 온다 */
  function fillRim(t, val, b) {
    const { tx, ty } = t;
    const n = tiles.get(keyOf(tx, ty - 1));
    const s = tiles.get(keyOf(tx, ty + 1));
    const w = tiles.get(keyOf(tx - 1, ty));
    const e = tiles.get(keyOf(tx + 1, ty));
    const nw = tiles.get(keyOf(tx - 1, ty - 1));
    const ne = tiles.get(keyOf(tx + 1, ty - 1));
    const sw = tiles.get(keyOf(tx - 1, ty + 1));
    const se = tiles.get(keyOf(tx + 1, ty + 1));
    const bottom = (S + 1) * P;
    for (let x = 0; x < S; x++) {
      b[x + 1] = n ? val(n.cells[N - S + x]) : 0;
      b[bottom + x + 1] = s ? val(s.cells[x]) : 0;
    }
    for (let y = 0; y < S; y++) {
      const o = (y + 1) * P;
      b[o] = w ? val(w.cells[y * S + MASK]) : 0;
      b[o + S + 1] = e ? val(e.cells[y * S]) : 0;
    }
    b[0] = nw ? val(nw.cells[N - 1]) : 0;
    b[S + 1] = ne ? val(ne.cells[N - S]) : 0;
    b[bottom] = sw ? val(sw.cells[MASK]) : 0;
    b[bottom + S + 1] = se ? val(se.cells[0]) : 0;
  }

  // ── 조각 하나를 넘기는 계산(판 pad 를 채운 뒤 부른다). t.next 에 쓰고, 바뀐 칸 수를 돌려준다 ─────────────────

  /** 무어 8칸 무게의 합으로 표를 찾는다(Life·조건표) */
  function kMoore(t, table, stride) {
    const src = t.cells;
    const dst = t.next;
    let pop = 0;
    let live = 0;
    let ch = 0;
    for (let y = 0, i = 0; y < S; y++) {
      const r0 = y * P;
      const r1 = r0 + P;
      const r2 = r1 + P;
      for (let x = 0; x < S; x++, i++) {
        const n = pad[r0 + x] + pad[r0 + x + 1] + pad[r0 + x + 2] + pad[r1 + x] + pad[r1 + x + 2] + pad[r2 + x] + pad[r2 + x + 1] + pad[r2 + x + 2];
        const now = src[i];
        const nx = table[now * stride + n];
        dst[i] = nx;
        if (nx !== 0) {
          pop++;
          if (nx === 1) live++;
        }
        if (nx !== now) ch++;
      }
    }
    t.nPop = pop;
    t.nLive = live;
    return ch;
  }

  /** 육각 6칸(Golly 꼴: 오른쪽 위·왼쪽 아래를 뺀 무어 이웃) 무게의 합으로 표를 찾는다 */
  function kHex(t, table, stride) {
    const src = t.cells;
    const dst = t.next;
    let pop = 0;
    let live = 0;
    let ch = 0;
    for (let y = 0, i = 0; y < S; y++) {
      const r0 = y * P;
      const r1 = r0 + P;
      const r2 = r1 + P;
      for (let x = 0; x < S; x++, i++) {
        const n = pad[r0 + x] + pad[r0 + x + 1] + pad[r1 + x] + pad[r1 + x + 2] + pad[r2 + x + 1] + pad[r2 + x + 2];
        const now = src[i];
        const nx = table[now * stride + n];
        dst[i] = nx;
        if (nx !== 0) {
          pop++;
          if (nx === 1) live++;
        }
        if (nx !== now) ch++;
      }
    }
    t.nPop = pop;
    t.nLive = live;
    return ch;
  }

  /** 무어 8칸 무게(큰 수)의 합을 compact 로 줄여 표를 찾는다(코드 규칙: 상태마다 이웃 수) */
  function kCompact(t, table, stride, compact) {
    const src = t.cells;
    const dst = t.next;
    const b = pad32;
    let pop = 0;
    let live = 0;
    let ch = 0;
    for (let y = 0, i = 0; y < S; y++) {
      const r0 = y * P;
      const r1 = r0 + P;
      const r2 = r1 + P;
      for (let x = 0; x < S; x++, i++) {
        const n = b[r0 + x] + b[r0 + x + 1] + b[r0 + x + 2] + b[r1 + x] + b[r1 + x + 2] + b[r2 + x] + b[r2 + x + 1] + b[r2 + x + 2];
        const now = src[i];
        const nx = table[now * stride + compact[n]];
        dst[i] = nx;
        if (nx !== 0) {
          pop++;
          if (nx === 1) live++;
        }
        if (nx !== now) ch++;
      }
    }
    t.nPop = pop;
    t.nLive = live;
    return ch;
  }

  /** 순환: 바탕(0)은 그대로, 색 k(1–colors)는 다음 색인 이웃이 문턱 이상이면 다음 색. 판에는 칸 값이 그대로 있다 */
  function kCyclic(t, colors, threshold, vn) {
    const src = t.cells;
    const dst = t.next;
    let pop = 0;
    let live = 0;
    let ch = 0;
    for (let y = 0, i = 0; y < S; y++) {
      const r0 = y * P;
      const r1 = r0 + P;
      const r2 = r1 + P;
      for (let x = 0; x < S; x++, i++) {
        const v = src[i];
        let nx = v;
        if (v !== 0) {
          const s = v >= colors ? 1 : v + 1;
          let n = (pad[r0 + x + 1] === s) + (pad[r1 + x] === s) + (pad[r1 + x + 2] === s) + (pad[r2 + x + 1] === s);
          if (!vn) n += (pad[r0 + x] === s) + (pad[r0 + x + 2] === s) + (pad[r2 + x] === s) + (pad[r2 + x + 2] === s);
          if (n >= threshold) nx = s;
          pop++;
          if (nx === 1) live++;
        }
        dst[i] = nx;
        if (nx !== v) ch++;
      }
    }
    t.nPop = pop;
    t.nLive = live;
    return ch;
  }

  /** 조각마다 계산한 다음 세대로 바꾸고 세는 수를 맞춘다. 빈 조각은 한 세대 뒤에 지운다 */
  function commit(w, changed) {
    let total = 0;
    let all = 0;
    for (const [k, t] of tiles) {
      const c = t.cells;
      t.cells = t.next;
      t.next = c;
      t.prevPop = t.pop;
      t.pop = t.nPop;
      t.live = t.nLive;
      t.edge = (w ? t.pop : t.live) ? edgeOf(t.cells, w) : 0;
      t.dirty = false;
      total += t.live;
      all += t.pop;
      if (t.pop === 0 && t.prevPop === 0) tiles.delete(k);
    }
    alive = total;
    filled = all;
    return { alive, changed };
  }

  /**
   * 한 세대를 넘긴다. table 은 core/life.js 의 makeTable 이 만든 표(지금 상태 * stride + 이웃 수).
   * weights 를 주면 이웃 수 대신 이웃 무게의 합으로 찾는다(core/table.js). 산 칸(1)만 세면 null.
   * opts.hex: 육각 6이웃 · opts.compact: 무게 합을 표의 칸 번호로 바꾸는 배열(무게가 큰 코드 규칙, weights 는 Uint32Array)
   * 빈칸이 이웃 없이도 바뀌면(태어남 0 처럼) 끝없는 격자에서는 돌릴 수 없어 null 을 돌려준다.
   */
  function step(table, weights = null, stride = 9, opts = NO_OPTS) {
    if (table[0] !== 0) return null;
    const w = weights;
    const val = w ? (v) => w[v] : isLive;
    const compact = opts.compact ?? null;
    const hex = !!opts.hex;
    expand(w);
    let changed = 0;
    for (const t of tiles.values()) {
      if (compact) {
        fillPad(t, w, val, pad32);
        changed += kCompact(t, table, stride, compact);
      } else {
        fillPad(t, w, val);
        changed += hex ? kHex(t, table, stride) : kMoore(t, table, stride);
      }
    }
    return commit(w, changed);
  }

  /** 순환 계열의 한 세대. colors 는 도는 색 수(1–colors), vn 이면 폰 노이만 4칸, 아니면 무어 8칸. 바탕은 바뀌지 않아 조각을 늘리지 않는다 */
  function stepCyclic(colors, threshold, vn) {
    let changed = 0;
    for (const t of tiles.values()) {
      fillPad(t, RAW, raw);
      changed += kCyclic(t, colors, threshold, vn);
    }
    return commit(null, changed);
  }

  /** (x0, y0)–(x1, y1)(양 끝 포함)에 걸친 조각마다 fn(조각 왼쪽 위 x, y, 한 변, 지금 칸, 앞 세대 칸) */
  function blocks(x0, y0, x1, y1, fn) {
    const tx0 = x0 >> SHIFT;
    const tx1 = x1 >> SHIFT;
    const ty0 = y0 >> SHIFT;
    const ty1 = y1 >> SHIFT;
    for (const t of tiles.values()) {
      if (t.tx < tx0 || t.tx > tx1 || t.ty < ty0 || t.ty > ty1) continue;
      if (!t.pop && !t.prevPop) continue;
      fn(t.tx * S, t.ty * S, S, t.cells, t.next);
    }
  }

  /** 빈칸이 아닌 칸을 모두 덮는 네모(양 끝 포함). 비었으면 null */
  function bounds() {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const t of tiles.values()) {
      if (!t.pop) continue;
      const ox = t.tx * S;
      const oy = t.ty * S;
      if (ox >= x0 && oy >= y0 && ox + MASK <= x1 && oy + MASK <= y1) continue;
      const c = t.cells;
      for (let y = 0, i = 0; y < S; y++) {
        for (let x = 0; x < S; x++, i++) {
          if (!c[i]) continue;
          if (ox + x < x0) x0 = ox + x;
          if (ox + x > x1) x1 = ox + x;
          if (oy + y < y0) y0 = oy + y;
          if (oy + y > y1) y1 = oy + y;
        }
      }
    }
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
  }

  function clear() {
    tiles.clear();
    alive = 0;
    filled = 0;
  }

  /** 세는 상태가 바뀌었을 때: 다음 세대에 가장자리를 모두 다시 센다 */
  function markDirty() {
    for (const t of tiles.values()) t.dirty = true;
  }

  /** 칸이 하나도 없는 조각을 치운다(step 을 쓰지 않는 계열이 부른다) */
  function prune() {
    for (const [k, t] of tiles) if (t.pop === 0 && t.prevPop === 0) tiles.delete(k);
  }

  // ── 줄 단위(1차원이 쓴다) ─────────────────

  /** 줄 y 에서 빈칸이 아닌 칸의 왼쪽·오른쪽 끝(양 끝 포함). 없으면 null */
  function rowSpan(y) {
    const ty = y >> SHIFT;
    const r = (y & MASK) * S;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const t of tiles.values()) {
      if (t.ty !== ty || !t.pop) continue;
      const c = t.cells;
      const ox = t.tx * S;
      for (let x = 0; x < S; x++) {
        if (!c[r + x]) continue;
        if (ox + x < x0) x0 = ox + x;
        if (ox + x > x1) x1 = ox + x;
      }
    }
    return x0 === Infinity ? null : { x0, x1 };
  }

  /** 줄 y 의 x0–x1(양 끝 포함)을 배열로 읽는다 */
  function readRow(y, x0, x1) {
    const out = new Uint8Array(x1 - x0 + 1);
    const ty = y >> SHIFT;
    const r = (y & MASK) * S;
    for (let tx = x0 >> SHIFT; tx <= x1 >> SHIFT; tx++) {
      const t = tiles.get(keyOf(tx, ty));
      if (!t || !t.pop) continue;
      const ox = tx * S;
      const a = Math.max(x0, ox);
      const b = Math.min(x1, ox + MASK);
      for (let x = a; x <= b; x++) out[x - x0] = t.cells[r + x - ox];
    }
    return out;
  }

  /** 줄 y 보다 위에만 걸친 조각을 통째로 지운다(y 바로 위 조각 안의 줄은 남는다) */
  function dropAbove(y) {
    for (const [k, t] of tiles) {
      if (t.ty * S + MASK >= y) continue;
      alive -= t.live;
      filled -= t.pop;
      tiles.delete(k);
    }
  }

  /** 지금 모습을 떠 둔다(처음으로 돌아갈 때 쓴다) */
  function snapshot() {
    const out = [];
    for (const t of tiles.values()) if (t.pop) out.push([t.tx, t.ty, t.cells.slice()]);
    return out;
  }

  function restore(snap) {
    clear();
    for (const [tx, ty, cells] of snap) {
      const t = tileAt(tx, ty, true);
      if (!t) continue;
      t.cells.set(cells);
      recount(t);
    }
  }

  function recount(t) {
    let pop = 0;
    let live = 0;
    for (let i = 0; i < N; i++) {
      const v = t.cells[i];
      if (v) {
        pop++;
        if (v === 1) live++;
      }
    }
    alive += live - t.live;
    filled += pop - t.pop;
    t.pop = pop;
    t.live = live;
    t.dirty = true;
  }

  /** 상태 수를 줄였을 때 없어진 상태의 칸을 빈칸으로 */
  function clampStates(states) {
    for (const t of tiles.values()) {
      for (let i = 0; i < N; i++) {
        if (t.cells[i] >= states) t.cells[i] = 0;
        if (t.next[i] >= states) t.next[i] = 0;
      }
      recount(t);
    }
  }

  /** 빈칸이 아닌 칸마다 fn(x, y, 상태) */
  function each(fn) {
    for (const t of tiles.values()) {
      if (!t.pop) continue;
      for (let i = 0; i < N; i++) if (t.cells[i]) fn(t.tx * S + (i & MASK), t.ty * S + (i >> SHIFT), t.cells[i]);
    }
  }

  return {
    get,
    set,
    step,
    stepCyclic,
    blocks,
    bounds,
    clear,
    prune,
    markDirty,
    rowSpan,
    readRow,
    dropAbove,
    snapshot,
    restore,
    clampStates,
    each,
    /** 산 칸(상태 1) 수 */
    get alive() {
      return alive;
    },
    /** 빈칸이 아닌 칸 수 */
    get filled() {
      return filled;
    },
    /** 쓰고 있는 조각 수(넓게 퍼질수록 커진다) */
    get size() {
      return tiles.size;
    },
  };
}
