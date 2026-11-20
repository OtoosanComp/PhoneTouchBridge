import { decideIdentification, extractCardSignals, scoreCandidate, VISION_GAMES, CATALOG_GAMES } from './core.js';
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

export async function identifyCard({ file, game, useCloud = false, ocr: priorOcr = null, onProgress = () => {} }) {
  if (!file) throw new Error('Selecciona primero una fotografía de la carta.');
  if (!VISION_GAMES.includes(game)) throw new Error('Juego no compatible con la identificación.');

  // Si Tsuki ya leyó esta foto (paso ①), se reutiliza la lectura: no se repite el OCR completo.
  const ocr = priorOcr?.text !== undefined ? priorOcr : (onProgress('Tsuki está leyendo la carta…'), await recognizeText(file, () => {}));
  const signals = extractCardSignals(ocr.text || '');
  let localCandidates = [];
  let catalogWarning = '';
  if (CATALOG_GAMES.includes(game)) {
    try { localCandidates = await findCatalogCandidates(game, ocr.text || ''); }
    catch (error) { catalogWarning = error.message; console.warn('Local catalog unavailable:', error); }
  } else catalogWarning = `No hay catálogo local para ${game}; la identificación depende de la IA y de tu confirmación.`;
  // Recognition never queries remote catalog endpoints during a scan.

  let cloudCandidates = [];
  let cloudProvider = null;
  let cloudModel = null;
  let cloudWarning = '';
  try {
    if (!shouldRequestCloudCandidates({ useCloud })) throw new Error('La segunda opinión en la nube no fue solicitada.');
    onProgress('Consultando a la IA (Gemini)… puede tardar unos segundos.');
    const imageDataUrl = await fileToDataUrl(file);
    const cloudResult = await requestCloudCandidates({ imageDataUrl, game, ocrText: ocr.text || '' }, fetch, { onModel: model => onProgress(`Consultando a la IA (${model})…`) });
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
