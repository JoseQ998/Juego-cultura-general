import { CONFIG } from './config.js';
import { CATEGORIES, QUESTIONS, EXTRA_CATEGORY } from './questions.js';
import * as store from './storage.js';
import { getIdentity, rememberName } from './identity.js';
import { createDraft } from './draft.js';
import { createDraftOnline, resultOf, championSeat } from './draft-online.js';

const QUESTION_COUNT = 15;
const TIME_LIMIT = 10_000; // 10 segundos por pregunta
const REVEAL_MS = 1400;
const TZ = 'America/Caracas'; // el semanal se reinicia los sábados a las 8pm de Venezuela

const CAT = Object.fromEntries([...CATEGORIES, EXTRA_CATEGORY].map((c) => [c.id, c]));
const BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
const app = document.getElementById('app');

let game = null;
let raf = 0;
let account = null; // { profile: { username, displayName, status, isAdmin } } o null
let ticker = 0; // cuenta atrás del inicio

// ---------------- utilidades ----------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const nameKey = (n) => n.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const fmtTime = (ms) => `${(ms / 1000).toFixed(1)} s`;
const fmtDate = (ts) => new Date(ts).toLocaleString('es', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtDay = (ts) => new Date(ts).toLocaleDateString('es', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const catName = (id) => CAT[id]?.name ?? 'Todas las categorías';
// Insignia de cuenta verificada (la pone el administrador).
const VERIFIED_BADGE = `<svg class="verified" viewBox="0 0 24 24" role="img" aria-label="Verificado"><title>Cuenta verificada</title>
  <rect x="4.5" y="4.5" width="15" height="15" rx="3"/><rect x="4.5" y="4.5" width="15" height="15" rx="3" transform="rotate(45 12 12)"/>
  <path d="M7.9 12.2l2.7 2.7 5.5-5.7" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const nameWithBadge = (name, verified) => `<span class="who-name">${esc(name)}${verified ? VERIFIED_BADGE : ''}</span>`;
const catChip = (id) => `<span class="chip">${esc(CAT[id]?.name ?? id)}</span>`;
// Año y mes (1-12) de una fecha en hora de Venezuela.
function ymVet(ts) {
  const [y, m] = new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).split('-');
  return { year: +y, month: +m };
}
function fmtCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3200);
}

function getName() {
  try { return localStorage.getItem('cg_name') || ''; } catch { return ''; }
}
function setName(n) {
  try { localStorage.setItem('cg_name', n); } catch {}
}
function validName(n) {
  const t = n.trim();
  return /^[\p{L}\p{N} _.\-]{2,20}$/u.test(t) && /[\p{L}\p{N}]/u.test(t);
}
const validUsername = (u) => /^[A-Za-z0-9_.-]{3,20}$/.test(u.trim());
const profileOf = () => account?.profile || null;
const isAdmin = () => profileOf()?.isAdmin === true && profileOf()?.status === 'approved';

// Modo Draft Worlds (js/draft.js)
const draftCtx = {
  app, esc, toast, go: (h) => go(h), store,
  online: () => store.online(),
  playerName: () => profileOf()?.displayName || getName(),
  setName: (n) => setName(n),
  profile: () => profileOf(),
  isAdmin: () => isAdmin(),
  badge: () => VERIFIED_BADGE,
};
const draft = createDraft(draftCtx);
draftCtx.routeOnline = createDraftOnline(draftCtx, draft).route;

// ---------------- salas (lobbies) ----------------
// Código de sala = categorías (bits, 2 caracteres; 3 si no caben) + 4 caracteres de semilla.
// Todos los que entran con el mismo código reciben las mismas preguntas.
function makeLobbyCode(catIds) {
  const mask = CATEGORIES.reduce((m, c, i) => (catIds.includes(c.id) ? m | (1 << i) : m), 0);
  const seed = Math.floor(Math.random() * 36 ** 4);
  const maskLen = mask < 36 ** 2 ? 2 : 3;
  return (mask.toString(36).padStart(maskLen, '0') + seed.toString(36).padStart(4, '0')).toUpperCase();
}

function parseLobbyCode(code) {
  code = String(code || '').trim().toUpperCase();
  if (!/^[0-9A-Z]{6,7}$/.test(code)) return null;
  const maskLen = code.length - 4;
  const mask = parseInt(code.slice(0, maskLen), 36);
  const seed = parseInt(code.slice(maskLen), 36);
  const cats = CATEGORIES.filter((_, i) => mask & (1 << i)).map((c) => c.id);
  if (!cats.length || mask >= 1 << CATEGORIES.length) return null;
  return { code, cats, seed };
}

async function resolveLobby(code) {
  const parsed = parseLobbyCode(code);
  if (!parsed) return null;
  let saved = null;
  try { saved = await store.getLobby(parsed.code); } catch {}
  return { ...parsed, name: saved?.name || `Sala ${parsed.code}`, createdBy: saved?.createdBy || '' };
}

// ---------------- construcción de partidas ----------------
function prepare(q, rnd) {
  const order = shuffle([0, 1, 2, 3], rnd);
  return { id: q.id, cat: q.cat, text: q.text, options: order.map((i) => q.options[i]), correct: order.indexOf(0) };
}

// Reparte las preguntas entre las categorías para que ninguna acapare la partida
// (League of Legends tiene muchas más preguntas que el resto). Dentro de cada
// categoría se eligen primero las que tengan menor "rank" (p. ej. las menos vistas).
function pickBalanced(questions, count, rnd, rank = () => 0) {
  const byCat = new Map();
  for (const q of shuffle(questions, rnd)) {
    if (!byCat.has(q.cat)) byCat.set(q.cat, []);
    byCat.get(q.cat).push(q);
  }
  for (const list of byCat.values()) list.sort((a, b) => rank(a) - rank(b));
  const cats = shuffle([...byCat.keys()], rnd);
  const picked = [];
  while (picked.length < count && cats.some((c) => byCat.get(c).length)) {
    for (const c of cats) {
      if (picked.length >= count) break;
      const list = byCat.get(c);
      if (list.length) picked.push(list.shift());
    }
  }
  return shuffle(picked, rnd);
}

function buildRandom() {
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem('cg_seen') || '[]'); } catch {}
  // Primero las que no has visto; si no quedan, las que viste hace más tiempo.
  const seenAt = new Map(seen.map((id, i) => [id, i]));
  const picked = pickBalanced(QUESTIONS, QUESTION_COUNT, Math.random, (q) => seenAt.get(q.id) ?? -1);
  try {
    const next = seen.filter((id) => !picked.some((q) => q.id === id)).concat(picked.map((q) => q.id));
    localStorage.setItem('cg_seen', JSON.stringify(next.slice(-(QUESTIONS.length - QUESTION_COUNT))));
  } catch {}
  return picked.map((q) => prepare(q, Math.random));
}

function buildLobby(lobby) {
  const rnd = seededRandom(lobby.seed);
  const pool = QUESTIONS.filter((q) => lobby.cats.includes(q.cat));
  return pickBalanced(pool, QUESTION_COUNT, rnd).map((q) => prepare(q, rnd));
}

// Elige las 15 preguntas de una semana: nunca usadas en otra semana, del tema de
// la semana si lo tiene (y si no alcanzan, se completan con el resto).
function pickWeekIds(week) {
  const used = new Set(week.usedIds);
  const pool = QUESTIONS.filter((q) => !used.has(q.id));
  const rnd = seededRandom(hashStr(`semana:${week.id}`));
  let picked = pickBalanced(week.theme ? pool.filter((q) => q.cat === week.theme) : pool, QUESTION_COUNT, rnd);
  if (picked.length < QUESTION_COUNT) {
    const rest = pool.filter((q) => !picked.includes(q));
    picked = picked.concat(pickBalanced(rest, QUESTION_COUNT - picked.length, rnd));
  }
  return picked.map((q) => q.id);
}

// Preguntas de la semana, con las opciones en el mismo orden para todos.
function buildWeekly(week) {
  const qs = week.questionIds
    .map((id) => BY_ID[id])
    .filter(Boolean)
    .map((q) => prepare(q, seededRandom(hashStr(`semana:${week.id}:${q.id}`))));
  if (week.extra) {
    const extra = { id: `extra-${week.id}`, cat: EXTRA_CATEGORY.id, text: week.extra.text, options: week.extra.options };
    qs.push(prepare(extra, seededRandom(hashStr(`semana:${week.id}:extra`))));
  }
  return qs;
}

const BOARDS = {
  aleatorio: { label: 'Aleatorio' },
};

// ---------------- cuenta ----------------
async function refreshAccount() {
  account = null;
  if (store.online()) {
    try {
      account = await store.getAccount();
    } catch (e) {
      console.error('No se pudo cargar la cuenta', e);
    }
  }
  const online = store.online();
  const accountLink = document.getElementById('accountLink');
  const adminLink = document.getElementById('adminLink');
  const logLink = document.getElementById('logLink');
  if (accountLink) {
    accountLink.hidden = !online;
    accountLink.textContent = profileOf() ? profileOf().displayName : 'Entrar';
  }
  if (adminLink) adminLink.hidden = !isAdmin();
  if (logLink) logLink.hidden = online && !isAdmin();
  const rankingLink = document.getElementById('rankingLink');
  if (rankingLink) rankingLink.href = online ? '#/ranking/semanal' : '#/ranking/aleatorio';
}

const STATUS_TEXT = {
  pending: 'Pendiente',
  approved: 'Activa',
  rejected: 'Rechazada',
  blocked: 'Bloqueada',
};

// ---------------- navegación ----------------
function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function route() {
  stopGame();
  draft.stop();
  clearInterval(ticker);
  app.onclick = null;
  const h = location.hash || '#/';
  const [, page, arg, arg2] = h.split('/');
  window.scrollTo(0, 0);
  document.body.classList.toggle('wide', page === 'registro' || page === 'admin');
  document.body.classList.toggle('dw', page === 'draft'); // Draft Worlds tiene su propio estilo (css/draft.css)
  if (page !== 'draft') draft.leave(); // los himnos de Draft Worlds solo suenan dentro del modo
  if (page === 'sala' && arg) return renderLobby(arg);
  if (page === 'crear') return renderCreateLobby();
  if (page === 'ranking') return renderRanking(arg ? decodeURIComponent(arg) : 'semanal', arg2 ? decodeURIComponent(arg2) : '');
  if (page === 'registro') return renderLog();
  if (page === 'cuenta') return renderAccount(arg);
  if (page === 'admin') return renderAdmin();
  if (page === 'draft') return draft.route(arg, arg2);
  return renderHome();
}

// Salir de una partida sin terminarla la cierra en ese punto: se guarda con lo que llevaba.
function stopGame() {
  cancelAnimationFrame(raf);
  if (game) {
    game.aborted = true;
    if (!game.done) saveAbandoned(game);
  }
  game = null;
  document.body.classList.remove('playing');
}

const ABANDON_MSG = '¿Salir de la partida? Se guardará como abandonada con los aciertos que llevas.';

// Con cuenta se juega siempre con el nombre de usuario; sin cuenta, con el nombre escrito.
const playerName = () => profileOf()?.displayName || getName();

function requireName() {
  if (profileOf()) return profileOf().displayName;
  const n = getName();
  if (!validName(n)) {
    toast('Escribe un nombre válido: de 2 a 20 letras o números.', 'error');
    const input = document.getElementById('name');
    if (input) input.focus();
    else {
      go('#/');
      setTimeout(() => document.getElementById('name')?.focus(), 50);
    }
    return null;
  }
  return n.trim();
}

// ---------------- inicio ----------------
function nameField() {
  const p = profileOf();
  if (p) return `<p class="muted small">Juegas como <b>${nameWithBadge(p.displayName, p.verified)}</b>, tu usuario.</p>`;
  return `
    <label class="field">
      <span>Tu nombre (para Aleatorio y salas)</span>
      <input id="name" maxlength="20" autocomplete="nickname" placeholder="Ej. Ana" value="${esc(getName())}">
    </label>`;
}

function bindNameField() {
  const input = document.getElementById('name');
  input?.addEventListener('input', () => setName(input.value.trim()));
}

function accountBar() {
  if (!store.online()) return '';
  const p = profileOf();
  if (!p) {
    return `<div class="account-bar"><a class="btn ghost sm" href="#/cuenta">Entrar</a><a class="btn ghost sm" href="#/cuenta/crear">Crear cuenta</a><span class="muted small">Necesaria para el reto semanal</span></div>`;
  }
  return `<div class="account-bar"><span class="muted small">Conectado como</span> <a href="#/cuenta"><b>${nameWithBadge(p.displayName, p.verified)}</b></a>${p.status === 'approved' ? '' : ` <span class="chip warn">${STATUS_TEXT[p.status]}</span>`}</div>`;
}

function renderHome() {
  if (!getName() && profileOf()) setName(profileOf().displayName);
  app.innerHTML = `
    <section class="hero">
      <h1>¿Cuánto sabes?</h1>
      <p class="muted">Preguntas de cultura general · 10 segundos por pregunta · gana quien más acierta</p>
      ${accountBar()}
    </section>

    <section class="modes">
      <div class="mode weekly" id="weeklyCard">
        <span class="mode-icon">SEM</span>
        <span class="weekly-body"><strong>Semanal</strong><small class="muted">Cargando el reto de la semana…</small></span>
      </div>
      <button class="mode" data-mode="aleatorio">
        <span class="mode-icon">??</span>
        <span><strong>Aleatorio</strong><small>15 preguntas distintas en cada partida, de todas las categorías. Juega las veces que quieras.</small></span>
      </button>
      <a class="mode" href="#/crear">
        <span class="mode-icon">VS</span>
        <span><strong>Crear sala</strong><small>Elige las categorías y comparte el código con tus amigos. Cada sala tiene su propio ranking.</small></span>
      </a>
      <a class="mode" href="#/draft">
        <span class="mode-icon">LOL</span>
        <span><strong>Draft Worlds</strong><small>Arma un equipo con jugadores de los Worlds de 2011 a 2025 y juega un Mundial contra bots o con tus amigos. Sala oficial semanal con copas.</small></span>
      </a>
    </section>

    ${profileOf() ? '' : `<section class="card">${nameField()}</section>`}

    <form class="card join" id="join">
      <label class="field">
        <span>¿Tienes un código de sala?</span>
        <div class="row">
          <input id="code" maxlength="7" placeholder="Ej. 0FK2J9" autocapitalize="characters" autocomplete="off">
          <button class="btn">Entrar</button>
        </div>
      </label>
    </form>

    <section class="card">
      <h3>Cómo se puntúa</h3>
      <p class="muted">Cada respuesta correcta suma <b>1 acierto</b>. Gana quien tenga más aciertos y, en caso de empate, quien tardó menos en total. Si se acaban los 10 segundos, cuenta como fallo.</p>
      <p class="muted">En el <b>reto semanal</b> todos tienen las mismas 15 preguntas, solo hay <b>una partida por semana</b> y se renueva cada <b>sábado a las 8pm</b> (hora de Venezuela). Los rankings mensual y anual suman los aciertos de todas las semanas.</p>
      <p class="muted small">Para evitar trampas se guarda tu nombre y un identificador anónimo de tu navegador. No se guarda tu IP ni ningún otro dato personal.</p>
    </section>`;

  bindNameField();
  app.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!requireName()) return;
      startGame({ mode: 'aleatorio', board: 'aleatorio', label: BOARDS.aleatorio.label, questions: buildRandom() });
    })
  );
  document.getElementById('join').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = document.getElementById('code').value;
    if (!parseLobbyCode(code)) return toast('Código de sala no válido.', 'error');
    go(`#/sala/${code.trim().toUpperCase()}`);
  });
  fillWeeklyCard();
}

