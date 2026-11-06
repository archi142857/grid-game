// 여러 화면이 같이 쓰는 조각: 고르기 묶음, 줄글, 격자 위의 확대·축소 단추와 알림.

import { h, icon, ICON, clear } from "./dom.js";
import { t } from "../i18n.js";

/**
 * 격자 아래에 떠 있는 막대: 재생·한 세대·처음으로 | 흩뿌리기·비우기.
 * 격자가 화면에 걸쳐 있으면 화면 아래에 붙어 따라온다(CSS sticky).
 */
export function makeCapsule({ onPlay, onStep, onBack, onScatter, onClear }) {
  const playBtn = h("button", { class: "play", type: "button", "aria-keyshortcuts": "Space", onclick: onPlay });
  const small = (ic, label, key, fn) =>
    h("button", { class: "cap-btn", type: "button", title: `${label} (${key})`, "aria-label": label, "aria-keyshortcuts": key, onclick: fn }, icon(ic));
  const wide = (ic, label, fn) => h("button", { class: "cap-btn wide", type: "button", onclick: fn }, icon(ic), h("span", { class: "label" }, label));
  const el = h(
    "div",
    { class: "capsule", role: "group", "aria-label": t("격자 다루기") },
    playBtn,
    small(ICON.step, t("한 세대"), "→", onStep),
    small(ICON.reset, t("처음으로"), "R", onBack),
    h("span", { class: "sep", "aria-hidden": "true" }),
    wide(ICON.scatter, t("흩뿌리기"), onScatter),
    wide(ICON.erase, t("비우기"), onClear),
  );
  return {
    el,
    playBtn,
    setPlaying(on) {
      const name = on ? t("일시정지") : t("재생");
      clear(playBtn).append(icon(on ? ICON.pause : ICON.play), h("span", { class: "label" }, name));
      playBtn.setAttribute("aria-label", name);
      playBtn.title = `${name} (Space)`;
    },
  };
}

/** 격자 오른쪽 위의 축소·확대·모두 보기 단추(와 onFull 이 있으면 전체 화면 단추) */
export function zoomControls({ onIn, onOut, onFit, onFull = null }) {
  const btn = (ic, label, key, fn) =>
    h("button", { type: "button", class: "zoom-btn", title: `${label} (${key})`, "aria-label": label, "aria-keyshortcuts": key, onclick: fn }, icon(ic));
  const out = btn(ICON.minus, t("축소"), "-", onOut);
  const inn = btn(ICON.plus, t("확대"), "+", onIn);
  const fit = btn(ICON.locate, t("산 칸이 모두 보이게"), "0", onFit);
  const full = onFull ? btn(ICON.full, t("전체 화면"), "F", onFull) : null;
  if (full) full.setAttribute("aria-pressed", "false");
  return {
    el: h("div", { class: "zoom", role: "group", "aria-label": t("보기") }, out, inn, fit, full),
    /** can: board.canZoom() */
    update(can) {
      inn.disabled = !can.in;
      out.disabled = !can.out;
    },
    /** 전체 화면 단추를 들어가기 ↔ 끝내기로 바꾼다 */
    setFull(on) {
      if (!full) return;
      const label = on ? t("전체 화면 끝내기") : t("전체 화면");
      clear(full).append(icon(on ? ICON.unfull : ICON.full));
      full.title = `${label} (F)`;
      full.setAttribute("aria-label", label);
      full.setAttribute("aria-pressed", String(on));
    },
  };
}

/**
 * 격자 묶음(target)이 화면을 가득 채우게 한다. 브라우저 전체 화면을 쓰고,
 * 그게 안 되는 곳(아이폰, 막힌 틀 안)에서는 쪽 위를 덮기만 한다. onChange(on) 은 Esc 로 나올 때도 부른다.
 */
export function makeFullscreen(target, { onChange }) {
  let on = false;
  const native = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function set(v) {
    if (v === on) return;
    on = v;
    target.classList.toggle("is-full", on);
    document.documentElement.classList.toggle("has-full", on);
    if (onChange) onChange(on);
  }
  async function enter() {
    set(true);
    try {
      if (target.requestFullscreen) await target.requestFullscreen({ navigationUI: "hide" });
      else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
    } catch {
      /* 브라우저 전체 화면이 막히면 쪽 위를 덮는 것으로 끝낸다 */
    }
  }
  function exit() {
    if (native() === target) {
      const out = document.exitFullscreen || document.webkitExitFullscreen;
      try {
        const p = out && out.call(document);
        if (p && p.catch) p.catch(() => {});
      } catch {
        /* 이미 나왔다 */
      }
    }
    set(false);
  }
  // 브라우저 전체 화면에서 Esc 로 나오면 따라 나온다
  const onNative = () => {
    if (on && native() !== target && !native()) set(false);
  };
  document.addEventListener("fullscreenchange", onNative);
  document.addEventListener("webkitfullscreenchange", onNative);
  return {
    toggle: () => (on ? exit() : enter()),
    exit,
    get on() {
      return on;
    },
    destroy() {
      if (on) exit();
      document.removeEventListener("fullscreenchange", onNative);
      document.removeEventListener("webkitfullscreenchange", onNative);
    },
  };
}

/** 격자 위에 잠깐 떴다 사라지는 한 줄 알림 */
export function flashLine() {
  const el = h("p", { class: "stage-flash", hidden: true, role: "status" });
  let timer = 0;
  return {
    el,
    show(text, ms = 1800) {
      el.textContent = text;
      el.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(() => (el.hidden = true), ms);
    },
    hide() {
      clearTimeout(timer);
      el.hidden = true;
    },
  };
}

/** Ctrl 이 맥에서는 ⌘ */
export const modKey = () => (/Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "") ? "⌘" : "Ctrl");

/**
 * 단추 여럿 가운데 하나 고르기. options: [{ id, name, title?, icon? }]
 * cls 로 겉모양을 바꾼다(기본 "seg", 첫 화면의 규칙 고르기는 "chips")
 */
export function segmented({ label, options, value, onChange, cls = "seg", item = "" }) {
  const wrap = h("div", { class: cls, role: "radiogroup", "aria-label": label });
  const btns = options.map((o) =>
    h(
      "button",
      {
        type: "button",
        role: "radio",
        class: item || null,
        title: o.title,
        "aria-label": o.icon && !o.name ? o.title : null,
        "aria-checked": String(o.id === value),
        "data-id": o.id,
        onclick: () => {
          set(o.id);
          onChange && onChange(o.id);
        },
      },
      o.icon || null,
      // 그림과 이름이 함께면 이름을 감싸 둔다(좁은 곳에서는 그림만 보이고 이름은 읽어 주기로)
      o.name ? (o.icon ? h("span", { class: "seg-label" }, o.name) : o.name) : null,
    ),
  );
  function set(id) {
    btns.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === String(id))));
    const on = btns.some((b) => b.getAttribute("aria-checked") === "true");
    btns.forEach((b, i) => (b.tabIndex = b.getAttribute("aria-checked") === "true" || (!on && i === 0) ? 0 : -1));
  }
  wrap.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = Math.max(0, btns.indexOf(document.activeElement));
    const j = (i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length;
    btns[j].focus();
    btns[j].click();
    e.preventDefault();
  });
  wrap.append(...btns);
  set(value);
  return { el: wrap, set, buttons: btns };
}

export function paragraphs(list) {
  return (list || []).map((p) => h("p", {}, p));
}
