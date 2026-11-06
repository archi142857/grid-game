// 격자 하나와 그 규칙, 세대 수, 기록(세대마다 산 칸·바뀐 칸 수). 첫 화면·규칙 화면·도감 칸이 함께 쓴다.
// '처음으로'는 0세대에서 넘기기 시작한 순간의 칸(origin)으로 돌아간다.

import { makeTable, stepLife } from "../core/life.js";
import { makeGrid, resizeGrid, seedGrid, fillRandom, placeRows, clampStates, countAlive, invertCells } from "../core/grid.js";
import { makeRng, randomSeed } from "../core/rng.js";
import { lifeRule } from "../core/rules.js";

export function makeWorld(rule, { w, h, seed = randomSeed(), keep = 600 } = {}) {
  const W = {
    rule,
    table: makeTable(lifeRule(rule)),
    grid: makeGrid(w, h),
    seed: seed >>> 0,
    gen: 0,
    origin: null,
    alive: [0],
    changed: [0],
    start: 0, // alive[0] 이 몇 세대의 값인지
    prevOk: false, // grid.next 에 바로 앞 세대가 들어 있는가

    wrap: () => W.rule.grid.edges === "wrap",

    /** 규칙만 바꾼다(칸은 그대로). 상태 수가 줄면 없어진 상태의 칸은 빈칸이 된다 */
    setRule(r) {
      const fewer = r.states.length < W.rule.states.length;
      W.rule = r;
      W.table = makeTable(lifeRule(r));
      if (fewer) {
        clampStates(W.grid.cells, r.states.length);
        if (W.origin) clampStates(W.origin, r.states.length);
        W.touched();
      }
    },

    /** 규칙 파일의 seed 대로 다시 시작한다. 씨앗 번호가 같으면 같은 모습 */
    reseed(n = W.seed) {
      W.seed = n >>> 0;
      seedGrid(W.grid, W.rule.seed, makeRng(W.seed), W.rule.states.length);
      W.origin = null;
      W.restart();
    },

    /** 무작위로 흩뿌린다. 규칙의 seed 가 random 이면 그 범위(area) 안에만 */
    scatter(density, n = randomSeed()) {
      W.seed = n >>> 0;
      const s = W.rule.seed;
      fillRandom(W.grid, makeRng(W.seed), density, s.type === "random" ? (s.area ?? 1) : 1);
      W.origin = null;
      W.restart();
    },

    clear() {
      W.grid.cells.fill(0);
      W.origin = null;
      W.restart();
    },

    /** 비우고 가운데에 무늬를 놓는다 */
    place(rows) {
      W.grid.cells.fill(0);
      placeRows(W.grid, rows, W.rule.states.length);
      W.origin = null;
      W.restart();
    },

    invert() {
      invertCells(W.grid.cells);
      W.prevOk = false;
      W.touched();
    },

    resize(nw, nh) {
      if (nw === W.grid.w && nh === W.grid.h) return;
      const old = W.grid;
      W.grid = resizeGrid(old, nw, nh);
      if (W.origin) W.origin = resizeGrid({ w: old.w, h: old.h, cells: W.origin }, nw, nh).cells;
      W.prevOk = false;
      W.touched();
    },

    /** 0세대부터 다시 센다 */
    restart() {
      W.prevOk = false;
      W.gen = 0;
      W.alive = [countAlive(W.grid.cells)];
      W.changed = [0];
      W.start = 0;
    },

    /** 손으로 칸을 바꾼 뒤. 0세대면 처음 모습도 바뀐 것으로 본다 */
    touched() {
      if (W.gen === 0) {
        W.origin = null;
        W.alive = [countAlive(W.grid.cells)];
      } else W.alive[W.alive.length - 1] = countAlive(W.grid.cells);
    },

    step() {
      const g = W.grid;
      if (W.gen === 0) W.origin = g.cells.slice();
      const { alive, changed } = stepLife(g.cells, g.next, g.w, g.h, W.table, W.wrap());
      const done = g.cells;
      g.cells = g.next;
      g.next = done;
      W.prevOk = true;
      W.gen++;
      W.alive.push(alive);
      W.changed.push(changed);
      if (W.alive.length > keep) {
        W.alive.shift();
        W.changed.shift();
        W.start++;
      }
      return changed;
    },

    /** 처음으로: 0세대의 모습으로 */
    back() {
      if (!W.origin) return false;
      W.grid.cells.set(W.origin);
      W.restart();
      return true;
    },

    get cells() {
      return W.grid.cells;
    },
    /** 바로 앞 세대의 칸(없으면 null). 세대 사이를 이어 그릴 때 쓴다 */
    get prev() {
      return W.prevOk ? W.grid.next : null;
    },
    get count() {
      return W.alive[W.alive.length - 1];
    },
    get lastChanged() {
      return W.changed[W.changed.length - 1];
    },
  };
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
