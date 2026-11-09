// 첫 화면: 끝없는 격자와 규칙 점 단추, 한 세대가 지나는 세 단계, 그리고 도감.

import { h, clear, reducedMotion, setTitle } from "../ui/dom.js";
import { t, num } from "../i18n.js";
import { formatNotation, neighborCells, liveNeighbors, makeTable, stepLife, explain } from "../core/life.js";
import { lifeRule, formatCode } from "../core/rules.js";
import { randomSeed } from "../core/rng.js";
import { makeWorld, regionAt } from "../ui/world.js";
import { makeBoard } from "../ui/board.js";
import { makeLoop, makePainter } from "../ui/loop.js";
import { attachNav } from "../ui/nav.js";
import { boardColors } from "../ui/theme.js";
import { makeRulePad, describeRule } from "../ui/rulepad.js";
import { segmented, zoomControls, flashLine, modKey, makeCapsule, makeFullscreen } from "../ui/widgets.js";
import { newRuleArt } from "../ui/art.js";
import { makeThumb, hoverPlay } from "../ui/thumb.js";
import { shortName, creditOf, tagOf, SOON } from "../data/catalog.js";

const copy = (o) => structuredClone(o);
// 도감 그림은 늘 같은 씨앗에서 이만큼 넘긴 모습으로 서 있다(개미는 걸음 수. 없으면 계열마다 정한 만큼)
const THUMB_GENS = {
  "conway-life": 40,
  highlife: 40,
  seeds: 11,
  "day-and-night": 60,
  maze: 34,
  "brians-brain": 14,
  "star-wars": 22,
  "langtons-ant": 11500,
  "ant-llrr": 8000,
  "ant-lrrrrrllr": 16000,
  "fibonacci-turmite": 3000,
  "rule-30": 40,
  "rule-90": 63,
  "rule-110": 56,
  wireworld: 20,
};

export function homeView(main, { presets }) {
  setTitle(null);
  // 첫 화면 위쪽(칩·숫자 점)은 Life 계열만. 다른 계열은 도감에서 만난다
  const hero = makeHero(presets.filter((p) => p.family === "life"));
  const lesson = makeLesson();
  const shelf = makeShelf(presets);
  main.append(h("div", { class: "wrap" }, hero.el, lesson.el, shelf.el));
  const onScheme = () => {
    hero.recolor();
    shelf.recolor();
  };
  window.addEventListener("schemechange", onScheme);
  return {
    onKey: (e) => hero.onKey(e),
    destroy() {
      hero.destroy();
      shelf.destroy();
      window.removeEventListener("schemechange", onScheme);
    },
  };
}

// ── 끝없는 격자 ─────────────────

