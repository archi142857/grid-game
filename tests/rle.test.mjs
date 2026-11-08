// node --test 로 돈다. RLE 읽기·쓰기, 머리 줄의 rule, 무늬 모음(web/data/patterns/)의 무늬가 이름대로 움직이는지.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseRLE, formatRLE, readRows } from "../web/js/core/rle.js";
import { makeSim } from "../web/js/core/sim.js";
import { checkRuleFile, parseRleRule, rleRuleOf, FAMILIES } from "../web/js/core/rules.js";
import { makeRng } from "../web/js/core/rng.js";

const PAT = fileURLToPath(new URL("../web/data/patterns/", import.meta.url));
const RULES = fileURLToPath(new URL("../web/data/rules/", import.meta.url));
const INDEX = JSON.parse(readFileSync(PAT + "index.json", "utf8"));
const text = (id) => readFileSync(PAT + id + ".rle", "utf8");
const preset = (id) => checkRuleFile(JSON.parse(readFileSync(RULES + id + ".json", "utf8")), { families: FAMILIES }).rule;

/** RLE 머리 줄의 rule 로 돌릴 앱 규칙 */
function ruleFor(code) {
  const p = parseRleRule(code);
  if (p.family === "table") return preset("wireworld");
  return { ...preset("conway-life"), id: "x", birth: p.birth, survive: p.survive, states: Array.from({ length: p.states }, (_, i) => ({ name: String(i) })) };
}

/** 무늬를 놓은 sim */
function placed(id) {
  const { rule } = INDEX.find((p) => p.id === id);
  const sim = makeSim(ruleFor(rule));
  sim.place(parseRLE(text(id)).rows, 0, 0);
  return sim;
}

/** 모양(네모 안의 칸)과 네모 */
function shape(sim) {
  const b = sim.bounds();
  return { key: readRows(sim, b).map((r) => r.join("")).join("/"), b };
}

/** 처음 모양으로 돌아오는 세대와 그사이 옮겨 간 칸 수 */
function period(sim, max) {
  const s0 = shape(sim);
  for (let g = 1; g <= max; g++) {
    sim.step();
    const s = shape(sim);
    if (s.key === s0.key) return { p: g, dx: s.b.x0 - s0.b.x0, dy: s.b.y0 - s0.b.y0 };
  }
  return null;
}

function popAt(sim, gens) {
  const out = [];
  for (let g = 1; g <= Math.max(...gens); g++) {
    sim.step();
    if (gens.includes(g)) out.push(sim.alive);
  }
  return out;
}

