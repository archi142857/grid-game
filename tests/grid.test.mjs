// node --test 로 돈다. 격자 도구와 RLE 읽기.

import test from "node:test";
import assert from "node:assert/strict";
import { makeGrid, resizeGrid, fillRandom, placeRows, seedGrid, census, clampStates } from "../web/js/core/grid.js";
import { parseRLE } from "../web/js/core/rle.js";
import { makeRng } from "../web/js/core/rng.js";

test("RLE: 글라이더, 머리줄의 규칙, 설명 줄", () => {
  const p = parseRLE("#N Glider\n#C 설명\nx = 3, y = 3, rule = B3/S23\nbo$2bo$3o!");
  assert.equal(p.rule, "B3/S23");
  assert.deepEqual([p.w, p.h], [3, 3]);
  assert.deepEqual(p.rows, [
    [0, 1],
    [0, 0, 1],
    [1, 1, 1],
  ]);
});

test("RLE: 여러 상태, 여러 줄에 걸친 본문, 빈 줄 되풀이", () => {
  assert.deepEqual(parseRLE(".BAC$C3.7C$.3C!").rows, [
    [0, 2, 1, 3],
    [3, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3],
    [0, 3, 3, 3],
  ]);
  const p = parseRLE("x = 3, y = 4\n3o2$\n3o!");
  assert.deepEqual(p.rows, [[1, 1, 1], [], [1, 1, 1]]);
  assert.equal(p.h, 4, "머리줄의 높이를 따른다");
  assert.deepEqual(parseRLE("2o\n2o!").rows, [[1, 1, 1, 1]], "줄 바꿈은 $ 가 아니다");
});

test("같은 씨앗이면 같은 무작위 시작, area 는 가운데만 채운다", () => {
  const a = makeGrid(40, 30);
  const b = makeGrid(40, 30);
  fillRandom(a, makeRng(5), 0.5);
  fillRandom(b, makeRng(5), 0.5);
  assert.deepEqual(a.cells, b.cells);
  fillRandom(a, makeRng(5), 1, 0.5);
  assert.equal(census(a.cells, 2)[1], 20 * 15);
  for (let x = 0; x < 40; x++) assert.equal(a.cells[x], 0, "맨 윗줄은 빈칸");
});

test("무늬는 가운데에 놓이고, 넘치거나 없는 상태는 버린다", () => {
  const g = makeGrid(5, 5);
  placeRows(g, [[1, 1, 1]]);
  assert.deepEqual([...g.cells.slice(10, 15)], [0, 1, 1, 1, 0]);
  const small = makeGrid(2, 1);
  placeRows(small, [[1, 2, 1, 1]], 2);
  assert.deepEqual([...small.cells], [0, 1], "가운데 두 칸만, 상태 2 는 버림");
});

test("seed: single 은 가운데 한 칸, rle 는 가운데 무늬", () => {
  const g = makeGrid(7, 5);
  seedGrid(g, { type: "single" }, makeRng(1));
  assert.deepEqual(census(g.cells, 2), [34, 1]);
  assert.equal(g.cells[2 * 7 + 3], 1);
  seedGrid(g, { type: "rle", data: "3o!" }, makeRng(1));
  assert.deepEqual([...g.cells.slice(14, 21)], [0, 0, 1, 1, 1, 0, 0]);
  seedGrid(g, { type: "empty" }, makeRng(1));
  assert.equal(census(g.cells, 2)[1], 0);
});

test("크기를 바꿔도 가운데 무늬는 그대로", () => {
  const g = makeGrid(5, 5);
  placeRows(g, [[1, 1, 1]]);
  const big = resizeGrid(g, 9, 7);
  assert.deepEqual([...big.cells.slice(3 * 9, 4 * 9)], [0, 0, 0, 1, 1, 1, 0, 0, 0]);
  const back = resizeGrid(big, 5, 5);
  assert.deepEqual(back.cells, g.cells);
});

test("상태 수를 줄이면 없어진 상태는 빈칸이 된다", () => {
  const cells = Uint8Array.from([0, 1, 2, 3, 1]);
  clampStates(cells, 2);
  assert.deepEqual([...cells], [0, 1, 0, 0, 1]);
});
