/* ══════════════════════════════════════════════════════════════════
   어디군 — 정답·거리·순위 서버

   GET  /api/today?me=<pid>        오늘 문제 번호, 푼 사람 수, 어제 정답, 내 기록
   GET  /api/top?day=&me=<pid>     그날 순위 (위 20명 + 내 자리)
   POST /api/guess                 { day, pid, id, name }  → 거리·순위 (맞히면 기록)
   POST /api/giveup                { day, pid }            → 정답 공개, 순위에서 빠짐
   POST /api/name                  { day, pid, name }      → 순위표 이름 바꾸기

   정답은 여기서만 안다. 브라우저에는 거리와 "가까운 순서"만 돌려준다.
   시간도 서버가 잰다 — 그날 첫 추측을 받은 순간부터 정답을 받은 순간까지.
   ══════════════════════════════════════════════════════════════════ */
import { UNITS, N, INDEX, kstDay, puzzleNo, answerIndex, judge } from './game.js';

const MAX_BODY = 2 * 1024;
const MAX_NAME = 12;
const TOP_N    = 20;
const MAX_GUESSES = N;          // 모든 칸을 다 불러도 이 안에 끝난다

// ══════════════════════════════════ 출처
function allowed(origin, env) {
  if (!origin) return false;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return String(env.ALLOW_ORIGINS || '').split(',').map(s => s.trim()).includes(origin);
}
function headers(origin, env, method) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (method === 'GET') h['Access-Control-Allow-Origin'] = '*';
  else if (allowed(origin, env)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: h });

// ══════════════════════════════════ 값 거르기
function cleanName(s) {
  const t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, MAX_NAME).join('');
}
const pidOk = p => typeof p === 'string' && /^[a-z0-9]{8,32}$/.test(p);
/* 오늘 문제만. 자정 직전에 시작한 판은 넘어가도 끝낼 수 있게 어제 것도 받는다 */
const dayOk = day => Number.isInteger(day) && (day === kstDay() || day === kstDay() - 1);
const unitOut = i => ({ id: UNITS[i].id, name: UNITS[i].name, full: UNITS[i].full });

// ══════════════════════════════════ 순위
/* 빠른 순. 시간이 같으면 적게 부른 사람, 그것도 같으면 먼저 맞힌 사람 */
const ORDER = 'elapsed ASC, guesses ASC, solved_at ASC';
const rowOut = (r, rank, me) => ({ rank, name: r.name || '이름없음', elapsed: r.elapsed, guesses: r.guesses, me: !!me });

async function board(env, day, me) {
  const [list, cnt] = await env.DB.batch([
    env.DB.prepare(`SELECT pid, name, elapsed, guesses, solved_at FROM plays WHERE day = ?1 AND gaveup = 0 AND solved_at IS NOT NULL ORDER BY ${ORDER} LIMIT ?2`).bind(day, TOP_N),
    env.DB.prepare('SELECT COUNT(*) AS c FROM plays WHERE day = ?1 AND gaveup = 0 AND solved_at IS NOT NULL').bind(day),
  ]);
  const rows = list.results.map((r, i) => rowOut(r, i + 1, me && r.pid === me));
  let mine = rows.find(r => r.me) || null;
  if (!mine && me) {
    const r = await env.DB.prepare('SELECT pid, name, elapsed, guesses, solved_at FROM plays WHERE day = ?1 AND pid = ?2 AND gaveup = 0 AND solved_at IS NOT NULL').bind(day, me).first();
    if (r) {
      const a = await env.DB.prepare(
        'SELECT COUNT(*) AS c FROM plays WHERE day = ?1 AND gaveup = 0 AND solved_at IS NOT NULL AND ' +
        '(elapsed < ?2 OR (elapsed = ?2 AND (guesses < ?3 OR (guesses = ?3 AND solved_at < ?4))))'
      ).bind(day, r.elapsed, r.guesses, r.solved_at).first();
      mine = rowOut(r, (a ? a.c : 0) + 1, true);
    }
  }
  return { day, count: cnt.results[0].c, rows, mine };
}

/* 그날 몇 번째로 맞혔나 (포기한 사람 빼고, 맞힌 시각 순) */
async function solveOrder(env, day, at) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS c FROM plays WHERE day = ?1 AND gaveup = 0 AND solved_at IS NOT NULL AND solved_at < ?2').bind(day, at).first();
  return (r ? r.c : 0) + 1;
}

async function myState(env, day, pid, ans) {
  const r = await env.DB.prepare('SELECT started, guesses, list, solved_at, elapsed, gaveup FROM plays WHERE day = ?1 AND pid = ?2').bind(day, pid).first();
  if (!r) return null;
  const ids = r.list ? r.list.split(',') : [];
  const done = r.solved_at != null || r.gaveup === 1;
  return {
    started: r.started, guesses: r.guesses, elapsed: r.elapsed, gaveup: r.gaveup === 1, solved: r.solved_at != null,
    list: ids.filter(id => INDEX.has(id)).map(id => judge(ans, INDEX.get(id))),
    answer: done ? unitOut(ans) : null,
  };
}

