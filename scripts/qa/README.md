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
python3 scripts/qa/ant.py     http://localhost:8000/   # 개미·터마이트: 칠한 칸 수를 기준 구현과 견주고 개미 화면을 해 본다
python3 scripts/qa/elementary.py http://localhost:8000/  # 1차원(규칙 0–255): 켜진 칸 수를 기준 구현과 견주고 1차원 화면을 해 본다
python3 scripts/qa/table.py   http://localhost:8000/   # 조건표(와이어월드): 전자 머리 수를 기준 구현과 견주고 줄 고치기·칠할 상태를 해 본다
python3 scripts/qa/patterns.py http://localhost:8000/  # 무늬 고르기·RLE 붙여 넣기·파일·내려받기
python3 scripts/qa/english.py http://localhost:8000/   # 영어판: 남은 한글, 언어 단추·남겨 둔 언어, 영어일 때 겉모습
```

```
python3 scripts/qa/pixels.py  앞_주소 뒤_주소          # 두 판의 격자 그림을 같은 장면에서 픽셀로 견주기(board 를 바꿀 때)
python3 scripts/qa/perf.py    [주소] [--quick] [--only CPU] [--ant]   # 큰 판에서 한 장 그리는 시간(WebGL 판단), --ant 는 개미 빠르게
```

앞 판은 `git worktree add /tmp/old <커밋>` 으로 꺼내 다른 포트에 띄우면 된다.

`life.py` 는 무늬 카드를 놓고 → 로 넘겨 산 칸 수를 `life_baseline.json` 과 견준다. 기준값은 11/8 사이트에서 저장했고 작은 파이썬 시뮬레이터로 따로 셈해 맞춰 봤다. 엔진(`world.js`·`sim.js`)을 바꾸는 세션은 올리기 전에 로컬 `web/` 에 돌려 보면 된다. 무늬 카드가 바뀌면 `--save` 로 기준값을 새로 쓴다.

결과(캡처, `<이름>.json`)는 `--out` 폴더(기본은 임시 폴더의 `grid-qa`)에 쌓인다. 실패가 하나라도 있으면 1 로 끝난다.

| 파일 | 하는 일 |
|---|---|
| `common.py` | 브라우저·화면 크기(PC 1440×900·1024×700, 폰 390×844), 콘솔 기록, 판 읽기, 터치 흉내, 겉모습 검사 |
| `survey.py` | 화면 14개(Life·개미·터마이트·1차원·와이어월드 규칙 화면, 만들기 네 계열 포함) × 크기 3 × 밝은·어두운 캡처와 겉모습 검사, 동작 줄이기 |
| `pc.py` | 첫 화면·규칙 화면·만들기를 마우스와 키보드로 |
| `phone.py` | 첫 화면·규칙 화면을 손가락으로(쓸기, 핀치, 그리기, 전체 화면) |
| `regress.py` | 검수가 보낸 버그 쪽지를 다시 확인, 고친 뒤 생길 수 있는 것, 화면마다 글씨 대비 |
| `life.py`, `life_baseline.json` | 알려진 답(R-펜토미노 1103세대 116칸, 글라이더 총)과 무늬 카드마다의 산 칸 수 기준값 |
| `ant.py` | 개미·터마이트: → 로 넘긴 칠한 칸 수와 빠르게 돌린 뒤의 칸 수를 파이썬 기준 구현과 견줌, 개미 손·회전 글자·표기·계열 고르기·터마이트 표·키·빠르기·첫 화면 도감 묶음·폰 손가락 |
| `refs.py` | 기준 구현: RLE 읽기(여러 상태), 생명 게임 계열(Generations 포함), 조건표. 사이트 코드는 안 쓴다 |
| `elementary.py` | 1차원: 규칙 30·90·110 켜진 칸 수를 기준 구현과(규칙 90 은 2^(1 개수)로 기준부터 확인), 표기·무늬 8개 단추·잠금, 지금 줄만 톡, 살펴보기, 키·빠르기 |
| `table.py` | 조건표: 만들기·도감 와이어월드 전자 머리 수, 상태 단추·'늘'·셀 상태·이웃 수·줄 더하기·지우기, 막는 줄(빈칸·셋째 세는 상태), 고친 줄로 다시 기준과 견줌, 칠할 상태(조건표·브라이언의 뇌·스타워즈·LLRR), 그리기, 살펴보기, 상태 수, 규칙 파일, 키·빠르기, 폰 |
| `patterns.py` | 무늬: 규칙마다 맞는 무늬 단추, 놓으면 0세대·멈춤이고 기준 구현처럼 자람, 붙여 넣기(규칙 바뀜·못 놓는 까닭), RLE 파일, RLE 내려받기(다시 읽으면 같음) |
| `english.py` | 영어판: 화면마다 글·aria-label·title 에 남은 한글(더 보기·말풍선·안내 글까지), 언어 단추(쪽 위치 그대로)·새로 고침·?lang=ko, PC·폰 겉모습 |
| `pixels.py` | 두 판의 격자 그림 견주기: 점·네모·픽셀·모두 보이게, 세대가 넘어가는 중간 그림(시계를 멈춰서)까지 |
| `perf.py` | 전체 화면·칸 1/2/10px·약 100만 칸에서 끌기(그리기만)와 빠르게 돌기의 한 장 시간. PC dpr 1·2, 폰 dpr 3(CPU 4배 느리게도) |
