// 계열마다 다른 것: 규칙 편집기, 표기, 손, 빠르기, 낱말, 살펴보기 글, 빈 판 안내, 만들기의 처음 규칙.
// 규칙 화면(views/rule.js)은 판·재생·기록·규칙 파일·볼 것을 같이 쓰고, 계열에 따라 다른 것만 여기서 가져간다.
// 계열을 더하면 FAMILY 에 하나를 넣고, 엔진에 READY_FAMILIES 에 넣어 달라고 쪽지한다(그래야 도감 목록에 들어간다).
// 모양(클래스·색)은 디자인 시안이 오기 전까지 있는 것(.pad·.count·.stepper)을 빌려 쓴다.

import { h, icon, ICON } from "./dom.js";
import { t, num } from "../i18n.js";
import { MAX_STATES } from "../core/life.js";
import { resizeStates } from "../core/rules.js";
import { around, MAX_ANT_COLORS, MAX_AGENTS } from "../core/sim.js";
import { makeRulePad, describeRule } from "./rulepad.js";
import { boardColors } from "./theme.js";
import { LIFE_WORDS } from "./spark.js";

const copy = (o) => structuredClone(o);
const css = ([r, g, b]) => `rgb(${r} ${g} ${b})`;

const SPEED_NAME = { slow: () => t("느리게"), normal: () => t("보통"), fast: () => t("빠르게") };
/** [[id, 1초에 몇 번]] → 빠르기 고르기 단추 */
const speeds = (list, title) => list.map(([id, n]) => ({ id, n, name: SPEED_NAME[id](), title: title(n) }));

// ── Life 계열 ─────────────────

const WHY = {
  born: (n) => t("태어남에 {n:이가} 있어요", { n }),
  stay: (n) => t("태어남에 {n:이가} 없어요", { n }),
  survive: (n) => t("살아남음에 {n:이가} 있어요", { n }),
  die: (n) => t("살아남음에 {n:이가} 없어요", { n }),
  fade: (n) => t("살아남음에 {n:이가} 없어 사라지기 시작해요", { n }),
  fading: () => t("사라지는 중이라 한 단계 더 흐려져요"),
  gone: () => t("마지막 단계라 빈칸이 돼요"),
};
const ROW_OF = { born: "birth", stay: "birth", survive: "survive", die: "survive", fade: "survive" };

