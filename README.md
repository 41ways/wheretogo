# 행선지

정답에 가까운 순서로 매긴 점수(100점 만점)만 보고 오늘의 시·군을 맞히는 하루 한 문제 게임. 제일 빨리 맞힌 사람이 1등.

**하기 → https://41ways.github.io/wheretogo/**

- 매일 자정(KST)에 전국 시·군 165곳 중 하나가 정답
- 한 곳을 부르면 그곳 청사가 정답에서 **몇 번째로 가까운지**와, 그 순서로 매긴 **100점 만점 점수**를 알려 줌
- 점수는 정답이 100.00점, 그 밖은 한 계단마다 0.60점씩 (`score()` 의 `STEP`) — 2번째면 98.80점
- **거리(km)는 브라우저에 아예 안 나간다.** 거리를 주면 추측 세 번으로 원 세 개를 그려 정답이 특정된다 (삼변측량). 점수가 순서만 담으면 역산해도 이미 보여 준 순위뿐이다
- **울릉군(독도 포함)과 옹진군은 뺐다** (`build.py` 의 `DROP`) — 울릉군은 뭍에서 가장 가까운 울진군까지 144km 로, 두 번째로 외딴 울진군(41km)의 3.5배라 가까운 순서가 뜻을 잃는다. 옹진군은 군청이 관할 밖(인천 미추홀구)에 있어 순위와 지도가 어긋나는 유일한 칸이었다
- **하루 한 판.** 맞히거나 포기하면 그날은 타이틀에서 멈춘다
- **무한 모드**는 몇 판이든 할 수 있다. 서버가 판마다 무작위 표(`rid`)를 내주고 정답은 `ANSWER_SALT` 로 그 표를 섞어 되찾으므로, 표만 봐서는 정답을 알 수 없고 기록도 남지 않는다
- **이지 모드**는 무한 모드와 같은 연습 판(기록 없음)에 지도 도움을 켠 것. 지도에 마우스를 올리면 그 칸이 커지며 칠해지고 이름이 나오고, 누르면 바로 부른다 (손가락은 두 번 눌러 부름). 정답은 오늘 문제와 따로 뽑으므로 우연히 같을 수는 있다
- 시계는 첫 추측부터 정답까지 서버가 잼. 순위는 빠른 순, 같으면 적게 부른 순
- 특별·광역시와 세종은 구 없이 한 칸. 광주는 옛 광주광역시 지역(2026.7.1부터 전남광주통합특별시)
- 옹진군을 뺐으므로 강화군은 인천에서 유일하게 남은 군

## 구조

| 경로 | 하는 일 |
|---|---|
| `index.html`, `map.json` | 게임 화면 (GitHub Pages) |
| `data/units.json` | 칸 165곳 이름과 청사 좌표 (서버가 씀) |
| `worker/` | 정답·점수·순위 서버 — Cloudflare Worker `eodigun` + D1 `eodigun` |
| `build/` | 경계·청사 데이터를 만드는 스크립트 |

정답은 서버만 안다. 비밀값 `ANSWER_SALT`로 섞은 순서에서 날짜별로 꺼내므로 코드를 봐도 미리 알 수 없다.

## 서버 고치기

```sh
cd worker
npx wrangler deploy            # 코드 반영 (GitHub 푸시만으로는 안 바뀜)
node test-game.js              # 정답 순서·거리·점수·순위 확인
```

로컬: `.dev.vars`에 `ANSWER_SALT=아무값`을 두고 `npx wrangler d1 execute eodigun --local --file schema.sql` 뒤 `npx wrangler dev --port 8832`. 화면은 localhost에서 열면 알아서 8832를 부른다.

## 데이터 다시 만들기

```sh
cd build
curl -L -o raw/dong.geojson https://raw.githubusercontent.com/vuski/admdongkor/master/ver20260701/HangJeongDong_ver20260701.geojson
python3 units.py                                   # 행정동 → 시·군 칸
npx mapshaper raw/dong-u.geojson -dissolve u -o raw/units-full.geojson
npx mapshaper raw/units-full.geojson -simplify 4% keep-shapes -filter-islands min-area=2km2 -o precision=0.0001 raw/units-simple.geojson
# raw/townhall.json 은 Overpass 에서 amenity=townhall 로 받은 청사 (README 아래 쿼리)
python3 match.py                                   # 청사를 칸에 붙임 (경계 안에 있는 점만)
python3 build.py                                   # data/units.json, map.json
```

OSM에 없거나 이름이 달라 안 잡힌 청사는 `build/halls-manual.json`에 직접 적었다. 옹진군청은 군 밖(인천 미추홀구)에 있어서 그대로 둔다.

Overpass 쿼리:

```
[out:json][timeout:120];area["ISO3166-1"="KR"][admin_level=2]->.a;
nwr["amenity"="townhall"]["name"~"(시청|군청|시 ?청사|군 ?청사)"](area.a);out center tags;
```

## 출처

- 경계: [vuski/admdongkor](https://github.com/vuski/admdongkor) 행정동 경계 2026-07-01판
- 청사 위치: © [OpenStreetMap](https://www.openstreetmap.org/copyright) 기여자 (ODbL)
