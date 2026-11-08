// 규칙 파일(JSON)을 검사하고 앱이 쓰는 꼴로 고른다. 형식은 기획서 5절과 계열 확장 설계 3절을 따른다.
// 모든 계열이 끝없는 격자(grid.edges: infinite)에서 돈다. wrap·wall 은 파일 꼴에만 남아 있고 지금은 받지 않는다.
// 상태 색(color)을 빼면 화면 색을 쓴다.
// 앱 안의 규칙은 계열 내용을 맨 위로 꺼낸 꼴이다: Life 는 birth·survive, 개미는 turns 나 machine 과 agents, 1차원은 number,
// 조건표는 transitions, 순환은 threshold, 코드는 source(표 table 은 Worker 가 만들어 실어 주고 파일에는 넣지 않는다).

import { t } from "../i18n.js";
import { MIN_STATES, MAX_STATES, parseNotation, formatNotation } from "./life.js";
import { MAX_ANT_COLORS, MAX_AGENTS, DIR_LETTERS, parseTurns, antRuleProblem } from "./ant.js";
import { parseWolfram, formatWolfram, isLockedNumber } from "./elementary.js";
import { MAX_TABLE_STATES, MAX_TRANSITIONS, MAX_COUNTED, tableProblem, compileTable, WIREWORLD, isWireworld } from "./table.js";
import { MAX_CYCLIC_STATES, CYCLIC_THRESHOLD } from "./cyclic.js";
import { MIN_CODE_STATES, MAX_CODE_STATES, MAX_SOURCE, codeLocked } from "./code.js";

/** 엔진이 아는 계열 */
export const FAMILIES = ["life", "ant", "elementary", "table", "cyclic", "code"];
/** 화면이 붙은 계열. checkRuleFile 은 따로 말하지 않으면 이것만 받는다(화면이 되면 프론트엔드 쪽지를 받고 넣는다) */
export const READY_FAMILIES = ["life"];
export const SEED_TYPES = ["empty", "random", "single", "rle"];
export const EDGES = ["infinite", "wrap", "wall"];

/** 계열마다 상태 수의 끝 */
const STATE_RANGE = {
  life: [MIN_STATES, MAX_STATES],
  ant: [2, MAX_ANT_COLORS],
  elementary: [2, 2],
  table: [2, MAX_TABLE_STATES],
  cyclic: [3, MAX_CYCLIC_STATES],
  code: [MIN_CODE_STATES, MAX_CODE_STATES],
};

const HEX = /^#[0-9a-f]{6}$/i;
const uniqSorted = (xs) => [...new Set(xs)].sort((a, b) => a - b);
const isCountList = (xs, max = 8) => Array.isArray(xs) && xs.every((n) => Number.isInteger(n) && n >= 0 && n <= max);
const clone = (x) => JSON.parse(JSON.stringify(x));

/**
 * 규칙 파일을 검사한다. 맞으면 { rule }, 틀리면 { errors: [글…] }
 * families: 받을 계열(기본은 화면이 붙은 계열 READY_FAMILIES)
 */
