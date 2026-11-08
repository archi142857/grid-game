// 조건표(family: "table"). "지금 A 이고 이웃 중 B 인 칸이 n개면 → C" 꼴의 줄을 위에서부터 보고, 처음 맞는 줄을 쓴다.
//   rule.transitions: [{ from, to, when? }]
//   when: { state, count: [0–8 …] } 무어 이웃 8칸 가운데 그 상태인 칸 수가 count 에 있으면 맞는다. when 이 없으면 늘 맞는다.
//   맞는 줄이 없으면 그대로.
// 세는 상태(when.state)는 규칙마다 두 가지까지. 첫째는 무게 1, 둘째는 무게 9 로 더해서(이웃 수 a + 9b) 표 하나로 찾는다.
// 빈칸(0)은 셀 수 없다: 끝없는 격자의 빈 곳은 칸이 없는 조각이라 셀 수가 없다.
// 이웃이 하나도 없는 빈칸이 바뀌는 규칙은 빈 곳이 한꺼번에 바뀌어서 돌릴 수 없다(잠근다).

/** 와이어월드의 줄(상태: 0 빈칸 · 1 전자 머리 · 2 전자 꼬리 · 3 도선). RLE 머리 줄의 rule = WireWorld 가 이것 */
export const WIREWORLD = Object.freeze([
  Object.freeze({ from: 1, to: 2 }),
  Object.freeze({ from: 2, to: 3 }),
  Object.freeze({ from: 3, to: 1, when: Object.freeze({ state: 1, count: Object.freeze([1, 2]) }) }),
]);

/** 와이어월드와 같은 규칙인가(상태 4개, 줄이 같다) */
export const isWireworld = (r) => r.family === "table" && r.states.length === 4 && JSON.stringify(r.transitions) === JSON.stringify(WIREWORLD);

/** 상태 수의 끝 */
export const MAX_TABLE_STATES = 16;
/** 줄 수의 끝 */
export const MAX_TRANSITIONS = 64;
/** 세는 상태 수의 끝 */
export const MAX_COUNTED = 2;

const isState = (v, states) => Number.isInteger(v) && v >= 0 && v < states;
const isCountList = (xs) => Array.isArray(xs) && xs.every((n) => Number.isInteger(n) && n >= 0 && n <= 8);

/** 세는 상태(나온 차례대로) */
export function countedStates(transitions) {
  const out = [];
  for (const tr of transitions) if (tr.when && !out.includes(tr.when.state)) out.push(tr.when.state);
  return out;
}

/**
 * 줄들이 맞는 꼴인지. 맞으면 null, 틀리면 { why, i }
 *   list: 배열이 아니거나 줄이 너무 많음 · row: i 번째 줄의 꼴 · zero: i 번째 줄이 빈칸(0)을 셈
 *   many: 세는 상태가 MAX_COUNTED 보다 많음 · lock: 이웃 없는 빈칸이 바뀜
 */
export function tableProblem(transitions, states) {
  if (!Array.isArray(transitions) || transitions.length > MAX_TRANSITIONS) return { why: "list" };
  for (let i = 0; i < transitions.length; i++) {
    const tr = transitions[i];
    const ok =
      tr &&
      typeof tr === "object" &&
      isState(tr.from, states) &&
      isState(tr.to, states) &&
      (tr.when === undefined || (tr.when && typeof tr.when === "object" && isState(tr.when.state, states) && isCountList(tr.when.count)));
    if (!ok) return { why: "row", i };
    if (tr.when && tr.when.state === 0) return { why: "zero", i };
  }
  if (countedStates(transitions).length > MAX_COUNTED) return { why: "many" };
  if (compileTable(transitions, states).table[0] !== 0) return { why: "lock" };
  return null;
}

/**
 * 줄들을 plane.step 이 쓰는 표로.
 *   table[지금 상태 * stride + 이웃 무게 합] = 다음 상태
 *   weights: 상태마다 무게(세는 상태가 산 칸 하나뿐이면 null — Life 와 같은 빠른 길)
 */
export function compileTable(transitions, states) {
  const counted = countedStates(transitions);
  const stride = counted.length > 1 ? 81 : 9;
  let weights = new Uint8Array(states);
  if (counted.length > 0) weights[counted[0]] = 1;
  if (counted.length > 1) weights[counted[1]] = 9;
  if (counted.length === 1 && counted[0] === 1) weights = null;
  const table = new Uint8Array(states * stride);
  for (let s = 0; s < states; s++) {
    for (let n = 0; n < stride; n++) {
      const counts = [n % 9, Math.floor(n / 9)];
      table[s * stride + n] = nextState(transitions, counted, s, counts);
    }
  }
  return { table, weights, stride, counted };
}

/** 지금 상태 s, 세는 상태마다의 이웃 수 counts(counted 와 같은 차례)일 때 맞는 줄의 번호. 없으면 -1 */
export function matchRow(transitions, counted, s, counts) {
  for (let i = 0; i < transitions.length; i++) {
    const tr = transitions[i];
    if (tr.from !== s) continue;
    if (tr.when && !tr.when.count.includes(counts[counted.indexOf(tr.when.state)] ?? 0)) continue;
    return i;
  }
  return -1;
}

function nextState(transitions, counted, s, counts) {
  const i = matchRow(transitions, counted, s, counts);
  return i < 0 ? s : transitions[i].to;
}
