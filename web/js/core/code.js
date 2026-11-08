// 코드로 규칙 쓰기(family: "code"). 사용자가 (지금 상태, 상태별 이웃 수) => 다음 상태 함수를 쓴다.
//   상태별 이웃 수(counts): 길이가 상태 수인 배열. 무어 이웃 8칸을 상태마다 센 것(다 더하면 8)
// 함수는 Worker(core/code-worker.js) 안에서만 부른다. 거기서 (지금 상태, 이웃 수 조합) → 다음 상태 표를 한 번 만들고,
// 돌리기는 그 표로만 한다(plane.step 의 큰 무게 길). 표는 규칙 파일에 넣지 않는다.
//
// 이웃 수 조합을 표의 칸 번호로: 상태 s(1 이상) 이웃 하나를 9^(s−1) 로 더한 합은 조합마다 다르다(상태 0 의 수는 8 에서 뺀 나머지).
// 합 → 칸 번호는 compact 배열로 찾는다. 칸 번호 0 은 이웃이 모두 빈칸인 조합이라, 표[0] 이 0 이 아니면 잠근다.

export const MIN_CODE_STATES = 2;
export const MAX_CODE_STATES = 8;
/** 코드 글의 길이 끝 */
export const MAX_SOURCE = 20000;

/** 예시 코드: 생명 게임(B3/S23). 화면의 코드 칸에 처음 들어간다(설명 글은 화면 쪽) */
export const EXAMPLE_SOURCE = `(state, counts) => {
  if (state === 0) return counts[1] === 3 ? 1 : 0;
  return counts[1] === 2 || counts[1] === 3 ? 1 : 0;
}`;

const layouts = new Map();

/**
 * 상태 수에 맞는 표의 꼴. { states, V(조합 수), combos(조합마다 counts), weights(Uint32Array), compact(합 → 칸 번호) }
 * 같은 상태 수는 한 번만 만든다
 */
export function codeLayout(states) {
  if (layouts.has(states)) return layouts.get(states);
  const weights = new Uint32Array(states);
  for (let s = 1; s < states; s++) weights[s] = 9 ** (s - 1);
  const combos = [];
  const c = new Array(states).fill(0);
  (function fill(s, left) {
    if (s === states) {
      c[0] = left;
      combos.push(c.slice());
      return;
    }
    for (let k = 0; k <= left; k++) {
      c[s] = k;
      fill(s + 1, left - k);
    }
    c[s] = 0;
  })(1, 8);
  const max = states > 1 ? 8 * weights[states - 1] : 0;
  const compact = new Uint16Array(max + 1);
  combos.forEach((cs, i) => {
    let sum = 0;
    for (let s = 1; s < states; s++) sum += cs[s] * weights[s];
    compact[sum] = i;
  });
  const out = { states, V: combos.length, combos, weights, compact };
  layouts.set(states, out);
  return out;
}

/** counts(상태마다 이웃 수) 의 칸 번호 */
export function codeIndex(counts, layout) {
  let sum = 0;
  for (let s = 1; s < layout.states; s++) sum += counts[s] * layout.weights[s];
  return layout.compact[sum];
}

/** 무엇이 틀렸는지 담은 오류. info: { kind, state?, counts?, value?, message? } */
function codeError(kind, info = {}) {
  const e = new Error(info.message ?? kind);
  e.info = { kind, ...info };
  return e;
}

const show = (v) => {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean" || v === null || v === undefined) return String(v);
  if (typeof v === "function") return "function";
  try {
    return JSON.stringify(v).slice(0, 40);
  } catch {
    return typeof v;
  }
};

/**
 * 코드 글을 함수로. Worker 안에서만 부른다.
 * 틀리면 info.kind 가 syntax(글을 읽을 수 없음) · notfunction(함수가 아님) 인 오류를 던진다
 */
export function compileSource(source) {
  let fn;
  try {
    // 줄 바꿈으로 감싸서 코드 끝의 // 주석이 닫는 괄호를 먹지 않게 한다
    fn = new Function(`"use strict";\nreturn (\n${source}\n);`)();
  } catch (e) {
    throw codeError("syntax", { message: String(e?.message ?? e) });
  }
  if (typeof fn !== "function") throw codeError("notfunction", { value: show(fn) });
  return fn;
}

/**
 * 함수로 표를 만든다: table[지금 상태 * V + 칸 번호] = 다음 상태. Worker 안에서만 부른다.
 * 틀리면 info.kind 가 throw(함수가 오류를 냄) · value(0–상태 수−1 정수가 아님) 이고 그때의 state·counts 가 든 오류를 던진다
 */
export function buildCodeTable(fn, states) {
  const L = codeLayout(states);
  const table = new Uint8Array(states * L.V);
  for (let s = 0; s < states; s++) {
    for (let i = 0; i < L.V; i++) {
      let v;
      try {
        v = fn(s, L.combos[i].slice());
      } catch (e) {
        throw codeError("throw", { state: s, counts: L.combos[i].slice(), message: String(e?.message ?? e) });
      }
      if (!(Number.isInteger(v) && v >= 0 && v < states)) throw codeError("value", { state: s, counts: L.combos[i].slice(), value: show(v) });
      table[s * L.V + i] = v;
    }
  }
  return table;
}

/** 이웃이 모두 빈칸인 빈칸이 바뀌면(표[0] ≠ 0) 끝없는 격자에서 돌릴 수 없다 */
export const codeLocked = (table) => table[0] !== 0;

/**
 * Worker 가 받는 일 하나. { id, source, states } → { id, ok: true, table } 또는 { id, ok: false, error: { kind, … } }
 * Worker 안에서만 부른다(사용자 코드를 부르니까)
 */
export function runCodeJob({ id = null, source, states }) {
  try {
    if (typeof source !== "string" || !source.trim()) throw codeError("empty");
    if (source.length > MAX_SOURCE) throw codeError("long", { value: source.length });
    if (!(Number.isInteger(states) && states >= MIN_CODE_STATES && states <= MAX_CODE_STATES)) throw codeError("states", { value: states });
    const fn = compileSource(source);
    const table = buildCodeTable(fn, states);
    return { id, ok: true, table, locked: codeLocked(table) };
  } catch (e) {
    return { id, ok: false, error: e.info ?? { kind: "throw", message: String(e?.message ?? e) } };
  }
}
