// 엔진과 화면 사이의 꼴(계열 확장 설계 2절). 계열이 무엇이든 화면은 makeSim(rule) 이 돌려주는 sim 만 부른다.
// 모든 계열이 끝없는 격자(core/plane.js) 위에서 돈다. 칸 자리는 정수 (x, y), 가운데가 (0, 0) 이고 오른쪽·아래로 커진다.
// 세대 수·기록·처음 모습·보는 자리는 화면 쪽(ui/world.js)이 맡는다. sim 은 칸과 계산만.
// 화면 글은 만들지 않는다. 살펴보기의 까닭(why)은 짧은 낱말로만 돌려주고, 글은 프론트엔드가 t() 로 만든다.

import { makePlane } from "./plane.js";
import { makeTable, explain as lifeExplain } from "./life.js";
import { parseRLE } from "./rle.js";
import { lifeRule } from "./rules.js";

/** 쓰는 조각(32×32)이 이만큼을 넘으면(약 100만 칸) 너무 넓게 퍼진 것으로 보고 멈춘다 */
export const MAX_TILES = 1024;

const NONE = Object.freeze([]);

/** (x, y) 의 무어 이웃 8칸. 왼쪽 위부터 줄 순서 */
export const around = (x, y) => [
  [x - 1, y - 1],
  [x, y - 1],
  [x + 1, y - 1],
  [x - 1, y],
  [x + 1, y],
  [x - 1, y + 1],
  [x, y + 1],
  [x + 1, y + 1],
];

const BUILD = { life: lifeSim };

/** 이 엔진이 sim 으로 돌릴 수 있는 계열 */
export const SIM_FAMILIES = Object.keys(BUILD);

/** rule: checkRuleFile(…).rule */
export function makeSim(rule) {
  const build = BUILD[rule?.family];
  if (!build) throw new Error(`makeSim: 아직 sim 이 없는 계열이에요 (${rule?.family})`);
  return build(rule);
}

// ── 같이 쓰는 것 ─────────────────

/** region({ x, y, w, h }) 가운데 area(0–1) 몫 안의 칸을 density 확률로 pick() 값으로 칠한다. 줄 순서로 난수를 쓴다 */
function fillRegion(P, region, density, area, rng, pick = null) {
  const aw = Math.max(1, Math.round(region.w * area));
  const ah = Math.max(1, Math.round(region.h * area));
  const x0 = region.x + Math.floor((region.w - aw) / 2);
  const y0 = region.y + Math.floor((region.h - ah) / 2);
  for (let y = y0; y < y0 + ah; y++) for (let x = x0; x < x0 + aw; x++) if (rng.next() < density) P.set(x, y, pick ? pick() : 1);
}

/** 무늬(줄마다 상태 배열)를 (cx, cy) 가운데에 놓는다. 0 과 규칙에 없는 상태는 건너뛴다 */
function putRows(P, rows, cx, cy, states) {
  const pw = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const x0 = Math.round(cx - pw / 2);
  const y0 = Math.round(cy - rows.length / 2);
  rows.forEach((row, y) => row.forEach((s, x) => s > 0 && s < states && P.set(x0 + x, y0 + y, s)));
}

const regionCenter = (region) => [region.x + region.w / 2, region.y + region.h / 2];

// ── Life 계열 ─────────────────

