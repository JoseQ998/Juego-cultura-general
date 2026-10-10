import { CONFIG } from './config.js';
import { CATEGORIES, QUESTIONS, CLASSIC_IDS, CLASSIC_EXTRA, EXTRA_CATEGORY } from './questions.js';
import * as store from './storage.js';
import { getIdentity, rememberName } from './identity.js';

const QUESTION_COUNT = 15;
const TIME_LIMIT = 10_000; // 10 segundos por pregunta
const REVEAL_MS = 1400;
const POINTS_PER_QUESTION = 200;

const CAT = Object.fromEntries([...CATEGORIES, EXTRA_CATEGORY].map((c) => [c.id, c]));
const BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
const app = document.getElementById('app');

let game = null;
let raf = 0;

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
const catChip = (id) => `<span class="chip">${esc(CAT[id]?.name ?? id)}</span>`;

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2800);
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

// ---------------- salas (lobbies) ----------------
// Código de sala = 2 caracteres con las categorías (bits) + 4 con la semilla.
// Todos los que entran con el mismo código reciben las mismas preguntas.
function makeLobbyCode(catIds) {
  const mask = CATEGORIES.reduce((m, c, i) => (catIds.includes(c.id) ? m | (1 << i) : m), 0);
  const seed = Math.floor(Math.random() * 36 ** 4);
  return (mask.toString(36).padStart(2, '0') + seed.toString(36).padStart(4, '0')).toUpperCase();
}

function parseLobbyCode(code) {
  code = String(code || '').trim().toUpperCase();
  if (!/^[0-9A-Z]{6}$/.test(code)) return null;
  const mask = parseInt(code.slice(0, 2), 36);
  const seed = parseInt(code.slice(2), 36);
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

function buildClassic() {
  return [...CLASSIC_IDS.map((id) => BY_ID[id]), ...CLASSIC_EXTRA].map((q) => prepare(q, seededRandom(hashStr('clasico:' + q.id))));
}

function buildRandom() {
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem('cg_seen') || '[]'); } catch {}
  const seenSet = new Set(seen);
  // Primero preguntas que no has visto recientemente; si no alcanzan, se completan con el resto.
  const fresh = shuffle(QUESTIONS.filter((q) => !seenSet.has(q.id)));
  const old = shuffle(QUESTIONS.filter((q) => seenSet.has(q.id)));
  const picked = fresh.concat(old).slice(0, QUESTION_COUNT);
  try {
    const next = seen.filter((id) => !picked.some((q) => q.id === id)).concat(picked.map((q) => q.id));
    localStorage.setItem('cg_seen', JSON.stringify(next.slice(-(QUESTIONS.length - QUESTION_COUNT))));
  } catch {}
  return picked.map((q) => prepare(q, Math.random));
}

function buildLobby(lobby) {
  const rnd = seededRandom(lobby.seed);
  const pool = QUESTIONS.filter((q) => lobby.cats.includes(q.cat));
  return shuffle(pool, rnd).slice(0, QUESTION_COUNT).map((q) => prepare(q, rnd));
}

const BOARDS = {
  clasico: { label: 'Clásico' },
  aleatorio: { label: 'Aleatorio' },
};

// ---------------- navegación ----------------
function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function route() {
  stopGame();
  app.onclick = null;
  const h = location.hash || '#/';
  const [, page, arg] = h.split('/');
  window.scrollTo(0, 0);
  document.body.classList.toggle('wide', page === 'registro');
  if (page === 'sala' && arg) return renderLobby(arg);
  if (page === 'crear') return renderCreateLobby();
  if (page === 'ranking') return renderRanking(arg ? decodeURIComponent(arg) : 'clasico');
  if (page === 'registro') return renderLog();
  return renderHome();
}

function stopGame() {
  cancelAnimationFrame(raf);
  if (game) game.aborted = true;
  game = null;
  document.body.classList.remove('playing');
}

