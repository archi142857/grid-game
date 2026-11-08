// node --test 로 돈다. 조건표(family: "table"): 와이어월드 회로의 주기, Life 를 조건표로 적은 것, 세는 상태가 둘일 때 기준 구현과 견주기.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeSim } from "../web/js/core/sim.js";
import { compileTable, tableProblem, countedStates } from "../web/js/core/table.js";
import { checkRuleFile, lockOf, FAMILIES } from "../web/js/core/rules.js";
import { makeRng } from "../web/js/core/rng.js";

const DIR = fileURLToPath(new URL("../web/data/rules/", import.meta.url));
const raw = (id) => JSON.parse(readFileSync(DIR + id + ".json", "utf8"));
const preset = (id) => checkRuleFile(raw(id), { families: FAMILIES }).rule;
const names = (n) => Array.from({ length: n }, (_, i) => ({ name: String(i) }));
const tableRule = (states, transitions, seed = { type: "empty" }) => ({ ...preset("wireworld"), states: names(states), transitions, seed });
const region = { x: -30, y: -20, w: 60, h: 40 };

function dump(sim) {
  const out = [];
  const b = sim.bounds();
  if (b)
    sim.blocks(b.x0, b.y0, b.x1, b.y1, (ox, oy, w, h, cells) => {
      for (let i = 0; i < w * h; i++) if (cells[i]) out.push(`${ox + (i % w)},${oy + Math.floor(i / w)},${cells[i]}`);
    });
  return out.sort().join(" ");
}

/** 기준 구현: 칸을 Map 에 두고 칸마다 줄을 위에서부터 본다. 빈 곳은 바뀌지 않으므로(잠그지 않은 규칙) 칸 둘레만 보면 된다 */
function reference(rule, start, gens) {
  let cells = new Map(start.map(([x, y, v]) => [`${x},${y}`, v]));
  const get = (m, x, y) => m.get(`${x},${y}`) ?? 0;
  for (let g = 0; g < gens; g++) {
    const look = new Set();
    for (const key of cells.keys()) {
      const [x, y] = key.split(",").map(Number);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) look.add(`${x + dx},${y + dy}`);
    }
    const next = new Map();
    for (const key of look) {
      const [x, y] = key.split(",").map(Number);
      const now = get(cells, x, y);
      let to = now;
      for (const tr of rule.transitions) {
        if (tr.from !== now) continue;
        if (tr.when) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && get(cells, x + dx, y + dy) === tr.when.state) n++;
          if (!tr.when.count.includes(n)) continue;
        }
        to = tr.to;
        break;
      }
      if (to) next.set(key, to);
    }
    cells = next;
  }
  return [...cells].map(([key, v]) => `${key},${v}`).sort().join(" ");
}

function soup(seed, states, density = 0.4) {
  const rng = makeRng(seed);
  const out = [];
  for (let y = -12; y < 20; y++) for (let x = -40; x < 6; x++) if (rng.next() < density) out.push([x, y, 1 + rng.int(states - 1)]);
  return out;
}

function run(rule, start, gens) {
  const sim = makeSim(rule);
  for (const [x, y, v] of start) sim.set(x, y, v);
  for (let g = 0; g < gens; g++) assert.ok(sim.step(), `${g}세대`);
  return sim;
}

test("와이어월드: 도는 회로가 8세대마다 전자를 내보내고, 그 뒤로는 8세대 주기다", () => {
  const sim = makeSim(preset("wireworld"));
  sim.seed(region, makeRng(1));
  assert.equal(sim.family, "table");
  assert.equal(sim.canRun(), true);
  assert.equal(dump(sim).split(" ").length, 32, "칸 32개(머리 1, 꼬리 1, 도선 30)");
  for (let g = 0; g < 40; g++) sim.step();
  const at40 = dump(sim);
  sim.step(4);
  assert.notEqual(dump(sim), at40);
  sim.step(4);
  assert.equal(dump(sim), at40, "8세대 뒤 같은 모습");
  assert.equal(sim.alive, 4, "전자 머리 넷(고리에 하나, 나가는 도선에 셋)");
});

