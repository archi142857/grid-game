// 정해진 빠르기(세대/초)로 한 세대씩 넘기고, 세대 사이를 부드럽게 이어 그린다.
// draw(t): t 는 방금 넘긴 세대로 넘어가는 진행도(0–1). 빠르게 돌 때와 '움직임 줄이기'에서는 늘 1.
// 화면 한 장에 12ms 넘게 쓰지 않는다(넘으면 그 장면에서는 남은 세대를 버린다).

import { reducedMotion } from "./dom.js";

export function makeLoop({ step, draw, rate }) {
  let raf = 0;
  let running = false;
  let last = 0;
  let acc = 0;
  let stepAt = 0;
  let dur = 1;
  let settled = true;

  const progress = () => (settled ? 1 : Math.min(1, (performance.now() - stepAt) / dur));

  function frame(now) {
    raf = 0;
    let did = 0;
    if (running) {
      const r = rate();
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      acc += dt * r;
      let n = Math.floor(acc);
      acc -= n;
      const t0 = performance.now();
      while (n-- > 0) {
        step();
        did++;
        if (performance.now() - t0 > 12) {
          acc = 0;
          break;
        }
      }
      if (did) {
        stepAt = now;
        // 한 장면에 한 세대씩 갈 때만 사이를 잇는다
        dur = did === 1 && r <= 24 && !reducedMotion() ? Math.min(1000 / r, 160) : 1;
        settled = false;
      }
    }
    if (!settled) {
      const t = Math.min(1, (now - stepAt) / dur);
      draw(t);
      if (t >= 1) settled = true;
    }
    if (running || !settled) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      acc = 1; // 누르자마자 한 세대
      last = performance.now();
      kick();
    },
    stop() {
      running = false;
    },
    /** 멈춘 채로 한 세대를 넘겼을 때, 그 세대로 넘어가는 모습만 그린다 */
    pulse() {
      stepAt = performance.now();
      dur = reducedMotion() ? 1 : 180;
      settled = false;
      kick();
    },
    cancel() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    progress,
    get running() {
      return running;
    },
  };
}

/** 여러 번 불러도 다음 화면에 한 번만 그린다 */
export function makePainter(draw) {
  let raf = 0;
  const paint = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      draw();
    });
  };
  paint.cancel = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  return paint;
}
