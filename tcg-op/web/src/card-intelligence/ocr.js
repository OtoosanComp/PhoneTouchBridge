import { detectCardBox } from './card-crop.js';

// Tesseract viaja dentro de la app (vendor/tesseract): el OCR funciona sin internet, también en la APK.
// Si por alguna razón no se encuentra la copia local, se usa la CDN como respaldo.
const LOCAL_TESSERACT = './vendor/tesseract/tesseract.min.js';
const CDN_TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
let tesseractPromise;
let usingLocalTesseract = false;

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('OCR library did not initialize'));
    script.onerror = () => { script.remove(); reject(new Error('No se pudo cargar el motor OCR.')); };
    document.head.append(script);
  });
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractPromise) {
    tesseractPromise = injectScript(LOCAL_TESSERACT)
      .then(T => { usingLocalTesseract = true; return T; })
      .catch(() => injectScript(CDN_TESSERACT))
      .catch(() => { tesseractPromise = null; throw new Error('No se pudo cargar el motor OCR. Conéctate a internet y reintenta.'); });
  }
  return tesseractPromise;
}

/** Rutas absolutas a los archivos locales del OCR (núcleo WASM e idiomas). */
function workerOptions(logger) {
  if (!usingLocalTesseract) return { logger };
  const base = new URL('./vendor/tesseract/', document.baseURI).href;
  return { logger, workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang', workerBlobURL: false };
}

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
// Zonas relativas al recuadro de la carta. Nombre arriba; código bajo la ilustración; passcode abajo a la izquierda.
const JOBS = [
  { id: 'title',      rect: [0.02, 0.012, 0.98, 0.14], psm: '7',  worker: 'text',  whitelist: '', minWidth: 1400, label: 'nombre' },
  { id: 'codeMid',    rect: [0.25, 0.55, 1.00, 0.77],  psm: '11', worker: 'codes', whitelist: CODE_CHARS, minWidth: 1500, label: 'código' },
  { id: 'codeBottom', rect: [0.00, 0.80, 1.00, 1.00],  psm: '11', worker: 'codes', whitelist: CODE_CHARS, minWidth: 1800, label: 'código inferior' },
  { id: 'passcode',   rect: [0.00, 0.90, 0.55, 1.00],  psm: '7',  worker: 'codes', whitelist: '0123456789', minWidth: 1200, label: 'passcode' },
  { id: 'full',       rect: [0, 0, 1, 1],              psm: '11', worker: 'text',  whitelist: '', minWidth: 1700, label: 'texto completo' }
];

async function toCanvas(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return canvas;
}

function findCardBox(canvas) {
  try {
    const scale = 240 / Math.max(canvas.width, canvas.height);
    const w = Math.max(40, Math.round(canvas.width * scale)), h = Math.max(40, Math.round(canvas.height * scale));
    const small = document.createElement('canvas');
    small.width = w; small.height = h;
    const ctx = small.getContext('2d', { alpha: false, willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, w, h);
    return detectCardBox(ctx.getImageData(0, 0, w, h).data, w, h) || { x0: 0, y0: 0, x1: 1, y1: 1 };
  } catch { return { x0: 0, y0: 0, x1: 1, y1: 1 }; }
}

/** Recorta, amplía y normaliza contraste (percentiles 2–98) para que el texto pequeño sea legible. */
function prepareCrop(source, box, rect, minWidth) {
  const bw = (box.x1 - box.x0) * source.width, bh = (box.y1 - box.y0) * source.height;
  const sx = Math.round(box.x0 * source.width + rect[0] * bw), sy = Math.round(box.y0 * source.height + rect[1] * bh);
  const sw = Math.max(8, Math.round((rect[2] - rect[0]) * bw)), sh = Math.max(8, Math.round((rect[3] - rect[1]) * bh));
  const scale = Math.min(4, Math.max(1, minWidth / sw));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = frame.data, histogram = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = g; histogram[g]++; }
  const total = d.length / 4;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += histogram[v]; if (acc >= total * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += histogram[v]; if (acc >= total * 0.02) { hi = v; break; } }
  const range = Math.max(30, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range)); d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

async function recognizeMultiPass(Tesseract, imageFile, onProgress) {
  const source = await toCanvas(imageFile);
  const box = findCardBox(source);
  let progressBase = 0, progressSpan = 1;
  const logger = message => {
    if (message.status === 'recognizing text') onProgress(Math.round((progressBase + (message.progress || 0) * progressSpan) * 100));
  };
  progressListener = logger;
  let workers;
  try {
    workers = await getWorkers(Tesseract);
    const results = [];
    for (let i = 0; i < JOBS.length; i++) {
      const job = JOBS[i];
      progressBase = i / JOBS.length; progressSpan = 1 / JOBS.length;
      const worker = workers[job.worker];
      await worker.setParameters({ tessedit_pageseg_mode: job.psm, tessedit_char_whitelist: job.whitelist, preserve_interword_spaces: '1' });
      const { data } = await worker.recognize(prepareCrop(source, box, job.rect, job.minWidth));
      results.push({ id: job.id, label: job.label, text: String(data.text || '').trim(), confidence: Number(data.confidence || 0) / 100 });
    }
    const by = Object.fromEntries(results.map(r => [r.id, r]));
    const text = ['title', 'codeMid', 'codeBottom', 'passcode', 'full'].map(id => by[id]?.text).filter(Boolean).join('\n');
    const confident = results.filter(r => r.text);
    return {
      text, passes: results, titleText: by.title?.text || '',
      confidence: confident.length ? confident.reduce((sum, r) => sum + r.confidence, 0) / confident.length : 0
    };
  } catch (error) {
    await disposeWorkers();
    throw error;
  } finally {
    progressListener = () => {};
    scheduleDispose();
  }
}

// Los motores OCR se reutilizan entre fotos (cargar idiomas tarda varios segundos) y se liberan tras 3 min sin uso.
let workerPool = null;
let disposeTimer = null;
let progressListener = () => {};
function getWorkers(Tesseract) {
  clearTimeout(disposeTimer);
  if (!workerPool) {
    const logger = message => progressListener(message);
    workerPool = (async () => {
      const pool = {};
      // Español + inglés para nombres; inglés solo para códigos (menos errores en dígitos).
      try { pool.text = await Tesseract.createWorker('eng+spa', 1, workerOptions(logger)); }
      catch { pool.text = await Tesseract.createWorker('eng', 1, workerOptions(logger)); }
      pool.codes = await Tesseract.createWorker('eng', 1, workerOptions(logger));
      return pool;
    })();
    workerPool.catch(() => { workerPool = null; });
  }
  return workerPool;
}
async function disposeWorkers() {
  clearTimeout(disposeTimer);
  const pending = workerPool;
  workerPool = null;
  if (!pending) return;
  try { const pool = await pending; await Promise.all(Object.values(pool).map(w => w?.terminate?.().catch(() => {}))); } catch { /* ya estaba cerrado */ }
}
function scheduleDispose() {
  clearTimeout(disposeTimer);
  disposeTimer = setTimeout(disposeWorkers, 3 * 60 * 1000);
}

async function recognizeLegacy(Tesseract, imageFile, onProgress) {
  const result = await Tesseract.recognize(imageFile, 'eng', workerOptions(message => { if (message.status === 'recognizing text') onProgress(Math.round((message.progress || 0) * 100)); }));
  return { text: result.data.text || '', passes: [], titleText: '', confidence: Number(result.data.confidence || 0) / 100 };
}

export async function recognizeText(imageFile, onProgress = () => {}) {
  if (!(imageFile instanceof Blob)) throw new Error('Select a card photo first');
  const Tesseract = await loadTesseract();
  try { return await recognizeMultiPass(Tesseract, imageFile, onProgress); }
  catch (error) {
    // Si la lectura por zonas falla, se conserva el comportamiento anterior para no bloquear el registro.
    console.warn('Lectura por zonas no disponible; se usa lectura simple.', error);
    return recognizeLegacy(Tesseract, imageFile, onProgress);
  }
}