// Tarjeta del reto semanal: cambia según la cuenta y si ya se jugó.
async function fillWeeklyCard() {
  const card = document.getElementById('weeklyCard');
  if (!card) return;
  const body = card.querySelector('.weekly-body');
  const set = (html, action = null) => {
    if (!document.body.contains(card)) return;
    body.innerHTML = `<strong>Semanal</strong>${html}`;
    card.classList.toggle('clickable', !!action);
    card.onclick = action;
    card.tabIndex = action ? 0 : -1;
    card.onkeydown = action ? (e) => { if (e.key === 'Enter') action(); } : null;
  };
  if (!store.online()) {
    set('<small>El reto semanal necesita conexión con el servidor.</small>');
    return;
  }
  let week;
  try {
    week = await store.getWeek();
  } catch (e) {
    console.error(e);
    set('<small class="error-text">No se pudo cargar el reto de la semana.</small>');
    return;
  }
  const offset = week.serverNow - Date.now();
  const theme = `<span class="chip">${esc(catName(week.theme))}</span>`;
  const countdown = (label, target) => `<small class="countdown">${label} <b data-until="${target}">${fmtCountdown(target - (Date.now() + offset))}</b></small>`;
  const p = profileOf();
  if (!week.open) {
    set(`<small>15 preguntas iguales para todos. Una sola partida por semana.</small>${theme}${countdown('Empieza en', week.startsAt)}`);
  } else if (!p) {
    set(`<small>15 preguntas iguales para todos. Una sola partida por semana. <a href="#/cuenta">Entra</a> o <a href="#/cuenta/crear">crea tu cuenta</a> para jugar.</small>${theme}${countdown('Nueva ronda en', week.endsAt)}`);
  } else if (p.status !== 'approved') {
    set(`<small>Tu cuenta está <b>${esc((STATUS_TEXT[p.status] || p.status).toLowerCase())}</b> y no puede jugar el reto semanal. Habla con el administrador.</small>${theme}${countdown('Nueva ronda en', week.endsAt)}`);
  } else if (week.myPlay) {
    const mp = week.myPlay;
    set(`<small>Ya jugaste esta semana: <b>${mp.correct}/${mp.total}</b> aciertos en ${fmtTime(mp.timeMs)}${mp.finished ? '' : ' (abandonada)'}. Toca para ver el ranking.</small>${theme}${countdown('Nueva ronda en', week.endsAt)}`,
      () => go(`#/ranking/semanal/${week.id}`));
  } else {
    set(`<small>15 preguntas iguales para todos. <b>Solo tienes una partida</b>: en cuanto empiece, cuenta. Toca para jugar.</small>${theme}${countdown('Termina en', week.endsAt)}`,
      () => startWeeklyGame());
  }
  ticker = setInterval(() => {
    const el = document.querySelector('[data-until]');
    if (!el) return clearInterval(ticker);
    const left = +el.dataset.until - (Date.now() + offset);
    el.textContent = fmtCountdown(left);
    if (left <= 0) {
      clearInterval(ticker);
      setTimeout(fillWeeklyCard, 1500);
    }
  }, 1000);
}

