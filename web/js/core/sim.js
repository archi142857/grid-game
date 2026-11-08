// 엔진과 화면 사이의 꼴(계열 확장 설계 2절). 계열이 무엇이든 화면은 makeSim(rule) 이 돌려주는 sim 만 부른다.
// 모든 계열이 끝없는 격자(core/plane.js) 위에서 돈다. 칸 자리는 정수 (x, y), 가운데가 (0, 0) 이고 오른쪽·아래로 커진다.
// 세대 수·기록·처음 모습·보는 자리는 화면 쪽(ui/world.js)이 맡는다. sim 은 칸과 계산만.
// 화면 글은 만들지 않는다. 살펴보기의 까닭(why)은 짧은 낱말로만 돌려주고, 글은 프론트엔드가 t() 로 만든다.

import { makePlane, REACH } from "./plane.js";
import { makeTable, explain as lifeExplain } from "./life.js";
import { compileAnt, stepAnts, MAX_AGENTS, TURN_LETTERS, DIR_LETTERS } from "./ant.js";
import { stepRow, rowsKept, isLockedNumber, patternOf, nextOf, MAX_WIDTH } from "./elementary.js";
import { compileTable, matchRow } from "./table.js";
import { nextColor, cyclicNeighbors } from "./cyclic.js";
import { parseRLE } from "./rle.js";
import { lifeRule } from "./rules.js";

export { MAX_ANT_COLORS, MAX_ANT_STATES, MAX_AGENTS } from "./ant.js";
export { ROWS_MIN, ROWS_MAX, MAX_WIDTH, rowsKept } from "./elementary.js";
export { MAX_TABLE_STATES, MAX_TRANSITIONS, MAX_COUNTED } from "./table.js";
export { MAX_CYCLIC_STATES, CYCLIC_THRESHOLD } from "./cyclic.js";

/** 쓰는 조각(32×32)이 이만큼을 넘으면(약 100만 칸) 너무 넓게 퍼진 것으로 보고 멈춘다 */
export const MAX_TILES = 1024;

const NONE = Object.freeze([]);

/** (x, y) 의 무어 이웃 8칸. 왼쪽 위부터 줄 순서 */
export const around = (x, y) => [
  [x - 1, y - 1],
  [x, y - 1],
  [x + 1, y - 1],
  [x - 1, y],
  [x + 1, y],
  [x - 1, y + 1],
  [x, y + 1],
  [x + 1, y + 1],
];

const BUILD = { life: lifeSim, ant: antSim, elementary: elementarySim, table: tableSim, cyclic: cyclicSim };

/** 이 엔진이 sim 으로 돌릴 수 있는 계열 */
export const SIM_FAMILIES = Object.keys(BUILD);

/** rule: checkRuleFile(…).rule */
export function makeSim(rule) {
  const build = BUILD[rule?.family];
  if (!build) throw new Error(`makeSim: 아직 sim 이 없는 계열이에요 (${rule?.family})`);
  return build(rule);
}

// ── 같이 쓰는 것 ─────────────────

/** region({ x, y, w, h }) 가운데 area(0–1) 몫 안의 칸을 density 확률로 pick() 값으로 칠한다. 줄 순서로 난수를 쓴다 */
function fillRegion(P, region, density, area, rng, pick = null) {
  const aw = Math.max(1, Math.round(region.w * area));
  const ah = Math.max(1, Math.round(region.h * area));
  const x0 = region.x + Math.floor((region.w - aw) / 2);
  const y0 = region.y + Math.floor((region.h - ah) / 2);
  for (let y = y0; y < y0 + ah; y++) for (let x = x0; x < x0 + aw; x++) if (rng.next() < density) P.set(x, y, pick ? pick() : 1);
}

