import { decideIdentification, extractCardSignals, scoreCandidate } from './core.js';
import { recognizeText } from './ocr.js';
import { findCatalogCandidates } from './catalog.js';
import { requestCloudCandidates } from './cloud.js';
import { shouldRequestCloudCandidates } from './cloud-policy.mjs';
import { createTwinReport } from './agents.js';

async function fileToDataUrl(file) {
  // Downscale before cloud transfer: preserves card text while reducing mobile data use.
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', 0.8);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read selected photo'));
    reader.readAsDataURL(file);
  });
}

export async function identifyCard({ file, game, useCloud = false, onProgress = () => {} }) {
  if (!file) throw new Error('Select a card photo first');
  if (!['Riftbound', 'Yu-Gi-Oh!'].includes(game)) throw new Error('Choose Riftbound or Yu-Gi-Oh!');

  onProgress('Reading card locally…');
  const ocr = await recognizeText(file, value => onProgress(`Local OCR: ${value}%`));
  const signals = extractCardSignals(ocr.text);
  let localCandidates = [];
  let catalogWarning = '';
  try { localCandidates = await findCatalogCandidates(game, ocr.text); }
  catch (error) { catalogWarning = error.message; console.warn('Local catalog unavailable:', error); }
  // Recognition never queries remote catalog endpoints during a scan.

  let cloudCandidates = [];
  let cloudProvider = null;
  let cloudModel = null;
  let cloudWarning = '';
  try {
    if (!shouldRequestCloudCandidates({ useCloud })) throw new Error('La segunda opinión en la nube no fue solicitada.');
    onProgress('Checking visual evidence in the cloud…');
    const imageDataUrl = await fileToDataUrl(file);
    const cloudResult = await requestCloudCandidates({ imageDataUrl, game, ocrText: ocr.text });
    cloudCandidates = cloudResult.candidates;
    cloudProvider = cloudResult.provider;
    cloudModel = cloudResult.model;
  } catch (error) {
    cloudWarning = error.message;
  }

  const combined = new Map();
  const candidateKey = candidate => `${candidate.game}|${String(candidate.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${String(candidate.setCode || candidate.collectorNumber || '').toLowerCase()}`;
  for (const candidate of localCandidates) {
    const key = candidateKey(candidate);
    const prior = combined.get(key);
    if (!prior) combined.set(key, candidate);
    else combined.set(key, { ...candidate, ...prior, score: Math.max(Number(prior.score || 0), Number(candidate.score || 0)), evidence: [...new Set([...(prior.evidence || []), ...(candidate.evidence || [])])], marketQuotes: prior.marketQuotes?.length ? prior.marketQuotes : (candidate.marketQuotes || []) });
  }
  for (const vision of cloudCandidates) {
    const scored = scoreCandidate(signals, vision);
    const key = candidateKey(vision);
    const prior = combined.get(key);
    combined.set(key, prior ? { ...prior, ...scored, score: Math.max(prior.score, scored.score), evidence: [...new Set([...prior.evidence, ...scored.evidence, 'cloud_visual'])] } : { ...scored, evidence: [...scored.evidence, 'cloud_visual'] });
  }
  const decision = decideIdentification([...combined.values()]);
  const valuation = null;
  return {
    ...decision,
    ocrText: ocr.text,
    ocrConfidence: ocr.confidence,
    cloudAvailable: cloudCandidates.length > 0,
    cloudProvider,
    cloudModel,
    warning: useCloud ? cloudWarning : '',
    catalogWarning,
    requiresUserConfirmation: true,
    valuation,
    twinReport: createTwinReport({ identification: decision, valuation })
  };
}
