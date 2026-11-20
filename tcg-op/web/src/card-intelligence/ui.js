import { identifyCard } from './engine.js';
import { mapIdentificationToForm, extractCardSignals, decideIdentification } from './core.js';
import { recognizeText } from './ocr.js';
import { findCatalogCandidates } from './catalog.js';
import { prepareImageForAnalysis } from './image-prep.js';
import { createLearningRecord } from './learning.js';
import { saveLearningRecord } from './database.js';
import { applyCandidatePrice, describeValuation } from './price-ui.js';

const $ = id => document.getElementById(id);
// La IA en la nube solo se ofrece si hay una clave guardada en este dispositivo.
const cloudReady = () => { try { return Boolean(localStorage.getItem('tcg-op-access-token') || localStorage.getItem('tcg-op-gemini-key')); } catch { return false; } };
const readButton = $('readCardBtn');
const searchButton = $('searchCatalogBtn');
const resultBox = $('intelResult');
const tsukiActivity = $('tsukiActivity');
function setTsukiActivity(state, title, detail) {
  if (!tsukiActivity) return;
  tsukiActivity.hidden = false;
  tsukiActivity.dataset.state = state;
  $('tsukiActivityTitle').textContent = title;
  $('tsukiActivityDetail').textContent = detail;
}
const yamiActivity = $('yamiActivity');
function setYamiActivity(state, title, detail) {
  if (!yamiActivity) return;
  yamiActivity.hidden = false;
  yamiActivity.dataset.state = state;
  $('yamiActivityTitle').textContent = title;
  $('yamiActivityDetail').textContent = detail;
}

function showMessage(message, isError = false) {
  resultBox.style.display = 'block';
  resultBox.replaceChildren();
  const p = document.createElement('p');
  p.textContent = message;
  p.style.color = isError ? '#ff9eaf' : '#d9c8e5';
  resultBox.append(p);
}

async function refreshValuation() {
  const c = window.TCGCurrentCandidate;
  if (!c) return;
  setYamiActivity('busy', 'Yami está consultando el mercado…', 'Buscando referencias comparables para esta impresión.');
  try {
    const valuation = await applyCandidatePrice(c, c.game, $('version').value, { language: $('language').value || c.language });
    if (valuation.status === 'available') {
      $('price').value = valuation.value.toFixed(2);
      $('price').dataset.value = String(valuation.value);
      $('priceSource').dataset.source = (valuation.sources || []).join(', ');
    } else {
      $('price').value = '';
      $('price').dataset.value = '';
      $('priceSource').dataset.source = '';
    }
    $('priceSource').textContent = describeValuation(valuation);
    if (valuation.status === 'available') {
      setYamiActivity('done', '¡Yami encontró referencias!', `${valuation.sampleSize} fuente(s) comparables. Revisa la cotización antes de guardar.`);
    } else {
      setYamiActivity('warning', 'No hay precio verificable', 'Yami no encontró referencias comparables para esta impresión. Puedes escribir tu precio manual.');
    }
  } catch {
    $('priceSource').textContent = 'Yami: valoración no disponible; puedes guardar sin precio o escribir uno manual.';
    setYamiActivity('error', 'Yami no pudo completar la consulta', 'La valoración no está disponible ahora. Puedes continuar sin precio o introducir uno manual.');
  }
}

function applyCandidate(decision, c, firstApply) {
  if (!c) return;
  const fields = mapIdentificationToForm(c);
  $('cardDetails').hidden = false;
  $('addBtn').disabled = false;
  $('game').value = c.game;
  $('game').dispatchEvent(new Event('change'));
  $('game').disabled = true;
  for (const [id, value] of Object.entries(fields)) {
    if ($(id)) $(id).value = value;
  }
  // La edición impresa (1st Edition / Limited) se sugiere desde el OCR; tú la puedes cambiar.
  if (firstApply && c.game === 'Yu-Gi-Oh!' && c.detectedEdition) {
    const option = [...$('version').options].find(o => o.value === c.detectedEdition);
    if (option) $('version').value = option.value;
  }
  // A catalog match is not a market quote. Never infer a price from rarity or card identity.
  $('price').value = '';
  $('price').dataset.value = '';
  $('priceSource').textContent = 'Yami está consultando referencias comparables de esta impresión…';
  $('priceSource').dataset.source = '';
  window.TCGCurrentCandidate = c;
  refreshValuation();
  window.TCGCardIntelAccepted = {
    source: 'Card Intelligence', status: decision.status,
    confidence: c.score || decision.confidence || 0,
    catalogId: c.id || null,
    cardName: c.name,
    ocrText: decision.ocrText || c.name,
    cardCode: fields.cardCode,
    cardPasscode: c.cardPasscode || c.passcode || null,
    setName: fields.setName,
    language: fields.language || null,
    rarity: fields.rarity || null,
    cardType: fields.cardType || null,
    edition: fields.edition || null,
    evidence: c.evidence || [],
    reviewedAt: new Date().toISOString()
  };
  showAppliedNotice(c);
}

