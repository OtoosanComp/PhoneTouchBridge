import { normalizePasscode } from './codes.js';

/**
 * Convierte un archivo de nombres alternos (p. ej. español) en { passcode: [nombres] }.
 * Formatos aceptados:
 *  - { "46986414": "Mago Oscuro", "38033121": ["Maga Oscura"] }
 *  - [ { "id": 46986414, "name_es": "Mago Oscuro" }, ... ]   (name_es | es | nombre | name)
 *  - { "data": [ { "id": 46986414, "name": "Mago Oscuro" } ] }
 */
export function parseAliasFile(json) {
  const out = {};
  const add = (id, value) => {
    const key = normalizePasscode(id);
    if (!key) return;
    for (const name of [].concat(value ?? [])) {
      const text = String(name || '').trim();
      if (text.length >= 3 && text.length <= 80) (out[key] ||= []).includes(text) || out[key].push(text);
    }
  };
  const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : null;
  if (rows) {
    for (const row of rows) add(row?.id ?? row?.passcode, row?.name_es ?? row?.es ?? row?.nombre ?? row?.name);
  } else if (json && typeof json === 'object') {
    for (const [id, value] of Object.entries(json)) add(id, value);
  } else {
    throw new Error('Formato de nombres no reconocido');
  }
  if (!Object.keys(out).length) throw new Error('El archivo no contiene nombres con passcode válido');
  return out;
}

export function mergeAliasMaps(a = {}, b = {}) {
  const out = { ...a };
  for (const [key, names] of Object.entries(b)) out[key] = [...new Set([...(out[key] || []), ...names])];
  return out;
}
