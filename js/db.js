// ===== 資料層 =====
// 只負責「存 / 取 / 匯出 / 匯入」，完全不碰畫面。
// 將來要搬去原生 App，這層的邏輯可以直接搬。
//
// 資料表（IndexedDB object stores）：
//   exercises  動作   {id, name, muscles:[{muscle, weight}], createdAt}
//   templates  分部範本 {id, name, exerciseIds:[...], createdAt}
//   sessions   一次訓練 {id, date:'YYYY-MM-DD', templateId, note, createdAt}
//   sets       一組    {id, sessionId, exerciseId, setOrder, weight, reps, isWarmup}

const DB_NAME = 'fit-track';
const DB_VERSION = 1;
const STORES = ['exercises', 'templates', 'sessions', 'sets'];

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('exercises'))
        db.createObjectStore('exercises', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('templates'))
        db.createObjectStore('templates', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sessions'))
        db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sets')) {
        const s = db.createObjectStore('sets', { keyPath: 'id' });
        s.createIndex('by_session', 'sessionId', { unique: false });
        s.createIndex('by_exercise', 'exerciseId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

// 把一個 IDBRequest 包成 Promise。
function reqAsync(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx(storeNames, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
    result = fn(t);
  });
}

// 產生唯一 id。
export function uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
}

// ---- 通用 CRUD ----
export async function getAll(store) {
  const db = await openDB();
  return reqAsync(db.transaction(store, 'readonly').objectStore(store).getAll());
}
export async function get(store, id) {
  const db = await openDB();
  return reqAsync(db.transaction(store, 'readonly').objectStore(store).get(id));
}
export async function put(store, obj) {
  await tx(store, 'readwrite', (t) => t.objectStore(store).put(obj));
  return obj;
}
export async function del(store, id) {
  return tx(store, 'readwrite', (t) => t.objectStore(store).delete(id));
}

// ---- sets 的特定查詢 ----
export async function setsBySession(sessionId) {
  const db = await openDB();
  const idx = db.transaction('sets', 'readonly').objectStore('sets').index('by_session');
  const rows = await reqAsync(idx.getAll(sessionId));
  return rows.sort((a, b) => a.setOrder - b.setOrder);
}
export async function setsByExercise(exerciseId) {
  const db = await openDB();
  const idx = db.transaction('sets', 'readonly').objectStore('sets').index('by_exercise');
  return reqAsync(idx.getAll(exerciseId));
}

// ---- 連帶刪除 ----
export async function deleteSessionCascade(sessionId) {
  const sets = await setsBySession(sessionId);
  await tx(['sessions', 'sets'], 'readwrite', (t) => {
    sets.forEach((s) => t.objectStore('sets').delete(s.id));
    t.objectStore('sessions').delete(sessionId);
  });
}

// ---- 備份：匯出 / 匯入（保命繩）----
export async function exportAll() {
  const data = {};
  for (const s of STORES) data[s] = await getAll(s);
  return {
    app: 'fit-track',
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

// mode: 'replace'（清空後匯入）或 'merge'（以 id 覆蓋合併）
export async function importAll(payload, mode = 'replace') {
  if (!payload || !payload.data) throw new Error('檔案格式不正確');
  const data = payload.data;
  await tx(STORES, 'readwrite', (t) => {
    for (const s of STORES) {
      const store = t.objectStore(s);
      if (mode === 'replace') store.clear();
      (data[s] || []).forEach((row) => store.put(row));
    }
  });
}

export async function wipeAll() {
  await tx(STORES, 'readwrite', (t) => STORES.forEach((s) => t.objectStore(s).clear()));
}

// 預設資料：資料庫完全為空時，載入預設動作庫 + 範本（不含訓練紀錄）。
import { SEED } from './seed.js';
export async function ensureSeed() {
  const [ex, sessions] = await Promise.all([getAll('exercises'), getAll('sessions')]);
  if (ex.length || sessions.length) return false; // 已有任何資料就不種
  await tx(['exercises', 'templates'], 'readwrite', (t) => {
    (SEED.exercises || []).forEach((e) => t.objectStore('exercises').put(e));
    (SEED.templates || []).forEach((tp) => t.objectStore('templates').put(tp));
  });
  return true;
}
