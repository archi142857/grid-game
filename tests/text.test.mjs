// node --test 로 돈다. 화면 글: 조사, 틀 자리표, 규칙 설명, 규칙 파일 꼴, 도감 글, 영어 사전.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { josa } from "../web/js/core/josa.js";
import { t, setLang } from "../web/js/i18n.js";
import { EN } from "../web/js/i18n/en.js";
import { formatRuleFile } from "../web/js/core/rules.js";
import { ranges, describeRule } from "../web/js/ui/rulepad.js";
import { MORE_RULES, entryOf, catalogIds, patternOf, patternIds } from "../web/js/data/catalog.js";
import { challengeOf, challengeIds } from "../web/js/data/challenges.js";
import { parseNotation } from "../web/js/core/life.js";
import { checkRuleFile } from "../web/js/core/rules.js";
import { parseRLE } from "../web/js/core/rle.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const jsFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? jsFiles(join(dir, d.name)) : d.name.endsWith(".js") ? [join(dir, d.name)] : []));

test("조사: 숫자는 읽는 소리로, 한글은 받침으로", () => {
  const cases = [
    ["3", "이가", "3이"],
    ["2", "이가", "2가"],
    ["8", "이가", "8이"],
    ["9", "이가", "9가"],
    ["10", "을를", "10을"],
    ["1,000", "은는", "1,000은"],
    ["1", "으로로", "1로"],
    ["3", "으로로", "3으로"],
    ["산 칸", "이가", "산 칸이"],
    ["빈칸", "으로로", "빈칸으로"],
    ["꺼짐", "과와", "꺼짐과"],
    ["켜짐 (B2)", "이가", "켜짐 (B2)가"],
  ];
  for (const [w, pair, want] of cases) assert.equal(josa(w, pair), want, `${w} ${pair}`);
});

test("틀 자리표: 값과 조사", () => {
  assert.equal(t("태어남에 {n:이가} 있어요", { n: 3 }), "태어남에 3이 있어요");
  assert.equal(t("태어남에 {n:이가} 있어요", { n: 2 }), "태어남에 2가 있어요");
  assert.equal(t("{n}세대/초", { n: 15 }), "15세대/초");
  assert.equal(t("빈 자리 {x}"), "빈 자리 {x}", "값이 없으면 그대로");
});

