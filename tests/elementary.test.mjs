// node --test 로 돈다. 1차원 기본(family: "elementary"): 기준 구현과 견주기, 규칙 90 의 시에르핀스키 삼각형, 줄 지우기와 한도.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeSim, rowsKept, MAX_WIDTH, ROWS_MIN, ROWS_MAX } from "../web/js/core/sim.js";
import { parseWolfram, patternOf, nextOf, stepRow } from "../web/js/core/elementary.js";
import { checkRuleFile, parseCode, formatCode, lockOf, FAMILIES } from "../web/js/core/rules.js";
import { parseRLE } from "../web/js/core/rle.js";
import { makeRng } from "../web/js/core/rng.js";

const DIR = fileURLToPath(new URL("../web/data/rules/", import.meta.url));
const preset = (id) => checkRuleFile(JSON.parse(readFileSync(DIR + id + ".json", "utf8")), { families: FAMILIES }).rule;
const withNumber = (number, seed = { type: "single" }) => ({ ...preset("rule-30"), number, seed });
const center = { x: -50, y: -10, w: 100, h: 40 }; // 가운데 x = 0

/** 기준 구현: 줄마다 켜진 칸의 x 집합 */
function reference(number, start, steps) {
  let row = new Set(start);
  const rows = [row];
  for (let t = 0; t < steps; t++) {
    const next = new Set();
    if (row.size) {
      const xs = [...row];
      for (let x = Math.min(...xs) - 1; x <= Math.max(...xs) + 1; x++) {
        const p = (row.has(x - 1) ? 4 : 0) | (row.has(x) ? 2 : 0) | (row.has(x + 1) ? 1 : 0);
        if ((number >> p) & 1) next.add(x);
      }
    }
    rows.push(next);
    row = next;
  }
  return rows;
}

/** sim 의 줄 y 에서 켜진 칸의 x(작은 것부터) */
function rowOf(sim, y, x0, x1) {
  const out = [];
  for (let x = x0; x <= x1; x++) if (sim.get(x, y) === 1) out.push(x);
  return out;
}

test("여러 번호가 기준 구현과 같은 줄을 쌓는다", () => {
  const steps = 240;
  for (const number of [30, 90, 110, 54, 150, 184, 18, 0]) {
    for (const seed of [{ type: "single" }, { type: "random", density: 0.5, area: 0.6 }]) {
      const sim = makeSim(withNumber(number, seed));
      sim.seed(center, makeRng(number + 1));
      const start = rowOf(sim, 0, -60, 60);
      let done = 0;
      while (done < steps) done += sim.step(Math.min(37, steps - done)).steps;
      assert.equal(sim.head, steps);
      const ref = reference(number, start, steps);
      for (let t = 0; t <= steps; t += 1) {
        const want = [...ref[t]].sort((a, b) => a - b);
        assert.deepEqual(rowOf(sim, t, -steps - 70, steps + 70), want, `규칙 ${number} ${seed.type} ${t}세대`);
      }
      assert.equal(sim.alive, ref[steps].size, `규칙 ${number} 지금 줄의 켜진 칸`);
    }
  }
});

test("규칙 90 은 한 칸에서 시에르핀스키 삼각형을 그린다(파스칼 삼각형의 홀수 자리)", () => {
  const sim = makeSim(preset("rule-90"));
  sim.seed(center, makeRng(1));
  for (let t = 1; t <= 255; t++) {
    sim.step();
    const xs = rowOf(sim, t, -t - 2, t + 2);
    const want = [];
    // 칸 (x, t) 는 t+x 가 짝수이고 C(t, (t+x)/2) 가 홀수일 때, 곧 ((t+x)/2) & ((t-x)/2) 가 0 일 때 켜진다(뤼카의 정리)
    for (let x = -t; x <= t; x += 2) if ((((t + x) / 2) & ((t - x) / 2)) === 0) want.push(x);
    assert.deepEqual(xs, want, `${t}세대`);
    let ones = 0;
    for (let k = t; k; k >>= 1) ones += k & 1;
    assert.equal(sim.alive, 2 ** ones, `${t}세대의 켜진 칸 수는 2^(t 를 2진수로 썼을 때 1의 수)`);
  }
});

