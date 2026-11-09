// 작은 그림: 무늬(RLE)를 점으로, 그리고 '새 규칙'의 빈 판.

import { s } from "./dom.js";

/**
 * 무늬 rows(줄마다 상태 배열)를 점 그림(SVG)으로. 둘레에 빈 점을 한 줄 둔다.
 * look(theme.js boardColors 결과)을 주면 상태마다 판과 같은 크기, 신호색 상태는 신호색으로(조건표 같은 여러 상태)
 */
export function patternArt(rows, { pad = 1, look = null } = {}) {
  const pw = Math.max(1, ...rows.map((r) => r.length));
  const ph = Math.max(1, rows.length);
  const w = pw + pad * 2;
  const hh = ph + pad * 2;
  const dots = [];
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      const v = rows[y - pad]?.[x - pad] ?? 0;
      const sh = look && v > 0 ? look.shape[v] : null;
      if (sh) {
        const small = sh.r < 0.39;
        dots.push(
          s("circle", {
            class: "l",
            cx: x * 10 + 5,
            cy: y * 10 + 5,
            r: Math.max(1.2, sh.r * 10),
            style: sh.signal ? "fill: var(--signal)" : null,
            opacity: small ? 0.7 : null,
          }),
        );
      } else dots.push(s("circle", { class: v ? "l" : "e", cx: x * 10 + 5, cy: y * 10 + 5, r: v === 1 ? 4 : v > 1 ? 2.8 : 1.1, opacity: v > 1 ? 0.55 : null }));
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
