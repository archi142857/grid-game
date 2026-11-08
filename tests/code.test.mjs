// node --test 로 돈다. 코드 규칙(family: "code"): 표 꼴, Life·와이어월드·브라이언의 뇌를 코드로 쓰면 같은 답, 기준 구현과 견주기, 오류와 잠금.
// 사이트에서는 사용자 코드를 Worker 안에서만 부른다. 여기서는 같은 일(runCodeJob)을 node 에서 바로 부른다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeSim, MAX_CODE_STATES, EXAMPLE_SOURCE } from "../web/js/core/sim.js";
import { codeLayout, codeIndex, runCodeJob, compileSource, buildCodeTable } from "../web/js/core/code.js";
import { checkRuleFile, toRuleFile, lockOf, formatCode, sameRule, FAMILIES } from "../web/js/core/rules.js";
import { makeRng } from "../web/js/core/rng.js";

const DIR = fileURLToPath(new URL("../web/data/rules/", import.meta.url));
const preset = (id) => checkRuleFile(JSON.parse(readFileSync(DIR + id + ".json", "utf8")), { families: FAMILIES }).rule;
const names = (n) => Array.from({ length: n }, (_, i) => ({ name: String(i) }));

/** 코드 규칙(표까지 실은 것) */
function codeRule(source, states) {
  const { rule } = checkRuleFile({ family: "code", states: names(states), rule: { source } }, { families: FAMILIES });
  const job = runCodeJob({ source, states });
  assert.ok(job.ok, JSON.stringify(job.error));
  return { ...rule, table: job.table };
}

function dump(sim) {
  const out = [];
  const b = sim.bounds();
  if (b)
    sim.blocks(b.x0, b.y0, b.x1, b.y1, (ox, oy, w, h, cells) => {
      for (let i = 0; i < w * h; i++) if (cells[i]) out.push(`${ox + (i % w)},${oy + Math.floor(i / w)},${cells[i]}`);
    });
  return out.sort().join(" ");
}

function soup(seed, states, density = 0.4) {
  const rng = makeRng(seed);
  const out = [];
  for (let y = -15; y < 20; y++) for (let x = -20; x < 40; x++) if (rng.next() < density) out.push([x, y, 1 + rng.int(states - 1)]);
  return out;
}

/** 같은 칸에서 시작해 gens 세대 뒤 두 sim 이 같은지 */
function same(a, b, start, gens) {
  for (const [x, y, v] of start) {
    a.set(x, y, v);
    b.set(x, y, v);
  }
  for (let g = 0; g < gens; g++) {
    a.step();
    b.step();
  }
  assert.equal(dump(a), dump(b));
  assert.equal(a.alive, b.alive);
}

test("표의 꼴: 이웃 수 조합과 칸 번호", () => {
  assert.equal(codeLayout(2).V, 9);
  assert.equal(codeLayout(3).V, 45);
  assert.equal(codeLayout(MAX_CODE_STATES).V, 6435, "8칸을 상태 8개로 나누는 가짓수 C(15, 7)");
  for (const states of [2, 3, 5, 8]) {
    const L = codeLayout(states);
    assert.deepEqual(L.combos[0], [8, ...new Array(states - 1).fill(0)], "칸 번호 0 은 이웃이 모두 빈칸");
    const seen = new Set();
    L.combos.forEach((c, i) => {
      assert.equal(c.reduce((a, b) => a + b, 0), 8);
      assert.equal(codeIndex(c, L), i);
      seen.add(i);
    });
    assert.equal(seen.size, L.V);
  }
});

test("Life·브라이언의 뇌·와이어월드를 코드로 쓰면 그 계열과 같이 돈다", () => {
  const life = codeRule(EXAMPLE_SOURCE, 2);
  same(makeSim(life), makeSim(preset("conway-life")), soup(1, 2, 0.35), 60);
  const brain = codeRule("(s, n) => s === 0 ? (n[1] === 2 ? 1 : 0) : s === 1 ? 2 : 0", 3);
  same(makeSim(brain), makeSim(preset("brians-brain")), soup(2, 3), 40);
  const wire = codeRule(
    `function (s, n) {
      // 머리 → 꼬리 → 도선, 도선은 머리 이웃이 1–2개면 머리
      if (s === 1) return 2;
      if (s === 2) return 3;
      if (s === 3) return n[1] === 1 || n[1] === 2 ? 1 : 3;
      return 0;
    } // 끝의 주석도 괜찮다`,
    4,
  );
  same(makeSim(wire), makeSim(preset("wireworld")), soup(3, 4, 0.5), 40);
});