function requireName() {
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

// ---------------- vistas ----------------
function nameField() {
  return `
    <label class="field">
      <span>Tu nombre</span>
      <input id="name" maxlength="20" autocomplete="nickname" placeholder="Ej. Ana" value="${esc(getName())}">
    </label>`;
}

function bindNameField() {
  const input = document.getElementById('name');
  input?.addEventListener('input', () => setName(input.value.trim()));
}

function renderHome() {
  app.innerHTML = `
    <section class="hero">
      <h1>¿Cuánto sabes?</h1>
      <p class="muted">Preguntas de cultura general · 10 segundos por pregunta · ranking por modo de juego</p>
      ${nameField()}
    </section>

    <section class="modes">
      <button class="mode" data-mode="clasico">
        <span class="mode-icon">16</span>
        <span><strong>Clásico</strong><small>Siempre las mismas 15 preguntas + 1 pregunta extra. ¿Quién consigue la mejor puntuación?</small></span>
      </button>
      <button class="mode" data-mode="aleatorio">
        <span class="mode-icon">??</span>
        <span><strong>Aleatorio</strong><small>15 preguntas distintas en cada partida, de todas las categorías.</small></span>
      </button>
      <a class="mode" href="#/crear">
        <span class="mode-icon">VS</span>
        <span><strong>Crear sala</strong><small>Elige las categorías y comparte el código con tus amigos. Cada sala tiene su propio ranking.</small></span>
      </a>
    </section>

    <form class="card join" id="join">
      <label class="field">
        <span>¿Tienes un código de sala?</span>
        <div class="row">
          <input id="code" maxlength="6" placeholder="Ej. 0FK2J9" autocapitalize="characters" autocomplete="off">
          <button class="btn">Entrar</button>
        </div>
      </label>
    </form>

    <section class="card">
      <h3>Cómo se puntúa</h3>
      <p class="muted">Cada acierto vale <b>100 puntos</b> + un bonus de hasta <b>100</b> según lo rápido que respondas. Si se acaban los 10 segundos, cuenta como fallo. En caso de empate gana quien tardó menos.</p>
    </section>`;

  bindNameField();
  app.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!requireName()) return;
      const mode = b.dataset.mode;
      startGame({ mode, board: mode, label: BOARDS[mode].label, questions: mode === 'clasico' ? buildClassic() : buildRandom() });
    })
  );
  document.getElementById('join').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = document.getElementById('code').value;
    if (!parseLobbyCode(code)) return toast('Código de sala no válido.', 'error');
    go(`#/sala/${code.trim().toUpperCase()}`);
  });
}

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
      await store.saveLobby({ code, name, cats, createdAt: Date.now(), createdBy: getName() || '' });
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

async function fillRanking(el, board, highlight = '') {
  try {
    const rows = await store.getRanking(board, 50);
    if (!rows.length) {
      el.innerHTML = `<p class="muted">Todavía nadie ha jugado. ¡Sé el primero!</p>`;
      return rows;
    }
    el.innerHTML = `
      <table class="table rank">
        <thead><tr><th>#</th><th>Nombre</th><th>Puntos</th><th>Aciertos</th><th>Tiempo</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr class="${nameKey(r.name) === highlight ? 'me' : ''}">
              <td class="pos pos-${i + 1}">${i + 1}</td>
              <td>${esc(r.name)}</td>
              <td><b>${r.score}</b></td>
              <td>${r.correct}/${r.total || QUESTION_COUNT}</td>
              <td>${fmtTime(r.timeMs)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    return rows;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<p class="error-text">No se pudo cargar el ranking.</p>`;
    return [];
  }
}

