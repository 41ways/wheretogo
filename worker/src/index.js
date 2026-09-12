/* ══════════════════════════════════════════════════════════════════
   행선지 — 정답·점수·순위 서버

   GET  /api/today?me=<pid>        오늘 문제 번호, 푼 사람 수, 어제 정답, 내 기록
   GET  /api/top?day=&me=<pid>     그날 순위 (위 20명 + 내 자리)
   GET  /api/all?me=<pid>          전체 순위 — 맞힌 날 수 순, 같으면 평균이 빠른 순
   GET  /api/best?me=<pid>         최고 기록 — 여태 가장 빨리 맞힌 판들
   POST /api/guess                 { day, pid, id, name }  → 점수·순위 (맞히면 기록)
   POST /api/giveup                { day, pid }            → 정답 공개, 순위에서 빠짐
   POST /api/name                  { day, pid, name }      → 순위표 이름 바꾸기
   GET  /api/free                                          무한 연습 새 판 (표 하나)
   POST /api/free/guess            { rid, id }             무한 연습 점수·순위
   POST /api/free/giveup           { rid }                 무한 연습 정답 공개

   정답은 여기서만 안다. 브라우저에 거리는 아예 안 나간다 — "가까운 순서"와 그걸로 매긴 점수뿐.
   시간도 서버가 잰다 — 그날 첫 추측을 받은 순간부터 정답을 받은 순간까지.
   ══════════════════════════════════════════════════════════════════ */
import { UNITS, N, INDEX, kstDay, puzzleNo, answerIndex, judge, freeAnswer } from './game.js';

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

      /* 전체 순위 — 날마다 지워지는 그날 순위와 달리 쌓인 판을 사람(pid)별로 묶는다.
         맞힌 날이 많은 사람이 위, 같으면 평균이 빠른 사람이 위 */
      if (url.pathname === '/api/all' && req.method === 'GET') {
        const me = url.searchParams.get('me');
        const [top, tot] = await env.DB.batch([
          env.DB.prepare(
            'SELECT p.pid AS pid, COUNT(*) AS days, AVG(p.elapsed) AS avg, MIN(p.elapsed) AS best, ' +
            '(SELECT x.name FROM plays x WHERE x.pid = p.pid AND x.solved_at IS NOT NULL ORDER BY x.day DESC LIMIT 1) AS name ' +
            'FROM plays p WHERE p.gaveup = 0 AND p.solved_at IS NOT NULL ' +
            `GROUP BY p.pid ORDER BY days DESC, avg ASC LIMIT ${TOP_N}`),
          env.DB.prepare('SELECT COUNT(DISTINCT pid) AS people, COUNT(*) AS plays FROM plays WHERE gaveup = 0 AND solved_at IS NOT NULL'),
        ]);
        const out = r => ({ name: r.name || '이름없음', days: r.days, avg: Math.round(r.avg), best: r.best });
        const rows = top.results.map((r, i) => ({ rank: i + 1, ...out(r), me: !!(me && r.pid === me) }));
        let mine = rows.find(r => r.me) || null;
        if (!mine && pidOk(me)) {
          const r = await env.DB.prepare(
            'SELECT COUNT(*) AS days, AVG(elapsed) AS avg, MIN(elapsed) AS best, ' +
            '(SELECT x.name FROM plays x WHERE x.pid = ?1 AND x.solved_at IS NOT NULL ORDER BY x.day DESC LIMIT 1) AS name ' +
            'FROM plays WHERE pid = ?1 AND gaveup = 0 AND solved_at IS NOT NULL').bind(me).first();
          if (r && r.days > 0) {
            const a = await env.DB.prepare(
              'SELECT COUNT(*) AS c FROM (SELECT pid, COUNT(*) AS d, AVG(elapsed) AS a FROM plays ' +
              'WHERE gaveup = 0 AND solved_at IS NOT NULL GROUP BY pid) WHERE d > ?1 OR (d = ?1 AND a < ?2)'
            ).bind(r.days, r.avg).first();
            mine = { rank: (a ? a.c : 0) + 1, ...out(r), me: true };
          }
        }
        return json({ rows, mine, people: tot.results[0].people, plays: tot.results[0].plays }, 200, h);
      }

      /* 최고 기록 — 꾸준함으로 줄 세우는 전체 순위에서 밀려나는, 한 판의 가장 빠른 기록 */
      if (url.pathname === '/api/best' && req.method === 'GET') {
        const me = url.searchParams.get('me');
        const r = await env.DB.prepare(
          'SELECT pid, name, day, elapsed, guesses FROM plays ' +
          'WHERE gaveup = 0 AND solved_at IS NOT NULL ORDER BY elapsed ASC, guesses ASC LIMIT 10').all();
        return json({ rows: r.results.map((x, i) => ({
          rank: i + 1, name: x.name || '이름없음', no: puzzleNo(x.day),
          elapsed: x.elapsed, guesses: x.guesses, me: !!(me && x.pid === me),
        })) }, 200, h);
      }

      /* 무한 연습 — 기록을 남기지 않으므로 하루 한 판 제한과 무관하다 */
      if (url.pathname === '/api/free' && req.method === 'GET') {
        const b = new Uint8Array(16);
        crypto.getRandomValues(b);
        const rid = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
        return json({ rid, n: N }, 200, h);
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

      /* 무한 연습은 날짜도 사람도 쓰지 않는다 — 아래 검사보다 먼저 갈라져야 한다 */
      if (url.pathname === '/api/free/guess' || url.pathname === '/api/free/giveup') {
        const rid = String(body.rid || '');
        if (!/^[0-9a-f]{32}$/.test(rid)) return json({ error: 'rid' }, 400, h);
        const fans = freeAnswer(rid, salt);
        if (url.pathname === '/api/free/giveup') return json({ answer: unitOut(fans) }, 200, h);
        const fg = INDEX.get(String(body.id));
        if (fg == null) return json({ error: '없는 시·군' }, 400, h);
        const fres = { ...judge(fans, fg), n: N };
        if (fres.correct) fres.answer = unitOut(fans);
        return json(fres, 200, h);
      }

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
        if (!row) return json({ ...res, closed: true }, 200, h);   // 이미 끝난 판 — 점수만 알려 준다
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
