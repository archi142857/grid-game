// 개미·터마이트(family: "ant"). 칸 색은 0(빈칸)부터 색 수-1 까지.
//   개미: rule.turns 는 칸 색마다 회전 글자 하나. 밟은 칸의 색 c 의 글자대로 돌고, 칸을 (c+1) % 색 수 로 칠하고, 앞으로 한 칸.
//   터마이트: 개미에게 속 상태가 있다. rule.machine[개미 상태][칸 색] = [쓸 색, 회전 글자, 다음 개미 상태]. 개미 상태는 0 에서 시작.
// 회전 글자: L 왼쪽 · R 오른쪽 · N 그대로 · U 뒤로. 방향(dir): 0 위 · 1 오른쪽 · 2 아래 · 3 왼쪽(규칙 파일에서는 N·E·S·W).
// 개미가 여럿이면 놓인 차례대로 한 걸음씩 간다. 같은 칸에 있으면 뒤 개미는 앞 개미가 칠한 색을 본다.

/** 칸 색 수(= 상태 수)의 끝 */
export const MAX_ANT_COLORS = 16;
/** 터마이트 속 상태 수의 끝 */
export const MAX_ANT_STATES = 16;
/** 개미 수의 끝 */
export const MAX_AGENTS = 64;

/** 회전 글자. 자리 번호가 곧 시계 방향으로 도는 횟수(N 0 · R 1 · U 2 · L 3) */
export const TURN_LETTERS = "NRUL";
/** 규칙 파일의 방향 글자. 자리 번호가 곧 dir */
export const DIR_LETTERS = "NESW";

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** 개미 표기(LLRR 처럼 L·R·N·U 글자만, 색 수만큼)를 읽는다. 못 읽으면 null */
export function parseTurns(text) {
  const s = String(text ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  if (!/^[LRNU]+$/.test(s) || s.length < 2 || s.length > MAX_ANT_COLORS) return null;
  return s;
}

/** turns 나 machine 이 맞는 꼴인지. 맞으면 null, 틀리면 무엇이 틀렸는지 낱말(turns · machine · both · none) */
export function antRuleProblem({ turns, machine }, colors) {
  if (turns !== undefined && machine !== undefined) return "both";
  if (turns !== undefined) return typeof turns === "string" && parseTurns(turns) === turns && turns.length === colors ? null : "turns";
  if (machine === undefined) return "none";
  if (!Array.isArray(machine) || machine.length < 1 || machine.length > MAX_ANT_STATES) return "machine";
  const m = machine.length;
  const okCell = (x) =>
    Array.isArray(x) &&
    x.length === 3 &&
    Number.isInteger(x[0]) &&
    x[0] >= 0 &&
    x[0] < colors &&
    typeof x[1] === "string" &&
    x[1].length === 1 &&
    TURN_LETTERS.includes(x[1]) &&
    Number.isInteger(x[2]) &&
    x[2] >= 0 &&
    x[2] < m;
  return machine.every((row) => Array.isArray(row) && row.length === colors && row.every(okCell)) ? null : "machine";
}

/**
 * 규칙을 찾아보기 표로. i = 개미 상태 * 색 수 + 칸 색
 *   write[i] 쓸 색 · turn[i] 시계 방향으로 도는 횟수 · next[i] 다음 개미 상태
 */
export function compileAnt({ turns, machine }, colors) {
  const m = machine ? machine.length : 1;
  const write = new Uint8Array(m * colors);
  const turn = new Uint8Array(m * colors);
  const next = new Uint8Array(m * colors);
  for (let s = 0; s < m; s++) {
    for (let c = 0; c < colors; c++) {
      const i = s * colors + c;
      if (machine) {
        const [w, l, n] = machine[s][c];
        write[i] = w;
        turn[i] = TURN_LETTERS.indexOf(l);
        next[i] = n;
      } else {
        write[i] = (c + 1) % colors;
        turn[i] = TURN_LETTERS.indexOf(turns[c]);
        next[i] = 0;
      }
    }
  }
  return { colors, states: m, write, turn, next };
}

/**
 * 개미들을 한 걸음씩. plane 의 get·set 으로 칸을 읽고 칠한다.
 * agents: [{ x, y, dir, state }] 를 그 자리에서 바꾼다. 바뀐 칸 수를 돌려준다
 */
export function stepAnts(plane, agents, prog) {
  const { colors, write, turn, next } = prog;
  let changed = 0;
  for (const a of agents) {
    let c = plane.get(a.x, a.y);
    if (c >= colors) c = 0;
    const i = a.state * colors + c;
    a.dir = (a.dir + turn[i]) & 3;
    if (write[i] !== c) {
      plane.set(a.x, a.y, write[i]);
      changed++;
    }
    a.state = next[i];
    a.x += DX[a.dir];
    a.y += DY[a.dir];
  }
  return changed;
}
