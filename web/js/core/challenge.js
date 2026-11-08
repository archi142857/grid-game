// 도전 과제 판정(계열 확장 설계 7·9절). 문제 파일은 web/data/challenges/index.json(엔진), 문제 글은 web/js/data/challenges.js(문구).
// 문제: { id, family, rule, start, limits: { cells?, minCells?, box?: [w, h] }, goal: { type, … } }
//   rule: 표기(B3/S23 · W90) 또는 "choose"(답에서 고름)
//   start: "empty"(답의 칸을 놓음) · "single"(가운데 한 칸) · RLE 글(왼쪽 위가 (0, 0))
//   goal.type: survive { gens } · period { p } · ship { within } · grow { gens, min } · match { gens, rule | frames | final }
//   match 의 정답은 rule(표기), frames(세대마다 모습 gens+1 장) 또는 final(gens 세대의 모습 한 장. 1차원은 지난 줄이 다 남아 있어 이것으로 충분)
// 답: { cells: [[x, y(, 상태)]…] }(칸을 놓는 문제) · { rule: "B36/S23" }(규칙을 고르는 문제)
// judge 는 { ok, why, gen?, value? } 를 돌려준다. why 는 낱말이고 글은 화면 쪽이 만든다.
// 판정은 너그럽게: 알려진 답이 아니어도 조건에 맞으면 푼 것이다. 알려진 답은 tests/ 에만 둔다.

import { makeSim } from "./sim.js";
import { parseCode, lockOf, ruleFromCode } from "./rules.js";
import { parseRLE, formatRLE, readRows } from "./rle.js";

export const GOALS = ["survive", "period", "ship", "grow", "match"];
/** ship 의 기본: 이 세대 안에 같은 모양이 다른 자리에 나와야 한다 */
export const SHIP_WITHIN = 32;

/** sim 의 빈칸 아닌 칸 [[x, y, 상태]…](화면에서 답을 모을 때) */
export function cellsOf(src) {
  const b = src.bounds();
  if (!b) return [];
  const out = [];
  readRows(src, b).forEach((row, y) => row.forEach((v, x) => v && out.push([b.x0 + x, b.y0 + y, v])));
  return out;
}

/** 지금 모습: 네모 왼쪽 위와 줄들. 비었으면 null */
function snap(sim) {
  const b = sim.bounds();
  if (!b) return null;
  return { x: b.x0, y: b.y0, rows: readRows(sim, b) };
}
const shapeKey = (s) => (s ? s.rows.map((r) => r.join(",")).join("/") : "");
const fullKey = (s) => (s ? `${s.x},${s.y}|${shapeKey(s)}` : "");

/** match 의 frames 한 장: { x, y, rle } 또는 null(빈 판) */
export function frameOf(sim) {
  const s = snap(sim);
  return s ? { x: s.x, y: s.y, rle: formatRLE(s.rows, { states: sim.rule.states.length }) } : null;
}
function frameKey(f) {
  if (!f) return "";
  const { rows, w } = parseRLE(f.rle);
  return `${f.x},${f.y}|${shapeKey({ rows: rows.map((r) => (r.length < w ? [...r, ...new Array(w - r.length).fill(0)] : r)) })}`;
}

/** 문제와 답에서 돌릴 규칙. 못 고르면 { why } */
function pickRule(problem, answer) {
  const choose = problem.rule === "choose";
  const code = parseCode(choose ? answer.rule : problem.rule);
  if (!code || code.family !== problem.family) return { why: choose ? "rule" : "problem" };
  const rule = ruleFromCode(code, { id: problem.id });
  if (lockOf(rule)) return { why: "locked" };
  return { rule };
}

