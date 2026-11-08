// 화면이 쓰는 세계 하나: 엔진의 sim(core/sim.js) 위에 세대 수, 기록(세대마다 산 칸·바뀐 칸 수),
// 처음 모습, 마지막으로 뿌린 자리와 씨앗 번호를 얹는다. 첫 화면과 규칙 화면이 함께 쓴다.
// 칸과 계산은 sim 이 맡고, 계열(Life·개미·1차원·조건표)이 달라도 여기서 부르는 꼴은 같다.
// '처음으로'는 0세대에서 넘기기 시작한 순간의 모습(origin)으로 돌아간다.
// 칸 자리는 정수 (x, y). 가운데가 (0, 0) 이고 오른쪽·아래로 커진다.

import { makeSim, MAX_TILES } from "../core/sim.js";
import { makeRng, randomSeed } from "../core/rng.js";

export { MAX_TILES };

/** 가운데가 (cx, cy) 인 w×h 네모 */
export const regionAt = (cx, cy, w, h) => ({ x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) });

export function makeWorld(rule, { seed = randomSeed(), keep = 600 } = {}) {
  let S = makeSim(rule);
  const W = {
    seed: seed >>> 0,
    gen: 0,
    origin: null,
    alive: [0],
    changed: [0],
    marks: [0], // 기록마다 몇 세대(걸음)의 값인지. 한 번에 여러 걸음을 넘기면 띄엄띄엄 늘어난다
    start: 0, // alive[0] 이 몇 세대의 값인지
    region: regionAt(0, 0, 64, 48), // 마지막으로 뿌린 자리

    get sim() {
      return S;
    },
    get rule() {
      return S.rule;
    },
    get family() {
      return S.family;
    },
    /** 돌릴 수 없는 규칙(Life 의 태어남 0 처럼 빈 곳이 저절로 바뀌는 것)이면 거짓 */
    canRun: () => S.canRun(),
    /** 너무 넓게 퍼졌는가 */
    get full() {
      return S.full;
    },

    /**
     * 규칙을 바꾼다. 같은 계열이면 칸은 그대로(상태 수가 줄면 없어진 상태의 칸은 빈칸),
     * 계열이 바뀌면 sim 을 새로 만들고 비운다
     */
    setRule(r) {
      if (r.family !== S.family) {
        S = makeSim(r);
        W.origin = null;
        W.restart();
        return;
      }
      const fewer = r.states.length < S.rule.states.length;
      S.setRule(r);
      if (fewer) W.touched();
    },

    /** 규칙 파일의 seed 대로 region 안에 다시 뿌린다. 씨앗 번호가 같으면 같은 모습 */
    reseed(n = W.seed, region = W.region) {
      W.seed = n >>> 0;
      W.region = region;
      S.seed(region, makeRng(W.seed));
      W.origin = null;
      W.restart();
    },

    /** region 안에 무작위로 흩뿌린다. 규칙의 seed 가 random 이면 그 넓이(area) 안에만 */
    scatter(density, n = randomSeed(), region = W.region) {
      W.seed = n >>> 0;
      W.region = region;
      S.scatter(region, density, makeRng(W.seed));
      W.origin = null;
      W.restart();
    },

    clear() {
      S.clear();
      W.origin = null;
      W.restart();
    },

    /** 비우고 (cx, cy) 를 가운데로 무늬를 놓는다 */
    place(rows, cx = 0, cy = 0) {
      S.place(rows, cx, cy);
      W.origin = null;
      W.restart();
    },

    /** region 안의 산 칸과 빈칸을 뒤바꾼다(사라지는 중인 칸은 빈칸으로 본다) */
    invert(region) {
      S.invert(region);
      W.touched();
    },

    /** 0세대부터 다시 센다 */
    restart() {
      W.gen = 0;
      W.alive = [S.alive];
      W.changed = [0];
      W.marks = [0];
      W.start = 0;
    },

    /** 손으로 칸을 바꾼 뒤. 0세대면 처음 모습도 바뀐 것으로 본다 */
    touched() {
      if (W.gen === 0) {
        W.origin = null;
        W.alive = [S.alive];
      } else W.alive[W.alive.length - 1] = S.alive;
    },

    /** n 번(기본 1) 넘기고 기록을 하나 남긴다. 돌릴 수 없으면(막힌 규칙, 너무 넓음) 거짓 */
    step(n = 1) {
      if (!S.canRun() || S.full) return false;
      if (W.gen === 0) W.origin = S.snapshot();
      const res = S.step(n);
      if (!res) return false;
      W.gen += res.steps;
      W.alive.push(res.alive);
      W.changed.push(res.changed);
      W.marks.push(W.gen);
      if (W.alive.length > keep) {
        W.alive.shift();
        W.changed.shift();
        W.marks.shift();
        W.start++;
      }
      return true;
    },

    /** 처음으로: 0세대의 모습으로 */
    back() {
      if (!W.origin) return false;
      S.restore(W.origin);
      W.restart();
      return true;
    },

    get: (x, y) => S.get(x, y),
    set: (x, y, v) => S.set(x, y, v),
    bounds: () => S.bounds(),
    /** 살펴보기: { now, next, why, n, cells } */
    explain: (x, y) => S.explain(x, y),

    /** 그리기용: (x0, y0)–(x1, y1) 에 걸친 조각마다 fn(왼쪽 위 x, y, 너비, 높이, 지금 칸, 앞 세대 칸 | null) */
    blocks: (x0, y0, x1, y1, fn) => S.blocks(x0, y0, x1, y1, fn),
    /** 개미 [{ x, y, dir }] (다른 계열은 빈 배열) */
    get agents() {
      return S.agents;
    },
    /** 1차원의 지금 줄 y (다른 계열은 null) */
    get head() {
      return S.head;
    },

    get count() {
      return S.alive;
    },
    /** 쓰고 있는 조각 수(넓게 퍼질수록 커진다) */
    get size() {
      return S.size;
    },
    get lastChanged() {
      return W.changed[W.changed.length - 1];
    },
  };

  W.restart();
  return W;
}

/** 글자에서 늘 같은 씨앗 번호를 만든다(도감 그림이 볼 때마다 같게) */
export function seedOf(text) {
  let x = 2166136261;
  for (const ch of String(text)) {
    x ^= ch.codePointAt(0);
    x = Math.imul(x, 16777619);
  }
  return x >>> 0;
}
