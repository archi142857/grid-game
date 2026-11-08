// node --test 로 돈다. 엔진과 화면 사이의 꼴(core/sim.js): Life 는 지금 화면(ui/world.js)이 하던 그대로여야 한다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeSim, MAX_TILES } from "../web/js/core/sim.js";
import { makePlane } from "../web/js/core/plane.js";
import { makeTable, explain } from "../web/js/core/life.js";
import { parseRLE } from "../web/js/core/rle.js";
import { makeRng } from "../web/js/core/rng.js";
import { checkRuleFile, lifeRule } from "../web/js/core/rules.js";

const DIR = fileURLToPath(new URL("../web/data/rules/", import.meta.url));
const preset = (id) => checkRuleFile(JSON.parse(readFileSync(DIR + id + ".json", "utf8"))).rule;
const region = { x: -40, y: -25, w: 80, h: 50 };

/** 칸 목록을 정렬된 글로 */
function dump(src) {
  const out = [];
  const b = src.bounds();
  if (!b) return "";
  src.blocks(b.x0, b.y0, b.x1, b.y1, (ox, oy, w, h, cells) => {
    for (let i = 0; i < w * h; i++) if (cells[i]) out.push(`${ox + (i % w)},${oy + Math.floor(i / w)},${cells[i]}`);
  });
  return out.sort().join(" ");
}

/** 옮기기 전 ui/world.js 가 뿌리던 방식 그대로(기준 답) */
function oldSeed(rule, reg, seed) {
  const P = makePlane();
  const rng = makeRng(seed);
  const s = rule.seed ?? { type: "empty" };
  const fill = (density, area) => {
    const aw = Math.max(1, Math.round(reg.w * area));
    const ah = Math.max(1, Math.round(reg.h * area));
    const x0 = reg.x + Math.floor((reg.w - aw) / 2);
    const y0 = reg.y + Math.floor((reg.h - ah) / 2);
    for (let y = y0; y < y0 + ah; y++) for (let x = x0; x < x0 + aw; x++) if (rng.next() < density) P.set(x, y, 1);
  };
  if (s.type === "random") fill(s.density ?? 0.3, s.area ?? 1);
  else if (s.type === "single") P.set(reg.x + (reg.w >> 1), reg.y + (reg.h >> 1), 1);
  else if (s.type === "rle") {
    const rows = parseRLE(s.data).rows;
    const pw = Math.max(0, ...rows.map((r) => r.length));
    const x0 = Math.round(reg.x + reg.w / 2 - pw / 2);
    const y0 = Math.round(reg.y + reg.h / 2 - rows.length / 2);
    rows.forEach((row, y) => row.forEach((v, x) => v && v < rule.states.length && P.set(x0 + x, y0 + y, v)));
  }
  return { plane: P, bounds: () => P.bounds(), blocks: (a, b, c, d, fn) => P.blocks(a, b, c, d, (ox, oy, s2, cells) => fn(ox, oy, s2, s2, cells)) };
}

test("Life sim 은 도감 규칙을 옮기기 전과 똑같이 뿌리고 똑같이 넘긴다", () => {
  const rles = { ...preset("conway-life"), id: "rle", seed: { type: "rle", data: "bo$2bo$3o!" } };
  const single = { ...preset("highlife"), id: "single", seed: { type: "single" } };
  for (const rule of [preset("conway-life"), preset("seeds"), preset("maze"), preset("star-wars"), rles, single]) {
    const sim = makeSim(rule);
    sim.seed(region, makeRng(2026));
    const ref = oldSeed(rule, region, 2026);
    assert.equal(dump(sim), dump(ref), `${rule.id} 뿌리기`);
    const table = makeTable(lifeRule(rule));
    for (let g = 0; g < 40; g++) {
      const res = sim.step();
      ref.plane.step(table);
      assert.equal(res.alive, ref.plane.alive, `${rule.id} ${g}세대 산 칸`);
    }
    assert.equal(dump(sim), dump(ref), `${rule.id} 40세대`);
    assert.equal(sim.family, "life");
    assert.deepEqual([sim.agents, sim.head], [[], null]);
  }
});

test("흩뿌리기는 seed 의 넓이(area) 안에만, 무늬 놓기는 가운데에", () => {
  const sim = makeSim(preset("seeds")); // area 0.1
  sim.scatter(region, 1, makeRng(1));
  assert.deepEqual(sim.bounds(), { x0: -4, y0: -3, x1: 3, y1: 1 });
  const life = makeSim(preset("conway-life"));
  life.scatter(region, 1, makeRng(1));
  assert.deepEqual(life.bounds(), { x0: -40, y0: -25, x1: 39, y1: 24 });
  life.place(parseRLE("bo$2bo$3o!").rows, 10, 10);
  assert.equal(dump(life), "10,11,1 10,9,1 11,10,1 11,11,1 9,11,1");
});

