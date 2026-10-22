// Draft Worlds online: salas con código y sala oficial semanal (Supabase).
// El servidor da las opciones de cada ronda, valida cada elección y guarda la semilla del torneo;
// todos los navegadores calculan con esa semilla la misma simulación y la ven al mismo ritmo.
import * as E from './draft-engine.js';

const LEVEL_NAMES = { facil: 'Fácil', medio: 'Media', imposible: 'Imposible' };
const POLL_MS = 2000;

// Token secreto de cada sala: identifica tu plaza sin necesidad de cuenta.
const tokenKey = (code) => `dw_tok_${code}`;
const getToken = (code) => { try { return localStorage.getItem(tokenKey(code)); } catch { return null; } };
const setToken = (code, t) => { try { localStorage.setItem(tokenKey(code), t); } catch {} };
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
function tokenFor(code) {
  let t = getToken(code);
  if (!t) { t = newToken(); setToken(code, t); }
  return t;
}

// Participantes del torneo: los humanos por orden de plaza y luego los bots.
export function participantsOf(st) {
  const list = st.seats.map((s) => ({ id: `s${s.seat}`, seat: s.seat, name: s.name, roster: s.roster || {} }));
  for (let i = 1; list.length < st.size; i++) list.push({ id: `bot${i}`, name: `Bot ${i}`, bot: true, roster: E.botDraft(`${st.seed}:${i}`, st.level) });
  return list;
}
export const resultOf = (st) => E.simulateTournament(participantsOf(st), st.seed, { rules: E.rulesFor(st.simStartedAt) });
// Plaza del campeón (0 si gana un bot).
export const championSeat = (result) => result.champion.seat || 0;

