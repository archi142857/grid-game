// 여러 화면이 같이 쓰는 머리 조각과 없는 화면.

import { h, icon, ICON } from "../ui/dom.js";
import { t } from "../i18n.js";

export function crumb(href = "#/", label = t("도감")) {
  return h("a", { class: "crumb", href }, icon(ICON.back), label);
}

export function notFound(main) {
  main.append(
    h(
      "div",
      { class: "wrap prose" },
      crumb(),
      h("header", {}, h("h1", {}, t("없는 화면이에요")), h("p", {}, t("주소를 다시 확인하거나 도감에서 골라 주세요."))),
    ),
  );
  return {};
}
