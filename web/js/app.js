// 화면 이동(주소의 # 뒤를 본다)과 밝기·언어 설정.
//   #/            첫 화면과 도감
//   #/r/<id>      도감 규칙 하나 (?rule=B36/S23 로 고친 규칙)
//   #/make        새 규칙 만들기 (?rule=…)
//   #/about       소개
// 언어: 주소의 ?lang=en(# 앞)이나 머리 줄의 언어 단추. 고른 언어는 이 브라우저에 남긴다(store 'lang')

import { clear, h, icon, setTitle } from "./ui/dom.js";
import { t, lang, setLang } from "./i18n.js";
import { load, save } from "./ui/store.js";
import { applyScheme, cycleScheme, scheme } from "./ui/theme.js";
import { loadPresets } from "./data/presets.js";
import { homeView } from "./views/home.js";
import { ruleView } from "./views/rule.js";
import { aboutView } from "./views/about.js";
import { notFound } from "./views/common.js";

const main = document.getElementById("main");
let presets = [];
let current = null;
let first = true;

function parse() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  return { path, params: Object.fromEntries(new URLSearchParams(query)) };
}

/** 도감 규칙의 이름·설명·상태 이름을 지금 언어로(사전에 없으면 그대로) */
const localRule = (r) => ({
  ...r,
  name: t(r.name),
  description: r.description ? t(r.description) : r.description,
  states: r.states.map((s) => ({ ...s, name: t(s.name) })),
});

/** keep: 언어를 바꿔 다시 그릴 때처럼 쪽 위치와 포커스를 그대로 둔다 */
function route({ keep = false } = {}) {
  if (current && current.destroy) {
    try {
      current.destroy();
    } catch (e) {
      console.error(e);
    }
  }
  current = null;
  clear(main);
  setTitle(null); // 제목을 따로 정하지 않는 화면이 앞 화면 제목을 물려받지 않게
  const { path, params } = parse();
  let nav = "home";
  try {
    const local = presets.map(localRule);
    if (path === "/" || path === "") current = homeView(main, { presets: local });
    else if (path === "/make") {
      nav = "make";
      current = ruleView(main, { params });
    } else if (path === "/about") {
      nav = "about";
      current = aboutView(main, { presets: local });
    } else if (path.startsWith("/r/")) {
      const id = decodeURIComponent(path.slice(3));
      const preset = local.find((p) => p.id === id);
      current = preset ? ruleView(main, { preset, params }) : notFound(main);
    } else current = notFound(main);
  } catch (e) {
    console.error(e);
    clear(main);
    main.append(h("div", { class: "wrap prose" }, h("header", {}, h("h1", {}, t("화면을 그리지 못했어요")), h("p", {}, String(e && e.message)))));
  }
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === nav) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  if (!first && !keep) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
  first = false;
}

window.addEventListener("hashchange", () => route());

// 마우스·손가락으로 누른 단추는 포커스를 바로 놓는다(사파리와 같다). 그래야 스페이스·→ 가 방금 누른
// 단추를 다시 누르지 않고 격자로 간다. 키보드로 누른 단추(e.detail 이 0)는 포커스를 그대로 둔다
document.addEventListener("click", (e) => {
  if (!e.detail) return;
  // 눌린 단추가 그림을 바꿔 끼우면 e.target 이 떨어져 나가니 처음 길(composedPath)에서 찾는다
  const btn = e.composedPath().find((n) => n instanceof Element && n.matches("button, summary"));
  if (btn && btn === document.activeElement) btn.blur();
});

document.addEventListener("keydown", (e) => {
  if (!current || !current.onKey || e.defaultPrevented) return;
  const el = e.target;
  if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
  if (current.onKey(e)) e.preventDefault();
});

// 본문으로 건너뛰기: 주소의 # 를 바꾸지 않고 본문으로 포커스만 옮긴다
document.getElementById("skip").addEventListener("click", (e) => {
  e.preventDefault();
  main.focus();
});

// ── 밝기: 기기 설정 → 밝게 → 어둡게 ─────────────────
const SCHEME_NAME = { system: () => t("기기 설정"), light: () => t("밝게"), dark: () => t("어둡게") };
const SCHEME_ICON = {
  system: ["M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16z", "M12 4v16"],
  light: [
    "M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8z",
    "M12 2v2",
    "M12 20v2",
    "M2 12h2",
    "M20 12h2",
    "M4.9 4.9l1.4 1.4",
    "M17.7 17.7l1.4 1.4",
    "M4.9 19.1l1.4-1.4",
    "M17.7 6.3l1.4-1.4",
  ],
  dark: ["M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"],
};
const themeBtn = document.getElementById("theme-btn");
function themeButton() {
  const sc = scheme();
  clear(themeBtn).append(icon(SCHEME_ICON[sc]));
  themeBtn.setAttribute("aria-label", t("화면 밝기: {s}. 눌러서 바꾸기", { s: SCHEME_NAME[sc]() }));
  themeBtn.title = t("화면 밝기: {s}", { s: SCHEME_NAME[sc]() });
}
themeBtn.addEventListener("click", () => {
  cycleScheme();
  themeButton();
});

// ── 언어: 한국어 ↔ 영어 ─────────────────
// 단추(지금은 바닥 줄)에는 바꿀 언어의 이름을 그 언어로 적는다(English · 한국어)
const langBtn = document.getElementById("lang-btn");
function langButton() {
  const to = lang() === "ko" ? "en" : "ko";
  langBtn.textContent = to === "en" ? "English" : "한국어";
  langBtn.lang = to;
}
/** index.html 에 적힌 글(data-t, data-t-aria)을 지금 언어로 */
function translateStatic() {
  document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
  document.querySelectorAll("[data-t-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.tAria)));
}
function useLang(l) {
  setLang(l);
  translateStatic();
  langButton();
  themeButton();
}
/** 주소의 ?lang= 이 먼저, 없으면 남겨 둔 언어 */
function startLang() {
  const asked = new URLSearchParams(location.search).get("lang");
  if (asked === "ko" || asked === "en") save("lang", asked);
  const l = asked === "ko" || asked === "en" ? asked : load("lang", "ko");
  useLang(l === "en" ? "en" : "ko");
}
langBtn.addEventListener("click", () => {
  const y = window.scrollY;
  useLang(lang() === "ko" ? "en" : "ko");
  save("lang", lang());
  if (!presets.length) return;
  // 다시 그리는 동안 쪽 높이가 줄었다 늘어도 보던 자리로 돌아오게, 높이를 잠깐 붙잡아 둔다
  main.style.minHeight = `${main.offsetHeight}px`;
  route({ keep: true });
  window.scrollTo(0, y);
  requestAnimationFrame(() => {
    window.scrollTo(0, y);
    main.style.minHeight = "";
  });
});

// 내려가면 머리 아래에 선을 긋는다
const top = document.getElementById("top");
const onScroll = () => top.classList.toggle("scrolled", window.scrollY > 4);
window.addEventListener("scroll", onScroll, { passive: true });

async function boot() {
  onScroll();
  applyScheme();
  startLang();
  try {
    presets = await loadPresets();
  } catch (e) {
    console.error(e);
    clear(main).append(
      h(
        "div",
        { class: "wrap prose" },
        h("header", {}, h("h1", {}, t("규칙을 불러오지 못했어요")), h("p", {}, t("새로고침해 보세요. 파일을 바로 열었다면 작은 웹 서버로 열어야 해요."))),
      ),
    );
    return;
  }
  route();
}

boot();