test("규칙 표: 무늬 번호와 한 줄 넘기기", () => {
  assert.equal(patternOf(1, 1, 1), 7);
  assert.equal(patternOf(1, 0, 0), 4);
  assert.equal(patternOf(0, 0, 1), 1);
  // 규칙 30: 100, 011, 010, 001 → 1
  assert.deepEqual(
    [7, 6, 5, 4, 3, 2, 1, 0].map((p) => nextOf(30, p)),
    [0, 0, 0, 1, 1, 1, 1, 0],
  );
  // 규칙 110: 110, 101, 011, 010, 001 → 1
  assert.deepEqual(
    [7, 6, 5, 4, 3, 2, 1, 0].map((p) => nextOf(110, p)),
    [0, 1, 1, 0, 1, 1, 1, 0],
  );
  assert.deepEqual([...stepRow(Uint8Array.from([0, 0, 1, 0, 0]), 30)], [1, 1, 1]);
});

test("홀수 번호는 잠그고, 표기는 W 번호", () => {
  const sim = makeSim(withNumber(31));
  sim.seed(center, makeRng(1));
  assert.equal(sim.canRun(), false);
  assert.equal(sim.step(), null);
  assert.match(checkRuleFile({ ...JSON.parse(readFileSync(DIR + "rule-30.json", "utf8")), rule: { number: 31 } }, { families: FAMILIES }).errors.join(" "), /홀수/);
  assert.match(checkRuleFile({ ...JSON.parse(readFileSync(DIR + "rule-30.json", "utf8")), rule: { number: 256 } }, { families: FAMILIES }).errors.join(" "), /rule\.number/);
  assert.match(
    checkRuleFile({ ...JSON.parse(readFileSync(DIR + "rule-30.json", "utf8")), states: [{ name: "a" }, { name: "b" }, { name: "c" }] }, { families: FAMILIES }).errors.join(" "),
    /states: 이 계열은 상태가 2개/,
  );
  assert.equal(parseWolfram("W30"), 30);
  assert.equal(parseWolfram(" w110 "), 110);
  for (const s of ["W", "W256", "30", "W3.5", "R30"]) assert.equal(parseWolfram(s), null, s);
  assert.deepEqual(parseCode("W31"), { family: "elementary", number: 31 });
  assert.equal(lockOf(parseCode("W31")), "odd");
  assert.equal(lockOf(parseCode("W30")), null);
  assert.equal(lockOf(parseCode("B03/S23")), "birth0");
  assert.equal(formatCode(preset("rule-110")), "W110");
});

test("0세대 줄은 y = 0 에: 가운데 한 칸, 너비의 몫에 흩뿌리기, 무늬의 첫 줄", () => {
  const sim = makeSim(preset("rule-30"));
  sim.seed({ x: 10, y: 50, w: 40, h: 20 }, makeRng(1));
  assert.deepEqual(rowOf(sim, 0, -100, 100), [30]);
  assert.equal(sim.head, 0);
  assert.equal(sim.alive, 1);
  sim.scatter({ x: -50, y: 0, w: 100, h: 10 }, 1, makeRng(1));
  assert.deepEqual(sim.bounds(), { x0: -50, y0: 0, x1: 49, y1: 0 }, "흩뿌리기는 0세대 줄에만");
  const narrow = makeSim({ ...preset("rule-110"), seed: { type: "random", density: 1, area: 0.5 } });
  narrow.seed({ x: -50, y: 0, w: 100, h: 10 }, makeRng(1));
  assert.deepEqual(narrow.bounds(), { x0: -25, y0: 0, x1: 24, y1: 0 }, "area 는 너비의 몫");
  sim.place(parseRLE("obo$3o!").rows, 7, 99);
  assert.deepEqual(rowOf(sim, 0, -10, 20), [6, 8], "무늬는 첫 줄만, 늘 0세대 줄에");
  assert.equal(sim.bounds().y1, 0);
  const r = makeSim({ ...preset("rule-30"), seed: { type: "rle", data: "2o$o!" } });
  r.seed(center, makeRng(1));
  assert.deepEqual(rowOf(r, 0, -10, 10), [-1, 0]);
});