test("Life 를 조건표로 적으면 Life 와 똑같이 돈다", () => {
  const life = preset("conway-life");
  const asTable = tableRule(2, [
    { from: 0, to: 1, when: { state: 1, count: [3] } },
    { from: 1, to: 0, when: { state: 1, count: [0, 1, 4, 5, 6, 7, 8] } },
  ]);
  assert.equal(compileTable(asTable.transitions, 2).weights, null, "산 칸만 세면 Life 와 같은 빠른 길");
  const a = makeSim(life);
  const b = makeSim(asTable);
  a.seed(region, makeRng(9));
  b.restore({ ...a.snapshot(), family: "table" });
  for (let g = 0; g < 60; g++) {
    a.step();
    b.step();
  }
  assert.equal(dump(b), dump(a));
  assert.equal(b.alive, a.alive);
});

test("세는 상태가 하나(1 이 아닌 것)이거나 둘일 때도 기준 구현과 같다", () => {
  const rules = [
    // 상태 2 만 센다
    tableRule(3, [
      { from: 0, to: 2, when: { state: 2, count: [2, 3] } },
      { from: 2, to: 1, when: { state: 2, count: [0, 1, 4, 5, 6, 7, 8] } },
      { from: 1, to: 0 },
    ]),
    // 상태 2 와 3 을 센다(무게 1 과 9)
    tableRule(4, [
      { from: 0, to: 2, when: { state: 2, count: [2, 3] } },
      { from: 0, to: 3, when: { state: 3, count: [3] } },
      { from: 2, to: 3, when: { state: 3, count: [1, 2, 3, 4] } },
      { from: 3, to: 0, when: { state: 2, count: [0, 1, 5, 6, 7, 8] } },
      { from: 2, to: 1, when: { state: 2, count: [0, 6, 7, 8] } },
      { from: 1, to: 0 },
    ]),
    // 와이어월드에 무작위 칸
    preset("wireworld"),
  ];
  for (const [k, rule] of rules.entries()) {
    const start = soup(100 + k, rule.states.length);
    const gens = 50;
    const sim = run(rule, start, gens);
    assert.equal(dump(sim), reference(rule, start, gens), `규칙 ${k}`);
  }
  assert.deepEqual(countedStates(rules[1].transitions), [2, 3]);
  assert.equal(compileTable(rules[1].transitions, 4).stride, 81);
});

test("세는 상태를 바꾸는 규칙으로 갈아타도 가장자리를 다시 센다", () => {
  const first = tableRule(3, [{ from: 1, to: 1, when: { state: 1, count: [9] } }]); // 아무것도 안 바뀐다
  const second = tableRule(3, [
    { from: 0, to: 2, when: { state: 2, count: [1] } },
    { from: 2, to: 1 },
    { from: 1, to: 0 },
  ]);
  // 조각 경계(31|32)에 걸친 상태 2 칸
  const start = [
    [31, 5, 2],
    [32, 40, 2],
    [-1, -1, 2],
  ];
  const sim = run(first, start, 3);
  sim.setRule(second);
  for (let g = 0; g < 10; g++) sim.step();
  assert.equal(dump(sim), reference(second, start, 10));
  // 거꾸로: 상태 2 를 세는 규칙으로 한 세대 넘긴 뒤(이때 가장자리는 상태 2 로 센다) 산 칸(1)을 세는 규칙으로
  const quiet = tableRule(3, [{ from: 2, to: 0, when: { state: 2, count: [8] } }]); // 산 칸은 건드리지 않는다
  const third = tableRule(3, [
    { from: 0, to: 1, when: { state: 1, count: [1] } },
    { from: 1, to: 2 },
    { from: 2, to: 0 },
  ]);
  const ones = [
    [31, 5, 1],
    [-1, -1, 1],
  ];
  const back = run(quiet, ones, 1);
  back.setRule(third);
  for (let g = 0; g < 6; g++) back.step();
  assert.equal(dump(back), reference(third, ones, 6));
});

