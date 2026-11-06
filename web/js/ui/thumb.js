// 작은 격자 그림: 늘 같은 씨앗에서 몇 세대 넘긴 모습으로 서 있다가, 올리거나 고르면 움직인다.
// 도감 칸과 '다른 규칙 써 보기' 칸이 함께 쓴다.

import { h, reducedMotion } from "./dom.js";
import { makeWorld, seedOf } from "./world.js";
import { makeBoard } from "./board.js";
import { makeLoop } from "./loop.js";
import { boardColors } from "./theme.js";

export function makeThumb(rule, { w = 26, h: hh = 26, gens = 30, key = rule.id, rate = 8 } = {}) {
  const canvas = h("canvas", { "aria-hidden": "true" });
  const world = makeWorld(rule, { w, h: hh, seed: seedOf(key) });
  world.reseed();
  for (let i = 0; i < gens; i++) world.step();
  const board = makeBoard(canvas, { onResize: () => draw(1) });
  const draw = (q) => board.draw(world.cells, world.prev, { t: q });
  const loop = makeLoop({
    step: () => {
      world.step();
      if (world.count === 0) world.reseed(world.seed + 1);
    },
    draw,
    rate: () => rate,
  });
  const recolor = () => {
    board.setColors(boardColors(rule.states), rule.states.length);
    draw(1);
  };
  board.setGrid(w, hh);
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
