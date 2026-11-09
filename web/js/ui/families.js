// 계열마다 다른 것: 규칙 편집기, 표기, 손, 빠르기, 낱말, 살펴보기 글, 빈 판 안내, 만들기의 처음 규칙.
// 규칙 화면(views/rule.js)은 판·재생·기록·규칙 파일·볼 것을 같이 쓰고, 계열에 따라 다른 것만 여기서 가져간다.
// 계열을 더하면 FAMILY 에 하나를 넣고, 엔진에 READY_FAMILIES 에 넣어 달라고 쪽지한다(그래야 도감 목록에 들어간다).
// 모양(클래스·색)은 디자인 시안이 오기 전까지 있는 것(.pad·.count·.stepper)을 빌려 쓴다.

import { h, icon, ICON } from "./dom.js";
import { t, num, lang } from "../i18n.js";
import { josa } from "../core/josa.js";
import { MAX_STATES } from "../core/life.js";
import { resizeStates } from "../core/rules.js";
import { around, MAX_ANT_COLORS, MAX_AGENTS, MAX_TABLE_STATES, MAX_TRANSITIONS, MAX_COUNTED, MAX_CYCLIC_STATES, CYCLIC_THRESHOLD } from "../core/sim.js";
import { segmented } from "./widgets.js";
import { tableProblem, countedStates, WIREWORLD } from "../core/table.js";
import { makeRulePad, describeRule, blockedReason } from "./rulepad.js";
import { boardColors } from "./theme.js";
import { LIFE_WORDS } from "./spark.js";

const copy = (o) => structuredClone(o);

/**
 * 상태 견본(.swatch): 판의 점과 같은 크기. 빈칸은 .empty, 신호색 상태는 .signal, 색을 적은 상태는 그 색.
 * look 은 boardColors(rule.states, rule.family) 의 결과
 */
export function stateSwatch(look, i, states = []) {
  if (i === 0) return h("span", { class: "swatch empty" });
  const sh = look.shape[i];
  return h("span", {
    class: sh?.signal ? "swatch signal" : "swatch",
    vars: { "--r": String(+(sh?.r ?? 0.4).toFixed(3)) },
    style: states[i]?.color ? { color: states[i].color } : null,
  });
}

/** 끝없는 격자에서 돌릴 수 없는 까닭(core/rules.js 의 lockOf 낱말) → 화면 글 */
export const LOCK_TEXT = {
  birth0: () => blockedReason({ birth: [0] }),
  odd: () => t("끝없는 격자에서는 홀수 번호를 쓸 수 없어요. 홀수 번호는 셋 다 꺼진 곳(000)에서도 켜져서, 빈 곳이 끝없이 한꺼번에 켜지거든요."),
  empty: () => t("끝없는 격자에서는 이웃이 없는 빈칸이 바뀌는 줄을 쓸 수 없어요. 빈 곳이 끝없이 한꺼번에 바뀌거든요."),
};

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
  rle: true, // 무늬 모음·RLE 불러오기·내려받기를 쓴다(머리 줄 rule 이 B…/S… 꼴)
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
  words: { ...LIFE_WORDS, step: () => t("세대"), count: () => t("산 칸"), paint: () => t("칠할 상태") },
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
  /** 이동 손으로 칸을 눌렀을 때. paint 는 칠할 상태(상태가 셋 이상일 때 고른다, 기본은 산 칸) */
  tap(world, x, y, paint = 1) {
    world.set(x, y, world.get(x, y) === paint ? 0 : paint);
    return null;
  },
  /** 그리기 손: 시작한 칸이 칠할 상태면 지우고, 아니면 칠한다 */
  strokeValue: (cur, paint = 1) => (cur === paint ? 0 : paint),
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

/**
 * 회전 글자 편집기(사용자가 고른 시안 A): 칸 색마다 한 줄. 줄머리에 그 색의 점(.swatch)과 이름, 오른쪽에 L·R·N·U 넷 가운데 하나.
 * 색 빼기·더하기. 터마이트(machine)는 표로 보여 주기만 한다(규칙 파일로 고친다)
 */
