// 작은 DOM 도구. h("div", { class: "x", onclick }, 자식...)  (Ultimate RSP 의 ui/dom.js 와 같은 꼴)

import { t } from "../i18n.js";

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "vars") for (const [n, val] of Object.entries(v)) el.style.setProperty(n, val);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

const SVGNS = "http://www.w3.org/2000/svg";
export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.setAttribute("class", v);
      else if (k === "vars") for (const [n, val] of Object.entries(v)) el.style.setProperty(n, val);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** 24×24 선 아이콘 */
export function icon(...paths) {
  return s(
    "svg",
    {
      viewBox: "0 0 24 24",
      "aria-hidden": "true",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    paths.flat().map((d) => s("path", { d })),
  );
}

export const ICON = {
  play: "M8 5.5v13l10.5-6.5z",
  pause: ["M9 5.5v13", "M15 5.5v13"],
  step: ["M6 5.5v13l9-6.5z", "M18.5 5.5v13"],
  reset: ["M4.5 12a7.5 7.5 0 1 0 2.2-5.3", "M4.5 4.5v4h4"],
  shuffle: ["M16 4h4v4", "M4 20 20 4", "M20 16v4h-4", "M14.5 14.5 20 20", "M4 4l5 5"],
  pen: ["M4 20h4L19 9l-4-4L4 16z", "M13.5 6.5l4 4"],
  eye: ["M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z", "M12 9.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z"],
  down: "M6 9l6 6 6-6",
  back: "M15 6l-6 6 6 6",
  minus: "M6 12h12",
  plus: ["M12 6v12", "M6 12h12"],
  save: ["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"],
  open: ["M12 15V4", "M7 9l5-5 5 5", "M5 20h14"],
};

export const reducedMotion = () => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export function setTitle(title) {
  document.title = title ? `${title} — Grid Game` : `Grid Game — ${t("격자 게임")}`;
}