async function startWeeklyGame() {
  const p = profileOf();
  if (!p || p.status !== 'approved') return go('#/cuenta');
  let week;
  try {
    week = await store.getWeek();
    if (!week.open) return toast('El reto semanal todavía no ha empezado.', 'error');
    if (week.myPlay) return toast('Ya jugaste esta semana.', 'error');
    if (!week.questionIds) week.questionIds = await store.setWeekQuestions(week.id, pickWeekIds(week));
  } catch (e) {
    console.error(e);
    return toast(`No se pudo preparar el reto: ${e.message}`, 'error');
  }
  const questions = buildWeekly(week);
  if (!questions.length) return toast('No se encontraron las preguntas de la semana. Recarga la página.', 'error');
  if (!confirm(`Reto semanal: ${QUESTION_COUNT} preguntas de ${catName(week.theme).toLowerCase()}.\n\nSolo tienes UNA partida esta semana y cuenta desde que empieza. Si sales a mitad, se guarda con lo que lleves.\n\n¿Empezar ahora?`)) return;
  try {
    await store.startWeekly(getIdentity());
  } catch (e) {
    console.error(e);
    toast(e.message, 'error');
    return renderHome();
  }
  startGame({ mode: 'semanal', board: 'semanal', label: 'Semanal', weekId: week.id, questions, name: p.displayName });
}

// ---------------- salas ----------------
function renderCreateLobby() {
  app.innerHTML = `
    <a class="back" href="#/">← Volver</a>
    <section class="card">
      <h2>Crear sala</h2>
      <label class="field">
        <span>Nombre de la sala (opcional)</span>
        <input id="lobbyName" maxlength="30" placeholder="Ej. Viernes de trivia">
      </label>
      <div class="field">
        <span>Categorías de la partida</span>
        <div class="cats" id="cats">
          ${CATEGORIES.map((c) => `
            <label class="cat">
              <input type="checkbox" value="${c.id}" checked>
              <span>${esc(c.name)}</span>
            </label>`).join('')}
        </div>
        <div class="row small-gap">
          <button type="button" class="btn ghost sm" id="all">Todas</button>
          <button type="button" class="btn ghost sm" id="none">Ninguna</button>
        </div>
      </div>
      <button class="btn big" id="create">Crear sala</button>
    </section>`;

  const boxes = [...app.querySelectorAll('#cats input')];
  document.getElementById('all').onclick = () => boxes.forEach((b) => (b.checked = true));
  document.getElementById('none').onclick = () => boxes.forEach((b) => (b.checked = false));
  document.getElementById('create').onclick = async () => {
    const cats = boxes.filter((b) => b.checked).map((b) => b.value);
    if (!cats.length) return toast('Elige al menos una categoría.', 'error');
    const code = makeLobbyCode(cats);
    const name = document.getElementById('lobbyName').value.trim().slice(0, 30) || `Sala ${code}`;
    try {
      await store.saveLobby({ code, name, cats, createdAt: Date.now(), createdBy: playerName() || '' });
    } catch (e) {
      console.error(e);
      toast('No se pudo guardar la sala en el servidor, pero el código funciona igual.', 'error');
    }
    go(`#/sala/${code}`);
  };
}

async function renderLobby(code) {
  app.innerHTML = `<p class="loading">Cargando sala…</p>`;
  const lobby = await resolveLobby(code);
  if (!lobby) {
    app.innerHTML = `<a class="back" href="#/">← Volver</a><section class="card"><h2>Sala no encontrada</h2><p class="muted">El código «${esc(code)}» no es válido.</p></section>`;
    return;
  }
  const link = `${location.origin}${location.pathname}#/sala/${lobby.code}`;
  app.innerHTML = `
    <a class="back" href="#/">← Volver</a>
    <section class="card">
      <p class="eyebrow">Sala</p>
      <h2>${esc(lobby.name)}</h2>
      <div class="code-box">
        <span class="code">${lobby.code}</span>
        <button class="btn ghost sm" id="share">Compartir enlace</button>
      </div>
      <div class="chips">${lobby.cats.map(catChip).join('')}</div>
      <p class="muted small">Todos los que entren con este código reciben las mismas 15 preguntas.</p>
      ${nameField()}
      <button class="btn big" id="play">Jugar</button>
    </section>
    <section class="card">
      <h3>Ranking de la sala</h3>
      <div id="rank"><p class="loading">Cargando…</p></div>
    </section>`;

  bindNameField();
  document.getElementById('share').onclick = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: lobby.name, text: `¡Únete a mi sala de Cultura General! Código ${lobby.code}`, url: link }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(link); toast('Enlace copiado'); } catch { prompt('Copia el enlace:', link); }
  };
  document.getElementById('play').onclick = () => {
    if (!requireName()) return;
    startGame({ mode: 'sala', board: `sala_${lobby.code}`, label: lobby.name, lobbyCode: lobby.code, questions: buildLobby(lobby) });
  };
  fillRanking(document.getElementById('rank'), `sala_${lobby.code}`);
}

// ---------------- rankings ----------------
const rankTable = (head, rows) => `
  <table class="table rank">
    <thead><tr><th>#</th>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;

async function fillRanking(el, board, highlight = '') {
  try {
    const rows = await store.getRanking(board, 50);
    if (!rows.length) {
      el.innerHTML = `<p class="muted">Todavía nadie ha jugado. ¡Sé el primero!</p>`;
      return rows;
    }
    el.innerHTML = rankTable(['Nombre', 'Aciertos', 'Tiempo'], rows.map((r, i) => `
      <tr class="${nameKey(r.name) === highlight ? 'me' : ''}">
        <td class="pos pos-${i + 1}">${i + 1}</td>
        <td>${esc(r.name)}</td>
        <td><b>${r.correct}</b><span class="muted">/${r.total}</span></td>
        <td>${fmtTime(r.timeMs)}</td>
      </tr>`));
    return rows;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<p class="error-text">No se pudo cargar el ranking.</p>`;
    return [];
  }
}

function playState(p, weekOver) {
  if (p.finished) return '';
  const live = !weekOver && Date.now() - p.startedAt < 60 * 60 * 1000;
  return live ? '<span class="chip">jugando</span>' : '<span class="chip warn">abandonó</span>';
}

// Filtro "Solo verificados" de los rankings con cuenta (se recuerda en el navegador).
const NO_VERIFIED_MSG = '<p class="muted">Todavía no hay jugadores verificados en este ranking.</p>';
function onlyVerifiedPref() {
  try { return localStorage.getItem('cg_only_verified') === '1'; } catch { return false; }
}
function setOnlyVerifiedPref(on) {
  try { localStorage.setItem('cg_only_verified', on ? '1' : '0'); } catch {}
}

