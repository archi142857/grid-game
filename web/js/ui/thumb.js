// 작은 격자 그림: 늘 같은 씨앗에서 몇 세대 넘긴 모습으로 서 있다가, 올리거나 고르면 움직인다.
// 도감 칸과 '다른 규칙 써 보기' 칸이 함께 쓴다. Life 계열 그림은 작은 판의 맞은편 가장자리를 이어 붙여(토러스) 늘 판이 꽉 찬 채로 돌린다.
// 다른 계열(개미·1차원·조건표)은 끝없는 격자의 sim 을 그만큼 돌린 모습을 판에 꼭 맞게 보인다.

import { h, reducedMotion } from "./dom.js";
import { makeWorld, regionAt, seedOf } from "./world.js";
import { makeBoard } from "./board.js";
import { makeLoop } from "./loop.js";
import { boardColors } from "./theme.js";
import { makeGrid, seedGrid, countAlive } from "../core/grid.js";
import { makeTable, stepLife } from "../core/life.js";
import { makeRng } from "../core/rng.js";
import { lifeRule } from "../core/rules.js";

export function makeThumb(rule, opts = {}) {
  return rule.family && rule.family !== "life" ? makeSimThumb(rule, opts) : makeLifeThumb(rule, opts);
}

function makeLifeThumb(rule, { w = 26, h: hh = 26, gens = 30, key = rule.id, rate = 8 } = {}) {
  const canvas = h("canvas", { "aria-hidden": "true" });
  const grid = makeGrid(w, hh);
  const table = makeTable(lifeRule(rule));
  let seed = seedOf(key);
  let prevOk = false;

  const reseed = (n) => {
    seed = n >>> 0;
    seedGrid(grid, rule.seed, makeRng(seed), rule.states.length);
    prevOk = false;
  };
  const step = () => {
    stepLife(grid.cells, grid.next, w, hh, table, true);
    [grid.cells, grid.next] = [grid.next, grid.cells];
    prevOk = true;
  };
  const src = { blocks: (x0, y0, x1, y1, fn) => fn(0, 0, w, hh, grid.cells, prevOk ? grid.next : null) };

  reseed(seed);
  for (let i = 0; i < gens; i++) step();
  const board = makeBoard(canvas, { onResize: () => draw(1) });
  board.frame(w, hh);
  const draw = (q) => board.draw(src, { t: q });
  const loop = makeLoop({
    step: () => {
      step();
      if (countAlive(grid.cells) === 0) reseed(seed + 1);
    },
    draw,
    rate: () => rate,
  });
  const recolor = () => {
    board.setColors(boardColors(rule.states, rule.family));
    draw(1);
  };
  recolor();
  return {
    canvas,
    recolor,
    play: () => !reducedMotion() && loop.start(),
    pause: () => loop.stop(),
    destroy: () => {
      loop.cancel();
      board.disconnect();
    },
  };
}

/** 계열마다 그림의 처음 걸음 수와 빠르기(1초에). 개미는 한 장면에 몰아 넘긴다 */
// size: 처음 칠할 네모 한 변(순환은 넓어야 소용돌이가 나온다)
const SIM_THUMB = { ant: { gens: 6000, rate: 600, batch: true }, elementary: { gens: 48, rate: 16 }, table: { gens: 0, rate: 8 }, cyclic: { gens: 420, rate: 20, size: 72 } };

function makeSimThumb(rule, { gens, key = rule.id, rate } = {}) {
  const d = SIM_THUMB[rule.family] ?? { gens: 30, rate: 8 };
  const first = gens ?? d.gens;
  const speed = rate ?? d.rate;
  const canvas = h("canvas", { "aria-hidden": "true" });
  const world = makeWorld(rule, { keep: 2 });
  const region = regionAt(0, 0, d.size ?? 24, d.size ?? 24);
  let seed = seedOf(key);
  const reset = (n) => {
    seed = n >>> 0;
    world.reseed(seed, region);
    if (first) world.step(first);
  };
  reset(seed);
  const board = makeBoard(canvas, { onResize: () => draw(1) });
  // 칠한 곳(과 개미)이 모두 보이게 맞춘다
  function draw(q) {
    const b = world.bounds();
    if (b) board.fit({ x0: b.x0 - 1, y0: b.y0 - 1, x1: b.x1 + 1, y1: b.y1 + 1 }, { fill: 0.94, zmax: 8 });
    board.draw(world, { t: q });
  }
  const loop = makeLoop({
    step: (n = 1) => {
      if (!world.step(n)) reset(seed + 1);
    },
    draw,
    rate: () => speed,
    batch: () => !!d.batch,
  });
  const recolor = () => {
    board.setColors(boardColors(rule.states, rule.family));
    draw(1);
  };
  recolor();
  return {
    canvas,
    recolor,
    play: () => !reducedMotion() && loop.start(),
    pause: () => loop.stop(),
    destroy: () => {
      loop.cancel();
      board.disconnect();
    },
  };
}

/** 올리거나 키보드로 고르면 움직이게 묶는다 */
export function hoverPlay(el, th) {
  el.addEventListener("pointerenter", th.play);
  el.addEventListener("pointerleave", th.pause);
  el.addEventListener("focusin", th.play);
  el.addEventListener("focusout", th.pause);
  return el;
}
