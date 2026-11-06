// node --test 로 돈다. 규칙 파일: 프리셋 검사, 틀린 파일 걸러 내기, 다시 쓰기.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkRuleFile, toRuleFile, resizeStates, lifeRule } from "../web/js/core/rules.js";
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

test("아직 못 돌리는 계열의 파일은 목록에 없고, 검사하면 계열을 알려 준다", () => {
  for (const f of FILES) {
    const obj = read(f);
    if (obj.family === "life") continue;
    assert.ok(!INDEX.includes(obj.id), obj.id);
    assert.match(checkRuleFile(obj).errors.join(" "), /family/);
  }
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