async function renderRanking(board) {
  app.innerHTML = `
    <a class="back" href="#/">← Volver</a>
    <section class="card">
      <h2>Rankings</h2>
      <div class="tabs" id="tabs">
        ${Object.entries(BOARDS).map(([k, b]) => `<a class="tab ${board === k ? 'active' : ''}" href="#/ranking/${k}">${b.label}</a>`).join('')}
        <select id="lobbySel" class="tab ${board.startsWith('sala_') ? 'active' : ''}">
          <option value="">Salas…</option>
        </select>
      </div>
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

  fillRanking(document.getElementById('rank'), board, nameKey(getName()));
}

// ---------------- partida ----------------
function startGame(cfg) {
  stopGame();
  const name = requireName();
  if (!name) return;
  game = {
    ...cfg,
    name,
    idx: 0,
    score: 0,
    correct: 0,
    totalMs: 0,
    tabSwitches: 0,
    answers: [],
    startedAt: Date.now(),
  };
  document.body.classList.add('playing');
  showQuestion();
}

function showQuestion() {
  const g = game;
  const q = g.questions[g.idx];
  app.innerHTML = `
    <section class="game">
      <div class="game-top">
        <span class="counter">Pregunta <b>${g.idx + 1}</b>/${g.questions.length}</span>
        ${catChip(q.cat)}
        <span class="score">PTS <b>${g.score}</b></span>
      </div>
      <div class="timer"><div class="track"><div class="timer-bar" id="bar"></div></div><span id="secs">10</span></div>
      <h2 class="question">${esc(q.text)}</h2>
      <div class="options">
        ${q.options.map((o, i) => `<button class="option" data-i="${i}"><span class="letter">${'ABCD'[i]}</span>${esc(o)}</button>`).join('')}
      </div>
      <p class="feedback" id="feedback"></p>
      <button class="btn ghost sm quit" id="quit">Abandonar partida</button>
    </section>`;

  app.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => answer(+b.dataset.i)));
  document.getElementById('quit').onclick = () => {
    if (confirm('¿Abandonar la partida? No se guardará la puntuación.')) {
      stopGame();
      route();
    }
  };
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
  const pts = ok ? 100 + Math.round((TIME_LIMIT - elapsed) / 100) : 0;
  g.score += pts;
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
  fb.textContent = ok ? `¡Correcto! +${pts}` : choice === -1 ? '¡Se acabó el tiempo!' : 'Incorrecto';
  const score = app.querySelector('.score b');
  if (score) score.textContent = g.score;

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

async function finishGame() {
  const g = game;
  g.locked = true;
  g.done = true;
  document.body.classList.remove('playing');
  app.innerHTML = `<p class="loading">Guardando resultado…</p>`;

  const id = await getIdentity();
  const names = rememberName(g.name);
  const key = nameKey(g.name);
  const timeMs = Math.round(g.totalMs);
  const now = Date.now();

  const total = g.questions.length;
  const scoreEntry = { name: g.name, nameKey: key, score: g.score, correct: g.correct, total, timeMs, ts: now, deviceId: id.deviceId };
  const logEntry = {
    ts: now,
    name: g.name,
    nameKey: key,
    mode: g.mode,
    board: g.board,
    boardLabel: g.label,
    score: g.score,
    correct: g.correct,
    total,
    timeMs,
    durationMs: now - g.startedAt,
    tabSwitches: g.tabSwitches,
    deviceId: id.deviceId,
    fp: id.fp,
    ip: id.ip ?? null,
    ua: id.ua,
    namesOnDevice: names.slice(-20),
  };

  let saved = true;
  try {
    await Promise.all([store.submitScore(g.board, scoreEntry), store.addLog(logEntry)]);
  } catch (e) {
    console.error(e);
    saved = false;
  }
  if (game !== g) return; // el usuario navegó a otra página mientras se guardaba

  const again = () => {
    if (g.mode === 'sala') return go(`#/sala/${g.lobbyCode}`);
    startGame({ mode: g.mode, board: g.board, label: g.label, questions: g.mode === 'clasico' ? buildClassic() : buildRandom() });
  };

  const pct = g.correct / g.questions.length;
  const msg = pct === 1 ? '¡Perfecto!' : pct >= 0.8 ? '¡Excelente!' : pct >= 0.5 ? '¡Bien hecho!' : '¡Sigue practicando!';
  app.innerHTML = `
    <section class="card result">
      <p class="eyebrow">${esc(g.label)}</p>
      <h2>${msg}</h2>
      <div class="big-score">${g.score}<small> / ${g.questions.length * POINTS_PER_QUESTION}</small></div>
      <div class="stats">
        <div><b>${g.correct}/${g.questions.length}</b><span>aciertos</span></div>
        <div><b>${fmtTime(timeMs)}</b><span>tiempo total</span></div>
        <div><b id="pos">…</b><span>posición</span></div>
      </div>
      ${saved ? '' : '<p class="error-text">No se pudo guardar la puntuación (sin conexión).</p>'}
      <div class="row center">
        <button class="btn" id="again">${g.mode === 'sala' ? 'Volver a la sala' : 'Jugar otra vez'}</button>
        <a class="btn ghost" href="#/">Inicio</a>
      </div>
    </section>
    <section class="card">
      <h3>Ranking · ${esc(g.label)}</h3>
      <div id="rank"><p class="loading">Cargando…</p></div>
    </section>`;
  document.getElementById('again').onclick = again;
  const rows = await fillRanking(document.getElementById('rank'), g.board, key);
  const pos = rows.findIndex((r) => nameKey(r.name) === key);
  const posEl = document.getElementById('pos');
  if (posEl) posEl.textContent = pos >= 0 ? `#${pos + 1}` : '—';
}

