// 끝없는 격자: 조각 경계를 넘나드는 무늬가 큰 벽 격자(무늬가 벽에 닿기 전까지는 끝없는 격자와 같다)와 똑같이 움직이는지 본다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makePlane, TILE } from "../web/js/core/plane.js";
import { makeTable, stepLife } from "../web/js/core/life.js";
import { makeRng } from "../web/js/core/rng.js";

const LIFE = { birth: [3], survive: [2, 3], states: 2 };

/** 칸 목록 [[x, y, 상태]…] 을 정렬된 글로 */
const dump = (cells) =>
  cells
    .map(([x, y, v]) => `${x},${y},${v}`)
    .sort()
    .join(" ");

function planeCells(p) {
  const out = [];
  p.each((x, y, v) => out.push([x, y, v]));
  return out;
}

/** 같은 시작 모습을 벽 격자로 돌린 기준 답. 무늬가 gens 세대 동안 빛의 빠르기(세대당 한 칸)로 자라도 닿지 않을 만큼 넓게 잡는다 */
function reference(start, rule, gens) {
  const xs = start.map((c) => c[0]);
  const ys = start.map((c) => c[1]);
  const pad = gens + 3;
  const ox = Math.min(...xs) - pad;
  const oy = Math.min(...ys) - pad;
  const w = Math.max(...xs) - ox + pad + 1;
  const h = Math.max(...ys) - oy + pad + 1;
  let a = new Uint8Array(w * h);
  let b = new Uint8Array(w * h);
  for (const [x, y, v] of start) a[(y - oy) * w + (x - ox)] = v;
  const table = makeTable(rule);
  for (let g = 0; g < gens; g++) {
    stepLife(a, b, w, h, table, false);
    [a, b] = [b, a];
  }
  const out = [];
  for (let i = 0; i < w * h; i++) if (a[i]) out.push([(i % w) + ox, Math.floor(i / w) + oy, a[i]]);
  return out;
}

function run(start, rule, gens) {
  const p = makePlane();
  for (const [x, y, v] of start) p.set(x, y, v);
  const table = makeTable(rule);
  for (let g = 0; g < gens; g++) p.step(table);
  return p;
}

test("깜빡이가 조각 경계에 걸쳐도 두 모습을 오간다", () => {
  const e = TILE - 1; // 조각 네 개가 만나는 자리
  const start = [
    [e, e, 1],
    [e + 1, e, 1],
    [e + 2, e, 1],
  ];
  const p = run(start, LIFE, 1);
  assert.equal(dump(planeCells(p)), dump([[e + 1, e - 1, 1], [e + 1, e, 1], [e + 1, e + 1, 1]]));
  p.step(makeTable(LIFE));
  assert.equal(dump(planeCells(p)), dump(start));
  assert.equal(p.alive, 3);
});

test("글라이더가 음수 좌표의 조각들을 지나 200세대를 날아간다", () => {
  const glider = [
    [1, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ].map(([x, y]) => [x - 40, y - 40, 1]);
  const p = run(glider, LIFE, 200);
  assert.equal(dump(planeCells(p)), dump(reference(glider, LIFE, 200)));
  assert.equal(p.alive, 5);
  // 글라이더 하나가 쓰는 조각은 많아야 넷(+지나온 자리 정리 중인 것 몇 개)
  assert.ok(p.size <= 9, `조각 ${p.size}개`);
});

test("여러 규칙의 무작위 무늬가 기준 답과 같다", () => {
  const rules = [
    LIFE,
    { birth: [3, 6], survive: [2, 3], states: 2 },
    { birth: [2], survive: [], states: 2 },
    { birth: [2], survive: [], states: 3 },
    { birth: [2], survive: [3, 4, 5], states: 4 },
    { birth: [3, 6, 7, 8], survive: [3, 4, 6, 7, 8], states: 2 },
    { birth: [1], survive: [1], states: 2 },
  ];
  for (const rule of rules) {
    const rng = makeRng(rule.birth.join("") * 7 + rule.states);
    const start = [];
    for (let y = -20; y < 25; y++) for (let x = -30; x < 18; x++) if (rng.next() < 0.35) start.push([x, y, 1]);
    const gens = 60;
    const p = run(start, rule, gens);
    assert.equal(dump(planeCells(p)), dump(reference(start, rule, gens)), JSON.stringify(rule));
    const live = planeCells(p).filter((c) => c[2] === 1).length;
    assert.equal(p.alive, live);
  }
});

test("태어남에 0 이 있으면 돌리지 않는다", () => {
  const p = makePlane();
  p.set(0, 0, 1);
  assert.equal(p.step(makeTable({ birth: [0, 3], survive: [2, 3], states: 2 })), null);
  assert.equal(p.alive, 1);
});

test("다 죽은 조각은 한 세대 뒤에 치운다", () => {
  const p = makePlane();
  p.set(100, -100, 1);
  const table = makeTable(LIFE);
  p.step(table);
  assert.equal(p.alive, 0);
  assert.ok(p.size > 0, "사라지는 모습을 그리게 한 세대는 둔다");
  p.step(table);
  assert.equal(p.size, 0);
});

test("세는 수와 네모, 떠 두기와 되돌리기", () => {
  const p = makePlane();
  for (const [x, y] of [
    [-5, 7],
    [40, -3],
    [12, 70],
  ])
    p.set(x, y, 1);
  p.set(3, 3, 2);
  assert.equal(p.alive, 3);
  assert.deepEqual(p.bounds(), { x0: -5, y0: -3, x1: 40, y1: 70 });
  const snap = p.snapshot();
  p.clear();
  assert.equal(p.bounds(), null);
  p.restore(snap);
  assert.equal(p.alive, 3);
  assert.equal(p.get(3, 3), 2);
  assert.equal(p.get(40, -3), 1);
  p.set(40, -3, 0);
  assert.equal(p.alive, 2);
  p.clampStates(2);
  assert.equal(p.get(3, 3), 0);
});
