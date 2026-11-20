import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const ui = await readFile(new URL('../src/card-intelligence/ui.js', import.meta.url), 'utf8');

test('identity and market fields stay hidden before a catalog candidate is applied', () => {
  assert.match(html, /<div id="cardDetails" hidden>/);
  assert.match(ui, /\$\('cardDetails'\)\.hidden = false/);
  assert.match(ui, /\$\('cardDetails'\)\.hidden\s*=\s*true/);
});

test('Tsuki exposes separate OCR and catalog search steps', () => {
  assert.match(html, /id="readCardBtn"/);
  assert.match(html, /id="searchCatalogBtn"[^>]*hidden disabled/);
  assert.match(ui, /readButton\?\.addEventListener/);
  assert.match(ui, /searchButton\?\.addEventListener/);
});

test('Yami market controls remain inside the hidden post-identification section', () => {
  const start = html.indexOf('<div id="cardDetails" hidden>');
  const end = html.indexOf('</div>\n<div class="full">\n<label>Fotografía', start);
  assert.ok(start >= 0 && end > start);
  const details = html.slice(start, end);
  assert.match(details, /id="price"/);
  assert.match(details, /id="version"/);
  assert.match(details, /id="rarity"/);
});

test('saving remains disabled until a candidate is applied', () => {
  assert.match(html, /id="addBtn" disabled/);
  assert.match(ui, /\$\('addBtn'\)\.disabled = false/);
});
