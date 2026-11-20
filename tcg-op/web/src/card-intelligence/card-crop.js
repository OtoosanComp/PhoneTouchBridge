/** Detecta el recuadro de la carta sobre un fondo bastante uniforme. Devuelve null si no hay certeza. */
export function detectCardBox(rgba, width, height) {
  if (!rgba || width < 40 || height < 40) return null;
  const px = (x, y) => { const i = (y * width + x) * 4; return [rgba[i], rgba[i + 1], rgba[i + 2]]; };
  const ring = [];
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.03));
  for (let x = 0; x < width; x += 2) for (let b = 0; b < band; b++) { ring.push(px(x, b), px(x, height - 1 - b)); }
  for (let y = 0; y < height; y += 2) for (let b = 0; b < band; b++) { ring.push(px(b, y), px(width - 1 - b, y)); }
  const med = c => { const v = ring.map(p => p[c]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const bg = [med(0), med(1), med(2)];
  const rowCount = new Array(height).fill(0), colCount = new Array(width).fill(0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = px(x, y);
    if (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 70) { rowCount[y]++; colCount[x]++; }
  }
  const firstLast = (counts, size) => {
    const limit = size * 0.18;
    let first = counts.findIndex(c => c > limit);
    let last = counts.length - 1 - [...counts].reverse().findIndex(c => c > limit);
    return first < 0 || last <= first ? null : [first, last];
  };
  const rows = firstLast(rowCount, width), cols = firstLast(colCount, height);
  if (!rows || !cols) return null;
  const pad = 0.012;
  const x0 = Math.max(0, cols[0] / width - pad), x1 = Math.min(1, (cols[1] + 1) / width + pad);
  const y0 = Math.max(0, rows[0] / height - pad), y1 = Math.min(1, (rows[1] + 1) / height + pad);
  const area = (x1 - x0) * (y1 - y0);
  const aspect = ((x1 - x0) * width) / ((y1 - y0) * height);
  if (area < 0.25 || area > 0.97 || aspect < 0.5 || aspect > 0.9) return null;
  return { x0, y0, x1, y1 };
}