test("t() 의 열쇠는 따옴표 글이다(영어판을 붙일 때 찾을 수 있게)", () => {
  for (const f of jsFiles(join(ROOT, "web/js"))) assert.ok(!/\bt\(\s*`/.test(readFileSync(f, "utf8")), f);
});

/** 화면 글의 열쇠: web/js 의 t("…")(설명 줄은 빼고)와 도감 규칙 파일의 이름·상태 이름(화면이 t() 로 감싸 부른다) */
function screenKeys() {
  const keys = new Set();
  for (const f of jsFiles(join(ROOT, "web/js"))) {
    if (f.endsWith(join("i18n", "en.js"))) continue;
    // 줄 설명을 먼저 지운다(설명 속 "rules/*.json" 같은 글이 블록 설명의 시작으로 읽히지 않게)
    const src = readFileSync(f, "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of src.matchAll(/(?<![\w$.])t\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
  }
  // 규칙 파일은 도감 목록에 아직 없는 것(다음 계열)까지 본다
  const dir = join(ROOT, "web/data/rules");
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name === "index.json") continue;
    const file = JSON.parse(readFileSync(join(dir, name), "utf8"));
    keys.add(file.name);
    for (const s of file.states ?? []) keys.add(s.name);
  }
  return keys;
}

/** 틀의 자리표 이름. {n}, {n:이가}, {n|one|many} 는 모두 n */
const slots = (tpl) => [...new Set([...tpl.matchAll(/\{(\w+)(?::[가-힣]+|\|[^|}]*\|[^}]*)?\}/g)].map((m) => m[1]))].sort();

test("영어 사전: 자리표가 한국어 틀과 같고, 한글이 남지 않는다", (tt) => {
  for (const [ko, en] of Object.entries(EN)) {
    if (typeof en === "function") continue;
    assert.equal(typeof en, "string", ko);
    assert.ok(!/[가-힣]/.test(en), `한글이 남았어요: ${en}`);
    assert.ok(!/\{\w+:/.test(en), `영어에는 조사 자리표를 쓰지 않아요: ${en}`);
    assert.deepEqual(slots(en), slots(ko), `자리표가 달라요: ${ko} → ${en}`);
  }
  // 다른 세션이 화면 글을 고쳐도 main 이 막히지 않게, 빠진 글과 안 쓰는 열쇠는 알림으로만 띄운다
  const keys = screenKeys();
  const stale = Object.keys(EN).filter((k) => !keys.has(k));
  const missing = [...keys].filter((k) => !(k in EN));
  if (stale.length) tt.diagnostic(`영어 사전에만 있는 열쇠 ${stale.length}개: ${stale.slice(0, 8).join(" | ")}`);
  if (missing.length) tt.diagnostic(`영어가 없는 화면 글 ${missing.length}개: ${missing.slice(0, 8).join(" | ")}`);
});

test("영어 틀: 값, 단수·복수, 사전에 없는 글", () => {
  const st = (n) => Array.from({ length: n }, () => ({ name: "x" }));
  setLang("en");
  try {
    assert.equal(t("산 이웃 {n}개라서", { n: 1 }), "1 live neighbor, so it");
    assert.equal(t("산 이웃 {n}개라서", { n: 3 }), "3 live neighbors, so it");
    assert.equal(t("태어남에 {n:이가} 있어요", { n: 2 }), "Born includes 2");
    assert.equal(t("사전에 없는 글"), "사전에 없는 글", "사전에 없으면 한국어 그대로");
    assert.equal(describeRule({ birth: [3], survive: [2, 3], states: st(2) }), "An empty cell is born with 3 live neighbors, and a live cell survives with 2, 3.");
    assert.equal(describeRule({ birth: [1], survive: [], states: st(3) }).startsWith("An empty cell is born with 1 live neighbor, and live cells start fading"), true);
  } finally {
    setLang("ko");
  }
});

test("숫자 묶음은 이어진 셋 이상만 물결표로", () => {
  assert.equal(ranges([1, 2, 3, 4, 5]), "1~5");
  assert.equal(ranges([3, 6, 7, 8]), "3, 6~8");
  assert.equal(ranges([2, 3]), "2, 3");
  assert.equal(ranges([]), "");
});

test("규칙 설명 문장", () => {
  const st = (n) => Array.from({ length: n }, () => ({ name: "x" }));
  assert.equal(describeRule({ birth: [3], survive: [2, 3], states: st(2) }), "빈칸은 산 이웃이 3개면 태어나고, 산 칸은 2, 3개면 살아남아요.");
  assert.equal(describeRule({ birth: [2], survive: [], states: st(2) }), "빈칸은 산 이웃이 2개면 태어나고, 산 칸은 다음 세대에 모두 죽어요.");
  assert.equal(
    describeRule({ birth: [2], survive: [], states: st(3) }),
    "빈칸은 산 이웃이 2개면 태어나고, 산 칸은 다음 세대에 바로 사라지기 시작해요. 살아남지 못한 칸은 1세대 동안 흐려지다가 사라져요.",
  );
  assert.equal(describeRule({ birth: [], survive: [0, 1, 2, 3, 4, 5, 6, 7, 8], states: st(2) }), "빈칸은 태어나지 않고, 산 칸은 죽지 않아요.");
});

test("목록의 프리셋 파일은 규칙 파일 꼴(formatRuleFile)로 적혀 있다", () => {
  const dir = join(ROOT, "web/data/rules");
  for (const id of JSON.parse(readFileSync(join(dir, "index.json"), "utf8"))) {
    const text = readFileSync(join(dir, `${id}.json`), "utf8");
    assert.equal(formatRuleFile(JSON.parse(text)), text, id);
  }
});

/** 볼 것의 규칙 표기가 어느 계열 꼴인지. Life B3/S23, 개미 LLRR(L·R·N·U), 1차원 W30(짝수만: 홀수는 빈 곳이 저절로 켜져 잠근다) */
function notationFamily(code) {
  if (parseNotation(code)) return "life";
  if (/^[LRNU]{2,}$/.test(code)) return "ant";
  const m = /^W(\d{1,3})$/.exec(code);
  if (m && Number(m[1]) <= 255 && Number(m[1]) % 2 === 0) return "elementary";
  return null;
}

test("도감 규칙마다 도감 글이 있고, 볼 것의 무늬·표기는 읽힌다", () => {
  const dir = join(ROOT, "web/data/rules");
  const ids = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
  for (const id of ids) {
    const rule = checkRuleFile(JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8"))).rule;
    assert.ok(rule, id);
    assert.ok(entryOf(id), `${id} 의 도감 글`);
  }
  // 다음 계열의 도감 글은 규칙 파일보다 먼저 들어온다. 글이 있는 규칙은 모두 본다
  for (const id of catalogIds()) {
    const e = entryOf(id);
    assert.ok(e.short() && e.tag() && e.about().length > 0, id);
    const file = join(dir, `${id}.json`);
    const family = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).family : null;
    for (const w of e.watch()) {
      assert.ok(w.name && w.text, `${id} 볼 것의 이름·설명`);
      if (w.kind === "pattern")
        assert.ok(
          parseRLE(w.rle)
            .rows.flat()
            .some((v) => v > 0),
          `${id} ${w.name}`,
        );
      if (w.kind === "rule") {
        const f = notationFamily(w.notation);
        assert.ok(f, `${id} ${w.notation}`);
        if (family) assert.equal(f, family, `${id} ${w.notation}: ${family} 계열 표기여야 해요`);
      }
    }
  }
  for (const r of MORE_RULES()) assert.ok(parseNotation(r.notation), r.notation);
});

test("무늬 모음: 무늬마다 이름·설명이 있고, 볼 것의 무늬는 무늬 파일과 같다", (tt) => {
  for (const id of patternIds()) assert.ok(patternOf(id).name() && patternOf(id).text(), id);
  // 무늬 파일은 엔진 몫이라, 어긋남은 main 을 막지 않고 알림으로 띄운다
  const dir = join(ROOT, "web/data/patterns");
  const listed = existsSync(join(dir, "index.json")) ? JSON.parse(readFileSync(join(dir, "index.json"), "utf8")).map((p) => p.id) : [];
  const noText = listed.filter((id) => !patternOf(id));
  if (noText.length) tt.diagnostic(`이름·설명이 없는 무늬: ${noText.join(", ")}`);
  const drift = [];
  for (const id of catalogIds())
    for (const w of entryOf(id).watch()) {
      if (!w.pattern) continue;
      const file = join(dir, `${w.pattern}.rle`);
      if (!existsSync(file)) drift.push(`${id} → ${w.pattern}(파일 없음)`);
      else if (JSON.stringify(parseRLE(readFileSync(file, "utf8")).rows) !== JSON.stringify(parseRLE(w.rle).rows)) drift.push(`${id} → ${w.pattern}(RLE 다름)`);
    }
  if (drift.length) tt.diagnostic(`볼 것과 무늬 파일이 어긋남: ${drift.join(" | ")}`);
});

test("도전 과제: 문제마다 제목·할 일·힌트가 있고, 할 일의 자리표가 다 채워진다", (tt) => {
  const sample = { limits: { cells: 5, minCells: 6, box: [8, 8] }, goal: { gens: 1000, min: 100, p: 2 } };
  for (const id of challengeIds()) {
    const c = challengeOf(id);
    assert.ok(c.title() && c.hint(), id);
    assert.ok(!/\{\w+\}/.test(c.task(sample)), `${id}: ${c.task(sample)}`);
  }
  // 문제 파일(엔진)이 생기면 실제 값으로도 본다. 어긋남은 알림으로
  const file = join(ROOT, "web/data/challenges/index.json");
  if (!existsSync(file)) return;
  const list = JSON.parse(readFileSync(file, "utf8"));
  const problems = (Array.isArray(list) ? list : list.challenges ?? []).flatMap((ch) => {
    const c = challengeOf(ch.id);
    if (!c) return [`${ch.id}(글 없음)`];
    return /\{\w+\}/.test(c.task(ch)) ? [`${ch.id}(빈 자리표: ${c.task(ch)})`] : [];
  });
  if (problems.length) tt.diagnostic(`도전 과제 글 확인: ${problems.join(" | ")}`);
});

test("코드 규칙 글: 도움말·예시 설명이 있고, 오류마다 한 줄이 다 채워진다", async (tt) => {
  const { CODE_HELP, EXAMPLE_NOTES, codeErrorText, CODE_LOCKED } = await import("../web/js/data/code-help.js");
  assert.ok(CODE_HELP().length > 0 && EXAMPLE_NOTES().length > 0 && CODE_LOCKED());
  const errors = [
    { kind: "empty" },
    { kind: "long", value: 30000 },
    { kind: "states", value: 9 },
    { kind: "syntax", message: "Unexpected token" },
    { kind: "notfunction", value: "3" },
    { kind: "throw", state: 1, counts: [5, 3], message: "x is not defined" },
    { kind: "value", state: 0, counts: [8, 0], value: "undefined" },
    { kind: "뭔지 모를 것" },
  ];
  for (const e of errors) {
    const line = codeErrorText(e, 2);
    assert.ok(line && !/\{\w+\}/.test(line), `${e.kind}: ${line}`);
  }
  assert.match(codeErrorText(errors[6], 2), /0–1/);
  // 오류 종류는 엔진(core/code.js)이 정한다. 글이 없는 새 종류는 main 을 막지 않고 알림으로 띄운다
  const src = readFileSync(join(ROOT, "web/js/core/code.js"), "utf8");
  const kinds = [...src.matchAll(/codeError\("(\w+)"/g)].map((m) => m[1]);
  const noText = kinds.filter((k) => !errors.some((e) => e.kind === k));
  if (noText.length) tt.diagnostic(`글이 없는 코드 오류 종류: ${noText.join(", ")}`);
});
