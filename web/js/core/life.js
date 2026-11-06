// Life 계열 규칙(B/S/C). 칸 상태 0 은 빈칸, 1 은 산 칸, 2 부터 C-1 은 한 단계씩 사라지는 칸(Generations).
// 다음 상태는 지금 상태와 '산 이웃 수'(무어 이웃 8칸 가운데 상태 1 인 칸)로만 정해진다.
// 그래서 (상태, 이웃 수) → 다음 상태 표를 한 번 만들어 두고, 칸마다 표만 찾는다.

export const MIN_STATES = 2;
export const MAX_STATES = 255;

const uniqSorted = (xs) => [...new Set(xs)].sort((a, b) => a - b);
const digits = (s) => uniqSorted([...s].map(Number));

/**
 * 표기를 읽는다. 못 읽으면 null.
 *   글자 꼴: B3/S23 · b3s23 · S23/B3 · B2/S/C3 · B2/S/3
 *   숫자 꼴(Golly·MCell 의 옛 꼴, 살아남음/태어남[/상태 수]): 23/3 · /2/3 · 345/2/4
 */
export function parseNotation(text) {
  const s = String(text ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  if (!s) return null;
  let b, sv, c;
  let m = s.match(/^(?:B([0-8]*)\/?S([0-8]*)|S([0-8]*)\/?B([0-8]*))(?:\/?[CG](\d+)|\/(\d+))?$/);
  if (m) {
    b = m[1] ?? m[4];
    sv = m[2] ?? m[3];
    c = m[5] ?? m[6];
  } else {
    m = s.match(/^([0-8]*)\/([0-8]*)(?:\/(\d+))?$/);
    if (!m) return null;
    [, sv, b, c] = m;
  }
  const states = c === undefined ? 2 : Number(c);
  if (!Number.isInteger(states) || states < MIN_STATES || states > MAX_STATES) return null;
  return { birth: digits(b), survive: digits(sv), states };
}

/** 규칙을 표기로. 상태가 3개 이상이면 B2/S/C3 처럼 C 를 붙인다 */
export function formatNotation({ birth, survive, states = 2 }) {
  const core = `B${uniqSorted(birth).join("")}/S${uniqSorted(survive).join("")}`;
  return states > 2 ? `${core}/C${states}` : core;
}

/** (상태 s, 산 이웃 n) → 다음 상태. table[s * 9 + n] */
export function makeTable({ birth, survive, states = 2 }) {
  const table = new Uint8Array(states * 9);
  const B = new Set(birth);
  const S = new Set(survive);
  for (let n = 0; n <= 8; n++) {
    table[n] = B.has(n) ? 1 : 0;
    table[9 + n] = S.has(n) ? 1 : states > 2 ? 2 : 0;
    for (let s = 2; s < states; s++) table[s * 9 + n] = (s + 1) % states;
  }
  return table;
}

/**
 * 한 세대를 넘긴다. src 를 읽어 dst 에 쓴다.
 * wrap 이 참이면 가장자리를 맞은편과 이어 붙이고(토러스), 거짓이면 격자 밖을 빈칸으로 본다.
 * 돌려주는 값: 새 세대의 산 칸 수(alive)와 상태가 바뀐 칸 수(changed)
 */
export function stepLife(src, dst, w, h, table, wrap) {
  let alive = 0;
  let changed = 0;
  for (let y = 0; y < h; y++) {
    const up = y > 0 ? y - 1 : wrap ? h - 1 : -1;
    const dn = y < h - 1 ? y + 1 : wrap ? 0 : -1;
    const r0 = up < 0 ? -1 : up * w;
    const r1 = y * w;
    const r2 = dn < 0 ? -1 : dn * w;
    for (let x = 0; x < w; x++) {
      const l = x > 0 ? x - 1 : wrap ? w - 1 : -1;
      const r = x < w - 1 ? x + 1 : wrap ? 0 : -1;
      let n = 0;
      if (r0 >= 0) {
        if (l >= 0 && src[r0 + l] === 1) n++;
        if (src[r0 + x] === 1) n++;
        if (r >= 0 && src[r0 + r] === 1) n++;
      }
      if (l >= 0 && src[r1 + l] === 1) n++;
      if (r >= 0 && src[r1 + r] === 1) n++;
      if (r2 >= 0) {
        if (l >= 0 && src[r2 + l] === 1) n++;
        if (src[r2 + x] === 1) n++;
        if (r >= 0 && src[r2 + r] === 1) n++;
      }
      const now = src[r1 + x];
      const next = table[now * 9 + n];
      dst[r1 + x] = next;
      if (next === 1) alive++;
      if (next !== now) changed++;
    }
  }
  return { alive, changed };
}

/** (x, y) 의 이웃 8칸 자리. 벽이면 격자 밖은 뺀다 */
export function neighborCells(w, h, x, y, wrap) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      let nx = x + dx;
      let ny = y + dy;
      if (wrap) {
        nx = (nx + w) % w;
        ny = (ny + h) % h;
      } else if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      out.push([nx, ny]);
    }
  }
  return out;
}

export function liveNeighbors(cells, w, h, x, y, wrap) {
  let n = 0;
  for (const [nx, ny] of neighborCells(w, h, x, y, wrap)) if (cells[ny * w + nx] === 1) n++;
  return n;
}

/**
 * 칸 하나가 다음 세대에 어떻게 되는지와 그 까닭.
 *   born 태어남 · stay 빈칸 그대로 · survive 살아남음 · die 죽음
 *   fade 사라지기 시작(C ≥ 3) · fading 한 단계 더 사라짐 · gone 빈칸이 됨
 */
export function explain({ birth, survive, states = 2 }, state, n) {
  if (state === 0) return birth.includes(n) ? { next: 1, why: "born" } : { next: 0, why: "stay" };
  if (state === 1) {
    if (survive.includes(n)) return { next: 1, why: "survive" };
    return states > 2 ? { next: 2, why: "fade" } : { next: 0, why: "die" };
  }
  const next = (state + 1) % states;
  return { next, why: next === 0 ? "gone" : "fading" };
}