const life = {
  id: "life",
  label: () => t("생명 게임 계열"),
  batch: false,
  zoom: 10,
  speeds: () => speeds([["slow", 4], ["normal", 10], ["fast", 30]], (n) => t("1초에 {n}세대", { n })),
  tools: () => [
    { id: "pan", icon: icon(ICON.move), name: t("이동"), title: t("이동: 끌어서 둘러보기") },
    { id: "draw", icon: icon(ICON.pen), name: t("그리기"), title: t("그리기: 끌어서 칸 그리기") },
    { id: "look", icon: icon(ICON.eye), name: t("살펴보기"), title: t("살펴보기: 칸의 이웃과 다음 세대") },
  ],
  tip: {
    pan: () => t("끌어서 둘러보고, 칸을 눌러 살리거나 비워요. 휠이나 두 손가락으로 확대·축소해요."),
    draw: () => t("끌어서 칸을 그려요. 산 칸에서 시작하면 지워요. 둘러보려면 오른쪽 단추나 두 손가락으로 끌어요."),
    look: () => t("칸에 커서를 올리거나 눌러 보세요. 이웃을 세고 다음 세대를 알려 줘요."),
  },
  words: { ...LIFE_WORDS, step: () => t("세대"), count: () => t("산 칸") },
  canvasLabel: () => t("끝없는 격자. 끌면 둘러보고, 칸을 누르면 살리거나 비워요"),
  /** 만들기 화면의 처음 규칙 */
  blank: () => ({
    id: "my-rule",
    name: t("내 규칙"),
    description: "",
    family: "life",
    grid: { edges: "infinite" },
    neighborhood: "moore",
    states: [{ name: t("빈칸") }, { name: t("산 칸") }],
    birth: [3],
    survive: [2, 3],
    seed: { type: "random", density: 0.3 },
  }),
  /** 표기(parseCode 결과)를 규칙에 씌운다 */
  withCode(r, p) {
    r.birth = p.birth;
    r.survive = p.survive;
    r.states = resizeStates(r.states, p.states);
    return r;
  },
  /** 원래대로: 칸은 그대로 두고 규칙만 base 로 */
  restore(rule, base) {
    const r = copy(rule);
    r.birth = [...base.birth];
    r.survive = [...base.survive];
    r.states = copy(base.states);
    return r;
  },
  describe: describeRule,
  codeBad: () => t("읽을 수 없는 표기예요. 예: B3/S23, B2/S/C3, 23/3"),
  codeOther: () => t("이 화면에서는 B3/S23 같은 표기를 써요."),
  /** 더 보기의 상태 수 */
  states: { label: () => t("상태 수"), note: () => t("3 이상이면 죽는 칸이 그만큼 단계를 거쳐 사라져요."), min: 2, max: MAX_STATES },
  editor({ get, set, locked }) {
    const pad = makeRulePad({
      onToggle(kind, n) {
        const r = copy(get());
        const s = new Set(r[kind]);
        if (s.has(n)) s.delete(n);
        else s.add(n);
        r[kind] = [...s].sort((a, b) => a - b);
        set(r);
      },
      onLocked: locked,
    });
    return {
      el: pad.el,
      update: (r) => pad.update(r),
      /** 살펴보는 칸의 운명을 정한 숫자에 테 */
      mark: (ex) => (ex ? pad.markWhy(ROW_OF[ex.why] ?? null, ex.n) : pad.markWhy(null)),
    };
  },
  /** 빈 판 안내(없으면 null) */
  hint: (world, tool) =>
    world.count > 0 ? null : tool === "draw" ? t("끌어서 칸을 그린 다음, 재생을 눌러 보세요.") : t("칸을 눌러 살릴 칸을 고른 다음, 재생을 눌러 보세요."),
  /** 이동 손으로 칸을 눌렀을 때 */
  tap(world, x, y) {
    world.set(x, y, world.get(x, y) === 1 ? 0 : 1);
    return null;
  },
  /** 그리기 손: 시작한 칸이 산 칸이면 지우고, 아니면 살린다 */
  strokeValue: (cur) => (cur === 1 ? 0 : 1),
  /** 살펴보기에서 고리를 두를 칸 */
  lookCells: (ex, [x, y]) => around(x, y),
  peek(ex, rule) {
    const name = (i) => rule.states[i]?.name ?? String(i);
    return [
      h("div", { class: "peek-top" }, h("span", { class: "num" }, String(ex.n)), h("span", {}, t("산 이웃"))),
      h("div", {}, t("지금 "), h("b", {}, name(ex.now)), t(", 다음 세대 "), h("b", {}, name(ex.next))),
      h("div", {}, WHY[ex.why](ex.n), "."),
    ];
  },
};

// ── 개미·터마이트 ─────────────────

const TURN_ORDER = "LRNU"; // 회전 글자 단추를 누를 때 바뀌는 차례
const TURN_WORD = { L: () => t("왼쪽"), R: () => t("오른쪽"), N: () => t("곧장"), U: () => t("뒤로") };
const TURN_SAY = { L: () => t("왼쪽으로 돌고"), R: () => t("오른쪽으로 돌고"), N: () => t("곧장 가며"), U: () => t("뒤로 돌고") };

/** 개미 규칙을 쉬운 말로 */
export function describeAnt(r) {
  if (r.machine) return t("속 상태가 {n}가지인 터마이트예요. 밟은 칸의 색과 속 상태에 따라 칠할 색, 도는 쪽, 다음 속 상태가 정해져요.", { n: r.machine.length });
  const parts = [...r.turns].map((c, i) => t("{name} → {dir}", { name: r.states[i]?.name ?? String(i), dir: TURN_WORD[c]() }));
  const list = r.turns.length <= 4 ? `${parts.join(", ")}. ` : "";
  return list + t("개미는 밟은 칸의 색에 맞춰 돌고, 그 칸을 다음 색으로 칠한 뒤 한 칸 나아가요.");
}