async function fillWeeklyRanking(el, weekId, highlight = '', weekOver = false, onlyVerified = false) {
  try {
    let rows = await store.weeklyRanking(weekId);
    if (!rows.length) {
      el.innerHTML = `<p class="muted">Todavía nadie ha jugado esta semana.</p>`;
      return rows;
    }
    if (onlyVerified) {
      rows = rows.filter((r) => r.verified);
      if (!rows.length) {
        el.innerHTML = NO_VERIFIED_MSG;
        return rows;
      }
    }
    el.innerHTML = rankTable(['Nombre', 'Aciertos', 'Tiempo'], rows.map((r, i) => `
      <tr class="${nameKey(r.name) === highlight ? 'me' : ''}">
        <td class="pos pos-${i + 1}">${i + 1}</td>
        <td>${nameWithBadge(r.name, r.verified)} ${playState(r, weekOver)}</td>
        <td><b>${r.correct}</b><span class="muted">/${r.total}</span></td>
        <td>${fmtTime(r.timeMs)}</td>
      </tr>`));
    return rows;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<p class="error-text">No se pudo cargar el ranking.</p>`;
    return [];
  }
}

async function fillPeriodRanking(el, year, month, highlight = '', onlyVerified = false) {
  try {
    let rows = await store.periodRanking(year, month);
    if (!rows.length) {
      el.innerHTML = `<p class="muted">Todavía no hay partidas en este periodo.</p>`;
      return;
    }
    if (onlyVerified) {
      rows = rows.filter((r) => r.verified);
      if (!rows.length) {
        el.innerHTML = NO_VERIFIED_MSG;
        return;
      }
    }
    el.innerHTML = rankTable(['Nombre', 'Aciertos', 'Tiempo', 'Semanas'], rows.map((r, i) => `
      <tr class="${nameKey(r.name) === highlight ? 'me' : ''}">
        <td class="pos pos-${i + 1}">${i + 1}</td>
        <td>${nameWithBadge(r.name, r.verified)}</td>
        <td><b>${r.correct}</b></td>
        <td>${fmtTime(r.timeMs)}</td>
        <td>${r.weeks}</td>
      </tr>`));
  } catch (e) {
    console.error(e);
    el.innerHTML = `<p class="error-text">No se pudo cargar el ranking.</p>`;
  }
}

async function renderRanking(board, sub) {
  if (board === 'clasico') board = 'semanal';
  const online = store.online();
  if (!online && ['semanal', 'mensual', 'anual', 'copas'].includes(board)) board = 'aleatorio';
  const tabs = [
    ...(online ? [['semanal', 'Semanal'], ['mensual', 'Mensual'], ['anual', 'Anual'], ['copas', 'Copas']] : []),
    ['aleatorio', 'Aleatorio'],
  ];
  app.innerHTML = `
    <a class="back" href="#/">← Volver</a>
    <section class="card">
      <h2>Rankings</h2>
      <div class="tabs" id="tabs">
        ${tabs.map(([k, l]) => `<a class="tab ${board === k ? 'active' : ''}" href="#/ranking/${k}">${l}</a>`).join('')}
        <select id="lobbySel" class="tab ${board.startsWith('sala_') ? 'active' : ''}">
          <option value="">Salas…</option>
        </select>
      </div>
      <div id="periodBox"></div>
      <div id="filterBox"></div>
      <div id="rank"><p class="loading">Cargando…</p></div>
    </section>`;

  const sel = document.getElementById('lobbySel');
  sel.onchange = () => sel.value && go(`#/ranking/sala_${sel.value}`);
  store.listLobbies(50).then((lobbies) => {
    const current = board.startsWith('sala_') ? board.slice(5) : '';
    if (current && !lobbies.some((l) => l.code === current)) lobbies.unshift({ code: current, name: `Sala ${current}` });
    sel.innerHTML = `<option value="">Salas…</option>` +
      lobbies.map((l) => `<option value="${esc(l.code)}" ${l.code === current ? 'selected' : ''}>${esc(l.name)} (${esc(l.code)})</option>`).join('');
  }).catch(() => {});

  const rank = document.getElementById('rank');
  const box = document.getElementById('periodBox');
  const me = nameKey(playerName());
  const periodSelect = (options, value, onChange) => {
    box.innerHTML = `<select id="periodSel" class="period-select">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    document.getElementById('periodSel').onchange = (e) => onChange(e.target.value);
  };
  // "Todos" o "Solo verificados": cambia la tabla sin recargar la página.
  let onlyVerified = onlyVerifiedPref();
  const verifiedFilter = (fill) => {
    const fbox = document.getElementById('filterBox');
    const draw = () => {
      fbox.innerHTML = `
        <div class="seg rank-filter" role="tablist" aria-label="Qué jugadores mostrar">
          <button type="button" role="tab" data-only="0" class="${onlyVerified ? '' : 'active'}" aria-selected="${!onlyVerified}">Todos</button>
          <button type="button" role="tab" data-only="1" class="${onlyVerified ? 'active' : ''}" aria-selected="${onlyVerified}">Solo verificados ${VERIFIED_BADGE}</button>
        </div>`;
      fbox.querySelectorAll('[data-only]').forEach((b) => (b.onclick = () => {
        onlyVerified = b.dataset.only === '1';
        setOnlyVerifiedPref(onlyVerified);
        draw();
        fill();
      }));
    };
    draw();
    fill();
  };

  if (board === 'semanal') {
    let weeks = [];
    try { weeks = await store.listWeeks(); } catch (e) { console.error(e); }
    if (!weeks.length) {
      rank.innerHTML = `<p class="muted">El reto semanal todavía no ha empezado.</p>`;
      return;
    }
    const id = +sub || weeks[0].id;
    periodSelect(weeks.map((w, i) => [w.id, `${i === 0 ? 'Esta semana' : `Semana del ${fmtDay(w.startsAt)}`} · ${catName(w.theme)} (${w.plays})`]), id,
      (v) => go(`#/ranking/semanal/${v}`));
    verifiedFilter(() => fillWeeklyRanking(rank, id, me, id !== weeks[0].id, onlyVerified));
  } else if (board === 'mensual' || board === 'anual') {
    let weeks = [];
    try { weeks = await store.listWeeks(); } catch (e) { console.error(e); }
    const now = ymVet(Date.now());
    const first = weeks.length ? ymVet(weeks[weeks.length - 1].startsAt) : now;
    if (board === 'mensual') {
      const months = [];
      for (let y = now.year, m = now.month; y > first.year || (y === first.year && m >= first.month); m === 1 ? (y--, m = 12) : m--) {
        months.push([`${y}-${m}`, `${MONTHS[m - 1]} ${y}`]);
      }
      const value = sub || `${now.year}-${now.month}`;
      periodSelect(months, value, (v) => go(`#/ranking/mensual/${v}`));
      const [y, m] = value.split('-').map(Number);
      verifiedFilter(() => fillPeriodRanking(rank, y, m, me, onlyVerified));
    } else {
      const years = [];
      for (let y = now.year; y >= first.year; y--) years.push([y, String(y)]);
      const value = +sub || now.year;
      periodSelect(years, value, (v) => go(`#/ranking/anual/${v}`));
      verifiedFilter(() => fillPeriodRanking(rank, value, null, me, onlyVerified));
    }
  } else if (board === 'copas') {
    box.innerHTML = '<p class="muted small">Copas de la sala oficial semanal de Draft Worlds: el campeón de cada semana gana una.</p>';
    verifiedFilter(() => fillCupRanking(rank, me, onlyVerified));
  } else {
    fillRanking(rank, board, nameKey(playerName()));
  }
}

async function fillCupRanking(el, highlight = '', onlyVerified = false) {
  try {
    let rows = await store.draftCupRanking();
    if (onlyVerified) rows = rows.filter((r) => r.verified);
    if (!rows.length) {
      el.innerHTML = onlyVerified ? NO_VERIFIED_MSG : `<p class="muted">Todavía nadie ha ganado una copa. <a href="#/draft/oficial">Ir a la sala oficial</a></p>`;
      return;
    }
    el.innerHTML = rankTable(['Nombre', 'Copas'], rows.map((r, i) => `
      <tr class="${nameKey(r.name) === highlight ? 'me' : ''}">
        <td class="pos pos-${i + 1}">${i + 1}</td>
        <td>${nameWithBadge(r.name, r.verified)}</td>
        <td><b>${r.cups}</b></td>
      </tr>`));
  } catch (e) {
    console.error(e);
    el.innerHTML = `<p class="error-text">No se pudo cargar el ranking de copas.</p>`;
  }
}

// ---------------- partida ----------------
function startGame(cfg) {
  stopGame();
  const name = cfg.name || requireName();
  if (!name) return;
  game = {
    ...cfg,
    name,
    idx: 0,
    correct: 0,
    totalMs: 0,
    tabSwitches: 0,
    answers: [],
    startedAt: Date.now(),
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
  };
  document.body.classList.add('playing');
  showQuestion();
}

function showQuestion() {
  const g = game;
  const q = g.questions[g.idx];
  // Las preguntas extra no se anuncian: el contador solo cuenta las normales
  // y la extra aparece por sorpresa al final.
  const isExtra = q.cat === EXTRA_CATEGORY.id;
  const normal = g.questions.filter((x) => x.cat !== EXTRA_CATEGORY.id).length;
  app.innerHTML = `
    <section class="game${isExtra ? ' extra' : ''}">
      <div class="game-top">
        ${isExtra
          ? '<span class="counter extra-flag">¡Pregunta extra!</span>'
          : `<span class="counter">Pregunta <b>${g.idx + 1}</b>/${normal}</span>${catChip(q.cat)}`}
        <span class="score">ACIERTOS <b>${g.correct}</b></span>
      </div>
      <div class="timer"><div class="track"><div class="timer-bar" id="bar"></div></div><span id="secs">10</span></div>
      <h2 class="question">${esc(q.text)}</h2>
      <div class="options">
        ${q.options.map((o, i) => `<button class="option" data-i="${i}"><span class="letter">${'ABCD'[i]}</span>${esc(o)}</button>`).join('')}
      </div>
      <p class="feedback" id="feedback"></p>
    </section>`;

  app.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => answer(+b.dataset.i)));
  savePending(g);
  g.locked = false;
  g.qStart = performance.now();
  tick();
}

function tick() {
  if (!game || game.locked) return;
  const left = Math.max(0, TIME_LIMIT - (performance.now() - game.qStart));
  const bar = document.getElementById('bar');
  const secs = document.getElementById('secs');
  if (bar) {
    bar.style.transform = `scaleX(${left / TIME_LIMIT})`;
    bar.classList.toggle('warn', left < 3000);
  }
  if (secs) secs.textContent = Math.ceil(left / 1000);
  if (left <= 0) return answer(-1);
  raf = requestAnimationFrame(tick);
}

function answer(choice) {
  const g = game;
  if (!g || g.locked) return;
  g.locked = true;
  cancelAnimationFrame(raf);

  const q = g.questions[g.idx];
  const elapsed = Math.min(TIME_LIMIT, performance.now() - g.qStart);
  const ok = choice === q.correct;
  g.correct += ok ? 1 : 0;
  g.totalMs += elapsed;
  g.answers.push({ id: q.id, ok, ms: Math.round(elapsed) });

  const buttons = app.querySelectorAll('.option');
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === q.correct) b.classList.add('correct');
    else if (i === choice) b.classList.add('wrong');
  });
  const fb = document.getElementById('feedback');
  fb.className = `feedback ${ok ? 'ok' : 'bad'}`;
  fb.textContent = ok ? '¡Correcto!' : choice === -1 ? '¡Se acabó el tiempo!' : 'Incorrecto';
  const score = app.querySelector('.score b');
  if (score) score.textContent = g.correct;
  savePending(g);
  // El semanal se guarda en el servidor tras cada respuesta (la última, al terminar).
  if (g.mode === 'semanal' && g.answers.length < g.questions.length) {
    store.weeklyProgress(g.weekId, g.answers.length, g.correct, g.totalMs, false)
      .catch((e) => console.error('No se pudo guardar el progreso', e));
  }

  setTimeout(() => {
    if (g.aborted) return;
    g.idx++;
    if (g.idx < g.questions.length) showQuestion();
    else finishGame();
  }, REVEAL_MS);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && !game.locked) game.tabSwitches++;
});