function makeHero(presets) {
  let pick = presets[0]; // 고른 도감 규칙(점 단추로 고치면 null)
  let rule = copy(pick);
  const world = makeWorld(rule);
  let seeded = false;
  let auto = true; // 도감 규칙을 보여 주는 중: 잠잠해지거나 너무 퍼지면 새로 뿌린다. 칸을 손으로 바꾸면 끈다
  let hover = null;
  let wantPlay = !reducedMotion();
  let visible = true;

  const canvas = h("canvas", { role: "img", "aria-label": t("끝없는 격자. 끌면 둘러보고, 칸을 누르면 살리거나 비워요") });
  const board = makeBoard(canvas, { onResize: () => ready() });
  const hint = h("p", { class: "stage-hint", hidden: true }, t("칸을 눌러 살릴 칸을 고른 다음, 재생을 눌러 보세요."));
  const flash = flashLine();
  const zoom = zoomControls({ onIn: () => zoomBy(1.25), onOut: () => zoomBy(0.8), onFit: () => fitView(), onFull: () => fs.toggle() });
  // 전체 화면에서만 보이는 세대·산 칸
  const statGen = h("b", {}, "0");
  const statPop = h("b", {}, "0");
  const stats = h("p", { class: "stage-stats" }, h("span", {}, t("세대")), statGen, h("span", {}, t("산 칸")), statPop);
  const stage = h("div", { class: "stage" }, canvas, hint, stats, flash.el, zoom.el);

  const capsule = makeCapsule({
    onPlay: () => setPlaying(!wantPlay),
    onStep: () => stepOne(),
    onBack: () => goBack(),
    onScatter: () => scatter(),
    onClear: () => clearAll(),
  });
  const chips = segmented({
    label: t("이름난 규칙"),
    cls: "chips",
    item: "chip",
    value: pick.id,
    options: presets.map((p) => ({ id: p.id, name: shortName(p), title: formatNotation(lifeRule(p)) })),
    onChange: (id) => choose(id),
  });
  const genNum = h("b", { class: "num" }, "0");
  const popNum = h("b", { class: "num" }, "0");
  const pad = makeRulePad({ onToggle: toggle, onLocked: (why) => (say.textContent = why) });
  const say = h("p", { class: "say", "aria-live": "polite" });
  const note = h("p", { class: "console-note" });

  const loop = makeLoop({ step: tick, draw: (p) => render(p), rate: () => 10 });
  const paint = makePainter(() => render(loop.progress()));

  function render(p = 1) {
    board.draw(world, { t: p, hover });
    genNum.textContent = statGen.textContent = num(world.gen);
    popNum.textContent = statPop.textContent = num(world.count);
    hint.hidden = world.count > 0;
  }

  /** 보이는 넓이(칸 수) */
  const viewRegion = (k = 1) => {
    const v = board.view();
    const s = board.span();
    return regionAt(v.cx, v.cy, s.w * k, s.h * k);
  };

  // 화면 크기를 처음 잰 뒤에 보이는 만큼 뿌린다(칸 한 변이 넓은 화면 11px, 좁은 화면 8.5px 쯤)
  function ready() {
    if (!seeded && board.ready) {
      seeded = true;
      board.setView({ cx: 0, cy: 0, z: canvas.clientWidth < 560 ? 8.5 : 11 });
      world.reseed(world.seed, viewRegion());
      for (let i = 0; i < 2; i++) world.step(); // 첫 모습부터 무늬가 보이게
    }
    zoom.update(board.canZoom());
    render(1);
  }

  function recolor() {
    board.setColors(boardColors(rule.states, rule.family));
    paint();
  }

  function tick() {
    if (!world.step()) {
      // 너무 넓게 퍼졌다: 보여 주는 중이면 새로 뿌리고, 손으로 만든 것이면 멈춘다
      if (auto && pick) return void world.reseed(randomSeed(), viewRegion());
      setPlaying(false);
      flash.show(t("너무 넓게 퍼져서 멈췄어요. 흩뿌리기나 비우기로 다시 시작해 보세요."), 4000);
      return;
    }
    if (!auto || !pick) return;
    const a = world.alive;
    // 보여 주는 중에는 화면 네 배쯤 넘게 퍼지면 새로 뿌린다(첫 화면이 무거워지지 않게)
    const s = board.span();
    if (world.size > Math.max(160, ((s.w / 32 + 2) * (s.h / 32 + 2)) * 4)) return void world.reseed(randomSeed(), viewRegion());
    if (world.count === 0 && world.gen > 20) return void world.reseed(randomSeed(), viewRegion());
    if (world.gen < 300 || a.length < 150) return;
    let lo = Infinity;
    let hi = 0;
    for (let i = a.length - 150; i < a.length; i++) {
      if (a[i] < lo) lo = a[i];
      if (a[i] > hi) hi = a[i];
    }
    if (hi - lo <= Math.max(3, hi * 0.03)) world.reseed(randomSeed(), viewRegion());
  }

  function toggle(kind, n) {
    const r = copy(rule);
    const set = new Set(r[kind]);
    if (set.has(n)) set.delete(n);
    else set.add(n);
    r[kind] = [...set].sort((a, b) => a - b);
    pick = null;
    rule = r;
    world.setRule(r);
    recolor();
    sync();
  }

  function choose(id) {
    pick = presets.find((p) => p.id === id) ?? presets[0];
    rule = copy(pick);
    auto = true;
    world.setRule(rule);
    // 다른 규칙을 고르면 처음 보던 크기로 돌아가 보이는 만큼 뿌린다
    board.setView({ cx: 0, cy: 0, z: canvas.clientWidth < 560 ? 8.5 : 11 });
    zoom.update(board.canZoom());
    world.reseed(randomSeed(), viewRegion());
    recolor();
    sync();
  }

  function sync() {
    pad.update(rule);
    chips.set(pick ? pick.id : null);
    say.textContent = describeRule(rule);
    const code = formatNotation(lifeRule(rule));
    clear(note);
    if (pick) note.append(tagOf(pick), " ", h("a", { href: `#/r/${pick.id}` }, t("{name} 자세히 보기", { name: shortName(pick) })));
    else note.append(t("직접 고친 규칙이에요."), " ", h("a", { href: `#/make?rule=${encodeURIComponent(code)}` }, t("{code} 이어서 고치기", { code })));
  }

  function setPlaying(on) {
    wantPlay = on;
    update();
  }

  function update() {
    if (wantPlay && visible) loop.start();
    else loop.stop();
    capsule.setPlaying(wantPlay);
  }

  function stepOne() {
    setPlaying(false);
    if (world.step()) loop.pulse();
    else paint();
  }

  function goBack() {
    if (world.back()) paint();
  }

  function scatter() {
    auto = true;
    world.reseed(randomSeed(), viewRegion());
    flash.hide();
    paint();
  }

  /** 비우고 멈춘다: 이제 칸을 눌러 고른 뒤 재생하면 된다 */
  function clearAll() {
    auto = false;
    world.clear();
    setPlaying(false);
    flash.hide();
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
    else board.setView({ cx: 0, cy: 0, z: 11 });
    zoom.update(board.canZoom());
    paint();
  }

  // 쪽 안에서는 휠·손가락이 쪽을 내려야 하니 Ctrl+휠과 톡 누르기만 받고, 전체 화면에서는 바로 확대하고 한 손가락으로 끈다
  attachNav(canvas, board, {
    tool: () => "pan",
    wheel: () => (fs.on ? "zoom" : "ctrl"),
    touch: () => (fs.on ? "full" : "tap"),
    onTap([x, y]) {
      auto = false;
      world.set(x, y, world.get(x, y) === 1 ? 0 : 1);
      world.touched();
      paint();
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
    // 쪽 안에서 격자를 다루는 법: PC 는 Ctrl+휠, 폰은 두 손가락(전체 화면에서는 한 손가락으로도 끈다)
    onHint: (kind) =>
      kind === "touch"
        ? flash.show(t("두 손가락으로 끌거나 전체 화면에서 둘러보세요"), 2400)
        : flash.show(t("{key}을 누른 채 휠을 굴리면 확대·축소돼요", { key: modKey() }), 1600),
  });

  // 화면 밖에 있으면 돌리지 않는다
  const io =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((list) => {
          visible = list[list.length - 1].isIntersecting;
          update();
        })
      : null;
  io?.observe(stage);

  // 전체 화면: 격자가 화면을 채우고 재생 막대는 아래 띠가 된다
  const heroBoard = h("div", { class: "hero-board" }, stage, capsule.el);
  const fs = makeFullscreen(heroBoard, {
    onChange(on) {
      zoom.setFull(on);
      flash.hide();
      if (on) visible = true;
      update();
      paint();
      // 들어가면 재생 단추로 옮겨 스페이스가 재생·일시정지가 되게(전체 화면 단추가 다시 눌리지 않게)
      if (on) capsule.playBtn.focus({ preventScroll: true });
    },
  });

  const el = h(
    "section",
    { class: "hero", "aria-labelledby": "hero-t" },
    h("h1", { id: "hero-t" }, t("숫자 두 줄이 만드는"), h("br"), h("span", { class: "soft" }, t("살아 있는 세계"))),
    h(
      "p",
      { class: "lead" },
      t("칸마다 이웃 여덟 칸만 보고 다음 세대에 살지 죽을지 정해요. 이런 세계를 세포 자동자라고 해요. 격자는 끝없이 이어져서, 끌면 어디로든 둘러볼 수 있어요."),
    ),
    h("div", { class: "hero-rules" }, chips.el),
    heroBoard,
    h(
      "div",
      { class: "console" },
      h(
        "div",
        { class: "readouts" },
        h("div", { class: "readout" }, h("span", {}, t("세대")), genNum),
        h("div", { class: "readout" }, h("span", {}, t("산 칸")), popNum),
      ),
      h("div", { class: "pad-wrap" }, pad.el, h("div", { style: "margin-top:14px" }, say, note)),
    ),
  );

  recolor();
  sync();
  update();

  return {
    el,
    recolor,
    onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return false;
      const k = e.key;
      if (k === " ") {
        if (e.target.closest?.("button, a, summary")) return false; // 단추는 스스로 눌린다
        setPlaying(!wantPlay);
        return true;
      }
      if (k === "ArrowRight" && !e.shiftKey) return stepOne(), true;
      if (k === "r" || k === "R") return goBack(), true;
      if (k === "+" || k === "=") return zoomBy(1.25), true;
      if (k === "-" || k === "_") return zoomBy(0.8), true;
      if (k === "0") return fitView(), true;
      if (k === "f" || k === "F") return fs.toggle(), true;
      if (k === "Escape" && fs.on) return fs.exit(), true;
      return false;
    },
    destroy() {
      fs.destroy();
      loop.cancel();
      paint.cancel();
      io?.disconnect();
      board.disconnect();
    },
  };
}

