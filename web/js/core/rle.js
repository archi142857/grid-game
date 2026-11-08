// RLE: LifeWiki·Golly 가 쓰는 무늬 글.
//   x = 3, y = 3, rule = B3/S23
//   bo$2bo$3o!
// b(또는 .)는 0, o 는 1. 상태가 여럿이면 A–X 가 1–24, 그 위는 Golly 처럼 두 글자(pA–pX 25–48, qA–qX 49–72 … yA–yO 241–255).
// 앞의 숫자는 되풀이 수, $ 는 줄 바꿈, ! 는 끝. # 으로 시작하는 줄은 설명.

export function parseRLE(text) {
  let w = 0;
  let h = 0;
  let rule = null;
  const body = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const head = line.match(/^x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)(?:\s*,\s*rule\s*=\s*(\S+))?/i);
    if (head) {
      w = Number(head[1]);
      h = Number(head[2]);
      rule = head[3] ?? null;
      continue;
    }
    body.push(line);
  }

  const rows = [[]];
  let num = "";
  let prefix = 0; // p–y 를 읽은 뒤 대문자를 기다리는 중이면 24 의 몇 배
  const chars = body.join("");
  for (let k = 0; k < chars.length; k++) {
    const ch = chars[k];
    if (ch >= "0" && ch <= "9") {
      num += ch;
      continue;
    }
    if (ch >= "p" && ch <= "y" && chars[k + 1] >= "A" && chars[k + 1] <= "X") {
      prefix = ch.charCodeAt(0) - 111; // p → 1
      continue;
    }
    const n = num ? Number(num) : 1;
    num = "";
    if (ch === "!") break;
    if (ch === "$") {
      for (let i = 0; i < n; i++) rows.push([]);
      continue;
    }
    let s;
    if (ch === "b" || ch === ".") s = 0;
    else if (ch >= "A" && ch <= "X") s = prefix * 24 + ch.charCodeAt(0) - 64;
    else if (ch >= "a" && ch <= "z")
      s = 1; // o 와 그 밖의 소문자는 산 칸으로 본다
    else continue;
    prefix = 0;
    const row = rows[rows.length - 1];
    for (let i = 0; i < n; i++) row.push(s);
  }
  while (rows.length > 1 && rows[rows.length - 1].length === 0) rows.pop();
  return {
    w: Math.max(w, ...rows.map((r) => r.length)),
    h: Math.max(h, rows.length),
    rule,
    rows,
  };
}

/** 상태 s 를 RLE 글자로. multi 가 아니면 b·o */
function symbol(s, multi) {
  if (!multi) return s ? "o" : "b";
  if (s === 0) return ".";
  if (s <= 24) return String.fromCharCode(64 + s);
  const k = s - 25;
  return String.fromCharCode(112 + Math.floor(k / 24)) + String.fromCharCode(65 + (k % 24));
}

/**
 * 무늬(줄마다 상태 배열)를 RLE 글로. 줄 끝의 빈칸은 적지 않고, 한 줄은 70자를 넘지 않는다.
 *   rule: 머리 줄의 rule(없으면 뺀다) · states: 상태 수(3 이상이면 . 과 A–X 글자) · name: #N 줄
 */
export function formatRLE(rows, { rule = null, states = 2, name = null } = {}) {
  const multi = states > 2;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const tokens = [];
  let breaks = 0;
  rows.forEach((row, y) => {
    let end = row.length;
    while (end > 0 && !row[end - 1]) end--;
    if (y > 0) breaks++;
    if (!end) return;
    if (breaks) tokens.push(`${breaks > 1 ? breaks : ""}$`);
    breaks = 0;
    for (let i = 0; i < end; ) {
      let j = i;
      while (j < end && row[j] === row[i]) j++;
      tokens.push(`${j - i > 1 ? j - i : ""}${symbol(row[i], multi)}`);
      i = j;
    }
  });
  tokens.push("!");
  const lines = [];
  let line = "";
  for (const tk of tokens) {
    if (line.length + tk.length > 70) {
      lines.push(line);
      line = "";
    }
    line += tk;
  }
  lines.push(line);
  const head = `x = ${w}, y = ${rows.length}${rule ? `, rule = ${rule}` : ""}`;
  return [...(name ? [`#N ${name}`] : []), head, ...lines].join("\n") + "\n";
}

/** src(get 이 있는 것, 곧 sim)의 네모 b(양 끝 포함, 기본은 src.bounds())를 줄마다 상태 배열로 읽는다. 비었으면 [] */
export function readRows(src, b = src.bounds()) {
  if (!b) return [];
  const rows = [];
  for (let y = b.y0; y <= b.y1; y++) {
    const row = new Array(b.x1 - b.x0 + 1);
    for (let x = b.x0; x <= b.x1; x++) row[x - b.x0] = src.get(x, y);
    rows.push(row);
  }
  return rows;
}