/** 시작 칸들. 칸을 놓는 문제는 한도를 본다. 틀리면 { why, value? } */
function pickStart(problem, answer, states) {
  if (problem.start === "single") return { cells: [[0, 0, 1]] };
  if (problem.start && problem.start !== "empty") {
    const cells = [];
    parseRLE(problem.start).rows.forEach((row, y) => row.forEach((v, x) => v && cells.push([x, y, v])));
    return { cells };
  }
  const raw = Array.isArray(answer.cells) ? answer.cells : [];
  const seen = new Set();
  const cells = [];
  for (const c of raw) {
    const [x, y, v = 1] = c;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(v) || v <= 0 || v >= states) return { why: "cell" };
    const k = `${x},${y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    cells.push([x, y, v]);
  }
  const lim = problem.limits ?? {};
  if (!cells.length) return { why: "empty" };
  if (lim.cells !== undefined && cells.length > lim.cells) return { why: "toomany", value: cells.length };
  if (lim.minCells !== undefined && cells.length < lim.minCells) return { why: "toofew", value: cells.length };
  if (lim.box) {
    const [w, h] = Array.isArray(lim.box) ? lim.box : [lim.box.w, lim.box.h];
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const bw = Math.max(...xs) - Math.min(...xs) + 1;
    const bh = Math.max(...ys) - Math.min(...ys) + 1;
    if (bw > w || bh > h) return { why: "outside", value: [bw, bh] };
  }
  return { cells };
}

/** 문제의 규칙과 시작으로 sim 을 만든다(화면에서 보기 무늬를 돌릴 때도 쓴다). 틀리면 { why } */
export function setup(problem, answer = {}) {
  const r = pickRule(problem, answer);
  if (!r.rule) return { why: r.why };
  const st = pickStart(problem, answer, r.rule.states.length);
  if (!st.cells) return st;
  const sim = makeSim(r.rule);
  for (const [x, y, v] of st.cells) sim.set(x, y, v);
  return { sim, rule: r.rule, cells: st.cells };
}

/**
 * 판정. → { ok, why, gen?, value? }
 *   why(맞음): ok
 *   why(틀림): problem(문제 파일이 틀림) · rule(고른 규칙을 못 읽음/계열이 다름) · locked(돌릴 수 없는 규칙) · cell(칸 값이 틀림)
 *     empty(칸이 없음) · toomany·toofew(칸 수, value) · outside(네모를 넘음, value [w, h])
 *     died(gen 세대에 다 사라짐) · early(gen 세대에 벌써 처음 모습) · period(p 세대 뒤 처음 모습이 아님)
 *     noship(within 세대 안에 옮겨 간 같은 모양이 없음) · small(gens 세대 뒤 산 칸 value 개) · differs(gen 세대부터 달라짐) · wide(너무 넓게 퍼짐)
 */
export function judge(problem, answer = {}) {
  const goal = problem.goal ?? {};
  if (!GOALS.includes(goal.type)) return { ok: false, why: "problem" };
  const s = setup(problem, answer);
  if (!s.sim) return { ok: false, ...s };
  const sim = s.sim;
  const no = (why, more = {}) => ({ ok: false, why, ...more });
  const yes = (more = {}) => ({ ok: true, why: "ok", ...more });
  const advance = () => sim.step() !== null;

  if (goal.type === "survive") {
    for (let g = 1; g <= goal.gens; g++) {
      if (!advance()) return yes({ gen: g - 1 }); // 너무 넓게 퍼져도 살아 있다
      if (!sim.bounds()) return no("died", { gen: g });
    }
    return yes();
  }

  if (goal.type === "period") {
    const k0 = fullKey(snap(sim));
    for (let g = 1; g <= goal.p; g++) {
      if (!advance()) return no("wide", { gen: g });
      const k = fullKey(snap(sim));
      if (!k) return no("died", { gen: g });
      if (g < goal.p && k === k0) return no("early", { gen: g });
      if (g === goal.p && k !== k0) return no("period");
    }
    return yes();
  }

  if (goal.type === "ship") {
    const s0 = snap(sim);
    const shape0 = shapeKey(s0);
    const within = goal.within ?? SHIP_WITHIN;
    for (let g = 1; g <= within; g++) {
      if (!advance()) return no("wide", { gen: g });
      const sg = snap(sim);
      if (!sg) return no("died", { gen: g });
      if (shapeKey(sg) === shape0 && (sg.x !== s0.x || sg.y !== s0.y)) return yes({ gen: g, value: [sg.x - s0.x, sg.y - s0.y] });
    }
    return no("noship");
  }

  if (goal.type === "grow") {
    for (let g = 1; g <= goal.gens; g++) {
      if (!advance()) return yes({ gen: g - 1, value: sim.alive }); // 너무 넓게 퍼졌으면 충분히 자랐다
      if (!sim.bounds()) return no("died", { gen: g });
    }
    return sim.alive >= goal.min ? yes({ value: sim.alive }) : no("small", { value: sim.alive });
  }

  // match: 정답 규칙(rule)·세대마다 모습(frames)·마지막 모습(final)과 같아야 한다
  let target = null;
  if (goal.rule) {
    const t = setup({ ...problem, rule: goal.rule }, { cells: s.cells });
    if (!t.sim) return no("problem");
    target = t.sim;
  } else if (goal.final === undefined && (!Array.isArray(goal.frames) || goal.frames.length < goal.gens + 1)) return no("problem");
  for (let g = 0; g <= goal.gens; g++) {
    if (g > 0) {
      if (!advance()) return no("wide", { gen: g });
      if (target) target.step();
    }
    if (!target && !goal.frames && g < goal.gens) continue;
    const want = target ? fullKey(snap(target)) : frameKey(goal.frames ? goal.frames[g] : goal.final);
    if (fullKey(snap(sim)) !== want) return no("differs", { gen: g });
  }
  return yes();
}

/** match 문제의 frames 를 만든다(문제 파일을 만들 때 엔진이 쓴다) */
export function makeFrames(problem, secretRule) {
  const t = setup({ ...problem, rule: secretRule }, {});
  if (!t.sim) throw new Error(`makeFrames: ${t.why}`);
  const out = [frameOf(t.sim)];
  for (let g = 1; g <= problem.goal.gens; g++) {
    t.sim.step();
    out.push(frameOf(t.sim));
  }
  return out;
}
