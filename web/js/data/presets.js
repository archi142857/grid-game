// 도감 규칙 파일을 불러온다. data/rules/index.json 의 차례대로, 검사를 거친 규칙만.

import { checkRuleFile } from "../core/rules.js";

let cache = null;

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

export function loadPresets() {
  if (!cache) {
    cache = (async () => {
      const ids = await getJson("data/rules/index.json");
      const files = await Promise.all(ids.map((id) => getJson(`data/rules/${id}.json`)));
      const rules = files.map((f) => checkRuleFile(f).rule).filter(Boolean);
      if (!rules.length) throw new Error("no rules");
      return rules;
    })();
    cache.catch(() => (cache = null));
  }
  return cache;
}