function makeAntPad({ get, set }) {
  const turns = h("div", { class: "turns", role: "group", "aria-label": t("회전 글자") });
  const less = h("button", { class: "btn small", type: "button", onclick: () => get().turns.length > 2 && setTurns(get().turns.slice(0, -1)) }, t("색 빼기"));
  const more = h("button", { class: "btn small", type: "button", onclick: () => get().turns.length < MAX_ANT_COLORS && setTurns(`${get().turns}L`) }, t("색 더하기"));
  const tools = h("div", { class: "file-row" }, less, more);
  const machine = h("div", { class: "machine-wrap" });
  const el = h("div", { class: "ant-pad" }, turns, tools, machine);
  let rows = []; // 색마다 { row, swatch, name, btns: { L, R, N, U } }
  let shape = "";

  function setTurns(next) {
    const r = copy(get());
    r.turns = next;
    delete r.machine;
    r.states = resizeStates(r.states, next.length, "ant");
    set(r);
  }

  function buildRows(n) {
    rows = Array.from({ length: n }, (_, i) => {
      const swatch = h("span", { class: "swatch" });
      const name = h("span");
      const btns = {};
      for (const c of TURN_ORDER) {
        btns[c] = h(
          "button",
          {
            type: "button",
            class: "count",
            "aria-pressed": "false",
            title: TURN_WORD[c](),
            onclick: () => {
              const cur = get().turns;
              if (cur[i] !== c) setTurns(cur.slice(0, i) + c + cur.slice(i + 1));
            },
          },
          c,
        );
      }
      const row = h("div", { class: "pad-row", role: "group" }, h("span", { class: "pad-label" }, swatch, name), h("div", { class: "counts" }, TURN_ORDER.split("").map((c) => btns[c])));
      return { row, swatch, name, btns };
    });
    turns.replaceChildren(...rows.map((x) => x.row));
  }

  function buildMachine(r) {
    const name = (i) => r.states[i]?.name ?? String(i);
    machine.replaceChildren(
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
              row.map(([w, turn, next]) => h("td", { title: t("{color:으로로} 바꾸고 {dir}, 다음 속 상태 {s}", { color: name(w), dir: TURN_WORD[turn](), s: next }) }, `${w} ${turn} ${next}`)),
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
        turns.hidden = tools.hidden = !!r.machine;
        machine.hidden = !r.machine;
        if (r.machine) {
          rows = [];
          turns.replaceChildren();
          buildMachine(r);
        } else {
          machine.replaceChildren();
          buildRows(r.turns.length);
        }
      }
      if (!r.turns) return;
      const dots = boardColors(r.states, "ant").shape;
      rows.forEach((x, i) => {
        const label = r.states[i]?.name ?? String(i);
        x.name.textContent = label;
        x.row.setAttribute("aria-label", t("{name}에서 도는 쪽", { name: label }));
        // 그 색의 점: 빈칸은 빈칸 점, 다른 색은 판과 같은 크기(진하기는 CSS 가 크기에 맞춘다)
        x.swatch.classList.toggle("empty", i === 0);
        if (i > 0) x.swatch.style.setProperty("--r", String(+dots[i].r.toFixed(3)));
        else x.swatch.style.removeProperty("--r");
        for (const c of TURN_ORDER) x.btns[c].setAttribute("aria-pressed", String(r.turns[i] === c));
      });
      less.disabled = r.turns.length <= 2;
      more.disabled = r.turns.length >= MAX_ANT_COLORS;
    },
    /** 살펴보는 칸의 색 줄에서 지금 고른 글자에 테 */
    mark(ex) {
      const cur = get().turns;
      rows.forEach((x, i) => {
        for (const c of TURN_ORDER) x.btns[c].classList.toggle("why", !!ex && cur !== undefined && i === ex.now && cur[i] === c);
      });
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
    // 개미는 한 걸음에 늘 개미 수만큼 칸이 바뀌어서 '바뀐 칸' 대신 개미 수를 보인다
    changed: () => t("개미"),
    paint: () => t("칠할 색"),
  },
  changed: (world) => world.agents.length,
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
  /** 그리기 손: 시작한 칸이 칠할 색이면 지우고, 아니면 칠한다(이동 손은 색을 하나씩 넘긴다) */
  strokeValue: (cur, paint = 1) => (cur === paint ? 0 : paint),
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
    const say = letter ? t("{turn} 이 칸을 {color:으로로} 바꿔요.", { turn: TURN_SAY[letter](), color: name(ex.write) }) : null;
    if (ex.why === "ant") {
      return [top, now, h("div", {}, t("개미가 있어요. "), say), rule.machine ? h("div", {}, t("개미의 속 상태: {s}", { s: ex.state })) : null];
    }
    return [top, now, h("div", {}, say ? [t("개미가 밟으면 "), say] : t("개미가 밟으면 개미의 속 상태에 따라 달라져요."))];
  },
};

// ── 1차원 기본 ─────────────────

const PAT_ORDER = [7, 6, 5, 4, 3, 2, 1, 0]; // 111 부터 000 까지
const bitsOf = (p) => [(p >> 2) & 1, (p >> 1) & 1, p & 1];
const bitsText = (p) => bitsOf(p).join("");

/**
 * 무늬 8개 편집기(사용자가 고른 시안 A): 위에 이웃 세 칸, 아래에 결과 점. 점을 누르면 그 무늬의 결과가 바뀌고 번호가 따라간다.
 * 000 이 켜지는 규칙(홀수)은 끝없는 격자에서 못 돌려서 000 의 점은 잠가 둔다
 */
