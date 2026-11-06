"""web/ 을 배포용 폴더로 옮기면서 스크립트·스타일 주소에 판(?v=)을 붙인다.

    python scripts/stamp.py web _site

GitHub Pages 는 파일을 몇 분씩 캐시한다. 판을 붙이면 배포 직후 새로고침해도
옛 스크립트와 새 스크립트가 섞이지 않는다. 판은 web/ 의 모든 파일 내용으로 만든
해시 하나라서, 어느 파일이 바뀌든 모든 주소가 같이 바뀐다(모듈 하나가 서로 다른
주소로 두 번 불리는 일도 없다).

표준 라이브러리만 쓴다. web/ 원본은 고치지 않는다.
"""

import hashlib
import re
import shutil
import sys
from pathlib import Path

# import ... from "./x.js", import "./x.js", import("./x.js"), export ... from "./x.js"
JS_SPEC = re.compile(r"""(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{1,2}/[^"'?#]+?\.js)\2""")
# <script src="js/app.js">, <link href="style.css">
HTML_REF = re.compile(r"""(\b(?:src|href)=)(["'])(?![a-z]+:|//|#)([^"'?#]+?\.(?:js|css))\2""")


def site_hash(root: Path) -> str:
    h = hashlib.sha256()
    for p in sorted(root.rglob("*")):
        if p.is_file():
            h.update(p.relative_to(root).as_posix().encode())
            h.update(b"\0")
            h.update(p.read_bytes())
    return h.hexdigest()[:10]


def stamp_text(text: str, pattern: re.Pattern, version: str) -> tuple[str, int]:
    def put(m: re.Match) -> str:
        return f"{m.group(1)}{m.group(2)}{m.group(3)}?v={version}{m.group(2)}"

    return pattern.subn(put, text)


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2
    src, dst = Path(argv[1]), Path(argv[2])
    if not (src / "index.html").is_file():
        print(f"{src}/index.html 이 없다", file=sys.stderr)
        return 1
    if dst.resolve() == src.resolve():
        print("원본과 다른 폴더로 내보낸다", file=sys.stderr)
        return 1
    version = site_hash(src)
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)

    count = 0
    for p in dst.rglob("*"):
        if p.suffix == ".html":
            pattern = HTML_REF
        elif p.suffix == ".js":
            pattern = JS_SPEC
        else:
            continue
        text = p.read_text(encoding="utf-8")
        new, n = stamp_text(text, pattern, version)
        if n:
            p.write_text(new, encoding="utf-8")
            count += n
    print(f"{dst}: 판 {version}, 주소 {count}곳")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
