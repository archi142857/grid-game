// 끝없는 격자 하나와 그 규칙, 세대 수, 기록(세대마다 산 칸·바뀐 칸 수). 첫 화면과 규칙 화면이 함께 쓴다.
// '처음으로'는 0세대에서 넘기기 시작한 순간의 모습(origin)으로 돌아간다.
// 칸 자리는 정수 (x, y). 가운데가 (0, 0) 이고 오른쪽·아래로 커진다.

import { makeTable } from "../core/life.js";
import { makePlane } from "../core/plane.js";
import { parseRLE } from "../core/rle.js";
import { makeRng, randomSeed } from "../core/rng.js";
import { lifeRule } from "../core/rules.js";

/** 쓰는 조각(32×32)이 이만큼을 넘으면(약 100만 칸) 너무 넓게 퍼진 것으로 보고 멈춘다 */
export const MAX_TILES = 1024;

/** 가운데가 (cx, cy) 인 w×h 네모 */
export const regionAt = (cx, cy, w, h) => ({ x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) });

export function makeWorld(rule, { seed = randomSeed(), keep = 600 } = {}) {
  const P = makePlane();
  const W = {
    rule,
    table: makeTable(lifeRule(rule)),
    plane: P,
    seed: seed >>> 0,
    gen: 0,
    origin: null,
    alive: [0],
    changed: [0],
    start: 0, // alive[0] 이 몇 세대의 값인지
    prevOk: false, // 조각마다 바로 앞 세대가 남아 있는가
    region: regionAt(0, 0, 64, 48), // 마지막으로 뿌린 자리

    /** 태어남에 0 이 있으면 빈 곳 전체가 한꺼번에 태어나서 끝없는 격자에서는 돌릴 수 없다 */
    canRun: () => W.table[0] === 0,
    /** 너무 넓게 퍼졌는가 */
    get full() {
      return P.size > MAX_TILES;
    },

    /** 규칙만 바꾼다(칸은 그대로). 상태 수가 줄면 없어진 상태의 칸은 빈칸이 된다 */
    setRule(r) {
      const fewer = r.states.length < W.rule.states.length;
      W.rule = r;
      W.table = makeTable(lifeRule(r));
      if (fewer) {
        P.clampStates(r.states.length);
        if (W.origin) W.origin = W.origin.map(([tx, ty, c]) => [tx, ty, c.map((v) => (v < r.states.length ? v : 0))]);
        W.touched();
      }
    },

    /** 규칙 파일의 seed 대로 region 안에 다시 뿌린다. 씨앗 번호가 같으면 같은 모습 */
    reseed(n = W.seed, region = W.region) {
      W.seed = n >>> 0;
      W.region = region;
      P.clear();
      const s = W.rule.seed ?? { type: "empty" };
      const rng = makeRng(W.seed);
      if (s.type === "random") fill(region, s.density ?? 0.3, s.area ?? 1, rng);
      else if (s.type === "single") P.set(region.x + (region.w >> 1), region.y + (region.h >> 1), 1);
      else if (s.type === "rle") put(parseRLE(s.data).rows, region.x + region.w / 2, region.y + region.h / 2);
      W.origin = null;
      W.restart();
    },

    /** region 안에 무작위로 흩뿌린다. 규칙의 seed 가 random 이면 그 넓이(area) 안에만 */
    scatter(density, n = randomSeed(), region = W.region) {
      W.seed = n >>> 0;
      W.region = region;
      P.clear();
      const s = W.rule.seed;
      fill(region, density, s && s.type === "random" ? (s.area ?? 1) : 1, makeRng(W.seed));
      W.origin = null;
      W.restart();
    },

    clear() {
      P.clear();
      W.origin = null;
      W.restart();
    },

    /** 비우고 (cx, cy) 를 가운데로 무늬를 놓는다 */
    place(rows, cx = 0, cy = 0) {
      P.clear();
      put(rows, cx, cy);
      W.origin = null;
      W.restart();
    },

    /** region 안의 산 칸과 빈칸을 뒤바꾼다(사라지는 중인 칸은 빈칸으로 본다) */
    invert(region) {
      for (let y = region.y; y < region.y + region.h; y++) for (let x = region.x; x < region.x + region.w; x++) P.set(x, y, P.get(x, y) === 1 ? 0 : 1);
      W.prevOk = false;
      W.touched();
    },

    /** 0세대부터 다시 센다 */
    restart() {
      W.prevOk = false;
      W.gen = 0;
      W.alive = [P.alive];
      W.changed = [0];
      W.start = 0;
    },

    /** 손으로 칸을 바꾼 뒤. 0세대면 처음 모습도 바뀐 것으로 본다 */
    touched() {
      if (W.gen === 0) {
        W.origin = null;
        W.alive = [P.alive];
      } else W.alive[W.alive.length - 1] = P.alive;
    },

    /** 한 세대를 넘긴다. 돌릴 수 없으면(태어남 0, 너무 넓음) 거짓 */
    step() {
      if (!W.canRun() || W.full) return false;
      if (W.gen === 0) W.origin = P.snapshot();
      const res = P.step(W.table);
      if (!res) return false;
      W.prevOk = true;
      W.gen++;
      W.alive.push(res.alive);
      W.changed.push(res.changed);
      if (W.alive.length > keep) {
        W.alive.shift();
        W.changed.shift();
        W.start++;
      }
      return true;
    },

    /** 처음으로: 0세대의 모습으로 */
    back() {
      if (!W.origin) return false;
      P.restore(W.origin);
      W.restart();
      return true;
    },

    get: (x, y) => P.get(x, y),
    set: (x, y, v) => P.set(x, y, v),
    bounds: () => P.bounds(),

    /** 그리기용: (x0, y0)–(x1, y1) 에 걸친 조각마다 fn(왼쪽 위 x, y, 너비, 높이, 지금 칸, 앞 세대 칸 | null) */
    blocks(x0, y0, x1, y1, fn) {
      const prev = W.prevOk;
      P.blocks(x0, y0, x1, y1, (ox, oy, s, cells, next) => fn(ox, oy, s, s, cells, prev ? next : null));
    },

    get count() {
      return P.alive;
    },
    get lastChanged() {
      return W.changed[W.changed.length - 1];
    },
  };

  function fill(region, density, area, rng) {
    const aw = Math.max(1, Math.round(region.w * area));
    const ah = Math.max(1, Math.round(region.h * area));
    const x0 = region.x + Math.floor((region.w - aw) / 2);
    const y0 = region.y + Math.floor((region.h - ah) / 2);
    for (let y = y0; y < y0 + ah; y++) for (let x = x0; x < x0 + aw; x++) if (rng.next() < density) P.set(x, y, 1);
  }

  /** 무늬(줄마다 상태 배열)를 (cx, cy) 가운데에 놓는다. 규칙에 없는 상태는 버린다 */
  function put(rows, cx, cy) {
    const states = W.rule.states.length;
    const pw = Math.max(0, ...rows.map((r) => r.length));
    const x0 = Math.round(cx - pw / 2);
    const y0 = Math.round(cy - rows.length / 2);
    rows.forEach((row, y) => row.forEach((s, x) => s && s < states && P.set(x0 + x, y0 + y, s)));
  }

  W.restart();
  return W;
}

/** 글자에서 늘 같은 씨앗 번호를 만든다(도감 그림이 볼 때마다 같게) */
export function seedOf(text) {
  let x = 2166136261;
  for (const ch of String(text)) {
    x ^= ch.codePointAt(0);
    x = Math.imul(x, 16777619);
  }
  return x >>> 0;
}