function makePatPad({ get, set, locked }) {
  const pats = h("div", { class: "pats", role: "group" });
  const items = PAT_ORDER.map((p) => {
    const lock = p === 0;
    const btn = h("button", {
      type: "button",
      class: lock ? "count locked" : "count",
      "aria-pressed": "false",
      "aria-disabled": lock ? "true" : null,
      title: lock ? LOCK_TEXT.odd() : null,
      onclick: () => {
        if (lock) return locked && locked(LOCK_TEXT.odd());
        const r = copy(get());
        r.number ^= 1 << p;
        set(r);
      },
    });
    const el = h(
      "div",
      { class: "pat" },
      h(
        "span",
        { class: "pat-in", "aria-hidden": "true" },
        bitsOf(p).map((b) => h("i", { class: b ? "on" : null })),
      ),
      btn,
    );
    return { p, el, btn };
  });
  pats.append(...items.map((x) => x.el));
  return {
    el: pats,
    update(r) {
      pats.setAttribute("aria-label", t("무늬 8개 (규칙 {n})", { n: r.number }));
      for (const { p, btn } of items) {
        const on = ((r.number >> p) & 1) === 1;
        btn.setAttribute("aria-pressed", String(on));
        const say = t("{p} 다음은 {v}", { p: bitsText(p), v: on ? t("켜짐") : t("꺼짐") });
        btn.setAttribute("aria-label", p === 0 ? `${say}. ${LOCK_TEXT.odd()}` : say);
      }
    },
    /** 살펴보는 칸을 정한 윗줄 무늬에 테 */
    mark(ex) {
      for (const { p, btn } of items) btn.classList.toggle("why", !!ex && ex.pattern === p);
    },
  };
}

const elementary = {
  id: "elementary",
  label: () => t("1차원"),
  batch: false,
  zoom: 8,
  follow: true, // 보는 곳이 새 줄을 따라 내려간다(손으로 끌면 멈춘다)
  top: true, // 0세대 줄을 화면 위쪽에 두고 시작
  speeds: () => speeds([["slow", 8], ["normal", 30], ["fast", 120]], (n) => t("1초에 {n}세대", { n })),
  tools: () => [
    { id: "pan", icon: icon(ICON.move), name: t("이동"), title: t("이동: 끌어서 둘러보기") },
    { id: "draw", icon: icon(ICON.pen), name: t("그리기"), title: t("그리기: 지금 줄을 따라 끌어서 칸 켜기") },
    { id: "look", icon: icon(ICON.eye), name: t("살펴보기"), title: t("살펴보기: 윗줄 세 칸과 그 결과") },
  ],
  tip: {
    pan: () => t("끌어서 둘러보고, 맨 아래 지금 줄의 칸을 눌러 켜거나 꺼요. 휠이나 두 손가락으로 확대·축소해요."),
    draw: () => t("지금 줄을 따라 끌어서 칸을 켜요. 켜진 칸에서 시작하면 꺼요. 둘러보려면 오른쪽 단추나 두 손가락으로 끌어요."),
    look: () => t("칸에 커서를 올리거나 눌러 보세요. 윗줄 세 칸의 무늬로 어떻게 정해졌는지 알려 줘요."),
  },
  words: {
    at: (g) => t("{g}세대", { g: num(g) }),
    value: (n) => t("켜진 칸 {n}", { n: num(n) }),
    aria: () => t("세대마다 지금 줄의 켜진 칸 수"),
    step: () => t("세대"),
    count: () => t("켜진 칸"),
  },
  canvasLabel: () => t("끝없는 격자. 세대가 아래로 쌓여요. 끌면 둘러보고, 맨 아래 줄의 칸을 누르면 켜거나 꺼요"),
  blank: () => ({
    id: "my-rule",
    name: t("내 1차원 규칙"),
    description: "",
    family: "elementary",
    grid: { edges: "infinite" },
    states: [{ name: t("빈칸") }, { name: t("켜진 칸") }],
    number: 30,
    seed: { type: "single" },
  }),
  withCode(r, p) {
    r.number = p.number;
    return r;
  },
  restore(rule, base) {
    const r = copy(rule);
    r.number = base.number;
    return r;
  },
  describe: () => t("위 세 칸이 이 무늬면 다음 줄 가운데 칸이 켜져요. 아래 점을 눌러 바꿔요."),
  codeBad: () => t("읽을 수 없는 표기예요. 예: W30, W90, W110 (0–255 의 짝수)"),
  codeOther: () => t("이 화면에서는 W30 같은 1차원 표기를 써요."),
  states: null,
  editor: (ctx) => makePatPad(ctx),
  hint: (world, tool) =>
    world.count > 0 ? null : tool === "draw" ? t("맨 아래 줄을 따라 끌어 칸을 켠 다음, 재생을 눌러 보세요.") : t("맨 아래 줄의 칸을 눌러 켠 다음, 재생을 눌러 보세요."),
  /** 지금 줄(맨 아래)의 칸만 켜고 끈다. 다른 줄이면 알릴 글 */
  tap(world, x, y) {
    if (y !== world.head) return t("맨 아래 지금 줄에서만 칸을 바꿀 수 있어요.");
    world.set(x, y, world.get(x, y) === 1 ? 0 : 1);
    return null;
  },
  strokeValue: (cur) => (cur === 1 ? 0 : 1),
  lookCells: (ex) => ex.cells,
  peek(ex, rule) {
    const name = (i) => rule.states[i]?.name ?? String(i);
    if (ex.why === "start") return [h("div", {}, t("지금 "), h("b", {}, name(ex.now))), h("div", {}, t("0세대 줄이에요. 여기서 시작해 아래로 쌓여요."))];
    if (ex.why === "none") return [h("div", {}, t("아직 만들지 않았거나 지운 줄이에요."))];
    const bits = bitsText(ex.pattern);
    return [
      h("div", { class: "peek-top" }, h("span", { class: "num" }, bits), h("span", {}, t("윗줄 세 칸"))),
      ex.why === "next" ? h("div", {}, t("다음 세대에 생길 칸이에요.")) : h("div", {}, t("지금 "), h("b", {}, name(ex.now))),
      h("div", {}, t("윗줄이 {bits} 이면 {state:이가} 돼요.", { bits, state: name(ex.next) }), ex.why === "rule" && ex.now !== ex.next ? t(" 이 칸은 손으로 바꿨어요.") : null),
    ];
  },
};

