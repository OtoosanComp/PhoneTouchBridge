import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('TCG OP 1.0 presenta el nuevo centro de operaciones sin romper las tres áreas funcionales', () => {
  assert.match(html, /id="tab-inicio"/);
  assert.match(html, /id="tab-registrar"/);
  assert.match(html, /id="tab-inventario"/);
  assert.match(html, /id="tab-ajustes"/);
  assert.match(html, /data-go="inicio"/);
  assert.match(html, /data-go="registrar"/);
  assert.match(html, /data-go="inventario"/);
  assert.match(html, /data-go="ajustes"/);
});

test('el flujo visual de Tsuki no expone porcentajes de progreso OCR', () => {
  const ui = fs.readFileSync(path.join(root, 'src/card-intelligence/ui.js'), 'utf8');
  assert.doesNotMatch(ui, /OCR local \$\{value\}%/);
  assert.match(ui, /tsukiActivity/);
  assert.match(ui, /yamiActivity/);
});

test('el ajuste de Gemini sigue disponible sin exponer claves en el HTML', () => {
  assert.match(html, /id="geminiKeyInput"/);
  assert.match(html, /id="saveGeminiKeyBtn"/);
  assert.match(html, /id="geminiKeyStatus"/);
  assert.doesNotMatch(html, /AIza[0-9A-Za-z_-]{20,}/);
});

test('los recursos visuales y la PWA se versionan como 1.1.0', () => {
  assert.equal(pkg.version, '1.1.0');
  assert.match(manifest.name, /TCG OP/);
  assert.match(manifest.description, /Nakamura Twins/);
  assert.match(sw, /tcg-op-shell-v110/);
  for (const asset of ['assets/tsuki-chibi.webp', 'assets/yami-chibi.webp', 'assets/tcg-icons.svg']) {
    assert.ok(fs.existsSync(path.join(root, asset)), `Falta ${asset}`);
  }
});