function lifeSim(rule) {
  const P = makePlane();
  let r = rule;
  let table = makeTable(lifeRule(r));
  let prevOk = false; // 조각마다 바로 앞 세대가 남아 있는가

  const states = () => r.states.length;

  const sim = {
    family: "life",
    get rule() {
      return r;
    },
    /** 태어남에 0 이 있으면 빈 곳 전체가 한꺼번에 태어나서 끝없는 격자에서는 돌릴 수 없다 */
    canRun: () => table[0] === 0,
    get full() {
      return P.size > MAX_TILES;
    },

    /** n 세대를 넘긴다(기본 1). 못 가면 null. 가다가 너무 넓어지면 거기서 멈추고 간 만큼(steps)을 알려 준다 */
    step(n = 1) {
      if (!sim.canRun() || sim.full) return null;
      let changed = 0;
      let k = 0;
      while (k < n) {
        const res = P.step(table);
        if (!res) break;
        changed += res.changed;
        k++;
        if (P.size > MAX_TILES) break;
      }
      if (!k) return null;
      prevOk = true;
      return { alive: P.alive, changed, steps: k };
    },

    get: (x, y) => P.get(x, y),
    /** 칸 하나를 바꾸고 원래 값을 돌려준다. 규칙에 없는 상태는 받지 않는다 */
    set(x, y, v) {
      if (!(Number.isInteger(v) && v >= 0 && v < states())) return P.get(x, y);
      return P.set(x, y, v);
    },

    /** 그리기용: (x0, y0)–(x1, y1)(양 끝 포함)에 걸친 조각마다 fn(왼쪽 위 x, y, 너비, 높이, 지금 칸, 앞 세대 칸 | null) */
    blocks(x0, y0, x1, y1, fn) {
      const prev = prevOk;
      P.blocks(x0, y0, x1, y1, (ox, oy, s, cells, next) => fn(ox, oy, s, s, cells, prev ? next : null));
    },
    /** 빈칸이 아닌 칸을 모두 덮는 네모(양 끝 포함). 비었으면 null */
    bounds: () => P.bounds(),

    agents: NONE,
    head: null,
    /** 산 칸(상태 1) 수 */
    get alive() {
      return P.alive;
    },
    /** 쓰고 있는 조각 수(넓게 퍼질수록 커진다) */
    get size() {
      return P.size;
    },

    snapshot: () => ({ family: "life", states: states(), cells: P.snapshot() }),
    /** 떠 둔 모습으로. 그사이 상태 수가 줄었으면 없어진 상태의 칸은 빈칸이 된다 */
    restore(snap) {
      P.restore(snap.cells);
      if (snap.states > states()) P.clampStates(states());
      prevOk = false;
    },

    /** 같은 계열 안에서 규칙만 바꾼다(칸은 그대로). 상태 수가 줄면 없어진 상태의 칸은 빈칸이 된다 */
    setRule(next) {
      if (next.family !== "life") throw new Error(`setRule: 계열이 달라요 (life → ${next.family}). 새 sim 을 만들어 주세요`);
      const fewer = next.states.length < r.states.length;
      r = next;
      table = makeTable(lifeRule(r));
      if (fewer) P.clampStates(states());
    },

    clear() {
      P.clear();
      prevOk = false;
    },

    /** 비우고 규칙 파일의 seed 대로 region 에 뿌린다 */
    seed(region, rng) {
      sim.clear();
      const s = r.seed ?? { type: "empty" };
      if (s.type === "random") fillRegion(P, region, s.density ?? 0.3, s.area ?? 1, rng);
      else if (s.type === "single") P.set(region.x + (region.w >> 1), region.y + (region.h >> 1), 1);
      else if (s.type === "rle") putRows(P, parseRLE(s.data).rows, ...regionCenter(region), states());
    },

    /** 비우고 region 에 무작위로 흩뿌린다. 규칙의 seed 가 random 이면 그 넓이(area) 안에만 */
    scatter(region, density, rng) {
      sim.clear();
      const s = r.seed;
      fillRegion(P, region, density, s && s.type === "random" ? (s.area ?? 1) : 1, rng);
    },

    /** 비우고 무늬(RLE 의 rows)를 (cx, cy) 가운데에 놓는다 */
    place(rows, cx = 0, cy = 0) {
      sim.clear();
      putRows(P, rows, cx, cy, states());
    },

    /** region 안의 산 칸과 빈칸을 뒤바꾼다(사라지는 중인 칸은 빈칸으로 본다) */
    invert(region) {
      for (let y = region.y; y < region.y + region.h; y++) for (let x = region.x; x < region.x + region.w; x++) P.set(x, y, P.get(x, y) === 1 ? 0 : 1);
      prevOk = false;
    },

    /**
     * 살펴보기: 칸 하나가 다음 세대에 어떻게 되는지.
     * { now, next, why, n(산 이웃 수), cells(이웃 8칸 자리) }. why 는 core/life.js 의 explain 과 같다
     *   born · stay · survive · die · fade · fading · gone
     */
    explain(x, y) {
      const cells = around(x, y);
      let n = 0;
      for (const [a, b] of cells) if (P.get(a, b) === 1) n++;
      const now = P.get(x, y);
      const e = lifeExplain(lifeRule(r), now, n);
      return { now, next: e.next, why: e.why, n, cells };
    },
  };
  return sim;
}
