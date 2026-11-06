// 화면 이동(주소의 # 뒤를 본다)과 밝기 설정.
//   #/            첫 화면과 도감
//   #/r/<id>      도감 규칙 하나 (?rule=B36/S23&edges=wall 로 고친 규칙)
//   #/make        새 규칙 만들기 (?rule=…)
//   #/about       소개

import { clear, h, icon } from "./ui/dom.js";
import { t } from "./i18n.js";
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

function route() {
  if (current && current.destroy) {
    try {
      current.destroy();
    } catch (e) {
      console.error(e);
    }
  }
  current = null;
  clear(main);
  const { path, params } = parse();
  let nav = "home";
  try {
    if (path === "/" || path === "") current = homeView(main, { presets });
    else if (path === "/make") {
      nav = "make";
      current = ruleView(main, { params });
    } else if (path === "/about") {
      nav = "about";
      current = aboutView(main, { presets });
    } else if (path.startsWith("/r/")) {
      const id = decodeURIComponent(path.slice(3));
      const preset = presets.find((p) => p.id === id);
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
  if (!first) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
  first = false;
}

window.addEventListener("hashchange", route);

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

// 내려가면 머리 아래에 선을 긋는다
const top = document.getElementById("top");
const onScroll = () => top.classList.toggle("scrolled", window.scrollY > 4);
window.addEventListener("scroll", onScroll, { passive: true });

async function boot() {
  onScroll();
  applyScheme();
  themeButton();
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
