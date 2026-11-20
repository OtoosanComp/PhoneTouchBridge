import test from 'node:test';
import assert from 'node:assert/strict';
import { mapYugiohRecords, mapRiftHuntRecords } from '../src/card-intelligence/catalog-normalizers.js';
import { buildCatalogIndex, rankFromIndex } from '../src/card-intelligence/catalog-index.js';
import { decideIdentification } from '../src/card-intelligence/core.js';
import { parseSetCode, extractCodeCandidates, extractPasscodes, detectEdition } from '../src/card-intelligence/codes.js';
import { computeCandidatePrice } from '../src/card-intelligence/price-ui.js';
import { mergeModifiers } from '../src/card-intelligence/price-modifiers.js';
import { createLearningRecord } from '../src/card-intelligence/learning.js';
import { parseAliasFile } from '../src/card-intelligence/aliases.js';
import { detectCardBox } from '../src/card-intelligence/card-crop.js';

const api = [
  { id: 46986414, name: 'Dark Magician', type: 'Normal Monster', card_prices: [{ tcgplayer_price: '3.00', ebay_price: '4.00', amazon_price: '0', coolstuffinc_price: '5.00' }], card_sets: [
    { set_name: 'Legend of Blue Eyes White Dragon', set_code: 'LOB-EN005', set_rarity: 'Ultra Rare', set_rarity_code: '(UR)', set_price: '25.00' },
    { set_name: 'Structure Deck: Yugi', set_code: 'SDY-006', set_rarity: 'Ultra Rare', set_rarity_code: '(UR)', set_price: '8.00' },
    { set_name: 'Legendary Collection', set_code: 'LCYW-EN001', set_rarity: 'Ultra Rare', set_rarity_code: '(UR)', set_price: '6.00' },
    { set_name: 'Legendary Collection', set_code: 'LCYW-EN001', set_rarity: 'Secret Rare', set_rarity_code: '(ScR)', set_price: '12.00' }] },
  { id: 38033121, name: 'Dark Magician Girl', type: 'Normal Monster', card_sets: [
    { set_name: 'Magic Ruler', set_code: 'MFC-000', set_rarity: 'Ultra Rare', set_rarity_code: '(UR)', set_price: '30.00' },
    { set_name: 'Legendary Collection', set_code: 'LCYW-EN002', set_rarity: 'Ultra Rare', set_rarity_code: '(UR)', set_price: '7.00' }] },
  { id: 89631139, name: 'Blue-Eyes White Dragon', type: 'Normal Monster', card_sets: [
    { set_name: 'Legend of Blue Eyes White Dragon', set_code: 'LOB-EN001', set_rarity: 'Ultra Rare', set_rarity_code: '(UR)', set_price: '60.00' }] }
];
const catalog = mapYugiohRecords(api);
const aliases = { 46986414: ['Mago Oscuro'], 38033121: ['Maga Oscura'], 89631139: ['Dragón Blanco de Ojos Azules'] };
const index = buildCatalogIndex(catalog, { aliases });
const identify = text => { const ranked = rankFromIndex(index, text); return { ranked, ...decideIdentification(ranked) }; };

test('el mismo código con distintas rarezas ya no se pisa entre sí', () => {
  assert.equal(catalog.length, 7);
  assert.equal(new Set(catalog.map(r => r.id)).size, 7);
});

test('códigos: LOB-EN005, LOB-SP005 y LOB-S005 son la misma impresión', () => {
  const key = parseSetCode('LOB-EN005').key;
  for (const text of ['LOB-SP005', 'LOB-S005', 'LOBSP005', 'LOB SP005', 'L0B-SP0O5']) {
    assert.ok(extractCodeCandidates(text).some(p => p.key.endsWith(key.split('|')[1]) && /^L[O0]B$/.test(p.prefix)), text);
  }
  assert.equal(parseSetCode('OGN-017/298').key, parseSetCode('OGN-017').key);
});

test('passcode: tolera espacios, ceros iniciales y confusiones O/0', () => {
  assert.deepEqual(extractPasscodes('4698 6414'), ['46986414']);
  assert.deepEqual(extractPasscodes('O4O41228'), ['4041228']);
});