// ── 조건표 ─────────────────

const ALL_COUNTS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const copyRow = (tr) => (tr.when ? { from: tr.from, to: tr.to, when: { state: tr.when.state, count: [...tr.when.count] } } : { from: tr.from, to: tr.to });
/** 한국어 조사만(영어에서는 없음) */
const particle = (word, pair) => (lang() === "ko" ? josa(word, pair).slice(String(word).length) : "");

/** 조건표 줄이 맞지 않는 까닭(core/table.js 의 tableProblem 낱말) → 화면 글 */
function tableProblemText(p) {
  if (p.why === "lock") return LOCK_TEXT.empty();
  if (p.why === "many") return t("세는 상태는 {max}가지까지예요. 다른 줄에서 세는 상태를 골라 보세요.", { max: MAX_COUNTED });
  if (p.why === "list") return t("줄은 {max}개까지예요.", { max: MAX_TRANSITIONS });
  if (p.why === "zero") return t("빈칸은 셀 수 없어요.");
  return t("이 줄은 쓸 수 없어요.");
}

/**
 * 조건표 줄 편집기(사용자가 고른 시안 A): 줄마다 [지금 상태] → [바뀔 상태], 조건이 없으면 '늘',
 * 있으면 아랫줄에 '이웃의 [셀 상태]가 [0–8]개면'. 상태 단추는 누를 때마다 다음 상태로(Shift 는 앞 상태로).
 * '늘'을 누르면 조건이 붙고(처음에는 0–8 모두라 움직임은 그대로), 셀 상태를 마지막 다음으로 넘기면 다시 '늘'.
 * 끝없는 격자에서 못 돌리는 줄(이웃 없는 빈칸이 바뀜)이나 세는 상태가 셋이 되는 줄은 건너뛰거나 막고 까닭을 띄운다
 */