/** 무늬(줄마다 상태 배열)를 (cx, cy) 가운데에 놓는다. 0 과 규칙에 없는 상태는 건너뛴다 */
function putRows(P, rows, cx, cy, states) {
  const pw = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const x0 = Math.round(cx - pw / 2);
  const y0 = Math.round(cy - rows.length / 2);
  rows.forEach((row, y) => row.forEach((s, x) => s > 0 && s < states && P.set(x0 + x, y0 + y, s)));
}

const regionCenter = (region) => [region.x + region.w / 2, region.y + region.h / 2];

// ── Life 계열과 조건표 ─────────────────
// 둘 다 (지금 상태, 이웃) → 다음 상태 표를 plane.step 으로 돌린다. 앞 세대가 남아 사이를 잇는다.

function lifeSim(rule) {
  return cellSim(rule, {
    family: "life",
    compile: (r) => ({ table: makeTable(lifeRule(r)), weights: null, stride: 9 }),
    /** 흩뿌리기·random 뿌리기는 산 칸(1)으로 */
    pick: null,
    /**
     * 살펴보기: 칸 하나가 다음 세대에 어떻게 되는지.
     * { now, next, why, n(산 이웃 수), cells(이웃 8칸 자리) }. why 는 core/life.js 의 explain 과 같다
     *   born · stay · survive · die · fade · fading · gone
     */
    explain(P, r, x, y) {
      const cells = around(x, y);
      let n = 0;
      for (const [a, b] of cells) if (P.get(a, b) === 1) n++;
      const now = P.get(x, y);
      const e = lifeExplain(lifeRule(r), now, n);
      return { now, next: e.next, why: e.why, n, cells };
    },
  });
}

function tableSim(rule) {
  return cellSim(rule, {
    family: "table",
    compile: (r) => compileTable(r.transitions, r.states.length),
    /** 흩뿌리기·random 뿌리기는 빈칸이 아닌 상태 가운데 무작위로 */
    pick: (rng, states) => () => 1 + rng.int(states - 1),
    /**
     * 살펴보기: { now, next, why, row, counts, n, cells }
     *   why: row(row 번째 줄이 맞음) · stay(맞는 줄이 없어 그대로)
     *   counts: 세는 상태마다 이웃 수 { 상태: 수 }, n: 첫째 세는 상태의 이웃 수, cells: 이웃 8칸 자리
     */
    explain(P, r, x, y, prog) {
      const cells = around(x, y);
      const list = prog.counted.map(() => 0);
      for (const [a, b] of cells) {
        const k = prog.counted.indexOf(P.get(a, b));
        if (k >= 0) list[k]++;
      }
      const now = P.get(x, y);
      const row = matchRow(r.transitions, prog.counted, now, list);
      const counts = Object.fromEntries(prog.counted.map((s, k) => [s, list[k]]));
      return { now, next: row < 0 ? now : r.transitions[row].to, why: row < 0 ? "stay" : "row", row, counts, n: list[0] ?? 0, cells };
    },
  });
}

function cyclicSim(rule) {
  return cellSim(rule, {
    family: "cyclic",
    compile: (r) => ({ colors: r.states.length - 1, threshold: r.threshold, vn: r.neighborhood === "von-neumann" }),
    advance: (P, prog) => P.stepCyclic(prog.colors, prog.threshold, prog.vn),
    /** 바탕은 바뀌지 않으니 늘 돌릴 수 있다 */
    canRun: () => true,
    /** 그래프에는 한 세대에 색이 바뀐 칸 수(움직임)를 쓴다. 바탕 아닌 칸 수는 늘 같아서 */
    changedAsAlive: true,
    /** 흩뿌리기·random 뿌리기는 도는 색 1…N 을 고르게 */
    pick: (rng, states) => () => 1 + rng.int(states - 1),
    /**
     * 살펴보기: { now, next, why, target, n, threshold, cells }
     *   why: turn(다음 색 이웃이 문턱 이상이라 넘어감) · wait(아직 모자람) · base(바탕은 바뀌지 않음)
     *   target: 다음 색, n: 다음 색인 이웃 수, cells: 이웃 자리(폰 노이만 4칸, 무어 8칸)
     */
    explain(P, r, x, y, prog) {
      const cells = cyclicNeighbors(x, y, r.neighborhood);
      const now = P.get(x, y);
      if (now === 0) return { now, next: 0, why: "base", target: null, n: 0, threshold: prog.threshold, cells };
      const target = nextColor(now, prog.colors);
      let n = 0;
      for (const [a, b] of cells) if (P.get(a, b) === target) n++;
      const turn = n >= prog.threshold;
      return { now, next: turn ? target : now, why: turn ? "turn" : "wait", target, n, threshold: prog.threshold, cells };
    },
  });
}

