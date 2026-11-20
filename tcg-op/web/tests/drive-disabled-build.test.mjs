import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('Google Drive permanece reservado pero no aparece accesible en la interfaz', () => {
  assert.match(html, /id="driveBackupPanel"[^>]*hidden/);
  assert.doesNotMatch(html, /<script[^>]+drive-ui\.js/);
  assert.match(html, /id="googleClientId"/); // conservado dentro del panel oculto para futura activación
  assert.match(html, /id="driveBackupBtn"/);
});

test('la aplicación no precarga ni activa módulos de Google Drive', () => {
  assert.doesNotMatch(sw, /drive-sync\.mjs|drive-ui\.js/);
});

test('el guardado local no crea dependencias ni tareas pendientes de Drive', () => {
  const persist = html.match(/function persist\(\)\{[\s\S]*?\nfunction openPhotoDB/);
  assert.ok(persist, 'persist() debe existir');
  assert.doesNotMatch(persist[0], /tcg_op_drive_sync_state|Drive pendiente/);
  assert.match(persist[0], /localStorage\.setItem\(STORAGE_KEY/);
});