export function checkRuleFile(obj, { families = READY_FAMILIES } = {}) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { errors: [t("규칙 파일은 { } 로 감싼 JSON 이어야 해요")] };
  const family = obj.family;
  if (!FAMILIES.includes(family) || !families.includes(family)) return { errors: [t("family: 아직 돌릴 수 없는 계열이에요 ({f})", { f: String(family) })] };
  const errors = [];

  const [min, max] = STATE_RANGE[family];
  const states = obj.states;
  const statesOk = Array.isArray(states) && states.length >= min && states.length <= max;
  if (!statesOk) errors.push(min === max ? t("states: 이 계열은 상태가 {n}개예요", { n: min }) : t("states: 상태는 {min}–{max}개여야 해요", { min, max }));
  else {
    states.forEach((s, i) => {
      if (!s || typeof s !== "object" || typeof s.name !== "string") errors.push(t("states[{i}]: name 글이 있어야 해요", { i }));
      else if (s.color !== undefined && !HEX.test(s.color)) errors.push(t("states[{i}]: color 는 #rrggbb 꼴이어야 해요", { i }));
    });
  }

  const rule = obj.rule ?? {};
  let neighborhood = null;
  if (family === "life") {
    neighborhood = obj.neighborhood ?? "moore";
    const hex = neighborhood === "hex";
    if (neighborhood !== "moore" && !hex) errors.push(t("neighborhood: Life 계열은 moore 나 hex 예요"));
    if (!isCountList(rule.birth, hex ? 6 : 8)) errors.push(hex ? t("rule.birth: 육각 이웃은 0–6 사이 정수의 배열이어야 해요") : t("rule.birth: 0–8 사이 정수의 배열이어야 해요"));
    else if (rule.birth.includes(0)) errors.push(t("rule.birth: 끝없는 격자에서는 0을 쓸 수 없어요"));
    if (!isCountList(rule.survive, hex ? 6 : 8))
      errors.push(hex ? t("rule.survive: 육각 이웃은 0–6 사이 정수의 배열이어야 해요") : t("rule.survive: 0–8 사이 정수의 배열이어야 해요"));
  } else if (family === "ant") {
    if (statesOk) {
      const why = antRuleProblem(rule, states.length);
      if (why === "both") errors.push(t("rule: turns 와 machine 가운데 하나만 적어요"));
      else if (why === "none") errors.push(t("rule: 개미는 turns, 터마이트는 machine 을 적어요"));
      else if (why === "turns") errors.push(t("rule.turns: 칸 색마다 L·R·N·U 가운데 한 글자씩, 상태 수만큼 적어요"));
      else if (why === "machine") errors.push(t("rule.machine: [개미 상태][칸 색] = [쓸 색, 회전 글자, 다음 개미 상태] 꼴이어야 해요"));
    }
    const agents = obj.agents;
    if (agents !== undefined) {
      if (!Array.isArray(agents) || agents.length > MAX_AGENTS) errors.push(t("agents: 개미는 {max}마리까지 배열로 적어요", { max: MAX_AGENTS }));
      else
        agents.forEach((a, i) => {
          const ok = a && Number.isInteger(a.x) && Number.isInteger(a.y) && typeof a.dir === "string" && a.dir.length === 1 && DIR_LETTERS.includes(a.dir);
          if (!ok) errors.push(t("agents[{i}]: x·y 는 정수, dir 은 N·E·S·W 가운데 하나여야 해요", { i }));
        });
    }
  } else if (family === "elementary") {
    if (!(Number.isInteger(rule.number) && rule.number >= 0 && rule.number <= 255)) errors.push(t("rule.number: 0–255 사이 정수여야 해요"));
    else if (isLockedNumber(rule.number)) errors.push(t("rule.number: 끝없는 격자에서는 홀수 번호(000 → 1)를 쓸 수 없어요"));
  } else if (family === "table") {
    neighborhood = obj.neighborhood ?? "moore";
    if (neighborhood !== "moore") errors.push(t("neighborhood: 지금은 moore 만 돼요"));
    const p = statesOk ? tableProblem(rule.transitions, states.length) : null;
    if (p?.why === "list") errors.push(t("rule.transitions: 줄을 {max}개까지 배열로 적어요", { max: MAX_TRANSITIONS }));
    else if (p?.why === "row") errors.push(t("rule.transitions[{i}]: from·to 는 상태 번호, when 은 { state, count } 꼴이어야 해요", { i: p.i }));
    else if (p?.why === "zero") errors.push(t("rule.transitions[{i}]: 빈칸(0)은 셀 수 없어요", { i: p.i }));
    else if (p?.why === "many") errors.push(t("rule.transitions: 세는 상태는 {max}가지까지예요", { max: MAX_COUNTED }));
    else if (p?.why === "lock") errors.push(t("rule.transitions: 끝없는 격자에서는 이웃이 없는 빈칸이 바뀌는 줄을 쓸 수 없어요"));
  } else if (family === "cyclic") {
    neighborhood = obj.neighborhood ?? "moore";
    const top = CYCLIC_THRESHOLD[neighborhood];
    if (!top) errors.push(t("neighborhood: 순환은 moore 나 von-neumann 이에요"));
    else if (!(Number.isInteger(rule.threshold) && rule.threshold >= 1 && rule.threshold <= top))
      errors.push(t("rule.threshold: 1–{max} 사이 정수여야 해요", { max: top }));
  } else if (family === "code") {
    neighborhood = obj.neighborhood ?? "moore";
    if (neighborhood !== "moore") errors.push(t("neighborhood: 지금은 moore 만 돼요"));
    if (typeof rule.source !== "string" || !rule.source.trim()) errors.push(t("rule.source: 코드 글이 있어야 해요"));
    else if (rule.source.length > MAX_SOURCE) errors.push(t("rule.source: 코드는 {max}자까지예요", { max: MAX_SOURCE }));
  }

  const grid = obj.grid ?? {};
  const edges = grid.edges ?? "infinite";
  if (!EDGES.includes(edges)) errors.push(t("grid.edges: infinite·wrap·wall 가운데 하나여야 해요"));
  else if (edges !== "infinite") {
    if (family === "life") errors.push(t("grid.edges: Life 계열은 끝없는 격자(infinite)에서 돌아가요"));
    else errors.push(t("grid.edges: 지금은 끝없는 격자(infinite)에서만 돌아가요"));
  } else if (grid.width !== undefined || grid.height !== undefined) errors.push(t("grid.width·height: 끝없는 격자에는 크기를 적지 않아요"));

  const seed = obj.seed ?? { type: "empty" };
  if (!seed || !SEED_TYPES.includes(seed.type)) errors.push(t("seed.type: empty·random·single·rle 가운데 하나여야 해요"));
  else if (seed.type === "random") {
    if (!(typeof seed.density === "number" && seed.density >= 0 && seed.density <= 1)) errors.push(t("seed.density: 0–1 사이 수여야 해요"));
    if (seed.area !== undefined && !(typeof seed.area === "number" && seed.area > 0 && seed.area <= 1))
      errors.push(t("seed.area: 0보다 크고 1 이하인 수여야 해요"));
  } else if (seed.type === "rle" && typeof seed.data !== "string") errors.push(t("seed.data: RLE 글이 있어야 해요"));

  if (errors.length) return { errors };
  const out = {
    id: typeof obj.id === "string" && obj.id ? obj.id : "custom",
    name: typeof obj.name === "string" && obj.name ? obj.name : t("이름 없는 규칙"),
    description: typeof obj.description === "string" ? obj.description : "",
    family,
    grid: { edges },
  };
  if (neighborhood) out.neighborhood = neighborhood;
  out.states = states.map((s) => (s.color ? { name: s.name, color: s.color } : { name: s.name }));
  if (family === "life") {
    out.birth = uniqSorted(rule.birth);
    out.survive = uniqSorted(rule.survive);
  } else if (family === "ant") {
    if (rule.turns !== undefined) out.turns = rule.turns;
    else out.machine = clone(rule.machine);
    out.agents = (obj.agents ?? [{ x: 0, y: 0, dir: "N" }]).map((a) => ({ x: a.x, y: a.y, dir: a.dir }));
  } else if (family === "elementary") out.number = rule.number;
  else if (family === "table") out.transitions = clone(rule.transitions);
  else if (family === "cyclic") out.threshold = rule.threshold;
  else if (family === "code") out.source = rule.source;
  out.seed = { ...seed };
  return { rule: out };
}

