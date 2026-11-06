// 규칙 점 단추(태어남·살아남음 0–8)와 표기 입력, 그리고 규칙을 쉬운 말로 풀어 쓰기.
// 점을 누르는 사람(겉)과 B3/S23 을 바로 치는 사람(속)이 같은 규칙을 함께 만진다.

import { h } from "./dom.js";
import { t } from "../i18n.js";
import { formatNotation } from "../core/life.js";
import { lifeRule } from "../core/rules.js";

let uid = 0;

/** [1,2,3,4,5] → "1~5", [3,6,7,8] → "3, 6~8" */
export function ranges(ns) {
  const out = [];
  for (let i = 0; i < ns.length; ) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    out.push(j - i >= 2 ? `${ns[i]}~${ns[j]}` : ns.slice(i, j + 1).join(", "));
    i = j + 1;
  }
  return out.join(", ");
}

/** 규칙을 쉬운 말 한두 문장으로 */
export function describeRule(r) {
  const C = r.states.length;
  const born = r.birth.length ? t("빈칸은 산 이웃이 {list}개면 태어나고", { list: ranges(r.birth) }) : t("빈칸은 태어나지 않고");
  let live;
  if (r.survive.length === 9) live = t("산 칸은 죽지 않아요.");
  else if (!r.survive.length) live = C > 2 ? t("산 칸은 다음 세대에 바로 사라지기 시작해요.") : t("산 칸은 다음 세대에 모두 죽어요.");
  else live = t("산 칸은 {list}개면 살아남아요.", { list: ranges(r.survive) });
  const fade = C > 2 ? " " + t("살아남지 못한 칸은 {k}세대 동안 흐려지다가 사라져요.", { k: C - 2 }) : "";
  return `${born}, ${live}${fade}`;
}

/** 끝없는 격자에서는 쓸 수 없는 숫자가 들어 있으면 그 까닭(없으면 null) */
export function blockedReason(rule) {
  return rule.birth.includes(0) ? NO_B0() : null;
}
const NO_B0 = () => t("끝없는 격자에서는 태어남 0을 쓸 수 없어요. 빈 곳이 끝없이 한꺼번에 태어나거든요.");

/**
 * 태어남·살아남음 점 단추 두 줄. onToggle(kind, n)
 * 태어남 0 은 끝없는 격자에서 돌릴 수 없어 잠가 두고, 누르면 onLocked(까닭) 를 부른다.
 */
export function makeRulePad({ onToggle, onLocked = null }) {
  const rows = {};
  const row = (kind, name, letter, tip) => {
    rows[kind] = Array.from({ length: 9 }, (_, n) => {
      const locked = kind === "birth" && n === 0;
      return h(
        "button",
        {
          type: "button",
          class: locked ? "count locked" : "count",
          "aria-pressed": "false",
          "aria-disabled": locked ? "true" : null,
          "aria-label": locked ? `${tip(n)}. ${NO_B0()}` : tip(n),
          title: locked ? NO_B0() : tip(n),
          onclick: () => (locked ? onLocked && onLocked(NO_B0()) : onToggle(kind, n)),
        },
        String(n),
      );
    });
    return h(
      "div",
      { class: "pad-row", role: "group", "aria-label": name },
      h("span", { class: "pad-label", "aria-hidden": "true" }, name, h("span", { class: "code" }, letter)),
      h("div", { class: "counts" }, rows[kind]),
    );
  };
  const el = h(
    "div",
    { class: "pad" },
    row("birth", t("태어남"), "B", (n) => t("빈칸 둘레에 산 칸이 {n}개면 태어나요", { n })),
    row("survive", t("살아남음"), "S", (n) => t("산 칸 둘레에 산 칸이 {n}개면 살아남아요", { n })),
  );
  return {
    el,
    update(rule) {
      for (const kind of ["birth", "survive"]) rows[kind].forEach((b, n) => b.setAttribute("aria-pressed", String(rule[kind].includes(n))));
    },
    /** 살펴보는 칸의 운명을 정한 숫자에 테. kind 가 null 이면 지운다 */
    markWhy(kind, n) {
      for (const k of ["birth", "survive"]) rows[k].forEach((b, i) => b.classList.toggle("why", k === kind && i === n));
    },
  };
}

/**
 * 표기 입력(점 글꼴로 크게). Enter 나 칸 벗어나기로 적용, Esc 로 되돌린다.
 * onCommit(text) 이 true 면 적용, 글이면 그 글을 틀린 까닭으로 보이고, 거짓이면 읽을 수 없는 표기
 */
export function makeNotationField({ onCommit, label = t("규칙 표기") }) {
  const id = `nt-${++uid}`;
  const input = h("input", {
    id,
    class: "code-in",
    type: "text",
    spellcheck: "false",
    autocomplete: "off",
    autocapitalize: "characters",
    title: t("고쳐 쓰고 Enter"),
  });
  const err = h("p", { class: "code-err", role: "status" });
  let current = "";
  const commit = () => {
    const text = input.value.trim();
    if (text.toUpperCase() === current) {
      input.value = current;
      err.textContent = "";
      return true;
    }
    const ok = onCommit(text);
    err.textContent = ok === true ? "" : typeof ok === "string" ? ok : t("읽을 수 없는 표기예요. 예: B3/S23, B2/S/C3, 23/3");
    return ok === true;
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (commit()) input.blur(); // 다 고쳤으면 빠져나와 스페이스·→ 단축키가 바로 먹게 한다
    } else if (e.key === "Escape") {
      input.value = current;
      err.textContent = "";
      input.blur();
    }
  });
  input.addEventListener("change", commit);
  const fit = () => (input.style.width = `${Math.max(6, input.value.length + 0.6)}ch`);
  input.addEventListener("input", fit);
  return {
    el: h("div", { class: "notation" }, h("label", { for: id }, label), input, err),
    update(rule, { edited = false } = {}) {
      current = formatNotation(lifeRule(rule));
      if (document.activeElement !== input) input.value = current;
      if (input.value.trim().toUpperCase() === current) err.textContent = "";
      input.classList.toggle("edited", edited);
      fit();
    },
  };
}
