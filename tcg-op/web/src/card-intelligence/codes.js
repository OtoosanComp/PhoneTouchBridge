/**
 * Lectura tolerante de códigos de impresión y passcodes.
 * - Ignora el idioma/región del código (LOB-EN005 = LOB-SP005 = LOB-S005).
 * - Corrige confusiones típicas de OCR (O/0, I/1, S/5, B/8, Z/2, G/6) solo en la parte numérica.
 * - Solo se usa para BUSCAR en el catálogo: un falso positivo no existe en el catálogo y se ignora.
 */
const REGION_PATTERN = 'EN|SP|FR|DE|IT|PT|JP|KR|AE|AS|SC|TC|E|S|F|G|I|P|J|K';
const REGION_LANGUAGE = Object.freeze({
  EN: 'EN', E: 'EN', AE: 'EN', AS: 'EN', SP: 'ES', S: 'ES', FR: 'FR', F: 'FR', DE: 'DE', G: 'DE',
  IT: 'IT', I: 'IT', PT: 'PT', P: 'PT', JP: 'JP', J: 'JP', KR: 'KR', K: 'KR', SC: 'ZH', TC: 'ZH'
});
const DIGIT_FIX = Object.freeze({ O: '0', Q: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6' });
const CONFUSABLE_PAIRS = ['O0', 'Q0', 'I1', 'L1', 'S5', 'B8', 'Z2', 'G6'];
const NUMBER_RE = new RegExp('^([A-Z]?)([0-9OQILSBZG]{2,4})([A-Z]?)$');
const CATALOG_CODE_RE = new RegExp(`^([A-Z0-9]{2,6})-(${REGION_PATTERN})?([A-Z]?\\d{1,4}[A-Z]?)$`);

export function regionToLanguage(region) { return REGION_LANGUAGE[String(region || '').toUpperCase()] || null; }

function fixDigits(value) { return String(value).replace(/[OQILSBZG]/g, ch => DIGIT_FIX[ch]); }
function countDigits(value) { return (String(value).match(/[0-9]/g) || []).length; }
function normalizeNumber(lead, digits, trail) {
  const n = String(parseInt(digits, 10));
  return `${lead || ''}${n === 'NaN' ? digits : n}${trail || ''}`;
}

/** Código limpio del catálogo → {prefix, region, lang, number, key}. */
export function parseSetCode(code) {
  const raw = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return null;
  let match = raw.match(CATALOG_CODE_RE);
  if (!match) {
    // Riftbound/otros: "OGN-017/298", "OGN-017*" → conserva solo la parte previa a "/".
    const cleaned = raw.replace(/\/.*$/, '').replace(/[^A-Z0-9-]/g, '');
    match = cleaned.match(CATALOG_CODE_RE);
    if (!match) return null;
  }
  const [, prefix, region = '', rest] = match;
  const parts = rest.match(/^([A-Z]?)(\d{1,4})([A-Z]?)$/);
  if (!parts) return null;
  const number = normalizeNumber(parts[1], parts[2], parts[3]);
  return { prefix, region, lang: regionToLanguage(region), number, key: `${prefix}|${number}`, printed: raw };
}

export function formatPrintedCode({ prefix, region = '', digits }) { return `${prefix}-${region}${digits}`; }

/** Todas las lecturas posibles de un token OCR ya unido (ej. "LOBSP005"). */
function parseToken(token) {
  const results = [];
  for (let prefixLength = 2; prefixLength <= Math.min(6, token.length - 2); prefixLength++) {
    const prefix = token.slice(0, prefixLength);
    if (!/^[A-Z0-9]+$/.test(prefix) || !/[A-Z]/.test(prefix)) continue;
    const rest = token.slice(prefixLength);
    const regionOptions = [''];
    for (const region of REGION_PATTERN.split('|')) if (rest.startsWith(region)) regionOptions.push(region);
    for (const region of regionOptions) {
      const numberPart = rest.slice(region.length);
      const m = numberPart.match(NUMBER_RE);
      if (!m) continue;
      const digits = fixDigits(m[2]);
      if (countDigits(m[2]) < 2 && region === '' && !m[1] && !m[3]) continue;
      if (countDigits(digits) < 2) continue;
      results.push({
        prefix, region, lang: regionToLanguage(region), digits, numberText: `${m[1]}${digits}${m[3]}`,
        number: normalizeNumber(m[1], digits, m[3]), key: `${prefix}|${normalizeNumber(m[1], digits, m[3])}`,
        printed: formatPrintedCode({ prefix, region, digits: `${m[1]}${digits}${m[3]}` })
      });
    }
  }
  return results;
}

export function extractCodeCandidates(rawText = '') {
  const upper = String(rawText).toUpperCase().replace(/[“”‘’`´']/g, '');
  const out = new Map();
  for (const line of upper.split(/\r?\n/)) {
    const tokens = line.split(/[^A-Z0-9]+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      for (let span = 1; span <= 3 && i + span <= tokens.length; span++) {
        const joined = tokens.slice(i, i + span).join('');
        if (joined.length < 4 || joined.length > 12) continue;
        for (const parsed of parseToken(joined)) {
          const id = `${parsed.key}|${parsed.region}`;
          if (!out.has(id)) out.set(id, parsed);
          if (out.size >= 80) return [...out.values()];
        }
      }
    }
  }
  return [...out.values()];
}

export function normalizePasscode(value) { return String(value ?? '').replace(/\D/g, '').replace(/^0+/, ''); }

export function extractPasscodes(rawText = '') {
  const tokens = String(rawText).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const found = new Set();
  const consider = token => {
    if (!/^[0-9OQILSBZG]{7,8}$/.test(token) || countDigits(token) < 5) return;
    const normalized = normalizePasscode(fixDigits(token));
    if (normalized.length >= 6) found.add(normalized);
  };
  for (let i = 0; i < tokens.length; i++) {
    consider(tokens[i]);
    if (tokens[i + 1] && /^\d{3,5}$/.test(tokens[i]) && /^\d{3,5}$/.test(tokens[i + 1])) consider(tokens[i] + tokens[i + 1]);
  }
  return [...found];
}

/** Prefijos del catálogo que coinciden con el leído (exacto o con UNA confusión típica de OCR). */
export function resolvePrefixes(prefix, prefixSet) {
  if (prefixSet.has(prefix)) return [{ prefix, fuzzy: false }];
  const out = [];
  for (const known of prefixSet) {
    if (known.length !== prefix.length) continue;
    let diff = 0, ok = true;
    for (let i = 0; i < known.length && ok; i++) {
      if (known[i] === prefix[i]) continue;
      diff++;
      ok = diff === 1 && CONFUSABLE_PAIRS.some(p => (p[0] === known[i] && p[1] === prefix[i]) || (p[1] === known[i] && p[0] === prefix[i]));
    }
    if (ok && diff === 1) out.push({ prefix: known, fuzzy: true });
  }
  return out;
}

/** "1st Edition", "1ª Edición", "Limited Edition", "Edición Limitada" → acabado sugerido. */
export function detectEdition(text = '') {
  const t = String(text).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  if (/1\s*(?:st|a|\.?\s*a)?\s*(?:edition|edicion)\b|primera\s+edicion|\b1st\b/.test(t)) return '1st Edition';
  if (/limited\s+edition|edicion\s+limitada/.test(t)) return 'Limited Edition';
  return null;
}