// ---------------- guardado de partidas (completas y abandonadas) ----------------
// Datos mínimos de una partida para poder guardarla, aunque sea desde una visita posterior.
function snapshot(g) {
  return {
    id: g.id, name: g.name, mode: g.mode, board: g.board, label: g.label,
    correct: g.correct, totalMs: g.totalMs, answered: g.answers.length,
    total: g.questions.length, tabSwitches: g.tabSwitches, startedAt: g.startedAt,
  };
}

function buildEntries(s, id, finished) {
  const key = nameKey(s.name);
  const timeMs = Math.round(s.totalMs);
  const now = Date.now();
  // La puntuación es el número de aciertos.
  const scoreEntry = { name: s.name, nameKey: key, score: s.correct, correct: s.correct, total: s.total, timeMs, ts: now, deviceId: id.deviceId };
  const logEntry = {
    ts: now,
    name: s.name,
    nameKey: key,
    mode: s.mode,
    board: s.board,
    boardLabel: s.label,
    score: s.correct,
    correct: s.correct,
    total: s.total,
    answered: s.answered,
    finished,
    timeMs,
    durationMs: now - s.startedAt,
    tabSwitches: s.tabSwitches,
    deviceId: id.deviceId,
    fp: id.fp,
    ua: id.ua,
    namesOnDevice: rememberName(s.name).slice(-20),
  };
  return { scoreEntry, logEntry };
}

// Guarda una partida que no llegó al final. No espera a la red, para que funcione
// también al cerrar la pestaña (las peticiones salen con keepalive). En el semanal
// el progreso ya está en el servidor: solo se añade al registro.
function sendAbandoned(s, id) {
  const { scoreEntry, logEntry } = buildEntries(s, id, false);
  const jobs = [store.addLog(logEntry)];
  if (s.answered > 0 && s.mode !== 'semanal') jobs.push(store.submitScore(s.board, scoreEntry));
  return Promise.all(jobs).catch((e) => console.error('No se pudo guardar la partida abandonada', e));
}

function saveAbandoned(g) {
  if (g.done) return;
  g.done = true;
  clearPending(g.id);
  sendAbandoned(snapshot(g), getIdentity());
}

// Copia de la partida en curso en el navegador. Si la página se cierra de golpe
// (por ejemplo, el móvil la mata), se envía como abandonada en la siguiente visita.
const PENDING_KEY = 'cg_pending';
function savePending(g) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...snapshot(g), updatedAt: Date.now() })); } catch {}
}
function clearPending(id) {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    if (p && (!id || p.id === id)) localStorage.removeItem(PENDING_KEY);
  } catch {}
}
function recoverPending() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch {}
  if (!p || !p.id || (game && game.id === p.id)) return;
  // Si se actualizó hace poco, puede que siga en juego en otra pestaña: se vuelve a mirar más tarde.
  const age = Date.now() - (p.updatedAt || 0);
  if (age < 30_000) {
    setTimeout(recoverPending, 30_000 - age + 1000);
    return;
  }
  clearPending(p.id);
  sendAbandoned(p, getIdentity());
}

window.addEventListener('pagehide', () => {
  if (game && !game.done) saveAbandoned(game);
});

async function finishGame() {
  const g = game;
  g.locked = true;
  g.done = true;
  clearPending(g.id);
  document.body.classList.remove('playing');
  app.innerHTML = `<p class="loading">Guardando resultado…</p>`;

  const id = getIdentity();
  const key = nameKey(g.name);
  const timeMs = Math.round(g.totalMs);
  const total = g.questions.length;
  const { scoreEntry, logEntry } = buildEntries(snapshot(g), id, true);
  const weekly = g.mode === 'semanal';

  let saved = true;
  try {
    await Promise.all([
      weekly
        ? store.weeklyProgress(g.weekId, g.answers.length, g.correct, g.totalMs, true)
        : store.submitScore(g.board, scoreEntry),
      store.addLog(logEntry),
    ]);
  } catch (e) {
    console.error(e);
    saved = false;
  }
  if (game !== g) return; // el usuario navegó a otra página mientras se guardaba

  const pct = g.correct / total;
  const msg = pct === 1 ? '¡Perfecto!' : pct >= 0.8 ? '¡Excelente!' : pct >= 0.5 ? '¡Bien hecho!' : '¡Sigue practicando!';
  app.innerHTML = `
    <section class="card result">
      <p class="eyebrow">${esc(g.label)}</p>
      <h2>${msg}</h2>
      <div class="big-score">${g.correct}<small> / ${total}</small></div>
      <p class="muted small">aciertos</p>
      <div class="stats">
        <div><b>${Math.round(pct * 100)}%</b><span>precisión</span></div>
        <div><b>${fmtTime(timeMs)}</b><span>tiempo total</span></div>
        <div><b id="pos">…</b><span>posición</span></div>
      </div>
      ${saved ? '' : '<p class="error-text">No se pudo guardar el resultado (sin conexión).</p>'}
      <div class="row center">
        ${weekly
          ? `<a class="btn" href="#/ranking/semanal/${g.weekId}">Ver rankings</a>`
          : `<button class="btn" id="again">${g.mode === 'sala' ? 'Volver a la sala' : 'Jugar otra vez'}</button>`}
        <a class="btn ghost" href="#/">Inicio</a>
      </div>
      ${weekly ? '<p class="muted small">El próximo reto semanal empieza el sábado a las 8pm (hora de Venezuela).</p>' : ''}
    </section>
    <section class="card">
      <h3>Ranking · ${weekly ? 'esta semana' : esc(g.label)}</h3>
      <div id="rank"><p class="loading">Cargando…</p></div>
    </section>`;
  document.getElementById('again')?.addEventListener('click', () => {
    if (g.mode === 'sala') return go(`#/sala/${g.lobbyCode}`);
    startGame({ mode: g.mode, board: g.board, label: g.label, questions: buildRandom() });
  });
  const rows = weekly
    ? await fillWeeklyRanking(document.getElementById('rank'), g.weekId, key)
    : await fillRanking(document.getElementById('rank'), g.board, key);
  const pos = rows.findIndex((r) => nameKey(r.name) === key);
  const posEl = document.getElementById('pos');
  if (posEl) posEl.textContent = pos >= 0 ? `#${pos + 1}` : '—';
}

