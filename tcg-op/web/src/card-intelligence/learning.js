import { normalizeText } from './core.js';
import { groupKeyOf } from './catalog-index.js';

// Un título distinto del nombre en inglés implica otro idioma; el propietario trabaja con español e inglés.
function learnedLanguage(candidate) {
  const lang = String(candidate?.language || '').toUpperCase();
  return lang && lang !== 'EN' ? lang : 'ES';
}

export function createLearningRecord({ game, ocrText, candidate, confirmed, ocrTitle = '' }) {
  if (confirmed !== true) throw new Error('Only human-confirmed identifications can be learned');
  if (!['Riftbound', 'Yu-Gi-Oh!'].includes(game)) throw new Error('Unsupported learning game');
  if (!candidate?.id || !candidate?.name) throw new Error('A catalog candidate is required');
  const normalizedAlias = normalizeText(candidate.name);
  const ocrFingerprint = normalizeText(ocrText);
  if (normalizedAlias.length < 3 || ocrFingerprint.length < 3) throw new Error('OCR text or card name is too short to learn');
  // Título leído por OCR (p. ej. "MAGO OSCURO"): permite reconocer la misma carta por nombre en español la próxima vez.
  const titleNorm = normalizeText(String(ocrTitle || '').split(/\r?\n/).find(line => normalizeText(line).length >= 4) || '');
  const learnTitle = titleNorm.length >= 4 && titleNorm !== normalizedAlias && titleNorm.length <= 60;
  return {
    id: `${game}|${candidate.id}|${normalizedAlias}`,
    game, catalogId: String(candidate.id), cardName: String(candidate.name),
    normalizedAlias, ocrFingerprint, confirmed: true, createdAt: new Date().toISOString(),
    source: 'human-confirmed',
    groupKey: groupKeyOf(candidate),
    ...(learnTitle ? { ocrTitle: titleNorm, ocrTitleNorm: titleNorm, language: learnedLanguage(candidate) } : {})
  };
}

export function applyLearningBoost(candidates = [], { game, ocrText }, memories = []) {
  const alias = normalizeText(ocrText);
  const known = new Set(memories.filter(m => m.confirmed && m.game === game && ((m.normalizedAlias && alias.includes(m.normalizedAlias)) || (m.ocrTitleNorm && alias.includes(m.ocrTitleNorm)))).map(m => m.catalogId));
  return candidates.map(candidate => known.has(String(candidate.id))
    ? { ...candidate, score: Math.round(Math.min(0.99, Number(candidate.score || 0) + 0.18) * 10000) / 10000, evidence: [...new Set([...(candidate.evidence || []), 'human_confirmed_memory'])] }
    : candidate);
}
