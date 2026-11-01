-- Los departamentos de ejemplo que vimos al empezar.
-- Solo trae lo que dice el link; el resto se completa con el botón "Completar".
INSERT INTO apartments (url, source, title, barrio, ambientes, pileta, notes)
SELECT v.url, v.source, v.title, v.barrio, v.ambientes, v.pileta, 'Ejemplo inicial: tocá "Completar" para traer el resto de los datos.'
FROM (
  SELECT 'https://www.argenprop.com/departamento-en-alquiler-en-palermo-4-ambientes--20764590' AS url,
         'argenprop' AS source, 'Departamento en alquiler en Palermo, 4 ambientes' AS title,
         'Palermo' AS barrio, 4 AS ambientes, NULL AS pileta
  UNION ALL SELECT 'https://www.argenprop.com/departamento-en-alquiler-en-palermo-3-ambientes--20743813',
         'argenprop', 'Departamento en alquiler en Palermo, 3 ambientes', 'Palermo', 3, NULL
  UNION ALL SELECT 'https://www.zonaprop.com.ar/propiedades/clasificado/alclapin-torre-de-categoria-aaa-con-vista!-pileta-gym-50408230.html',
         'zonaprop', 'Torre categoría AAA con vista, pileta y gym', NULL, NULL, 1
  UNION ALL SELECT 'https://www.zonaprop.com.ar/propiedades/clasificado/alclapin-alquiler-departamento-4-ambientes-palermo-hollywood-60471790.html',
         'zonaprop', 'Departamento 4 ambientes en Palermo Hollywood', 'Palermo Hollywood', 4, NULL
  UNION ALL SELECT 'https://www.zonaprop.com.ar/propiedades/clasificado/alclapin-departamento-en-alquiler-en-palermo-hollywood-59834753.html',
         'zonaprop', 'Departamento en alquiler en Palermo Hollywood', 'Palermo Hollywood', NULL, NULL
) AS v
WHERE NOT EXISTS (SELECT 1 FROM apartments a WHERE a.url = v.url);
