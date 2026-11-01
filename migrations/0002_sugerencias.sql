-- Departamentos que encuentra la búsqueda automática
CREATE TABLE suggestions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  url           TEXT NOT NULL UNIQUE,
  source        TEXT NOT NULL,
  title         TEXT,
  barrio        TEXT,
  address       TEXT,
  photo_url     TEXT,
  price         INTEGER,
  currency      TEXT,
  expensas      INTEGER,
  ambientes     INTEGER,
  dormitorios   INTEGER,
  banos         INTEGER,
  m2_cubiertos  INTEGER,
  m2_totales    INTEGER,
  pileta        INTEGER,
  mascotas      INTEGER,
  cochera       INTEGER,
  balcon        INTEGER,
  amenities     TEXT,
  status        TEXT NOT NULL DEFAULT 'nueva', -- nueva, agregada, descartada
  found_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ajustes generales (por ahora, los criterios de búsqueda)
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES ('criteria', '{"barrios":["palermo"],"ambientes":4,"maxPrice":null,"currency":"ARS","requirePileta":true,"preferMascotas":true,"sources":["zonaprop","argenprop","mercadolibre"]}');