// ---------------- registro (log) ----------------
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

function renderPinForm() {
  const online = store.kind() === 'supabase';
  app.innerHTML = `
    <a class="back" href="#/">← Volver</a>
    <form class="card narrow" id="pin">
      <h2>Registro</h2>
      <p class="muted">Introduce el PIN de administrador.</p>
      <input id="pinInput" type="password" autocomplete="current-password">
      <button class="btn big" id="pinBtn">Entrar</button>
      ${online ? '' : '<p class="muted small">Modo local: el PIN se cambia en <code>js/config.js</code>.</p>'}
    </form>`;
  const input = document.getElementById('pinInput');
  const btn = document.getElementById('pinBtn');
  input.focus();
  document.getElementById('pin').onsubmit = async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Comprobando…';
    let res;
    try {
      res = await store.checkPin(input.value);
    } catch (err) {
      console.error(err);
      res = 'error';
    }
    btn.disabled = false;
    btn.textContent = 'Entrar';
    if (res === 'ok') {
      setAdminPin(input.value);
      renderLog();
    } else if (res === 'unset') {
      toast('Primero pon tu PIN en Supabase (mira el README).', 'error');
    } else if (res === 'bad') {
      toast('PIN incorrecto.', 'error');
      input.select();
    } else {
      toast('No se pudo conectar con el servidor.', 'error');
    }
  };
}

