import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeText,
  extractCardSignals,
  scoreCandidate,
  decideIdentification,
  validateVisionResult,
  validateCatalogRecord
} from '../src/card-intelligence/core.js';

test('normalizes OCR text without losing meaningful card codes', () => {
  assert.equal(normalizeText('  Blue-Eyes   White Dragon! '), 'blue eyes white dragon');
  assert.equal(normalizeText('LOB-001'), 'lob 001');
});

test('extracts set code and candidate name signals from OCR', () => {
  const signals = extractCardSignals('BLUE-EYES WHITE DRAGON\nLOB-001\n1st Edition');
  assert.equal(signals.normalized.includes('blue eyes white dragon'), true);
  assert.equal(signals.codes.includes('lob 001'), true);
});

test('exact set-code agreement outranks a weak name-only match', () => {
  const signals = extractCardSignals('BLUE EYES WHITE DRAGON LOB-001');
  const exact = scoreCandidate(signals, { name: 'Blue-Eyes White Dragon', setCode: 'LOB-001', game: 'Yu-Gi-Oh!' });
  const weak = scoreCandidate(signals, { name: 'Blue-Eyes Alternative White Dragon', setCode: 'MVP1-EN046', game: 'Yu-Gi-Oh!' });
  assert.ok(exact.score > weak.score);
  assert.ok(exact.evidence.includes('set_code_exact'));
});

test('does not auto-confirm an uncertain candidate', () => {
  const result = decideIdentification([{ name: 'Unknown card', score: 0.54, evidence: [] }]);
  assert.equal(result.status, 'needs_review');
});

test('requires a clear margin between first and second candidates', () => {
  const result = decideIdentification([
    { name: 'Candidate A', score: 0.91, evidence: ['name_exact'] },
    { name: 'Candidate B', score: 0.89, evidence: ['name_exact'] }
  ]);
  assert.equal(result.status, 'needs_review');
});

test('accepts a strong candidate only when confidence and margin pass', () => {
  const result = decideIdentification([
    { name: 'Candidate A', score: 0.96, evidence: ['name_exact', 'set_code_exact'] },
    { name: 'Candidate B', score: 0.60, evidence: [] }
  ]);
  assert.equal(result.status, 'identified');
});

test('rejects vision results with unsupported or malformed fields', () => {
  assert.throws(() => validateVisionResult({ name: 'Card', price: 99 }), /not allowed/i);
  assert.throws(() => validateVisionResult({ name: '', game: 'Riftbound' }), /name/i);
});

test('validates catalog records and supported games', () => {
  assert.equal(validateCatalogRecord({ id: 'rb-1', game: 'Riftbound', name: 'Test Card' }), true);
  assert.throws(() => validateCatalogRecord({ id: 'x', game: 'Other', name: 'Test' }), /game/i);
});

test('Yu-Gi-Oh provider maps API printings into separate candidates', async () => {
  const { searchYugiohCatalog } = await import('../src/card-intelligence/yugioh-provider.js');
  let calls = 0;
  const fakeFetch = async url => {
    calls++;
    assert.match(String(url), /fname=/);
    return { ok: true, json: async () => ({ data: [{
      id: 89631139,
      name: 'Blue-Eyes White Dragon',
      type: 'Normal Monster',
      card_sets: [
        { set_code: 'LOB-001', set_rarity: 'Ultra Rare' },
        { set_code: 'SDK-001', set_rarity: 'Ultra Rare' }
      ]
    }] }) };
  };
  const candidates = await searchYugiohCatalog('Blue-Eyes White Dragon\nLOB-001', fakeFetch);
  assert.equal(candidates.length, 2);
  assert.ok(candidates.some(x => x.setCode === 'LOB-001'));
  assert.equal(calls, 1);
});

test('maps identification data into separate locked card fields', async () => {
  const { mapIdentificationToForm } = await import('../src/card-intelligence/core.js');
  const mapped = mapIdentificationToForm({ name: 'Blue-Eyes White Dragon', game: 'Yu-Gi-Oh!', setCode: 'LOB-001', collectorNumber: 'LOB-001', rarity: 'Ultra Rare', language: 'EN', edition: '1st Edition', type: 'Normal Monster' });
  assert.equal(mapped.cardName, 'Blue-Eyes White Dragon');
  assert.equal(mapped.cardCode, 'LOB-001');
  assert.equal(mapped.rarity, 'Ultra Rare');
  assert.equal(mapped.language, 'EN');
  assert.equal(mapped.cardType, 'Normal Monster');
  assert.equal(mapped.edition, '1st Edition');
});

test('keeps market price unknown unless a trusted source provides a numeric quote', async () => {
  const { normalizeMarketQuote } = await import('../src/card-intelligence/core.js');
  assert.deepEqual(normalizeMarketQuote(null), { price: null, currency: 'MXN', source: null, status: 'unavailable' });
  assert.deepEqual(normalizeMarketQuote({ price: 125.5, currency: 'MXN', source: 'trusted-market' }), { price: 125.5, currency: 'MXN', source: 'trusted-market', status: 'available' });
  assert.equal(normalizeMarketQuote({ price: 'unknown', source: 'guess' }).status, 'unavailable');
});

test('offers version choices by franchise while keeping identification metadata separate', async () => {
  const { getVersionOptions } = await import('../src/card-intelligence/core.js');
  assert.deepEqual(getVersionOptions('Riftbound'), ['Normal', 'Foil', 'Alternate Art']);
  assert.ok(getVersionOptions('Yu-Gi-Oh!').includes('1st Edition'));
});

test('vision schema accepts separately extracted set and type fields', () => {
  assert.equal(validateVisionResult({ name: 'Test Card', game: 'Riftbound', setName: 'Origins', type: 'Unit', collectorNumber: '001/100' }), true);
});
