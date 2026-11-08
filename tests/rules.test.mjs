// node --test 로 돈다. 규칙 파일: 프리셋 검사, 틀린 파일 걸러 내기, 다시 쓰기.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkRuleFile, toRuleFile, resizeStates, lifeRule, sameRule, parseCode, formatCode, formatRuleFile, FAMILIES, READY_FAMILIES } from "../web/js/core/rules.js";
import { formatNotation } from "../web/js/core/life.js";

const DIR = fileURLToPath(new URL("../web/data/rules/", import.meta.url));
const read = (f) => JSON.parse(readFileSync(DIR + f, "utf8"));
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json");
const INDEX = read("index.json");

test("모든 규칙 파일은 JSON 이고 id 가 파일 이름과 같다", () => {
  assert.ok(FILES.length >= 6);
  for (const f of FILES) assert.equal(read(f).id + ".json", f);
});

test("목록(index.json)의 프리셋은 모두 있고 검사를 통과한다", () => {
  assert.equal(new Set(INDEX).size, INDEX.length, "겹치지 않는다");
  const want = {
    "conway-life": "B3/S23",
    highlife: "B36/S23",
    seeds: "B2/S",
    "day-and-night": "B3678/S34678",
    maze: "B3/S12345",
    "brians-brain": "B2/S/C3",
  };
  for (const id of INDEX) {
    const { rule, errors } = checkRuleFile(read(id + ".json"));
    assert.equal(errors, undefined, `${id}: ${errors}`);
    assert.ok(rule.description.length > 10, `${id} 설명`);
    if (want[id]) assert.equal(formatNotation(lifeRule(rule)), want[id], id);
  }
});

test("화면이 아직 없는 계열의 파일은 목록에 없고, 기본 검사는 계열을 알려 준다", () => {
  for (const f of FILES) {
    const obj = read(f);
    if (READY_FAMILIES.includes(obj.family)) continue;
    assert.ok(!INDEX.includes(obj.id), obj.id);
    assert.match(checkRuleFile(obj).errors.join(" "), /family/);
  }
});

test("엔진이 아는 계열의 규칙 파일은 꼴대로 적혀 있고, 검사를 통과하고, 다시 써도 같다", () => {
  for (const f of FILES) {
    const text = readFileSync(DIR + f, "utf8");
    const obj = JSON.parse(text);
    if (!FAMILIES.includes(obj.family)) continue;
    assert.equal(formatRuleFile(obj), text, `${f} 꼴`);
    const { rule, errors } = checkRuleFile(obj, { families: FAMILIES });
    assert.equal(errors, undefined, `${f}: ${errors}`);
    assert.ok(rule.description.length > 10, `${f} 설명`);
    assert.ok(/요[.!]?$/.test(rule.description), `${f} 설명은 해요체`);
    assert.ok(rule.states.every((s) => s.color === undefined), `${f} 는 색을 적지 않는다(화면 색)`);
    assert.deepEqual(checkRuleFile(JSON.parse(JSON.stringify(toRuleFile(rule))), { families: FAMILIES }).rule, rule, f);
    assert.equal(formatRuleFile(toRuleFile(rule)), text, `${f} 다시 쓴 글`);
  }
});

test("틀린 개미 파일은 무엇이 틀렸는지 알려 준다", () => {
  const ok = read("langtons-ant.json");
  const check = (o) => checkRuleFile(o, { families: FAMILIES });
  const cases = [
    [{ ...ok, rule: { turns: "RLR" } }, /rule\.turns/],
    [{ ...ok, rule: { turns: "RX" } }, /rule\.turns/],
    [{ ...ok, rule: {} }, /rule: 개미는/],
    [{ ...ok, rule: { turns: "RL", machine: [[[1, "L", 0], [0, "R", 0]]] } }, /rule: turns 와/],
    [{ ...ok, rule: { machine: [[[1, "L", 1], [0, "R", 0]]] } }, /rule\.machine/],
    [{ ...ok, agents: [{ x: 0, y: 0, dir: "Q" }] }, /agents\[0\]/],
    [{ ...ok, agents: [{ x: 0.5, y: 0, dir: "N" }] }, /agents\[0\]/],
    [{ ...ok, agents: Array.from({ length: 65 }, () => ({ x: 0, y: 0, dir: "N" })) }, /agents: 개미는 64마리/],
    [{ ...ok, states: Array.from({ length: 17 }, () => ({ name: "a" })) }, /states: 상태는 2–16개/],
    [{ ...ok, grid: { edges: "wrap", width: 200, height: 200 } }, /grid\.edges: 지금은/],
  ];
  for (const [obj, re] of cases) assert.match(check(obj).errors.join(" "), re, JSON.stringify(obj).slice(0, 80));
  const { rule } = check({ family: "ant", states: [{ name: "a" }, { name: "b" }], rule: { turns: "LR" } });
  assert.deepEqual(rule.agents, [{ x: 0, y: 0, dir: "N" }], "개미를 적지 않으면 가운데에 위를 보는 개미 하나");
  assert.equal(rule.neighborhood, undefined);
});