// ---------------- cuenta ----------------
function renderAccount(tab) {
  if (!store.online()) {
    app.innerHTML = `<a class="back" href="#/">← Volver</a><section class="card narrow"><h2>Cuenta</h2><p class="muted">Las cuentas necesitan conexión con el servidor.</p></section>`;
    return;
  }
  const p = profileOf();
  if (p) {
    app.innerHTML = `
      <a class="back" href="#/">← Volver</a>
      <section class="card narrow">
        <p class="eyebrow">Mi cuenta</p>
        <h2>${nameWithBadge(p.displayName, p.verified)}</h2>
        <p>Estado: <span class="chip ${p.status === 'approved' ? 'ok' : 'warn'}">${STATUS_TEXT[p.status] || esc(p.status)}</span>${p.verified ? ' <span class="chip verified-chip">Verificada</span>' : ''}</p>
        ${p.verified ? '' : '<p class="muted small">El administrador puede marcar tu cuenta como verificada cuando compruebe que eres quien dices ser. Saldrá una insignia junto a tu nombre en los rankings.</p>'}
        ${p.status === 'rejected' || p.status === 'blocked' ? '<p class="muted small">Tu cuenta no puede jugar el reto semanal. Si crees que es un error, habla con el administrador.</p>' : ''}
        ${isAdmin() ? '<a class="btn big" href="#/admin">Panel de administrador</a>' : ''}
        <form id="pwForm" class="stack">
          <label class="field"><span>Cambiar contraseña</span>
            <input id="pw1" type="password" autocomplete="new-password" placeholder="Nueva contraseña (mínimo 6)" minlength="6" maxlength="72">
          </label>
          <button class="btn ghost">Guardar contraseña</button>
        </form>
        <button class="btn ghost danger" id="logout">Cerrar sesión</button>
      </section>`;
    document.getElementById('pwForm').onsubmit = async (e) => {
      e.preventDefault();
      const pw = document.getElementById('pw1').value;
      if (pw.length < 6) return toast('La contraseña debe tener al menos 6 caracteres.', 'error');
      try {
        await store.changePassword(pw);
        document.getElementById('pw1').value = '';
        toast('Contraseña cambiada.');
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    document.getElementById('logout').onclick = async () => {
      await store.signOut();
      await refreshAccount();
      go('#/');
    };
    return;
  }

  app.innerHTML = `
    <a class="back" href="#/">← Volver</a>
    <section class="card narrow auth">
      <div class="auth-switch" role="tablist">
        <button type="button" role="tab" data-tab="login">Entrar</button>
        <button type="button" role="tab" data-tab="register">Crear cuenta</button>
      </div>
      <form id="loginForm" class="stack">
        <h2>Entrar</h2>
        <p class="muted small">Con tu usuario y contraseña. La sesión se queda abierta en este dispositivo.</p>
        <label class="field"><span>Usuario</span><input id="lUser" autocomplete="username" maxlength="20" autocapitalize="none"></label>
        <label class="field"><span>Contraseña</span><input id="lPass" type="password" autocomplete="current-password" maxlength="72"></label>
        <button class="btn big">Entrar</button>
        <p class="auth-alt">¿No tienes cuenta? <button type="button" class="link" data-tab="register">Crea una aquí</button></p>
        <p class="muted small">Si olvidaste tu contraseña, pídele al administrador que te ponga una nueva.</p>
      </form>
      <form id="registerForm" class="stack">
        <h2>Crear cuenta</h2>
        <p class="muted small">No se pide correo ni teléfono. Podrás jugar el reto semanal en cuanto crees la cuenta.</p>
        <label class="field"><span>Usuario</span>
          <input id="rUser" autocomplete="username" maxlength="20" autocapitalize="none">
          <small class="muted">De 3 a 20 letras, números, punto, guion o guion bajo. Sin espacios.</small></label>
        <label class="field"><span>Contraseña (mínimo 6)</span><input id="rPass" type="password" autocomplete="new-password" maxlength="72"></label>
        <label class="field"><span>Repite la contraseña</span><input id="rPass2" type="password" autocomplete="new-password" maxlength="72"></label>
        <button class="btn big">Crear cuenta</button>
        <p class="auth-alt">¿Ya tienes cuenta? <button type="button" class="link" data-tab="login">Entra aquí</button></p>
      </form>
    </section>`;

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  // Solo se ve un formulario a la vez: "Entrar" o "Crear cuenta".
  const show = (which, focus) => {
    app.querySelectorAll('.auth-switch [data-tab]').forEach((x) => {
      x.classList.toggle('active', x.dataset.tab === which);
      x.setAttribute('aria-selected', String(x.dataset.tab === which));
    });
    loginForm.hidden = which !== 'login';
    registerForm.hidden = which !== 'register';
    if (focus) (which === 'login' ? loginForm : registerForm).querySelector('input').focus();
  };
  app.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => show(b.dataset.tab, true)));
  show(tab === 'crear' ? 'register' : 'login', false);
  const busy = (form, on) => form.querySelectorAll('button').forEach((b) => (b.disabled = on));

  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const user = document.getElementById('lUser').value.trim();
    const pass = document.getElementById('lPass').value;
    if (!validUsername(user) || !pass) return toast('Escribe tu usuario y tu contraseña.', 'error');
    busy(loginForm, true);
    try {
      await store.signIn(user, pass);
      await refreshAccount();
      toast(`Hola, ${profileOf()?.displayName || user}.`);
      go('#/');
    } catch (err) {
      toast(err.message, 'error');
    }
    busy(loginForm, false);
  };

  registerForm.onsubmit = async (e) => {
    e.preventDefault();
    const user = document.getElementById('rUser').value.trim();
    const pass = document.getElementById('rPass').value;
    const pass2 = document.getElementById('rPass2').value;
    if (!validUsername(user)) return toast('El usuario debe tener de 3 a 20 letras, números, punto, guion o guion bajo.', 'error');
    if (pass.length < 6) return toast('La contraseña debe tener al menos 6 caracteres.', 'error');
    if (pass !== pass2) return toast('Las contraseñas no coinciden.', 'error');
    busy(registerForm, true);
    try {
      await store.signUp(user, pass);
      await refreshAccount();
      toast(`Cuenta creada. Ya entraste como ${profileOf()?.displayName || user}.`);
      go('#/');
    } catch (err) {
      toast(err.message, 'error');
    }
    busy(registerForm, false);
  };
}

