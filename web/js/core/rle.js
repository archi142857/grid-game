// RLE: LifeWiki·Golly 가 쓰는 무늬 글.
//   x = 3, y = 3, rule = B3/S23
//   bo$2bo$3o!
// b(또는 .)는 0, o 는 1, A–X 는 1–24(여러 상태). 앞의 숫자는 되풀이 수, $ 는 줄 바꿈, ! 는 끝. # 으로 시작하는 줄은 설명.

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
  for (const ch of body.join("")) {
    if (ch >= "0" && ch <= "9") {
      num += ch;
      continue;
    }
    const n = num ? Number(num) : 1;
    num = "";
    if (ch === "!") break;
    if (ch === "$") {
      for (let k = 0; k < n; k++) rows.push([]);
      continue;
    }
    let s;
    if (ch === "b" || ch === ".") s = 0;
    else if (ch >= "A" && ch <= "X") s = ch.charCodeAt(0) - 64;
    else if (ch >= "a" && ch <= "z")
      s = 1; // o 와 그 밖의 소문자는 산 칸으로 본다
    else continue;
    const row = rows[rows.length - 1];
    for (let k = 0; k < n; k++) row.push(s);
  }
  while (rows.length > 1 && rows[rows.length - 1].length === 0) rows.pop();
  return {
    w: Math.max(w, ...rows.map((r) => r.length)),
    h: Math.max(h, rows.length),
    rule,
    rows,
  };
}
