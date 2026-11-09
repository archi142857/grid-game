// 규칙 화면: 끝없는 격자를 크게 돌리며 규칙을 고친다. 도감 규칙(#/r/<id>)과 만들기(#/make)가 함께 쓴다.
// 왼쪽은 격자와 재생, 오른쪽은 규칙·기록·더 보기. 고급 설정은 '더 보기' 안에만 둔다.
// 계열(Life·개미 …)마다 다른 것(편집기·표기·손·빠르기·낱말·살펴보기 글)은 ui/families.js 가 맡는다.
// 만들기는 계열부터 고른다(#/make?family=ant, 또는 ?rule=LLRR 처럼 그 계열 표기).

import { h, icon, ICON, setTitle, reducedMotion } from "../ui/dom.js";
import { t, num } from "../i18n.js";
import { checkRuleFile, toRuleFile, formatRuleFile, resizeStates, sameRule, parseCode, formatCode, lockOf } from "../core/rules.js";
import { parseRLE } from "../core/rle.js";
import { randomSeed } from "../core/rng.js";
import { makeWorld, regionAt } from "../ui/world.js";
import { makeBoard } from "../ui/board.js";
import { makeLoop, makePainter } from "../ui/loop.js";
import { attachNav } from "../ui/nav.js";
import { boardColors } from "../ui/theme.js";
import { makeNotationField } from "../ui/rulepad.js";
import { segmented, paragraphs, zoomControls, flashLine, makeCapsule, makeFullscreen } from "../ui/widgets.js";
import { makeSpark } from "../ui/spark.js";
import { patternArt } from "../ui/art.js";
import { makeThumb, hoverPlay } from "../ui/thumb.js";
import { load, save } from "../ui/store.js";
import { FAMILY, SCREEN_FAMILIES, LOCK_TEXT, stateSwatch } from "../ui/families.js";
import { entryOf, tagOf, MORE_RULES, MAKE_TIPS } from "../data/catalog.js";
import { crumb } from "./common.js";

const copy = (o) => structuredClone(o);

/** 계열마다 만들기 화면의 처음 글 */
const MAKE_LEAD = {
  life: () => t("점을 눌러 규칙을 정하고, 칸을 그려 시작 모습을 만들어요. 마음에 들면 규칙 파일로 내려받으세요."),
  ant: () => t("글자를 눌러 칸 색마다 도는 쪽을 정하고, 개미 손으로 개미를 놓아요. 마음에 들면 규칙 파일로 내려받으세요."),
  elementary: () => t("무늬 아래 점을 눌러 규칙을 정하고, 맨 아래 줄의 칸을 켜서 시작해요. 마음에 들면 규칙 파일로 내려받으세요."),
  table: () => t("줄의 상태 단추와 이웃 수를 눌러 규칙을 고치고, 칠할 상태를 골라 칸을 칠해요. 마음에 들면 규칙 파일로 내려받으세요."),
};

