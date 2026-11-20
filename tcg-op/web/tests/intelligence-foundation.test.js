import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapRiftHuntRecords, mapYugiohRecords, buildCatalogKey
} from '../src/card-intelligence/catalog-normalizers.js';
import { estimateFairMarketValue } from '../src/card-intelligence/fair-market.js';
import { createLearningRecord, applyLearningBoost } from '../src/card-intelligence/learning.js';
import { routeToTwinRole } from '../src/card-intelligence/agents.js';

test('RiftHunt cards and prices join by exact printing id and finish', () => {
  const cards = [{ printingId:'print-1', oracleId:'oracle-1', name:'Platewyrm Egg', set:'ogn', setName:'Origins', collectorNumber:'017', rarity:'common', type:'Unit', lang:'en', finishes:['normal','foil'] }];
  const prices = [{ printingId:'print-1', finishes:{ normal:{market:0.15}, foil:{market:2.25} } }];
  const [card] = mapRiftHuntRecords(cards, prices);
  assert.equal(card.name, 'Platewyrm Egg');
  assert.equal(card.setCode, 'OGN-017');
  assert.equal(card.marketQuotes.find(x=>x.finish==='normal').price, 0.15);
  assert.equal(card.marketQuotes.find(x=>x.finish==='foil').price, 2.25);
  assert.equal(card.marketQuotes[0].currency, 'USD');
});

test('RiftHunt does not join prices by non-unique Riot id alone', () => {
  const cards = [{ printingId:'print-A', riftboundId:'same-id', name:'Promo A', set:'ogn', collectorNumber:'001', finishes:['foil'] }];
  const prices = [{ riftboundId:'same-id', finishes:{ foil:{market:99} } }];
  const [card] = mapRiftHuntRecords(cards, prices);
  assert.equal(card.marketQuotes.length, 0);
});

test('Yu-Gi-Oh! maps every set printing independently and labels card-level quotes', () => {
  const cards = [{ id:89631139, name:'Blue-Eyes White Dragon', type:'Normal Monster', card_sets:[
    {set_name:'Legend of Blue Eyes White Dragon',set_code:'LOB-001',set_rarity:'Ultra Rare',set_price:'45.00'},
    {set_name:'Starter Deck Kaiba',set_code:'SDK-001',set_rarity:'Ultra Rare',set_price:'12.00'}
  ], card_prices:[{cardmarket_price:'20',tcgplayer_price:'18',ebay_price:'25'}] }];
  const mapped=mapYugiohRecords(cards);
  assert.equal(mapped.length,2);
  assert.notEqual(buildCatalogKey(mapped[0]),buildCatalogKey(mapped[1]));
  assert.equal(mapped[0].marketQuotes[0].scope,'printing-indicative');
  assert.equal(mapped[0].setCode,'LOB-001');
});

test('fair market estimate filters wrong printings, finishes and extreme outliers', () => {
  const quotes=[
    {printingId:'p1',finish:'foil',price:90,currency:'MXN',source:'A',observedAt:'2026-11-06'},
    {printingId:'p1',finish:'foil',price:100,currency:'MXN',source:'B',observedAt:'2026-11-06'},
    {printingId:'p1',finish:'foil',price:110,currency:'MXN',source:'C',observedAt:'2026-11-06'},
    {printingId:'p1',finish:'foil',price:900,currency:'MXN',source:'D',observedAt:'2026-11-06'},
    {printingId:'p2',finish:'foil',price:999,currency:'MXN',source:'E',observedAt:'2026-11-06'},
    {printingId:'p1',finish:'normal',price:5,currency:'MXN',source:'F',observedAt:'2026-11-06'}
  ];
  const result=estimateFairMarketValue(quotes,{printingId:'p1',finish:'foil',currency:'MXN'});
  assert.equal(result.value,100);
  assert.equal(result.sampleSize,3);
  assert.equal(result.confidence,'medium');
});

test('fair market does not invent a value without comparable quotes', () => {
  const result=estimateFairMarketValue([],{printingId:'p1',finish:'normal',currency:'MXN'});
  assert.equal(result.status,'unavailable');
  assert.equal(result.value,null);
});

test('learning records only human-confirmed catalog matches', () => {
  const record=createLearningRecord({game:'Riftbound',ocrText:'Platewyrm Egg',candidate:{id:'p1',name:'Platewyrm Egg'},confirmed:true});
  assert.equal(record.catalogId,'p1');
  assert.equal(record.normalizedAlias,'platewyrm egg');
  assert.throws(()=>createLearningRecord({game:'Riftbound',ocrText:'x',candidate:{id:'p1'},confirmed:false}));
});

test('learning boost only applies to same game and exact normalized OCR alias', () => {
  const memory=[{game:'Riftbound',normalizedAlias:'platewyrm egg',catalogId:'p1',confirmed:true}];
  assert.equal(applyLearningBoost([{id:'p1',score:0.5},{id:'p2',score:0.6}],{game:'Riftbound',ocrText:'Platewyrm Egg'},memory)[0].score,0.68);
  assert.equal(applyLearningBoost([{id:'p1',score:0.5}],{game:'Yu-Gi-Oh!',ocrText:'Platewyrm Egg'},memory)[0].score,0.5);
});

test('one shared engine routes analysis to Tsuki and market/inventory to Yami', () => {
  assert.equal(routeToTwinRole('identify'),'tsuki');
  assert.equal(routeToTwinRole('verify'),'tsuki');
  assert.equal(routeToTwinRole('price'),'yami');
  assert.equal(routeToTwinRole('inventory'),'yami');
});

test('fair market ignores broad card-level quotes and converts USD only with a supplied FX rate', () => {
  const result = estimateFairMarketValue([
    {printingId:'p1',finish:'normal',price:10,currency:'USD',source:'RiftHunt',scope:'printing'},
    {printingId:'p1',finish:'normal',price:999,currency:'USD',source:'YGO aggregate',scope:'card-level'}
  ], {printingId:'p1',finish:'normal',currency:'MXN',usdMxn:18});
  assert.equal(result.value,180);
  assert.deepEqual(result.sources,['RiftHunt']);
});
