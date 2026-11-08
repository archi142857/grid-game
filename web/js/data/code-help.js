// 코드로 규칙 쓰기의 글: 코드 칸 도움말, 예시 코드(core/code.js 의 EXAMPLE_SOURCE, 생명 게임) 설명, 오류 한 줄, 잠금 까닭.
// 오류는 Worker 가 돌려준 { kind, state?, counts?, value?, message? }(core/code.js runCodeJob) 를 그대로 받는다.

import { t, num } from "../i18n.js";
import { MAX_SOURCE, MIN_CODE_STATES, MAX_CODE_STATES } from "../core/code.js";

/** 코드 칸 위의 도움말. 문단마다 하나 */
export const CODE_HELP = () => [
  t("칸마다 부를 함수를 하나 써요. 함수는 지금 상태(state)와 상태별 이웃 수(counts)를 받아 다음 상태를 돌려줘요."),
  t("state 는 지금 칸의 상태 번호예요(0부터). counts 는 이웃 여덟 칸을 상태마다 센 배열이라, counts[1] 은 상태 1 인 이웃의 수예요. 모두 더하면 8 이에요."),
  t("돌려줄 값은 0부터 상태 수 − 1 사이의 정수예요. 상태는 {min}–{max}개까지 쓸 수 있어요.", { min: MIN_CODE_STATES, max: MAX_CODE_STATES }),
  t("'돌리기'를 누르면 함수를 경우마다 한 번씩만 불러 표를 만들고, 그다음은 표로 돌아요. 그래서 같은 입력에는 늘 같은 값을 돌려줘야 해요."),
  t("이웃이 모두 빈칸인 빈칸(상태 0)은 0 으로 남아야 해요. 끝없는 격자에서는 빈 곳이 한꺼번에 바뀌어 버리거든요."),
];

/** 예시 코드(생명 게임) 설명. 위에서부터 한 줄씩 */
export const EXAMPLE_NOTES = () => [
  t("예시는 생명 게임(B3/S23)이에요. 상태는 빈칸(0)과 산 칸(1) 둘이에요."),
  t("빈칸이면 산 이웃(counts[1])이 꼭 3개일 때 1, 아니면 0 을 돌려줘요. 태어남 3 이에요."),
  t("산 칸이면 산 이웃이 2개나 3개일 때 1, 아니면 0 이에요. 살아남음 2, 3 이에요."),
  t("숫자를 바꾸거나, 상태를 늘리고 counts[2] 를 써서 나만의 규칙을 만들어 보세요."),
];

/**
 * Worker 가 돌려준 오류 → 한 줄. states 는 그때의 상태 수(돌려준 값이 범위를 벗어났을 때 알려 주려고)
 * kind: empty · long · states · syntax · notfunction · throw · value
 */
export function codeErrorText(e = {}, states) {
  const at = { state: e.state, counts: Array.isArray(e.counts) ? `[${e.counts.join(", ")}]` : undefined };
  switch (e.kind) {
    case "empty":
      return t("코드가 비어 있어요.");
    case "long":
      return t("코드가 너무 길어요. {max}자까지 쓸 수 있어요.", { max: num(MAX_SOURCE) });
    case "states":
      return t("상태는 {min}–{max}개여야 해요.", { min: MIN_CODE_STATES, max: MAX_CODE_STATES });
    case "syntax":
      return t("코드를 읽을 수 없어요: {message}", { message: e.message ?? "" });
    case "notfunction":
      return t("함수가 아니에요. (state, counts) => … 꼴로 써 주세요.");
    case "throw":
      return t("state {state}, counts {counts} 에서 오류가 났어요: {message}", { ...at, message: e.message ?? "" });
    case "value":
      return t("state {state}, counts {counts} 에서 돌려준 값({value})이 0–{max} 사이 정수가 아니에요.", {
        ...at,
        value: e.value,
        max: Number.isInteger(states) ? states - 1 : MAX_CODE_STATES - 1,
      });
    default:
      return t("코드를 돌리지 못했어요.");
  }
}

/** 잠금 까닭(이웃이 모두 빈칸인 빈칸이 바뀌는 코드) */
export const CODE_LOCKED = () => t("이웃이 모두 빈칸인 빈칸이 바뀌어서 끝없는 격자에서는 돌릴 수 없어요. 그때는 0 을 돌려주게 고쳐 주세요.");
