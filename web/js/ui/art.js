// 작은 그림: 무늬(RLE)를 점으로, 그리고 '새 규칙'의 빈 판.

import { s } from "./dom.js";

/** 무늬 rows(줄마다 상태 배열)를 점 그림(SVG)으로. 둘레에 빈 점을 한 줄 둔다 */
export function patternArt(rows, { pad = 1 } = {}) {
  const pw = Math.max(1, ...rows.map((r) => r.length));
  const ph = Math.max(1, rows.length);
  const w = pw + pad * 2;
  const hh = ph + pad * 2;
  const dots = [];
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const v = rows[y - pad]?.[x - pad] ?? 0;
      dots.push(s("circle", { class: v ? "l" : "e", cx: x * 10 + 5, cy: y * 10 + 5, r: v === 1 ? 4 : v > 1 ? 2.8 : 1.1, opacity: v > 1 ? 0.55 : null }));
    }
  }
  return s("svg", { class: "pat", viewBox: `0 0 ${w * 10} ${hh * 10}`, "aria-hidden": "true" }, dots);
}

/** 새 규칙 그림: 3×3 이웃 가운데에 신호색 점 하나 */
export function newRuleArt() {
  const dots = [];
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++)
      dots.push(
        s("circle", { cx: x * 20 + 10, cy: y * 20 + 10, r: x === 1 && y === 1 ? 7.5 : 3, fill: x === 1 && y === 1 ? "var(--signal)" : "var(--dot-0)" }),
      );
  return s("svg", { viewBox: "0 0 60 60", "aria-hidden": "true" }, dots);
}