function makeTablePad({ get, set, locked }) {
  const list = h("ol", { class: "trs", "aria-label": t("조건표 줄") });
  const add = h("button", { class: "btn small", type: "button", onclick: (e) => addRow(e) }, t("줄 더하기"));
  const el = h("div", { class: "table-pad" }, list, h("div", { class: "file-row" }, add));
  let rows = []; // 줄마다 { li, counts: [단추 9개] | null }
  let marked = null;

  /** 줄 목록을 바꿔 본다. 쓸 수 없으면 까닭을 띄우고 거짓 */
  function apply(trs) {
    const p = tableProblem(trs, get().states.length);
    if (p) {
      locked(tableProblemText(p));
      return false;
    }
    const r = copy(get());
    r.transitions = trs;
    set(r);
    return true;
  }

  /** 줄 i 의 from·to·of(셀 상태, null 이면 '늘')를 dir 쪽으로 넘긴다. 쓸 수 없는 값은 건너뛴다 */
  function cycle(i, field, dir) {
    const r = get();
    const n = r.states.length;
    const row = r.transitions[i];
    const opts = field === "of" ? [...Array.from({ length: n - 1 }, (_, k) => k + 1), null] : Array.from({ length: n }, (_, k) => k);
    const cur = field === "from" ? row.from : field === "to" ? row.to : row.when ? row.when.state : null;
    const at = Math.max(0, opts.indexOf(cur));
    let skipped = null;
    for (let k = 1; k < opts.length; k++) {
      const v = opts[(at + dir * k + opts.length * k) % opts.length];
      const trs = r.transitions.map(copyRow);
      const tr = trs[i];
      if (field === "from") tr.from = v;
      else if (field === "to") tr.to = v;
      else if (v === null) delete tr.when;
      else tr.when = { state: v, count: tr.when ? tr.when.count : [...ALL_COUNTS] };
      const p = tableProblem(trs, n);
      if (p) {
        skipped = skipped ?? p;
        continue;
      }
      set({ ...copy(r), transitions: trs });
      if (skipped) locked(tableProblemText(skipped));
      return;
    }
    if (skipped) locked(tableProblemText(skipped));
  }

  /** '늘'인 줄에 조건을 붙인다: 이미 세는 상태가 있으면 그것, 없으면 상태 1. 처음에는 0–8 모두(움직임은 그대로) */
  function addWhen(i) {
    const r = get();
    const trs = r.transitions.map(copyRow);
    const state = countedStates(r.transitions)[0] ?? 1;
    trs[i].when = { state, count: [...ALL_COUNTS] };
    apply(trs);
  }

  function toggleCount(i, c) {
    const trs = get().transitions.map(copyRow);
    const w = trs[i].when;
    const s = new Set(w.count);
    if (s.has(c)) s.delete(c);
    else s.add(c);
    w.count = [...s].sort((a, b) => a - b);
    apply(trs);
  }

  function removeRow(i) {
    const trs = get().transitions.map(copyRow);
    trs.splice(i, 1);
    apply(trs);
  }

  /** 새 줄은 맨 아래에 '상태 1 → 상태 1 늘'(아무것도 안 바뀌는 줄). 단추를 눌러 고친다. 키보드로 더했으면 새 줄로 초점을 옮긴다 */
  function addRow(e) {
    const trs = get().transitions.map(copyRow);
    if (trs.length >= MAX_TRANSITIONS) return locked(tableProblemText({ why: "list" }));
    trs.push({ from: 1, to: 1 });
    if (apply(trs) && e && e.detail === 0) list.lastElementChild?.querySelector(".tr-st")?.focus({ preventScroll: true });
  }

  function build(r) {
    const look = boardColors(r.states, "table");
    const name = (i) => r.states[i]?.name ?? String(i);
    const stBtn = (i, field, v, role) =>
      h(
        "button",
        {
          type: "button",
          class: "tr-st",
          "data-k": `${i}:${field}`,
          title: t("누르면 다음 상태로 바뀌어요. Shift 를 누른 채 누르면 앞 상태로 가요."),
          "aria-label": `${role}: ${name(v)}`,
          onclick: (e) => cycle(i, field, e.shiftKey ? -1 : 1),
        },
        stateSwatch(look, v, r.states),
        name(v),
      );
    rows = r.transitions.map((tr, i) => {
      const del = h("button", { type: "button", class: "tr-del", "data-k": `${i}:del`, "aria-label": t("{n}번째 줄 지우기", { n: i + 1 }), onclick: () => removeRow(i) }, "✕");
      const head = [stBtn(i, "from", tr.from, t("지금 상태")), h("span", { class: "tr-to", "aria-hidden": "true" }, "→"), stBtn(i, "to", tr.to, t("바뀔 상태"))];
      if (!tr.when) {
        const always = h(
          "button",
          { type: "button", class: "tr-st tr-always", "data-k": `${i}:of`, title: t("조건 없이 늘 바뀌어요. 누르면 조건을 붙여요."), onclick: () => addWhen(i) },
          t("늘"),
        );
        return { li: h("li", { class: "tr" }, head, always, del), counts: null };
      }
      const w = tr.when;
      const zeroLock = tr.from === 0 && tr.to !== 0 && !w.count.includes(0);
      const counts = ALL_COUNTS.map((c) => {
        const lock = c === 0 && zeroLock;
        return h(
          "button",
          {
            type: "button",
            class: lock ? "count locked" : "count",
            "data-k": `${i}:c${c}`,
            "aria-pressed": String(w.count.includes(c)),
            "aria-disabled": lock ? "true" : null,
            title: lock ? LOCK_TEXT.empty() : null,
            onclick: () => (lock ? locked(LOCK_TEXT.empty()) : toggleCount(i, c)),
          },
          String(c),
        );
      });
      const of = stBtn(i, "of", w.state, t("셀 상태"));
      of.title = t("누르면 다음 상태로 바뀌어요. 마지막 다음은 '늘'(조건 없음)이에요.");
      const when = h(
        "span",
        { class: "tr-when" },
        t("이웃의"),
        " ",
        h("span", { class: "tr-of" }, of, particle(name(w.state), "이가")),
        h("span", { class: "counts", role: "group", "aria-label": t("이웃 수") }, counts),
        t("개면"),
      );
      return { li: h("li", { class: "tr" }, head, del, when), counts };
    });
    // 다시 그려도 누르던 단추에 초점이 남게(키보드로 고칠 때)
    const fk = document.activeElement?.closest?.(".trs") === list ? document.activeElement.dataset.k : null;
    list.replaceChildren(...rows.map((x) => x.li));
    if (fk) (list.querySelector(`[data-k="${fk}"]`) ?? list.querySelector(`[data-k^="${fk.split(":")[0]}:"]`))?.focus({ preventScroll: true });
    add.disabled = r.transitions.length >= MAX_TRANSITIONS;
    marked = null;
  }

  return {
    el,
    update: (r) => build(r),
    /** 살펴보는 칸에 맞은 줄에 테, 조건이 있으면 그 이웃 수에도 */
    mark(ex) {
      const key = ex && ex.why === "row" ? `${ex.row}:${ex.counts ? JSON.stringify(ex.counts) : ""}` : null;
      if (key === marked) return;
      marked = key;
      const trs = get().transitions;
      rows.forEach((x, i) => {
        const on = !!ex && ex.why === "row" && ex.row === i;
        x.li.classList.toggle("why", on);
        if (x.counts) {
          const n = on && trs[i]?.when ? ex.counts?.[trs[i].when.state] ?? 0 : -1;
          x.counts.forEach((b, c) => b.classList.toggle("why", c === n));
        }
      });
    },
  };
}

/** 와이어월드의 상태 이름 */
const WIREWORLD_STATES = () => [{ name: t("빈칸") }, { name: t("전자 머리") }, { name: t("전자 꼬리") }, { name: t("도선") }];

