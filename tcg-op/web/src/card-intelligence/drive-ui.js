import { GoogleDriveBackup, createBackupDocument, createSyncState, markSyncSuccess, shouldAttemptSync } from './drive-sync.mjs';

const $ = id => document.getElementById(id);
const CLIENT_KEY = 'tcg_op_google_oauth_client_id';
let drive = null;
let connected = false;
const status = message => { if ($('driveSyncStatus')) $('driveSyncStatus').textContent = message; };

const savedClientId = localStorage.getItem(CLIENT_KEY) || '';
if ($('googleClientId')) $('googleClientId').value = savedClientId;

$('saveDriveConfigBtn')?.addEventListener('click', () => {
  const value = $('googleClientId').value.trim();
  if (!value) return status('Introduce el OAuth Client ID de tu proyecto de Google Cloud.');
  localStorage.setItem(CLIENT_KEY, value);
  status('Client ID guardado en este dispositivo. Todavía falta autorizar Google Drive.');
});

async function uploadPendingBackup() {
  const clientId = $('googleClientId')?.value.trim() || localStorage.getItem(CLIENT_KEY);
  if (!clientId || !drive || !connected || !navigator.onLine) return false;
  const state = JSON.parse(localStorage.getItem('tcg_op_drive_sync_state') || '{"pending":false}');
  if (!state.pending) return false;
  try {
    const document = window.TCGCreateBackupDocument ? await window.TCGCreateBackupDocument() : createBackupDocument(JSON.parse(localStorage.getItem('tcg_op_inventory_v01') || '[]'));
    const uploaded = await drive.uploadBackup(document);
    localStorage.setItem('tcg_op_drive_sync_state', JSON.stringify(markSyncSuccess(createSyncState(), uploaded.id)));
    status(`Sincronización automática confirmada en Drive: ${uploaded.name || 'TCG OP backup'}.`);
    return true;
  } catch (error) { status(`Sincronización pendiente: ${error.message}. Los datos locales están seguros.`); return false; }
}

$('driveBackupBtn')?.addEventListener('click', async () => {
  const clientId = $('googleClientId').value.trim() || localStorage.getItem(CLIENT_KEY);
  if (!clientId) return status('Primero configura tu Google OAuth Client ID.');
  if (!navigator.onLine) return status('Sin internet. El inventario sigue funcionando localmente; el respaldo queda pendiente.');
  const button = $('driveBackupBtn');
  button.disabled = true;
  try {
    status('Solicitando autorización de Google…');
    drive = new GoogleDriveBackup({ clientId, onStatus: status });
    await drive.connect();
    connected = true;
    status('Preparando respaldo local con fotografías…');
    const document = window.TCGCreateBackupDocument
      ? await window.TCGCreateBackupDocument()
      : createBackupDocument(JSON.parse(localStorage.getItem('tcg_op_inventory_v01') || '[]'));
    const uploaded = await drive.uploadBackup(document);
    const synced = markSyncSuccess(createSyncState(), uploaded.id);
    localStorage.setItem('tcg_op_drive_sync_state', JSON.stringify(synced));
    status(`Respaldo confirmado en Google Drive: ${uploaded.name || 'TCG OP backup'}.`);
  } catch (error) {
    status(`No se completó el respaldo: ${error.message}. Tus datos siguen guardados localmente.`);
  } finally { button.disabled = false; }
});

window.addEventListener('tcg-op-data-changed', () => { if (connected && navigator.onLine) uploadPendingBackup(); });
window.addEventListener('online', async () => {
  const state = JSON.parse(localStorage.getItem('tcg_op_drive_sync_state') || '{"pending":false}');
  if (shouldAttemptSync(state, navigator.onLine)) {
    if (connected) await uploadPendingBackup();
    else status('Conexión recuperada. Hay cambios locales pendientes; conecta Drive para respaldarlos.');
  }
});
window.addEventListener('offline', () => status('Sin internet. Inventario y operaciones locales siguen disponibles.'));
