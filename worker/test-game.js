// node test-game.js — 정답 순서·거리·순위가 말이 되는지 본다
import { UNITS, N, INDEX, EPOCH, kstDay, puzzleNo, answerIndex, judge, km } from './src/game.js';
const assert = (c, m) => { if (!c) { console.error('실패:', m); process.exit(1); } };
const id = n => { const i = UNITS.findIndex(u => u.full.endsWith(n) || u.name === n); assert(i >= 0, n); return i; };

assert(N === 167, '칸 수 ' + N);
assert(puzzleNo(kstDay(Date.UTC(2026, 8, 10, 15))) === 1, '9/11 이 1번');
assert(puzzleNo(kstDay(Date.UTC(2026, 8, 10, 14, 59))) === 0, '9/11 자정 전은 0번');

// 한 바퀴(167일) 안에 같은 정답이 없어야
const seen = new Set();
for (let d = EPOCH; d < EPOCH + N; d++) seen.add(answerIndex(d, 'salt-a'));
assert(seen.size === N, '한 바퀴 중복');
assert(answerIndex(EPOCH, 'salt-a') !== answerIndex(EPOCH, 'salt-b') || answerIndex(EPOCH + 1, 'salt-a') !== answerIndex(EPOCH + 1, 'salt-b'), '소금이 순서를 바꿔야');

// 거리 감각: 서울-부산 약 325km, 인천-옹진(청사가 미추홀구) 아주 가깝다
const sb = km(id('서울'), id('부산'));
assert(sb > 300 && sb < 340, '서울-부산 ' + sb);
console.log('서울-부산', sb.toFixed(1), 'km / 인천-옹진', km(id('인천'), id('옹진군')).toFixed(1), 'km / 서울-제주', km(id('서울'), id('제주시')).toFixed(1));

// 순위: 정답 0, 나머지 1..N-1 이 한 번씩
const ans = id('전주시');
const rs = UNITS.map((_, i) => judge(ans, i).rank).sort((a, b) => a - b);
assert(rs.every((r, i) => r === i), '순위가 0..N-1');
const near = UNITS.map((_, i) => judge(ans, i)).sort((a, b) => a.rank - b.rank).slice(0, 5);
console.log('전주 근처', near.map(j => UNITS[INDEX.get(j.id)].name + ' ' + j.km + 'km').join(', '));

// 가장 먼 짝
let far = [0, 0, 0];
for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) { const d = km(a, b); if (d > far[2]) far = [a, b, d]; }
console.log('가장 먼 짝', UNITS[far[0]].full, '↔', UNITS[far[1]].full, far[2].toFixed(0), 'km');
console.log('통과');
