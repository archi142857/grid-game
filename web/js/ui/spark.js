// 작은 선 그래프 하나(산 칸 수). 선 1.5px, 마지막 값에 점, 올리면 세로선과 그 세대의 값.
// 계열마다 낱말이 다르다(개미는 걸음과 칠한 칸): words = { at(세대) → 글, value(수) → 글, aria() → 글 }

import { h, s } from "./dom.js";
import { t, num } from "../i18n.js";

export const LIFE_WORDS = {
  at: (g) => t("{g}세대", { g: num(g) }),
  value: (n) => t("산 칸 {n}", { n: num(n) }),
  aria: () => t("세대마다 산 칸 수"),
};

export function makeSpark(words = LIFE_WORDS) {
  const W = 300;
  const H = 64;
  const area = s("path", { class: "area" });
  const line = s("path", { class: "line" });
  const cross = s("line", { class: "cross", y1: 0, y2: H, visibility: "hidden" });
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": words.aria() }, area, line, cross);
  // 끝점은 늘어나지 않게 HTML 점으로 얹는다
  const tip = h("span", { class: "spark-tip", "aria-hidden": "true" });
  const left = h("span");
  const right = h("span");
  const el = h("div", {}, h("div", { class: "spark" }, svg, tip), h("div", { class: "spark-label" }, left, right));
  let data = [];
  let start = 0;
  let marks = null; // 기록마다 몇 세대의 값인지(없으면 start 부터 한 세대씩)
  let hoverX = null;
  const genAt = (i) => (marks ? (marks[i] ?? marks[marks.length - 1] ?? 0) : start + i);

  function render() {
    // 값이 하나뿐이면 가로줄로 그린다
    const pts = data.length === 1 ? [data[0], data[0]] : data;
    const n = pts.length;
    let max = 1;
    for (const v of pts) if (v > max) max = v;
    const X = (i) => (n <= 1 ? W : (W * i) / (n - 1));
    const Y = (v) => H - 4 - ((H - 8) * v) / max;
    let d = "";
    for (let i = 0; i < n; i++) d += `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(pts[i]).toFixed(1)}`;
    line.setAttribute("d", d || `M0 ${H - 4}L${W} ${H - 4}`);
    area.setAttribute("d", n ? `${d}L${X(n - 1).toFixed(1)} ${H}L0 ${H}Z` : "");
    tip.style.left = `${(X(n - 1) / W) * 100}%`;
    tip.style.top = `${(Y(pts[n - 1] ?? 0) / H) * 100}%`;
    const last = Math.max(0, data.length - 1);
    if (hoverX === null) {
      left.textContent = words.at(genAt(0));
      right.textContent = words.at(genAt(last));
    } else {
      const i = Math.max(0, Math.min(last, Math.round((hoverX / W) * last)));
      const x = data.length === 1 ? hoverX : X(i);
      cross.setAttribute("x1", x);
      cross.setAttribute("x2", x);
      left.textContent = words.at(genAt(i));
      right.textContent = words.value(data[i] ?? 0);
    }
  }

  svg.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    hoverX = ((e.clientX - r.left) / r.width) * W;
    cross.setAttribute("visibility", "visible");
    render();
  });
  svg.addEventListener("pointerleave", () => {
    hoverX = null;
    cross.setAttribute("visibility", "hidden");
    render();
  });

  render();
  return {
    el,
    /** from: 첫 값의 세대, 또는 값마다의 세대 목록(world.marks) */
    update(values, from) {
      data = values;
      if (Array.isArray(from)) {
        marks = from;
        start = from[0] ?? 0;
      } else {
        marks = null;
        start = from;
      }
      render();
    },
  };
}