export function ruleView(main, { preset = null, params = {} } = {}) {
  const make = !preset;
  // 주소의 ?rule=B36/S23 · LLRR 로 시작할 수 있다(고친 규칙을 주소로 나눈다). 만들기는 표기의 계열을 따른다
  const fromUrl = params.rule ? parseCode(params.rule) : null;
  const famId = make ? (fromUrl && FAMILY[fromUrl.family] ? fromUrl.family : FAMILY[params.family] ? params.family : "life") : preset.family;
  const fam = FAMILY[famId] ?? FAMILY.life;
  const base = make ? fam.blank() : preset;
  const entry = make ? null : entryOf(preset.id);
  let rule = copy(base);
  if (fromUrl && fromUrl.family === fam.id && !lockOf(fromUrl)) rule = fam.withCode(rule, fromUrl);
  setTitle(make ? t("새 규칙") : preset.name);

  const SPEEDS = fam.speeds();
  let speed = SPEEDS.find((x) => x.id === load("speed", "normal")) ?? SPEEDS[1];
  let tool = "pan";
  let look = null; // 눌러서 고정한 칸 [x, y]
  let hover = null; // 커서 아래 칸
  let seeded = false;
  let follow = !!fam.follow; // 1차원: 보는 곳이 새 줄을 따라 내려간다

  const world = makeWorld(rule);
  const thumbs = [];
  // 낱말(세대·산 칸 …). 조건표는 상태 1 의 이름을 쓰니 지금 규칙을 보고 만든다
  const words = fam.wordsFor ? fam.wordsFor(() => rule) : fam.words;
  // 칠할 상태: 상태가 셋 이상일 때 고른다(이동 손으로 누르기·그리기 손이 이 상태로 칠한다)
  let paintState = fam.paintDefault ? fam.paintDefault(rule) : 1;

  // ── 격자 ─────────────────
  const canvas = h("canvas", { role: "img", "aria-label": fam.canvasLabel() });
  const peek = h("div", { class: "peek", hidden: true, "aria-live": "polite" });
  const hint = h("p", { class: "stage-hint", hidden: true });
  const flash = flashLine();
  const zoom = zoomControls({ onIn: () => zoomBy(1.25), onOut: () => zoomBy(0.8), onFit: () => fitView(), onFull: () => fs.toggle() });
  // 전체 화면에서만 보이는 세대·산 칸
  const statGen = h("b", {}, "0");
  const statPop = h("b", {}, "0");
  const statCount = h("span", {}, words.count());
  const stats = h("p", { class: "stage-stats" }, h("span", {}, words.step()), statGen, statCount, statPop);
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
    options: SPEEDS.map((x) => ({ id: x.id, name: x.name, title: x.title })),
    onChange: (id) => {
      speed = SPEEDS.find((x) => x.id === id) ?? speed;
      save("speed", id);
    },
  });
  const toolSeg = segmented({ label: t("손"), value: tool, options: fam.tools(), onChange: (id) => setTool(id) });
  const status = h("p", { class: "status" });

  // ── 오른쪽: 규칙 ─────────────────
  const restoreBtn = h("button", { class: "text-btn", type: "button", hidden: true, onclick: () => restore() }, t("원래대로"));
  const say = h("p", { class: "say" });
  const editor = fam.editor({ get: () => rule, set: (r) => setRule(r), locked: (why) => (say.textContent = why) });
  const notation = makeNotationField({ onCommit: (text) => setCode(text), bad: fam.codeBad });

  // ── 오른쪽: 기록 ─────────────────
  const genNum = h("b", { class: "num" }, "0");
  const popNum = h("b", { class: "num" }, "0");
  const chgNum = h("b", { class: "num" }, "0");
  const countLabel = h("span", {}, words.count());
  const spark = makeSpark(words);
  const paintsBox = h("div", { class: "field", hidden: true });
  let paintsKey = "";

  // ── 오른쪽: 더 보기 ─────────────────
  const statesOut = h("output", {}, "2");
  const statesField = fam.states
    ? h(
        "div",
        { class: "stepper", role: "group", "aria-label": fam.states.label() },
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
      )
    : null;
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
      editor.el,
      paintsBox,
      say,
    ),
    h(
      "section",
      { class: "side-sec", "aria-label": t("기록") },
      h(
        "div",
        { class: "readouts" },
        h("div", { class: "readout" }, h("span", {}, words.step()), genNum),
        h("div", { class: "readout" }, countLabel, popNum),
        h("div", { class: "readout" }, h("span", {}, words.changed ? words.changed() : t("바뀐 칸")), chgNum),
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
        statesField ? field(fam.states.label(), statesField, h("span", { class: "field-label" }, fam.states.note())) : null,
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
  // 만들기는 계열부터 고른다. 고르면 그 계열의 만들기 화면으로 간다
  const famSeg =
    make && SCREEN_FAMILIES.length > 1
      ? segmented({
          label: t("계열"),
          cls: "seg fam-seg",
          value: fam.id,
          options: SCREEN_FAMILIES.map((id) => ({ id, name: FAMILY[id].label() })),
          onChange: (id) => {
            if (id !== fam.id) location.hash = `#/make?family=${id}`;
          },
        })
      : null;
  const head = h(
    "div",
    { class: "rule-head" },
    h(
      "div",
      {},
      h("h1", {}, make ? t("새 규칙") : preset.name),
      h("p", {}, make ? (MAKE_LEAD[fam.id] ?? MAKE_LEAD.life)() : tagOf(preset)),
      famSeg ? famSeg.el : null,
    ),
    notation.el,
  );

  const notes = make ? makeNotes() : presetNotes();

  function makeNotes() {
    const tips = MAKE_TIPS(fam.id);
    // 다른 규칙 써 보기: Life 는 모아 둔 규칙, 다른 계열은 그 계열 도감 글의 '볼 것' 가운데 규칙 바꾸기
    const more =
      fam.id === "life"
        ? MORE_RULES().map((x) => ({ kind: "rule", ...x }))
        : uniqueBy(
            (FAMILY_ENTRIES[fam.id] ?? [])
              .flatMap((id) => entryOf(id)?.watch() ?? [])
              .filter((x) => x.kind === "rule"),
            (x) => x.notation,
          );
    return [
      tips.length
        ? h(
            "section",
            { class: "notes" },
            h("h2", {}, t("요령")),
            h(
              "ul",
              { class: "tips" },
              tips.map((x) => h("li", {}, x)),
            ),
          )
        : null,
      more.length
        ? h(
            "section",
            { class: "notes" },
            h("h2", {}, t("다른 규칙 써 보기")),
            h(
              "ul",
              { class: "cards" },
              more.map((x) => card(x)),
            ),
          )
        : null,
    ];
  }

  function presetNotes() {
    return [
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
  }

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
  const loop = makeLoop({ step: (n) => tick(n), draw: (p) => render(p), rate: () => speed.n, batch: () => fam.batch });
  const paint = makePainter(() => render(loop.progress()));
  let sparkAt = 0;

  const lookAt = () => look || (tool === "look" ? hover : null);

  /**
   * 새 줄이 화면 아래 4분의 1 안으로 내려오면 그 자리(재생 막대 위)에 머물게 보는 곳을 내린다.
   * 비우기·처음으로처럼 새 줄이 화면 위로 올라가 버리면 위에서 15% 자리로 되돌린다
   */
  function keepHead() {
    if (!follow || world.head === null) return;
    const v = board.view();
    const s = board.span();
    const at = (world.head + 0.5 - (v.cy - s.h / 2)) / s.h;
    if (at > 0.75) board.setView({ cx: v.cx, cy: world.head + 0.5 - 0.25 * s.h, z: v.z });
    else if (at < 0.05) board.setView({ cx: v.cx, cy: world.head + 0.5 + 0.35 * s.h, z: v.z });
  }

  function render(p = 1) {
    keepHead();
    const lc = lookAt();
    const ex = lc ? world.explain(lc[0], lc[1]) : null;
    board.draw(world, { t: p, hover: tool !== "look" ? hover : null, look: lc ? { x: lc[0], y: lc[1], neighbors: fam.lookCells(ex, lc) } : null });
    genNum.textContent = statGen.textContent = num(world.gen);
    popNum.textContent = statPop.textContent = num(world.count);
    chgNum.textContent = num(fam.changed ? fam.changed(world) : world.lastChanged);
    const now = performance.now();
    if (!loop.running || now - sparkAt > 250) {
      sparkAt = now;
      spark.update(world.alive, world.marks);
    }
    const why = fam.hint(world, tool);
    hint.hidden = !why;
    if (why) hint.textContent = why;
    showPeek(lc, ex);
  }

  function showPeek(lc, ex) {
    if (!lc) {
      peek.hidden = true;
      editor.mark(null);
      return;
    }
    const [x, y] = lc;
    peek.replaceChildren(...fam.peek(ex, rule).filter(Boolean));
    peek.hidden = false;
    editor.mark(ex);
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
      const z = canvas.clientWidth < 560 ? 8 : fam.zoom;
      board.setView({ cx: 0, cy: 0, z });
      // 1차원: 0세대 줄이 화면 위에서 15% 쯤에 오게
      if (fam.top) board.setView({ cx: 0, cy: board.span().h * 0.35, z });
      world.reseed(world.seed, viewRegion(0.7));
    }
    zoom.update(board.canZoom());
    render(loop.progress());
  }

  function tick(n = 1) {
    if (world.step(n)) return;
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
      follow = !!fam.follow;
      status.textContent = fam.tip[tool]();
      paint();
    }
  }

  function setTool(id) {
    tool = id;
    if (id !== "look") look = null;
    toolSeg.set(id);
    stage.dataset.tool = id;
    status.textContent = fam.tip[id]();
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
    else board.setView({ cx: 0, cy: 0, z: fam.zoom });
    follow = !!fam.follow;
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
      const note = tool === "ant" ? fam.placeAgent(world, x, y) : fam.tap(world, x, y, paintState);
      if (note) flash.show(note, 2400);
      world.touched();
      paint();
    },
    onStroke([x, y]) {
      const v = fam.strokeValue(world.get(x, y), paintState);
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
      follow = false; // 손으로 옮기면 새 줄 따라가기를 멈춘다(처음으로·비우기·흩뿌리기·모두 보이게로 다시)
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
      follow = !!fam.follow;
    }
    recolor();
    syncRule();
  }

  function recolor() {
    board.setColors(boardColors(rule.states, rule.family));
    paint();
  }

  function syncRule() {
    const code = formatCode(rule);
    const edited = !make && !sameRule(base, rule);
    editor.update(rule);
    notation.update(code, { edited });
    say.textContent = fam.describe(rule);
    restoreBtn.hidden = !edited;
    statesOut.textContent = String(rule.states.length);
    countLabel.textContent = statCount.textContent = words.count();
    syncPaints();
    if (make) setTitle(code ? t("{code} 만들기", { code }) : t("새 규칙"));
    syncUrl(code);
  }

  /** 칠할 상태 고르기: 상태가 셋 이상일 때만. 상태가 바뀌면 다시 만든다 */
  function syncPaints() {
    const n = rule.states.length;
    if (paintState >= n) paintState = n - 1;
    const show = n >= 3;
    paintsBox.hidden = !show;
    if (!show) {
      paintState = 1;
      paintsKey = "";
      paintsBox.replaceChildren();
      return;
    }
    const key = JSON.stringify(rule.states);
    if (key === paintsKey) return;
    paintsKey = key;
    const look = boardColors(rule.states, rule.family);
    const label = words.paint ? words.paint() : t("칠할 상태");
    const seg = segmented({
      label,
      cls: "paints",
      item: "paint",
      value: paintState,
      options: rule.states.map((st, i) => ({ id: i, name: st.name, icon: stateSwatch(look, i, rule.states) })),
      onChange: (id) => (paintState = id),
    });
    paintsBox.replaceChildren(h("span", { class: "field-label" }, label), seg.el);
  }

  /** 고친 규칙을 주소에 남긴다(그대로 나눌 수 있게). hashchange 는 일으키지 않는다 */
  function syncUrl(code) {
    const q = new URLSearchParams();
    if (code && (make || code !== formatCode(base))) q.set("rule", code);
    else if (make && fam.id !== "life") q.set("family", fam.id);
    const path = make ? "#/make" : `#/r/${preset.id}`;
    const want = q.toString() ? `${path}?${q}` : path;
    if (location.hash !== want) history.replaceState(null, "", want);
  }

  /** 표기를 적용한다. 틀리면 거짓, 쓸 수 없는 표기면 그 까닭 글 */
  function setCode(text) {
    const p = parseCode(text);
    if (!p) return false;
    if (p.family !== fam.id) {
      // 만들기에서는 다른 계열 표기를 치면 그 계열로 간다
      if (make && FAMILY[p.family]) {
        location.hash = `#/make?rule=${encodeURIComponent(formatCode(p) ?? text)}`;
        return true;
      }
      return fam.codeOther();
    }
    const why = lockOf(p);
    if (why) return (LOCK_TEXT[why] ?? LOCK_TEXT.birth0)();
    setRule(fam.withCode(copy(rule), p));
    return true;
  }

  function setStates(n) {
    if (!fam.states) return;
    n = Math.min(fam.states.max, Math.max(fam.states.min, n));
    if (n === rule.states.length) return;
    let r = copy(rule);
    if (fam.resize) r = fam.resize(r, n);
    else r.states = resizeStates(r.states, n, fam.id);
    const why = lockOf(r);
    if (why) {
      say.textContent = (LOCK_TEXT[why] ?? LOCK_TEXT.birth0)();
      return;
    }
    setRule(r);
  }

  function restore() {
    setRule(fam.restore(rule, base));
  }

  function scatter() {
    const s = rule.seed;
    world.scatter(s.type === "random" ? s.density : 0.3, randomSeed(), viewRegion(0.7));
    look = null;
    follow = !!fam.follow;
    flash.hide();
    status.textContent = fam.tip[tool]();
    paint();
  }

  /** 비우고 멈춘다: 이제 칸을 눌러 고른 뒤 재생하면 된다 */
  function clearAll() {
    setRunning(false);
    world.clear();
    look = null;
    follow = !!fam.follow;
    flash.hide();
    status.textContent = fam.tip[tool]();
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
    // 이 화면의 계열만 받는다(다른 계열은 만들기에서 계열을 고른 뒤)
    const res = checkRuleFile(obj, { families: [fam.id] });
    if (res.errors) {
      if (obj && obj.family !== fam.id && FAMILY[obj.family]) return [t("이 화면에서는 {name} 규칙 파일만 불러와요. 만들기에서 계열을 고른 뒤 불러오세요.", { name: fam.label() })];
      return res.errors;
    }
    const why = lockOf(res.rule);
    if (why) return [(LOCK_TEXT[why] ?? LOCK_TEXT.birth0)()];
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
      // 여러 상태 무늬(조건표)는 판과 같은 점 크기로
      art = patternArt(parseRLE(x.rle).rows, rule.family === "life" ? {} : { look: boardColors(rule.states, rule.family) });
      label = t("놓아 보기");
    } else if (x.kind === "rule") {
      const p = parseCode(x.notation);
      const r = p && p.family === fam.id ? fam.withCode(copy(base), p) : copy(base);
      const th = makeThumb(r, { w: 32, h: 24, gens: fam.id === "life" ? 30 : undefined, key: x.notation });
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
      setCode(x.notation);
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
    editor.update(rule);
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

/** 계열마다 만들기 화면의 '다른 규칙 써 보기'를 가져올 도감 규칙 */
const FAMILY_ENTRIES = { ant: ["langtons-ant", "ant-llrr", "ant-lrrrrrllr"], elementary: ["rule-30", "rule-90", "rule-110"], table: ["wireworld"] };

function uniqueBy(list, key) {
  const seen = new Set();
  return list.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)));
}