/** 표로 돌리는 계열(Life·조건표)과 순환이 함께 쓰는 sim */
function cellSim(rule, kind) {
  const P = makePlane();
  let r = rule;
  let prog = kind.compile(r);
  let prevOk = false; // 조각마다 바로 앞 세대가 남아 있는가
  let lastChanged = 0; // 바로 앞 세대에 바뀐 칸 수
  const advance = kind.advance ?? ((plane, pr) => plane.step(pr.table, pr.weights, pr.stride, pr.opts));
  const canRun = kind.canRun ?? ((pr) => pr.table[0] === 0);

  const states = () => r.states.length;
  const pick = (rng) => (kind.pick ? kind.pick(rng, states()) : null);

  const sim = {
    family: kind.family,
    get rule() {
      return r;
    },
    /** 이웃이 없는 빈칸이 바뀌면(Life 의 태어남 0 처럼) 빈 곳 전체가 한꺼번에 바뀌어서 끝없는 격자에서는 돌릴 수 없다 */
    canRun: () => canRun(prog),
    get full() {
      return P.size > MAX_TILES;
    },

    /** n 세대를 넘긴다(기본 1). 못 가면 null. 가다가 너무 넓어지면 거기서 멈추고 간 만큼(steps)을 알려 준다 */
    step(n = 1) {
      if (!sim.canRun() || sim.full) return null;
      let changed = 0;
      let k = 0;
      while (k < n) {
        const res = advance(P, prog);
        if (!res) break;
        changed += res.changed;
        lastChanged = res.changed;
        k++;
        if (P.size > MAX_TILES) break;
      }
      if (!k) return null;
      prevOk = true;
      return { alive: sim.alive, changed, steps: k };
    },

    get: (x, y) => P.get(x, y),
    /** 칸 하나를 바꾸고 원래 값을 돌려준다. 규칙에 없는 상태는 받지 않는다 */
    set(x, y, v) {
      if (!(Number.isInteger(v) && v >= 0 && v < states())) return P.get(x, y);
      return P.set(x, y, v);
    },

    /** 그리기용: (x0, y0)–(x1, y1)(양 끝 포함)에 걸친 조각마다 fn(왼쪽 위 x, y, 너비, 높이, 지금 칸, 앞 세대 칸 | null) */
    blocks(x0, y0, x1, y1, fn) {
      const prev = prevOk;
      P.blocks(x0, y0, x1, y1, (ox, oy, s, cells, next) => fn(ox, oy, s, s, cells, prev ? next : null));
    },
    /** 빈칸이 아닌 칸을 모두 덮는 네모(양 끝 포함). 비었으면 null */
    bounds: () => P.bounds(),

    agents: NONE,
    head: null,
    /** 상태 1 인 칸 수(Life 는 산 칸, 와이어월드는 전자 머리). 순환은 바로 앞 세대에 색이 바뀐 칸 수 */
    get alive() {
      return kind.changedAsAlive ? lastChanged : P.alive;
    },
    /** 쓰고 있는 조각 수(넓게 퍼질수록 커진다) */
    get size() {
      return P.size;
    },

    snapshot: () => ({ family: kind.family, states: states(), cells: P.snapshot() }),
    /** 떠 둔 모습으로. 그사이 상태 수가 줄었으면 없어진 상태의 칸은 빈칸이 된다 */
    restore(snap) {
      P.restore(snap.cells);
      if (snap.states > states()) P.clampStates(states());
      prevOk = false;
      lastChanged = 0;
    },

    /** 같은 계열 안에서 규칙만 바꾼다(칸은 그대로). 상태 수가 줄면 없어진 상태의 칸은 빈칸이 된다 */
    setRule(next) {
      if (next.family !== kind.family) throw new Error(`setRule: 계열이 달라요 (${kind.family} → ${next.family}). 새 sim 을 만들어 주세요`);
      const fewer = next.states.length < r.states.length;
      r = next;
      prog = kind.compile(r);
      if (fewer) P.clampStates(states());
      P.markDirty(); // 세는 상태가 바뀌었을 수 있으니 가장자리를 다시 센다
    },

    clear() {
      P.clear();
      prevOk = false;
      lastChanged = 0;
    },

    /** 비우고 규칙 파일의 seed 대로 region 에 뿌린다 */
    seed(region, rng) {
      sim.clear();
      const s = r.seed ?? { type: "empty" };
      if (s.type === "random") fillRegion(P, region, s.density ?? 0.3, s.area ?? 1, rng, pick(rng));
      else if (s.type === "single") P.set(region.x + (region.w >> 1), region.y + (region.h >> 1), 1);
      else if (s.type === "rle") putRows(P, parseRLE(s.data).rows, ...regionCenter(region), states());
    },

    /** 비우고 region 에 무작위로 흩뿌린다. 규칙의 seed 가 random 이면 그 넓이(area) 안에만 */
    scatter(region, density, rng) {
      sim.clear();
      const s = r.seed;
      fillRegion(P, region, density, s && s.type === "random" ? (s.area ?? 1) : 1, rng, pick(rng));
    },

    /** 비우고 무늬(RLE 의 rows)를 (cx, cy) 가운데에 놓는다 */
    place(rows, cx = 0, cy = 0) {
      sim.clear();
      putRows(P, rows, cx, cy, states());
    },

    /** region 안의 상태 1 칸과 빈칸을 뒤바꾼다(다른 상태는 빈칸으로 본다) */
    invert(region) {
      for (let y = region.y; y < region.y + region.h; y++) for (let x = region.x; x < region.x + region.w; x++) P.set(x, y, P.get(x, y) === 1 ? 0 : 1);
      prevOk = false;
    },

    explain: (x, y) => kind.explain(P, r, x, y, prog),
  };
  return sim;
}

