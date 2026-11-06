// node --test 로 돈다. Life 계열 엔진: 표기 읽기·쓰기, 규칙표, 한 세대 넘기기, 까닭 풀이.

import test from "node:test";
import assert from "node:assert/strict";
import { parseNotation, formatNotation, makeTable, stepLife, liveNeighbors, neighborCells, explain } from "../web/js/core/life.js";
import { makeRng } from "../web/js/core/rng.js";

const grid = (w, h, cells = []) => {
  const g = new Uint8Array(w * h);
  for (const [x, y, s = 1] of cells) g[y * w + x] = s;
  return g;
};
const step = (g, w, h, rule, wrap = true) => {
  const out = new Uint8Array(w * h);
  stepLife(g, out, w, h, makeTable(rule), wrap);
  return out;
};
const LIFE = { birth: [3], survive: [2, 3], states: 2 };

test("표기를 여러 꼴로 읽는다", () => {
  const life = { birth: [3], survive: [2, 3], states: 2 };
  for (const s of ["B3/S23", "b3/s23", "B3S23", "S23/B3", "23/3", " B3 / S23 "]) assert.deepEqual(parseNotation(s), life, s);
  const brain = { birth: [2], survive: [], states: 3 };
  for (const s of ["B2/S/C3", "B2/S/3", "b2/s/c3", "/2/3", "B2/S/G3"]) assert.deepEqual(parseNotation(s), brain, s);
  assert.deepEqual(parseNotation("345/2/4"), { birth: [2], survive: [3, 4, 5], states: 4 });
  assert.deepEqual(parseNotation("B36/S32"), { birth: [3, 6], survive: [2, 3], states: 2 }, "차례를 맞추고");
  assert.deepEqual(parseNotation("B33/S2"), { birth: [3], survive: [2], states: 2 }, "겹친 숫자는 하나로");
});

test("못 읽는 표기는 null", () => {
  for (const s of ["", "B9/S23", "B3/S23/C1", "B3/S23/C256", "hello", "B3", "B3/S23/C", "3/4/5/6"]) assert.equal(parseNotation(s), null, s);
});

test("표기로 쓰기와 다시 읽기", () => {
  assert.equal(formatNotation(LIFE), "B3/S23");
  assert.equal(formatNotation({ birth: [2], survive: [], states: 3 }), "B2/S/C3");
  assert.equal(formatNotation({ birth: [8, 3, 6, 7], survive: [3, 4, 6, 7, 8] }), "B3678/S34678");
  for (const s of ["B3/S23", "B36/S23", "B2/S", "B3678/S34678", "B2/S345/C4", "B/S012345678"]) assert.equal(formatNotation(parseNotation(s)), s);
});

test("규칙표는 칸마다 풀이(explain)와 같다", () => {
  for (const rule of [LIFE, { birth: [2], survive: [], states: 3 }, { birth: [0, 2], survive: [3, 4, 5], states: 5 }]) {
    const table = makeTable(rule);
    for (let s = 0; s < rule.states; s++)
      for (let n = 0; n <= 8; n++) assert.equal(table[s * 9 + n], explain(rule, s, n).next, `${formatNotation(rule)} s=${s} n=${n}`);
  }
});

