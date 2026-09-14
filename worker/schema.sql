-- 행선지 하루 기록. 한 사람(pid)은 하루에 한 줄.
-- 시계는 서버가 잰다: 그날 첫 추측을 받은 순간(started)부터 정답을 받은 순간(solved_at)까지.
CREATE TABLE IF NOT EXISTS plays (
  day       INTEGER NOT NULL,   -- 한국 날짜 번호 (KST 기준 1970-01-01 부터 며칠)
  pid       TEXT    NOT NULL,   -- 브라우저가 만든 무작위 아이디. 이름은 아니다
  name      TEXT    NOT NULL DEFAULT '',
  started   INTEGER NOT NULL,   -- 첫 추측 (ms)
  guesses   INTEGER NOT NULL DEFAULT 0,
  list      TEXT    NOT NULL DEFAULT '',   -- 추측한 칸 id, 쉼표로
  solved_at INTEGER,            -- 맞힌 순간 (ms). 못 맞혔으면 NULL
  elapsed   INTEGER,            -- solved_at - started
  gaveup    INTEGER NOT NULL DEFAULT 0,    -- 포기하면 1. 순위에 안 올라간다
  PRIMARY KEY (day, pid)
);
CREATE INDEX IF NOT EXISTS plays_rank ON plays (day, gaveup, elapsed, guesses, solved_at);
-- 순위는 적게 부른 순이 먼저, 같으면 빠른 순
CREATE INDEX IF NOT EXISTS plays_rank_g ON plays (day, gaveup, guesses, elapsed, solved_at);

-- 플레이어. 이름과 기록용 비밀번호를 묶어 한 사람으로 센다.
-- 같은 이름에 다른 비밀번호를 쓰면 한결#2, 한결#3 … 으로 갈라진다.
-- key 는 SHA-256(이름:비밀번호) 다 — 비밀번호 자체는 저장하지 않는다.
CREATE TABLE IF NOT EXISTS players (
  tag  TEXT    PRIMARY KEY,   -- '한결#1'
  name TEXT    NOT NULL,
  seq  INTEGER NOT NULL,      -- 같은 이름 안에서의 번호
  key  TEXT    NOT NULL,
  made INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS players_key ON players (name, key);

-- 브라우저(pid)가 어느 플레이어의 것인지. 한 사람이 여러 기기를 쓸 수 있다.
CREATE TABLE IF NOT EXISTS owners (
  pid  TEXT PRIMARY KEY,
  tag  TEXT NOT NULL,
  made INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS owners_tag ON owners (tag);
