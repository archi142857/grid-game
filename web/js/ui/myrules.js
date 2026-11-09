// 내 규칙: 고친 규칙(모든 계열)에 이름을 붙여 이 브라우저(store 'mine')에 담아 두고, 목록에서 다시 열거나 지운다.
// 담는 것은 규칙 파일 꼴 그대로(toRuleFile). 50개까지. 열 때는 checkRuleFile 을 다시 거친다(화면이 있는 계열만).
// 목록 모양(도감 끝·만들기 화면)은 도감 묶음(.shelf-group·.spec)을 빌려 쓴다.

import { h } from "./dom.js";
import { t } from "../i18n.js";
import { load, save, canStore } from "./store.js";
import { checkRuleFile, toRuleFile, formatCode } from "../core/rules.js";
import { makeThumb, hoverPlay } from "./thumb.js";

export const MAX_MINE = 50;

/** [{ key, at, file }] 새로 담은 것부터 */
export function listMine() {
  const v = load("mine", []);
  return Array.isArray(v) ? v.filter((x) => x && typeof x.key === "string" && x.file && typeof x.file === "object") : [];
}

/** 규칙(앱 꼴)을 name 으로 담는다. { key } 또는 { error: "store" | "full" } */
export function addMine(rule, name) {
  if (!canStore()) return { error: "store" };
  const list = listMine();
  if (list.length >= MAX_MINE) return { error: "full" };
  const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const file = toRuleFile({ ...rule, id: `mine-${key}`, name });
  list.unshift({ key, at: Date.now(), file });
  save("mine", list);
  return listMine().some((x) => x.key === key) ? { key } : { error: "store" };
}

export function removeMine(key) {
  save(
    "mine",
    listMine().filter((x) => x.key !== key),
  );
}

/** 담아 둔 규칙을 앱 꼴로(못 읽거나 화면이 없는 계열이면 null) */
export function mineRule(key, families) {
  const x = listMine().find((m) => m.key === key);
  if (!x) return null;
  const res = checkRuleFile(x.file, { families });
  return res.rule ?? null;
}

/**
 * 내 규칙 묶음(도감 묶음 꼴). 담은 게 없으면 null.
 *   familyName(id): 계열 이름 · onChange(): 지운 뒤 부른다
 */
export function mineGroup(families, { familyName = (id) => id, onChange = null } = {}) {
  const rows = listMine()
    .map((x) => ({ key: x.key, rule: checkRuleFile(x.file, { families }).rule }))
    .filter((x) => x.rule);
  if (!rows.length) return null;
  const thumbs = [];
  const count = h("span", { class: "shelf-count" });
  const list = h("ul", { class: "specimens mine-list" });
  const setCount = () => {
    const n = list.children.length;
    count.textContent = String(n);
    count.setAttribute("aria-label", t("규칙 {n}가지", { n }));
  };
  for (const { key, rule } of rows) {
    const th = makeThumb(rule, { key: `mine-${key}` });
    thumbs.push(th);
    const li = h(
      "li",
      {},
      hoverPlay(
        h(
          "a",
          { class: "spec", href: `#/mine/${encodeURIComponent(key)}` },
          h("span", { class: "spec-art" }, th.canvas),
          h(
            "span",
            { class: "spec-text" },
            h("span", { class: "spec-name" }, rule.name),
            h("span", { class: "spec-code code" }, formatCode(rule) ?? ""),
            h("span", { class: "spec-meta" }, familyName(rule.family)),
          ),
        ),
        th,
      ),
      h(
        "button",
        {
          class: "text-btn mine-del",
          type: "button",
          "aria-label": t("{name} 지우기", { name: rule.name }),
          onclick: () => {
            removeMine(key);
            th.destroy();
            li.remove();
            setCount();
            if (!list.children.length) el.remove();
            onChange && onChange();
          },
        },
        t("지우기"),
      ),
    );
    list.append(li);
  }
  const el = h(
    "div",
    { class: "shelf-group mine" },
    h("div", { class: "shelf-head" }, h("h3", {}, t("내 규칙")), count, h("p", {}, t("이 브라우저에 담아 둔 규칙이에요"))),
    list,
  );
  setCount();
  return {
    el,
    recolor: () => thumbs.forEach((x) => x.recolor()),
    destroy: () => thumbs.forEach((x) => x.destroy()),
  };
}
