// 규칙 화면: 격자를 크게 돌리며 규칙을 고친다. 도감 규칙(#/r/<id>)과 만들기(#/make)가 함께 쓴다.
// 왼쪽은 격자와 재생, 오른쪽은 규칙·기록·더 보기. 고급 설정은 '더 보기' 안에만 둔다.

import { h, icon, ICON, setTitle, reducedMotion, clear } from "../ui/dom.js";
import { t, num } from "../i18n.js";
import { formatNotation, parseNotation, neighborCells, liveNeighbors, explain, MAX_STATES } from "../core/life.js";
import { checkRuleFile, toRuleFile, formatRuleFile, resizeStates, lifeRule, sameRule } from "../core/rules.js";
import { parseRLE } from "../core/rle.js";
import { randomSeed } from "../core/rng.js";
import { makeWorld } from "../ui/world.js";
import { makeBoard } from "../ui/board.js";
import { makeLoop, makePainter } from "../ui/loop.js";
import { attachPen } from "../ui/pen.js";
import { boardColors } from "../ui/theme.js";
import { makeRulePad, makeNotationField, describeRule } from "../ui/rulepad.js";
import { segmented, paragraphs } from "../ui/widgets.js";
import { makeSpark } from "../ui/spark.js";
import { patternArt } from "../ui/art.js";
import { makeThumb, hoverPlay } from "../ui/thumb.js";
import { load, save } from "../ui/store.js";
import { entryOf, tagOf, MORE_RULES, MAKE_TIPS } from "../data/catalog.js";
import { crumb } from "./common.js";

