/**
 * Local file storage using IndexedDB — stores file blobs entirely in the
 * browser so uploads work without any remote storage backend (R2 Worker or
 * Supabase Storage). Files persist across reloads until the user clears
 * browser data. Each file is keyed by its database record id.
 */

const DB_NAME = 'jpu-it-hub-files';
const STORE_NAME = 'files';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalFile(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getLocalFile(key: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => { db.close(); resolve((req.result as Blob) ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function deleteLocalFile(key: string): Promise<boolean> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getLocalFileUrl(key: string): Promise<string | null> {
  const blob = await getLocalFile(key);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function downloadLocalFile(key: string, fallbackName: string): Promise<void> {
  const blob = await getLocalFile(key);
  if (!blob) throw new Error('File not found in local storage');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackName || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
