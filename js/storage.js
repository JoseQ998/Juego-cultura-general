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
export const online = () => impl?.kind === 'supabase' && !impl.error;
const call = (name) => (...args) => {
  if (!impl?.[name]) throw new Error('Necesitas conexión con el servidor');
  return impl[name](...args);
};

// Modos libres
export const submitScore = (board, entry) => impl.submitScore(board, entry);
export const getRanking = (board, n = 50) => impl.getRanking(board, n);
export const addLog = (entry) => impl.addLog(entry);
export const saveLobby = (lobby) => impl.saveLobby(lobby);
export const getLobby = (code) => impl.getLobby(code);
export const listLobbies = (n = 30) => impl.listLobbies(n);

// Registro: en modo local se protege con el PIN de config.js; con Supabase,
// solo lo puede ver la cuenta de administrador.
export const checkPin = (pin) => impl.checkPin(pin);
export const getLogs = (pin, n = 1000) => impl.getLogs(pin, n);
export const clearLogs = (pin) => impl.clearLogs(pin);

// Cuentas (solo con Supabase)
export const getAccount = call('getAccount');
export const signUp = call('signUp');
export const signIn = call('signIn');
export const signOut = call('signOut');
export const changePassword = call('changePassword');
export const onAuthChange = (cb) => impl?.onAuthChange?.(cb);

// Modo semanal (solo con Supabase)
export const getWeek = call('getWeek');
export const setWeekQuestions = call('setWeekQuestions');
export const startWeekly = call('startWeekly');
export const weeklyProgress = call('weeklyProgress');
export const weeklyRanking = call('weeklyRanking');
export const periodRanking = call('periodRanking');
export const listWeeks = call('listWeeks');

// Panel del administrador (solo con Supabase)
export const adminUsers = call('adminUsers');
export const adminSetStatus = call('adminSetStatus');
export const adminSetPassword = call('adminSetPassword');
export const adminWeek = call('adminWeek');
export const adminDeletePlay = call('adminDeletePlay');
export const adminSetWeek = call('adminSetWeek');

// ¿La partida a es mejor que b? (más aciertos; a igualdad, menos tiempo)
function isBetter(a, b) {
  if (!b) return true;
  return a.score > b.score || (a.score === b.score && a.timeMs < b.timeMs);
}
const sortRanking = (list) => list.sort((a, b) => b.score - a.score || a.timeMs - b.timeMs);

// Los datos que vienen de la base de datos se normalizan para que un registro
// manipulado no pueda romper la página.
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v) => (v == null ? '' : String(v));
const time = (v) => (v ? Date.parse(v) || 0 : 0);
const cleanScore = (r) => ({ ...r, name: str(r.name), score: num(r.score), correct: num(r.correct), total: num(r.total) || 15, timeMs: num(r.timeMs), ts: num(r.ts) });
const cleanLog = (l) => ({
  ...cleanScore(l),
  nameKey: str(l.nameKey), mode: str(l.mode), board: str(l.board), boardLabel: str(l.boardLabel),
  tabSwitches: num(l.tabSwitches), deviceId: str(l.deviceId), fp: str(l.fp), ua: str(l.ua),
  finished: l.finished !== false, answered: l.answered == null ? num(l.total) || 15 : num(l.answered),
});
const cleanLobby = (l) => ({ ...l, code: str(l.code), name: str(l.name), cats: Array.isArray(l.cats) ? l.cats.map(str) : [], createdAt: num(l.createdAt) });
const cleanPlay = (p) => ({
  name: str(p.name), userId: str(p.user_id), correct: num(p.correct), total: num(p.total) || 15,
  answered: num(p.answered), timeMs: num(p.time_ms), finished: p.finished === true, startedAt: time(p.started_at),
  deviceId: str(p.device_id), fp: str(p.fp), ua: str(p.ua),
});

function localImpl() {
  const read = (k, d) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
  };
  const write = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  };
  // La puntuación pasó de "puntos" a "aciertos": los rankings antiguos se vacían una vez.
  if (read('cg_scoring', 0) !== 2) {
    write('cg_rank', {});
    write('cg_scoring', 2);
  }
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
      write('cg_rank', {});
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