// ---------------- panel del administrador ----------------
async function renderAdmin() {
  if (!isAdmin()) {
    app.innerHTML = `<a class="back" href="#/">← Volver</a><section class="card narrow"><h2>Administrador</h2><p class="muted">Solo la cuenta de administrador puede entrar aquí.</p><a class="btn" href="#/cuenta">Entrar</a></section>`;
    return;
  }
  app.innerHTML = `<p class="loading">Cargando panel…</p>`;
  let users, week, current, next, dw;
  try {
    week = await store.getWeek();
    [users, current, next, dw] = await Promise.all([store.adminUsers(), store.adminWeek(week.id), store.adminWeek(week.id + 1),
      store.draftAdmin().catch((e) => ({ error: e.message }))]);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<a class="back" href="#/">← Volver</a><section class="card"><p class="error-text">No se pudo cargar el panel: ${esc(e.message)}</p></section>`;
    return;
  }
  const verifiedCount = users.filter((u) => u.verified).length;
  const me = profileOf()?.username;

  const userRow = (u) => {
    const self = u.username === me;
    const actions = [
      u.verified
        ? `<button class="btn ghost sm" data-verify="0" data-id="${u.id}">Quitar verificado</button>`
        : `<button class="btn sm" data-verify="1" data-id="${u.id}">Verificar</button>`,
      self ? '' : u.status === 'approved'
        ? `<button class="btn ghost sm danger" data-act="blocked" data-id="${u.id}">Bloquear</button>`
        : `<button class="btn ghost sm" data-act="approved" data-id="${u.id}">${u.status === 'blocked' ? 'Desbloquear' : 'Activar'}</button>`,
      self ? '' : `<button class="btn ghost sm" data-pass="${u.id}" data-name="${esc(u.displayName)}">Contraseña</button>`,
    ].join(' ');
    return `
      <tr>
        <td><b>${nameWithBadge(u.displayName, u.verified)}</b>${u.isAdmin ? ' <span class="chip">admin</span>' : ''}${self ? ' <span class="muted small">(tú)</span>' : ''}</td>
        <td><span class="chip ${u.status === 'approved' ? 'ok' : 'warn'}">${STATUS_TEXT[u.status] || esc(u.status)}</span></td>
        <td>${fmtDate(u.createdAt)}</td>
        <td>${u.plays}</td>
        <td class="actions">${actions}</td>
      </tr>`;
  };

  const themeOptions = (value) => `<option value="">Todas las categorías</option>` +
    CATEGORIES.map((c) => `<option value="${c.id}" ${value === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

  const weekForm = (w, title) => {
    const locked = w.plays.length > 0;
    const ex = w.extra || { text: '', options: ['', '', '', ''] };
    return `
      <section class="card">
        <h3>${title} <span class="muted small">del sábado ${fmtDay(w.startsAt)} a las 8pm</span></h3>
        <form class="stack week-form" data-week="${w.id}">
          <label class="field"><span>Tema de la semana</span>
            <select name="theme" ${locked ? 'disabled' : ''}>${themeOptions(w.theme)}</select>
          </label>
          <fieldset class="extra-box" ${locked ? 'disabled' : ''}>
            <legend>Pregunta extra o trampa (opcional, sale por sorpresa al final y suma 1 acierto)</legend>
            <input name="text" maxlength="200" placeholder="Ej. ¿Cuál es el mejor espadachín de la historia?" value="${esc(ex.text)}">
            <input name="o0" maxlength="80" placeholder="Respuesta correcta (ej. Zenitsu Agatsuma)" value="${esc(ex.options[0])}">
            <input name="o1" maxlength="80" placeholder="Respuesta incorrecta 1" value="${esc(ex.options[1])}">
            <input name="o2" maxlength="80" placeholder="Respuesta incorrecta 2" value="${esc(ex.options[2])}">
            <input name="o3" maxlength="80" placeholder="Respuesta incorrecta 3" value="${esc(ex.options[3])}">
          </fieldset>
          ${locked
            ? '<p class="muted small">Ya hay partidas jugadas esta semana: el tema y la pregunta extra no se pueden cambiar.</p>'
            : `<div class="row small-gap"><button class="btn">Guardar</button>${w.extra ? '<button type="button" class="btn ghost sm danger" data-clear-extra>Quitar pregunta extra</button>' : ''}</div>`}
        </form>
        ${w === current ? `
          <h4>Partidas de esta semana (${w.plays.length})</h4>
          ${w.plays.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>Jugador</th><th>Aciertos</th><th>Tiempo</th><th>Estado</th><th>Empezó</th><th>Dispositivo</th><th></th></tr></thead>
            <tbody>${w.plays.map((p) => `
              <tr>
                <td><b>${esc(p.name)}</b></td>
                <td>${p.correct}/${p.total}</td>
                <td>${fmtTime(p.timeMs)}</td>
                <td>${p.finished ? 'Completa' : `<span class="warn-text">Sin terminar (${p.answered}/${p.total})</span>`}</td>
                <td>${fmtDate(p.startedAt)}</td>
                <td class="mono small">${esc(p.deviceId.slice(0, 8))} · ${esc(p.ua)}</td>
                <td><button class="btn ghost sm danger" data-del-play="${p.userId}" data-name="${esc(p.name)}">Borrar partida</button></td>
              </tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Nadie ha jugado todavía.</p>'}
          <p class="muted small">Al borrar la partida de alguien, esa persona puede volver a jugar el reto de esta semana.</p>` : ''}
      </section>`;
  };

  app.innerHTML = `
    <a class="back" href="#/">← Volver</a>
    <section class="card">
      <h2>Panel de administrador</h2>
      <div class="stats">
        <div><b>${users.length}</b><span>cuentas</span></div>
        <div><b>${verifiedCount}</b><span>verificadas</span></div>
        <div><b>${current.plays.length}</b><span>jugaron esta semana</span></div>
      </div>
      <a class="btn ghost sm" href="#/registro">Ver registro de partidas</a>
    </section>
    <section class="card">
      <h3>Cuentas</h3>
      <p class="muted small">Las cuentas se pueden usar nada más crearlas. Pon la insignia de <b>verificado</b> a quien hayas comprobado por fuera (por ejemplo, por WhatsApp) que es quien dice ser. Bloquea a quien haga trampas: no podrá jugar el reto semanal y desaparece de los rankings.</p>
      <div class="table-wrap"><table class="table users">
        <thead><tr><th>Usuario</th><th>Estado</th><th>Creada</th><th>Semanas</th><th></th></tr></thead>
        <tbody>${users.map(userRow).join('') || '<tr><td colspan="5" class="muted">No hay cuentas.</td></tr>'}</tbody>
      </table></div>
    </section>
    ${weekForm(current, 'Semana en curso')}
    ${weekForm(next, 'Próxima semana')}
    ${draftAdminCard(dw)}`;

  const reload = () => renderAdmin();
  app.onclick = async (e) => {
    const act = e.target.closest('[data-act]');
    const verify = e.target.closest('[data-verify]');
    const pass = e.target.closest('[data-pass]');
    const del = e.target.closest('[data-del-play]');
    const clearExtra = e.target.closest('[data-clear-extra]');
    const cup = e.target.closest('[data-cup]');
    try {
      if (cup) {
        cup.disabled = true;
        const st = await store.draftState(cup.dataset.cup);
        const seat = championSeat(resultOf(st));
        await store.draftAward(st.code, seat);
        toast(seat ? `Copa entregada a ${st.seats.find((x) => x.seat === seat)?.name}.` : 'Ganó un bot: esa semana no hay copa.');
        return reload();
      }
      if (verify) {
        await store.adminSetVerified(verify.dataset.id, verify.dataset.verify === '1');
        toast(verify.dataset.verify === '1' ? 'Cuenta verificada.' : 'Verificado quitado.');
        return reload();
      }
      if (act) {
        await store.adminSetStatus(act.dataset.id, act.dataset.act);
        toast('Cuenta actualizada.');
        return reload();
      }
      if (pass) {
        const pw = prompt(`Nueva contraseña para ${pass.dataset.name} (mínimo 6 caracteres):`);
        if (pw == null) return;
        if (pw.length < 6) return toast('La contraseña debe tener al menos 6 caracteres.', 'error');
        await store.adminSetPassword(pass.dataset.pass, pw);
        return toast(`Contraseña de ${pass.dataset.name} cambiada. Díselo por privado.`);
      }
      if (del) {
        if (!confirm(`¿Borrar la partida semanal de ${del.dataset.name}? Podrá volver a jugar el reto de esta semana.`)) return;
        await store.adminDeletePlay(current.id, del.dataset.delPlay);
        toast('Partida borrada.');
        return reload();
      }
      if (clearExtra) {
        const form = clearExtra.closest('form');
        await store.adminSetWeek(+form.dataset.week, form.theme.value, null);
        toast('Pregunta extra quitada.');
        return reload();
      }
    } catch (err) {
      console.error(err);
      toast(err.message, 'error');
    }
  };
  document.getElementById('dwLevel')?.addEventListener('change', async (e) => {
    try {
      await store.draftSetLevel(e.target.value);
      toast('Dificultad de los bots guardada.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  app.querySelectorAll('.week-form').forEach((form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const text = form.text.value.trim();
      const options = [form.o0, form.o1, form.o2, form.o3].map((i) => i.value.trim());
      const anyExtra = text || options.some(Boolean);
      if (anyExtra && (text.length < 5 || options.some((o) => !o))) {
        return toast('La pregunta extra necesita el texto, la respuesta correcta y 3 incorrectas.', 'error');
      }
      if (anyExtra && new Set(options.map((o) => o.toLowerCase())).size < 4) {
        return toast('Las 4 respuestas de la pregunta extra deben ser distintas.', 'error');
      }
      try {
        await store.adminSetWeek(+form.dataset.week, form.theme.value, anyExtra ? { text, options } : null);
        toast('Semana guardada.');
        reload();
      } catch (err) {
        console.error(err);
        toast(err.message, 'error');
      }
    };
  });
}

// Draft Worlds en el panel: dificultad de los bots de la sala oficial y salas de las últimas semanas.
function draftAdminCard(dw) {
  if (!dw || dw.error) {
    return `<section class="card"><h3>Draft Worlds</h3><p class="error-text">No se pudo cargar: ${esc(dw?.error || '')}. ¿Ejecutaste el setup.sql nuevo en Supabase?</p></section>`;
  }
  const LEVELS = [['facil', 'Fácil'], ['medio', 'Media'], ['imposible', 'Imposible']];
  const status = (l) => (l.status === 'drafting' ? 'Abierta' : l.championSeat == null ? '<span class="warn-text">Jugada, copa sin asignar</span>' : l.championSeat > 0 ? 'Copa entregada' : 'Ganó un bot');
  return `
    <section class="card">
      <h3>Draft Worlds</h3>
      <label class="field"><span>Dificultad de los bots en la sala oficial</span>
        <select id="dwLevel">${LEVELS.map(([v, t]) => `<option value="${v}" ${dw.level === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <p class="muted small">La sala oficial se abre cada sábado a las 8pm. Entran los 16 primeros verificados; tú la inicias desde la propia sala. La copa se entrega sola al terminar la simulación en tu pantalla; si cerraste antes, usa "Asignar copa".</p>
      <a class="btn sm" href="#/draft/oficial">Ir a la sala oficial</a>
      ${dw.official.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Semana</th><th>Jugadores</th><th>Estado</th><th></th></tr></thead>
        <tbody>${dw.official.map((l) => `
          <tr>
            <td>${fmtDay(weekStartMs(l.weekId))}</td>
            <td>${l.players}</td>
            <td>${status(l)}</td>
            <td class="actions"><a class="btn ghost sm" href="#/draft/sala/${esc(l.code)}">Ver</a>${l.status === 'simulating' && l.championSeat == null ? ` <button class="btn sm" data-cup="${esc(l.code)}">Asignar copa</button>` : ''}</td>
          </tr>`).join('')}</tbody></table></div>` : ''}
    </section>`;
}
// Inicio de una semana (misma cuenta que week_start en Supabase).
const weekStartMs = (id) => (259200 + id * 604800) * 1000;

// ---------------- registro (log) ----------------
// "Abandonó en la 5/15" = salió mientras estaba en la pregunta 5 (había respondido 4).
const statusText = (l) => (l.finished ? 'Completa' : `Abandonó en la ${Math.min(l.answered + 1, l.total)}/${l.total}`);

function groupSuspicious(logs, field) {
  const groups = new Map();
  for (const l of logs) {
    const k = l[field];
    if (!k) continue;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { key: k, names: new Map(), games: 0, last: 0, ua: l.ua }));
    g.games++;
    g.names.set(l.nameKey, l.name);
    g.last = Math.max(g.last, l.ts);
  }
  return [...groups.values()]
    .filter((g) => g.names.size >= CONFIG.SUSPICIOUS_NAMES)
    .sort((a, b) => b.names.size - a.names.size);
}

function getAdminPin() {
  try { return sessionStorage.getItem('cg_admin_pin'); } catch { return null; }
}
function setAdminPin(pin) {
  try {
    if (pin) sessionStorage.setItem('cg_admin_pin', pin);
    else sessionStorage.removeItem('cg_admin_pin');
  } catch {}
}

// Solo en modo local: el registro se protege con el PIN de config.js.
function renderPinForm() {
  app.innerHTML = `
    <a class="back" href="#/">← Volver</a>
    <form class="card narrow" id="pin">
      <h2>Registro</h2>
      <p class="muted">Introduce el PIN de administrador.</p>
      <input id="pinInput" type="password" autocomplete="current-password">
      <button class="btn big" id="pinBtn">Entrar</button>
      <p class="muted small">Modo local: el PIN se cambia en <code>js/config.js</code>.</p>
    </form>`;
  const input = document.getElementById('pinInput');
  input.focus();
  document.getElementById('pin').onsubmit = async (e) => {
    e.preventDefault();
    if ((await store.checkPin(input.value)) === 'ok') {
      setAdminPin(input.value);
      renderLog();
    } else {
      toast('PIN incorrecto.', 'error');
      input.select();
    }
  };
}

async function renderLog() {
  const online = store.kind() === 'supabase';
  let pin = null;
  if (online) {
    if (!isAdmin()) {
      app.innerHTML = `<a class="back" href="#/">← Volver</a><section class="card narrow"><h2>Registro</h2><p class="muted">Solo la cuenta de administrador puede ver el registro.</p><a class="btn" href="#/cuenta">Entrar</a></section>`;
      return;
    }
  } else {
    pin = getAdminPin();
    if (!pin) return renderPinForm();
  }

  app.innerHTML = `<p class="loading">Cargando registro…</p>`;
  let logs = [];
  try {
    logs = await store.getLogs(pin, 1000);
  } catch (e) {
    console.error(e);
    if (!online && /PIN/i.test(e.message)) {
      setAdminPin(null);
      return renderPinForm();
    }
    app.innerHTML = `<a class="back" href="#/">← Volver</a><section class="card"><p class="error-text">No se pudo cargar el registro: ${esc(e.message)}</p></section>`;
    return;
  }

  const byDevice = groupSuspicious(logs, 'deviceId');
  const byFp = groupSuspicious(logs, 'fp');
  const suspectDevices = new Set([...byDevice, ...byFp].map((g) => g.key));
  const uniq = (f) => new Set(logs.map((l) => l[f]).filter(Boolean)).size;

  const groupHtml = (title, list, hint) => `
    <div class="sus-block">
      <h4>${title} <span class="muted small">${hint}</span></h4>
      ${list.length ? list.map((g) => `
        <div class="sus">
          <div class="sus-head">
            <button class="link mono" data-filter="${esc(g.key)}">${esc(String(g.key).slice(0, 16))}</button>
            <span class="badge">${g.names.size} nombres</span>
            <span class="muted small">${g.games} partidas · ${esc(g.ua || '')} · última ${fmtDate(g.last)}</span>
          </div>
          <div class="chips">${[...g.names.values()].map((n) => `<span class="chip">${esc(n)}</span>`).join('')}</div>
        </div>`).join('') : `<p class="muted small">Nada sospechoso.</p>`}
    </div>`;

  app.innerHTML = `
    <a class="back" href="${online ? '#/admin' : '#/'}">← Volver</a>
    <section class="card">
      <h2>Registro de partidas</h2>
      <div class="stats">
        <div><b>${logs.length}</b><span>partidas</span></div>
        <div><b>${uniq('nameKey')}</b><span>nombres</span></div>
        <div><b>${uniq('deviceId')}</b><span>dispositivos</span></div>
        <div><b>${logs.filter((l) => !l.finished).length}</b><span>abandonadas</span></div>
      </div>
      <p class="muted small">Modo de almacenamiento: <b>${online ? 'en línea (Supabase)' : 'local (solo este navegador)'}</b></p>
    </section>

    <section class="card">
      <h3>Posibles cuentas múltiples</h3>
      <p class="muted small">Se marcan los dispositivos y navegadores desde los que se jugó con ${CONFIG.SUSPICIOUS_NAMES} o más nombres distintos.</p>
      ${groupHtml('Por dispositivo', byDevice, '(identificador guardado en el navegador)')}
      ${groupHtml('Por huella del navegador', byFp, '(detecta incógnito o datos borrados)')}
    </section>

    <section class="card">
      <div class="row between">
        <h3>Todas las partidas</h3>
        <div class="row small-gap">
          <button class="btn ghost sm" id="csv">Descargar CSV</button>
          <button class="btn ghost sm danger" id="clear">Borrar todo</button>
          ${online ? '' : '<button class="btn ghost sm" id="logout">Salir</button>'}
        </div>
      </div>
      <input id="filter" placeholder="Filtrar por nombre, modo, dispositivo o estado…">
      <div class="table-wrap">
        <table class="table log">
          <thead><tr><th>Fecha</th><th>Nombre</th><th>Modo</th><th>Aciertos</th><th>Estado</th><th>Tiempo</th><th title="Veces que salió de la pestaña durante la partida">Pestaña</th><th>Dispositivo</th><th>Huella</th><th>Navegador</th></tr></thead>
          <tbody id="logBody"></tbody>
        </table>
      </div>
    </section>`;

  const body = document.getElementById('logBody');
  const filter = document.getElementById('filter');
  const draw = () => {
    const f = filter.value.trim().toLowerCase();
    const rows = f
      ? logs.filter((l) => [l.name, l.boardLabel, l.mode, l.deviceId, l.fp, statusText(l)].some((v) => String(v ?? '').toLowerCase().includes(f)))
      : logs;
    body.innerHTML = rows.slice(0, 500).map((l) => `
      <tr class="${suspectDevices.has(l.deviceId) || suspectDevices.has(l.fp) ? 'suspect' : ''}">
        <td>${fmtDate(l.ts)}</td>
        <td><b>${esc(l.name)}</b></td>
        <td>${esc(l.boardLabel || l.mode)}</td>
        <td>${l.correct}/${l.total || QUESTION_COUNT}</td>
        <td class="${l.finished ? '' : 'warn-text'}">${esc(statusText(l))}</td>
        <td>${fmtTime(l.timeMs)}</td>
        <td class="${l.tabSwitches ? 'warn-text' : ''}">${l.tabSwitches ?? 0}</td>
        <td><button class="link mono" data-filter="${esc(l.deviceId)}">${esc(String(l.deviceId).slice(0, 8))}</button></td>
        <td><button class="link mono" data-filter="${esc(l.fp)}">${esc(String(l.fp).slice(0, 8))}</button></td>
        <td class="small">${esc(l.ua || '')}</td>
      </tr>`).join('') || `<tr><td colspan="10" class="muted">Sin partidas.</td></tr>`;
  };
  filter.oninput = draw;
  app.onclick = (e) => {
    const t = e.target.closest('[data-filter]');
    if (!t) return;
    filter.value = t.dataset.filter;
    draw();
    app.querySelector('.table-wrap').scrollLeft = 0;
    filter.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  draw();

  document.getElementById('logout')?.addEventListener('click', () => {
    setAdminPin(null);
    go('#/');
  });
  document.getElementById('clear').onclick = async () => {
    const what = online
      ? '¿Borrar todo el registro y los rankings de Aleatorio y salas de TODOS los jugadores? El reto semanal no se toca. No se puede deshacer.'
      : '¿Borrar todo el registro y los rankings de este navegador? No se puede deshacer.';
    if (!confirm(what)) return;
    try {
      await store.clearLogs(pin);
      toast('Registro y rankings borrados.');
    } catch (e) {
      console.error(e);
      toast('No se pudo borrar el registro.', 'error');
    }
    renderLog();
  };
  document.getElementById('csv').onclick = () => {
    const cols = ['ts', 'name', 'boardLabel', 'correct', 'total', 'status', 'timeMs', 'tabSwitches', 'deviceId', 'fp', 'ua'];
    const value = (l, c) => (c === 'ts' ? new Date(l.ts).toISOString() : c === 'status' ? statusText(l) : l[c] ?? '');
    const csv = [cols.join(',')]
      .concat(logs.map((l) => cols.map((c) => `"${String(value(l, c)).replace(/"/g, '""')}"`).join(',')))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `registro-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
}

// ---------------- arranque ----------------
async function boot() {
  app.innerHTML = `<p class="loading">Cargando…</p>`;
  const kind = await store.init();
  const badge = document.getElementById('storageBadge');
  if (badge) {
    const err = store.error();
    if (kind === 'supabase' && err) {
      badge.textContent = 'Sin conexión con Supabase';
      badge.dataset.state = 'error';
      badge.title = err;
      toast(`No se pudo conectar con Supabase: ${err}`, 'error');
    } else if (kind === 'supabase') {
      badge.textContent = 'Ranking en línea';
      badge.dataset.state = 'ok';
      badge.title = 'Los resultados se comparten entre todos los jugadores.';
    } else {
      badge.textContent = 'Modo local (ranking solo en este dispositivo)';
      badge.dataset.state = 'local';
      badge.title = 'Configura Supabase en js/config.js para compartir el ranking.';
    }
  }
  await refreshAccount();
  // Compatibilidad con enlaces tipo ?sala=CODIGO
  const params = new URLSearchParams(location.search);
  const code = params.get('sala') || params.get('lobby');
  if (code && !location.hash) location.hash = `#/sala/${code.toUpperCase()}`;
  window.addEventListener('hashchange', route);
  // Las partidas no cambian la URL: si se pulsa un enlace a la página actual, se vuelve a pintar igualmente.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    if (game && !game.done && !confirm(ABANDON_MSG)) {
      e.preventDefault();
      return;
    }
    if (a.getAttribute('href') === (location.hash || '#/')) {
      e.preventDefault();
      route();
    }
  });
  route();
  recoverPending();
  watchVersion();
}

// ---------------- versión nueva ----------------
// Una pestaña abierta mucho rato (sobre todo en el móvil) sigue con la versión del juego con la que se abrió.
// Al volver a ella o al cambiar de pantalla se mira si se ha publicado otra (en cada publicación cambian la fecha
// y la etiqueta de index.html) y, si es así, se ofrece actualizar.
let version = null;
let versionCheckedAt = 0;
async function publishedVersion() {
  try {
    const r = await fetch('./', { method: 'HEAD', cache: 'no-store' });
    return r.ok ? `${r.headers.get('last-modified') || ''}|${r.headers.get('etag') || ''}` : null;
  } catch { return null; }
}
async function checkVersion() {
  if (document.hidden || document.querySelector('.update-bar') || Date.now() - versionCheckedAt < 30000) return;
  versionCheckedAt = Date.now();
  const v = await publishedVersion();
  if (!v || v === '|') return;
  if (!version) { version = v; return; }
  if (v === version) return;
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>Hay una versión nueva del juego.</span><button class="btn sm" type="button" data-up="go">Actualizar</button><button class="btn sm ghost" type="button" data-up="later">Más tarde</button>';
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-up]');
    if (b?.dataset.up === 'go') location.reload();
    else if (b) { version = v; bar.remove(); } // no vuelve a avisar hasta la siguiente versión
  });
  document.body.appendChild(bar);
}
function watchVersion() {
  versionCheckedAt = Date.now();
  publishedVersion().then((v) => { if (v && v !== '|') version = v; });
  document.addEventListener('visibilitychange', checkVersion);
  window.addEventListener('hashchange', checkVersion);
}

boot();
