// 규칙 화면: 끝없는 격자를 크게 돌리며 규칙을 고친다. 도감 규칙(#/r/<id>)과 만들기(#/make)가 함께 쓴다.
// 왼쪽은 격자와 재생, 오른쪽은 규칙·기록·더 보기. 고급 설정은 '더 보기' 안에만 둔다.

import { h, icon, ICON, setTitle, reducedMotion } from "../ui/dom.js";
import { t, num } from "../i18n.js";
import { formatNotation, parseNotation, explain, MAX_STATES } from "../core/life.js";
import { checkRuleFile, toRuleFile, formatRuleFile, resizeStates, lifeRule, sameRule } from "../core/rules.js";
import { parseRLE } from "../core/rle.js";
import { randomSeed } from "../core/rng.js";
import { makeWorld, regionAt } from "../ui/world.js";
import { makeBoard } from "../ui/board.js";
import { makeLoop, makePainter } from "../ui/loop.js";
import { attachNav } from "../ui/nav.js";
import { boardColors } from "../ui/theme.js";
import { makeRulePad, makeNotationField, describeRule, blockedReason } from "../ui/rulepad.js";
import { segmented, paragraphs, zoomControls, flashLine, makeCapsule, makeFullscreen } from "../ui/widgets.js";
import { makeSpark } from "../ui/spark.js";
import { patternArt } from "../ui/art.js";
import { makeThumb, hoverPlay } from "../ui/thumb.js";
import { load, save } from "../ui/store.js";
import { entryOf, tagOf, MORE_RULES, MAKE_TIPS } from "../data/catalog.js";
import { crumb } from "./common.js";

const copy = (o) => structuredClone(o);
const SPEEDS = [
  { id: "slow", n: 4, name: () => t("느리게") },
  { id: "normal", n: 10, name: () => t("보통") },
  { id: "fast", n: 30, name: () => t("빠르게") },
];
const ZOOM = 10; // 처음 칸 한 변(css px)

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

const TOOL_TIP = {
  pan: () => t("끌어서 둘러보고, 칸을 눌러 살리거나 비워요. 휠이나 두 손가락으로 확대·축소해요."),
  draw: () => t("끌어서 칸을 그려요. 산 칸에서 시작하면 지워요. 둘러보려면 오른쪽 단추나 두 손가락으로 끌어요."),
  look: () => t("칸에 커서를 올리거나 눌러 보세요. 이웃을 세고 다음 세대를 알려 줘요."),
};

/** 8 이웃 자리 */
const around = (x, y) => [
  [x - 1, y - 1],
  [x, y - 1],
  [x + 1, y - 1],
  [x - 1, y],
  [x + 1, y],
  [x - 1, y + 1],
  [x, y + 1],
  [x + 1, y + 1],
];

/** 규칙에 표기만 바꿔 씌운 것(그림용) */
function withNotation(rule, code) {
  const p = parseNotation(code);
  const r = structuredClone(rule);
  r.birth = p.birth;
  r.survive = p.survive;
  r.states = resizeStates(r.states, p.states);
  return r;
}

/** 만들기 화면의 처음 규칙 */
function blankRule() {
  return {
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
  };
}

