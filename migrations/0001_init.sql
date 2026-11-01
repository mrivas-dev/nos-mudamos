-- Dispositivos autorizados (celulares y notebooks)
CREATE TABLE devices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT
);

CREATE TABLE apartments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Básico
  url           TEXT,
  source        TEXT,            -- zonaprop, argenprop, mercadolibre, otro
  title         TEXT NOT NULL,
  barrio        TEXT,
  address       TEXT,
  photo_url     TEXT,
  -- Plata
  price         INTEGER,
  currency      TEXT DEFAULT 'ARS',
  expensas      INTEGER,         -- siempre en ARS
  -- Ambientes
  ambientes     INTEGER,
  dormitorios   INTEGER,
  banos         INTEGER,
  m2_cubiertos  INTEGER,
  m2_totales    INTEGER,
  piso          TEXT,
  antiguedad    INTEGER,         -- años
  -- Lo que nos importa (1 sí, 0 no, NULL no se sabe)
  pileta        INTEGER,
  mascotas      INTEGER,
  cochera       INTEGER,
  balcon        INTEGER,         -- balcón o terraza
  amenities     TEXT,            -- texto libre: gym, SUM, seguridad...
  -- Nuestro
  status        TEXT NOT NULL DEFAULT 'nuevo', -- nuevo, contactado, visita, favorito, descartado
  rating        INTEGER,         -- 1 a 5
  notes         TEXT,
  visit_date    TEXT,            -- YYYY-MM-DDTHH:MM
  agency        TEXT,
  contact       TEXT,
  created_by    INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
