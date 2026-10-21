// 저장소 계층 — 데모(localStorage) / Firebase(Firestore) 공통 인터페이스
//   경로 규칙: 'collection/docId' 또는 'collection/docId/sub/subId'
import { FIREBASE } from './config.js?v=0.1.54';

const clean = (o) => JSON.parse(JSON.stringify(o ?? null));
export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ───────────── 데모 모드 ─────────────
// 데모 체험(베타): 실제 데이터를 이 기기에 복사해 두고 그 안에서만 마음껏 시험 — 서버에는 아무것도 쓰지 않음
export const SANDBOX_KEY = 'teamapp:sandbox:db';
export const inSandbox = () => { try { return localStorage.getItem('teamapp:sandbox') === '1'; } catch { return false; } };
function localBackend(KEY = 'teamapp:db:v1', mode = 'demo') {
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  let data = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.warn(e); } };
  const docW = new Map(); // path -> Set(cb)
  const colW = new Map(); // colPath -> Set(cb)
  const isChild = (col, p) => p.startsWith(col + '/') && !p.slice(col.length + 1).includes('/');
  const listOf = (col) => Object.keys(data).filter((p) => isChild(col, p))
    .map((p) => ({ id: p.split('/').pop(), ...clean(data[p]) }));
  const notify = (path) => {
    (docW.get(path) || []).forEach((cb) => cb(data[path] ? { id: path.split('/').pop(), ...clean(data[path]) } : null));
    const col = path.split('/').slice(0, -1).join('/');
    (colW.get(col) || []).forEach((cb) => cb(listOf(col)));
  };
  const notifyAll = () => {
    docW.forEach((_, p) => notify(p));
    colW.forEach((set, col) => set.forEach((cb) => cb(listOf(col))));
  };
  window.addEventListener('storage', (e) => { if (e.key === KEY) { data = load(); notifyAll(); } });
  const sub = (map, k, cb) => { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(cb); return () => map.get(k).delete(cb); };

  return {
    mode,
    async get(path) { return data[path] ? { id: path.split('/').pop(), ...clean(data[path]) } : null; },
    async list(col) { return listOf(col); },
    async set(path, value, { merge = false } = {}) {
      data[path] = merge ? { ...(data[path] || {}), ...clean(value) } : clean(value);
      save(); notify(path);
    },
    async del(path) {
      Object.keys(data).forEach((p) => { if (p === path || p.startsWith(path + '/')) delete data[p]; });
      save(); notify(path);
    },
    async tx(path, fn) { // fn(current) -> next (null이면 변경 없음)
      data = load();
      const next = fn(data[path] ? clean(data[path]) : null);
      if (next) { data[path] = clean(next); save(); notify(path); }
      return next;
    },
    watchDoc(path, cb) { cb(data[path] ? { id: path.split('/').pop(), ...clean(data[path]) } : null); return sub(docW, path, cb); },
    watchCol(col, cb) { cb(listOf(col)); return sub(colW, col, cb); },
    exportAll() { return clean(data); },
    async importAll(obj) { data = clean(obj) || {}; save(); notifyAll(); },
  };
}

// ───────────── Firebase 모드 ─────────────
async function firebaseBackend(cfg) {
  const V = '10.12.2';
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const authMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const app = appMod.initializeApp(cfg);
  // 기기에 데이터를 저장해 두고(오프라인 캐시) 다시 열 때는 바뀐 것만 받아 옴 → Firestore 읽기 사용량 크게 줄임
  let fs;
  try { fs = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }) }); }
  catch (e) { console.warn('오프라인 캐시를 쓸 수 없어 기본 연결로', e); fs = fsMod.getFirestore(app); }
  const auth = authMod.getAuth(app);
  let authError = null;
  await authMod.signInAnonymously(auth).catch((e) => { authError = e.code || String(e); console.warn('익명 로그인 실패', e); });
  const { doc, collection, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, runTransaction } = fsMod;
  const wrap = (snap) => (snap.exists() ? { id: snap.id, ...snap.data() } : null);

  return {
    mode: 'firebase',
    authError,
    async get(path) { return wrap(await getDoc(doc(fs, path))); },
    async list(col) { const s = await getDocs(collection(fs, col)); return s.docs.map((d) => ({ id: d.id, ...d.data() })); },
    async set(path, value, { merge = false } = {}) { await setDoc(doc(fs, path), clean(value), { merge }); },
    async del(path) { await deleteDoc(doc(fs, path)); },
    async tx(path, fn) {
      return runTransaction(fs, async (t) => {
        const ref = doc(fs, path);
        const s = await t.get(ref);
        const next = fn(s.exists() ? s.data() : null);
        if (next) t.set(ref, clean(next));
        return next;
      });
    },
    watchDoc(path, cb) { return onSnapshot(doc(fs, path), (s) => cb(wrap(s))); },
    watchCol(col, cb) { return onSnapshot(collection(fs, col), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })))); },
    exportAll: null,
    importAll: null,
  };
}

export let db = null;
export async function initStore() {
  if (inSandbox()) { db = localBackend(SANDBOX_KEY, 'sandbox'); return db; }
  if (FIREBASE.apiKey && FIREBASE.projectId) {
    try { db = await firebaseBackend(FIREBASE); return db; }
    catch (e) { console.error('Firebase 연결 실패 → 데모 모드로 전환', e); }
  }
  db = localBackend();
  return db;
}
