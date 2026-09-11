# 행정동 경계(vuski/admdongkor)의 시군구를 게임 칸(시·군)으로 묶는다.
#  - 특별·광역시와 세종은 구를 합쳐 한 칸 (소속 군은 따로)
#  - 전남광주통합특별시의 5개 구 = 옛 광주광역시 → "광주" 한 칸
#  - 도의 일반구(수원시장안구 …)는 시로 합친다
import json, re

METRO = {'서울특별시': ('seoul', '서울', '서울특별시'), '부산광역시': ('busan', '부산', '부산광역시'),
         '대구광역시': ('daegu', '대구', '대구광역시'), '인천광역시': ('incheon', '인천', '인천광역시'),
         '대전광역시': ('daejeon', '대전', '대전광역시'), '울산광역시': ('ulsan', '울산', '울산광역시'),
         '세종특별자치시': ('sejong', '세종', '세종특별자치시')}
SIDO_SHORT = {'경기도': '경기', '강원특별자치도': '강원', '충청북도': '충북', '충청남도': '충남',
              '전북특별자치도': '전북', '전남광주통합특별시': '전남광주', '경상북도': '경북',
              '경상남도': '경남', '제주특별자치도': '제주', '부산광역시': '부산', '대구광역시': '대구',
              '인천광역시': '인천', '울산광역시': '울산'}

def unit_of(p):
    sido, sgg, name = p['sidonm'], p['sgg'], p['sggnm']
    if sido in METRO and not name.endswith('군'):
        uid, short, full = METRO[sido]
        return uid, short, full, ''
    if sido == '전남광주통합특별시' and name.endswith('구'):
        return 'gwangju', '광주', '광주 (옛 광주광역시)', '전남광주'
    m = re.match(r'^(.+?시)(.+구)$', name)
    city = m.group(1) if m else name
    code = sgg[:4] if m else sgg
    return code, city, SIDO_SHORT[sido] + ' ' + city, SIDO_SHORT[sido]

if __name__ == '__main__':
    d = json.load(open('raw/dong.geojson'))
    units = {}
    for f in d['features']:
        uid, short, full, sido = unit_of(f['properties'])
        f['properties'] = {'u': uid}
        units.setdefault(uid, {'id': uid, 'name': short, 'full': full, 'sido': sido})
    json.dump(d, open('raw/dong-u.geojson', 'w'), ensure_ascii=False)
    json.dump(list(units.values()), open('raw/units.json', 'w'), ensure_ascii=False, indent=0)
    import collections
    print(len(units), collections.Counter(u['sido'] for u in units.values()))
    names = collections.Counter(u['name'] for u in units.values())
    print('겹치는 이름', [n for n, c in names.items() if c > 1])
