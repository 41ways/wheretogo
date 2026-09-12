# data/units.json (서버: 칸 이름·청사 좌표) 과 map.json (화면: 지도 경로·청사 점) 을 만든다.
#   python3 units.py → mapshaper(dissolve, simplify) → python3 match.py → python3 build.py
import json, math
units = json.load(open('raw/units.json'))
osm = json.load(open('halls-osm.json'))
man = json.load(open('halls-manual.json')); man.pop('_')
simple = {f['properties']['u']: f['geometry'] for f in json.load(open('raw/units-simple.geojson'))['features']}
full = {f['properties']['u']: f['geometry'] for f in json.load(open('raw/units-full.geojson'))['features']}

def polys(g):
    return g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]

# 뺀 칸. 울릉군(독도 포함)은 뭍에서 제일 가까운 울진군까지 144km 라 "가까운 순서"가 뜻을 잃고,
# 옹진군은 군청이 관할 밖(인천 미추홀구)에 있어 순위와 지도가 어긋난다
DROP = {'울릉군', '옹진군'}
units = [u for u in units if u['name'] not in DROP]

# 투영: 위도 36° 기준 등장방형. 한반도 남쪽 폭에서는 충분히 반듯하다
LAT0, K = 36.0, 150.0
C = math.cos(math.radians(LAT0))
allpts = [pt for g in simple.values() for p in polys(g) for r in p for pt in r]
LON_MIN = min(x for x, _ in allpts); LAT_MAX = max(y for _, y in allpts)
def xy(lon, lat):
    return ((lon - LON_MIN) * C * K + 10, (LAT_MAX - lat) * K + 10)
W = max(xy(x, y)[0] for x, y in allpts) + 10
H = max(xy(x, y)[1] for x, y in allpts) + 10

def path(g):
    out = []
    for p in polys(g):
        for r in p:
            pts = [xy(*pt) for pt in r]
            s, px, py = '', None, None
            for i, (x, y) in enumerate(pts):
                X, Y = round(x * 10), round(y * 10)          # 0.1 단위 정수 → 상대좌표
                if i == 0: s += 'M%d %d' % (X, Y)
                elif (X, Y) != (px, py): s += 'l%d %d' % (X - px, Y - py)
                px, py = X, Y
            out.append(s + 'z')
    return ''.join(out)

data, mp = [], []
for u in units:
    lat, lng = (man.get(u['id']) or osm[u['id']])[:2]
    data.append({'id': u['id'], 'name': u['name'], 'full': u['full'], 'sido': u['sido'], 'lat': lat, 'lng': lng})
    hx, hy = xy(lng, lat)
    mp.append({'id': u['id'], 'name': u['name'], 'sido': u['sido'], 'full': u['full'], 'd': path(simple[u['id']]), 'hx': round(hx, 1), 'hy': round(hy, 1)})

json.dump(data, open('../data/units.json', 'w'), ensure_ascii=False, indent=1)
json.dump({'w': round(W), 'h': round(H), 'scale': 10, 'units': mp}, open('../map.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(data), 'units', 'viewBox', round(W), round(H))
