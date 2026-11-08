// 밝은 화면과 어두운 화면. 기기 설정을 따르거나 사용자가 고른다(기기 설정 → 밝게 → 어둡게).
// index.html 머리의 짧은 스크립트가 그리기 전에 같은 판단으로 먼저 정해 둔다(번쩍임 막기).
// 바뀌면 window 에 "schemechange" 이벤트를 보낸다(Ultimate RSP 와 같다).

import { load, save } from "./store.js";

export const SCHEMES = ["system", "light", "dark"];

let choice = load("scheme", "system");
if (!SCHEMES.includes(choice)) choice = "system";
const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

export const scheme = () => choice;
export const isDark = () => choice === "dark" || (choice === "system" && !!mq?.matches);

export function applyScheme() {
  const before = document.documentElement.dataset.scheme;
  document.documentElement.dataset.scheme = isDark() ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isDark() ? "#111214" : "#f3f3f0";
  if (before !== document.documentElement.dataset.scheme) window.dispatchEvent(new CustomEvent("schemechange"));
}

export function cycleScheme() {
  choice = SCHEMES[(SCHEMES.indexOf(choice) + 1) % SCHEMES.length];
  save("scheme", choice);
  applyScheme();
}

mq?.addEventListener?.("change", () => {
  if (choice === "system") applyScheme();
});

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const mixRgb = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

/**
 * 판을 그릴 색과 모양. 바탕(bg), 빈칸 점(empty), 커서·이웃 고리(ring), 신호색(signal),
 * 개미 표시(agent), 1차원의 새 줄(head), 그리고 상태마다 점 모양 shape[s] (s ≥ 1):
 *   r      점 반지름(칸 한 변에 대한 몫, 0–0.5). 0 이면 안 그린다
 *   color  그 상태에 머무는 칸의 색 [r, g, b] 또는 [r, g, b, a]
 *   enter  다른 상태에서 막 들어온 칸의 색(없으면 color). Life 의 방금 태어난 칸이 신호색
 *   exit   이 상태에서 빈칸으로 줄어들며 사라지는 칸의 색(없으면 color)
 * Life 는 산 칸이 잉크, 사라지는 칸(상태 2 이상)은 잉크에서 빈칸 점 색으로 흐려지며 작아진다.
 * 다른 계열의 모양은 디자인이 정하기 전까지 임시다(상태마다 잉크를 단계로 옅게).
 * 규칙 파일에 상태 색(color)이 있으면 그 색이 먼저다.
 */
export function boardColors(states, family = "life") {
  const C = states.length;
  const bg = hexToRgb(cssVar("--board"));
  const empty = hexToRgb(cssVar("--dot-0"));
  const ink = hexToRgb(cssVar("--ink"));
  const signal = hexToRgb(cssVar("--signal"));
  const own = (i, c) => (states[i]?.color ? hexToRgb(states[i].color) : c);
  const shape = [null];
  if (family === "life") {
    const live = own(1, ink);
    shape[1] = { r: 0.4, color: live, enter: signal, exit: [...live, 0.45] };
    for (let k = 2; k < C; k++) {
      const f = (k - 2) / Math.max(1, C - 2);
      shape[k] = { r: 0.4 * (0.74 - 0.44 * f), color: own(k, mixRgb(ink, empty, 0.38 + 0.42 * f)) };
    }
  } else {
    // 임시: 상태 1 이 잉크, 번호가 클수록 옅게. 크기는 같다
    for (let k = 1; k < C; k++) shape[k] = { r: 0.4, color: own(k, mixRgb(ink, empty, (0.55 * (k - 1)) / Math.max(1, C - 2))) };
  }
  return { bg, empty, ink: shape[1]?.color ?? ink, signal, agent: signal, head: signal, shape, ring: hexToRgb(cssVar("--ink-4")) };
}