function showAppliedNotice(c) {
  let note = document.getElementById('appliedNotice');
  if (!note) {
    note = document.createElement('p');
    note.id = 'appliedNotice';
    note.className = 'notice';
    resultBox.append(note);
  }
  const printed = c.languageSource === 'ocr_region' ? 'Código impreso leído por OCR.' : c.languageSource === 'name_alias' ? 'Idioma deducido por el nombre; verifica el código impreso en tu carta.' : '';
  note.textContent = `Impresión aplicada. ${printed} Cambia acabado, idioma o impresión y el precio se recalcula. La ficha solo se guarda con tu confirmación.`.replace('  ', ' ');
}

function renderDecision(decision) {
  resultBox.replaceChildren();
  resultBox.style.display = 'block';
  const heading = document.createElement('strong');
  heading.textContent = decision.status === 'identified' ? 'Identificación de alta confianza' : decision.status === 'needs_review' ? 'Coincidencia pendiente de revisión' : 'Sin coincidencia verificable';
  resultBox.append(heading);
  if (decision.cloudProvider) {
    const providerLine = document.createElement('p');
    providerLine.className = 'notice';
    providerLine.textContent = `Visión cloud: ${decision.cloudProvider}${decision.cloudModel ? ` · ${decision.cloudModel}` : ''}.`;
    resultBox.append(providerLine);
  }

  const pool = (decision.allCandidates?.length ? decision.allCandidates : decision.candidates || []).slice(0, 60);
  let selected = decision.candidate;
  const detail = document.createElement('p');
  detail.className = 'notice';
  const detailText = (c, confidence) => `${c.name} · Código: ${c.collectorNumber || c.setCode || 'no leído'}${c.language ? ` · Idioma ${c.language}` : ''} · ${c.rarity || 'rareza pendiente'} · ${c.game} · Confianza: ${Math.round((confidence || 0) * 100)}%`;
  if (selected) {
    detail.textContent = detailText(selected, decision.confidence);
    resultBox.append(detail);
    const tied = pool.filter(x => Math.abs(Number(x.score || 0) - Number(selected.score || 0)) < 0.001).length;
    if (decision.status === 'needs_review' && tied > 1) {
      const hint = document.createElement('p');
      hint.className = 'notice';
      hint.textContent = `${tied} impresiones empatan. Elige la que coincide con el código y la rareza impresos en tu carta.`;
      resultBox.append(hint);
    }
    if (pool.length > 1) {
      const label = document.createElement('label');
      label.textContent = 'Impresión / rareza (elige la correcta)';
      const picker = document.createElement('select');
      picker.id = 'printingPicker';
      pool.forEach((c, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${c.setCode || 'sin código'} · ${c.setName || 'set'} · ${c.rarity || 'rareza ?'}${c.language ? ` · ${c.language}` : ''} · ${Math.round((c.score || 0) * 100)}%`;
        picker.append(option);
      });
      picker.addEventListener('change', () => {
        selected = pool[Number(picker.value)] || selected;
        detail.textContent = detailText(selected, selected.score);
        if (window.TCGCardIntelAccepted) applyCandidate(decision, selected, false);
      });
      resultBox.append(label, picker);
    }
  } else {
    detail.textContent = 'No se encontró una coincidencia verificable. Prueba con una fotografía más nítida y completa.';
    resultBox.append(detail);
  }

  if (decision.catalogWarning) {
    const catalogWarning = document.createElement('p');
    catalogWarning.className = 'notice';
    catalogWarning.textContent = `Catálogo local: ${decision.catalogWarning}`;
    resultBox.append(catalogWarning);
  }
  if (decision.warning) {
    const warning = document.createElement('p');
    warning.className = 'notice';
    warning.textContent = `Servicio cloud no disponible: ${decision.warning}`;
    resultBox.append(warning);
  }
  if (decision.ocrText) {
    const summary = document.createElement('details');
    const summaryTitle = document.createElement('summary');
    summaryTitle.textContent = 'Texto detectado en la fotografía';
    const pre = document.createElement('pre');
    pre.textContent = decision.ocrText;
    summary.append(summaryTitle, pre);
    resultBox.append(summary);
  }
  if (!decision.candidate) {
    if (window.TCGSelectedPhoto && navigator.onLine && cloudReady()) {
      const cloudButton = document.createElement('button');
      cloudButton.className = 'secondary';
      cloudButton.textContent = 'Solicitar segunda opinión con IA (usa internet)';
      cloudButton.addEventListener('click', async () => {
        cloudButton.disabled = true; cloudButton.textContent = 'Consultando proveedor…';
        try { const retry = await identifyCard({ file: window.TCGSelectedPhoto, game: $('game').value, useCloud: true, onProgress: showMessage }); renderDecision(retry); }
        catch (error) { showMessage(error.message || 'No se pudo consultar la segunda opinión.', true); }
      });
      resultBox.append(cloudButton);
    }
    return;
  }

  const actions = document.createElement('div');
  actions.className = 'intel-actions';
  const accept = document.createElement('button');
  accept.textContent = decision.status === 'identified' ? 'Aplicar datos identificados' : 'Aplicar impresión seleccionada';
  accept.addEventListener('click', () => applyCandidate(decision, selected, true));
  actions.append(accept);
  if (window.TCGSelectedPhoto && navigator.onLine && cloudReady()) {
    const cloudButton = document.createElement('button');
    cloudButton.className = 'secondary';
    cloudButton.textContent = 'Contrastar con IA (opcional)';
    cloudButton.addEventListener('click', async () => {
      cloudButton.disabled = true; cloudButton.textContent = 'Consultando…';
      try { const retry = await identifyCard({ file: window.TCGSelectedPhoto, game: $('game').value, useCloud: true, onProgress: showMessage }); renderDecision(retry); }
      catch (error) { showMessage(error.message || 'No se pudo consultar la segunda opinión.', true); }
    });
    actions.append(cloudButton);
  }
  resultBox.append(actions);
}

readButton?.addEventListener('click', async () => {
  const file = window.TCGSelectedPhoto;
  if (!file) return showMessage('Primero elige una fotografía de tu galería o toma una foto.', true);
  if (!file.type.startsWith('image/')) return showMessage('El archivo seleccionado no es una imagen válida.', true);
  readButton.disabled = true;
  readButton.textContent = 'Tsuki está leyendo…';
  setTsukiActivity('busy', 'Tsuki está pensando…', 'Preparando la imagen para leer nombre, códigos y texto impreso.');
  $('readStatus').textContent = 'Tsuki inició la lectura local de la carta.';
  $('searchCatalogBtn').hidden = true;
  $('searchCatalogBtn').disabled = true;
  $('cardDetails').hidden = true;
  $('addBtn').disabled = true;
  window.TCGCardIntelAccepted = null;
  window.TCGCurrentCandidate = null;
  try {
    const preparedFile = await prepareImageForAnalysis(file, window.TCGPhotoRotation || 0);
    const ocr = await recognizeText(preparedFile, () => {
      setTsukiActivity('busy', 'Tsuki está leyendo…', 'Reconociendo nombre, códigos y características impresas.');
      $('readStatus').textContent = 'Leyendo el texto de la carta…';
    });
    window.TCGReadResult = { text: ocr.text, titleText: ocr.titleText || '', confidence: ocr.confidence, signals: extractCardSignals(ocr.text), file: preparedFile, game: $('game').value };
    showMessage('Lectura terminada. Revisa el texto detectado y continúa con la búsqueda en el catálogo.');
    setTsukiActivity('done', '¡Lectura completada!', 'Tsuki extrajo el texto. Ahora puede comparar la impresión en el catálogo.');
    const details = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = 'Evidencia OCR leída por Tsuki';
    const pre = document.createElement('pre'); pre.textContent = ocr.passes?.length ? ocr.passes.map(p => `[${p.label}] ${p.text || '(sin texto)'}`).join('\n') : (ocr.text || 'No se detectó texto legible.');
    details.append(summary, pre); resultBox.append(details);
    searchButton.hidden = false;
    searchButton.disabled = false;
    $('readStatus').textContent = 'Paso 1/2 completado. Siguiente: buscar la impresión en el catálogo.';
  } catch (error) {
    showMessage(error.message || 'No se pudo leer la fotografía.', true);
    $('readStatus').textContent = 'La lectura no terminó. Puedes volver a intentarlo.';
    setTsukiActivity('error', 'Tsuki necesita otra foto', 'No pudo completar la lectura. Prueba con una imagen más nítida y completa.');
  } finally {
    readButton.disabled = false;
    readButton.textContent = '① Tsuki · Leer texto y códigos';
  }
});

searchButton?.addEventListener('click', async () => {
  const read = window.TCGReadResult;
  if (!read?.text) return showMessage('Primero completa la lectura de la fotografía.', true);
  searchButton.disabled = true;
  searchButton.textContent = 'Tsuki está comparando…';
  setTsukiActivity('busy', 'Tsuki está comparando…', 'Contrastando códigos, passcode y nombre con las impresiones del catálogo.');
  $('readStatus').textContent = 'Buscando coincidencias verificables en el catálogo…';
  try {
    const candidates = await findCatalogCandidates(read.game, read.text);
    const decision = decideIdentification(candidates);
    const enriched = {
      ...decision,
      ocrText: read.text,
      allCandidates: candidates,
      ocrConfidence: read.confidence,
      catalogWarning: candidates.length ? '' : 'No se encontraron impresiones en el catálogo local.',
      requiresUserConfirmation: true
    };
    renderDecision(enriched);
    setTsukiActivity(candidates.length ? 'done' : 'error',
      candidates.length ? '¡Coincidencias encontradas!' : 'No hubo coincidencias',
      candidates.length ? 'Revisa la impresión propuesta antes de aplicarla.' : 'No se encontró una impresión verificable. Revisa la foto o actualiza el catálogo.');
    $('readStatus').textContent = candidates.length
      ? 'Paso 2/2 completado. Revisa el candidato antes de aplicarlo.'
      : 'El catálogo no devolvió candidatos. No se mostrarán campos de ficha ni se permitirá guardar.';
  } catch (error) {
    showMessage(error.message || 'No se pudo consultar el catálogo local.', true);
    $('readStatus').textContent = 'Búsqueda incompleta. Revisa la biblioteca de catálogos.';
    setTsukiActivity('error', 'Tsuki no pudo consultar el catálogo', 'Comprueba la biblioteca local e inténtalo de nuevo.');
  } finally {
    searchButton.disabled = false;
    searchButton.textContent = '② Tsuki · Buscar impresión en catálogo';
  }
});

$('version')?.addEventListener('change', refreshValuation);

// Precio manual del propietario: tiene prioridad hasta que cambies acabado, idioma o impresión.
$('price')?.addEventListener('input', () => {
  const raw = $('price').value.trim();
  const n = Number(raw);
  if (raw !== '' && Number.isFinite(n) && n >= 0) {
    $('price').dataset.value = String(n);
    $('priceSource').dataset.source = 'Ajuste manual del propietario';
    $('priceSource').textContent = 'Precio manual del propietario (no proviene de una fuente de mercado).';
  } else {
    $('price').dataset.value = '';
    $('priceSource').dataset.source = '';
  }
});

window.TCGRecordLearning = async () => {
  const c = window.TCGCurrentCandidate;
  const accepted = window.TCGCardIntelAccepted;
  if (!c || !accepted) return false;
  try {
    const memory = createLearningRecord({ game: c.game, ocrText: accepted.ocrText || c.name, candidate: c, confirmed: true, ocrTitle: window.TCGReadResult?.titleText || '' });
    await saveLearningRecord(memory);
    return true;
  } catch (error) { console.warn('Learning memory not saved:', error); return false; }
};