/** 앱 안 규칙의 계열 내용(규칙 파일의 rule 항목) */
function ruleBody(r) {
  if (r.family === "life") return { birth: r.birth, survive: r.survive };
  if (r.family === "ant") return r.turns !== undefined ? { turns: r.turns } : { machine: r.machine };
  if (r.family === "elementary") return { number: r.number };
  if (r.family === "table") return { transitions: r.transitions };
  if (r.family === "cyclic") return { threshold: r.threshold };
  if (r.family === "code") return { source: r.source };
  return {};
}

/** 앱 안의 규칙을 다시 규칙 파일 꼴로(JSON.stringify 할 객체) */
export function toRuleFile(r) {
  const grid = { edges: r.grid.edges };
  if (r.grid.width) grid.width = r.grid.width;
  if (r.grid.height) grid.height = r.grid.height;
  const out = { id: r.id, name: r.name, description: r.description, family: r.family, grid };
  if (r.neighborhood) out.neighborhood = r.neighborhood;
  out.states = r.states;
  out.rule = ruleBody(r);
  if (r.family === "ant") out.agents = r.agents;
  out.seed = r.seed;
  return out;
}

/** 상태 i 의 기본 이름 */
export function defaultStateName(i, family = "life") {
  if (i === 0) return family === "cyclic" ? t("바탕") : t("빈칸");
  if (family === "cyclic") return t("색 {k}", { k: i });
  if (family === "ant") return t("색 {k}", { k: i });
  if (family === "elementary") return t("켜진 칸");
  if (family === "table" || family === "code") return t("상태 {k}", { k: i });
  if (i === 1) return t("산 칸");
  return t("사라지는 칸 {k}", { k: i - 1 });
}

/** 상태 수를 바꿀 때 이름 목록을 맞춘다. 늘리면 그 계열의 기본 이름('사라지는 칸 k', 개미는 '색 k')을 덧붙인다 */
export function resizeStates(states, n, family = "life") {
  const out = states.slice(0, n).map((s) => ({ ...s }));
  for (let i = out.length; i < n; i++) out.push({ name: defaultStateName(i, family) });
  return out;
}

/** 엔진(core/life.js)에 넘길 꼴. 육각 이웃이면 neighborhood: "hex" 가 붙는다(표기 끝의 H) */
export const lifeRule = (r) =>
  r.neighborhood === "hex"
    ? { birth: r.birth, survive: r.survive, states: r.states.length, neighborhood: "hex" }
    : { birth: r.birth, survive: r.survive, states: r.states.length };

/** 움직임이 같은 규칙인가(이름·색·시작 상태·개미 자리는 보지 않는다) */
export const sameRule = (a, b) =>
  (a.family ?? "life") === (b.family ?? "life") &&
  (a.neighborhood ?? "moore") === (b.neighborhood ?? "moore") &&
  a.states.length === b.states.length &&
  JSON.stringify(ruleBody(a)) === JSON.stringify(ruleBody(b));

