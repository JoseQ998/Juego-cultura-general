// Capa de almacenamiento: Supabase (compartido) o localStorage (solo este dispositivo).
import { CONFIG } from './config.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';
let impl = null;

export async function init() {
  const cfg = CONFIG.supabase;
  if (cfg && cfg.url && cfg.key) {
    try {
      impl = await supabaseImpl(cfg);
      await impl.ping();
    } catch (e) {
      console.error('Error al conectar con Supabase', e);
      impl = impl || { kind: 'supabase' };
      impl.error = e?.message || String(e);
    }
    return impl.kind;
  }
  impl = localImpl();
  return impl.kind;
}

export const kind = () => impl?.kind;
export const error = () => impl?.error || null;
export const submitScore = (board, entry) => impl.submitScore(board, entry);
export const getRanking = (board, n = 50) => impl.getRanking(board, n);
export const addLog = (entry) => impl.addLog(entry);
// Devuelve 'ok', 'bad' (PIN incorrecto) o 'unset' (PIN sin configurar en Supabase).
export const checkPin = (pin) => impl.checkPin(pin);
export const getLogs = (pin, n = 1000) => impl.getLogs(pin, n);
export const clearLogs = (pin) => impl.clearLogs(pin);
export const saveLobby = (lobby) => impl.saveLobby(lobby);
export const getLobby = (code) => impl.getLobby(code);
export const listLobbies = (n = 30) => impl.listLobbies(n);

// ¿La partida a es mejor que b? (más puntos; a igualdad, menos tiempo)
function isBetter(a, b) {
  if (!b) return true;
  return a.score > b.score || (a.score === b.score && a.timeMs < b.timeMs);
}
const sortRanking = (list) => list.sort((a, b) => b.score - a.score || a.timeMs - b.timeMs);

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
const cleanLobby = (l) => ({ ...l, code: str(l.code), name: str(l.name), cats: Array.isArray(l.cats) ? l.cats.map(str) : [], createdAt: num(l.createdAt) });

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
    async checkPin(pin) {
      return pin === String(CONFIG.ADMIN_PIN) ? 'ok' : 'bad';
    },
    async getLogs(pin, n) {
      if ((await this.checkPin(pin)) !== 'ok') throw new Error('PIN incorrecto');
      return read('cg_log', []).slice(-n).reverse().map(cleanLog);
    },
    async clearLogs(pin) {
      if ((await this.checkPin(pin)) !== 'ok') throw new Error('PIN incorrecto');
      write('cg_log', []);
    },
    async saveLobby(lobby) {
      const all = read('cg_lobbies', {});
      all[lobby.code] = lobby;
      write('cg_lobbies', all);
    },
    async getLobby(code) {
      const l = read('cg_lobbies', {})[code];
      return l ? cleanLobby(l) : null;
    },
    async listLobbies(n) {
      return Object.values(read('cg_lobbies', {}))
        .map(cleanLobby)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, n);
    },
  };
}

async function supabaseImpl({ url, key }) {
  const { createClient } = await import(SUPABASE_JS);
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const run = async (promise) => {
    const { data, error } = await promise;
    if (error) throw new Error(error.message || 'Error de Supabase');
    return data;
  };
  const time = (v) => (v ? Date.parse(v) || 0 : 0);
  const fromScore = (r) => cleanScore({ name: r.name, nameKey: r.name_key, score: r.score, correct: r.correct, total: r.total, timeMs: r.time_ms, ts: time(r.updated_at), deviceId: r.device_id });
  const fromLog = (r) => cleanLog({
    ts: time(r.created_at), name: r.name, nameKey: r.name_key, mode: r.mode, board: r.board, boardLabel: r.board_label,
    score: r.score, correct: r.correct, total: r.total, timeMs: r.time_ms, tabSwitches: r.tab_switches,
    deviceId: r.device_id, fp: r.fp, ip: r.ip, ua: r.ua,
  });
  const fromLobby = (r) => cleanLobby({ code: r.code, name: r.name, cats: r.cats, createdBy: r.created_by, createdAt: time(r.created_at) });
  const cut = (v, n) => (v == null ? null : String(v).slice(0, n));

  return {
    kind: 'supabase',
    async ping() {
      await run(sb.from('lobbies').select('code').limit(1));
    },
    async submitScore(board, e) {
      await run(sb.rpc('submit_score', {
        p_board: board, p_name: e.name, p_name_key: e.nameKey, p_score: e.score, p_correct: e.correct,
        p_total: e.total, p_time_ms: e.timeMs, p_device_id: cut(e.deviceId, 64),
      }));
    },
    async getRanking(board, n) {
      const rows = await run(sb.from('scores').select('*').eq('board', board)
        .order('score', { ascending: false }).order('time_ms', { ascending: true }).limit(n));
      return rows.map(fromScore);
    },
    async addLog(e) {
      await run(sb.from('logs').insert({
        name: e.name, name_key: e.nameKey, mode: e.mode, board: cut(e.board, 20), board_label: cut(e.boardLabel, 40),
        score: e.score, correct: e.correct, total: e.total, time_ms: e.timeMs, duration_ms: e.durationMs,
        tab_switches: Math.min(e.tabSwitches || 0, 1000), device_id: cut(e.deviceId, 64), fp: cut(e.fp, 64),
        ip: cut(e.ip, 64), ua: cut(e.ua, 80), names_on_device: (e.namesOnDevice || []).slice(-20),
      }));
    },
    async checkPin(pin) {
      return run(sb.rpc('check_admin_pin', { p_pin: pin }));
    },
    async getLogs(pin, n) {
      const rows = await run(sb.rpc('get_logs', { p_pin: pin, p_limit: n }));
      return rows.map(fromLog);
    },
    async clearLogs(pin) {
      await run(sb.rpc('clear_logs', { p_pin: pin }));
    },
    async saveLobby(l) {
      await run(sb.from('lobbies').insert({ code: l.code, name: cut(l.name, 40), cats: l.cats, created_by: cut(l.createdBy, 20) || null }));
    },
    async getLobby(code) {
      const rows = await run(sb.from('lobbies').select('*').eq('code', code).limit(1));
      return rows.length ? fromLobby(rows[0]) : null;
    },
    async listLobbies(n) {
      const rows = await run(sb.from('lobbies').select('*').order('created_at', { ascending: false }).limit(n));
      return rows.map(fromLobby);
    },
  };
}
