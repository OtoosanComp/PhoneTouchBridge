/** Similitud de texto tolerante a OCR (bigramas de caracteres, coeficiente de Dice). */
export function bigrams(text) {
  const padded = ` ${text} `;
  const set = new Set();
  for (let i = 0; i < padded.length - 1; i++) set.add(padded.slice(i, i + 2));
  return set;
}

export function dice(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let overlap = 0;
  for (const gram of small) if (large.has(gram)) overlap++;
  return (2 * overlap) / (a.size + b.size);
}

/** line y name ya normalizados (minúsculas, sin acentos). */
export function nameSimilarity(line, name, lineGrams = bigrams(line), nameGrams = bigrams(name)) {
  if (!line || !name) return { sim: 0, exact: false };
  if (line === name) return { sim: 1, exact: true };
  if (line.length > name.length && (` ${line} `).includes(` ${name} `) && name.length / line.length >= 0.85) return { sim: 1, exact: true };
  const compactLine = line.replace(/ /g, ''), compactName = name.replace(/ /g, '');
  if (compactLine === compactName) return { sim: 0.99, exact: true };
  let sim = dice(lineGrams, nameGrams);
  if (compactLine.length >= 5 && compactName.length >= 5) sim = Math.max(sim, dice(bigrams(compactLine), bigrams(compactName)));
  return { sim, exact: false };
}
