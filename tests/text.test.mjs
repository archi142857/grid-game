// node --test 로 돈다. 화면 글: 조사, 틀 자리표, 규칙 설명, 규칙 파일 꼴, 도감 글.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { josa } from "../web/js/core/josa.js";
import { t } from "../web/js/i18n.js";
import { formatRuleFile } from "../web/js/core/rules.js";
import { ranges, describeRule } from "../web/js/ui/rulepad.js";
import { MORE_RULES, entryOf, catalogIds } from "../web/js/data/catalog.js";
import { parseNotation } from "../web/js/core/life.js";
import { checkRuleFile } from "../web/js/core/rules.js";
import { parseRLE } from "../web/js/core/rle.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

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
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith(".js") ? [join(dir, d.name)] : []));
  for (const f of walk(join(ROOT, "web/js"))) assert.ok(!/\bt\(\s*`/.test(readFileSync(f, "utf8")), f);
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
