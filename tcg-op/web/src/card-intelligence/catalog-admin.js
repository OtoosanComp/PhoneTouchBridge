import { syncAllCatalogs } from './catalog-sync.js';
import { getMetadata, setMetadata, getLearningRecords } from './database.js';
import { parseAliasFile, mergeAliasMaps } from './aliases.js';
import { invalidateCatalogIndex } from './catalog.js';

const $ = id => document.getElementById(id);
const button = $('syncCatalogsBtn');
const status = $('catalogSyncStatus');
const summary = $('catalogSummary');

async function refreshSummary() {
  const [rift, ygo, learning, fx, aliases] = await Promise.all([
    getMetadata('riftboundCatalog'), getMetadata('yugiohCatalog'),
    getLearningRecords(), getMetadata('usdMxn'), getMetadata('ygoAliasesEs')
  ]);
  let storageText = 'Almacenamiento: no disponible';
  try { const estimate = await navigator.storage?.estimate?.(); if (estimate?.usage != null && estimate?.quota != null) storageText = `Almacenamiento usado: ${(estimate.usage / 1048576).toFixed(1)} MB de ${(estimate.quota / 1048576).toFixed(0)} MB`; } catch {}
  const lines = [
    `Riftbound: ${rift?.count || 0} impresiones`,
    `Yu-Gi-Oh!: ${ygo?.count || 0} impresiones`,
    `Correcciones aprendidas: ${learning.length}`,
    `Nombres en español importados: ${Object.keys(aliases || {}).length}`,
    `USD/MXN: ${fx?.rate ? fx.rate.toFixed(4) : 'sin actualizar'}`,
    storageText
  ];
  summary.textContent = lines.join(' · ');
}

button?.addEventListener('click', async () => {
  button.disabled = true;
  button.textContent = 'Actualizando catálogos…';
  status.textContent = 'Preparando descarga. No cierres esta pantalla.';
  try { await navigator.storage?.persist?.(); } catch {}
  try {
    const result = await syncAllCatalogs({ onProgress: message => { status.textContent = message; } });
    const counts = result.results.map(item => `${item.game}: ${item.count.toLocaleString('es-MX')} impresiones${item.skipped ? ' (sin cambios)' : ''}`).join(' · ');
    status.textContent = `Biblioteca local actualizada. ${counts}${result.fx ? ` · USD/MXN ${result.fx.rate.toFixed(4)}` : ''}`;
    invalidateCatalogIndex();
    await refreshSummary();
  } catch (error) {
    status.textContent = `No se reemplazó ningún catálogo incompleto. ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = 'Descargar / actualizar catálogos';
  }
});

refreshSummary().catch(error => { if (summary) summary.textContent = `Biblioteca local pendiente de inicializar: ${error.message}`; });

// Importar nombres de cartas en español (archivo JSON propio). Se suman a los que la app ya conoce.
const aliasButton = $('importAliasesBtn');
const aliasInput = $('aliasesFile');
const aliasStatus = $('aliasStatus');
aliasButton?.addEventListener('click', () => aliasInput?.click());
aliasInput?.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const incoming = parseAliasFile(JSON.parse(await file.text()));
    const prior = await getMetadata('ygoAliasesEs');
    const merged = mergeAliasMaps(prior && typeof prior === 'object' ? prior : {}, incoming);
    await setMetadata('ygoAliasesEs', merged);
    invalidateCatalogIndex('Yu-Gi-Oh!');
    aliasStatus.textContent = `Nombres importados: ${Object.keys(incoming).length.toLocaleString('es-MX')} cartas (total ${Object.keys(merged).length.toLocaleString('es-MX')}).`;
    await refreshSummary();
  } catch (error) {
    aliasStatus.textContent = `No se importó el archivo: ${error.message}`;
  } finally {
    aliasInput.value = '';
  }
});
