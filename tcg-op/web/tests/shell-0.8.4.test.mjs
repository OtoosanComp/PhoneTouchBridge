import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const ui = await readFile(new URL('../src/card-intelligence/ui.js', import.meta.url), 'utf8');
const section = id => { const start = html.indexOf(`id="${id}"`); assert.ok(start >= 0, id); return html.slice(start); };

test('la app tiene tres pestañas con barra inferior', () => {
  for (const tab of ['registrar', 'inventario', 'ajustes']) {
    assert.match(html, new RegExp(`id="tab-${tab}"`));
    assert.match(html, new RegExp(`data-go="${tab}"`));
  }
});

test('Inventario solo tiene buscador, resumen y lista; el respaldo vive en Ajustes', () => {
  const inv = html.slice(html.indexOf('id="tab-inventario"'), html.indexOf('id="tab-ajustes"'));
  assert.match(inv, /id="filter"/);
  assert.match(inv, /id="inventory"/);
  assert.doesNotMatch(inv, /id="exportBtn"/);
  const settings = section('tab-ajustes');
  assert.match(settings, /id="exportBtn"/);
  assert.match(settings, /id="importBtn"/);
});

test('IA en la nube y ajustes de precio están ocultos o plegados por defecto', () => {
  assert.match(html, /id="aiConnectionPanel" hidden/);
  assert.match(html, /<details class="panel" id="priceAdjustPanel">/);
  assert.match(html, /id="advancedToggle"/);
});

test('los botones de IA en la nube solo aparecen con una clave guardada', () => {
  assert.match(ui, /cloudReady\(\)/);
  assert.equal((ui.match(/navigator\.onLine && cloudReady\(\)/g) || []).length, 2);
});

test('no hay ids duplicados en la interfaz', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
});
