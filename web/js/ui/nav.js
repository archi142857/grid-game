// 격자 위의 손. 끌면 둘러보고, 톡 누르면 칸을 켜고 끄고, 그리기 손이면 끄는 대로 칸을 그린다.
// 휠·두 손가락(핀치)으로 키우고 줄인다. 가운데·오른쪽 단추로 끌면 어떤 손이든 둘러본다.
//
// tool()  "pan" 둘러보기 · "draw" 그리기 · "look" 살펴보기
// wheel   "zoom" 휠로 바로 키우고 줄인다 · "ctrl" Ctrl(⌘)을 누른 채일 때만(첫 화면처럼 쓸어 내려가는 쪽)
// touch   "full" 한 손가락으로 끌어 둘러보거나 그린다 · "tap" 톡 누르기만 받는다(세로로 쓸면 쪽이 내려간다)

import { lineCells } from "./pen.js";

const MOVE = { mouse: 4, pen: 6, touch: 9 }; // 이만큼(css px) 넘게 움직이면 누르기가 아니라 끌기

export function attachNav(canvas, board, { tool = () => "pan", wheel = "zoom", touch = "full", onTap, onStroke, onView, onHover, onHint }) {
  const pts = new Map(); // pointerId → { x, y }
  let mode = null; // null · "maybe" · "pan" · "stroke" · "tap" · "pinch" · "done"
  let first = null; // { id, x, y, type, cell }
  let stroke = null;
  let last = null;
  let pinch = null; // { d, x, y }

  const view = () => onView && onView();
  const dragging = (on) => canvas.classList.toggle("grabbing", on);

  function capture(id) {
    try {
      canvas.setPointerCapture(id);
    } catch {
      /* 붙잡지 못해도 움직인다 */
    }
  }

  function startStroke() {
    mode = "stroke";
    stroke = (onStroke && onStroke(first.cell)) || null;
    last = first.cell;
  }

  function endStroke() {
    if (stroke && stroke.end) stroke.end();
    stroke = null;
  }

  function centroid() {
    const [a, b] = [...pts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && (e.button === 1 || e.button === 2)) {
      // 가운데·오른쪽 단추: 어떤 손이든 둘러본다
      e.preventDefault();
      endStroke();
      pts.clear();
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      first = { id: e.pointerId, x: e.clientX, y: e.clientY, type: "mouse", cell: null };
      mode = "pan";
      dragging(true);
      capture(e.pointerId);
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size === 2) {
      // 두 손가락: 그리던 것은 멈추고 키우고 줄이며 둘러본다
      if (mode === "stroke") endStroke();
      mode = "pinch";
      pinch = centroid();
      for (const id of pts.keys()) capture(id);
      return;
    }
    if (pts.size > 2) return;

    first = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType, cell: board.cellAt(e.clientX, e.clientY) };
    if (e.pointerType === "touch" && touch === "tap") {
      mode = "tap"; // 붙잡지 않는다: 세로로 쓸면 쪽이 내려가야 한다
      return;
    }
    if (e.pointerType === "mouse") e.preventDefault(); // 글자가 잡히지 않게
    capture(e.pointerId);
    if (tool() === "draw" && e.pointerType === "mouse") startStroke();
    else mode = "maybe";
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId);
    if (!p) {
      if (e.pointerType === "mouse" && onHover) onHover(board.cellAt(e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (mode === "pinch") {
      if (pts.size < 2) return;
      const now = centroid();
      board.panBy(now.x - pinch.x, now.y - pinch.y);
      board.zoomAt(now.x, now.y, now.d / pinch.d);
      pinch = now;
      view();
      return;
    }
    if (!first || e.pointerId !== first.id) return;
    const far = Math.hypot(e.clientX - first.x, e.clientY - first.y) > (MOVE[e.pointerType] ?? 6);

    if (mode === "tap") {
      if (far) mode = "done";
      return;
    }
    if (mode === "maybe") {
      if (!far) return;
      if (tool() === "draw") startStroke();
      else {
        mode = "pan";
        dragging(true);
        board.panBy(e.clientX - first.x, e.clientY - first.y);
        view();
        return;
      }
    }
    if (mode === "pan") {
      board.panBy(dx, dy);
      view();
    } else if (mode === "stroke" && stroke && stroke.move) {
      const cell = board.cellAt(e.clientX, e.clientY);
      if (!cell || (cell[0] === last[0] && cell[1] === last[1])) return;
      lineCells(last, cell, (x, y) => stroke.move([x, y]));
      last = cell;
    }
    if (e.pointerType === "mouse" && onHover) onHover(board.cellAt(e.clientX, e.clientY));
  });

  function release(e, cancelled) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (mode === "pinch") {
      if (pts.size === 0) mode = null;
      else mode = "done"; // 남은 손가락은 다 뗄 때까지 무시한다
      return;
    }
    if (first && e.pointerId === first.id) {
      if (!cancelled && (mode === "maybe" || mode === "tap") && onTap && first.cell) onTap(first.cell);
      if (mode === "stroke") endStroke();
      first = null;
    }
    if (pts.size === 0) {
      mode = null;
      dragging(false);
    }
  }
  canvas.addEventListener("pointerup", (e) => release(e, false));
  canvas.addEventListener("pointercancel", (e) => release(e, true));
  canvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && onHover && !pts.size) onHover(null);
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener(
    "wheel",
    (e) => {
      if (wheel === "ctrl" && !e.ctrlKey && !e.metaKey) {
        if (onHint) onHint("wheel");
        return; // 쪽이 그대로 내려간다
      }
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      const d = Math.max(-300, Math.min(300, e.deltaY * unit));
      // 트랙패드 핀치(ctrlKey)는 잘게 오므로 더 민감하게
      board.zoomAt(e.clientX, e.clientY, Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0022)));
      view();
    },
    { passive: false },
  );

  // 사파리의 트랙패드 핀치
  let gscale = 1;
  canvas.addEventListener("gesturestart", (e) => {
    e.preventDefault();
    gscale = 1;
  });
  canvas.addEventListener("gesturechange", (e) => {
    e.preventDefault();
    board.zoomAt(e.clientX, e.clientY, e.scale / gscale);
    gscale = e.scale;
    view();
  });
}
