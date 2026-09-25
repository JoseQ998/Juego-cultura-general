// Capa de almacenamiento: Firebase (compartido) o localStorage (solo este dispositivo).
import { CONFIG } from './config.js';

const FIREBASE_VERSION = '10.12.2';
let impl = null;

export async function init() {
  const cfg = CONFIG.firebase;
  if (cfg && cfg.apiKey && cfg.projectId) {
    try {
      impl = await firebaseImpl(cfg);
      return impl.kind;
    } catch (e) {
      console.error('No se pudo conectar con Firebase; se usa el modo local.', e);
    }
  }
  impl = localImpl();
  return impl.kind;
}

export const kind = () => impl?.kind;
export const submitScore = (board, entry) => impl.submitScore(board, entry);
export const getRanking = (board, n = 50) => impl.getRanking(board, n);
export const addLog = (entry) => impl.addLog(entry);
export const getLogs = (n = 1000) => impl.getLogs(n);
export const saveLobby = (lobby) => impl.saveLobby(lobby);
export const getLobby = (code) => impl.getLobby(code);
export const listLobbies = (n = 30) => impl.listLobbies(n);
export const canClearLogs = () => !!impl?.clearLogs;
export const clearLogs = () => impl.clearLogs();

// ¿La partida a es mejor que b? (más puntos; a igualdad, menos tiempo)
function isBetter(a, b) {
  if (!b) return true;
  return a.score > b.score || (a.score === b.score && a.timeMs < b.timeMs);
}
const sortRanking = (list) => list.sort((a, b) => b.score - a.score || a.timeMs - b.timeMs);
// Prefijo para que ningún nombre choque con IDs reservados de Firestore ('.', '..', '__x__').
const docId = (nameKey) => 'n_' + encodeURIComponent(nameKey).slice(0, 200);

// Los datos que vienen de la base de datos se normalizan para que un registro
// manipulado no pueda romper la página.
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v) => (v == null ? '' : String(v));
const cleanScore = (r) => ({ ...r, name: str(r.name), score: num(r.score), correct: num(r.correct), total: num(r.total) || 15, timeMs: num(r.timeMs), ts: num(r.ts) });
const cleanLog = (l) => ({
  ...cleanScore(l),
  nameKey: str(l.nameKey), mode: str(l.mode), board: str(l.board), boardLabel: str(l.boardLabel),
  tabSwitches: num(l.tabSwitches), deviceId: str(l.deviceId), fp: str(l.fp), ip: l.ip ? str(l.ip) : null, ua: str(l.ua),
});
const cleanLobby = (l) => ({ ...l, code: str(l.code), name: str(l.name), createdAt: num(l.createdAt) });

function localImpl() {
  const read = (k, d) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
  };
  const write = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  };
  return {
    kind: 'local',
    async submitScore(board, entry) {
      const all = read('cg_rank', {});
      const b = all[board] || {};
      if (isBetter(entry, b[entry.nameKey])) b[entry.nameKey] = entry;
      all[board] = b;
      write('cg_rank', all);
    },
    async getRanking(board, n) {
      const b = read('cg_rank', {})[board] || {};
      return sortRanking(Object.values(b).map(cleanScore)).slice(0, n);
    },
    async addLog(entry) {
      const logs = read('cg_log', []);
      logs.push(entry);
      if (logs.length > 2000) logs.splice(0, logs.length - 2000);
      write('cg_log', logs);
    },
    async getLogs(n) {
      return read('cg_log', []).slice(-n).reverse().map(cleanLog);
    },
    async saveLobby(lobby) {
      const all = read('cg_lobbies', {});
      all[lobby.code] = lobby;
      write('cg_lobbies', all);
    },
    async getLobby(code) {
      return read('cg_lobbies', {})[code] || null;
    },
    async listLobbies(n) {
      return Object.values(read('cg_lobbies', {}))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, n);
    },
    async clearLogs() {
      write('cg_log', []);
    },
  };
}

async function firebaseImpl(cfg) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [{ initializeApp }, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const {
    getFirestore, doc, getDoc, setDoc, addDoc, collection,
    query, orderBy, limit, getDocs, runTransaction,
  } = fs;
  const db = getFirestore(initializeApp(cfg));

  return {
    kind: 'firebase',
    async submitScore(board, entry) {
      const ref = doc(db, 'boards', board, 'scores', docId(entry.nameKey));
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists() || isBetter(entry, snap.data())) tx.set(ref, entry);
      });
    },
    async getRanking(board, n) {
      const q = query(collection(db, 'boards', board, 'scores'), orderBy('score', 'desc'), limit(n));
      const snap = await getDocs(q);
      return sortRanking(snap.docs.map((d) => cleanScore(d.data())));
    },
    async addLog(entry) {
      await addDoc(collection(db, 'logs'), entry);
    },
    async getLogs(n) {
      const snap = await getDocs(query(collection(db, 'logs'), orderBy('ts', 'desc'), limit(n)));
      return snap.docs.map((d) => cleanLog(d.data()));
    },
    async saveLobby(lobby) {
      await setDoc(doc(db, 'lobbies', lobby.code), lobby);
    },
    async getLobby(code) {
      const snap = await getDoc(doc(db, 'lobbies', code));
      return snap.exists() ? cleanLobby(snap.data()) : null;
    },
    async listLobbies(n) {
      const snap = await getDocs(query(collection(db, 'lobbies'), orderBy('createdAt', 'desc'), limit(n)));
      return snap.docs.map((d) => cleanLobby(d.data()));
    },
    clearLogs: null, // en Firebase se borra desde la consola de Firebase
  };
}