// Mensajes de error de Supabase Auth, en español.
function authMessage(error) {
  const m = String(error?.message || error || '');
  if (/invalid login credentials/i.test(m)) return 'Usuario o contraseña incorrectos.';
  if (/already registered|already exists/i.test(m)) return 'Ese usuario ya existe. Elige otro nombre.';
  if (/password should be at least|weak password/i.test(m)) return 'La contraseña es demasiado corta (mínimo 6 caracteres).';
  if (/email address .* invalid|unable to validate email/i.test(m)) return 'Ese nombre de usuario no es válido.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
  if (/signups not allowed/i.test(m)) return 'El registro de cuentas nuevas está desactivado.';
  return m || 'Error de conexión.';
}

async function supabaseImpl({ url, key }) {
  const { createClient } = await import(SUPABASE_JS);
  // keepalive: los envíos llegan aunque la pestaña se esté cerrando (partidas abandonadas).
  const keepaliveFetch = (input, init = {}) =>
    fetch(input, init.method && init.method !== 'GET' ? { ...init, keepalive: true } : init);
  const sb = createClient(url, key, {
    // La sesión se guarda en el navegador: la cuenta queda abierta hasta que se cierre.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'cg_auth' },
    global: { fetch: keepaliveFetch },
  });
  const run = async (promise) => {
    const { data, error } = await promise;
    if (error) throw new Error(error.message || 'Error de Supabase');
    return data;
  };
  const fromScore = (r) => cleanScore({ name: r.name, nameKey: r.name_key, score: r.score, correct: r.correct, total: r.total, timeMs: r.time_ms, ts: time(r.updated_at), deviceId: r.device_id });
  const fromLog = (r) => cleanLog({
    ts: time(r.created_at), name: r.name, nameKey: r.name_key, mode: r.mode, board: r.board, boardLabel: r.board_label,
    score: r.score, correct: r.correct, total: r.total, timeMs: r.time_ms, tabSwitches: r.tab_switches,
    finished: r.finished, answered: r.answered,
    deviceId: r.device_id, fp: r.fp, ua: r.ua,
  });
  const fromLobby = (r) => cleanLobby({ code: r.code, name: r.name, cats: r.cats, createdBy: r.created_by, createdAt: time(r.created_at) });
  const cut = (v, n) => (v == null ? null : String(v).slice(0, n));
  // Supabase Auth necesita un correo: se usa uno interno que nunca recibe nada.
  const emailOf = (username) => `${username.trim().toLowerCase()}@${CONFIG.ACCOUNT_EMAIL_DOMAIN}`;
  const profile = async () => {
    let p = await run(sb.rpc('my_profile'));
    if (!p) p = await run(sb.rpc('register_profile'));
    return p && { username: str(p.username), displayName: str(p.display_name), status: str(p.status), isAdmin: p.is_admin === true };
  };

  return {
    kind: 'supabase',
    async ping() {
      await run(sb.from('lobbies').select('code').limit(1));
    },

    // ----- modos libres -----
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
        finished: e.finished !== false, answered: e.answered ?? e.total,
        tab_switches: Math.min(e.tabSwitches || 0, 1000), device_id: cut(e.deviceId, 64), fp: cut(e.fp, 64),
        ua: cut(e.ua, 80), names_on_device: (e.namesOnDevice || []).slice(-20),
      }));
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

    // ----- registro (solo administrador) -----
    async getLogs(_pin, n) {
      const rows = await run(sb.rpc('get_logs', { p_limit: n }));
      return rows.map(fromLog);
    },
    async clearLogs() {
      await run(sb.rpc('clear_logs'));
    },

    // ----- cuentas -----
    async getAccount() {
      const { data } = await sb.auth.getSession();
      if (!data?.session) return null;
      return { profile: await profile() };
    },
    async signUp(username, password, who) {
      const { data, error } = await sb.auth.signUp({
        email: emailOf(username),
        password,
        options: { data: { display: username.trim(), who: String(who || '').trim().slice(0, 120) } },
      });
      if (error) throw new Error(authMessage(error));
      if (!data.session) {
        throw new Error('La cuenta se creó, pero Supabase pide confirmar el correo. El administrador debe desactivar "Confirm email" en Supabase.');
      }
      return { profile: await profile() };
    },
    async signIn(username, password) {
      const { error } = await sb.auth.signInWithPassword({ email: emailOf(username), password });
      if (error) throw new Error(authMessage(error));
      return { profile: await profile() };
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async changePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(authMessage(error));
    },
    onAuthChange(cb) {
      sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(() => cb(event), 0);
      });
    },

    // ----- modo semanal -----
    async getWeek() {
      const w = await run(sb.rpc('get_week'));
      return {
        id: num(w.id), startsAt: time(w.starts_at), endsAt: time(w.ends_at), serverNow: time(w.now), open: w.open === true,
        theme: w.theme ? str(w.theme) : null,
        questionIds: Array.isArray(w.question_ids) ? w.question_ids.map(str) : null,
        extra: w.extra && typeof w.extra.text === 'string' && Array.isArray(w.extra.options) && w.extra.options.length === 4
          ? { text: str(w.extra.text), options: w.extra.options.map(str) } : null,
        usedIds: Array.isArray(w.used_ids) ? w.used_ids.map(str) : [],
        myPlay: w.my_play ? cleanPlay(w.my_play) : null,
      };
    },
    async setWeekQuestions(weekId, ids) {
      return (await run(sb.rpc('set_week_questions', { p_week: weekId, p_ids: ids }))).map(str);
    },
    async startWeekly({ deviceId, fp, ua }) {
      return run(sb.rpc('start_weekly', { p_device: cut(deviceId, 64), p_fp: cut(fp, 64), p_ua: cut(ua, 80) }));
    },
    async weeklyProgress(weekId, answered, correct, timeMs, finished) {
      return run(sb.rpc('weekly_progress', {
        p_week: weekId, p_answered: answered, p_correct: correct, p_time_ms: Math.round(timeMs), p_finished: finished,
      }));
    },
    async weeklyRanking(weekId) {
      return (await run(sb.rpc('weekly_ranking', { p_week: weekId }))).map(cleanPlay);
    },
    async periodRanking(year, month = null) {
      const rows = await run(sb.rpc('period_ranking', { p_year: year, p_month: month }));
      return rows.map((r) => ({ name: str(r.name), correct: num(r.correct), timeMs: num(r.time_ms), weeks: num(r.weeks) }));
    },
    async listWeeks() {
      const rows = await run(sb.rpc('list_weeks'));
      return rows.map((r) => ({ id: num(r.id), startsAt: time(r.starts_at), theme: r.theme ? str(r.theme) : null, plays: num(r.plays) }));
    },

    // ----- administrador -----
    async adminUsers() {
      const rows = await run(sb.rpc('admin_users'));
      return rows.map((r) => ({
        id: str(r.id), username: str(r.username), displayName: str(r.display_name), who: str(r.who),
        status: str(r.status), isAdmin: r.is_admin === true, createdAt: time(r.created_at), plays: num(r.plays),
      }));
    },
    async adminSetStatus(userId, status) {
      await run(sb.rpc('admin_set_status', { p_user: userId, p_status: status }));
    },
    async adminSetPassword(userId, password) {
      await run(sb.rpc('admin_set_password', { p_user: userId, p_password: password }));
    },
    async adminWeek(weekId) {
      const w = await run(sb.rpc('admin_week', { p_week: weekId }));
      return {
        id: num(w.id), startsAt: time(w.starts_at), theme: w.theme ? str(w.theme) : null,
        hasQuestions: Array.isArray(w.question_ids),
        extra: w.extra && Array.isArray(w.extra.options) ? { text: str(w.extra.text), options: w.extra.options.map(str) } : null,
        plays: (w.plays || []).map(cleanPlay),
      };
    },
    async adminDeletePlay(weekId, userId) {
      await run(sb.rpc('admin_delete_play', { p_week: weekId, p_user: userId }));
    },
    async adminSetWeek(weekId, theme, extra) {
      await run(sb.rpc('admin_set_week', { p_week: weekId, p_theme: theme || null, p_extra: extra || null }));
    },
  };
}