test("주소의 표기: Life 는 B/S, 개미는 L·R·N·U 글자", () => {
  assert.deepEqual(parseCode("B36/S23"), { family: "life", birth: [3, 6], survive: [2, 3], states: 2 });
  assert.deepEqual(parseCode("llrr"), { family: "ant", turns: "LLRR" });
  for (const s of ["", "L", "LX", "W30x", "hello"]) assert.equal(parseCode(s), null, s);
  const ant = checkRuleFile(read("ant-llrr.json"), { families: FAMILIES }).rule;
  const tm = checkRuleFile(read("fibonacci-turmite.json"), { families: FAMILIES }).rule;
  const life = checkRuleFile(read("conway-life.json")).rule;
  assert.equal(formatCode(life), "B3/S23");
  assert.equal(formatCode(ant), "LLRR");
  assert.equal(formatCode(tm), null, "터마이트는 표기가 없다");
  assert.ok(sameRule(ant, { ...ant, agents: [], name: "x" }), "개미 자리와 이름은 보지 않는다");
  assert.ok(!sameRule(ant, { ...ant, turns: "LRRL" }));
  assert.ok(!sameRule(ant, life));
  assert.deepEqual(
    resizeStates([{ name: "빈칸" }, { name: "칠한 칸" }], 4, "ant").map((x) => x.name),
    ["빈칸", "칠한 칸", "색 2", "색 3"],
  );
});

test("틀린 규칙 파일은 무엇이 틀렸는지 알려 준다", () => {
  const ok = read("conway-life.json");
  const cases = [
    [null, /JSON/],
    [[], /JSON/],
    [{ ...ok, states: [{ name: "하나" }] }, /states/],
    [{ ...ok, states: [{ name: "a" }, { name: "b", color: "red" }] }, /color/],
    [{ ...ok, rule: { birth: [9], survive: [2] } }, /rule\.birth/],
    [{ ...ok, rule: { birth: [3] } }, /rule\.survive/],
    [{ ...ok, neighborhood: "hex" }, /neighborhood/],
    [{ ...ok, grid: { edges: "mirror" } }, /grid\.edges/],
    [{ ...ok, grid: { edges: "wrap" } }, /grid\.edges: Life/],
    [{ ...ok, grid: { edges: "infinite", width: 64 } }, /grid\.width·height/],
    [{ ...ok, rule: { birth: [0, 3], survive: [2, 3] } }, /rule\.birth: 끝없는/],
    [{ ...ok, seed: { type: "random" } }, /seed\.density/],
    [{ ...ok, seed: { type: "random", density: 0.2, area: 0 } }, /seed\.area/],
    [{ ...ok, seed: { type: "rle" } }, /seed\.data/],
    [{ ...ok, seed: { type: "soup" } }, /seed\.type/],
  ];
  for (const [obj, re] of cases) assert.match(checkRuleFile(obj).errors.join(" "), re, JSON.stringify(obj)?.slice(0, 60));
});

test("검사한 규칙을 다시 파일로 쓰면 그대로 돌아온다", () => {
  for (const id of INDEX) {
    const { rule } = checkRuleFile(read(id + ".json"));
    const again = checkRuleFile(JSON.parse(JSON.stringify(toRuleFile(rule))));
    assert.deepEqual(again.rule, rule, id);
  }
});

test("빠진 항목은 기본값으로 채운다", () => {
  const { rule } = checkRuleFile({ family: "life", states: [{ name: "a" }, { name: "b" }], rule: { birth: [3, 3], survive: [3, 2] } });
  assert.equal(rule.id, "custom");
  assert.deepEqual(rule.grid, { edges: "infinite" });
  assert.equal(rule.neighborhood, "moore");
  assert.deepEqual(rule.seed, { type: "empty" });
  assert.deepEqual([rule.birth, rule.survive], [[3], [2, 3]]);
});

test("상태 수를 늘리면 이름을 덧붙이고, 줄이면 자른다", () => {
  const s = resizeStates([{ name: "빈칸" }, { name: "산 칸" }], 4);
  assert.deepEqual(
    s.map((x) => x.name),
    ["빈칸", "산 칸", "사라지는 칸 1", "사라지는 칸 2"],
  );
  assert.deepEqual(
    resizeStates(s, 2).map((x) => x.name),
    ["빈칸", "산 칸"],
  );
});
