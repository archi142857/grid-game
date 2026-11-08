// 코드 규칙의 표를 만드는 Worker. 사용자가 쓴 함수는 여기서만 부른다(화면 쪽에서는 부르지 않는다).
//   const w = new Worker(new URL("../core/code-worker.js", import.meta.url), { type: "module" });
//   w.postMessage({ id, source, states });
//   w.onmessage = (e) => e.data  // { id, ok: true, table, locked } 또는 { id, ok: false, error: { kind, state?, counts?, value?, message? } }
// 시간 제한(약 2초)은 띄운 쪽이 건다: 답이 늦으면 terminate() 하고 새로 띄운다.

import { runCodeJob } from "./code.js";

self.onmessage = (e) => {
  const res = runCodeJob(e.data ?? {});
  self.postMessage(res, res.ok ? [res.table.buffer] : []);
};