// ── 개미·터마이트 ─────────────────
// 칸은 plane 에 색(0–색 수-1)으로, 개미는 따로 [{ x, y, dir, state }] 로 둔다. 앞 칸은 주지 않는다(사이를 잇지 않음).

const DEFAULT_AGENTS = [{ x: 0, y: 0, dir: "N" }];
const inReach = (a) => a.x >= -REACH && a.x < REACH && a.y >= -REACH && a.y < REACH;

function antSim(rule) {
  const P = makePlane();
  let r = rule;
  let prog = compileAnt(r, r.states.length);
  const agents = [];
  let gone = false; // 개미가 칸을 둘 수 있는 끝 밖으로 나갔다
  let since = 0; // 빈 조각을 치운 뒤 걸음 수

  const colors = () => r.states.length;

  function addAgent(x, y, dir = 0) {
    const a = { x: Math.round(x), y: Math.round(y), dir: dir & 3, state: 0 };
    if (agents.length >= MAX_AGENTS || !inReach(a)) return -1;
    agents.push(a);
    return agents.length - 1;
  }

  /** 규칙 파일의 개미(놓는 곳 가운데 기준)를 (cx, cy) 둘레에 놓는다 */
  function placeAgents(cx, cy) {
    for (const a of r.agents ?? DEFAULT_AGENTS) addAgent(cx + a.x, cy + a.y, Math.max(0, DIR_LETTERS.indexOf(a.dir)));
  }

  /** 칸 색을 무작위로(1–색 수-1) 칠할 때 */
  const randomColor = (rng) => () => 1 + rng.int(colors() - 1);

  const sim = {
    family: "ant",
    get rule() {
      return r;
    },
    /** 개미는 어떤 규칙이든 돌릴 수 있다(개미가 없으면 걸어도 아무 일이 없다) */
    canRun: () => true,
    /** 너무 넓게 퍼졌거나, 개미가 칸을 둘 수 있는 끝(가운데에서 약 96만 칸) 밖으로 나갔다 */
    get full() {
      return gone || P.size > MAX_TILES;
    },

    /** 모든 개미가 n 걸음(기본 1). 못 가면 null. → { alive(빈칸 아닌 칸), changed(칠한 칸), steps } */
    step(n = 1) {
      if (sim.full) return null;
      let changed = 0;
      let k = 0;
      while (k < n) {
        changed += stepAnts(P, agents, prog);
        k++;
        if (++since >= 1024) {
          since = 0;
          P.prune();
        }
        if (!agents.every(inReach)) {
          gone = true;
          break;
        }
        if (P.size > MAX_TILES) {
          P.prune();
          if (P.size > MAX_TILES) break;
        }
      }
      return { alive: P.filled, changed, steps: k };
    },

    get: (x, y) => P.get(x, y),
    /** 칸 색을 바꾸고 원래 값을 돌려준다. 규칙에 없는 색은 받지 않는다 */
    set(x, y, v) {
      if (!(Number.isInteger(v) && v >= 0 && v < colors())) return P.get(x, y);
      return P.set(x, y, v);
    },
    /** 그리기용. 앞 칸은 늘 null */
    blocks(x0, y0, x1, y1, fn) {
      P.blocks(x0, y0, x1, y1, (ox, oy, s, cells) => fn(ox, oy, s, s, cells, null));
    },
    /** 칠한 칸과 개미 자리를 모두 덮는 네모. 둘 다 없으면 null */
    bounds() {
      let b = P.bounds();
      for (const a of agents) {
        if (!b) b = { x0: a.x, y0: a.y, x1: a.x, y1: a.y };
        else b = { x0: Math.min(b.x0, a.x), y0: Math.min(b.y0, a.y), x1: Math.max(b.x1, a.x), y1: Math.max(b.y1, a.y) };
      }
      return b;
    },

    /** 개미들 [{ x, y, dir(0 위 · 1 오른쪽 · 2 아래 · 3 왼쪽), state(터마이트 속 상태) }]. 읽기만 한다 */
    get agents() {
      return agents;
    },
    head: null,
    /** 빈칸이 아닌 칸 수 */
    get alive() {
      return P.filled;
    },
    get size() {
      return P.size;
    },

    /** (x, y) 에 있는 개미의 번호. 없으면 -1 */
    agentAt(x, y) {
      return agents.findIndex((a) => a.x === x && a.y === y);
    },
    /** 개미를 놓고 번호를 돌려준다. 더 놓을 수 없으면 -1 */
    addAgent,
    removeAgent(i) {
      if (i < 0 || i >= agents.length) return false;
      agents.splice(i, 1);
      return true;
    },
    /** 개미를 시계 방향으로 by 번(기본 1) 돌리고 새 방향을 돌려준다 */
    turnAgent(i, by = 1) {
      const a = agents[i];
      if (!a) return -1;
      a.dir = (a.dir + by) & 3;
      return a.dir;
    },
    /** 개미 놓기 손: 없으면 위를 보는 개미를 놓고, 있으면 시계 방향으로 돌리고, 왼쪽을 보던 개미는 치운다. 한 일: add · turn · remove · null(더 못 놓음) */
    cycleAgent(x, y) {
      const i = sim.agentAt(x, y);
      if (i < 0) return addAgent(x, y, 0) < 0 ? null : "add";
      if (agents[i].dir === 3) {
        agents.splice(i, 1);
        return "remove";
      }
      agents[i].dir++;
      return "turn";
    },

    snapshot: () => ({ family: "ant", states: colors(), cells: P.snapshot(), agents: agents.map((a) => ({ ...a })) }),
    restore(snap) {
      P.restore(snap.cells);
      if (snap.states > colors()) P.clampStates(colors());
      agents.length = 0;
      for (const a of snap.agents ?? []) agents.push({ ...a, state: a.state < prog.states ? a.state : 0 });
      gone = !agents.every(inReach);
      since = 0;
    },

    /** 같은 계열 안에서 규칙만 바꾼다(칸과 개미는 그대로). 색이 줄면 없어진 색의 칸은 빈칸, 속 상태가 줄면 그 개미는 0 으로 */
    setRule(next) {
      if (next.family !== "ant") throw new Error(`setRule: 계열이 달라요 (ant → ${next.family}). 새 sim 을 만들어 주세요`);
      const fewer = next.states.length < r.states.length;
      r = next;
      prog = compileAnt(r, colors());
      if (fewer) P.clampStates(colors());
      for (const a of agents) if (a.state >= prog.states) a.state = 0;
    },

    /** 칸과 개미를 모두 비운다 */
    clear() {
      P.clear();
      agents.length = 0;
      gone = false;
      since = 0;
    },

    /** 비우고 seed 대로 칠한 뒤, 규칙 파일의 개미를 region 가운데에 놓는다 */
    seed(region, rng) {
      sim.clear();
      const s = r.seed ?? { type: "empty" };
      const cx = region.x + (region.w >> 1);
      const cy = region.y + (region.h >> 1);
      if (s.type === "random") fillRegion(P, region, s.density ?? 0.3, s.area ?? 1, rng, randomColor(rng));
      else if (s.type === "single") P.set(cx, cy, 1);
      else if (s.type === "rle") putRows(P, parseRLE(s.data).rows, ...regionCenter(region), colors());
      placeAgents(cx, cy);
    },

    /** 비우고 칸 색을 무작위로 흩뿌린 뒤, 규칙 파일의 개미를 region 가운데에 놓는다 */
    scatter(region, density, rng) {
      sim.clear();
      const s = r.seed;
      fillRegion(P, region, density, s && s.type === "random" ? (s.area ?? 1) : 1, rng, randomColor(rng));
      placeAgents(region.x + (region.w >> 1), region.y + (region.h >> 1));
    },

    /** 비우고 무늬를 (cx, cy) 가운데에 칠한 뒤, 규칙 파일의 개미를 그 둘레에 놓는다 */
    place(rows, cx = 0, cy = 0) {
      sim.clear();
      putRows(P, rows, cx, cy, colors());
      placeAgents(Math.round(cx), Math.round(cy));
    },

    /**
     * 살펴보기. { now, next, why, agent, turn, write, state, cells: [] }
     *   why: ant(개미가 밟고 있어 다음 걸음에 칠한다) · wait(개미가 없어 그대로)
     *   turn·write: 그 칸에서 개미가 돌 글자와 칠할 색. 개미가 없으면 속 상태 0 의 개미가 밟았을 때(터마이트는 null)
     */
    explain(x, y) {
      const now = P.get(x, y);
      const k = colors();
      const c = now < k ? now : 0;
      const i = sim.agentAt(x, y);
      if (i < 0) {
        const plain = !r.machine;
        return { now, next: now, why: "wait", agent: -1, turn: plain ? TURN_LETTERS[prog.turn[c]] : null, write: plain ? prog.write[c] : null, state: null, cells: [] };
      }
      const a = agents[i];
      const j = a.state * k + c;
      return { now, next: prog.write[j], why: "ant", agent: i, turn: TURN_LETTERS[prog.turn[j]], write: prog.write[j], state: a.state, cells: [] };
    },
  };
  return sim;
}