// ── 한 세대는 세 단계로: 칸 → 이웃 세기 → 다음 세대 ─────────────────

function makeLesson() {
  const N = 7;
  const LIFE = { birth: [3], survive: [2, 3], states: 2 };
  const table = makeTable(LIFE);
  let cells = new Uint8Array(N * N);
  for (const x of [2, 3, 4]) cells[3 * N + x] = 1;
  let pick = [3, 2];
  let stage = 1;

  const board = h("div", { class: "mini", role: "group", "aria-label": t("작은 격자. 칸을 눌러 고를 수 있어요") });
  const bubbleLabel = h("span");
  const bubbleNum = h("b", { class: "num" });
  const bubble = h("div", { class: "bubble", "aria-live": "polite" }, bubbleLabel, bubbleNum);
  const figure = h("div", { class: "figure" }, board, bubble);
  const next = () => {
    const out = new Uint8Array(N * N);
    stepLife(cells, out, N, N, table, false);
    return out;
  };

  const buttons = Array.from({ length: N * N }, (_, i) =>
    h("button", {
      type: "button",
      onclick: () => {
        pick = [i % N, (i / N) | 0];
        if (stage === 1) stage = 2;
        render();
      },
    }),
  );
  board.append(...buttons);

  const STEPS = [
    { t: t("칸"), d: t("세계는 바둑판처럼 칸으로 나뉘어요. 칸마다 상태가 하나 있어요. 생명 게임에서는 살았거나 비었거나 둘 중 하나예요.") },
    { t: t("이웃 세기"), d: t("칸마다 둘레 여덟 칸을 이웃으로 보고, 그 가운데 산 칸을 세요. 그림의 칸을 눌러 다른 칸도 세어 보세요.") },
    { t: t("다음 세대"), d: t("센 수와 규칙으로 다음 상태를 정해요. 모든 칸이 한꺼번에 바뀌면 한 세대가 지나요. 색이 다른 점은 방금 태어난 칸이에요.") },
  ];
  const stepBtns = STEPS.map((s, i) =>
    h(
      "button",
      {
        type: "button",
        "aria-pressed": "false",
        onclick: () => {
          stage = i + 1;
          render();
        },
      },
      h("span", { class: "n" }, String(i + 1)),
      h("span", { class: "t" }, s.t),
      h("span", { class: "d" }, s.d),
    ),
  );
  const moreBtn = h(
    "button",
    {
      class: "btn small",
      type: "button",
      onclick: () => {
        cells = next();
        stage = 3;
        render();
      },
    },
    t("한 세대 더"),
  );

  function render() {
    const [px, py] = pick;
    const k = py * N + px;
    const nbs = new Set(neighborCells(N, N, px, py, false).map(([x, y]) => y * N + x));
    const n = liveNeighbors(cells, N, N, px, py, false);
    const shown = stage === 3 ? next() : cells;
    buttons.forEach((b, i) => {
      b.className = [
        shown[i] ? "on" : "",
        stage === 3 && shown[i] && !cells[i] ? "born" : "",
        stage === 2 && nbs.has(i) ? "nb" : "",
        stage > 1 && i === k ? "pick" : "",
      ]
        .filter(Boolean)
        .join(" ");
      b.setAttribute("aria-label", t("{r}째 줄 {c}째 칸, {s}", { r: ((i / N) | 0) + 1, c: (i % N) + 1, s: shown[i] ? t("산 칸") : t("빈칸") }));
      b.setAttribute("aria-pressed", String(i === k));
    });
    stepBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(stage === i + 1)));
    bubble.hidden = stage === 1;
    if (stage === 2) {
      bubbleLabel.textContent = t("고른 칸의 산 이웃");
      bubbleNum.textContent = String(n);
    } else if (stage === 3) {
      const why = explain(LIFE, cells[k], n).why;
      bubbleLabel.textContent = t("산 이웃 {n}개라서", { n });
      bubbleNum.textContent = { born: t("태어나요"), stay: t("그대로"), survive: t("살아요"), die: t("죽어요") }[why];
    }
    bubbleNum.classList.toggle("num", stage === 2);
    bubbleNum.style.fontSize = stage === 3 ? "1.375rem" : "";
  }
  render();

  const el = h(
    "section",
    { class: "section", "aria-labelledby": "lesson-t" },
    h(
      "div",
      { class: "section-head" },
      h("h2", { id: "lesson-t" }, t("한 세대는 세 단계로 지나가요")),
      h("p", {}, t("세포 자동자는 칸으로 나뉜 세계예요. 모든 칸이 같은 규칙을 따라 한꺼번에 바뀌고, 그렇게 한 번 바뀌는 것을 한 세대라고 해요.")),
    ),
    h(
      "div",
      { class: "lesson" },
      figure,
      h(
        "div",
        {},
        h(
          "ol",
          { class: "steps" },
          stepBtns.map((b) => h("li", { class: "step" }, b)),
        ),
        h(
          "p",
          { class: "lesson-foot" },
          h("span", {}, t("이 규칙을 "), h("b", { class: "code" }, "B3/S23"), t(" 이라고 적어요. B는 태어남, S는 살아남음이에요.")),
          moreBtn,
        ),
      ),
    ),
  );
  return { el };
}