export function createDraftOnline(ctx, ui) {
  const { app, esc, toast, go, store } = ctx;
  const errMsg = (e) => e?.message || String(e);
  const validName = (n) => /^[\p{L}\p{N} _.\-]{2,20}$/u.test(n.trim()) && /[\p{L}\p{N}]/u.test(n);

  function nameField() {
    if (ctx.profile?.()) return `<p class="muted small">Juegas como <b>${esc(ctx.profile().displayName)}</b>.</p>`;
    return `<label class="field"><span>Tu nombre</span><input id="dwName" maxlength="20" value="${esc(ctx.playerName?.() || '')}" autocomplete="nickname"></label>`;
  }
  function readName() {
    if (ctx.profile?.()) return ctx.profile().displayName;
    const n = (document.getElementById('dwName')?.value || '').trim();
    if (!validName(n)) { toast('Escribe un nombre de 2 a 20 letras o números.', 'error'); return null; }
    ctx.setName?.(n);
    return n;
  }

  // ---------- crear sala ----------
  function renderCreate() {
    ui.page(`<div class="room">${ui.head('Draft Worlds', 'Crear sala')}
      <section class="card narrow">
        <label class="field"><span>Nombre de la sala</span><input id="dwRoom" maxlength="40" placeholder="Opcional"></label>
        ${ui.sizeAndLevel('dwc')}
        ${nameField()}
        <p class="muted small">Comparte el código con tus amigos. Cuando todos pulsen "Listo", empiezas tú. Las plazas que falten se llenan con bots.</p>
        <button class="btn big" id="dwCreate">Crear sala</button>
      </section></div>`, { phase: 'draft', chip: 'Sala con amigos' });
    document.getElementById('dwCreate').onclick = async (e) => {
      const player = readName();
      if (!player) return;
      e.target.disabled = true;
      const token = newToken();
      try {
        const code = await store.draftCreate(document.getElementById('dwRoom').value.trim(), +document.getElementById('dwcSize').value,
          document.getElementById('dwcLevel').value, token, player);
        setToken(code, token);
        go(`#/draft/sala/${code}`);
      } catch (err) {
        toast(errMsg(err), 'error');
        e.target.disabled = false;
      }
    };
  }

  // ---------- sala oficial ----------
  async function renderOfficial() {
    ui.page('<div class="room"><p class="loading">Buscando la sala oficial…</p></div>', { phase: 'draft' });
    try {
      const code = await store.draftOfficial();
      if (!code) {
        ui.page('<div class="room"><section class="card"><h2>Sala oficial</h2><p class="muted">La primera sala oficial se abre con la primera semana del modo semanal.</p></section></div>', { phase: 'draft' });
        return;
      }
      location.replace(`#/draft/sala/${code}`);
    } catch (err) {
      ui.page(`<div class="room"><section class="card"><h2>Sala oficial</h2><p class="error">${esc(errMsg(err))}</p></section></div>`, { phase: 'draft' });
    }
  }

  // ---------- sala ----------
  function renderRoom(code) {
    code = code.toUpperCase();
    let st = null;
    let view = '';
    let clock = 0; // hora del servidor - hora local
    let busy = false;
    let awarded = false;
    const token = () => getToken(code);
    const hash = location.hash;
    const here = () => location.hash === hash; // si ya te fuiste de la sala, no se dibuja nada
    const serverToLocal = (ms) => ms - clock;
    const mySeat = () => st?.me?.seat;
    const myId = () => (mySeat() ? `s${mySeat()}` : null);

    ui.page('<div class="room"><p class="loading">Cargando sala…</p></div>', { phase: 'draft' });

    async function refresh() {
      if (busy || !here()) return;
      busy = true;
      try {
        const s = await store.draftState(code, token());
        if (s && st && s.serverNow < st.serverNow) return; // llegó tarde: ya hay un estado más nuevo
        if (s) clock = s.serverNow - Date.now();
        st = s;
        render();
      } catch (err) {
        if (!st) ui.page(`<div class="room"><section class="card"><p class="error">${esc(errMsg(err))}</p></section></div>`, { phase: 'draft' });
      } finally {
        busy = false;
      }
    }

    // Cambia de pantalla solo cuando cambia la fase; si no, actualiza las partes vivas.
    function render() {
      if (!here()) return;
      if (!st) {
        view = 'gone';
        ui.page(`<div class="room"><section class="card"><h2>Sala no encontrada</h2><p class="muted">No hay ninguna sala de draft con el código «${esc(code)}», o quien la creó la cerró.</p></section></div>`, { phase: 'draft' });
        return;
      }
      const v = st.status === 'simulating' ? 'sim'
        : st.status === 'waiting' ? (st.me ? 'lobby' : 'join')
        : st.me && !st.me.done ? 'draft'
        : st.official && !st.me ? 'join' : 'wait';
      if (v !== view) {
        view = v;
        if (v === 'sim') return showSim();
        ui.page('<div class="room"><div id="dwHead"></div><div id="dwMain"></div><div id="dwSeats"></div></div>', { phase: 'draft', chip: st.official ? 'Sala oficial' : `Sala ${st.code}` });
        if (v === 'draft') showDraft();
      }
      if (v === 'sim') return;
      document.getElementById('dwHead').innerHTML = header();
      document.getElementById('dwSeats').innerHTML = seatsCard();
      if (v === 'lobby') drawLobby();
      else if (v === 'join') drawJoin();
      else if (v === 'wait') drawWait();
      bindHead();
    }

    const humans = () => st.seats.length;
    function header() {
      const left = st.countdownEndsAt ? Math.max(0, Math.ceil((serverToLocal(st.countdownEndsAt) - Date.now()) / 1000)) : null;
      const info = st.official
        ? `Semana oficial · Octavos · Bots en dificultad ${LEVEL_NAMES[st.level] || st.level} · Solo cuentas verificadas`
        : `${st.size === 16 ? 'Octavos (16 equipos)' : st.size === 8 ? 'Cuartos (8 equipos)' : 'Solo la final (2 equipos)'} · Bots: ${LEVEL_NAMES[st.level] || st.level}`;
      const adminStart = st.official && st.status === 'drafting' && ctx.isAdmin?.()
        ? `<button class="btn" id="dwOffStart" ${humans() ? '' : 'disabled'}>Iniciar la sala oficial</button>` : '';
      return `
        <section class="card">
          <p class="eyebrow">${st.official ? 'Sala oficial' : 'Sala de draft'}</p>
          <h2>${esc(st.name)}</h2>
          ${st.official ? '' : `<div class="code-box"><span class="code">${st.code}</span><button class="btn ghost sm" id="dwShare">Compartir enlace</button></div>`}
          <p class="muted small">${info}</p>
          ${st.status === 'drafting' && !st.official ? '<p class="muted small">Si alguien pasa 3 minutos sin elegir, su equipo se completa al azar.</p>' : ''}
          ${left != null ? `<p class="dw-countdown">Falta un jugador por terminar: <b>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b>. Si no termina, su equipo se completa al azar.</p>` : ''}
          ${adminStart}
        </section>`;
    }
    function bindHead() {
      document.getElementById('dwShare')?.addEventListener('click', async () => {
        const link = `${location.origin}${location.pathname}#/draft/sala/${st.code}`;
        if (navigator.share) {
          try { await navigator.share({ title: st.name, text: `Únete a mi sala de Draft Worlds. Código ${st.code}`, url: link }); return; } catch {}
        }
        try { await navigator.clipboard.writeText(link); toast('Enlace copiado'); } catch { prompt('Copia el enlace:', link); }
      });
      document.getElementById('dwOffStart')?.addEventListener('click', async (e) => {
        const pending = st.seats.filter((s) => !s.done).length;
        if (!confirm(`¿Iniciar la sala oficial con ${humans()} jugador(es)?${pending ? ` ${pending} no han terminado y su equipo se completará al azar.` : ''} El resto serán bots.`)) return;
        e.target.disabled = true;
        try { await store.draftStart(code, token()); } catch (err) { toast(errMsg(err), 'error'); }
        refresh();
      });
    }

    function seatsCard() {
      const n = humans();
      const badge = (s) => (s.verified ? ctx.badge?.() || '' : '');
      const status = (s) => (st.status === 'waiting' ? (s.ready ? '<span class="dw-ok">Listo</span>' : '<span class="muted">Esperando</span>')
        : s.done ? '<span class="dw-ok">Equipo listo</span>' : `<span class="muted">Ronda ${Math.min(5, s.picks + 1)} / 5</span>`);
      return `
        <section class="card">
          <h3>Jugadores <small class="muted">${n} / ${st.size}${n < st.size ? ` · ${st.size - n} bots` : ''}</small></h3>
          <ul class="dw-seats">${st.seats.map((s) => `<li class="${s.seat === mySeat() ? 'me' : ''}"><span>${esc(s.name)}${badge(s)}${s.seat === mySeat() ? ' <small>(tú)</small>' : ''}</span>${status(s)}</li>`).join('')}</ul>
        </section>`;
    }

    function drawJoin() {
      const el = document.getElementById('dwMain');
      if (el.dataset.drawn) return; // no borrar lo que se está escribiendo
      el.dataset.drawn = '1';
      const full = humans() >= st.size;
      let body;
      if (st.official) {
        const p = ctx.profile?.();
        body = !p ? '<p class="muted">Para jugar la sala oficial necesitas una cuenta verificada. <a href="#/cuenta">Entrar o crear cuenta</a>. Cuando empiece, podrás mirar el Worlds desde aquí.</p>'
          : !p.verified && ctx.isAdmin?.() ? '<p class="muted">Para jugar tú también, ponte la insignia de verificado en el <a href="#/admin">panel de administrador</a>. Para empezar la sala, usa el botón de arriba.</p>'
          : !p.verified ? '<p class="muted">La sala oficial es solo para cuentas verificadas: pídele al administrador que verifique la tuya. Cuando empiece, podrás mirar el Worlds desde aquí.</p>'
          : full ? '<p class="muted">Ya entraron los 16 jugadores de esta semana. Cuando empiece, podrás mirar el Worlds desde aquí.</p>'
          : `<p class="muted">Entran los 16 primeros. Al entrar armas tu equipo y esperas a que el administrador inicie la sala.</p><button class="btn big" id="dwJoinGo">Entrar y armar mi equipo</button>`;
      } else {
        body = full ? '<p class="muted">La sala está llena.</p>'
          : `${nameField()}<button class="btn big" id="dwJoinGo">Entrar a la sala</button>`;
      }
      el.innerHTML = `<section class="card narrow">${body}</section>`;
      document.getElementById('dwJoinGo')?.addEventListener('click', async (e) => {
        const player = readName();
        if (!player) return;
        e.target.disabled = true;
        try {
          await store.draftJoin(code, tokenFor(code), player);
          await refresh();
        } catch (err) {
          toast(errMsg(err), 'error');
          e.target.disabled = false;
        }
      });
    }

    function drawLobby() {
      const me = st.me;
      const all = st.seats.every((s) => s.ready);
      document.getElementById('dwMain').innerHTML = `
        <section class="card narrow dw-center">
          <p class="muted">${st.host ? (all ? 'Todos están listos. Puedes empezar.' : 'Cuando todos pulsen "Listo", podrás empezar.') : 'Pulsa "Listo" y espera a que empiece quien creó la sala.'}</p>
          <div class="row center">
            <button class="btn ${me.ready ? 'ghost' : ''}" id="dwReady">${me.ready ? 'No estoy listo' : 'Listo'}</button>
            ${st.host ? `<button class="btn" id="dwStart" ${all ? '' : 'disabled'}>Empezar draft</button>` : ''}
            <button class="btn ghost" id="dwLeave">${st.host ? 'Cerrar sala' : 'Salir'}</button>
          </div>
        </section>`;
      const act = (id, fn) => document.getElementById(id)?.addEventListener('click', async (e) => {
        e.target.disabled = true;
        try { await fn(); } catch (err) { toast(errMsg(err), 'error'); }
        refresh();
      });
      act('dwReady', () => store.draftReady(code, token(), !me.ready));
      act('dwStart', () => store.draftStart(code, token()));
      act('dwLeave', async () => {
        if (st.host && !confirm('¿Cerrar la sala para todos?')) return;
        await store.draftLeave(code, token());
        go('#/draft');
      });
    }

    function drawWait() {
      const el = document.getElementById('dwMain');
      const roster = st.me?.roster;
      const msg = !st.me ? 'La sala ya empezó. Cuando todos terminen su equipo, podrás mirar el Worlds desde aquí.'
        : st.official ? 'Tu equipo está listo. Espera a que el administrador inicie la sala oficial.'
        : 'Tu equipo está listo. Esperando a que terminen los demás.';
      const key = `${msg}|${JSON.stringify(roster || {})}`;
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      el.innerHTML = `
        <section class="card dw-center"><p>${msg}</p></section>
        ${roster ? `<section class="card"><h3>Tu equipo</h3>${ui.teamSummary(roster)}</section>` : ''}`;
    }

    function showDraft() {
      let me = st.me;
      const api = {
        title: st.official ? 'Sala oficial' : st.name,
        roster: me.roster,
        rerollsLeft: Math.max(0, E.REROLLS - me.rerolls),
        options: async () => me.options,
        reroll: async () => {
          await store.draftReroll(code, token());
          me = (await store.draftState(code, token())).me;
          return me.options;
        },
        pick: async (key) => {
          await store.draftPick(code, token(), key);
          const s = await store.draftState(code, token());
          st = s;
          me = s.me;
          return me.roster;
        },
        done: () => { view = ''; render(); },
      };
      ui.draftBoard(document.getElementById('dwMain'), api);
    }

    function showSim() {
      const result = resultOf(st);
      const me = myId();
      ui.page('<div id="dwPlay"></div>', { phase: 'mundial', chip: st.official ? 'Sala oficial' : `Sala ${st.code}` });
      const admin = st.official && ctx.isAdmin?.();
      const award = async () => {
        if (!admin || awarded || st.championSeat != null) return;
        awarded = true;
        try {
          await store.draftAward(code, championSeat(result));
          toast(championSeat(result) ? `Copa entregada a ${result.champion.name}` : 'Ganó un bot: esta semana no hay copa');
        } catch (err) { toast(errMsg(err), 'error'); }
      };
      ui.playTournament(document.getElementById('dwPlay'), result, me, {
        startAt: serverToLocal(st.simStartedAt),
        allowSkip: true,
        rerollsUsed: st.me?.rerolls ?? 0,
        actions: `<div class="res-actions"><a class="btn-ghost" href="#/draft"><span>Menú del draft</span></a>${st.official ? '<a class="btn-lock" href="#/ranking/copas"><span>Ranking de copas</span></a>' : '<a class="btn-lock" href="#/draft/crear"><span>Crear otra sala</span></a>'}</div>`,
        onEnd: award,
      });
    }

    refresh();
    ui.every(() => { if (view !== 'sim' && view !== 'gone') refresh(); }, POLL_MS);
    // la cuenta atrás se mueve cada segundo aunque no llegue un estado nuevo
    ui.every(() => {
      if (st?.countdownEndsAt && (view === 'wait' || view === 'draft')) document.getElementById('dwHead') && (document.getElementById('dwHead').innerHTML = header(), bindHead());
    }, 1000);
  }

  // Devuelve true si la ruta es suya.
  function route(arg, arg2) {
    if (!['crear', 'sala', 'oficial'].includes(arg)) return false;
    if (!store.online()) {
      ui.page('<div class="room"><section class="card"><h2>Sin conexión</h2><p class="muted">Las salas online necesitan conexión con el servidor. Puedes jugar contra bots.</p></section></div>', { phase: 'draft' });
      return true;
    }
    if (arg === 'crear') renderCreate();
    else if (arg === 'oficial') renderOfficial();
    else if (arg2 && /^[0-9A-Za-z]{5,6}$/.test(arg2)) renderRoom(arg2);
    else return false;
    return true;
  }

  return { route };
}
