/* 어디군 — 정답 고르기와 거리 계산. 서버와 테스트가 같이 쓴다 */
import UNITS from '../../data/units.json' with { type: 'json' };

export { UNITS };
export const N = UNITS.length;
export const INDEX = new Map(UNITS.map((u, i) => [u.id, i]));

/* 한국 날짜 번호. 자정(KST)에 다음 문제로 넘어간다 */
export const kstDay = (ms = Date.now()) => Math.floor((ms + 9 * 3600e3) / 86400e3);
/* 1번 문제 = 2026-09-11 (KST) */
export const EPOCH = kstDay(Date.UTC(2026, 8, 10, 15));
export const puzzleNo = day => day - EPOCH + 1;

function hash(str) {                       // xmur3
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 167일에 한 바퀴. 한 바퀴 안에서는 같은 칸이 두 번 나오지 않는다 */
const orders = new Map();
export function answerIndex(day, salt) {
  const k = day - EPOCH;
  const cycle = Math.floor(k / N), pos = ((k % N) + N) % N;
  const key = salt + ':' + cycle;
  let order = orders.get(key);
  if (!order) {
    const rnd = mulberry32(hash(key));
    order = UNITS.map((_, i) => i);
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    orders.set(key, order);
  }
  return order[pos];
}

/* 청사 사이 대원거리 (km) */
export function km(a, b) {
  const R = 6371.0088, rad = Math.PI / 180;
  const p = UNITS[a], q = UNITS[b];
  const dLat = (q.lat - p.lat) * rad, dLng = (q.lng - p.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* 정답에서 가까운 순서. 정답 자신은 0, 가장 가까운 칸이 1 */
const rankCache = new Map();
export function ranks(ans) {
  let r = rankCache.get(ans);
  if (!r) {
    const order = UNITS.map((_, i) => i).filter(i => i !== ans)
      .sort((a, b) => km(ans, a) - km(ans, b));
    r = new Int16Array(N);
    order.forEach((i, k) => { r[i] = k + 1; });
    rankCache.set(ans, r);
  }
  return r;
}

export function judge(ans, guess) {
  return { id: UNITS[guess].id, km: Math.round(km(ans, guess) * 10) / 10, rank: ranks(ans)[guess], correct: ans === guess };
}