const copy = (o) => structuredClone(o);
const SIZES = [48, 64, 96, 128];
const SPEEDS = [
  { id: "slow", n: 4, name: () => t("느리게") },
  { id: "normal", n: 10, name: () => t("보통") },
  { id: "fast", n: 30, name: () => t("빠르게") },
];

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
    grid: { edges: "wrap" },
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
  // 주소의 ?rule=B36/S23&edges=wall 로 시작할 수 있다(고친 규칙을 주소로 나눈다)
  const fromUrl = params.rule ? parseNotation(params.rule) : null;
  if (fromUrl) {
    rule.birth = fromUrl.birth;
    rule.survive = fromUrl.survive;
    rule.states = resizeStates(rule.states, fromUrl.states);
  }
  if (params.edges === "wall" || params.edges === "wrap") rule.grid.edges = params.edges;
  setTitle(make ? t("새 규칙") : preset.name);

  let size = SIZES.includes(load("size", 64)) ? load("size", 64) : 64;
  let speed = SPEEDS.find((x) => x.id === load("speed", "normal")) ?? SPEEDS[1];
  let tool = "draw";
  let look = null; // 눌러서 고정한 칸 [x, y]
  let hover = null; // 커서 아래 칸
  const gw = () => rule.grid.width ?? size;
  const gh = () => rule.grid.height ?? size;

  const world = makeWorld(rule, { w: gw(), h: gh() });
  world.reseed();
  const thumbs = [];

  // ── 격자 ─────────────────
  const canvas = h("canvas", { role: "img", "aria-label": t("격자. 그리기에서는 칸을 눌러 바꾸고, 살펴보기에서는 칸의 이웃과 다음 세대를 보여 줘요") });
  const peek = h("div", { class: "peek", hidden: true, "aria-live": "polite" });
  const stage = h("div", { class: "stage" }, canvas, peek);
  const board = makeBoard(canvas, { onResize: () => paint() });

  const playBtn = h("button", { class: "btn ink", type: "button", "aria-keyshortcuts": "Space", onclick: () => setRunning(!loop.running) });
  const stepBtn = h(
    "button",
    {
      class: "btn square",
      type: "button",
      title: t("한 세대 (→)"),
      "aria-label": t("한 세대 넘기기"),
      "aria-keyshortcuts": "ArrowRight",
      onclick: () => stepOne(),
    },
    icon(ICON.step),
  );
  const backBtn = h(
    "button",
    { class: "btn square", type: "button", title: t("처음으로 (R)"), "aria-label": t("처음 모습으로"), "aria-keyshortcuts": "R", onclick: () => goBack() },
    icon(ICON.reset),
  );
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
      { id: "draw", icon: icon(ICON.pen), title: t("그리기") },
      { id: "look", icon: icon(ICON.eye), title: t("살펴보기") },
    ],
    onChange: (id) => setTool(id),
  });
  const status = h("p", { class: "status" });

  // ── 오른쪽: 규칙 ─────────────────
  const restoreBtn = h("button", { class: "text-btn", type: "button", hidden: true, onclick: () => restore() }, t("원래대로"));
  const pad = makeRulePad({ onToggle: (kind, n) => toggleCount(kind, n) });
  const say = h("p", { class: "say" });
  const notation = makeNotationField({ onCommit: (text) => setNotation(text) });

  // ── 오른쪽: 기록 ─────────────────
  const genNum = h("b", { class: "num" }, "0");
  const popNum = h("b", { class: "num" }, "0");
  const chgNum = h("b", { class: "num" }, "0");
  const spark = makeSpark();

  // ── 오른쪽: 더 보기 ─────────────────
  const sizeSeg = segmented({
    label: t("격자 크기"),
    value: String(size),
    options: SIZES.map((n) => ({ id: String(n), name: String(n), title: `${n}×${n}` })),
    onChange: (v) => setSize(Number(v)),
  });
  const edgeSeg = segmented({
    label: t("가장자리"),
    value: rule.grid.edges,
    options: [
      { id: "wrap", name: t("이어짐"), title: t("맞은편 가장자리와 이어 붙여요") },
      { id: "wall", name: t("벽"), title: t("격자 밖은 늘 빈칸이에요") },
    ],
    onChange: (id) => setEdges(id),
  });
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
        field(t("격자 크기"), sizeSeg.el),
        field(t("가장자리"), edgeSeg.el),
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

  main.append(
    h(
      "div",
      { class: "wrap" },
      crumb(),
      head,
      h(
        "div",
        { class: "bench" },
        h(
          "div",
          {},
          stage,
          h("div", { class: "transport" }, playBtn, stepBtn, backBtn, h("span", { class: "gap" }), speedSeg.el),
          h(
            "div",
            { class: "transport" },
            toolSeg.el,
            h("span", { class: "gap" }),
            h("button", { class: "btn small", type: "button", onclick: () => scatter() }, icon(ICON.shuffle), t("흩뿌리기")),
            h("button", { class: "btn small", type: "button", onclick: () => clearAll() }, t("비우기")),
          ),
          status,
        ),
        side,
      ),
      notes,
    ),
  );

  // ── 돌리기와 그리기 ─────────────────
  const loop = makeLoop({ step: () => world.step(), draw: (p) => render(p), rate: () => speed.n });
  const paint = makePainter(() => render(loop.progress()));
  let sparkAt = 0;

  const lookAt = () => look || (tool === "look" ? hover : null);

  function render(p = 1) {
    const { w, h: hh } = world.grid;
    const lc = lookAt();
    const lk = lc ? { x: lc[0], y: lc[1], neighbors: neighborCells(w, hh, lc[0], lc[1], world.wrap()) } : null;
    board.draw(world.cells, world.prev, { t: p, hover: tool === "draw" ? hover : null, look: lk });
    genNum.textContent = num(world.gen);
    popNum.textContent = num(world.count);
    chgNum.textContent = num(world.lastChanged);
    const now = performance.now();
    if (!loop.running || now - sparkAt > 250) {
      sparkAt = now;
      spark.update(world.alive, world.start);
    }
    showPeek(lc);
  }

  function showPeek(lc) {
    if (!lc) {
      peek.hidden = true;
      pad.markWhy(null);
      return;
    }
    const [x, y] = lc;
    const { w, h: hh } = world.grid;
    const s = world.cells[y * w + x];
    const n = liveNeighbors(world.cells, w, hh, x, y, world.wrap());
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

  function setRunning(on) {
    if (on) loop.start();
    else loop.stop();
    clear(playBtn).append(icon(on ? ICON.pause : ICON.play), h("span", { class: "label" }, on ? t("멈춤") : t("시작")));
    playBtn.setAttribute("aria-label", on ? t("멈추기") : t("시작하기"));
  }

  function stepOne() {
    setRunning(false);
    world.step();
    loop.pulse();
  }

  function goBack() {
    if (world.back()) paint();
  }

  function setTool(id) {
    tool = id;
    if (id !== "look") look = null;
    toolSeg.set(id);
    stage.classList.toggle("looking", id === "look");
    status.textContent =
      id === "draw" ? t("칸을 누르거나 끌어서 그려요. 산 칸에서 시작하면 지워요.") : t("칸에 커서를 올리거나 눌러 보세요. 이웃을 세고 다음 세대를 알려 줘요.");
    paint();
  }

  attachPen(canvas, {
    cellAt: (cx, cy) => board.cellAt(cx, cy),
    begin([x, y]) {
      if (tool === "look") {
        look = look && look[0] === x && look[1] === y ? null : [x, y];
        paint();
        return null;
      }
      const w = world.grid.w;
      const v = world.cells[y * w + x] === 1 ? 0 : 1;
      const put = ([cx, cy]) => {
        world.cells[cy * w + cx] = v;
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
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const c = board.cellAt(e.clientX, e.clientY);
    if (String(c) !== String(hover)) {
      hover = c;
      paint();
    }
  });
  canvas.addEventListener("pointerleave", () => {
    hover = null;
    paint();
  });

  // ── 규칙 바꾸기 ─────────────────
  function setRule(r, { reseed = false } = {}) {
    rule = r;
    world.setRule(r);
    if (world.grid.w !== gw() || world.grid.h !== gh()) {
      world.resize(gw(), gh());
      board.setGrid(world.grid.w, world.grid.h);
      look = null;
    }
    if (reseed) {
      world.reseed();
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
    edgeSeg.set(rule.grid.edges);
    statesOut.textContent = String(rule.states.length);
    sizeSeg.set(rule.grid.width || rule.grid.height ? null : String(size));
    if (make) setTitle(t("{code} 만들기", { code }));
    syncUrl(code);
  }

  /** 고친 규칙을 주소에 남긴다(그대로 나눌 수 있게). hashchange 는 일으키지 않는다 */
  function syncUrl(code) {
    const q = new URLSearchParams();
    if (make || code !== formatNotation(lifeRule(base))) q.set("rule", code);
    if (rule.grid.edges !== base.grid.edges) q.set("edges", rule.grid.edges);
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

  function setNotation(text) {
    const p = parseNotation(text);
    if (!p) return false;
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

  function setEdges(edges) {
    if (rule.grid.edges === edges) return;
    const r = copy(rule);
    r.grid.edges = edges;
    setRule(r);
  }

  function restore() {
    const r = copy(rule);
    r.birth = [...base.birth];
    r.survive = [...base.survive];
    r.states = copy(base.states);
    r.grid.edges = base.grid.edges;
    setRule(r);
  }

  function setSize(n) {
    size = n;
    save("size", n);
    const r = copy(rule);
    delete r.grid.width;
    delete r.grid.height;
    setRule(r, { reseed: true });
  }

  function scatter() {
    const s = rule.seed;
    world.scatter(s.type === "random" ? s.density : 0.3, randomSeed());
    look = null;
    paint();
  }

  function clearAll() {
    setRunning(false);
    world.clear();
    look = null;
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
      world.place(parseRLE(x.rle).rows);
      paint();
      setRunning(!reducedMotion());
    } else if (x.kind === "rule") {
      setNotation(x.notation);
      if (!loop.running && !reducedMotion()) setRunning(true);
    } else {
      world.invert();
      paint();
    }
    stage.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    // 다음에 누를 것은 대개 시작·멈춤이라, 스페이스가 바로 먹게 그 단추로 옮겨 간다
    playBtn.focus({ preventScroll: true });
  }

  const onScheme = () => {
    recolor();
    thumbs.forEach((x) => x.recolor());
  };
  window.addEventListener("schemechange", onScheme);

  board.setGrid(world.grid.w, world.grid.h);
  recolor();
  syncRule();
  setTool("draw");
  setRunning(!reducedMotion());

  return {
    onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return false;
      const el = e.target instanceof Element ? e.target : null;
      if (e.key === " ") {
        if (el && el.closest("button, a, summary")) return false; // 단추는 스스로 눌린다
        setRunning(!loop.running);
        return true;
      }
      if (e.key === "ArrowRight") {
        stepOne();
        return true;
      }
      if (e.key === "r" || e.key === "R") {
        goBack();
        return true;
      }
      if (e.key === "Escape" && look) {
        look = null;
        paint();
        return true;
      }
      return false;
    },
    destroy() {
      loop.cancel();
      paint.cancel();
      board.disconnect();
      thumbs.forEach((x) => x.destroy());
      window.removeEventListener("schemechange", onScheme);
    },
  };
}