const table = {
  id: "table",
  label: () => t("조건표"),
  rle: true, // 와이어월드만 RLE 머리 줄 rule(WireWorld)로 주고받는다
  batch: false,
  zoom: 12,
  speeds: () => speeds([["slow", 4], ["normal", 10], ["fast", 30]], (n) => t("1초에 {n}세대", { n })),
  tools: () => [
    { id: "pan", icon: icon(ICON.move), name: t("이동"), title: t("이동: 끌어서 둘러보기") },
    { id: "draw", icon: icon(ICON.pen), name: t("그리기"), title: t("그리기: 끌어서 고른 상태로 칠하기") },
    { id: "look", icon: icon(ICON.eye), name: t("살펴보기"), title: t("살펴보기: 맞는 줄과 다음 세대") },
  ],
  tip: {
    pan: () => t("끌어서 둘러보고, 칸을 눌러 고른 상태로 칠하거나 비워요. 휠이나 두 손가락으로 확대·축소해요."),
    draw: () => t("끌어서 고른 상태로 칠해요. 그 상태인 칸에서 시작하면 지워요. 둘러보려면 오른쪽 단추나 두 손가락으로 끌어요."),
    look: () => t("칸에 커서를 올리거나 눌러 보세요. 어느 줄이 맞아 어떻게 바뀌는지 알려 줘요."),
  },
  /** 기록의 수는 상태 1 칸 수(와이어월드는 전자 머리)라 그 이름으로 부른다 */
  wordsFor(get) {
    const name = () => get().states[1]?.name ?? t("상태 1");
    return {
      at: (g) => t("{g}세대", { g: num(g) }),
      value: (n) => t("{name} {n}", { name: name(), n: num(n) }),
      aria: () => t("세대마다 {name} 칸 수", { name: name() }),
      step: () => t("세대"),
      count: () => name(),
      paint: () => t("칠할 상태"),
    };
  },
  canvasLabel: () => t("끝없는 격자. 끌면 둘러보고, 칸을 누르면 고른 상태로 칠하거나 비워요"),
  /** 만들기의 처음 규칙: 와이어월드와 같은 줄과 회로(요령 글이 와이어월드로 설명한다) */
  blank: () => ({
    id: "my-rule",
    name: t("내 조건표"),
    description: "",
    family: "table",
    grid: { edges: "infinite" },
    neighborhood: "moore",
    states: WIREWORLD_STATES(),
    transitions: WIREWORLD.map(copyRow),
    seed: { type: "rle", data: ".BAC$C3.25C$.3C!" },
  }),
  withCode: (r) => r,
  /** RLE 머리 줄의 규칙(parseRleRule 결과: 지금은 와이어월드뿐)을 씌운다 */
  withRle(r, p) {
    r.transitions = p.transitions.map(copyRow);
    r.states = p.id === "wireworld" ? WIREWORLD_STATES() : resizeStates(r.states, p.states, "table");
    return r;
  },
  restore(rule, base) {
    const r = copy(rule);
    r.transitions = base.transitions.map(copyRow);
    r.states = copy(base.states);
    return r;
  },
  describe: () => t("칸마다 위에서부터 처음 맞는 줄대로 바뀌고, 맞는 줄이 없으면 그대로예요. 상태 단추를 누르면 다음 상태로 바뀌어요."),
  codeBad: () => t("조건표는 표기가 없어요. 줄을 고치거나 규칙 파일을 불러오세요."),
  codeOther: () => t("조건표는 표기가 없어요. 줄을 고치거나 규칙 파일을 불러오세요."),
  states: {
    label: () => t("상태 수"),
    note: () => t("늘리면 줄에서 새 상태를 쓸 수 있어요. 줄이면 없어지는 상태를 쓰는 줄은 지워져요."),
    min: 2,
    max: MAX_TABLE_STATES,
  },
  /** 상태 수를 바꾼다. 없어지는 상태를 쓰는 줄은 지운다 */
  resize(r, n) {
    r.states = resizeStates(r.states, n, "table");
    r.transitions = r.transitions.filter((tr) => tr.from < n && tr.to < n && (!tr.when || tr.when.state < n)).map(copyRow);
    return r;
  },
  /** 칠할 상태의 처음 값: 마지막 상태(와이어월드는 도선) */
  paintDefault: (r) => r.states.length - 1,
  editor: (ctx) => makeTablePad(ctx),
  hint: (world, tool) =>
    world.filled > 0
      ? null
      : tool === "draw"
        ? t("칠할 상태를 고르고 끌어서 칸을 칠한 다음, 재생을 눌러 보세요.")
        : t("칠할 상태를 고르고 칸을 눌러 칠한 다음, 재생을 눌러 보세요."),
  tap(world, x, y, paint = 1) {
    world.set(x, y, world.get(x, y) === paint ? 0 : paint);
    return null;
  },
  strokeValue: (cur, paint = 1) => (cur === paint ? 0 : paint),
  lookCells: (ex, [x, y]) => ex?.cells ?? around(x, y),
  peek(ex, rule) {
    const name = (i) => rule.states[i]?.name ?? String(i);
    const counted = countedStates(rule.transitions);
    const nOf = (s) => ex.counts?.[s] ?? 0;
    return [
      counted.length
        ? h("div", { class: "peek-top" }, h("span", { class: "num" }, String(nOf(counted[0]))), h("span", {}, t("이웃의 {state}", { state: name(counted[0]) })))
        : null,
      counted.length > 1 ? h("div", {}, t("이웃의 {state} {n}개", { state: name(counted[1]), n: nOf(counted[1]) })) : null,
      h("div", {}, t("지금 "), h("b", {}, name(ex.now)), t(", 다음 세대 "), h("b", {}, name(ex.next))),
      h("div", {}, ex.why === "row" ? t("{n}번째 줄이 맞아요.", { n: ex.row + 1 }) : t("맞는 줄이 없어서 그대로예요.")),
    ];
  },
};