export function ruleView(main, { preset = null, params = {} } = {}) {
  const make = !preset;
  const base = make ? blankRule() : preset;
  const entry = make ? null : entryOf(preset.id);
  let rule = copy(base);
  // 주소의 ?rule=B36/S23 으로 시작할 수 있다(고친 규칙을 주소로 나눈다)
  const fromUrl = params.rule ? parseNotation(params.rule) : null;
  if (fromUrl && !fromUrl.birth.includes(0)) {
    rule.birth = fromUrl.birth;
    rule.survive = fromUrl.survive;
    rule.states = resizeStates(rule.states, fromUrl.states);
  }
  setTitle(make ? t("새 규칙") : preset.name);

  let speed = SPEEDS.find((x) => x.id === load("speed", "normal")) ?? SPEEDS[1];
  let tool = "pan";
  let look = null; // 눌러서 고정한 칸 [x, y]
  let hover = null; // 커서 아래 칸
  let seeded = false;

  const world = makeWorld(rule);
  const thumbs = [];

  // ── 격자 ─────────────────
  const canvas = h("canvas", { role: "img", "aria-label": t("끝없는 격자. 끌면 둘러보고, 칸을 누르면 살리거나 비워요") });
  const peek = h("div", { class: "peek", hidden: true, "aria-live": "polite" });
  const hint = h("p", { class: "stage-hint", hidden: true });
  const flash = flashLine();
  const zoom = zoomControls({ onIn: () => zoomBy(1.25), onOut: () => zoomBy(0.8), onFit: () => fitView(), onFull: () => fs.toggle() });
  // 전체 화면에서만 보이는 세대·산 칸
  const statGen = h("b", {}, "0");
  const statPop = h("b", {}, "0");
  const stats = h("p", { class: "stage-stats" }, h("span", {}, t("세대")), statGen, h("span", {}, t("산 칸")), statPop);
  const stage = h("div", { class: "stage", dataset: { tool } }, canvas, peek, hint, stats, flash.el, zoom.el);
  const board = makeBoard(canvas, { onResize: () => ready() });

  const capsule = makeCapsule({
    onPlay: () => setRunning(!loop.running),
    onStep: () => stepOne(),
    onBack: () => goBack(),
    onScatter: () => scatter(),
    onClear: () => clearAll(),
  });
  const playBtn = capsule.playBtn;
  const speedSeg = segmented({
    label: t("빠르기"),
    value: speed.id,
    options: SPEEDS.map((x) => ({ id: x.id, name: x.name(), title: t("1초에 {n}세대", { n: x.n }) })),
    onChange: (id) => {
      speed = SPEEDS.find((x) => x.id === id) ?? speed;
      save("speed", id);
    },
  });
  const toolSeg = segmented({
    label: t("손"),
    value: tool,
    options: [
      { id: "pan", icon: icon(ICON.move), name: t("이동"), title: t("이동: 끌어서 둘러보기") },
      { id: "draw", icon: icon(ICON.pen), name: t("그리기"), title: t("그리기: 끌어서 칸 그리기") },
      { id: "look", icon: icon(ICON.eye), name: t("살펴보기"), title: t("살펴보기: 칸의 이웃과 다음 세대") },
    ],
    onChange: (id) => setTool(id),
  });
  const status = h("p", { class: "status" });

  // ── 오른쪽: 규칙 ─────────────────
  const restoreBtn = h("button", { class: "text-btn", type: "button", hidden: true, onclick: () => restore() }, t("원래대로"));
  const pad = makeRulePad({ onToggle: (kind, n) => toggleCount(kind, n), onLocked: (why) => (say.textContent = why) });
  const say = h("p", { class: "say" });
  const notation = makeNotationField({ onCommit: (text) => setNotation(text) });

  // ── 오른쪽: 기록 ─────────────────
  const genNum = h("b", { class: "num" }, "0");
  const popNum = h("b", { class: "num" }, "0");
  const chgNum = h("b", { class: "num" }, "0");
  const spark = makeSpark();

  // ── 오른쪽: 더 보기 ─────────────────
  const statesOut = h("output", {}, "2");
  const statesField = h(
    "div",
    { class: "stepper", role: "group", "aria-label": t("상태 수") },
    h(
      "button",
      { class: "btn small square", type: "button", "aria-label": t("상태 하나 빼기"), onclick: () => setStates(rule.states.length - 1) },
      icon(ICON.minus),
    ),
    statesOut,
    h(
      "button",
      { class: "btn small square", type: "button", "aria-label": t("상태 하나 더하기"), onclick: () => setStates(rule.states.length + 1) },
      icon(ICON.plus),
    ),
  );
  const errs = h("ul", { class: "errs", role: "status" });
  const fileIn = h("input", { type: "file", accept: ".json,application/json", hidden: true });
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files && fileIn.files[0];
    fileIn.value = "";
    if (f) showErrors(applyText(await f.text()));
  });
  const field = (label, control, hint = null) => h("div", { class: "field" }, h("span", { class: "field-label" }, label), control, hint);

  const side = h(
    "aside",
    { class: "side", "aria-label": t("규칙과 기록") },
    h(
      "section",
      { class: "side-sec", "aria-labelledby": "rule-t" },
      h("div", { class: "side-head" }, h("h2", { id: "rule-t" }, t("규칙")), restoreBtn),
      pad.el,
      say,
    ),
    h(
      "section",
      { class: "side-sec", "aria-label": t("기록") },
      h(
        "div",
        { class: "readouts" },
        h("div", { class: "readout" }, h("span", {}, t("세대")), genNum),
        h("div", { class: "readout" }, h("span", {}, t("산 칸")), popNum),
        h("div", { class: "readout" }, h("span", {}, t("바뀐 칸")), chgNum),
      ),
      spark.el,
    ),
    h(
      "details",
      { class: "side-sec more" },
      h("summary", {}, t("더 보기"), icon(ICON.down)),
      h(
        "div",
        { class: "more-body" },
        field(t("상태 수"), statesField, h("span", { class: "field-label" }, t("3 이상이면 죽는 칸이 그만큼 단계를 거쳐 사라져요."))),
        field(
          t("규칙 파일"),
          h(
            "div",
            { class: "file-row" },
            h("button", { class: "btn small", type: "button", onclick: () => download() }, icon(ICON.save), t("내려받기")),
            h("button", { class: "btn small", type: "button", onclick: () => fileIn.click() }, icon(ICON.open), t("불러오기")),
            fileIn,
          ),
          errs,
        ),
      ),
    ),
  );

  // ── 머리와 본문 ─────────────────
  const head = h(
    "div",
    { class: "rule-head" },
    h(
      "div",
      {},
      h("h1", {}, make ? t("새 규칙") : preset.name),
      h("p", {}, make ? t("점을 눌러 규칙을 정하고, 칸을 그려 시작 모습을 만들어요. 마음에 들면 규칙 파일로 내려받으세요.") : tagOf(preset)),
    ),
    notation.el,
  );

  const notes = make
    ? [
        h(
          "section",
          { class: "notes" },
          h("h2", {}, t("요령")),
          h(
            "ul",
            { class: "tips" },
            MAKE_TIPS().map((x) => h("li", {}, x)),
          ),
        ),
        h(
          "section",
          { class: "notes" },
          h("h2", {}, t("다른 규칙 써 보기")),
          h(
            "ul",
            { class: "cards" },
            MORE_RULES().map((x) => card({ kind: "rule", ...x })),
          ),
        ),
      ]
    : [
        h("section", { class: "notes" }, h("h2", {}, t("이 규칙은")), h("div", { class: "body" }, paragraphs(entry ? entry.about() : [preset.description]))),
        entry && entry.watch().length
          ? h(
              "section",
              { class: "notes" },
              h("h2", {}, t("볼 것")),
              h(
                "ul",
                { class: "cards" },
                entry.watch().map((x) => card(x)),
              ),
            )
          : null,
      ];

  // 격자와 재생 막대, 손·빠르기를 한 묶음으로. 전체 화면에서는 이 묶음이 화면을 채우고 아래 띠가 된다
  const boardWrap = h(
    "div",
    { class: "board-wrap" },
    stage,
    capsule.el,
    h("div", { class: "transport" }, toolSeg.el, h("span", { class: "gap" }), speedSeg.el),
  );
  const fs = makeFullscreen(boardWrap, {
    onChange(on) {
      zoom.setFull(on);
      flash.hide();
      paint();
      // 들어가면 재생 단추로 옮겨 스페이스가 재생·일시정지가 되게
      if (on) playBtn.focus({ preventScroll: true });
    },
  });

  main.append(
    h(
      "div",
      { class: "wrap" },
      crumb(),
      head,
      h(
        "div",
        { class: "bench" },
        h("div", {}, boardWrap, status),
        side,
      ),
      notes,
    ),
  );

  // ── 돌리기와 그리기 ─────────────────
  const loop = makeLoop({ step: () => tick(), draw: (p) => render(p), rate: () => speed.n });
  const paint = makePainter(() => render(loop.progress()));
  let sparkAt = 0;

  const lookAt = () => look || (tool === "look" ? hover : null);

  function render(p = 1) {
    const lc = lookAt();
    board.draw(world, { t: p, hover: tool !== "look" ? hover : null, look: lc ? { x: lc[0], y: lc[1], neighbors: around(lc[0], lc[1]) } : null });
    genNum.textContent = statGen.textContent = num(world.gen);
    popNum.textContent = statPop.textContent = num(world.count);
    chgNum.textContent = num(world.lastChanged);
    const now = performance.now();
    if (!loop.running || now - sparkAt > 250) {
      sparkAt = now;
      spark.update(world.alive, world.start);
    }
    hint.hidden = world.count > 0;
    if (!hint.hidden) hint.textContent = tool === "draw" ? t("끌어서 칸을 그린 다음, 재생을 눌러 보세요.") : t("칸을 눌러 살릴 칸을 고른 다음, 재생을 눌러 보세요.");
    showPeek(lc);
  }

  function showPeek(lc) {
    if (!lc) {
      peek.hidden = true;
      pad.markWhy(null);
      return;
    }
    const [x, y] = lc;
    const s = world.get(x, y);
    const n = around(x, y).filter(([a, b]) => world.get(a, b) === 1).length;
    const ex = explain(lifeRule(rule), s, n);
    const name = (i) => rule.states[i]?.name ?? String(i);
    peek.replaceChildren(
      h("div", { class: "peek-top" }, h("span", { class: "num" }, String(n)), h("span", {}, t("산 이웃"))),
      h("div", {}, t("지금 "), h("b", {}, name(s)), t(", 다음 세대 "), h("b", {}, name(ex.next))),
      h("div", {}, WHY[ex.why](n), "."),
    );
    peek.hidden = false;
    pad.markWhy(ROW_OF[ex.why] ?? null, n);
    // 칸 오른쪽 아래에 두되, 무대 밖으로 나가면 반대쪽으로
    const box = board.cellBox(x, y);
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const pw = peek.offsetWidth;
    const ph = peek.offsetHeight;
    const gapPx = box.size * 1.6 + 10;
    let left = box.x + gapPx;
    let top = box.y + gapPx;
    if (left + pw > sw - 8) left = box.x - gapPx - pw;
    if (top + ph > sh - 8) top = box.y - gapPx - ph;
    peek.style.left = `${Math.max(8, left)}px`;
    peek.style.top = `${Math.max(8, top)}px`;
  }

  /** 보이는 넓이에 k 를 곱한 네모 */
  const viewRegion = (k = 1) => {
    const v = board.view();
    const s = board.span();
    return regionAt(v.cx, v.cy, s.w * k, s.h * k);
  };

  // 화면 크기를 처음 잰 뒤에 보이는 넓이의 70% 쯤에 뿌린다(둘레가 비어 있어야 끝없이 퍼지는 모습이 보인다)
  function ready() {
    if (!seeded && board.ready) {
      seeded = true;
      board.setView({ cx: 0, cy: 0, z: canvas.clientWidth < 560 ? 8 : ZOOM });
      world.reseed(world.seed, viewRegion(0.7));
    }
    zoom.update(board.canZoom());
    render(loop.progress());
  }

  function tick() {
    if (world.step()) return;
    setRunning(false);
    if (world.full) {
      flash.show(t("너무 넓게 퍼져서 멈췄어요. 흩뿌리기나 비우기로 다시 시작해 보세요."), 6000);
      status.textContent = t("너무 넓게 퍼져서 멈췄어요. 흩뿌리기나 비우기로 다시 시작해 보세요.");
    }
  }

  function setRunning(on) {
    if (on && !world.canRun()) on = false;
    if (on) loop.start();
    else {
      loop.stop();
      paint(); // 도는 동안 기록 그래프는 0.25초에 한 번만 고치니, 멈출 때 마지막 세대까지 맞춰 그린다
    }
    capsule.setPlaying(on);
  }

  function stepOne() {
    setRunning(false);
    if (world.step()) loop.pulse();
    else tick();
  }

  function goBack() {
    if (world.back()) {
      status.textContent = TOOL_TIP[tool]();
      paint();
    }
  }

  function setTool(id) {
    tool = id;
    if (id !== "look") look = null;
    toolSeg.set(id);
    stage.dataset.tool = id;
    status.textContent = TOOL_TIP[id]();
    paint();
  }

  function zoomBy(f) {
    board.zoomBy(f);
    zoom.update(board.canZoom());
    paint();
  }

  /** 산 칸이 모두 보이게. 비었으면 가운데로 */
  function fitView() {
    const b = world.bounds();
    if (b) board.fit(b, { fill: 0.8, zmax: 24 });
    else board.setView({ cx: 0, cy: 0, z: ZOOM });
    zoom.update(board.canZoom());
    paint();
  }

  attachNav(canvas, board, {
    tool: () => tool,
    wheel: "zoom",
    touch: "full",
    onTap([x, y]) {
      if (tool === "look") {
        look = look && look[0] === x && look[1] === y ? null : [x, y];
        paint();
        return;
      }
      world.set(x, y, world.get(x, y) === 1 ? 0 : 1);
      world.touched();
      paint();
    },
    onStroke([x, y]) {
      const v = world.get(x, y) === 1 ? 0 : 1;
      const put = ([cx, cy]) => {
        world.set(cx, cy, v);
        paint();
      };
      put([x, y]);
      return {
        move: put,
        end: () => {
          world.touched();
          paint();
        },
      };
    },
    onView() {
      zoom.update(board.canZoom());
      paint();
    },
    onHover(c) {
      if (String(c) === String(hover)) return;
      hover = c;
      paint();
    },
  });

  // ── 규칙 바꾸기 ─────────────────
  function setRule(r, { reseed = false } = {}) {
    rule = r;
    world.setRule(r);
    if (reseed) {
      world.reseed(randomSeed(), viewRegion(0.7));
      look = null;
    }
    recolor();
    syncRule();
  }

  function recolor() {
    board.setColors(boardColors(rule.states), rule.states.length);
    paint();
  }

  function syncRule() {
    const code = formatNotation(lifeRule(rule));
    const edited = !make && !sameRule(base, rule);
    pad.update(rule);
    notation.update(rule, { edited });
    say.textContent = describeRule(rule);
    restoreBtn.hidden = !edited;
    statesOut.textContent = String(rule.states.length);
    if (make) setTitle(t("{code} 만들기", { code }));
    syncUrl(code);
  }

  /** 고친 규칙을 주소에 남긴다(그대로 나눌 수 있게). hashchange 는 일으키지 않는다 */
  function syncUrl(code) {
    const q = new URLSearchParams();
    if (make || code !== formatNotation(lifeRule(base))) q.set("rule", code);
    const path = make ? "#/make" : `#/r/${preset.id}`;
    const want = q.toString() ? `${path}?${q}` : path;
    if (location.hash !== want) history.replaceState(null, "", want);
  }

  function toggleCount(kind, n) {
    const r = copy(rule);
    const set = new Set(r[kind]);
    if (set.has(n)) set.delete(n);
    else set.add(n);
    r[kind] = [...set].sort((a, b) => a - b);
    setRule(r);
  }

  /** 표기를 적용한다. 틀리면 거짓, 돌릴 수 없는 규칙이면 그 까닭 */
  function setNotation(text) {
    const p = parseNotation(text);
    if (!p) return false;
    const why = blockedReason(p);
    if (why) return why;
    const r = copy(rule);
    r.birth = p.birth;
    r.survive = p.survive;
    r.states = resizeStates(r.states, p.states);
    setRule(r);
    return true;
  }

  function setStates(n) {
    n = Math.min(MAX_STATES, Math.max(2, n));
    if (n === rule.states.length) return;
    const r = copy(rule);
    r.states = resizeStates(r.states, n);
    setRule(r);
  }

  function restore() {
    const r = copy(rule);
    r.birth = [...base.birth];
    r.survive = [...base.survive];
    r.states = copy(base.states);
    setRule(r);
  }

  function scatter() {
    const s = rule.seed;
    world.scatter(s.type === "random" ? s.density : 0.3, randomSeed(), viewRegion(0.7));
    look = null;
    flash.hide();
    status.textContent = TOOL_TIP[tool]();
    paint();
  }

  /** 비우고 멈춘다: 이제 칸을 눌러 고른 뒤 재생하면 된다 */
  function clearAll() {
    setRunning(false);
    world.clear();
    look = null;
    flash.hide();
    status.textContent = TOOL_TIP[tool]();
    paint();
  }

  // ── 규칙 파일 ─────────────────
  function showErrors(list) {
    errs.replaceChildren(...list.map((e) => h("li", {}, e)));
  }

  /** 규칙 파일 글을 적용한다. 틀리면 무엇이 틀렸는지 글 목록을 돌려준다 */
  function applyText(text) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return [t("JSON 으로 읽을 수 없어요: {m}", { m: e.message })];
    }
    const res = checkRuleFile(obj);
    if (res.errors) return res.errors;
    const why = blockedReason(res.rule);
    if (why) return [why];
    setRule(res.rule, { reseed: true });
    return [];
  }

  function download() {
    const blob = new Blob([formatRuleFile(toRuleFile(rule))], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `${rule.id || "rule"}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ── 볼 것: 무늬 놓기, 규칙 바꾸기, 뒤집기 ─────────────────
  function card(x) {
    let art;
    let label;
    if (x.kind === "pattern") {
      art = patternArt(parseRLE(x.rle).rows);
      label = t("놓아 보기");
    } else if (x.kind === "rule") {
      const th = makeThumb(withNotation(base, x.notation), { w: 32, h: 24, gens: 30, key: x.notation });
      thumbs.push(th);
      return hoverPlay(
        h(
          "li",
          { class: "card" },
          h("div", { class: "card-art live" }, th.canvas),
          h("h3", {}, x.name, h("span", { class: "code" }, x.notation)),
          h("p", {}, x.text),
          h("button", { class: "btn small", type: "button", onclick: () => act(x) }, t("써 보기")),
        ),
        th,
      );
    } else {
      art = patternArt([
        [1, 1, 1, 0, 0, 0],
        [1, 1, 1, 0, 0, 0],
        [0, 0, 0, 1, 1, 1],
        [0, 0, 0, 1, 1, 1],
      ]);
      label = t("뒤집기");
    }
    return h(
      "li",
      { class: "card" },
      h("div", { class: "card-art" }, art),
      h("h3", {}, x.name),
      h("p", {}, x.text),
      h("button", { class: "btn small", type: "button", onclick: () => act(x) }, label),
    );
  }

  function act(x) {
    if (x.kind === "pattern") {
      look = null;
      const v = board.view();
      world.place(parseRLE(x.rle).rows, Math.round(v.cx), Math.round(v.cy));
      // 무늬가 화면의 3분의 1쯤 차게 맞춘다(날아가는 무늬도 한동안 보이게)
      const b = world.bounds();
      if (b) board.fit(b, { fill: 0.34, zmax: 16 });
      zoom.update(board.canZoom());
      paint();
      setRunning(!reducedMotion());
    } else if (x.kind === "rule") {
      setNotation(x.notation);
      if (!loop.running && !reducedMotion()) setRunning(true);
    } else {
      // 보이는 곳(너무 넓으면 가운데 160×120)만 뒤집는다
      const r = viewRegion();
      const w = Math.min(r.w, 160);
      const hh = Math.min(r.h, 120);
      world.invert(regionAt(r.x + r.w / 2, r.y + r.h / 2, w, hh));
      paint();
    }
    stage.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    // 다음에 누를 것은 대개 재생·일시정지라, 스페이스가 바로 먹게 그 단추로 옮겨 간다
    playBtn.focus({ preventScroll: true });
  }

  const onScheme = () => {
    recolor();
    thumbs.forEach((x) => x.recolor());
  };
  window.addEventListener("schemechange", onScheme);

  recolor();
  syncRule();
  setTool("pan");
  setRunning(!reducedMotion());

  return {
    onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return false;
      const el = e.target instanceof Element ? e.target : null;
      const k = e.key;
      if (k === " ") {
        if (el && el.closest("button, a, summary")) return false; // 단추는 스스로 눌린다
        setRunning(!loop.running);
        return true;
      }
      if (e.shiftKey && k.startsWith("Arrow")) {
        // Shift+화살표: 화면 4분의 1씩 둘러보기
        const r = canvas.getBoundingClientRect();
        const d = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[k];
        if (!d) return false;
        board.panBy((d[0] * r.width) / 4, (d[1] * r.height) / 4);
        paint();
        return true;
      }
      if (k === "ArrowRight") return stepOne(), true;
      if (k === "r" || k === "R") return goBack(), true;
      if (k === "+" || k === "=") return zoomBy(1.25), true;
      if (k === "-" || k === "_") return zoomBy(0.8), true;
      if (k === "0") return fitView(), true;
      if (k === "f" || k === "F") return fs.toggle(), true;
      if (k === "Escape" && look) {
        look = null;
        paint();
        return true;
      }
      if (k === "Escape" && fs.on) return fs.exit(), true;
      return false;
    },
    destroy() {
      fs.destroy();
      loop.cancel();
      paint.cancel();
      board.disconnect();
      thumbs.forEach((x) => x.destroy());
      window.removeEventListener("schemechange", onScheme);
    },
  };
}
