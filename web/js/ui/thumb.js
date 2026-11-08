// 작은 격자 그림: 늘 같은 씨앗에서 몇 세대 넘긴 모습으로 서 있다가, 올리거나 고르면 움직인다.
// 도감 칸과 '다른 규칙 써 보기' 칸이 함께 쓴다. 그림은 작은 판의 맞은편 가장자리를 이어 붙여(토러스) 늘 판이 꽉 찬 채로 돌린다.

import { h, reducedMotion } from "./dom.js";
import { seedOf } from "./world.js";
import { makeBoard } from "./board.js";
import { makeLoop } from "./loop.js";
import { boardColors } from "./theme.js";
import { makeGrid, seedGrid, countAlive } from "../core/grid.js";
import { makeTable, stepLife } from "../core/life.js";
import { makeRng } from "../core/rng.js";
import { lifeRule } from "../core/rules.js";

export function makeThumb(rule, { w = 26, h: hh = 26, gens = 30, key = rule.id, rate = 8 } = {}) {
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

/** 올리거나 키보드로 고르면 움직이게 묶는다 */
export function hoverPlay(el, th) {
  el.addEventListener("pointerenter", th.play);
  el.addEventListener("pointerleave", th.pause);
  el.addEventListener("focusin", th.play);
  el.addEventListener("focusout", th.pause);
  return el;
}
