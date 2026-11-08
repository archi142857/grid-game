// node --test 로 돈다. 개미·터마이트(family: "ant"): 작은 기준 구현과 견주고, 랭턴의 개미 고속도로를 확인한다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeSim, MAX_AGENTS } from "../web/js/core/sim.js";
import { parseTurns, antRuleProblem } from "../web/js/core/ant.js";
import { REACH } from "../web/js/core/plane.js";
import { checkRuleFile, FAMILIES } from "../web/js/core/rules.js";
import { makeRng } from "../web/js/core/rng.js";

const DIR = fileURLToPath(new URL("../web/data/rules/", import.meta.url));
const preset = (id) => checkRuleFile(JSON.parse(readFileSync(DIR + id + ".json", "utf8")), { families: FAMILIES }).rule;
const colors = (n) => Array.from({ length: n }, (_, i) => ({ name: String(i) }));
const antRule = (turns, extra = {}) => ({ ...preset("langtons-ant"), states: colors(turns.length), turns, ...extra });
const center = { x: -1, y: -1, w: 2, h: 2 }; // 가운데가 (0, 0)

/** 기준 구현: 칸은 Map, 개미는 놓인 차례대로 한 걸음씩 */
function reference(rule, steps, starts) {
  const k = rule.states.length;
  const cells = new Map();
  const ants = starts.map(([x, y, dir]) => ({ x, y, dir, state: 0 }));
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  const TURN = { N: 0, R: 1, U: 2, L: 3 };
  for (let s = 0; s < steps; s++) {
    for (const a of ants) {
      const key = `${a.x},${a.y}`;
      const c = cells.get(key) ?? 0;
      const [w, turn, next] = rule.machine ? rule.machine[a.state][c] : [(c + 1) % k, rule.turns[c], 0];
      a.dir = (a.dir + TURN[turn]) % 4;
      if (w) cells.set(key, w);
      else cells.delete(key);
      a.state = next;
      a.x += DX[a.dir];
      a.y += DY[a.dir];
    }
  }
  return {
    cells: [...cells].map(([key, v]) => `${key},${v}`).sort().join(" "),
    ants: ants.map((a) => ({ ...a })),
  };
}

function dump(sim) {
  const out = [];
  const b = sim.bounds();
  if (b)
    sim.blocks(b.x0, b.y0, b.x1, b.y1, (ox, oy, w, h, cells, prev) => {
      assert.equal(prev, null, "개미는 앞 칸을 주지 않는다");
      for (let i = 0; i < w * h; i++) if (cells[i]) out.push(`${ox + (i % w)},${oy + Math.floor(i / w)},${cells[i]}`);
    });
  return out.sort().join(" ");
}

function run(rule, steps, starts) {
  const sim = makeSim(rule);
  sim.clear();
  for (const [x, y, dir] of starts) sim.addAgent(x, y, dir);
  let done = 0;
  while (done < steps) done += sim.step(Math.min(997, steps - done)).steps;
  return sim;
}

test("개미와 터마이트가 기준 구현과 똑같이 걷는다", () => {
  const cases = [
    [antRule("RL"), 12000, [[0, 0, 0]]],
    [antRule("LLRR"), 6000, [[3, -2, 1]]],
    [antRule("LRRRRRLLR"), 6000, [[0, 0, 2]]],
    [antRule("RLR"), 4000, [[-50, 40, 3]]],
    [antRule("LNRUL"), 4000, [[0, 0, 0]]],
    [preset("fibonacci-turmite"), 6000, [[0, 0, 0]]],
    // 여럿: 둘은 같은 칸에서 시작한다(뒤 개미는 앞 개미가 칠한 색을 본다)
    [antRule("RL"), 3000, [[0, 0, 0], [0, 0, 1], [5, 3, 2]]],
    [preset("fibonacci-turmite"), 3000, [[0, 0, 0], [2, 0, 0], [-4, 7, 3]]],
  ];
  for (const [rule, steps, starts] of cases) {
    const sim = run(rule, steps, starts);
    const ref = reference(rule, steps, starts);
    const name = rule.turns ?? rule.id;
    assert.equal(dump(sim), ref.cells, `${name} 칸`);
    assert.deepEqual(
      sim.agents.map((a) => ({ ...a })),
      ref.ants,
      `${name} 개미`,
    );
    assert.equal(sim.alive, ref.cells ? ref.cells.split(" ").length : 0, `${name} 빈칸 아닌 칸 수`);
  }
});

test("랭턴의 개미는 1만 걸음쯤 뒤에 104걸음마다 대각선으로 두 칸씩 나아가는 고속도로를 깐다", () => {
  const sim = run(preset("langtons-ant"), 10400, [[0, 0, 0]]);
  let last = { ...sim.agents[0], alive: sim.alive };
  for (let k = 0; k < 6; k++) {
    sim.step(104);
    const a = sim.agents[0];
    const dx = a.x - last.x;
    const dy = a.y - last.y;
    assert.deepEqual([Math.abs(dx), Math.abs(dy), a.dir, sim.alive - last.alive], [2, 2, last.dir, 12], `${k}번째 104걸음`);
    last = { ...a, alive: sim.alive };
  }
});

