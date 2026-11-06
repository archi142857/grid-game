// 캔버스 위에서 칸을 그리는 손. 누르면 begin(칸)이 한 획을 시작하고, 끌면 지나간 칸을 빈틈없이 잇는다.
// tapOnTouch 가 참이면 손가락은 '톡' 누를 때만 칸을 바꾼다(첫 화면처럼 쓸어 넘겨 내려가야 하는 곳).

/** 두 칸 사이를 빈틈없이 잇는다(브레즌햄) */
export function lineCells([x0, y0], [x1, y1], fn) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** begin(c) 은 첫 칸을 처리하고 { move(c), end() } 를 돌려준다(없으면 한 번 누르기로 끝) */
export function attachPen(canvas, { cellAt, begin, tapOnTouch = false }) {
  let stroke = null;
  let last = null;
  let tap = null;

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    if (tapOnTouch && e.pointerType === "touch") {
      tap = { x: e.clientX, y: e.clientY, id: e.pointerId };
      return;
    }
    e.preventDefault();
    stroke = begin(c) || null;
    last = c;
    if (stroke) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* 붙잡지 못해도 그린다 */
      }
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!stroke || !stroke.move) return;
    const c = cellAt(e.clientX, e.clientY);
    if (!c || (c[0] === last[0] && c[1] === last[1])) return;
    lineCells(last, c, (x, y) => stroke.move([x, y]));
    last = c;
  });
  const finish = () => {
    if (stroke && stroke.end) stroke.end();
    stroke = null;
  };
  canvas.addEventListener("pointerup", (e) => {
    if (tap && e.pointerId === tap.id) {
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10) {
        const c = cellAt(e.clientX, e.clientY);
        const s = c && begin(c);
        if (s && s.end) s.end();
      }
      tap = null;
    }
    finish();
  });
  canvas.addEventListener("pointercancel", () => {
    tap = null;
    finish();
  });
}
