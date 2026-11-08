// 1차원 기본 세포 자동자(family: "elementary"). 칸은 꺼짐(0)·켜짐(1) 둘, 이웃은 왼쪽·자기·오른쪽 세 칸.
// 세 칸의 무늬(111 … 000)를 2진수 p(0–7)로 읽고, 규칙 번호(Wolfram 번호 0–255)의 p 번째 비트가 다음 줄의 그 칸이 된다.
// 세대 t 의 줄은 y = t 에 둔다(0세대 줄이 y = 0). 줄은 아래로 쌓이고 오래된 줄은 지운다.
// 홀수 번호는 000 → 1 이라 빈 곳이 한꺼번에 켜져서 끝없는 격자에서는 돌릴 수 없다(잠근다).

/** 남길 줄 수: 줄이 넓을수록 적게 남긴다(칸이 약 100만 개를 넘지 않게) */
export const ROWS_MIN = 128;
export const ROWS_MAX = 1024;
const BUDGET = 1 << 20;
/** 지금 줄의 너비가 이만큼을 넘으면 너무 넓게 퍼진 것으로 보고 멈춘다 */
export const MAX_WIDTH = 8192;

/** 지금 줄의 너비가 w 일 때 남길 줄 수 */
export const rowsKept = (w) => Math.max(ROWS_MIN, Math.min(ROWS_MAX, Math.floor(BUDGET / Math.max(1, w))));

/** 홀수(000 → 1)는 돌릴 수 없다 */
export const isLockedNumber = (n) => (n & 1) === 1;

/** 세 칸(왼쪽, 가운데, 오른쪽)의 무늬 번호 0–7 */
export const patternOf = (l, c, r) => ((l ? 4 : 0) | (c ? 2 : 0) | (r ? 1 : 0));

/** 무늬 p 에서 다음 줄의 칸 */
export const nextOf = (number, p) => (number >> p) & 1;

/** 표기 W30(Golly 꼴)을 읽는다. 0–255 가 아니면 null */
export function parseWolfram(text) {
  const m = String(text ?? "")
    .replace(/\s+/g, "")
    .match(/^W(\d{1,3})$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n <= 255 ? n : null;
}

export const formatWolfram = (n) => `W${n}`;

/**
 * 줄 하나를 넘긴다. row 는 지금 줄의 x0-1 … x1+1(양옆에 빈칸 한 칸씩 더)을 담은 배열.
 * 다음 줄의 x0 … x1 을 돌려준다(row 보다 두 칸 짧다)
 */
export function stepRow(row, number) {
  const out = new Uint8Array(Math.max(0, row.length - 2));
  for (let i = 0; i < out.length; i++) out[i] = (number >> ((row[i] << 2) | (row[i + 1] << 1) | row[i + 2])) & 1;
  return out;
}
