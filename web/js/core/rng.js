// 씨앗(seed)을 받는 난수. 같은 씨앗이면 같은 수열이 나와서 시작 상태를 그대로 되풀이할 수 있다.
// mulberry32 (32비트 상태, 빠르고 고르게 퍼진다). Ultimate RSP 의 core/rng.js 와 같다.

export function makeRng(seed = randomSeed()) {
  let s = seed >>> 0;
  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    seed: seed >>> 0,
    next,
    /** 0 이상 n 미만의 정수 */
    int(n) {
      return Math.floor(next() * n);
    },
  };
}

export function randomSeed() {
  try {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0];
  } catch {
    return (Math.random() * 4294967296) >>> 0;
  }
}