test('carta en ESPAÑOL con OCR limpio: identifica la impresión y conserva el código impreso', () => {
  const r = identify('MAGO OSCURO\nGUERRERO/Normal\nLOB-SP005\n46986414');
  assert.equal(r.status, 'identified');
  assert.equal(r.candidate.name, 'Dark Magician');
  assert.equal(r.candidate.setCode, 'LOB-SP005');
  assert.equal(r.candidate.language, 'ES');
  assert.equal(r.candidate.baseSetCode, 'LOB-EN005');
});

test('carta en español con OCR sucio (L0B SP0O5, MAGO 0SCURO) sigue encontrando LOB', () => {
  const r = identify('MAGO 0SCURO\nL0B SP0O5\n4698 6414');
  assert.equal(r.candidate.name, 'Dark Magician');
  assert.match(r.candidate.setCode, /^LOB-SP/);
  assert.equal(r.status, 'identified');
});

test('Maga Oscura (español, código antiguo con S) se identifica por nombre en español + código', () => {
  const r = identify('MAGA OSCURA\nMFC-S000');
  assert.equal(r.candidate.name, 'Dark Magician Girl');
  assert.equal(r.candidate.setCode, 'MFC-S000');
  assert.equal(r.candidate.language, 'ES');
  assert.equal(r.status, 'identified');
});

test('Dark Magician Girl no se confunde con Dark Magician aunque el nombre lo contenga', () => {
  const r = identify('DARK MAGICIAN GIRL\nLCYW-EN002');
  assert.equal(r.candidate.name, 'Dark Magician Girl');
  assert.equal(r.status, 'identified');
});

test('sin código legible NO finge una impresión: pide elegir entre las impresiones empatadas', () => {
  const r = identify('DARK MAGICIAN\nSpellcaster/Normal');
  assert.equal(r.status, 'needs_review');
  assert.ok(r.ranked.filter(c => c.name === 'Dark Magician').length >= 4);
});

test('mismo código con rareza distinta queda como dos opciones elegibles', () => {
  const r = identify('DARK MAGICIAN\nLCYW-EN001');
  const lcyw = r.ranked.filter(c => c.setCode === 'LCYW-EN001');
  assert.equal(lcyw.length, 2);
  assert.equal(new Set(lcyw.map(c => c.rarity)).size, 2);
});

test('Riftbound (inglés): código con bullet y total "OGN • 017/298"', () => {
  const rift = mapRiftHuntRecords([{ printingId: 'p17', name: 'Platewyrm Egg', set: 'ogn', setName: 'Origins', collectorNumber: '017', rarity: 'common', type: 'Unit', lang: 'en', finishes: ['normal', 'foil'] }]);
  const idx = buildCatalogIndex(rift);
  const ranked = rankFromIndex(idx, 'PLATEWYRM EGG\nOGN • 017/298');
  assert.equal(decideIdentification(ranked).status, 'identified');
});

test('aprendizaje: tras confirmar una carta en español, el nombre impreso se reconoce solo', () => {
  const candidate = catalog.find(r => r.setCode === 'LOB-EN005');
  const memory = createLearningRecord({ game: 'Yu-Gi-Oh!', ocrText: 'MAGO OSCURO LOB-SP005', candidate, confirmed: true, ocrTitle: 'MAGO OSCURO\nbasura' });
  assert.equal(memory.ocrTitle, 'mago oscuro');
  const idx = buildCatalogIndex(catalog, { aliases: {}, learned: [memory] });
  const ranked = rankFromIndex(idx, 'MAGO OSCURO\nGUERRERO');
  assert.equal(ranked[0].name, 'Dark Magician');
  assert.equal(ranked[0].language, 'ES');
});

test('edición impresa detectada en inglés y español', () => {
  assert.equal(detectEdition('1st Edition'), '1st Edition');
  assert.equal(detectEdition('1ª EDICIÓN'), '1st Edition');
  assert.equal(detectEdition('Edición Limitada'), 'Limited Edition');
  assert.equal(detectEdition('MAGO OSCURO'), null);
});

