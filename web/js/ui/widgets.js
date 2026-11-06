// 여러 화면이 같이 쓰는 조각: 고르기 묶음, 줄글.

import { h } from "./dom.js";

/**
 * 단추 여럿 가운데 하나 고르기. options: [{ id, name, title?, icon? }]
 * cls 로 겉모양을 바꾼다(기본 "seg", 첫 화면의 규칙 고르기는 "chips")
 */
export function segmented({ label, options, value, onChange, cls = "seg", item = "" }) {
  const wrap = h("div", { class: cls, role: "radiogroup", "aria-label": label });
  const btns = options.map((o) =>
    h(
      "button",
      {
        type: "button",
        role: "radio",
        class: item || null,
        title: o.title,
        "aria-label": o.icon && !o.name ? o.title : null,
        "aria-checked": String(o.id === value),
        "data-id": o.id,
        onclick: () => {
          set(o.id);
          onChange && onChange(o.id);
        },
      },
      o.icon || null,
      o.name || null,
    ),
  );
  function set(id) {
    btns.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === String(id))));
    const on = btns.some((b) => b.getAttribute("aria-checked") === "true");
    btns.forEach((b, i) => (b.tabIndex = b.getAttribute("aria-checked") === "true" || (!on && i === 0) ? 0 : -1));
  }
  wrap.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = Math.max(0, btns.indexOf(document.activeElement));
    const j = (i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length;
    btns[j].focus();
    btns[j].click();
    e.preventDefault();
  });
  wrap.append(...btns);
  set(value);
  return { el: wrap, set, buttons: btns };
}

export function paragraphs(list) {
  return (list || []).map((p) => h("p", {}, p));
}
