// node test-game.js — 정답 순서·거리·점수·순위가 말이 되는지 본다
import { UNITS, N, INDEX, EPOCH, kstDay, puzzleNo, answerIndex, judge, score, ranks, km } from './src/game.js';
const assert = (c, m) => { if (!c) { console.error('실패:', m); process.exit(1); } };
const id = n => { const i = UNITS.findIndex(u => u.full.endsWith(n) || u.name === n); assert(i >= 0, n); return i; };

assert(N === 165, '칸 수 ' + N);
assert(!UNITS.some(u => ['울릉군', '옹진군'].includes(u.name)), '뺀 칸이 아직 있다');
assert(puzzleNo(kstDay(Date.UTC(2026, 8, 10, 15))) === 1, '9/11 이 1번');
assert(puzzleNo(kstDay(Date.UTC(2026, 8, 10, 14, 59))) === 0, '9/11 자정 전은 0번');

// 한 바퀴(165일) 안에 같은 정답이 없어야
const seen = new Set();
for (let d = EPOCH; d < EPOCH + N; d++) seen.add(answerIndex(d, 'salt-a'));
assert(seen.size === N, '한 바퀴 중복');
assert(answerIndex(EPOCH, 'salt-a') !== answerIndex(EPOCH, 'salt-b') || answerIndex(EPOCH + 1, 'salt-a') !== answerIndex(EPOCH + 1, 'salt-b'), '소금이 순서를 바꿔야');

// 거리 감각: 서울-부산 약 325km, 인천-옹진(청사가 미추홀구) 아주 가깝다
const sb = km(id('서울'), id('부산'));
assert(sb > 300 && sb < 340, '서울-부산 ' + sb);
console.log('서울-부산', sb.toFixed(1), 'km / 서울-강화', km(id('서울'), id('강화군')).toFixed(1), 'km / 서울-제주', km(id('서울'), id('제주시')).toFixed(1));

// 순위: 정답 0, 나머지 1..N-1 이 한 번씩
const ans = id('전주시');
const rs = UNITS.map((_, i) => judge(ans, i).rank).sort((a, b) => a - b);
assert(rs.every((r, i) => r === i), '순위가 0..N-1');
const near = UNITS.map((_, i) => judge(ans, i)).sort((a, b) => a.rank - b.rank).slice(0, 5);
console.log('전주 근처', near.map(j => UNITS[INDEX.get(j.id)].name + ' ' + j.score.toFixed(2) + '점').join(', '));

// 점수: 정답 100점, 가까운 순서 한 계단마다 0.6점
const scores = UNITS.map((_, i) => judge(ans, i));
assert(scores[ans].score === 100, '정답이 100점');
assert(UNITS.every((_, a) => judge(a, a).score === 100), '어느 정답이든 100점 만점');
const byRank = scores.slice().sort((a, b) => a.rank - b.rank);
assert(byRank.every((j, i) => i === 0 || j.score < byRank[i - 1].score), '가까울수록 높은 점수');
assert(byRank[1].score === 99.4 && byRank[10].score === 94, '1위 99.40 / 10위 94.00');
assert(scores.every(j => j.score > 0 && j.score <= 100 && Math.abs(j.score * 100 - Math.round(j.score * 100)) < 1e-6), '0~100, 소수 둘째 자리');
/* 점수로 거리를 되짚을 수 없어야 한다 — 같은 점수인데 거리가 딴판인 짝이 있어야 정상 */
const hi = UNITS.map((_, a) => ({ a, d: km(a, UNITS.map((_, i) => i).filter(i => i !== a).sort((x, y) => km(a, x) - km(a, y))[0]) }));
const spread = Math.max(...hi.map(h => h.d)) / Math.min(...hi.map(h => h.d));
assert(spread > 5, '1위 점수(99.40)가 뜻하는 거리 폭이 ' + spread.toFixed(1) + '배뿐 — 역산이 쉬워진다');
console.log('99.40점이 뜻하는 거리', Math.min(...hi.map(h => h.d)).toFixed(1), '~', Math.max(...hi.map(h => h.d)).toFixed(1), 'km');

// 가장 먼 짝
let far = [0, 0, 0];
for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) { const d = km(a, b); if (d > far[2]) far = [a, b, d]; }
console.log('가장 먼 짝', UNITS[far[0]].full, '↔', UNITS[far[1]].full, far[2].toFixed(0), 'km');
console.log('통과');
