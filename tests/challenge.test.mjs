// node --test 로 돈다. 도전 과제(core/challenge.js): 문제 파일, 알려진 답은 다 풀리고, 틀린 답은 까닭과 함께 막힌다.
// 알려진 답은 여기에만 둔다(사이트의 문제 파일에는 싣지 않는다).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { judge, setup, cellsOf, makeFrames, GOALS } from "../web/js/core/challenge.js";
import { parseRLE } from "../web/js/core/rle.js";
import { makeSim } from "../web/js/core/sim.js";
import { ruleFromCode, parseCode } from "../web/js/core/rules.js";

const FILE = fileURLToPath(new URL("../web/data/challenges/index.json", import.meta.url));
const LIST = JSON.parse(readFileSync(FILE, "utf8"));
const P = (id) => LIST.find((p) => p.id === id);

/** RLE 를 답의 칸으로(왼쪽 위가 (dx, dy)) */
const cells = (rle, dx = 0, dy = 0) => {
  const out = [];
  parseRLE(rle).rows.forEach((row, y) => row.forEach((v, x) => v && out.push([x + dx, y + dy])));
  return out;
};

const KNOWN = {
  "life-still": { cells: cells("b2o$o2bo$b2o!") }, // 벌집
  "life-p2": { cells: cells("3o!") }, // 깜빡이
  "life-p3": { cells: cells("2b3o3b3o2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!") }, // 펄서
  "life-ship": { cells: cells("bo$2bo$3o!") }, // 글라이더
  "life-survive": { cells: cells("b2o$2o$bo!") }, // R-펜토미노
  "highlife-grow": { cells: cells("2b3o$bo2bo$o3bo$o2bo$3o!") }, // 복제자
  "rule-sierpinski": { rule: "W90" },
  "guess-life": { rule: "B36/S23" }, // 하이라이프
};

