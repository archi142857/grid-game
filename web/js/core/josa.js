// 한국어 조사. 앞말의 끝소리에 따라 이/가, 을/를, 은/는, 과/와, 으로/로 를 고른다.
// 숫자는 읽는 소리로 본다: 3 → 삼(받침 있음), 2 → 이(없음), 10 → 십(있음).

const PAIRS = { 이가: ["이", "가"], 을를: ["을", "를"], 은는: ["은", "는"], 과와: ["과", "와"], 으로로: ["으로", "로"] };

// 0–9 를 읽은 소리(영 일 이 삼 사 오 육 칠 팔 구): [받침이 있나, 그 받침이 ㄹ 인가]
const DIGIT = [
  [true, false],
  [true, true],
  [false, false],
  [true, false],
  [false, false],
  [false, false],
  [true, false],
  [true, true],
  [true, true],
  [false, false],
];
// 영어 글자 이름 가운데 받침이 있는 것: L(엘) M(엠) N(엔) R(알)
const LATIN = { L: [true, true], M: [true, false], N: [true, false], R: [true, true] };

function ending(word) {
  const s = String(word);
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const jong = (code - 0xac00) % 28;
      return [jong !== 0, jong === 8];
    }
    // 끝자리가 0 이면 십·백·천·만 으로 끝나서 받침이 있다(0 하나는 '영')
    if (ch >= "0" && ch <= "9") return ch === "0" ? [true, false] : DIGIT[code - 48];
    if (/[a-z]/i.test(ch)) return LATIN[ch.toUpperCase()] ?? [false, false];
  }
  return [false, false];
}

export function josa(word, pair) {
  const forms = PAIRS[pair];
  if (!forms) return word + pair;
  const [batchim, rieul] = ending(word);
  if (pair === "으로로") return word + (batchim && !rieul ? forms[0] : forms[1]);
  return word + (batchim ? forms[0] : forms[1]);
}