test("블링커는 2세대 주기, 블록은 그대로 (가장자리 이어 붙이기·벽 모두)", () => {
  for (const wrap of [true, false]) {
    const blinker = grid(5, 5, [
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
    const g1 = step(blinker, 5, 5, LIFE, wrap);
    assert.deepEqual(
      [...g1],
      [
        ...grid(5, 5, [
          [2, 1],
          [2, 2],
          [2, 3],
        ]),
      ],
    );
    assert.deepEqual([...step(g1, 5, 5, LIFE, wrap)], [...blinker]);
    const block = grid(4, 4, [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ]);
    assert.deepEqual([...step(block, 4, 4, LIFE, wrap)], [...block]);
  }
});

test("글라이더는 4세대마다 대각선으로 1칸 가고, 가장자리를 넘어 맞은편으로 나온다", () => {
  const shape = [
    [1, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ];
  let g = grid(8, 8, shape);
  for (let i = 0; i < 4; i++) g = step(g, 8, 8, LIFE);
  assert.deepEqual(
    [...g],
    [
      ...grid(
        8,
        8,
        shape.map(([x, y]) => [x + 1, y + 1]),
      ),
    ],
  );
  for (let i = 0; i < 4 * 7; i++) g = step(g, 8, 8, LIFE);
  assert.deepEqual([...g], [...grid(8, 8, shape)], "8칸 격자에서 32세대면 제자리");
});

test("벽이면 글라이더가 모서리에서 굳고 맞은편으로 넘어가지 않는다", () => {
  const shape = [
    [1, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ];
  let g = grid(
    8,
    8,
    shape.map(([x, y]) => [x + 4, y + 4]),
  );
  for (let i = 0; i < 40; i++) g = step(g, 8, 8, LIFE, false);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) assert.equal(g[y * 8 + x], 0);
  assert.deepEqual(
    [...g].reduce((a, s) => a + s, 0),
    4,
    "모서리에 블록 하나가 남는다",
  );
});

test("Generations: 산 칸이 살아남지 못하면 한 단계씩 사라진다", () => {
  const rule = { birth: [], survive: [], states: 4 };
  let g = grid(3, 3, [[1, 1]]);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    g = step(g, 3, 3, rule);
    seen.push(g[4]);
  }
  assert.deepEqual(seen, [2, 3, 0, 0]);
});

test("사라지는 칸은 이웃으로 세지 않는다", () => {
  const rule = { birth: [2], survive: [], states: 3 };
  const g = grid(5, 5, [
    [1, 2, 1],
    [3, 2, 2],
  ]);
  assert.equal(liveNeighbors(g, 5, 5, 2, 2, true), 1);
  assert.equal(step(g, 5, 5, rule)[2 * 5 + 2], 0);
});

test("무작위 격자에서 한 세대 넘기기는 칸마다 이웃 수·풀이와 같다", () => {
  const rng = makeRng(7);
  for (const rule of [LIFE, { birth: [2], survive: [], states: 3 }, { birth: [3, 6, 7, 8], survive: [3, 4, 6, 7, 8], states: 2 }]) {
    for (const wrap of [true, false]) {
      const w = 23;
      const h = 17;
      const g = new Uint8Array(w * h).map(() => rng.int(rule.states));
      const out = step(g, w, h, rule, wrap);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) assert.equal(out[y * w + x], explain(rule, g[y * w + x], liveNeighbors(g, w, h, x, y, wrap)).next);
    }
  }
});

test("이웃 자리: 감싸면 8칸, 벽 모서리면 3칸", () => {
  assert.equal(neighborCells(10, 10, 0, 0, true).length, 8);
  assert.deepEqual(neighborCells(10, 10, 0, 0, false).sort(), [
    [0, 1],
    [1, 0],
    [1, 1],
  ]);
});

test("풀이의 까닭", () => {
  assert.deepEqual(explain(LIFE, 0, 3), { next: 1, why: "born" });
  assert.deepEqual(explain(LIFE, 0, 2), { next: 0, why: "stay" });
  assert.deepEqual(explain(LIFE, 1, 2), { next: 1, why: "survive" });
  assert.deepEqual(explain(LIFE, 1, 4), { next: 0, why: "die" });
  const brain = { birth: [2], survive: [], states: 3 };
  assert.deepEqual(explain(brain, 1, 0), { next: 2, why: "fade" });
  assert.deepEqual(explain(brain, 2, 5), { next: 0, why: "gone" });
  assert.deepEqual(explain({ birth: [], survive: [], states: 4 }, 2, 0), { next: 3, why: "fading" });
});

test("한 세대를 넘기면 산 칸 수와 바뀐 칸 수를 돌려준다", () => {
  const w = 5;
  const h = 5;
  const src = new Uint8Array(w * h);
  for (const x of [1, 2, 3]) src[2 * w + x] = 1; // 가로 깜빡이
  const dst = new Uint8Array(w * h);
  const out = stepLife(src, dst, w, h, makeTable({ birth: [3], survive: [2, 3] }), false);
  assert.deepEqual(out, { alive: 3, changed: 4 });
});
