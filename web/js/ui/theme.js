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

/** 새 계열 점의 수치(style.css 맨 위 변수). 반지름은 칸 한 변에 대한 비율 */
function dotVars() {
  const n = (name, d) => {
    const v = parseFloat(cssVar(name));
    return Number.isFinite(v) ? v : d;
  };
  return { rMin: n("--dot-r-min", 0.14), toneMin: n("--dot-tone-min", 0.6), tail: n("--tail-r", 0.25), wire: n("--wire-r", 0.16), keep: n("--row-keep", 4), fade: n("--row-fade", 17) };
}
const R = 0.4; // 가장 큰 점(산 칸)

/**
 * 판을 그릴 색과 모양. 바탕(bg), 빈칸 점(empty), 커서·이웃 고리(ring), 신호색(signal),
 * 개미 표시(agent), 1차원의 새 줄(head), 그리고 상태마다 점 모양 shape[s] (s ≥ 1):
 *   r      점 반지름(칸 한 변에 대한 몫, 0–0.5). 0 이면 안 그린다
 *   color  그 상태에 머무는 칸의 색 [r, g, b] 또는 [r, g, b, a]
 *   enter  다른 상태에서 막 들어온 칸의 색(없으면 color). Life 의 방금 태어난 칸이 신호색
 *   exit   이 상태에서 빈칸으로 줄어들며 사라지는 칸의 색(없으면 color)
 * 1차원은 지난 줄이 나이(a = 지금 줄 − 그 줄)에 따라 작아진다: age(a) → { r, color }, ageMax 넘으면 ageMax 와 같다.
 * Life 는 산 칸이 잉크, 사라지는 칸(상태 2 이상)은 잉크에서 빈칸 점 색으로 흐려지며 작아진다.
 * 다른 계열은 사용자가 고른 시안 B(크기): 점이 작을수록 옅다(빈칸 점 색에서 잉크·신호색 쪽으로, 반지름에 맞춘 진하기만큼).
 *   개미: 1번 색이 가장 작고 마지막 색이 산 칸 크기. 조건표: 1 신호색 큰 점, 2 신호색 꼬리, 3 이상 잉크(마지막이 도선 크기)
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
  const out = { bg, empty, ink, signal, agent: signal, head: signal, shape, ring: hexToRgb(cssVar("--ink-4")) };
  if (family === "life") {
    const live = own(1, ink);
    shape[1] = { r: R, color: live, enter: signal, exit: [...live, 0.45] };
    for (let k = 2; k < C; k++) {
      const f = (k - 2) / Math.max(1, C - 2);
      shape[k] = { r: R * (0.74 - 0.44 * f), color: own(k, mixRgb(ink, empty, 0.38 + 0.42 * f)) };
    }
    out.ink = live;
    return out;
  }
  const K = dotVars();
  const tone = (r) => Math.max(K.toneMin, Math.min(1, K.toneMin + ((1 - K.toneMin) * (r - K.rMin)) / (R - K.rMin)));
  const shade = (base, r) => mixRgb(empty, base, tone(r));
  const dot = (k, r, base) => ({ r, color: own(k, shade(base, r)) });
  if (family === "ant") {
    for (let k = 1; k < C; k++) shape[k] = dot(k, K.rMin + (R - K.rMin) * (C <= 2 ? 1 : (k - 1) / (C - 2)), ink);
  } else if (family === "table") {
    const last = C - 1;
    for (let k = 1; k < C; k++) {
      // 신호색 상태(머리·꼬리)는 signal 표시를 붙여 둔다(편집기의 상태 견본이 .signal 을 쓴다)
      if (k === 1) shape[k] = { ...dot(k, R, signal), signal: true };
      else if (k === 2) shape[k] = { ...dot(k, K.tail, signal), signal: true };
      else shape[k] = dot(k, last === 3 ? K.wire : R - ((R - K.wire) * (k - 3)) / (last - 3), ink);
    }
  } else if (family === "elementary") {
    shape[1] = { r: R, color: own(1, ink) };
    // 지난 줄: --row-keep 줄까지는 그대로, 그 뒤 --row-fade 줄 동안 가장 작은 점까지
    const radius = (a) => (a <= K.keep ? R : R - (R - K.rMin) * Math.min(1, (a - K.keep) / K.fade));
    out.ageMax = Math.ceil(K.keep + K.fade);
    out.age = (a) => {
      const r = radius(Math.min(a, out.ageMax));
      return { r, color: own(1, shade(ink, r)) };
    };
  } else {
    // 아직 모양을 정하지 않은 계열: 1번이 잉크, 번호가 클수록 작고 옅게
    for (let k = 1; k < C; k++) shape[k] = dot(k, R - (R - K.rMin) * ((k - 1) / Math.max(1, C - 2)), ink);
  }
  return out;
}