test("규칙 파일의 개미는 놓는 곳 가운데에, 흩뿌리기는 색을 무작위로", () => {
  const sim = makeSim({ ...preset("ant-llrr"), agents: [{ x: 0, y: 0, dir: "N" }, { x: 3, y: -1, dir: "W" }] });
  sim.seed({ x: 10, y: 20, w: 40, h: 30 }, makeRng(1));
  assert.deepEqual(
    sim.agents.map((a) => [a.x, a.y, a.dir, a.state]),
    [
      [30, 35, 0, 0],
      [33, 34, 3, 0],
    ],
  );
  assert.equal(sim.alive, 0);
  sim.scatter({ x: 0, y: 0, w: 30, h: 30 }, 0.5, makeRng(2));
  const seen = new Set(dump(sim).split(" ").map((s) => s.split(",")[2]));
  assert.deepEqual([...seen].sort(), ["1", "2", "3"], "빈칸이 아닌 세 색이 다 나온다");
  assert.equal(sim.agents.length, 2, "흩뿌려도 규칙 파일의 개미를 다시 놓는다");
  sim.place([[1, 2, 3, 9]], 0, 0);
  assert.equal(dump(sim), "-1,0,2 -2,0,1 0,0,3", "무늬를 놓을 때 규칙에 없는 색은 버린다");
  sim.clear();
  assert.deepEqual([sim.agents.length, sim.alive, sim.bounds()], [0, 0, null]);
});

test("개미 놓기 손: 놓고, 돌리고, 치운다", () => {
  const sim = makeSim(preset("langtons-ant"));
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(() => sim.cycleAgent(4, 5)),
    ["add", "turn", "turn", "turn", "remove"],
  );
  assert.equal(sim.agents.length, 0);
  for (let i = 0; i < MAX_AGENTS; i++) assert.equal(sim.addAgent(i, 0), i);
  assert.equal(sim.addAgent(-1, -1), -1, `개미는 ${MAX_AGENTS}마리까지`);
  assert.equal(sim.cycleAgent(-1, -1), null);
  assert.equal(sim.agentAt(10, 0), 10);
  assert.equal(sim.turnAgent(10, 3), 3);
  assert.equal(sim.removeAgent(10), true);
  assert.equal(sim.agentAt(10, 0), -1);
  assert.deepEqual(sim.bounds(), { x0: 0, y0: 0, x1: MAX_AGENTS - 1, y1: 0 }, "네모는 개미 자리까지 덮는다");
});

test("살펴보기: 개미가 밟은 칸은 다음 걸음에 칠하고, 없는 칸은 그대로", () => {
  const sim = makeSim(preset("ant-llrr"));
  sim.clear();
  sim.set(2, 2, 2);
  sim.addAgent(2, 2, 0);
  assert.deepEqual(sim.explain(2, 2), { now: 2, next: 3, why: "ant", agent: 0, turn: "R", write: 3, state: 0, cells: [] });
  assert.deepEqual(sim.explain(0, 0), { now: 0, next: 0, why: "wait", agent: -1, turn: "L", write: 1, state: null, cells: [] });
  const tm = makeSim(preset("fibonacci-turmite"));
  assert.equal(tm.explain(9, 9).turn, null, "터마이트는 개미가 없으면 무엇을 할지 모른다");
  tm.clear();
  tm.addAgent(0, 0);
  tm.step();
  assert.deepEqual(tm.explain(-1, 0), { now: 0, next: 1, why: "ant", agent: 0, turn: "R", write: 1, state: 1, cells: [] });
});

test("떠 두기·되돌리기와 규칙 바꾸기", () => {
  const sim = run(preset("ant-lrrrrrllr"), 3000, [[0, 0, 0]]);
  const snap = sim.snapshot();
  const before = [dump(sim), JSON.stringify(sim.agents)];
  sim.step(500);
  sim.addAgent(50, 50);
  sim.restore(snap);
  assert.deepEqual([dump(sim), JSON.stringify(sim.agents)], before);
  sim.setRule(preset("langtons-ant"));
  assert.ok(dump(sim).split(" ").every((c) => c.endsWith(",1")), "색이 줄면 없어진 색은 빈칸");
  assert.equal(sim.agents.length, 1, "개미는 그대로");
  assert.throws(() => sim.setRule({ ...preset("ant-llrr"), family: "life" }), /계열/);
  const tm = run(preset("fibonacci-turmite"), 7, [[0, 0, 0]]);
  assert.equal(tm.agents[0].state, 1);
  tm.setRule(preset("langtons-ant"));
  assert.equal(tm.agents[0].state, 0, "속 상태가 없는 규칙으로 바꾸면 0");
});

test("칸을 둘 수 있는 끝 밖으로 나가면 멈춘다", () => {
  const sim = makeSim(antRule("NN"));
  sim.clear();
  sim.addAgent(REACH - 2, 0, 1);
  assert.equal(sim.step().steps, 1);
  assert.equal(sim.full, false);
  assert.equal(sim.step(5).steps, 1, "끝을 넘은 걸음에서 멈춘다");
  assert.equal(sim.full, true);
  assert.equal(sim.step(), null);
  sim.clear();
  assert.equal(sim.full, false);
});

test("개미 표기와 규칙 검사", () => {
  assert.equal(parseTurns("llrr"), "LLRR");
  assert.equal(parseTurns(" R L "), "RL");
  for (const s of ["", "L", "LX", "B3/S23", "R".repeat(17)]) assert.equal(parseTurns(s), null, s);
  assert.equal(antRuleProblem({ turns: "RL" }, 2), null);
  assert.equal(antRuleProblem({ turns: "RL" }, 3), "turns");
  assert.equal(antRuleProblem({}, 2), "none");
  assert.equal(antRuleProblem({ turns: "RL", machine: [] }, 2), "both");
  assert.equal(antRuleProblem({ machine: [[[1, "L", 1], [0, "R", 0]]] }, 2), "machine", "다음 상태가 없는 상태");
  assert.equal(antRuleProblem({ machine: [[[2, "L", 0], [0, "R", 0]]] }, 2), "machine", "없는 색");
  assert.equal(antRuleProblem({ machine: [[[1, "X", 0], [0, "R", 0]]] }, 2), "machine", "없는 회전 글자");
});