test("앞 세대는 넘긴 뒤에만 주고, 손으로 바꿔도 남긴다", () => {
  const sim = makeSim(preset("conway-life"));
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [2, 0],
  ])
    sim.set(x, y, 1);
  const prevs = () => {
    const out = [];
    sim.blocks(-5, -5, 5, 5, (x, y, w, h, cells, prev) => out.push(prev));
    return out;
  };
  assert.ok(prevs().every((p) => p === null), "처음에는 앞 세대가 없다");
  sim.step();
  assert.ok(prevs().every((p) => p instanceof Uint8Array), "넘긴 뒤에는 있다");
  sim.set(3, 3, 1);
  assert.ok(prevs().every((p) => p instanceof Uint8Array), "손으로 바꿔도 남긴다");
  sim.clear();
  sim.set(0, 0, 1);
  assert.ok(prevs().every((p) => p === null), "비우면 없다");
  assert.equal(sim.set(0, 1, 2), 0, "규칙에 없는 상태는 받지 않는다");
  assert.equal(sim.get(0, 1), 0);
});

test("떠 두기와 되돌리기, 상태 수 줄이기", () => {
  const rule = preset("star-wars"); // 상태 4개
  const sim = makeSim(rule);
  sim.seed(region, makeRng(7));
  for (let g = 0; g < 5; g++) sim.step();
  const before = dump(sim);
  const snap = sim.snapshot();
  for (let g = 0; g < 5; g++) sim.step();
  assert.notEqual(dump(sim), before);
  sim.restore(snap);
  assert.equal(dump(sim), before);
  // 상태를 둘로 줄이면 사라지는 칸은 빈칸이 되고, 그 전에 떠 둔 모습으로 돌아가도 그렇다
  sim.setRule({ ...rule, states: rule.states.slice(0, 2) });
  assert.ok(!/,[23]( |$)/.test(dump(sim)));
  sim.restore(snap);
  assert.ok(!/,[23]( |$)/.test(dump(sim)));
  assert.ok(dump(sim).length > 0);
  assert.throws(() => sim.setRule({ ...rule, family: "ant" }), /계열/);
});

test("살펴보기는 이웃 8칸을 세고 core/life.js 의 까닭과 같다", () => {
  const rule = preset("conway-life");
  const sim = makeSim(rule);
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [2, 0],
  ])
    sim.set(x, y, 1);
  const e = sim.explain(1, -1);
  assert.deepEqual(
    { now: e.now, next: e.next, why: e.why, n: e.n },
    { now: 0, next: 1, why: "born", n: 3 },
  );
  assert.equal(e.cells.length, 8);
  assert.deepEqual(e.cells[0], [0, -2]);
  assert.equal(sim.explain(0, 0).why, "die");
  assert.equal(sim.explain(1, 0).why, "survive");
  const brain = makeSim(preset("brians-brain"));
  brain.set(0, 0, 2);
  assert.deepEqual([brain.explain(0, 0).why, brain.explain(0, 0).next], [explain(lifeRule(brain.rule), 2, 0).why, 0]);
});

test("돌릴 수 없는 규칙과 너무 넓게 퍼진 판은 넘기지 않는다", () => {
  const b0 = makeSim({ ...preset("conway-life"), birth: [0, 3] });
  b0.set(0, 0, 1);
  assert.equal(b0.canRun(), false);
  assert.equal(b0.step(), null);
  const sim = makeSim(preset("conway-life"));
  for (let i = 0; i <= MAX_TILES; i++) sim.set((i % 40) * 64, Math.floor(i / 40) * 64, 1);
  assert.ok(sim.size > MAX_TILES);
  assert.equal(sim.full, true);
  assert.equal(sim.step(), null);
});

test("여러 세대를 한꺼번에 넘기면 하나씩 넘긴 것과 같다", () => {
  const a = makeSim(preset("highlife"));
  const b = makeSim(preset("highlife"));
  a.seed(region, makeRng(5));
  b.seed(region, makeRng(5));
  const res = a.step(30);
  let changed = 0;
  for (let g = 0; g < 30; g++) changed += b.step().changed;
  assert.equal(res.steps, 30);
  assert.equal(res.changed, changed);
  assert.equal(dump(a), dump(b));
});

test("뒤집기는 네모 안의 산 칸과 빈칸을 바꾼다", () => {
  const sim = makeSim(preset("day-and-night"));
  sim.set(0, 0, 1);
  sim.invert({ x: 0, y: 0, w: 2, h: 2 });
  assert.equal(dump(sim), "0,1,1 1,0,1 1,1,1");
  assert.throws(() => makeSim({ family: "nope" }), /계열/);
});
