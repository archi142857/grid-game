"""검수 스크립트가 같이 쓰는 작은 기준 구현: RLE 읽기, 생명 게임 계열(Generations 포함), 조건표.

사이트 코드(web/js)는 가져다 쓰지 않는다. 같은 답이 나오는지 따로 셈해서 견주려고 둔다.
"""

import re

NEIGH = [(dx, dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dx or dy]


def parse_rle(text):
    """RLE → {(x, y): 상태}. . 과 b 는 0, A–X 는 1–24, o 와 다른 소문자는 1. 숫자는 되풀이, $ 는 줄 바꿈, ! 는 끝.
    # 줄과 'x = …' 머리 줄은 건너뛴다(두 글자 상태 pA… 는 아직 안 씀)"""
    body = "".join(l.strip() for l in text.splitlines() if l.strip() and not l.lstrip().startswith("#") and not re.match(r"^\s*x\s*=", l))
    rows, row, num = [], [], ""
    for ch in body:
        if ch.isdigit():
            num += ch
            continue
        n = int(num) if num else 1
        num = ""
        if ch == "!":
            break
        if ch == "$":
            rows.append(row)
            rows.extend([] for _ in range(n - 1))
            row = []
            continue
        s = 0 if ch in ".b" else ord(ch) - 64 if "A" <= ch <= "X" else 1 if "a" <= ch <= "z" else None
        if s is None:
            continue
        row.extend([s] * n)
    rows.append(row)
    return {(x, y): s for y, r in enumerate(rows) for x, s in enumerate(r) if s}


def rle_rule(text):
    m = re.search(r"rule\s*=\s*(\S+)", text)
    return m.group(1) if m else None


class RefLife:
    """B…/S…(/Cn) 규칙. 상태 1 이 산 칸, 2 … n-1 은 사라지는 중(이웃으로 안 세고, 태어날 수도 없다)"""

    def __init__(self, code, cells):
        m = re.fullmatch(r"B(\d*)/S(\d*)(?:/C(\d+))?", code)
        if not m:
            raise ValueError(code)
        self.b, self.s = {int(c) for c in m[1]}, {int(c) for c in m[2]}
        self.c = int(m[3] or 2)
        self.cells, self.gen = dict(cells), 0

    def step(self, n=1):
        for _ in range(n):
            nb = {}
            for (x, y), v in self.cells.items():
                if v == 1:
                    for dx, dy in NEIGH:
                        q = (x + dx, y + dy)
                        nb[q] = nb.get(q, 0) + 1
            new = {}
            for q, v in self.cells.items():
                if v == 1:
                    if nb.get(q, 0) in self.s:
                        new[q] = 1
                    elif self.c > 2:
                        new[q] = 2
                elif v + 1 < self.c:
                    new[q] = v + 1
            for q, k in nb.items():
                if q not in self.cells and k in self.b:
                    new[q] = 1
            self.cells = new
            self.gen += 1
        return self.count(1)

    def count(self, s):
        return sum(1 for v in self.cells.values() if v == s)


class RefTable:
    """조건표: 줄을 위에서부터 보고 처음 맞는 줄(지금 상태, 무어 이웃 8칸 가운데 셀 상태인 칸 수)대로, 없으면 그대로"""

    def __init__(self, transitions, cells):
        self.trs, self.cells, self.gen = transitions, dict(cells), 0

    def next_of(self, s, cnt):
        for tr in self.trs:
            if tr["from"] != s:
                continue
            w = tr.get("when")
            if w and cnt.get(w["state"], 0) not in w["count"]:
                continue
            return tr["to"]
        return s

    def step(self, n=1):
        for _ in range(n):
            cand = {(x + dx, y + dy) for (x, y) in self.cells for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
            new = {}
            for x, y in cand:
                cnt = {}
                for dx, dy in NEIGH:
                    v = self.cells.get((x + dx, y + dy), 0)
                    if v:
                        cnt[v] = cnt.get(v, 0) + 1
                t = self.next_of(self.cells.get((x, y), 0), cnt)
                if t:
                    new[(x, y)] = t
            self.cells = new
            self.gen += 1
        return self.count(1)

    def count(self, s):
        return sum(1 for v in self.cells.values() if v == s)


WIREWORLD = [{"from": 1, "to": 2}, {"from": 2, "to": 3}, {"from": 3, "to": 1, "when": {"state": 1, "count": [1, 2]}}]