// ── 도감: 규칙마다 작은 격자 ─────────────────

/** 도감 묶음(사용자가 고른 시안 B): 계열마다 이름, 규칙 수, 한 줄 설명 */
const GROUPS = [
  { id: "life", name: () => t("생명 게임 계열"), note: () => t("이웃 수로 살고 죽어요") },
  { id: "ant", name: () => t("개미"), note: () => t("칸 위를 걷는 개미가 색을 바꿔요") },
  { id: "elementary", name: () => t("1차원"), note: () => t("한 줄이 세대마다 아래로 쌓여요") },
  { id: "table", name: () => t("조건표"), note: () => t("상태마다 바뀔 조건을 적어요") },
];

function makeShelf(presets) {
  const thumbs = [];
  const item = (p) => {
    const th = makeThumb(p, { gens: THUMB_GENS[p.id] });
    thumbs.push(th);
    const credit = creditOf(p.id);
    return h(
      "li",
      {},
      hoverPlay(
        h(
          "a",
          { class: "spec", href: `#/r/${p.id}` },
          h("span", { class: "spec-art" }, th.canvas),
          h(
            "span",
            { class: "spec-text" },
            h("span", { class: "spec-name" }, p.name),
            h("span", { class: "spec-code code" }, formatCode(p) ?? ""),
            h("span", { class: "spec-meta" }, credit || t("만든 사람은 알려지지 않았어요")),
          ),
        ),
        th,
      ),
    );
  };
  const group = (head, list) => h("div", { class: "shelf-group" }, head, h("ul", { class: "specimens" }, list));
  const known = new Set(GROUPS.map((g) => g.id));
  const groups = GROUPS.map((g) => [g, presets.filter((p) => p.family === g.id)])
    .filter(([, list]) => list.length)
    .map(([g, list]) =>
      group(
        h("div", { class: "shelf-head" }, h("h3", {}, g.name()), h("span", { class: "shelf-count", "aria-label": t("규칙 {n}가지", { n: list.length }) }, String(list.length)), h("p", {}, g.note())),
        list.map(item),
      ),
    );
  // 묶음을 아직 정하지 않은 계열은 머리 없이 뒤에
  const rest = presets.filter((p) => !known.has(p.family));
  if (rest.length) groups.push(group(null, rest.map(item)));
  // 새 규칙 만들기는 맨 끝에 머리 없는 묶음으로
  groups.push(
    group(null, [
      h(
        "li",
        {},
        h(
          "a",
          { class: "spec new", href: "#/make" },
          h("span", { class: "spec-art" }, newRuleArt()),
          h(
            "span",
            { class: "spec-text" },
            h("span", { class: "spec-name" }, t("새 규칙 만들기")),
            h("span", { class: "spec-meta" }, t("점을 눌러 숫자를 골라요")),
          ),
        ),
      ),
    ]),
  );
  const el = h(
    "section",
    { class: "section", id: "rules", "aria-labelledby": "shelf-t" },
    h(
      "div",
      { class: "section-head" },
      h("h2", { id: "shelf-t" }, t("도감")),
      h("p", {}, t("이름난 규칙 {n}가지를 모았어요. 그림을 누르면 크게 돌려 볼 수 있어요.", { n: presets.length })),
    ),
    groups,
    h("p", { class: "soon" }, t("다음에 들어올 규칙: {list}", { list: SOON().join(", ") })),
  );
  return {
    el,
    recolor: () => thumbs.forEach((x) => x.recolor()),
    destroy: () => thumbs.forEach((x) => x.destroy()),
  };
}