test("살펴보기는 맞는 줄과 센 수를 알려 준다", () => {
  const sim = makeSim(preset("wireworld"));
  sim.set(0, 0, 3);
  sim.set(1, 0, 1);
  sim.set(-1, 1, 3);
  assert.deepEqual(sim.explain(0, 0), {
    now: 3,
    next: 1,
    why: "row",
    row: 2,
    counts: { 1: 1 },
    n: 1,
    cells: sim.explain(0, 0).cells,
  });
  assert.equal(sim.explain(0, 0).cells.length, 8);
  assert.deepEqual([sim.explain(1, 0).row, sim.explain(1, 0).next], [0, 2]);
  assert.deepEqual([sim.explain(-1, 1).why, sim.explain(-1, 1).next], ["stay", 3], "머리가 이웃에 없는 도선은 그대로");
  assert.equal(sim.explain(5, 5).why, "stay");
  // 살펴본 값은 실제로 넘긴 값과 같다
  const rule = preset("wireworld");
  const s2 = run(rule, soup(7, 4, 0.5), 5);
  const want = [];
  for (let y = -12; y < 20; y++) for (let x = -40; x < 6; x++) want.push(s2.explain(x, y).next);
  s2.step();
  const got = [];
  for (let y = -12; y < 20; y++) for (let x = -40; x < 6; x++) got.push(s2.get(x, y));
  assert.deepEqual(got, want);
});

test("잠금과 규칙 검사", () => {
  assert.equal(tableProblem([{ from: 0, to: 1 }], 2).why, "lock", "이웃 없이 빈칸이 바뀐다");
  assert.equal(tableProblem([{ from: 0, to: 1, when: { state: 1, count: [0] } }], 2).why, "lock");
  assert.equal(tableProblem([{ from: 0, to: 1, when: { state: 1, count: [1] } }], 2), null);
  assert.equal(tableProblem([{ from: 1, to: 0, when: { state: 0, count: [3] } }], 2).why, "zero");
  assert.equal(
    tableProblem(
      [
        { from: 1, to: 2, when: { state: 1, count: [1] } },
        { from: 2, to: 3, when: { state: 2, count: [1] } },
        { from: 3, to: 1, when: { state: 3, count: [1] } },
      ],
      4,
    ).why,
    "many",
  );
  assert.equal(tableProblem([{ from: 1, to: 5 }], 4).why, "row");
  assert.equal(tableProblem([{ from: 1, to: 2, when: { state: 1, count: [9] } }], 4).why, "row");
  assert.equal(tableProblem("x", 4).why, "list");
  const base = raw("wireworld");
  const check = (rule) => checkRuleFile({ ...base, rule }, { families: FAMILIES }).errors?.join(" ") ?? "";
  assert.match(check({ transitions: [{ from: 0, to: 1 }] }), /이웃이 없는 빈칸/);
  assert.match(check({ transitions: [{ from: 1, to: 9 }] }), /rule\.transitions\[0\]/);
  assert.match(check({ transitions: [{ from: 1, to: 2, when: { state: 0, count: [1] } }] }), /빈칸\(0\)은 셀 수 없어요/);
  assert.match(check({ transitions: Array.from({ length: 65 }, () => ({ from: 1, to: 2 })) }), /64개까지/);
  assert.match(checkRuleFile({ ...base, neighborhood: "hex" }, { families: FAMILIES }).errors.join(" "), /neighborhood/);
  assert.equal(lockOf(tableRule(2, [{ from: 0, to: 1 }])), "empty");
  assert.equal(lockOf(preset("wireworld")), null);
  const locked = makeSim(tableRule(2, [{ from: 0, to: 1 }]));
  assert.equal(locked.canRun(), false);
  assert.equal(locked.step(), null);
});

test("흩뿌리기는 빈칸이 아닌 상태를 무작위로, 상태 수를 줄이면 없어진 상태는 빈칸", () => {
  const sim = makeSim(preset("wireworld"));
  sim.scatter({ x: 0, y: 0, w: 30, h: 30 }, 0.6, makeRng(4));
  const seen = new Set(dump(sim).split(" ").map((s) => s.split(",")[2]));
  assert.deepEqual([...seen].sort(), ["1", "2", "3"]);
  sim.setRule({ ...preset("wireworld"), states: names(2), transitions: [{ from: 1, to: 0 }] });
  assert.ok(dump(sim).split(" ").every((s) => s.endsWith(",1")));
  assert.throws(() => sim.setRule(preset("conway-life")), /계열/);
});