// ── 1차원 기본 ─────────────────
// 세대 t 의 줄은 y = t(0세대 줄이 y = 0). 한 걸음에 지금 줄(head) 아래에 새 줄을 하나 만든다.
// 오래된 줄은 조각째로 지운다(지금 줄이 넓을수록 적게 남긴다, rowsKept). 손으로는 지금 줄만 바꿀 수 있다.

function elementarySim(rule) {
  const P = makePlane();
  let r = rule;
  let head = 0; // 지금 줄의 y
  let top = 0; // 남아 있는 가장 위 줄의 y(그 위는 지웠다)
  let ones = 0; // 지금 줄의 켜진 칸 수
  let wide = false; // 지금 줄이 MAX_WIDTH 를 넘었다

  function countRow(y) {
    const span = P.rowSpan(y);
    if (!span) return 0;
    let n = 0;
    for (const v of P.readRow(y, span.x0, span.x1)) if (v === 1) n++;
    return n;
  }
  function rowWidth(y) {
    const span = P.rowSpan(y);
    return span ? span.x1 - span.x0 + 1 : 0;
  }
  /** 0세대 줄에 칸 배열을 (cx 가운데에) 놓는다 */
  function putRow(row, cx) {
    const x0 = Math.round(cx - row.length / 2);
    row.forEach((v, i) => v === 1 && P.set(x0 + i, 0, 1));
  }
  /** region 의 너비 가운데 area 몫에 density 확률로 0세대 줄을 켠다 */
  function fillRow(region, density, area, rng) {
    const aw = Math.max(1, Math.round(region.w * area));
    const x0 = region.x + Math.floor((region.w - aw) / 2);
    for (let x = x0; x < x0 + aw; x++) if (rng.next() < density) P.set(x, 0, 1);
  }
  function settle() {
    ones = countRow(head);
    wide = rowWidth(head) > MAX_WIDTH;
  }

  const sim = {
    family: "elementary",
    get rule() {
      return r;
    },
    /** 홀수 번호(000 → 1)는 빈 곳이 한꺼번에 켜져서 끝없는 격자에서는 돌릴 수 없다 */
    canRun: () => !isLockedNumber(r.number),
    /** 지금 줄이 MAX_WIDTH(8192칸)보다 넓다 */
    get full() {
      return wide || head + 1 >= REACH;
    },

    /** 새 줄을 n 개(기본 1) 만든다. 못 가면 null. → { alive(지금 줄의 켜진 칸), changed(윗줄과 다른 칸), steps } */
    step(n = 1) {
      if (!sim.canRun() || sim.full) return null;
      let changed = 0;
      let k = 0;
      while (k < n) {
        const span = P.rowSpan(head);
        let next = 0;
        let w = 0;
        if (span) {
          // 지금 줄의 x0-2 … x1+2 를 읽어 다음 줄의 x0-1 … x1+1 을 만든다
          const row = P.readRow(head, span.x0 - 2, span.x1 + 2);
          const out = stepRow(row, r.number);
          const ox = span.x0 - 1;
          let a = -1;
          let b = -1;
          for (let i = 0; i < out.length; i++) {
            if (out[i]) {
              P.set(ox + i, head + 1, 1);
              next++;
              if (a < 0) a = i;
              b = i;
            }
            if (out[i] !== row[i + 1]) changed++;
          }
          w = a < 0 ? 0 : b - a + 1;
        }
        head++;
        ones = next;
        k++;
        const cut = head - rowsKept(w) + 1;
        if (cut > top) {
          P.dropAbove(cut);
          top = Math.max(top, (cut >> 5) << 5);
        }
        if (w > MAX_WIDTH) {
          wide = true;
          break;
        }
        if (head + 1 >= REACH) break;
      }
      return { alive: ones, changed, steps: k };
    },

    get: (x, y) => P.get(x, y),
    /** 지금 줄(head)의 칸만 바꾼다(0·1). 원래 값을 돌려준다 */
    set(x, y, v) {
      if (y !== head || (v !== 0 && v !== 1)) return P.get(x, y);
      const old = P.set(x, y, v);
      ones += (v === 1 ? 1 : 0) - (old === 1 ? 1 : 0);
      wide = rowWidth(head) > MAX_WIDTH;
      return old;
    },
    /** 그리기용. 앞 칸은 늘 null(지금 줄은 화면이 head 로 따로 그린다) */
    blocks(x0, y0, x1, y1, fn) {
      P.blocks(x0, y0, x1, y1, (ox, oy, s, cells) => fn(ox, oy, s, s, cells, null));
    },
    bounds: () => P.bounds(),

    agents: NONE,
    /** 지금 줄의 y */
    get head() {
      return head;
    },
    /** 남아 있는 가장 위 줄의 y */
    get top() {
      return top;
    },
    /** 지금 줄의 켜진 칸 수 */
    get alive() {
      return ones;
    },
    get size() {
      return P.size;
    },

    snapshot: () => ({ family: "elementary", states: 2, head, top, cells: P.snapshot() }),
    restore(snap) {
      P.restore(snap.cells);
      head = snap.head;
      top = snap.top;
      settle();
    },
    /** 같은 계열 안에서 번호만 바꾼다(줄은 그대로) */
    setRule(next) {
      if (next.family !== "elementary") throw new Error(`setRule: 계열이 달라요 (elementary → ${next.family}). 새 sim 을 만들어 주세요`);
      r = next;
    },
    clear() {
      P.clear();
      head = 0;
      top = 0;
      ones = 0;
      wide = false;
    },

    /** 비우고 0세대 줄(y = 0)을 seed 대로: single 은 가운데 한 칸, random 은 region 너비(× area)에, rle 는 첫 줄만 */
    seed(region, rng) {
      sim.clear();
      const s = r.seed ?? { type: "empty" };
      if (s.type === "random") fillRow(region, s.density ?? 0.5, s.area ?? 1, rng);
      else if (s.type === "single") P.set(region.x + (region.w >> 1), 0, 1);
      else if (s.type === "rle") putRow(parseRLE(s.data).rows[0] ?? [], region.x + region.w / 2);
      settle();
    },
    /** 비우고 0세대 줄에만 무작위로 흩뿌린다 */
    scatter(region, density, rng) {
      sim.clear();
      const s = r.seed;
      fillRow(region, density, s && s.type === "random" ? (s.area ?? 1) : 1, rng);
      settle();
    },
    /** 비우고 무늬의 첫 줄을 0세대 줄의 cx 가운데에 놓는다(cy 는 쓰지 않는다) */
    place(rows, cx = 0) {
      sim.clear();
      putRow(rows[0] ?? [], cx);
      settle();
    },

    /**
     * 살펴보기: 칸 (x, y) 가 윗줄의 세 칸에서 어떻게 정해지는지. { now, next, why, pattern, cells }
     *   why: rule(윗줄에서 정해졌다) · next(다음 걸음에 만들 줄) · start(0세대 줄) · none(아직 없거나 지운 줄)
     *   pattern: 윗줄 세 칸의 무늬 번호 0–7(111 이 7), next: 규칙이 정하는 값, cells: 윗줄 세 칸 자리
     */
    explain(x, y) {
      const now = P.get(x, y);
      if (y === 0 && top === 0) return { now, next: now, why: "start", pattern: null, cells: [] };
      if (y <= top || y > head + 1) return { now, next: now, why: "none", pattern: null, cells: [] };
      const cells = [
        [x - 1, y - 1],
        [x, y - 1],
        [x + 1, y - 1],
      ];
      const pattern = patternOf(P.get(x - 1, y - 1), P.get(x, y - 1), P.get(x + 1, y - 1));
      return { now, next: nextOf(r.number, pattern), why: y === head + 1 ? "next" : "rule", pattern, cells };
    },
  };
  return sim;
}
