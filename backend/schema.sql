-- PestGuard Pro — D1 schema
CREATE TABLE IF NOT EXISTS records (
  id        INTEGER PRIMARY KEY,
  month     TEXT    NOT NULL,
  year      INTEGER NOT NULL,
  monthNum  INTEGER NOT NULL,
  area      TEXT    NOT NULL DEFAULT '',
  pestType  TEXT    NOT NULL DEFAULT '',
  count     INTEGER NOT NULL DEFAULT 0,
  trapId    TEXT    NOT NULL DEFAULT '',
  trapType  TEXT    NOT NULL DEFAULT '',
  target    INTEGER NOT NULL DEFAULT 0,
  inspector TEXT    NOT NULL DEFAULT '',
  notes     TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_records_year_month ON records(year, monthNum);

CREATE TABLE IF NOT EXISTS capa (
  id          INTEGER PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  root        TEXT NOT NULL DEFAULT '',
  owner       TEXT NOT NULL DEFAULT '',
  due         TEXT NOT NULL DEFAULT '',
  priority    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open',
  created     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
