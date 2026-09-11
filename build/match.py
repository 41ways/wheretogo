# 청사 좌표를 칸에 붙인다. OSM 이름이 "<칸 이름>청"으로 시작하고 그 칸 경계 안에 있는 점만 쓴다.
import json, re, sys
units = json.load(open('raw/units.json'))
geo = {f['properties']['u']: f['geometry'] for f in json.load(open('raw/units-full.geojson'))['features']}
extra = json.load(open('raw/townhall-extra.json'))['elements'] if len(sys.argv) > 1 else []
els = json.load(open('raw/townhall.json'))['elements'] + extra

def rings(g):
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    for p in polys:
        yield p
def inside(g, x, y):
    for poly in rings(g):
        hit = False
        for ring in poly:
            j = len(ring) - 1
            for i in range(len(ring)):
                xi, yi = ring[i]; xj, yj = ring[j]
                if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                    hit = not hit
                j = i
        if hit: return True
    return False

def hall_names(u):
    if u['id'] in ('seoul','busan','daegu','incheon','daejeon','ulsan','sejong'):
        return [u['full'] + '청']
    if u['id'] == 'gwangju': return ['광주광역시청']
    return [u['name'] + '청']

BAD = re.compile(r'별관|민원|제2|제 2|신관|의회|임시|봉서홀|여서')
out, missing = {}, []
for u in units:
    cands = []
    for e in els:
        n = e['tags'].get('name', '').replace(' ', '')
        c = e.get('center', e)
        for h in hall_names(u):
            if n.startswith(h) and inside(geo[u['id']], c['lon'], c['lat']):
                cands.append((1 if BAD.search(n) else 0, n, c['lat'], c['lon']))
    if cands:
        cands.sort()
        out[u['id']] = cands[0]
    else:
        missing.append(u)
json.dump({k: [round(v[2], 5), round(v[3], 5), v[1]] for k, v in out.items()}, open('halls-osm.json', 'w'), ensure_ascii=False, indent=0)
print('붙음', len(out), '빠짐', len(missing))
print(' '.join(hall_names(u)[0] for u in missing))
