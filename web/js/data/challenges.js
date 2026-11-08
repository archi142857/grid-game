// 도전 과제의 글: 문제마다 제목, 할 일, 힌트. 열쇠는 web/data/challenges/index.json 의 문제 id.
// 할 일은 문제 파일의 한도·목표를 자리표로 받아서, 엔진이 수를 바꿔도 글은 그대로 맞는다.
//   challengeOf(id).task(문제)  문제: { limits: { cells?, minCells?, box?: [w, h] }, goal: { gens?, min?, p? } }
// 값이 없으면 자리표가 그대로 남는다(테스트가 잡는다).

import { t, num } from "../i18n.js";

const n = (v) => (v === undefined || v === null ? undefined : num(v));
const lim = (c) => c?.limits ?? {};
const goal = (c) => c?.goal ?? {};
const box = (c) => {
  const b = lim(c).box ?? {};
  return { w: n(b[0] ?? b.w), h: n(b[1] ?? b.h) };
};

const CHALLENGES = {
  "life-still": {
    title: () => t("멈춘 무늬"),
    task: (c) => t("생명 게임에서 칸을 {min}개 이상 놓아, 다음 세대에도 모습이 그대로인 무늬를 만들어 보세요.", { min: n(lim(c).minCells) }),
    hint: () => t("산 칸은 모두 산 이웃이 2개나 3개여야 하고, 산 이웃이 꼭 3개인 빈칸은 없어야 해요."),
  },
  "life-p2": {
    title: () => t("깜빡이는 무늬"),
    task: (c) => t("{w}×{h} 네모 안에 칸을 놓아, 두 세대마다 처음 모습으로 돌아오는 무늬를 만들어 보세요.", box(c)),
    hint: () => t("가장 작은 답은 칸 세 개짜리예요."),
  },
  "life-p3": {
    title: () => t("세 박자 무늬"),
    task: (c) => t("{w}×{h} 네모 안에 칸을 놓아, 세 세대마다 처음 모습으로 돌아오는 무늬를 만들어 보세요.", box(c)),
    hint: () => t("위아래와 좌우가 똑같은 모양에서 찾아보세요. 가장 이름난 답은 펄서예요."),
  },
  "life-ship": {
    title: () => t("날아가는 무늬"),
    task: (c) => t("칸을 {cells}개까지만 놓아, 같은 모양을 지키며 자리를 옮겨 가는 무늬를 만들어 보세요.", { cells: n(lim(c).cells) }),
    hint: () => t("칸 다섯 개로 대각선으로 기어가는 무늬가 있어요."),
  },
  "life-survive": {
    title: () => t("오래 버티기"),
    task: (c) => t("칸을 {cells}개까지만 놓아, {gens}세대가 지나도 산 칸이 남아 있게 해 보세요.", { cells: n(lim(c).cells), gens: n(goal(c).gens) }),
    hint: () => t("작은 무늬가 오래 요동치기도 해요. 다섯 칸짜리 R-펜토미노는 1103세대가 지나서야 잠잠해져요."),
  },
  "highlife-grow": {
    title: () => t("스스로 늘어나기"),
    task: (c) =>
      t("하이라이프(B36/S23)에서 칸을 {cells}개까지만 놓아, {gens}세대 뒤에 산 칸이 {min}개 이상이 되게 해 보세요.", {
        cells: n(lim(c).cells),
        gens: n(goal(c).gens),
        min: n(goal(c).min),
      }),
    hint: () => t("하이라이프에는 12세대마다 자기와 똑같은 무늬를 하나씩 더 만드는 복제자가 있어요."),
  },
  "rule-sierpinski": {
    title: () => t("삼각형 속 삼각형"),
    task: (c) => t("가운데 한 칸에서 시작해 {gens}줄 동안 시에르핀스키 삼각형을 그리는 1차원 규칙 번호를 찾아보세요.", { gens: n(goal(c).gens) }),
    hint: () => t("가운데 칸은 보지 말고, 양옆 두 칸만 보고 정해 보세요."),
  },
  "guess-life": {
    title: () => t("규칙 맞히기"),
    task: (c) => t("보기 무늬가 {gens}세대 동안 똑같이 흘러가는 규칙을 태어남·살아남음 숫자로 맞혀 보세요.", { gens: n(goal(c).gens) }),
    hint: () => t("한 세대씩 넘기며, 빈칸이 산 이웃 몇 개에서 태어나는지부터 세어 보세요."),
  },
};

/** 문제 id → { title(), task(문제), hint() } | null */
export const challengeOf = (id) => CHALLENGES[id] ?? null;
export const challengeIds = () => Object.keys(CHALLENGES);