// ══════════════════════════════════ 요청
async function readBody(req) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw Object.assign(new Error('너무 큼'), { status: 413 });
  try { return JSON.parse(raw) || {}; } catch (e) { throw Object.assign(new Error('JSON'), { status: 400 }); }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const h = headers(origin, env, req.method === 'GET' ? 'GET' : 'POST');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (!env.ANSWER_SALT) return json({ error: '서버 설정 안 됨 (ANSWER_SALT)' }, 500, h);
    const salt = env.ANSWER_SALT;

    try {
      if (url.pathname === '/api/today' && req.method === 'GET') {
        const day = kstDay();
        const me = url.searchParams.get('me');
        const [solved, players] = await env.DB.batch([
          env.DB.prepare('SELECT COUNT(*) AS c FROM plays WHERE day = ?1 AND gaveup = 0 AND solved_at IS NOT NULL').bind(day),
          env.DB.prepare('SELECT COUNT(*) AS c FROM plays WHERE day = ?1').bind(day),
        ]);
        const y = puzzleNo(day - 1) >= 1 ? { no: puzzleNo(day - 1), ...unitOut(answerIndex(day - 1, salt)) } : null;
        return json({
          day, no: puzzleNo(day), n: N, now: Date.now(),   // 화면 시계를 서버 시계에 맞추려고
          solved: solved.results[0].c, players: players.results[0].c,
          yesterday: y,
          mine: pidOk(me) ? await myState(env, day, me, answerIndex(day, salt)) : null,
        }, 200, h);
      }

      if (url.pathname === '/api/top' && req.method === 'GET') {
        const day = parseInt(url.searchParams.get('day'), 10);
        if (!Number.isInteger(day)) return json({ error: 'day' }, 400, h);
        const me = url.searchParams.get('me');
        return json(await board(env, day, pidOk(me) ? me : null), 200, h);
      }

      if (req.method !== 'POST' || !url.pathname.startsWith('/api/')) {
        if (url.pathname === '/') return new Response('eodigun', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        return json({ error: '없는 길' }, 404, h);
      }

      // ─────────────── 여기부터 POST
      if (!allowed(origin, env)) return json({ error: '허락되지 않은 페이지' }, 403, h);
      const body = await readBody(req);
      const { day, pid } = body;
      if (!dayOk(day)) return json({ error: '오늘 문제가 아님 — 새로고침해 주세요' }, 409, h);
      if (!pidOk(pid)) return json({ error: 'pid' }, 400, h);
      const ans = answerIndex(day, salt);

      if (url.pathname === '/api/guess') {
        const g = INDEX.get(String(body.id));
        if (g == null) return json({ error: '없는 시·군' }, 400, h);
        const now = Date.now();
        const name = cleanName(body.name);
        /* 첫 추측이면 줄을 만들고 시계를 켠다. 끝난 판(맞힘·포기)은 더 세지 않는다 */
        const row = await env.DB.prepare(
          'INSERT INTO plays (day, pid, name, started, guesses, list) VALUES (?1, ?2, ?3, ?4, 1, ?5) ' +
          'ON CONFLICT (day, pid) DO UPDATE SET guesses = guesses + 1, list = list || \',\' || ?5 ' +
          `WHERE solved_at IS NULL AND gaveup = 0 AND guesses < ${MAX_GUESSES} ` +
          'RETURNING started, guesses, solved_at, gaveup'
        ).bind(day, pid, name, now, UNITS[g].id).first();

        const res = { ...judge(ans, g), n: N };
        if (!row) return json({ ...res, closed: true }, 200, h);   // 이미 끝난 판 — 거리만 알려 준다
        res.guesses = row.guesses;

        if (res.correct) {
          const elapsed = now - row.started;
          await env.DB.prepare('UPDATE plays SET solved_at = ?3, elapsed = ?4, name = CASE WHEN ?5 = \'\' THEN name ELSE ?5 END WHERE day = ?1 AND pid = ?2 AND solved_at IS NULL')
            .bind(day, pid, now, elapsed, name).run();
          res.elapsed = elapsed;
          res.answer = unitOut(ans);
          res.order = await solveOrder(env, day, now);
          res.board = await board(env, day, pid);
        }
        return json(res, 200, h);
      }

      if (url.pathname === '/api/giveup') {
        const now = Date.now();
        await env.DB.prepare(
          'INSERT INTO plays (day, pid, started, gaveup) VALUES (?1, ?2, ?3, 1) ' +
          'ON CONFLICT (day, pid) DO UPDATE SET gaveup = 1 WHERE solved_at IS NULL'
        ).bind(day, pid, now).run();
        return json({ answer: unitOut(ans) }, 200, h);
      }

      if (url.pathname === '/api/name') {
        const name = cleanName(body.name);
        await env.DB.prepare('UPDATE plays SET name = ?3 WHERE day = ?1 AND pid = ?2').bind(day, pid, name).run();
        return json(await board(env, day, pid), 200, h);
      }

      return json({ error: '없는 길' }, 404, h);
    } catch (e) {
      if (e.status) return json({ error: e.message }, e.status, h);
      return json({ error: '서버 오류' }, 500, h);
    }
  },
};

export { cleanName };
