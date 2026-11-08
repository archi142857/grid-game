// 끝없는 격자. 판을 32×32 조각으로 나누고, 칸이 있는 조각만 Map 에 둔다.
// 한 세대를 넘길 때는 조각마다 둘레 한 줄을 이웃 조각에서 빌려 와(34×34) 표만 찾는다(core/life.js 의 표와 같다).
// 가장자리에 산 칸이 닿은 조각은 그쪽 이웃 조각을 미리 만들어 두어, 무늬가 어디로든 자라 나갈 수 있게 한다.
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

function edgeOf(c) {
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

  /** 가장자리에 산 칸이 닿은 조각 둘레에 빈 조각을 만들어 둔다 */
  function expand() {
    for (const t of tiles.values()) {
      if (t.dirty) {
        t.edge = edgeOf(t.cells);
        t.dirty = false;
      }
      if (!t.edge) continue;
      for (const [bit, dx, dy] of DIRS) if (t.edge & bit) tileAt(t.tx + dx, t.ty + dy, true);
    }
  }

  /** 조각과 둘레 한 줄의 '산 칸인가'를 34×34 판에 옮긴다 */
  function fillPad(t) {
    const c = t.cells;
    for (let y = 0; y < S; y++) {
      const o = (y + 1) * P + 1;
      const r = y * S;
      for (let x = 0; x < S; x++) pad[o + x] = c[r + x] === 1 ? 1 : 0;
    }
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
      pad[x + 1] = n && n.cells[N - S + x] === 1 ? 1 : 0;
      pad[bottom + x + 1] = s && s.cells[x] === 1 ? 1 : 0;
    }
    for (let y = 0; y < S; y++) {
      const o = (y + 1) * P;
      pad[o] = w && w.cells[y * S + MASK] === 1 ? 1 : 0;
      pad[o + S + 1] = e && e.cells[y * S] === 1 ? 1 : 0;
    }
    pad[0] = nw && nw.cells[N - 1] === 1 ? 1 : 0;
    pad[S + 1] = ne && ne.cells[N - S] === 1 ? 1 : 0;
    pad[bottom] = sw && sw.cells[MASK] === 1 ? 1 : 0;
    pad[bottom + S + 1] = se && se.cells[0] === 1 ? 1 : 0;
  }

  /**
   * 한 세대를 넘긴다. table 은 core/life.js 의 makeTable 이 만든 표.
   * 태어남에 0 이 있으면(빈 곳이 저절로 태어나면) 끝없는 격자에서는 돌릴 수 없어 null 을 돌려준다.
   */
  function step(table) {
    if (table[0] !== 0) return null;
    expand();
    let changed = 0;
    for (const t of tiles.values()) {
      fillPad(t);
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
          const n =
            pad[r0 + x] + pad[r0 + x + 1] + pad[r0 + x + 2] + pad[r1 + x] + pad[r1 + x + 2] + pad[r2 + x] + pad[r2 + x + 1] + pad[r2 + x + 2];
          const now = src[i];
          const nx = table[now * 9 + n];
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
      changed += ch;
    }
    let total = 0;
    let all = 0;
    for (const [k, t] of tiles) {
      const c = t.cells;
      t.cells = t.next;
      t.next = c;
      t.prevPop = t.pop;
      t.pop = t.nPop;
      t.live = t.nLive;
      t.edge = t.live ? edgeOf(t.cells) : 0;
      t.dirty = false;
      total += t.live;
      all += t.pop;
      if (t.pop === 0 && t.prevPop === 0) tiles.delete(k);
    }
    alive = total;
    filled = all;
    return { alive, changed };
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

  /** 칸이 하나도 없는 조각을 치운다(step 을 쓰지 않는 계열이 부른다) */
  function prune() {
    for (const [k, t] of tiles) if (t.pop === 0 && t.prevPop === 0) tiles.delete(k);
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
    blocks,
    bounds,
    clear,
    prune,
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
