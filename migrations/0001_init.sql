-- Dispositivos autorizados (celulares y notebooks)
CREATE TABLE devices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT
);

-- Departamentos. Campos provisorios hasta ver los ejemplos.
CREATE TABLE apartments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  url         TEXT,
  source      TEXT,            -- zonaprop, argenprop, mercadolibre, otro
  title       TEXT NOT NULL,
  address     TEXT,
  barrio      TEXT,
  ambientes   INTEGER,
  m2          INTEGER,
  price       INTEGER,
  currency    TEXT DEFAULT 'ARS',
  expensas    INTEGER,
  pileta      INTEGER NOT NULL DEFAULT 0,
  mascotas    INTEGER,         -- 1 sí, 0 no, NULL no se sabe
  status      TEXT NOT NULL DEFAULT 'nuevo', -- nuevo, contactado, visita, descartado, favorito
  rating      INTEGER,         -- 1 a 5
  notes       TEXT,
  created_by  INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
