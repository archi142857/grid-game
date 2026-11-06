// 규칙 파일(JSON)을 검사하고 앱이 쓰는 꼴로 고른다. 1단계에서는 Life 계열만 돌린다.
// 형식은 기획서 5절을 따른다. 상태 색(color)을 빼면 화면 색을 쓰고, 격자 크기(width·height)를 빼면 고른 크기를 쓴다.

import { t } from "../i18n.js";
import { MIN_STATES, MAX_STATES } from "./life.js";

export const READY_FAMILIES = ["life"];
export const SEED_TYPES = ["empty", "random", "single", "rle"];

const HEX = /^#[0-9a-f]{6}$/i;
const uniqSorted = (xs) => [...new Set(xs)].sort((a, b) => a - b);
const isCountList = (xs) => Array.isArray(xs) && xs.every((n) => Number.isInteger(n) && n >= 0 && n <= 8);
const isSize = (n) => Number.isInteger(n) && n >= 3 && n <= 2000;

/** 규칙 파일을 검사한다. 맞으면 { rule }, 틀리면 { errors: [글…] } */
export function checkRuleFile(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { errors: [t("규칙 파일은 { } 로 감싼 JSON 이어야 해요")] };
  const errors = [];

  if (!READY_FAMILIES.includes(obj.family)) errors.push(t("family: 아직 돌릴 수 없는 계열이에요 ({f})", { f: String(obj.family) }));

  const states = obj.states;
  if (!Array.isArray(states) || states.length < MIN_STATES || states.length > MAX_STATES) {
    errors.push(t("states: 상태는 {min}–{max}개여야 해요", { min: MIN_STATES, max: MAX_STATES }));
  } else {
    states.forEach((s, i) => {
      if (!s || typeof s !== "object" || typeof s.name !== "string") errors.push(t("states[{i}]: name 글이 있어야 해요", { i }));
      else if (s.color !== undefined && !HEX.test(s.color)) errors.push(t("states[{i}]: color 는 #rrggbb 꼴이어야 해요", { i }));
    });
  }

  const rule = obj.rule ?? {};
  if (!isCountList(rule.birth)) errors.push(t("rule.birth: 0–8 사이 정수의 배열이어야 해요"));
  if (!isCountList(rule.survive)) errors.push(t("rule.survive: 0–8 사이 정수의 배열이어야 해요"));

  const neighborhood = obj.neighborhood ?? "moore";
  if (neighborhood !== "moore") errors.push(t("neighborhood: 지금은 moore 만 돼요"));

  const grid = obj.grid ?? {};
  const edges = grid.edges ?? "wrap";
  if (edges !== "wrap" && edges !== "wall") errors.push(t("grid.edges: wrap 이나 wall 이어야 해요"));
  if (grid.width !== undefined && !isSize(grid.width)) errors.push(t("grid.width: 3–2000 사이 정수여야 해요"));
  if (grid.height !== undefined && !isSize(grid.height)) errors.push(t("grid.height: 3–2000 사이 정수여야 해요"));

  const seed = obj.seed ?? { type: "empty" };
  if (!seed || !SEED_TYPES.includes(seed.type)) errors.push(t("seed.type: empty·random·single·rle 가운데 하나여야 해요"));
  else if (seed.type === "random") {
    if (!(typeof seed.density === "number" && seed.density >= 0 && seed.density <= 1)) errors.push(t("seed.density: 0–1 사이 수여야 해요"));
    if (seed.area !== undefined && !(typeof seed.area === "number" && seed.area > 0 && seed.area <= 1))
      errors.push(t("seed.area: 0보다 크고 1 이하인 수여야 해요"));
  } else if (seed.type === "rle" && typeof seed.data !== "string") errors.push(t("seed.data: RLE 글이 있어야 해요"));

  if (errors.length) return { errors };
  return {
    rule: {
      id: typeof obj.id === "string" && obj.id ? obj.id : "custom",
      name: typeof obj.name === "string" && obj.name ? obj.name : t("이름 없는 규칙"),
      description: typeof obj.description === "string" ? obj.description : "",
      family: obj.family,
      grid: { edges, width: grid.width, height: grid.height },
      neighborhood,
      states: states.map((s) => (s.color ? { name: s.name, color: s.color } : { name: s.name })),
      birth: uniqSorted(rule.birth),
      survive: uniqSorted(rule.survive),
      seed: { ...seed },
    },
  };
}

/** 앱 안의 규칙을 다시 규칙 파일 꼴로(JSON.stringify 할 객체) */
export function toRuleFile(r) {
  const grid = { edges: r.grid.edges };
  if (r.grid.width) grid.width = r.grid.width;
  if (r.grid.height) grid.height = r.grid.height;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    family: r.family,
    grid,
    neighborhood: r.neighborhood,
    states: r.states,
    rule: { birth: r.birth, survive: r.survive },
    seed: r.seed,
  };
}

export function defaultStateName(i) {
  if (i === 0) return t("빈칸");
  if (i === 1) return t("산 칸");
  return t("사라지는 칸 {k}", { k: i - 1 });
}

/** 상태 수를 바꿀 때 이름 목록을 맞춘다. 늘리면 '사라지는 칸 k' 를 덧붙인다 */
export function resizeStates(states, n) {
  const out = states.slice(0, n).map((s) => ({ ...s }));
  for (let i = out.length; i < n; i++) out.push({ name: defaultStateName(i) });
  return out;
}

/** 엔진(core/life.js)에 넘길 꼴 */
export const lifeRule = (r) => ({ birth: r.birth, survive: r.survive, states: r.states.length });

/** 움직임이 같은 규칙인가(이름·색·시작 상태는 보지 않는다) */
export const sameRule = (a, b) =>
  a.birth.join() === b.birth.join() && a.survive.join() === b.survive.join() && a.states.length === b.states.length && a.grid.edges === b.grid.edges;

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