/** 색마다 회전 글자 단추(누르면 L → R → N → U), 색 수 고르기. 터마이트는 표로 보여 주기만 한다 */
function makeAntPad({ get, set }) {
  const el = h("div", { class: "pad ant-pad" });
  let shape = ""; // 다시 만들어야 하는지 볼 열쇠
  let buttons = [];
  let out = null;

  function setTurns(turns) {
    const r = copy(get());
    r.turns = turns;
    delete r.machine;
    r.states = resizeStates(r.states, turns.length, "ant");
    set(r);
  }

  function buildTurns(r) {
    const n = r.turns.length;
    buttons = [...r.turns].map((_, i) =>
      h("button", {
        type: "button",
        class: "count turn",
        onclick: () => {
          const cur = get().turns;
          const next = TURN_ORDER[(TURN_ORDER.indexOf(cur[i]) + 1) % TURN_ORDER.length];
          setTurns(cur.slice(0, i) + next + cur.slice(i + 1));
        },
      }),
    );
    // 한 줄에 여덟 개까지(색이 많으면 여러 줄)
    const rows = [];
    for (let i = 0; i < n; i += 8) rows.push(h("div", { class: "counts turns" }, buttons.slice(i, i + 8)));
    out = h("output", {}, String(n));
    el.replaceChildren(
      h("div", { class: "pad-row", role: "group", "aria-label": t("도는 쪽") }, h("span", { class: "pad-label", "aria-hidden": "true" }, t("도는 쪽")), h("div", { class: "pad" }, rows)),
      h(
        "div",
        { class: "pad-row" },
        h("span", { class: "pad-label" }, t("색 수")),
        h(
          "div",
          { class: "stepper", role: "group", "aria-label": t("색 수") },
          h(
            "button",
            { class: "btn small square", type: "button", "aria-label": t("색 하나 빼기"), onclick: () => get().turns.length > 2 && setTurns(get().turns.slice(0, -1)) },
            icon(ICON.minus),
          ),
          out,
          h(
            "button",
            { class: "btn small square", type: "button", "aria-label": t("색 하나 더하기"), onclick: () => get().turns.length < MAX_ANT_COLORS && setTurns(`${get().turns}L`) },
            icon(ICON.plus),
          ),
        ),
      ),
    );
  }

  function buildMachine(r) {
    buttons = [];
    out = null;
    const name = (i) => r.states[i]?.name ?? String(i);
    el.replaceChildren(
      h(
        "table",
        { class: "machine" },
        h("thead", {}, h("tr", {}, h("th", {}, t("속 상태")), r.states.map((_, c) => h("th", {}, name(c))))),
        h(
          "tbody",
          {},
          r.machine.map((row, s) =>
            h(
              "tr",
              {},
              h("th", {}, String(s)),
              row.map(([w, turn, next]) => h("td", { title: t("{color:으로로} 칠하고 {dir}, 속 상태 {s}", { color: name(w), dir: TURN_WORD[turn](), s: next }) }, `${w} ${turn} ${next}`)),
            ),
          ),
        ),
      ),
      h("p", { class: "field-label" }, t("칸마다 '칠할 색 · 도는 쪽 · 다음 속 상태'예요. 터마이트는 규칙 파일로 고쳐요.")),
    );
  }

  return {
    el,
    update(r) {
      const key = r.machine ? `m${JSON.stringify(r.machine)}` : `t${r.turns.length}`;
      if (key !== shape) {
        shape = key;
        if (r.machine) buildMachine(r);
        else buildTurns(r);
      }
      if (!r.turns) return;
      const cols = boardColors(r.states, "ant");
      buttons.forEach((b, i) => {
        const c = r.turns[i];
        const name = r.states[i]?.name ?? String(i);
        b.textContent = c;
        b.setAttribute("aria-label", t("{name}에서 도는 쪽: {dir}. 눌러서 바꾸기", { name, dir: TURN_WORD[c]() }));
        b.title = t("{name}에서 도는 쪽: {dir}", { name, dir: TURN_WORD[c]() });
        // 칸 색을 테로 보여 준다(모양은 임시)
        b.style.boxShadow = `inset 0 0 0 3px ${css(i === 0 ? cols.empty : cols.shape[i].color)}`;
      });
      if (out) out.textContent = String(r.turns.length);
    },
    /** 살펴보는 칸의 색에 맞는 글자에 테 */
    mark(ex) {
      buttons.forEach((b, i) => b.classList.toggle("why", !!ex && i === ex.now));
    },
  };
}

