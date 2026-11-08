// node --test 로 돈다. 육각 이웃(Life 계열, 표기 끝에 H): 기준 구현과 견주기, 표기, 육각 무늬, 살펴보기.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeSim } from "../web/js/core/sim.js";
import { parseNotation, formatNotation, hexNeighbors } from "../web/js/core/life.js";
import { checkRuleFile, parseCode, formatCode, lockOf, parseRleRule, rleRuleOf, sameRule, lifeRule } from "../web/js/core/rules.js";
import { parseRLE, readRows } from "../web/js/core/rle.js";
import { makeRng } from "../web/js/core/rng.js";

const DIR = fileURLToPath(new URL("../web/data/rules/", import.meta.url));
const PAT = fileURLToPath(new URL("../web/data/patterns/", import.meta.url));
const raw = (id) => JSON.parse(readFileSync(DIR + id + ".json", "utf8"));
const hexLife = () => checkRuleFile(raw("hex-life")).rule;
const withCode = (code) => {
  const p = parseNotation(code);
  return { ...hexLife(), birth: p.birth, survive: p.survive, neighborhood: p.neighborhood ?? "moore", states: Array.from({ length: p.states }, (_, i) => ({ name: String(i) })) };
};

/** 기준 구현: 칸은 Map, 이웃은 육각 6칸, Generations 도 */
function reference(code, start, gens) {
  const { birth, survive, states } = parseNotation(code);
  let cells = new Map(start.map(([x, y, v]) => [`${x},${y}`, v]));
  for (let g = 0; g < gens; g++) {
    const look = new Set();
    for (const key of cells.keys()) {
      const [x, y] = key.split(",").map(Number);
      look.add(key);
      for (const [a, b] of hexNeighbors(x, y)) look.add(`${a},${b}`);
    }
    const next = new Map();
    for (const key of look) {
      const [x, y] = key.split(",").map(Number);
      const now = cells.get(key) ?? 0;
      const n = hexNeighbors(x, y).filter(([a, b]) => cells.get(`${a},${b}`) === 1).length;
      let v;
      if (now === 0) v = birth.includes(n) ? 1 : 0;
      else if (now === 1) v = survive.includes(n) ? 1 : states > 2 ? 2 : 0;
      else v = (now + 1) % states;
      if (v) next.set(key, v);
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

test("육각 이웃이 기준 구현과 같다(조각 경계를 넘나들고, Generations 도)", () => {
  for (const code of ["B2/S34H", "B245/S3H", "B2/S3/C4H", "B24/S35H"]) {
    const rng = makeRng(code.length * 31);
    const start = [];
    for (let y = -20; y < 25; y++) for (let x = -15; x < 40; x++) if (rng.next() < 0.35) start.push([x, y, 1]);
    const sim = makeSim(withCode(code));
    for (const [x, y, v] of start) sim.set(x, y, v);
    for (let g = 0; g < 40; g++) sim.step();
    assert.equal(dump(sim), reference(code, start, 40), code);
  }
});

test("육각 표기: 끝의 H, 이웃 수는 0–6", () => {
  assert.deepEqual(parseNotation("B2/S34H"), { birth: [2], survive: [3, 4], states: 2, neighborhood: "hex" });
  assert.deepEqual(parseNotation("b245/s3h"), { birth: [2, 4, 5], survive: [3], states: 2, neighborhood: "hex" });
  assert.deepEqual(parseNotation("34/2H"), { birth: [2], survive: [3, 4], states: 2, neighborhood: "hex" });
  assert.deepEqual(parseNotation("B2/S3/C4H"), { birth: [2], survive: [3], states: 4, neighborhood: "hex" });
  assert.deepEqual(parseNotation("B3/S23"), { birth: [3], survive: [2, 3], states: 2 }, "무어는 그대로");
  for (const s of ["B7/S3H", "B2/S38H", "H", "B2/S34HH"]) assert.equal(parseNotation(s), null, s);
  for (const s of ["B2/S34H", "B245/S3H", "B2/S3/C4H", "B/S0123456H"]) assert.equal(formatNotation(parseNotation(s)), s);
  const rule = hexLife();
  assert.equal(rule.neighborhood, "hex");
  assert.equal(formatNotation(lifeRule(rule)), "B2/S34H");
  assert.equal(formatCode(rule), "B2/S34H");
  assert.deepEqual(parseCode("B2/S34H"), { family: "life", birth: [2], survive: [3, 4], states: 2, neighborhood: "hex" });
  assert.equal(rleRuleOf(rule), "B2/S34H");
  assert.equal(parseRleRule("B245/S3H").neighborhood, "hex");
  assert.equal(lockOf({ ...rule, birth: [0, 2] }), "birth0");
  assert.ok(!sameRule(rule, { ...rule, neighborhood: "moore" }), "이웃이 다르면 다른 규칙");
});

test("육각 무늬: 글라이더는 10세대마다 두 칸, p3 진동자는 주기 3", () => {
  const place = (id) => {
    const t = readFileSync(PAT + id + ".rle", "utf8");
    const sim = makeSim(withCode(parseRLE(t).rule));
    sim.place(parseRLE(t).rows, 0, 0);
    return sim;
  };
  const shape = (sim) => ({ key: readRows(sim).map((r) => r.join("")).join("/"), b: sim.bounds() });
  const glider = place("hex-glider");
  const g0 = shape(glider);
  glider.step(10);
  const g10 = shape(glider);
  assert.equal(g10.key, g0.key, "10세대 뒤 같은 모양");
  assert.deepEqual([g10.b.x0 - g0.b.x0, g10.b.y0 - g0.b.y0], [0, -2], "위로 두 칸");
  const p3 = place("hex-p3");
  const s0 = shape(p3).key;
  p3.step();
  assert.notEqual(shape(p3).key, s0);
  p3.step(2);
  assert.equal(shape(p3).key, s0);
});

test("살펴보기는 육각 6칸만 센다", () => {
  const sim = makeSim(hexLife());
  // (0, 0) 의 무어 이웃 가운데 육각에 들지 않는 두 칸(오른쪽 위, 왼쪽 아래)과 육각 이웃 한 칸
  sim.set(1, -1, 1);
  sim.set(-1, 1, 1);
  sim.set(-1, -1, 1);
  const e = sim.explain(0, 0);
  assert.equal(e.cells.length, 6);
  assert.equal(e.n, 1, "오른쪽 위·왼쪽 아래는 세지 않는다");
  assert.deepEqual([e.now, e.next, e.why], [0, 0, "stay"]);
  sim.set(0, -1, 1);
  assert.deepEqual([sim.explain(0, 0).n, sim.explain(0, 0).why], [2, "born"]);
  sim.step();
  assert.equal(sim.get(0, 0), 1, "살펴본 대로 태어난다");
});
