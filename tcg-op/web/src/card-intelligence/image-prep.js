export async function prepareImageForAnalysis(file, rotation = 0) {
  if (!(file instanceof Blob) || !file.type.startsWith('image/')) throw new Error('Selecciona una imagen válida.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file);
  }
  const angle = ((Number(rotation) || 0) % 360 + 360) % 360;
  const swap = angle === 90 || angle === 270;
  const width = swap ? bitmap.height : bitmap.width;
  const height = swap ? bitmap.width : bitmap.height;
  // Preserve enough pixels for small collector numbers; cap only very large images.
  const scale = Math.min(1, 2600 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(angle * Math.PI / 180);
  ctx.drawImage(bitmap, -bitmap.width * scale / 2, -bitmap.height * scale / 2, bitmap.width * scale, bitmap.height * scale);
  ctx.restore();
  bitmap.close?.();
  // Mild contrast adjustment improves OCR without aggressive thresholding.
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = frame.data, contrast = 1.12, brightness = 2;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) d[i+c] = Math.max(0, Math.min(255, (d[i+c]-128)*contrast+128+brightness));
  }
  ctx.putImageData(frame, 0, 0);
  return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo preparar la fotografía.')), 'image/jpeg', 0.94));
}