async function renderLog() {
  const pin = getAdminPin();
  if (!pin) return renderPinForm();

  app.innerHTML = `<p class="loading">Cargando registro…</p>`;
  let logs = [];
  try {
    logs = await store.getLogs(pin, 1000);
  } catch (e) {
    console.error(e);
    if (/PIN/i.test(e.message)) {
      setAdminPin(null);
      return renderPinForm();
    }
    app.innerHTML = `<a class="back" href="#/">← Volver</a><section class="card"><p class="error-text">No se pudo cargar el registro: ${esc(e.message)}</p></section>`;
    return;
  }

  const byDevice = groupSuspicious(logs, 'deviceId');
  const byFp = groupSuspicious(logs, 'fp');
  const byIp = groupSuspicious(logs, 'ip');
  const suspectDevices = new Set([...byDevice, ...byFp].map((g) => g.key));
  const uniq = (f) => new Set(logs.map((l) => l[f]).filter(Boolean)).size;

  const groupHtml = (title, list, field, hint) => `
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
    <a class="back" href="#/">← Volver</a>
    <section class="card">
      <h2>Registro de partidas</h2>
      <div class="stats">
        <div><b>${logs.length}</b><span>partidas</span></div>
        <div><b>${uniq('nameKey')}</b><span>nombres</span></div>
        <div><b>${uniq('deviceId')}</b><span>dispositivos</span></div>
      </div>
      <p class="muted small">Modo de almacenamiento: <b>${store.kind() === 'supabase' ? 'en línea (Supabase)' : 'local (solo este navegador)'}</b></p>
    </section>

    <section class="card">
      <h3>Posibles cuentas múltiples</h3>
      <p class="muted small">Se marcan los dispositivos, huellas o IPs desde los que se jugó con ${CONFIG.SUSPICIOUS_NAMES} o más nombres distintos.</p>
      ${groupHtml('Por dispositivo', byDevice, 'deviceId', '(identificador guardado en el navegador)')}
      ${groupHtml('Por huella del navegador', byFp, 'fp', '(detecta incógnito o datos borrados)')}
      ${groupHtml('Por IP', byIp, 'ip', '(puede ser la misma red wifi/casa)')}
    </section>

    <section class="card">
      <div class="row between">
        <h3>Todas las partidas</h3>
        <div class="row small-gap">
          <button class="btn ghost sm" id="csv">Descargar CSV</button>
          <button class="btn ghost sm danger" id="clear">Borrar todo</button>
          <button class="btn ghost sm" id="logout">Salir</button>
        </div>
      </div>
      <input id="filter" placeholder="Filtrar por nombre, modo, dispositivo o IP…">
      <div class="table-wrap">
        <table class="table log">
          <thead><tr><th>Fecha</th><th>Nombre</th><th>Modo</th><th>Puntos</th><th>Aciertos</th><th>Tiempo</th><th title="Veces que salió de la pestaña durante la partida">Pestaña</th><th>Dispositivo</th><th>Huella</th><th>IP</th><th>Navegador</th></tr></thead>
          <tbody id="logBody"></tbody>
        </table>
      </div>
    </section>`;

  const body = document.getElementById('logBody');
  const filter = document.getElementById('filter');
  const draw = () => {
    const f = filter.value.trim().toLowerCase();
    const rows = f
      ? logs.filter((l) => [l.name, l.boardLabel, l.mode, l.deviceId, l.fp, l.ip].some((v) => String(v ?? '').toLowerCase().includes(f)))
      : logs;
    body.innerHTML = rows.slice(0, 500).map((l) => `
      <tr class="${suspectDevices.has(l.deviceId) || suspectDevices.has(l.fp) ? 'suspect' : ''}">
        <td>${fmtDate(l.ts)}</td>
        <td><b>${esc(l.name)}</b></td>
        <td>${esc(l.boardLabel || l.mode)}</td>
        <td>${l.score}</td>
        <td>${l.correct}/${l.total || QUESTION_COUNT}</td>
        <td>${fmtTime(l.timeMs)}</td>
        <td class="${l.tabSwitches ? 'warn-text' : ''}">${l.tabSwitches ?? 0}</td>
        <td><button class="link mono" data-filter="${esc(l.deviceId)}">${esc(String(l.deviceId).slice(0, 8))}</button></td>
        <td><button class="link mono" data-filter="${esc(l.fp)}">${esc(String(l.fp).slice(0, 8))}</button></td>
        <td>${l.ip ? `<button class="link mono" data-filter="${esc(l.ip)}">${esc(l.ip)}</button>` : '—'}</td>
        <td class="small">${esc(l.ua || '')}</td>
      </tr>`).join('') || `<tr><td colspan="11" class="muted">Sin partidas.</td></tr>`;
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

  document.getElementById('logout').onclick = () => {
    setAdminPin(null);
    go('#/');
  };
  document.getElementById('clear').onclick = async () => {
    const where = store.kind() === 'supabase' ? 'de TODOS los jugadores' : 'de este navegador';
    if (!confirm(`¿Borrar todo el registro ${where}? No se puede deshacer.`)) return;
    try {
      await store.clearLogs(pin);
      toast('Registro borrado.');
    } catch (e) {
      console.error(e);
      toast('No se pudo borrar el registro.', 'error');
    }
    renderLog();
  };
  document.getElementById('csv').onclick = () => {
    const cols = ['ts', 'name', 'boardLabel', 'score', 'correct', 'total', 'timeMs', 'tabSwitches', 'deviceId', 'fp', 'ip', 'ua'];
    const csv = [cols.join(',')]
      .concat(logs.map((l) => cols.map((c) => `"${String(c === 'ts' ? new Date(l.ts).toISOString() : l[c] ?? '').replace(/"/g, '""')}"`).join(',')))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `registro-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
}

// ---------------- inicio ----------------
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
  // Compatibilidad con enlaces tipo ?sala=CODIGO
  const params = new URLSearchParams(location.search);
  const code = params.get('sala') || params.get('lobby');
  if (code && !location.hash) location.hash = `#/sala/${code.toUpperCase()}`;
  window.addEventListener('hashchange', route);
  // Las partidas no cambian la URL: si se pulsa un enlace a la página actual, se vuelve a pintar igualmente.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (a && a.getAttribute('href') === (location.hash || '#/')) {
      e.preventDefault();
      if (game && !game.done && !confirm('¿Abandonar la partida? No se guardará la puntuación.')) return;
      route();
    }
  });
  route();
}

boot();
