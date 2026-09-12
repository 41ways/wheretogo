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