const ant = {
  id: "ant",
  label: () => t("개미"),
  batch: true,
  zoom: 8,
  speeds: () => speeds([["slow", 30], ["normal", 300], ["fast", 3000]], (n) => t("1초에 {n}걸음", { n: num(n) })),
  tools: () => [
    { id: "pan", icon: icon(ICON.move), name: t("이동"), title: t("이동: 끌어서 둘러보기") },
    { id: "ant", icon: icon(ICON.ant), name: t("개미"), title: t("개미: 눌러서 놓고, 돌리고, 치우기") },
    { id: "draw", icon: icon(ICON.pen), name: t("그리기"), title: t("그리기: 끌어서 칸 칠하기") },
    { id: "look", icon: icon(ICON.eye), name: t("살펴보기"), title: t("살펴보기: 개미가 칸을 밟으면") },
  ],
  tip: {
    pan: () => t("끌어서 둘러보고, 칸을 누르면 칸 색이 다음 색으로 바뀌어요. 휠이나 두 손가락으로 확대·축소해요."),
    ant: () => t("칸을 누르면 개미를 놓아요. 다시 누르면 시계 방향으로 돌고, 왼쪽을 보던 개미는 치워요."),
    draw: () => t("끌어서 칸을 칠해요. 칠한 칸에서 시작하면 지워요. 둘러보려면 오른쪽 단추나 두 손가락으로 끌어요."),
    look: () => t("칸에 커서를 올리거나 눌러 보세요. 개미가 그 칸을 밟으면 어떻게 하는지 알려 줘요."),
  },
  words: {
    at: (g) => t("{g}걸음", { g: num(g) }),
    value: (n) => t("칠한 칸 {n}", { n: num(n) }),
    aria: () => t("걸음마다 칠한 칸 수"),
    step: () => t("걸음"),
    count: () => t("칠한 칸"),
  },
  canvasLabel: () => t("끝없는 격자. 끌면 둘러보고, 칸을 누르면 칸 색이 바뀌어요"),
  blank: () => ({
    id: "my-rule",
    name: t("내 개미"),
    description: "",
    family: "ant",
    grid: { edges: "infinite" },
    states: [{ name: t("빈칸") }, { name: t("칠한 칸") }],
    turns: "RL",
    agents: [{ x: 0, y: 0, dir: "N" }],
    seed: { type: "empty" },
  }),
  withCode(r, p) {
    r.turns = p.turns;
    delete r.machine;
    r.states = resizeStates(r.states, p.turns.length, "ant");
    return r;
  },
  restore(rule, base) {
    const r = copy(rule);
    delete r.turns;
    delete r.machine;
    if (base.turns !== undefined) r.turns = base.turns;
    else r.machine = copy(base.machine);
    r.states = copy(base.states);
    return r;
  },
  describe: describeAnt,
  codeBad: () => t("읽을 수 없는 표기예요. 예: RL, LLRR (L 왼쪽, R 오른쪽, N 곧장, U 뒤로)"),
  codeOther: () => t("이 화면에서는 LLRR 같은 개미 표기를 써요."),
  states: null, // 색 수는 편집기에서
  editor: (ctx) => makeAntPad(ctx),
  hint: (world) => (world.agents.length ? null : t("개미가 없어요. 개미 손으로 칸을 눌러 놓아 보세요.")),
  /** 이동 손으로 칸을 누르면 칸 색이 다음 색으로 */
  tap(world, x, y) {
    world.set(x, y, (world.get(x, y) + 1) % world.rule.states.length);
    return null;
  },
  strokeValue: (cur) => (cur !== 0 ? 0 : 1),
  /** 개미 손: 놓기 → 돌리기 → 치우기. 더 못 놓으면 알릴 글 */
  placeAgent(world, x, y) {
    return world.sim.cycleAgent(x, y) === null ? t("개미는 {n}마리까지 놓을 수 있어요.", { n: MAX_AGENTS }) : null;
  },
  lookCells: () => [],
  peek(ex, rule) {
    const name = (i) => rule.states[i]?.name ?? String(i);
    const letter = ex.turn;
    const top = h("div", { class: "peek-top" }, h("span", { class: "num" }, letter ?? "?"), h("span", {}, t("도는 쪽")));
    const now = h("div", {}, t("지금 "), h("b", {}, name(ex.now)), ex.why === "ant" ? [t(", 다음 걸음 "), h("b", {}, name(ex.next))] : null);
    const say = letter ? t("{turn} 이 칸을 {color:으로로} 칠해요.", { turn: TURN_SAY[letter](), color: name(ex.write) }) : null;
    if (ex.why === "ant") {
      return [top, now, h("div", {}, t("개미가 있어요. "), say), rule.machine ? h("div", {}, t("개미의 속 상태: {s}", { s: ex.state })) : null];
    }
    return [top, now, h("div", {}, say ? [t("개미가 밟으면 "), say] : t("개미가 밟으면 개미의 속 상태에 따라 달라져요."))];
  },
};

/** 화면이 있는 계열 */
export const FAMILY = { life, ant };
export const SCREEN_FAMILIES = Object.keys(FAMILY);
