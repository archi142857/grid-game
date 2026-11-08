# 검수 스크립트

검수 세션이 사이트를 브라우저로 확인할 때 쓴다. Playwright(파이썬)로 크롬을 띄워 PC·폰 크기에서 화면을 캡처하고, 마우스·키보드·손가락으로 해 본다. 배포(`web/`)에는 들어가지 않고 `node --test` 와도 상관없다.

## 준비

```
pip install playwright numpy pillow
python3 -m playwright install chromium   # 크롬이 따로 없을 때만
```

크롬은 `GRID_QA_CHROME` → `/usr/bin/google-chrome` → Playwright 크로미움 순으로 찾는다.

## 돌리기

주소를 안 주면 사이트(https://archi142857.github.io/grid-game/)를 본다. 올리기 전의 `web/` 은 로컬 서버로 띄워 그 주소를 준다.

```
python3 -m http.server 8000 -d web        # 다른 터미널에서
python3 scripts/qa/survey.py  http://localhost:8000/   # 화면마다 캡처, 넘침·잘림·겹침·콘솔 오류, 동작 줄이기
python3 scripts/qa/pc.py      http://localhost:8000/ --vp pc1024   # 마우스·키보드 (pc1440 이 기본)
python3 scripts/qa/phone.py   http://localhost:8000/ [--nofs]      # 손가락. --nofs 는 아이폰처럼 전체 화면 API 없이
python3 scripts/qa/regress.py http://localhost:8000/   # 쪽지로 보낸 버그 다시 보기. 고쳐지면 PASS
python3 scripts/qa/life.py    http://localhost:8000/   # Life 가 그대로인지(엔진을 바꾸기 전후에)
```

`life.py` 는 무늬 카드를 놓고 → 로 넘겨 산 칸 수를 `life_baseline.json` 과 견준다. 기준값은 11/8 사이트에서 저장했고 작은 파이썬 시뮬레이터로 따로 셈해 맞춰 봤다. 엔진(`world.js`·`sim.js`)을 바꾸는 세션은 올리기 전에 로컬 `web/` 에 돌려 보면 된다. 무늬 카드가 바뀌면 `--save` 로 기준값을 새로 쓴다.

결과(캡처, `<이름>.json`)는 `--out` 폴더(기본은 임시 폴더의 `grid-qa`)에 쌓인다. 실패가 하나라도 있으면 1 로 끝난다.

| 파일 | 하는 일 |
|---|---|
| `common.py` | 브라우저·화면 크기(PC 1440×900·1024×700, 폰 390×844), 콘솔 기록, 판 읽기, 터치 흉내, 겉모습 검사 |
| `survey.py` | 화면 7개 × 크기 3 × 밝은·어두운 캡처와 겉모습 검사 |
| `pc.py` | 첫 화면·규칙 화면·만들기를 마우스와 키보드로 |
| `phone.py` | 첫 화면·규칙 화면을 손가락으로(쓸기, 핀치, 그리기, 전체 화면) |
| `regress.py` | 검수가 보낸 버그 쪽지를 다시 확인, 고친 뒤 생길 수 있는 것, 화면마다 글씨 대비 |
| `life.py`, `life_baseline.json` | 알려진 답(R-펜토미노 1103세대 116칸, 글라이더 총)과 무늬 카드마다의 산 칸 수 기준값 |
