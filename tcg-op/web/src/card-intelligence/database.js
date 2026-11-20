const DB_NAME = 'TCGOPIntelligence';
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB is not available in this browser'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('catalog')) {
        const store = db.createObjectStore('catalog', { keyPath: 'catalogKey' });
        store.createIndex('game', 'game', { unique: false });
        store.createIndex('name', 'searchName', { unique: false });
      }
      if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('learning')) db.createObjectStore('learning', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local database'));
  });
}

export async function getCatalogRecords(game) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('catalog', 'readonly');
    const request = tx.objectStore('catalog').index('game').getAll(game);
    request.onsuccess = () => { resolve(request.result || []); db.close(); };
    request.onerror = () => { reject(request.error); db.close(); };
  });
}

export async function replaceCatalogRecords(game, records) {
  if (!Array.isArray(records) || !records.length) throw new Error(`Refusing to replace ${game} catalog with an empty dataset`);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('catalog', 'readwrite');
    const store = tx.objectStore('catalog');
    const cursorRequest = store.index('game').openCursor(IDBKeyRange.only(game));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) { cursor.delete(); cursor.continue(); return; }
      for (const record of records) store.put({ ...record, catalogKey: `${record.game}|${record.id}|${record.setCode || ''}`.toLowerCase() });
    };
    tx.oncomplete = () => { db.close(); resolve(records.length); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Catalog transaction failed')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Catalog transaction aborted')); };
  });
}

export async function getMetadata(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('metadata', 'readonly').objectStore('metadata').get(key);
    request.onsuccess = () => { resolve(request.result?.value ?? null); db.close(); };
    request.onerror = () => { reject(request.error); db.close(); };
  });
}

export async function setMetadata(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('metadata', 'readwrite');
    tx.objectStore('metadata').put({ key, value, updatedAt: new Date().toISOString() });
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function saveLearningRecord(record) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('learning', 'readwrite');
    tx.objectStore('learning').put(record);
    tx.oncomplete = () => { db.close(); resolve(record); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getLearningRecords(game = null) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('learning', 'readonly').objectStore('learning').getAll();
    request.onsuccess = () => { resolve((request.result || []).filter(row => !game || row.game === game)); db.close(); };
    request.onerror = () => { reject(request.error); db.close(); };
  });
}
