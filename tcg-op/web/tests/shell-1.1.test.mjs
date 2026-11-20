import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const html = read('index.html');
const sw = read('sw.js');

function moduleGraph() {
  const entries = [...html.matchAll(/<script type="module" src="\.\/([^"]+)"/g)].map(m => m[1]);
  const seen = new Set();
  const visit = rel => {
    if (seen.has(rel)) return;
    seen.add(rel);
    for (const m of read(rel).matchAll(/(?:import|export)\s[^'"]*?from\s+'(\.[^']+)'/g)) visit(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  };
  entries.forEach(visit);
  return [...seen];
}

test('todos los módulos que carga la app están en la caché offline del service worker', () => {
  const modules = moduleGraph();
  assert.ok(modules.length > 10);
  for (const rel of modules) assert.ok(sw.includes(`'./${rel}'`), `Falta en sw.js: ${rel}`);
});

test('la app no depende de CDNs para OCR ni QR (funciona sin internet y dentro de la APK)', () => {
  assert.doesNotMatch(html, /<script[^>]+src="https?:/);
  for (const rel of ['vendor/qrcode/qrcode.min.js', 'vendor/tesseract/tesseract.min.js', 'vendor/tesseract/worker.min.js',
    'vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract/core/tesseract-core-lstm.wasm.js',
    'vendor/tesseract/lang/eng.traineddata.gz', 'vendor/tesseract/lang/spa.traineddata.gz']) {
    assert.ok(fs.existsSync(path.join(root, rel)), `Falta ${rel}`);
  }
  assert.match(read('src/card-intelligence/ocr.js'), /\.\/vendor\/tesseract\/tesseract\.min\.js/);
});

test('registro manual, edición y visor de fotos están disponibles', () => {
  assert.match(html, /id="manualEntryBtn"/);
  assert.match(html, /function editItem\(/);
  assert.match(html, /id="photoViewer"/);
  assert.doesNotMatch(html, /window\.open\(/, 'window.open no funciona dentro de la APK');
});

test('al guardar la misma impresión se ofrece sumar al registro existente', () => {
  const src = html.match(/function sameCard\([^]*?\n/)[0];
  const sameCard = new Function(`${src}; return sameCard;`)();
  const base = { game: 'Yu-Gi-Oh!', name: 'Dark Magician', cardCode: 'LOB-EN005', rarity: 'Ultra Rare', version: 'Unlimited', language: 'EN', identification: { catalogId: 'ygo-1' } };
  assert.equal(sameCard(base, { ...base }), true);
  assert.equal(sameCard(base, { ...base, version: '1st Edition' }), false);
  assert.equal(sameCard(base, { ...base, language: 'ES' }), false);
  assert.equal(sameCard(base, { ...base, identification: { catalogId: 'ygo-2' } }), false);
  const manual = { ...base, identification: { status: 'manual' } };
  assert.equal(sameCard(manual, { ...manual }), true);
});

test('el respaldo usa el puente nativo cuando corre dentro de la APK', () => {
  assert.match(html, /window\.TCGAndroid\?\.saveTextFile/);
  assert.match(html, /if\(window\.TCGAndroid\)/);
});
