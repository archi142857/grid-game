// 무늬 모음(web/data/patterns, 엔진): 목록 index.json([{ id, rule }])과 무늬마다 <id>.rle 를 한 번 불러 둔다.
// 무늬 이름·설명은 data/catalog.js 의 patternOf(id)(문구). rule 은 RLE 머리 줄 글 그대로라 rleRuleOf(지금 규칙)과 견준다.

let cache = null;

async function getText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.text();
}

/** [{ id, rule, text }] 를 돌려준다(못 읽은 무늬는 뺀다) */
export function loadPatterns() {
  if (!cache) {
    cache = (async () => {
      const list = JSON.parse(await getText("data/patterns/index.json"));
      const texts = await Promise.all(list.map((p) => getText(`data/patterns/${p.id}.rle`).catch(() => null)));
      return list.map((p, i) => ({ id: p.id, rule: p.rule, text: texts[i] })).filter((p) => p.text);
    })();
    cache.catch(() => (cache = null));
  }
  return cache;
}
