// 화면 언어. Ultimate RSP 처럼 한국어 문장 틀을 열쇠로 써서 다른 언어를 찾는다.
//   t("세대 {n}", { n: 3 })  →  "세대 3"
// 틀 자리표
//   {이름}          값을 그대로 넣는다
//   {이름:이가}     한국어에서 받침에 맞는 조사를 붙인다(영어에서는 값만)
//   {이름|one|many} 영어 사전 쪽에서만 쓴다. 값이 1이면 one, 아니면 many
// 지금은 한국어만 있다. 영어판은 i18n/en.js 에 사전을 채우고 setLang("en") 으로 켠다.

import { josa } from "./core/josa.js";
import { EN } from "./i18n/en.js";

let current = "ko";

export function lang() {
  return current;
}

export function setLang(l) {
  if (l !== "ko" && l !== "en") return;
  current = l;
  if (typeof document !== "undefined") document.documentElement.lang = l;
}

export function t(ko, vars) {
  let tpl = ko;
  if (current === "en" && EN[ko] !== undefined) tpl = typeof EN[ko] === "function" ? EN[ko](vars || {}) : EN[ko];
  return fill(tpl, vars);
}

const SLOT = /\{(\w+)(?::([가-힣]+)|\|([^|}]*)\|([^}]*))?\}/g;

function fill(tpl, vars) {
  if (!vars) return tpl;
  return tpl.replace(SLOT, (m, key, pair, one, many) => {
    const v = vars[key];
    if (v === undefined || v === null) return m;
    if (one !== undefined) return Number(v) === 1 ? one : many;
    if (pair && current === "ko") return josa(String(v), pair);
    return String(v);
  });
}

/** 숫자를 그 언어 꼴로 (1,000) */
export function num(n) {
  return Number(n).toLocaleString(current === "en" ? "en-US" : "ko-KR");
}
