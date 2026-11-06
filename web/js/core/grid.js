// 격자: 칸 상태를 줄 순서로 담은 Uint8Array 두 장(지금·다음)을 번갈아 쓴다.

import { parseRLE } from "./rle.js";

export function makeGrid(w, h) {
  return { w, h, cells: new Uint8Array(w * h), next: new Uint8Array(w * h) };
}

/** 크기를 바꾼 새 격자. 겹치는 부분은 가운데를 맞춰 옮긴다 */
export function resizeGrid(g, w, h) {
  const out = makeGrid(w, h);
  const ox = Math.floor((w - g.w) / 2);
  const oy = Math.floor((h - g.h) / 2);
  for (let y = 0; y < g.h; y++) {
    const ny = y + oy;
    if (ny < 0 || ny >= h) continue;
    for (let x = 0; x < g.w; x++) {
      const nx = x + ox;
      if (nx >= 0 && nx < w) out.cells[ny * w + nx] = g.cells[y * g.w + x];
    }
  }
  return out;
}

/** 가운데 area(0–1, 가로세로 비율) 안의 칸을 density 확률로 살린다 */
export function fillRandom(g, rng, density, area = 1) {
  g.cells.fill(0);
  const aw = Math.max(1, Math.round(g.w * area));
  const ah = Math.max(1, Math.round(g.h * area));
  const x0 = Math.floor((g.w - aw) / 2);
  const y0 = Math.floor((g.h - ah) / 2);
  for (let y = y0; y < y0 + ah; y++) {
    for (let x = x0; x < x0 + aw; x++) if (rng.next() < density) g.cells[y * g.w + x] = 1;
  }
}

/** 무늬(줄마다 상태 배열)를 가운데에 놓는다. 격자를 넘치는 부분과 규칙에 없는 상태는 버린다 */
export function placeRows(g, rows, states = 2) {
  const pw = Math.max(0, ...rows.map((r) => r.length));
  const x0 = Math.floor((g.w - pw) / 2);
  const y0 = Math.floor((g.h - rows.length) / 2);
  rows.forEach((row, y) =>
    row.forEach((s, x) => {
      const gx = x0 + x;
      const gy = y0 + y;
      if (gx >= 0 && gy >= 0 && gx < g.w && gy < g.h) g.cells[gy * g.w + gx] = s < states ? s : 0;
    }),
  );
}

/** 규칙 파일의 seed 대로 시작 상태를 만든다 */
export function seedGrid(g, seed, rng, states = 2) {
  g.cells.fill(0);
  const type = seed?.type ?? "empty";
  if (type === "random") fillRandom(g, rng, seed.density ?? 0.3, seed.area ?? 1);
  else if (type === "single") g.cells[Math.floor(g.h / 2) * g.w + Math.floor(g.w / 2)] = 1;
  else if (type === "rle") placeRows(g, parseRLE(seed.data).rows, states);
}

/** 상태별 칸 수 */
export function census(cells, states) {
  const c = new Array(states).fill(0);
  for (let i = 0; i < cells.length; i++) c[cells[i]]++;
  return c;
}

/** 산 칸(상태 1) 수 */
export function countAlive(cells) {
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] === 1) n++;
  return n;
}

/** 산 칸과 빈칸을 뒤바꾼다. 사라지는 중인 칸(상태 2 이상)은 빈칸으로 본다 */
export function invertCells(cells) {
  for (let i = 0; i < cells.length; i++) cells[i] = cells[i] === 1 ? 0 : 1;
}

/** 상태 수를 줄였을 때, 없어진 상태의 칸을 빈칸으로 */
export function clampStates(cells, states) {
  for (let i = 0; i < cells.length; i++) if (cells[i] >= states) cells[i] = 0;
}