test('precio YGO cambia con la edición y el idioma (factores manuales) y muestra la base', () => {
  const lob = catalog.find(r => r.setCode === 'LOB-EN005');
  const mods = mergeModifiers({ 'Yu-Gi-Oh!': { '1st Edition': 2 }, language: { ES: 0.8 } });
  const base = computeCandidatePrice({ candidate: lob, game: 'Yu-Gi-Oh!', version: 'Unlimited', language: 'EN', fxRate: 18, mods });
  const first = computeCandidatePrice({ candidate: lob, game: 'Yu-Gi-Oh!', version: '1st Edition', language: 'EN', fxRate: 18, mods });
  const es = computeCandidatePrice({ candidate: lob, game: 'Yu-Gi-Oh!', version: 'Unlimited', language: 'ES', fxRate: 18, mods });
  assert.equal(base.value, 450);
  assert.equal(first.value, 900);
  assert.equal(es.value, 360);
  assert.equal(first.baseValue, 450);
});

test('sin tipo de cambio no convierte USD; sin cotización muestra solo el piso informativo', () => {
  const lob = catalog.find(r => r.setCode === 'LOB-EN005');
  assert.equal(computeCandidatePrice({ candidate: lob, game: 'Yu-Gi-Oh!', version: 'Unlimited', fxRate: null }).reason, 'fx_missing');
  const noQuote = { ...lob, marketQuotes: [] };
  const r = computeCandidatePrice({ candidate: noQuote, game: 'Yu-Gi-Oh!', version: 'Unlimited', fxRate: 20 });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.floorMxn, 80); // mediana de 3, 4 y 5 USD (el 0 se ignora) × 20
});

test('Riftbound: usa la cotización real del acabado; el factor foil solo aplica si falta', () => {
  const quotes = (finishes) => finishes.map(([finish, price]) => ({ printingId: 'p1', finish, price, currency: 'USD', source: 'RiftHunt', scope: 'printing' }));
  const mods = mergeModifiers({ Riftbound: { Foil: 3 } });
  const both = { id: 'p1', printingId: 'p1', marketQuotes: quotes([['normal', 1], ['foil', 5]]) };
  assert.equal(computeCandidatePrice({ candidate: both, game: 'Riftbound', version: 'Foil', fxRate: 10, mods }).value, 50);
  const onlyNormal = { id: 'p1', printingId: 'p1', marketQuotes: quotes([['normal', 1]]) };
  const est = computeCandidatePrice({ candidate: onlyNormal, game: 'Riftbound', version: 'Foil', fxRate: 10, mods });
  assert.equal(est.value, 30);
  assert.equal(est.estimateType, 'finish-adjusted');
  assert.equal(est.confidence, 'low');
});

test('importación de nombres en español acepta mapa, lista y respuesta tipo data[]', () => {
  assert.deepEqual(parseAliasFile({ 46986414: 'Mago Oscuro' }), { 46986414: ['Mago Oscuro'] });
  assert.deepEqual(parseAliasFile([{ id: 38033121, name_es: 'Maga Oscura' }]), { 38033121: ['Maga Oscura'] });
  assert.deepEqual(parseAliasFile({ data: [{ id: 1234567, name: 'Kuriboh' }] }), { 1234567: ['Kuriboh'] });
  assert.throws(() => parseAliasFile({ abc: 'x' }), /passcode/);
});

test('detecta el recuadro de la carta sobre un fondo uniforme y rechaza fotos sin carta', () => {
  const w = 300, h = 240, rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = x >= 80 && x < 220 && y >= 25 && y < 215;
    const i = (y * w + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = inside ? 235 : 60; rgba[i + 3] = 255;
  }
  const box = detectCardBox(rgba, w, h);
  assert.ok(box && Math.abs(box.x0 - 80 / w) < 0.04 && Math.abs(box.y1 - 215 / h) < 0.04);
  rgba.fill(90);
  assert.equal(detectCardBox(rgba, w, h), null);
});
