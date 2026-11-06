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
 * 판을 그릴 색. 빈칸 점(empty), 산 칸(ink), 방금 태어난 칸(signal), 사라지는 중인 칸(dying[k]).
 * 사라지는 칸은 잉크에서 빈칸 점 색으로 점점 흐려진다. 규칙 파일에 상태 색(color)이 있으면 그 색이 먼저다.
 */
export function boardColors(states) {
  const C = states.length;
  const bg = hexToRgb(cssVar("--board"));
  const empty = hexToRgb(cssVar("--dot-0"));
  const ink = hexToRgb(cssVar("--ink"));
  const signal = hexToRgb(cssVar("--signal"));
  const dying = [];
  for (let k = 2; k < C; k++) dying[k] = mixRgb(ink, empty, 0.38 + (0.42 * (k - 2)) / Math.max(1, C - 2));
  const own = (i, c) => (states[i]?.color ? hexToRgb(states[i].color) : c);
  return { bg, empty, ink: own(1, ink), signal, dying: dying.map((c, k) => (c ? own(k, c) : c)), ring: hexToRgb(cssVar("--ink-3")) };
}