test("무늬 모음: 목록과 파일이 맞고, 파일은 RLE 꼴 그대로 적혀 있다", () => {
  const files = readdirSync(PAT).filter((f) => f.endsWith(".rle"));
  assert.deepEqual(INDEX.map((p) => p.id + ".rle").sort(), files.sort(), "목록에 있는 무늬만 파일이 있다");
  assert.equal(new Set(INDEX.map((p) => p.id)).size, INDEX.length);
  for (const { id, rule } of INDEX) {
    const t = text(id);
    const parsed = parseRLE(t);
    assert.equal(parsed.rule, rule, `${id} 머리 줄의 rule`);
    const r = parseRleRule(rule);
    assert.ok(r, `${id} rule 을 읽는다`);
    const name = t.match(/^#N (.+)$/m)?.[1] ?? null;
    assert.equal(formatRLE(parsed.rows, { rule, states: r.states, name }), t, `${id} 꼴`);
    assert.ok(parsed.rows.flat().some((v) => v === 1), `${id} 에 상태 1 칸이 있다`);
  }
});

test("생명 게임 무늬가 이름대로 움직인다", () => {
  assert.deepEqual(period(placed("glider"), 10), { p: 4, dx: 1, dy: 1 }, "글라이더: 4세대마다 대각선으로 한 칸");
  assert.deepEqual(period(placed("lwss"), 10), { p: 4, dx: -2, dy: 0 }, "가벼운 우주선: 4세대마다 두 칸");
  assert.deepEqual(period(placed("pulsar"), 10), { p: 3, dx: 0, dy: 0 }, "펄서: 주기 3");
  assert.deepEqual(period(placed("pentadecathlon"), 20), { p: 15, dx: 0, dy: 0 }, "펜타데카슬론: 주기 15");
  assert.deepEqual(popAt(placed("gosper-glider-gun"), [30, 60, 90, 120]), [41, 46, 51, 56], "고스퍼 총: 30세대마다 글라이더(다섯 칸) 하나");
  assert.deepEqual(popAt(placed("r-pentomino"), [1102, 1103, 1500]), [118, 116, 116], "R-펜토미노: 1103세대에 116칸으로 잠잠해진다");
  assert.deepEqual(popAt(placed("acorn"), [5205, 5206, 5400]), [635, 633, 633], "도토리: 5206세대에 633칸으로 잠잠해진다");
  assert.deepEqual(popAt(placed("diehard"), [129, 130]), [2, 0], "다이하드: 130세대에 모두 사라진다");
});

test("다른 규칙의 무늬도 이름대로 움직인다", () => {
  assert.deepEqual(popAt(placed("replicator"), [12, 36]), [24, 48], "하이라이프 복제자: 12세대 뒤에 둘");
  assert.deepEqual(period(placed("bomber"), 60), { p: 48, dx: 8, dy: 8 }, "폭격기: 48세대마다 대각선으로 8칸");
  const clock = placed("wireworld-clock");
  clock.step(40);
  const at40 = shape(clock).key;
  clock.step(8);
  assert.equal(shape(clock).key, at40, "와이어월드 시계: 8세대 주기");
  // 다이오드 둘(위는 정방향, 아래는 거꾸로)에 전자가 셋씩 들어간다. 지나간 뒤의 도선(x = 22)에 머리가 몇 번 오는지 센다
  const diode = makeSim(ruleFor("WireWorld"));
  parseRLE(text("wireworld-diode")).rows.forEach((row, y) => row.forEach((v, x) => v && diode.set(x, y, v)));
  const passed = { forward: 0, backward: 0 };
  for (let g = 0; g < 80; g++) {
    diode.step();
    if (diode.get(22, 1) === 1) passed.forward++;
    if (diode.get(22, 5) === 1) passed.backward++;
  }
  assert.deepEqual(passed, { forward: 3, backward: 0 }, "와이어월드 다이오드: 한쪽으로만 지나간다");
  const seeds = placed("seeds-square");
  const brain = placed("brians-brain-square");
  assert.ok(popAt(seeds, [30])[0] > 30, "씨앗의 네 칸은 퍼진다");
  assert.ok(popAt(brain, [30])[0] > 30, "브라이언의 뇌의 네 칸은 퍼진다");
});

test("RLE 쓰기와 읽기는 서로 되돌린다(여러 상태, 긴 줄, 빈 줄)", () => {
  const rng = makeRng(11);
  for (const states of [2, 3, 30, 255]) {
    const rows = Array.from({ length: 23 }, (_, y) => (y % 7 === 3 ? [] : Array.from({ length: 90 }, () => (rng.next() < 0.5 ? 0 : rng.int(states)))));
    const t = formatRLE(rows, { rule: "B3/S23", states });
    for (const line of t.split("\n")) assert.ok(line.length <= 70, line);
    const back = parseRLE(t).rows;
    const trim = (r) => {
      const out = [...r];
      while (out.length && !out[out.length - 1]) out.pop();
      return out;
    };
    const want = rows.map(trim);
    while (want.length && !want[want.length - 1].length) want.pop();
    assert.deepEqual(back.map(trim), want, `상태 ${states}`);
  }
  assert.deepEqual(parseRLE("A pA pX qA yO!").rows[0], [1, 25, 48, 49, 255], "Golly 의 두 글자 상태");
  assert.deepEqual(parseRLE("3pB$2o!").rows, [[26, 26, 26], [1, 1]]);
  assert.deepEqual(parseRLE("bpo!").rows[0], [0, 1, 1], "대문자가 뒤따르지 않는 p 는 산 칸");
  assert.equal(formatRLE([[1, 0, 1]]), "x = 3, y = 1\nobo!\n", "rule 이 없으면 머리 줄에서 뺀다");
  assert.equal(formatRLE([]), "x = 0, y = 0\n!\n");
});

test("지금 판을 RLE 로 내보내고 다시 놓으면 같다", () => {
  const sim = makeSim(preset("star-wars"));
  sim.seed({ x: -20, y: -15, w: 40, h: 30 }, makeRng(3));
  sim.step(12);
  const t = formatRLE(readRows(sim), { rule: rleRuleOf(sim.rule), states: sim.rule.states.length });
  assert.match(t, /rule = B2\/S345\/C4/);
  assert.match(t, /[ABC]/, "여러 상태는 글자로");
  const again = makeSim(ruleFor(parseRLE(t).rule));
  again.place(parseRLE(t).rows, 0, 0);
  assert.equal(shape(again).key, shape(sim).key);
  assert.deepEqual(readRows(makeSim(preset("conway-life"))), [], "빈 판");
});

test("머리 줄의 rule 읽기와 내보낼 rule", () => {
  assert.deepEqual(parseRleRule("B3/S23"), { family: "life", birth: [3], survive: [2, 3], states: 2 });
  assert.deepEqual(parseRleRule("23/3"), { family: "life", birth: [3], survive: [2, 3], states: 2 });
  assert.deepEqual(parseRleRule("B3/S23:T100,100"), { family: "life", birth: [3], survive: [2, 3], states: 2 }, "Golly 의 판 크기는 버린다");
  assert.equal(parseRleRule("wireworld").id, "wireworld");
  assert.equal(parseRleRule("WireWorld").states, 4);
  for (const s of ["LLRR", "W30", "", null, "Langtons-Ant"]) assert.equal(parseRleRule(s), null, String(s));
  assert.equal(rleRuleOf(preset("brians-brain")), "B2/S/C3");
  assert.equal(rleRuleOf(preset("wireworld")), "WireWorld");
  assert.equal(rleRuleOf({ ...preset("wireworld"), transitions: [{ from: 1, to: 2 }] }), null, "와이어월드가 아닌 조건표");
  assert.equal(rleRuleOf(preset("langtons-ant")), null);
  assert.equal(rleRuleOf(preset("rule-30")), null);
});
