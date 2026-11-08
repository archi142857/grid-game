// 소개 화면: 무엇인지, 세포 자동자의 짧은 역사, 표기와 규칙 파일, 계산 방법, 다루기(손과 단축키), 출처와 라이선스, 만든 사람.

import { h, setTitle } from "../ui/dom.js";
import { t } from "../i18n.js";
import { formatRuleFile, toRuleFile } from "../core/rules.js";

export function aboutView(main, { presets }) {
  setTitle(t("소개"));
  const sample = presets.find((p) => p.id === "conway-life") ?? presets[0];
  const sec = (title, ...children) => h("section", {}, h("h2", {}, title), ...children);
  const key = (k, text) => [h("dt", {}, h("kbd", {}, k)), h("dd", {}, text)];
  main.append(
    h(
      "div",
      { class: "wrap prose" },
      h("header", {}, h("h1", {}, t("격자 게임")), h("p", {}, t("세포 자동자를 바로 돌려 보고, 규칙을 직접 만들어 보는 곳이에요."))),
      sec(
        t("무엇을 하나요"),
        h(
          "p",
          {},
          t("이름난 규칙 {n}가지를 도감으로 모았어요. 태어남과 살아남음의 숫자를 눌러 규칙을 고치거나, 아예 새로 만들 수 있어요.", { n: presets.length }),
        ),
        h(
          "p",
          {},
          t(
            "처음이라면 첫 화면의 점 단추만 눌러 봐도 충분해요. 더 파고들고 싶다면 B3/S23 같은 표기를 바로 고쳐 쓰거나, 규칙 파일을 내려받아 고친 뒤 다시 불러오세요. 가입은 없고, 설정은 이 브라우저에만 남아요.",
          ),
        ),
      ),
      sec(
        t("세포 자동자의 짧은 역사"),
        h(
          "p",
          {},
          t(
            "칸으로 나뉜 세계에서 모든 칸이 같은 규칙을 따라 한꺼번에 바뀌어요. 규칙은 짧아도 결과는 미리 알기 어려워서, 생물의 무늬나 결정이 자라는 모습, 계산 자체를 연구하는 도구로 쓰여요.",
          ),
        ),
        h(
          "ul",
          { class: "timeline" },
          [
            ["1940s", t("존 폰 노이만과 스타니스와프 울람이 스스로를 복제하는 기계를 칸의 세계로 설계했어요.")],
            ["1970", t("존 콘웨이의 생명 게임이 마틴 가드너의 칼럼에 실려 널리 알려졌어요.")],
            ["1983", t("스티븐 울프럼이 한 줄짜리 세포 자동자 256가지를 체계적으로 살폈어요.")],
            ["1986", t("크리스 랭턴이 칸 위를 걷는 개미 규칙을 내놓았어요.")],
            ["1990s", t("하이라이프, 낮과 밤, 브라이언의 뇌처럼 생명 게임을 고친 규칙이 많이 나왔어요.")],
          ].map(([y, text]) => h("li", {}, h("span", { class: "num" }, y), h("span", {}, text))),
        ),
      ),
      sec(
        t("규칙 표기"),
        h(
          "p",
          {},
          t(
            "B 뒤의 숫자는 빈칸이 태어나는 산 이웃 수, S 뒤의 숫자는 산 칸이 살아남는 산 이웃 수예요. 상태가 셋 이상이면 C 뒤에 상태 수를 붙여요. 생명 게임은 B3/S23, 브라이언의 뇌는 B2/S/C3 이에요.",
          ),
        ),
        h("p", {}, t("살아남음/태어남 차례로 적는 옛 꼴(23/3)과 Generations 꼴(345/2/4)도 읽어요. Golly 나 LifeWiki 의 표기를 그대로 붙여 넣으면 돼요.")),
      ),
      sec(
        t("규칙 파일"),
        h("p", {}, t("규칙 하나는 JSON 파일 한 장이에요. 규칙 화면의 '더 보기'에서 내려받고, 고친 뒤 다시 불러와요. 아래는 생명 게임의 파일이에요.")),
        h("pre", { class: "code-block" }, formatRuleFile(toRuleFile(sample))),
      ),
      sec(
        t("계산은 이렇게 해요"),
        h(
          "p",
          {},
          t(
            "격자는 끝없이 이어져요. 판을 32×32 조각으로 나누고, 칸이 있는 조각만 둬요. 가장자리에 산 칸이 닿은 조각은 그쪽에 빈 조각을 미리 만들어 두어서, 무늬는 어디로든 자라 나갈 수 있어요.",
          ),
        ),
        h(
          "p",
          {},
          t(
            "칸마다 (지금 상태, 산 이웃 수) → 다음 상태 표를 미리 만들어 두고 찾기만 하므로, 숫자를 바꿔도 빠르기가 같아요. 무늬가 100만 칸쯤 되는 넓이로 퍼지면 멈춰요.",
          ),
        ),
        h(
          "p",
          {},
          t("태어남 0은 쓸 수 없어요. 끝없는 격자에서는 빈 곳이 모두 한꺼번에 태어나 버리거든요. 화면에서는 방금 태어난 칸을 신호색으로, 사라지는 칸을 점점 작아지는 점으로 그려요."),
        ),
      ),
      sec(
        t("다루기"),
        h(
          "dl",
          { class: "keys" },
          key(t("끌기"), t("둘러봐요. 그리기 손일 때는 칸을 그리고, 오른쪽 단추로 끌면 둘러봐요")),
          key(t("누르기"), t("칸을 살리거나 비워요")),
          key(t("휠·두 손가락"), t("확대·축소해요. 첫 화면에서는 Ctrl(⌘)을 누른 채 휠을 굴려요(전체 화면에서는 그냥 휠)")),
          key(t("스페이스"), t("재생하거나 일시정지해요")),
          key("→", t("한 세대 넘겨요")),
          key("R", t("처음 모습으로 돌아가요")),
          key("F", t("격자를 전체 화면으로 보거나 끝내요")),
          key("+ −", t("확대·축소해요")),
          key("0", t("산 칸이 모두 보이게 맞춰요")),
          key(t("Shift + 화살표"), t("화면 4분의 1씩 둘러봐요(규칙 화면)")),
          key("Esc", t("살펴보는 칸을 놓거나 전체 화면을 끝내요")),
        ),
      ),
      sec(
        t("출처"),
        h("p", {}, t("규칙의 이름과 만든 사람, 무늬는 아래 자료를 따랐어요.")),
        h(
          "ul",
          { class: "links" },
          [
            ["LifeWiki", "https://conwaylife.com/wiki/Main_Page"],
            ["Wikipedia: Life-like cellular automaton", "https://en.wikipedia.org/wiki/Life-like_cellular_automaton"],
            ["Mirek's Cellebration: Generations rules lexicon", "http://psoup.math.wisc.edu/mcell/rullex_gene.html"],
          ].map(([label, u]) => h("li", {}, h("a", { href: u, target: "_blank", rel: "noopener" }, label))),
        ),
      ),
      sec(
        t("라이선스"),
        h(
          "p",
          {},
          t(
            "코드는 MIT 라이선스예요. 글꼴은 Pretendard(© Kil Hyung-jin)와 Doto(© The Doto Project Authors)이고 둘 다 SIL Open Font License 1.1 이에요. jsDelivr 로 불러와요.",
          ),
        ),
      ),
      sec(
        t("만든 사람"),
        h(
          "p",
          {},
          t("서울대학교 동물생명공학전공 25학번 이영표. 버그 제보와 새 규칙 제안은 "),
          h("a", { href: "https://github.com/Archi142857/grid-game/issues", rel: "noopener" }, t("GitHub 이슈")),
          t("로 받아요."),
        ),
      ),
    ),
  );
  return {};
}
