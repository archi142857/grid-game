// node --test 로 돈다. 순환(family: "cyclic"): 기준 구현과 견주기, 바탕은 그대로, 14색 순환의 소용돌이(주기), 살펴보기와 검사.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeSim, MAX_CYCLIC_STATES } from "../web/js/core/sim.js";
import { checkRuleFile, resizeStates, FAMILIES, lockOf, formatCode } from "../web/js/core/rules.js";
import { readRows } from "../web/js/core/rle.js";
import { makeRng } from "../web/js/core/rng.js";

const DIR = fileURLToPath(new URL("../web/data/rules/", import.meta.url));
const raw = (id) => JSON.parse(readFileSync(DIR + id + ".json", "utf8"));
const preset = (id) => checkRuleFile(raw(id), { families: FAMILIES }).rule;
const cyclic = (colors, threshold, neighborhood) => ({
  ...preset("cyclic-14"),
  neighborhood,
  threshold,
  states: Array.from({ length: colors + 1 }, (_, i) => ({ name: String(i) })),
});
const key = (sim) => readRows(sim).map((r) => r.join(",")).join("/");

/** 기준 구현: 칸은 Map. 바탕(0)은 그대로, 색 k 는 다음 색 이웃이 문턱 이상이면 다음 색 */
function reference(colors, threshold, vn, start, gens) {
  let cells = new Map(start.map(([x, y, v]) => [`${x},${y}`, v]));
  const near = vn
    ? [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ]
    : [-1, 0, 1].flatMap((dy) => [-1, 0, 1].filter((dx) => dx || dy).map((dx) => [dx, dy]));
  for (let g = 0; g < gens; g++) {
    const next = new Map();
    for (const [key, v] of cells) {
      const [x, y] = key.split(",").map(Number);
      const s = v === colors ? 1 : v + 1;
      const n = near.filter(([dx, dy]) => cells.get(`${x + dx},${y + dy}`) === s).length;
      next.set(key, n >= threshold ? s : v);
    }
    cells = next;
  }
  return [...cells].map(([k, v]) => `${k},${v}`).sort().join(" ");
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

test("순환이 기준 구현과 같다(무어·폰 노이만, 여러 색 수와 문턱)", () => {
  for (const [colors, threshold, nb] of [
    [3, 1, "moore"],
    [4, 2, "moore"],
    [5, 3, "moore"],
    [3, 1, "von-neumann"],
    [6, 2, "von-neumann"],
  ]) {
    const rng = makeRng(colors * 10 + threshold);
    const start = [];
    // 조각 경계(0|−1, 31|32)에 걸치게
    for (let y = -20; y < 25; y++) for (let x = -10; x < 45; x++) if (rng.next() < 0.9) start.push([x, y, 1 + rng.int(colors)]);
    const sim = makeSim(cyclic(colors, threshold, nb));
    for (const [x, y, v] of start) sim.set(x, y, v);
    for (let g = 0; g < 30; g++) sim.step();
    assert.equal(dump(sim), reference(colors, threshold, nb === "von-neumann", start, 30), `${colors}색 문턱 ${threshold} ${nb}`);
  }
});

test("바탕은 바뀌지 않아 뿌린 곳 밖으로 퍼지지 않고, 그래프 수는 바뀐 칸 수다", () => {
  const sim = makeSim(preset("cyclic-14"));
  sim.seed({ x: -30, y: -20, w: 60, h: 40 }, makeRng(2));
  const b = sim.bounds();
  assert.deepEqual(b, { x0: -30, y0: -20, x1: 29, y1: 19 }, "밀도 1 이라 네모가 꽉 찬다");
  assert.equal(sim.alive, 0, "아직 넘기지 않았으면 0");
  let changed = 0;
  for (let g = 0; g < 50; g++) {
    const res = sim.step();
    assert.equal(res.alive, res.changed, "그래프 수는 그 세대에 바뀐 칸 수");
    changed += res.changed;
  }
  assert.ok(changed > 0);
  assert.deepEqual(sim.bounds(), b);
  assert.equal(sim.canRun(), true);
  assert.equal(lockOf(preset("cyclic-14")), null);
  assert.equal(formatCode(preset("cyclic-14")), null, "순환은 주소 표기가 없다");
});

test("14색·문턱 1·폰 노이만 이웃은 넓은 판에서 소용돌이로 정리된다(거의 모든 칸이 돌고, 판 전체가 되풀이된다)", () => {
  const sim = makeSim(preset("cyclic-14"));
  sim.seed({ x: 0, y: 0, w: 200, h: 200 }, makeRng(7));
  sim.step(1000);
  assert.ok(sim.alive > 200 * 200 * 0.75, `한 세대에 ${sim.alive}칸이 색을 바꾼다`);
  const seen = new Map();
  let period = 0;
  for (let g = 0; g <= 40 && !period; g++) {
    const k = key(sim);
    if (seen.has(k)) period = g - seen.get(k);
    seen.set(k, g);
    sim.step();
  }
  assert.ok(period >= 14 && period <= 28, `판 전체의 주기 ${period}`);
});

test("살펴보기는 다음 색 이웃을 세고, 실제로 넘긴 값과 같다", () => {
  const rule = cyclic(4, 2, "moore");
  const sim = makeSim(rule);
  sim.seed({ x: 0, y: 0, w: 30, h: 20 }, makeRng(3));
  sim.step(3);
  const e = sim.explain(5, 5);
  assert.equal(e.cells.length, 8);
  assert.equal(e.threshold, 2);
  assert.equal(e.target, e.now === 4 ? 1 : e.now + 1);
  assert.deepEqual(sim.explain(-5, -5), { now: 0, next: 0, why: "base", target: null, n: 0, threshold: 2, cells: sim.explain(-5, -5).cells });
  const want = [];
  for (let y = -1; y <= 20; y++) for (let x = -1; x <= 30; x++) want.push(sim.explain(x, y).next);
  sim.step();
  const got = [];
  for (let y = -1; y <= 20; y++) for (let x = -1; x <= 30; x++) got.push(sim.get(x, y));
  assert.deepEqual(got, want);
  assert.equal(makeSim(preset("cyclic-14")).explain(0, 0).cells.length, 4, "폰 노이만은 4칸");
});

test("순환 규칙 검사", () => {
  const ok = raw("cyclic-14");
  const check = (o) => checkRuleFile(o, { families: FAMILIES }).errors?.join(" ") ?? "";
  assert.equal(check(ok), "");
  assert.match(check({ ...ok, rule: { threshold: 5 } }), /rule\.threshold: 1–4/, "폰 노이만은 4까지");
  assert.equal(check({ ...ok, neighborhood: "moore", rule: { threshold: 5 } }), "", "무어는 8까지");
  assert.match(check({ ...ok, neighborhood: "moore", rule: { threshold: 9 } }), /1–8/);
  assert.match(check({ ...ok, rule: { threshold: 0 } }), /rule\.threshold/);
  assert.match(check({ ...ok, neighborhood: "hex" }), /neighborhood: 순환은/);
  assert.match(check({ ...ok, states: [{ name: "a" }, { name: "b" }] }), /states: 상태는 3–25개/);
  assert.equal(MAX_CYCLIC_STATES, 25);
  assert.deepEqual(
    resizeStates([{ name: "바탕" }], 3, "cyclic").map((s) => s.name),
    ["바탕", "색 1", "색 2"],
  );
  const { rule } = checkRuleFile({ ...ok, neighborhood: undefined, rule: { threshold: 3 } }, { families: FAMILIES });
  assert.equal(rule.neighborhood, "moore", "이웃을 안 적으면 무어");
});