test("여러 상태를 함께 세는 규칙도 기준 구현(칸마다 함수를 부름)과 같다", () => {
  // 가위바위보: 나를 이기는 상태가 이웃에 3개 이상이면 그 상태가 된다. 빈칸은 이웃 가운데 가장 많은 상태가 3개 이상이면 그 상태
  const source = `(s, n) => {
    if (s === 0) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (n[k] >= 3 && n[k] > n[best === 0 ? 0 : best] - (best === 0 ? 99 : 0)) best = k;
      return best;
    }
    const beat = s === 3 ? 1 : s + 1;
    return n[beat] >= 3 ? beat : s;
  }`;
  const fn = compileSource(source);
  const rule = codeRule(source, 4);
  const sim = makeSim(rule);
  const start = soup(4, 4, 0.6);
  let cells = new Map(start.map(([x, y, v]) => [`${x},${y}`, v]));
  for (const [x, y, v] of start) sim.set(x, y, v);
  for (let g = 0; g < 25; g++) {
    const look = new Set();
    for (const key of cells.keys()) {
      const [x, y] = key.split(",").map(Number);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) look.add(`${x + dx},${y + dy}`);
    }
    const next = new Map();
    for (const key of look) {
      const [x, y] = key.split(",").map(Number);
      const n = [0, 0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n[cells.get(`${x + dx},${y + dy}`) ?? 0]++;
      const v = fn(cells.get(key) ?? 0, n);
      if (v) next.set(key, v);
    }
    cells = next;
    sim.step();
  }
  assert.equal(dump(sim), [...cells].map(([k, v]) => `${k},${v}`).sort().join(" "));
});

test("살펴보기는 상태마다 센 수와 표의 값을 준다", () => {
  const sim = makeSim(codeRule(EXAMPLE_SOURCE, 2));
  sim.set(0, 0, 1);
  sim.set(1, 0, 1);
  sim.set(2, 0, 1);
  const e = sim.explain(1, 1);
  assert.deepEqual([e.now, e.next, e.why, e.counts], [0, 1, "code", [5, 3]]);
  assert.equal(e.cells.length, 8);
  assert.deepEqual(sim.explain(0, 0).counts, [7, 1]);
  assert.equal(sim.explain(0, 0).next, 0);
});

test("표가 없으면 돌리지 않고, 이웃 없는 빈칸이 바뀌면 잠근다", () => {
  const { rule } = checkRuleFile({ family: "code", states: names(2), rule: { source: EXAMPLE_SOURCE } }, { families: FAMILIES });
  const bare = makeSim(rule);
  bare.set(0, 0, 1);
  assert.equal(bare.canRun(), false);
  assert.equal(bare.step(), null);
  assert.equal(bare.explain(0, 0).why, "notable");
  assert.equal(lockOf(rule), null, "표가 없으면 잠금은 모른다");
  const job = runCodeJob({ source: "(s, n) => 1", states: 2 });
  assert.equal(job.ok, true);
  assert.equal(job.locked, true);
  const locked = { ...rule, table: job.table };
  assert.equal(lockOf(locked), "empty");
  assert.equal(makeSim(locked).canRun(), false);
  assert.equal(makeSim({ ...rule, table: new Uint8Array(3) }).canRun(), false, "크기가 안 맞는 표는 받지 않는다");
});

test("틀린 코드는 어떤 입력에서 무엇이 틀렸는지 알려 준다", () => {
  const err = (source, states = 2) => runCodeJob({ id: 7, source, states });
  assert.deepEqual(Object.keys(err("(s, n) => {").error).sort(), ["kind", "message"]);
  assert.equal(err("(s, n) => {").error.kind, "syntax");
  assert.equal(err("42").error.kind, "notfunction");
  assert.equal(err("").error.kind, "empty");
  assert.equal(err("(s, n) => 0", 9).error.kind, "states");
  assert.equal(err("x".repeat(20001)).error.kind, "long");
  const thrown = err("(s, n) => { if (s === 1 && n[1] === 2) throw new Error('앗'); return 0; }");
  assert.deepEqual(thrown, { id: 7, ok: false, error: { kind: "throw", state: 1, counts: [6, 2], message: "앗" } });
  const bad = err("(s, n) => s === 1 ? 2 : 0");
  assert.deepEqual(bad.error, { kind: "value", state: 1, counts: [8, 0], value: "2" });
  assert.equal(err("(s, n) => s + 0.5").error.value, "0.5");
  assert.equal(err("(s, n) => 'a'").error.value, '"a"');
  assert.equal(err("(s, n) => { n[0] = 99; return n[0] === 99 ? 0 : 1; }").ok, true, "counts 를 고쳐도 다음 부름에는 새 배열");
  assert.throws(() => buildCodeTable(() => undefined, 2), (e) => e.info.kind === "value" && e.info.value === "undefined");
});

test("코드 규칙 파일: source 만 담고 표는 넣지 않는다", () => {
  const rule = codeRule(EXAMPLE_SOURCE, 2);
  const file = toRuleFile(rule);
  assert.deepEqual(file.rule, { source: EXAMPLE_SOURCE });
  assert.equal(JSON.stringify(file).includes("table"), false);
  assert.equal(formatCode(rule), null, "주소로는 나누지 않는다");
  assert.ok(sameRule(rule, { ...rule, table: undefined }), "표는 보지 않는다");
  assert.ok(!sameRule(rule, { ...rule, source: "(s, n) => 0" }));
  const check = (o) => checkRuleFile({ family: "code", states: names(2), rule: { source: EXAMPLE_SOURCE }, ...o }, { families: FAMILIES }).errors?.join(" ") ?? "";
  assert.match(check({ rule: {} }), /rule\.source: 코드 글이/);
  assert.match(check({ rule: { source: "x".repeat(20001) } }), /20000자까지/);
  assert.match(check({ states: names(9) }), /states: 상태는 2–8개/);
  assert.match(check({ neighborhood: "hex" }), /neighborhood/);
});