// ── 순환 ─────────────────

/** −·+ 단추와 수(.stepper, 더 보기의 상태 수와 같은 꼴) */
function stepper(label, out, minus, plus, onMinus, onPlus) {
  const dec = h("button", { class: "btn small square", type: "button", "aria-label": minus, onclick: onMinus }, icon(ICON.minus));
  const inc = h("button", { class: "btn small square", type: "button", "aria-label": plus, onclick: onPlus }, icon(ICON.plus));
  return { el: h("div", { class: "stepper", role: "group", "aria-label": label }, dec, out, inc), dec, inc };
}

/**
 * 순환 편집기: 색 고리(색마다 견본을 도는 차례로), 색 수(바탕 빼고 2–24), 문턱(1–이웃 수), 이웃(4칸 · 8칸).
 * 모양은 디자인 시안이 오기 전까지 더 보기(.more-body·.field·.stepper)와 계열 고르기(segmented)를 빌려 쓴다
 */
function makeCyclicPad({ get, set }) {
  const MAX_COLORS = MAX_CYCLIC_STATES - 1;
  const colorsOut = h("output", {}, "");
  const thrOut = h("output", {}, "");
  const colorsOf = () => get().states.length - 1;
  const setColors = (n) => {
    n = Math.max(2, Math.min(MAX_COLORS, n));
    if (n === colorsOf()) return;
    const r = copy(get());
    r.states = resizeStates(r.states, n + 1, "cyclic");
    set(r);
  };
  const setThr = (v) => {
    const r = copy(get());
    v = Math.max(1, Math.min(CYCLIC_THRESHOLD[r.neighborhood] ?? 8, v));
    if (v === r.threshold) return;
    r.threshold = v;
    set(r);
  };
  const setNb = (id) => {
    const r = copy(get());
    if (r.neighborhood === id) return;
    r.neighborhood = id;
    r.threshold = Math.min(r.threshold, CYCLIC_THRESHOLD[id]);
    set(r);
  };
  const colors = stepper(t("색 수"), colorsOut, t("색 하나 빼기"), t("색 하나 더하기"), () => setColors(colorsOf() - 1), () => setColors(colorsOf() + 1));
  const thr = stepper(t("문턱"), thrOut, t("문턱 낮추기"), t("문턱 높이기"), () => setThr(get().threshold - 1), () => setThr(get().threshold + 1));
  const nb = segmented({
    label: t("이웃"),
    value: get().neighborhood,
    options: [
      { id: "von-neumann", name: t("4칸"), title: t("폰 노이만 이웃: 위·아래·왼쪽·오른쪽 4칸") },
      { id: "moore", name: t("8칸"), title: t("무어 이웃: 둘레 8칸") },
    ],
    onChange: (id) => setNb(id),
  });
  const ring = h("div", { class: "cyc-ring", role: "img" });
  const field = (label, control) => h("div", { class: "field" }, h("span", { class: "field-label" }, label), control);
  const el = h("div", { class: "more-body cyc-pad" }, ring, field(t("색 수"), colors.el), field(t("문턱"), thr.el), field(t("이웃"), nb.el));
  let ringKey = "";
  let dots = [];
  return {
    el,
    update(r) {
      const n = r.states.length - 1;
      const max = CYCLIC_THRESHOLD[r.neighborhood] ?? 8;
      colorsOut.textContent = String(n);
      thrOut.textContent = String(r.threshold);
      colors.dec.disabled = n <= 2;
      colors.inc.disabled = n >= MAX_COLORS;
      thr.dec.disabled = r.threshold <= 1;
      thr.inc.disabled = r.threshold >= max;
      nb.set(r.neighborhood);
      const key = JSON.stringify(r.states);
      if (key !== ringKey) {
        ringKey = key;
        const look = boardColors(r.states, "cyclic");
        dots = r.states.slice(1).map((_, i) => stateSwatch(look, i + 1, r.states));
        ring.replaceChildren(...dots);
        ring.setAttribute("aria-label", t("색 고리: 색 {n}가지가 차례로 돌고, 마지막 다음은 다시 색 1", { n }));
      }
    },
    /** 살펴보는 칸이 넘어갈 다음 색의 견본에 테 */
    mark(ex) {
      dots.forEach((d, i) => d.classList.toggle("why", !!ex && ex.target === i + 1));
    },
  };
}

