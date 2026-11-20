export function createBackupDocument(cards, now = new Date()) {
  if (!Array.isArray(cards)) throw new TypeError('Inventory must be an array');
  return { app: 'TCG OP', version: 2, exportedAt: now.toISOString(), cards };
}

export function createSyncState(overrides = {}) {
  return { pending: true, fileId: null, syncedAt: null, ...overrides };
}

export function shouldAttemptSync(state, online) {
  return Boolean(online && state?.pending);
}

export function markSyncSuccess(state, fileId, now = new Date()) {
  if (!fileId) throw new Error('Drive did not return a file ID');
  return { ...state, pending: false, fileId, syncedAt: now.toISOString() };
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar la autenticación de Google.'));
    document.head.append(script);
  });
}

export class GoogleDriveBackup {
  constructor({ clientId, onStatus = () => {} }) {
    this.clientId = clientId;
    this.onStatus = onStatus;
    this.token = null;
    this.folderId = localStorage.getItem('tcg_op_drive_folder_id');
    this.tokenClient = null;
  }

  async connect() {
    if (!this.clientId?.trim()) throw new Error('Configura primero tu Google OAuth Client ID.');
    if (!navigator.onLine) throw new Error('Drive requiere conexión a internet. Tus datos locales siguen disponibles.');
    await loadGoogleIdentity();
    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId.trim(),
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: response => {
        if (response.error) this._rejectToken?.(new Error(response.error));
        else { this.token = response.access_token; this._resolveToken?.(this.token); }
      }
    });
    return new Promise((resolve, reject) => {
      this._resolveToken = resolve;
      this._rejectToken = reject;
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  async _request(url, options = {}) {
    if (!this.token) throw new Error('Conecta primero tu cuenta de Google Drive.');
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${this.token}`, ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`Google Drive respondió ${response.status}: ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }

  async _getFolder() {
    if (this.folderId) return this.folderId;
    const query = encodeURIComponent("name='TCG_OP' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const found = await this._request(`${DRIVE_API}/files?q=${query}&fields=files(id,name)&pageSize=10`);
    if (found.files?.length) this.folderId = found.files[0].id;
    else {
      const folder = await this._request(`${DRIVE_API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'TCG_OP', mimeType: 'application/vnd.google-apps.folder' }) });
      this.folderId = folder.id;
    }
    localStorage.setItem('tcg_op_drive_folder_id', this.folderId);
    return this.folderId;
  }

  async uploadBackup(document) {
    if (!navigator.onLine) throw new Error('Sin internet. El respaldo quedó pendiente en este dispositivo.');
    if (!this.token) await this.connect();
    const folderId = await this._getFolder();
    const boundary = `tcg_op_${crypto.randomUUID()}`;
    const metadata = { name: `tcg-op-backup-${new Date().toISOString().replaceAll(':', '-')}.json`, mimeType: 'application/json', parents: [folderId] };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(document)}\r\n--${boundary}--`;
    const result = await this._request(`${UPLOAD_API}?uploadType=multipart&fields=id,name,webViewLink`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    return result;
  }
}
