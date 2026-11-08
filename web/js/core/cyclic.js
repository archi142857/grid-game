// 순환(family: "cyclic"). 상태 0 은 바탕이라 바뀌지 않고, 1…N 이 고리를 돈다(N = 상태 수 − 1).
// 색 k 인 칸은 이웃 가운데 다음 색(k 다음, N 다음은 1)인 칸이 문턱(threshold) 이상이면 다음 색이 된다.
// 바탕은 바뀌지 않으니 잠글 규칙이 없고, 뿌린 곳 밖으로 퍼지지 않는다.

/** 상태 수의 끝(바탕 + 도는 색 24개) */
export const MAX_CYCLIC_STATES = 25;
/** 이웃마다 문턱의 끝 */
export const CYCLIC_THRESHOLD = { moore: 8, "von-neumann": 4 };

/** 색 k(1–colors) 다음 색 */
export const nextColor = (k, colors) => (k >= colors ? 1 : k + 1);

/** (x, y) 의 이웃 자리. 폰 노이만은 위·왼쪽·오른쪽·아래, 무어는 왼쪽 위부터 줄 순서 8칸 */
export function cyclicNeighbors(x, y, neighborhood) {
  if (neighborhood === "von-neumann")
    return [
      [x, y - 1],
      [x - 1, y],
      [x + 1, y],
      [x, y + 1],
    ];
  return [
    [x - 1, y - 1],
    [x, y - 1],
    [x + 1, y - 1],
    [x - 1, y],
    [x + 1, y],
    [x - 1, y + 1],
    [x, y + 1],
    [x + 1, y + 1],
  ];
}
