-- Datos sacados de cada aviso. La hoja guarda lo nuestro (contactado, visita, notas);
-- acá se guarda lo del aviso, para no depender de que el sitio responda.
CREATE TABLE IF NOT EXISTS avisos (
  url TEXT PRIMARY KEY,
  fuente TEXT,
  titulo TEXT,
  barrio TEXT,
  ambientes INTEGER,
  precio REAL,
  moneda TEXT,
  expensas REAL,
  foto TEXT,
  manual INTEGER NOT NULL DEFAULT 0,   -- 1 = cargado a mano, no pisar al releer
  error TEXT,
  actualizado TEXT
);