/**
 * 주소(?rule=)의 표기를 읽는다. 못 읽으면 null. 돌릴 수 없는 규칙(B0, 홀수 번호)도 읽기는 한다(lockOf 로 따로 본다)
 *   Life B3/S23 → { family: "life", birth, survive, states } · 개미 LLRR → { family: "ant", turns } · 1차원 W30 → { family: "elementary", number }
 */
export function parseCode(text) {
  const life = parseNotation(text);
  if (life) return { family: "life", ...life };
  const turns = parseTurns(text);
  if (turns) return { family: "ant", turns };
  const number = parseWolfram(text);
  if (number !== null) return { family: "elementary", number };
  return null;
}

/**
 * parseCode 의 결과로 앱 규칙을 만든다(이름·설명·시작은 base 에서, 없으면 기본값). 못 만들면 null
 *   Life → birth·survive(·neighborhood) · 1차원 → number · 개미 → turns(가운데에 위를 보는 개미 하나)
 */
export function ruleFromCode(code, base = {}) {
  if (!code) return null;
  const common = {
    id: base.id ?? "custom",
    name: base.name ?? t("이름 없는 규칙"),
    description: base.description ?? "",
    family: code.family,
    grid: { edges: "infinite" },
  };
  const seed = base.seed ?? { type: "empty" };
  if (code.family === "life")
    return { ...common, neighborhood: code.neighborhood ?? "moore", states: resizeStates([], code.states, "life"), birth: [...code.birth], survive: [...code.survive], seed };
  if (code.family === "elementary") return { ...common, states: resizeStates([], 2, "elementary"), number: code.number, seed };
  if (code.family === "ant") return { ...common, states: resizeStates([], code.turns.length, "ant"), turns: code.turns, agents: [{ x: 0, y: 0, dir: "N" }], seed };
  return null;
}

/** 규칙을 주소에 담을 표기로. 표기가 없는 규칙(터마이트 등)은 null */
export function formatCode(r) {
  if (r.family === "life") return formatNotation(lifeRule(r));
  if (r.family === "ant") return r.turns ?? null;
  if (r.family === "elementary") return formatWolfram(r.number);
  return null;
}

/**
 * 끝없는 격자에서 돌릴 수 없는 까닭. 돌릴 수 있으면 null. 화면 글은 프론트엔드가 이 낱말로 만든다
 *   birth0: Life 의 태어남 0 · odd: 1차원의 홀수 번호(000 → 1) · empty: 조건표·코드에서 이웃 없는 빈칸이 바뀜
 *   코드 규칙은 표(table)를 실은 뒤에만 볼 수 있다(표가 없으면 null, 그때는 sim.canRun() 이 거짓)
 * parseCode 의 결과에도 쓸 수 있다
 */
export function lockOf(r) {
  if (r.family === "life" && r.birth.includes(0)) return "birth0";
  if (r.family === "elementary" && isLockedNumber(r.number)) return "odd";
  if (r.family === "table" && compileTable(r.transitions, r.states.length).table[0] !== 0) return "empty";
  if (r.family === "code" && r.table && codeLocked(r.table)) return "empty";
  return null;
}

/** RLE 머리 줄의 rule. Life 계열은 B3/S23 꼴, 와이어월드는 WireWorld. RLE 로 나눌 수 없는 규칙은 null */
export function rleRuleOf(r) {
  if (r.family === "life") return formatNotation(lifeRule(r));
  if (isWireworld(r)) return "WireWorld";
  return null;
}

/**
 * RLE 머리 줄의 rule 글을 읽는다. 못 읽으면 null. Golly 가 붙이는 판 크기(:T100,100 같은 것)는 버린다
 *   B3/S23 · 23/3 · B2/S/C3 → { family: "life", birth, survive, states }
 *   WireWorld → { family: "table", id: "wireworld", states: 4, transitions }
 */
export function parseRleRule(text) {
  const s = String(text ?? "")
    .split(":")[0]
    .trim();
  if (/^wireworld$/i.test(s)) return { family: "table", id: "wireworld", states: 4, transitions: clone(WIREWORLD) };
  const life = parseNotation(s);
  return life ? { family: "life", ...life } : null;
}

/** 규칙 파일 글. 맨 위 항목마다 한 줄, 그 안은 한 줄로 적는다(프리셋 파일과 같은 꼴) */
export function formatRuleFile(obj) {
  const inline = (v) => {
    if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
    if (v && typeof v === "object") {
      const e = Object.entries(v).filter(([, x]) => x !== undefined);
      return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }` : "{}";
    }
    return JSON.stringify(v);
  };
  const lines = Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${inline(v)}`);
  return `{\n${lines.join(",\n")}\n}\n`;
}