test("문제 파일: 첫 묶음 여덟 문제가 설계 9절의 꼴대로 있다", () => {
  assert.deepEqual(
    LIST.map((p) => p.id),
    ["life-still", "life-p2", "life-p3", "life-ship", "life-survive", "highlife-grow", "rule-sierpinski", "guess-life"],
  );
  for (const p of LIST) {
    assert.ok(["life", "elementary"].includes(p.family), p.id);
    assert.ok(p.rule === "choose" || parseCode(p.rule)?.family === p.family, `${p.id} 규칙`);
    assert.ok(typeof p.start === "string" && p.start.length > 0, `${p.id} 시작`);
    assert.ok(p.limits && typeof p.limits === "object", `${p.id} 한도`);
    assert.ok(GOALS.includes(p.goal.type), `${p.id} 목표`);
  }
  const text = readFileSync(FILE, "utf8");
  assert.ok(!/W90|B36\/S23"\s*}/.test(text.replace(/"rule":"B36\/S23","start":"empty"/, "")), "고르기 문제의 답 표기는 파일에 없다");
});

test("알려진 답은 다 풀린다", () => {
  for (const p of LIST) {
    const res = judge(p, KNOWN[p.id]);
    assert.equal(res.ok, true, `${p.id}: ${JSON.stringify(res)}`);
  }
  assert.deepEqual(judge(P("life-ship"), KNOWN["life-ship"]), { ok: true, why: "ok", gen: 4, value: [1, 1] }, "글라이더는 4세대에 (1, 1) 옮겨 간다");
  assert.equal(judge(P("highlife-grow"), KNOWN["highlife-grow"]).value, 192, "복제자는 180세대에 192칸");
});

test("알려진 답이 아니어도 조건에 맞으면 푼 것이다", () => {
  assert.equal(judge(P("life-still"), { cells: [...cells("2o$2o!"), ...cells("2o$2o!", 5, 5)] }).ok, true, "블록 둘(8칸)도 멈춘 무늬");
  assert.equal(judge(P("life-p2"), { cells: cells("2o$o$3bo$2b2o!") }).ok, true, "등대도 주기 2");
  assert.equal(judge(P("life-survive"), { cells: cells("3o!") }).ok, true, "깜빡이도 1000세대를 버틴다(너그러운 판정)");
  const same90 = [];
  for (let n = 0; n < 256; n += 2) if (judge(P("rule-sierpinski"), { rule: `W${n}` }).ok) same90.push(n);
  assert.ok(same90.includes(90) && same90.length > 1, `시에르핀스키를 그리는 번호: ${same90}`);
  assert.equal(judge(P("life-ship"), { cells: cells("bo$2bo$3o!", 100, -40) }).ok, true, "어디에 놓아도");
});

test("틀린 답은 까닭과 함께 막힌다", () => {
  const no = (id, answer) => {
    const r = judge(P(id), answer);
    assert.equal(r.ok, false, `${id} ${JSON.stringify(answer).slice(0, 40)}`);
    return r;
  };
  assert.deepEqual(no("life-still", { cells: cells("2o$2o!") }), { ok: false, why: "toofew", value: 4 });
  assert.equal(no("life-still", { cells: [...cells("3o!"), ...cells("3o!", 0, 5)] }).why, "period", "깜빡이 둘은 멈추지 않는다");
  assert.deepEqual(no("life-p2", { cells: [...cells("2o$2o!"), ...cells("2o$2o!", 4, 4)] }), { ok: false, why: "early", gen: 1 });
  assert.equal(no("life-p2", { cells: cells("bo$2bo$3o!") }).why, "period", "글라이더는 제자리로 안 돌아온다");
  assert.deepEqual(no("life-p2", KNOWN["life-p3"]), { ok: false, why: "outside", value: [13, 13] });
  assert.deepEqual(no("life-p3", KNOWN["life-p2"]), { ok: false, why: "early", gen: 2 });
  assert.equal(no("life-ship", { cells: cells("3o!") }).why, "noship");
  assert.deepEqual(no("life-ship", { cells: cells("bo2bo$o$o3bo$4o!") }), { ok: false, why: "toomany", value: 9 });
  assert.equal(no("life-ship", {}).why, "empty");
  assert.deepEqual(no("life-survive", { cells: [[0, 0]] }), { ok: false, why: "died", gen: 1 });
  assert.equal(no("life-survive", { cells: cells("6bo$2o$bo3b3o!") }).why, "toomany", "다이하드는 7칸");
  assert.equal(no("highlife-grow", { cells: cells("2o$2o!") }).why, "small");
  assert.equal(no("rule-sierpinski", { rule: "W30" }).why, "differs");
  assert.equal(no("rule-sierpinski", { rule: "W91" }).why, "locked");
  assert.equal(no("rule-sierpinski", { rule: "B3/S23" }).why, "rule", "계열이 다르면");
  assert.equal(no("rule-sierpinski", { rule: "90" }).why, "rule", "W 를 붙여야 한다");
  assert.deepEqual(no("guess-life", { rule: "B3/S23" }), { ok: false, why: "differs", gen: 1 });
  assert.equal(no("guess-life", { rule: "B03/S23" }).why, "locked");
  assert.equal(no("life-still", { cells: [[0, 0, 2]] }).why, "cell", "규칙에 없는 상태");
  assert.equal(judge({ ...P("life-still"), goal: { type: "nope" } }, KNOWN["life-still"]).why, "problem");
});

test("규칙 맞히기의 frames 는 하이라이프로 만든 것이고, 화면은 setup·cellsOf 로 답을 모은다", () => {
  const p = P("guess-life");
  assert.deepEqual(makeFrames({ ...p, goal: { ...p.goal, frames: undefined } }, "B36/S23"), p.goal.frames);
  assert.equal(p.goal.frames.length, 31);
  const s = setup(P("life-p2"), KNOWN["life-p2"]);
  assert.equal(s.sim.family, "life");
  assert.equal(setup(p, {}).why, "rule", "고르기 문제는 규칙이 있어야");
  const sim = makeSim(ruleFromCode(parseCode("B3/S23")));
  for (const [x, y] of cells("b2o$o2bo$b2o!", 7, 3)) sim.set(x, y, 1);
  assert.equal(judge(P("life-still"), { cells: cellsOf(sim) }).ok, true);
  assert.equal(judge(P("life-still"), { cells: [...cellsOf(sim), [8, 3, 1]] }).ok, true, "겹친 칸은 한 번만 센다");
});