test("손으로는 지금 줄만 바꾸고, 앞 칸은 주지 않는다", () => {
  const sim = makeSim(preset("rule-30"));
  sim.seed(center, makeRng(1));
  sim.step(5);
  assert.equal(sim.set(0, 3, 1), sim.get(0, 3), "지난 줄은 못 바꾼다");
  const before = sim.alive;
  const old = sim.set(100, 5, 1);
  assert.equal(old, 0);
  assert.equal(sim.alive, before + 1);
  sim.set(100, 5, 0);
  assert.equal(sim.alive, before);
  assert.equal(sim.set(0, 5, 2), sim.get(0, 5), "0·1 만");
  sim.blocks(-10, 0, 10, 5, (x, y, w, h, cells, prev) => assert.equal(prev, null));
  assert.deepEqual([sim.agents, sim.family], [[], "elementary"]);
});

test("살펴보기는 윗줄 세 칸의 무늬로 칸을 풀어 준다", () => {
  const sim = makeSim(preset("rule-30"));
  sim.seed(center, makeRng(1));
  sim.step(3);
  assert.deepEqual(sim.explain(0, 0), { now: 1, next: 1, why: "start", pattern: null, cells: [] });
  assert.deepEqual(sim.explain(-1, 1), { now: 1, next: 1, why: "rule", pattern: 1, cells: [[-2, 0], [-1, 0], [0, 0]] });
  assert.equal(sim.explain(1, 1).pattern, 4);
  assert.equal(sim.explain(1, 1).next, 1);
  assert.equal(sim.explain(0, 4).why, "next");
  assert.equal(sim.explain(0, 9).why, "none");
  assert.equal(sim.explain(0, -1).why, "none");
});

test("오래된 줄은 지우고, 지금 줄이 너무 넓으면 멈춘다", () => {
  assert.equal(rowsKept(10), ROWS_MAX);
  assert.equal(rowsKept(1 << 20), ROWS_MIN);
  assert.equal(rowsKept(4096), 256);
  const sim = makeSim(preset("rule-30"));
  sim.seed(center, makeRng(1));
  sim.step(1500); // 줄 너비 3001 → 349줄 남김
  const keep = rowsKept(3001);
  assert.ok(sim.top >= sim.head - keep - 31 && sim.top <= sim.head - keep + 1, `top ${sim.top}`);
  assert.equal(sim.bounds().y0, sim.top);
  assert.equal(sim.explain(0, sim.top).why, "none", "윗줄을 지운 줄은 풀 수 없다");
  assert.equal(sim.explain(0, sim.top + 1).why, "rule");
  const snap = sim.snapshot();
  sim.step(100);
  sim.restore(snap);
  assert.deepEqual([sim.head, sim.top, sim.alive], [snap.head, snap.top, rowOf(sim, snap.head, -1600, 1600).length]);
  // 넓게 흩뿌린 줄은 규칙 30 에서 한 걸음에 두 칸씩 넓어지다가 MAX_WIDTH 를 넘으면 멈춘다
  const wide = makeSim(preset("rule-30"));
  wide.scatter({ x: -4050, y: 0, w: 8100, h: 1 }, 0.5, makeRng(3));
  let steps = 0;
  for (let res = wide.step(); res; res = wide.step()) steps += res.steps;
  assert.equal(wide.full, true);
  assert.ok(steps > 20 && steps < 80, `${steps}걸음`);
  assert.equal(MAX_WIDTH, 8192);
  wide.clear();
  assert.deepEqual([wide.full, wide.head, wide.top, wide.alive], [false, 0, 0, 0]);
});
