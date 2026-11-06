// 첫 화면: 살아 있는 격자와 규칙 점 단추, 한 세대가 지나는 세 단계, 그리고 도감.

import { h, clear, icon, ICON, reducedMotion, setTitle } from "../ui/dom.js";
import { t, num } from "../i18n.js";
import { formatNotation, neighborCells, liveNeighbors, makeTable, stepLife, explain } from "../core/life.js";
import { lifeRule } from "../core/rules.js";
import { randomSeed } from "../core/rng.js";
import { makeWorld } from "../ui/world.js";
import { makeBoard } from "../ui/board.js";
import { makeLoop, makePainter } from "../ui/loop.js";
import { attachPen } from "../ui/pen.js";
import { boardColors } from "../ui/theme.js";
import { makeRulePad, describeRule } from "../ui/rulepad.js";
import { segmented } from "../ui/widgets.js";
import { newRuleArt } from "../ui/art.js";
import { makeThumb, hoverPlay } from "../ui/thumb.js";
import { shortName, creditOf, tagOf, SOON } from "../data/catalog.js";

const copy = (o) => structuredClone(o);
// 도감 그림은 늘 같은 씨앗에서 이만큼 넘긴 모습으로 서 있다
const THUMB_GENS = { "conway-life": 40, highlife: 40, seeds: 11, "day-and-night": 60, maze: 34, "brians-brain": 14, "star-wars": 22 };

export function homeView(main, { presets }) {
  setTitle(null);
  const hero = makeHero(presets);
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

// ── 살아 있는 격자 ─────────────────

function makeHero(presets) {
  let pick = presets[0]; // 고른 도감 규칙(점 단추로 고치면 null)
  let rule = copy(pick);
  const world = makeWorld(rule, { w: 100, h: 42 });
  let fitted = false;
  let hover = null;

  const canvas = h("canvas", { role: "img", "aria-label": t("살아 있는 격자. 칸을 누르거나 끌면 그려져요") });
  const board = makeBoard(canvas, { onResize: () => fit() });
  const playBtn = h("button", { class: "play", type: "button", onclick: () => setPlaying(!wantPlay) });
  const againBtn = h(
    "button",
    { class: "icon-btn", type: "button", title: t("다시 뿌리기"), "aria-label": t("다시 뿌리기"), onclick: () => (world.reseed(randomSeed()), paint()) },
    icon(ICON.shuffle),
  );
  const chips = segmented({
    label: t("이름난 규칙"),
    cls: "chips",
    item: "chip",
    value: pick.id,
    options: presets.map((p) => ({ id: p.id, name: shortName(p), title: formatNotation(lifeRule(p)) })),
    onChange: (id) => choose(id),
  });
  const stage = h("div", { class: "stage" }, canvas);
  const capsule = h("div", { class: "capsule" }, playBtn, againBtn, chips.el);
  const genNum = h("b", { class: "num" }, "0");
  const popNum = h("b", { class: "num" }, "0");
  const pad = makeRulePad({ onToggle: toggle });
  const say = h("p", { class: "say", "aria-live": "polite" });
  const note = h("p", { class: "console-note" });

  let wantPlay = !reducedMotion();
  let visible = true;
  const loop = makeLoop({ step: tick, draw: (p) => render(p), rate: () => 10 });
  const paint = makePainter(() => render(loop.progress()));

  function render(p = 1) {
    board.draw(world.cells, world.prev, { t: p, hover });
    genNum.textContent = num(world.gen);
    popNum.textContent = num(world.count);
  }

  /** 무대 크기에 맞춰 칸 수를 정한다(칸 한 변이 넓은 화면 11px, 좁은 화면 8.5px 쯤) */
  function fit() {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const cell = r.width < 560 ? 8.5 : 11;
    const nw = Math.max(16, Math.round(r.width / cell));
    const nh = Math.max(16, Math.round(r.height / cell));
    if (nw !== world.grid.w || nh !== world.grid.h) world.resize(nw, nh);
    board.setGrid(nw, nh);
    if (!fitted) {
      fitted = true;
      world.reseed();
      for (let i = 0; i < 2; i++) world.step(); // 첫 모습부터 무늬가 보이게
    }
    render(1);
  }

  function recolor() {
    board.setColors(boardColors(rule.states), rule.states.length);
    paint();
  }

  // 도감 규칙이 잠잠해지면(산 칸 수가 한동안 거의 그대로이거나 모두 죽으면) 새로 뿌린다
  function tick() {
    world.step();
    if (!pick) return;
    const a = world.alive;
    if (world.count === 0 && world.gen > 20) return void world.reseed(randomSeed());
    if (world.gen < 300 || a.length < 150) return;
    let lo = Infinity;
    let hi = 0;
    for (let i = a.length - 150; i < a.length; i++) {
      if (a[i] < lo) lo = a[i];
      if (a[i] > hi) hi = a[i];
    }
    if (hi - lo <= Math.max(3, hi * 0.03)) world.reseed(randomSeed());
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
    world.setRule(rule);
    world.reseed(randomSeed());
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
    clear(playBtn).append(icon(wantPlay ? ICON.pause : ICON.play));
    playBtn.setAttribute("aria-label", wantPlay ? t("멈추기") : t("움직이기"));
    playBtn.title = wantPlay ? t("멈추기") : t("움직이기");
  }

  attachPen(canvas, {
    cellAt: (x, y) => board.cellAt(x, y),
    tapOnTouch: true,
    begin([x, y]) {
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

  // 화면 밖에 있으면 돌리지 않는다
  const io =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((list) => {
          visible = list[list.length - 1].isIntersecting;
          update();
        })
      : null;
  io?.observe(stage);

  const el = h(
    "section",
    { class: "hero", "aria-labelledby": "hero-t" },
    h("h1", { id: "hero-t" }, t("숫자 두 줄이 만드는"), h("br"), h("span", { class: "soft" }, t("살아 있는 세계"))),
    h(
      "p",
      { class: "lead" },
      t("칸마다 이웃 여덟 칸만 보고 다음 세대에 살지 죽을지 정해요. 이런 세계를 세포 자동자라고 해요. 아래 숫자를 누르면 격자가 바로 새 규칙을 따라요."),
    ),
    h("div", { class: "hero-board" }, stage, capsule),
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
      if (e.key !== " " || e.target.closest?.("button, a, summary")) return false;
      setPlaying(!wantPlay);
      return true;
    },
    destroy() {
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

function makeShelf(presets) {
  const thumbs = [];
  const items = presets.map((p) => {
    const th = makeThumb(p, { gens: THUMB_GENS[p.id] ?? 30 });
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
            h("span", { class: "spec-code code" }, formatNotation(lifeRule(p))),
            h("span", { class: "spec-meta" }, credit || t("만든 사람은 알려지지 않았어요")),
          ),
        ),
        th,
      ),
    );
  });
  items.push(
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
  );
  const el = h(
    "section",
    { class: "section", id: "rules", "aria-labelledby": "shelf-t" },
    h(
      "div",
      { class: "section-head" },
      h("h2", { id: "shelf-t" }, t("도감")),
      h("p", {}, t("이름난 규칙 {n}가지를 모았어요. 그림에 커서를 올리면 움직이고, 누르면 크게 돌려 볼 수 있어요.", { n: presets.length })),
    ),
    h("ul", { class: "specimens" }, items),
    h("p", { class: "soon" }, t("다음에 들어올 규칙: {list}", { list: SOON().join(", ") })),
  );
  return {
    el,
    recolor: () => thumbs.forEach((x) => x.recolor()),
    destroy: () => thumbs.forEach((x) => x.destroy()),
  };
}