const cyclic = {
  id: "cyclic",
  label: () => t("순환"),
  batch: false,
  zoom: 3, // 소용돌이는 판이 150칸은 넘어야 나와서 작은 칸으로 넓게 본다
  phoneZoom: 2,
  seedArea: 0.92, // 보이는 넓이의 이만큼을 칠한다(넓을수록 소용돌이가 잘 나온다)
  speeds: () => speeds([["slow", 10], ["normal", 30], ["fast", 60]], (n) => t("1초에 {n}세대", { n })),
  tools: () => [
    { id: "pan", icon: icon(ICON.move), name: t("이동"), title: t("이동: 끌어서 둘러보기") },
    { id: "draw", icon: icon(ICON.pen), name: t("그리기"), title: t("그리기: 끌어서 고른 색으로 칠하기") },
    { id: "look", icon: icon(ICON.eye), name: t("살펴보기"), title: t("살펴보기: 다음 색 이웃과 문턱") },
  ],
  tip: {
    pan: () => t("끌어서 둘러보고, 칸을 눌러 고른 색으로 칠하거나 바탕으로 비워요. 휠이나 두 손가락으로 확대·축소해요."),
    draw: () => t("끌어서 고른 색으로 칠해요. 그 색인 칸에서 시작하면 바탕으로 지워요. 둘러보려면 오른쪽 단추나 두 손가락으로 끌어요."),
    look: () => t("칸에 커서를 올리거나 눌러 보세요. 바로 다음 색인 이웃을 세어 넘어가는지 알려 줘요."),
  },
  words: {
    at: (g) => t("{g}세대", { g: num(g) }),
    value: (n) => t("바뀐 칸 {n}", { n: num(n) }),
    aria: () => t("세대마다 색이 바뀐 칸 수"),
    step: () => t("세대"),
    // 순환은 바탕 아닌 칸 수가 늘 같아서 기록의 수는 한 세대에 색이 바뀐 칸 수다(셋째 칸은 색 수)
    count: () => t("바뀐 칸"),
    changed: () => t("색"),
    paint: () => t("칠할 색"),
  },
  changed: (world) => world.rule.states.length - 1,
  canvasLabel: () => t("끝없는 격자. 끌면 둘러보고, 칸을 누르면 고른 색으로 칠하거나 비워요"),
  blank: () => ({
    id: "my-rule",
    name: t("내 순환 규칙"),
    description: "",
    family: "cyclic",
    grid: { edges: "infinite" },
    neighborhood: "von-neumann",
    states: resizeStates([], 15, "cyclic"),
    threshold: 1,
    seed: { type: "random", density: 1 },
  }),
  withCode: (r) => r,
  restore(rule, base) {
    const r = copy(rule);
    r.threshold = base.threshold;
    r.neighborhood = base.neighborhood;
    r.states = copy(base.states);
    return r;
  },
  describe: (r) =>
    t("색 {n}가지가 고리를 돌아요. 이웃 가운데 바로 다음 색인 칸이 {k}개 이상이면 그 색으로 넘어가요. 바탕은 바뀌지 않아요.", {
      n: r.states.length - 1,
      k: r.threshold,
    }),
  codeBad: () => t("순환은 표기가 없어요. 색 수·문턱·이웃을 눌러 고쳐요."),
  codeOther: () => t("순환은 표기가 없어요. 색 수·문턱·이웃을 눌러 고쳐요."),
  states: null, // 색 수는 편집기에서
  editor: (ctx) => makeCyclicPad(ctx),
  hint: (world, tool) =>
    world.filled > 0
      ? null
      : tool === "draw"
        ? t("끌어서 칠하거나, 흩뿌리기로 판을 고르게 칠한 다음 재생을 눌러 보세요.")
        : t("흩뿌리기를 누르면 판을 색으로 고르게 칠해요. 그다음 재생을 눌러 보세요."),
  tap(world, x, y, paint = 1) {
    world.set(x, y, world.get(x, y) === paint ? 0 : paint);
    return null;
  },
  strokeValue: (cur, paint = 1) => (cur === paint ? 0 : paint),
  lookCells: (ex, [x, y]) => ex?.cells ?? around(x, y),
  peek(ex, rule) {
    const name = (i) => rule.states[i]?.name ?? String(i);
    if (ex.why === "base") return [h("div", {}, t("지금 "), h("b", {}, name(0))), h("div", {}, t("바탕은 바뀌지 않아요."))];
    return [
      h("div", { class: "peek-top" }, h("span", { class: "num" }, String(ex.n)), h("span", {}, t("다음 색 이웃"))),
      h("div", {}, t("지금 "), h("b", {}, name(ex.now)), t(", 다음 세대 "), h("b", {}, name(ex.next))),
      h(
        "div",
        {},
        ex.why === "turn"
          ? t("다음 색({target}) 이웃이 문턱 {k}에 닿아서 넘어가요.", { target: name(ex.target), k: ex.threshold })
          : t("다음 색({target}) 이웃이 문턱 {k}보다 적어서 그대로예요.", { target: name(ex.target), k: ex.threshold }),
      ),
    ];
  },
};

/** 화면이 있는 계열 */
export const FAMILY = { life, ant, elementary, table, cyclic };
export const SCREEN_FAMILIES = Object.keys(FAMILY);
