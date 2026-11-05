import test from 'node:test';
import assert from 'node:assert/strict';
import { parsear, fuenteDe } from '../src/scrape.js';

test('lee título, precio y foto de las etiquetas del aviso', () => {
  const html = `<head><title>x</title>
    <meta property="og:title" content="Departamento 4 ambientes en Palermo Hollywood">
    <meta property="og:image" content="https://img/1.jpg">
    <meta itemprop="price" content="2800">
    <meta itemprop="priceCurrency" content="USD"></head>`;
  const r = parsear(html, 'https://departamento.mercadolibre.com.ar/MLA-1');
  assert.equal(r.fuente, 'MercadoLibre');
  assert.equal(r.precio, 2800);
  assert.equal(r.moneda, 'USD');
  assert.equal(r.foto, 'https://img/1.jpg');
  assert.equal(r.ambientes, 4);
  assert.equal(r.barrio, 'Palermo Hollywood');
});

test('reconoce la fuente por dominio', () => {
  assert.equal(fuenteDe('https://www.zonaprop.com.ar/x'), 'Zonaprop');
  assert.equal(fuenteDe('https://www.argenprop.com/x'), 'Argenprop');
});
