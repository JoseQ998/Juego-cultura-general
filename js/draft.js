// Interfaz del modo Draft Worlds: menú, draft, partidas en vivo, cuadro y tarjeta final.
// Sirve igual para jugar en solitario contra bots que para las salas online.
import * as E from './draft-engine.js';

// Imágenes de Leaguepedia. Sin "referrer": su servidor rechaza las imágenes pedidas desde otras webs.
const FILE = (f, w) => `https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/${f.split('/').map(encodeURIComponent).join('/')}/revision/latest/scale-to-width-down/${w}`;
const PLACE = { 1: 'Campeón', 2: 'Finalista', 3: 'Semifinal', 5: 'Cuartos' };
const GAME_STEP = 1700; // ms entre mensajes de una partida

// Posiciones en el minimapa (%): tu equipo abajo a la izquierda, el rival arriba a la derecha.
const SPOTS = {
  home: { top: [11, 24], jungle: [27, 46], mid: [47, 55], bot: [78, 89], support: [64, 82] },
  away: { top: [38, 10], jungle: [70, 30], mid: [56, 42], bot: [90, 74], support: [84, 56] },
};

// Iconos de posición (SVG propios, sin emojis)
const ROLE_ICON = {
  top: '<path d="M3 3h14v4H7v10H3z"/><path d="M11 11h10v10H11z" opacity=".35"/>',
  jungle: '<path d="M12 2c3 4 7 6 7 11a7 7 0 0 1-14 0c0-5 4-7 7-11z"/>',
  mid: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M3 3h6v3H6v3H3zM21 21h-6v-3h3v-3h3z" opacity=".35"/>',
  bot: '<path d="M21 21H7v-4h10V7h4z"/><path d="M3 3h10v10H3z" opacity=".35"/>',
  support: '<path d="M12 2l9 4v6c0 5-4 9-9 10C7 21 3 17 3 12V6z"/>',
};
export const roleIcon = (r) => `<svg class="dw-role" viewBox="0 0 24 24" aria-label="${E.ROLE_NAMES[r]}"><title>${E.ROLE_NAMES[r]}</title>${ROLE_ICON[r]}</svg>`;

const MINIMAP = `<svg class="dw-map-bg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <rect x="1" y="1" width="98" height="98" rx="6" class="ground"/>
  <path d="M14 14 L86 86" class="river"/>
  <path d="M8 92 V8 H92" class="lane"/><path d="M8 92 H92 V8" class="lane"/><path d="M10 90 L90 10" class="lane"/>
  <path d="M24 30 q6 -6 12 0 t12 0 M30 64 q6 -6 12 0 M58 36 q6 -6 12 0 M52 70 q6 -6 12 0 t12 0" class="jungle"/>
  <circle cx="8" cy="92" r="8" class="base home"/><circle cx="92" cy="8" r="8" class="base away"/>
</svg>`;

function hue(s) { return E.hashStr(String(s)) % 360; }

export function createDraft(ctx) {
  const { app, esc, toast, go } = ctx;
  let timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; };

  function stop() {
    timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    timers = [];
    ctx.onStop?.();
  }

  // ---------- piezas visuales ----------
  function avatar(p, cls = '') {
    const ini = esc(p.name.slice(0, 2).toUpperCase());
    const img = p.photo ? `<img src="${FILE(p.photo, 120)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
    return `<span class="dw-av ${cls}" style="--h:${hue(p.org || p.team)}"><b>${ini}</b>${img}</span>`;
  }
  function logo(team, cls = '') {
    const img = team.logo ? `<img src="${FILE(team.logo, 96)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
    return `<span class="dw-logo ${cls}" style="--h:${hue(team.org)}"><b>${esc(team.tag)}</b>${img}</span>`;
  }
  const traitTag = (p) => (p.trait === 'clutch' ? '<span class="dw-trait clutch">CLUTCH</span>' : p.trait === 'choke' ? '<span class="dw-trait choke">PECHO FRÍO</span>' : '');
  const fmt1 = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
  const signed = (n) => (n > 0 ? '+' : '') + fmt1(n);

  function mapView(sides) {
    // sides: [{ players, side: 'home'|'away' }]
    const tokens = sides.flatMap(({ players, side }) => players.filter(Boolean).map((p) => {
      const [x, y] = SPOTS[side][p.role];
      return `<div class="dw-token ${side}" style="left:${x}%;top:${y}%">${avatar(p)}<span class="dw-token-name">${esc(p.name)}</span><span class="dw-token-year">${p.year}</span></div>`;
    }));
    return `<div class="dw-map">${MINIMAP}${tokens.join('')}</div>`;
  }

  function chemistryBox(players) {
    const ps = players.filter(Boolean);
    const v = E.teamValue(ps);
    const ch = E.chemistry(ps);
    return `
      <div class="dw-value">
        <div><span>Media</span><b>${fmt1(v.avg)}</b></div>
        <div><span>Química</span><b class="${ch.total >= 0 ? 'pos' : 'neg'}">${signed(ch.total)}</b></div>
        <div><span>Valor</span><b class="big">${fmt1(v.value)}</b></div>
      </div>
      ${ch.items.length ? `<ul class="dw-chem">${ch.items.map((i) => `<li class="${i.pts >= 0 ? 'pos' : 'neg'}"><b>${signed(i.pts)}</b> ${esc(i.text)}</li>`).join('')}</ul>` : '<p class="muted small">Sin química todavía.</p>'}`;
  }

  function teamOption(id, roster) {
    const t = E.TEAM_BY_ID[id];
    return `
      <button class="dw-team" data-team="${id}">
        <span class="dw-team-head">${logo(t)}<span><strong>${esc(t.name)}</strong><small>${t.year} · ${PLACE[t.place]} · ${esc(t.region)}</small></span></span>
        <span class="dw-team-players">${t.players.map((p) => {
          const full = E.PLAYER_BY_KEY[`${id}:${p.role}`];
          return `<span class="${E.canPick(roster, full) ? '' : 'off'}">${roleIcon(p.role)}${esc(p.name)}</span>`;
        }).join('')}</span>
      </button>`;
  }

  function playerCard(p, roster) {
    const ok = E.canPick(roster, p);
    const why = roster[p.role] ? `Ya tienes ${E.ROLE_NAMES[p.role].toLowerCase()}` : ok ? '' : 'Ya está en tu equipo';
    return `
      <button class="dw-player" data-key="${p.key}" ${ok ? '' : 'disabled'}>
        ${avatar(p, 'lg')}
        <span class="dw-player-info"><strong>${esc(p.name)}</strong><small>${roleIcon(p.role)} ${E.ROLE_NAMES[p.role]}${p.mvp ? ' · MVP de la final' : ''}</small>${traitTag(p)}${why ? `<em>${why}</em>` : ''}</span>
        <span class="dw-rating">${p.rating}</span>
      </button>`;
  }

  // ---------- draft ----------
  // api: { roster, rerollsLeft, options(): Promise<ids>, reroll(): Promise<ids>, pick(key): Promise<roster>, done(roster) , title }
  async function draftBoard(el, api) {
    let roster = api.roster;
    let options = await api.options();
    let chosenTeam = null;
    const draw = () => {
      if (!el.isConnected) return;
      const round = E.ROLES.filter((r) => roster[r]).length + 1;
      const players = E.rosterPlayers(roster);
      const t = chosenTeam && E.TEAM_BY_ID[chosenTeam];
      el.innerHTML = `
        <div class="dw-board">
          <section class="card dw-pickcol">
            <p class="eyebrow">${esc(api.title || 'Draft Worlds')} · Ronda ${round} / 5</p>
            <h2>${t ? 'Elige a tu jugador' : 'Elige un equipo'}</h2>
            ${t ? `
              <div class="dw-team-title">${logo(t, 'lg')}<span><strong>${esc(t.name)}</strong><small>${t.year} · ${PLACE[t.place]}</small></span></div>
              <div class="dw-players">${t.players.map((p) => playerCard(E.PLAYER_BY_KEY[`${t.id}:${p.role}`], roster)).join('')}</div>
              <button class="btn ghost sm" id="dwBack">Volver a los equipos</button>`
            : `
              <div class="dw-teams">${options.map((id) => teamOption(id, roster)).join('')}</div>
              <button class="btn ghost sm" id="dwReroll" ${api.rerollsLeft > 0 ? '' : 'disabled'}>Reroll (${api.rerollsLeft} restantes)</button>`}
          </section>
          <section class="card dw-mapcol">
            ${mapView([{ players, side: 'home' }])}
            ${chemistryBox(players)}
          </section>
        </div>`;
      el.querySelectorAll('[data-team]').forEach((b) => (b.onclick = () => { chosenTeam = b.dataset.team; draw(); }));
      el.querySelector('#dwBack')?.addEventListener('click', () => { chosenTeam = null; draw(); });
      el.querySelector('#dwReroll')?.addEventListener('click', async (e) => {
        e.target.disabled = true;
        try { options = await api.reroll(); api.rerollsLeft--; } catch (err) { toast(err.message, 'error'); }
        draw();
      });
      el.querySelectorAll('[data-key]').forEach((b) => (b.onclick = async () => {
        el.querySelectorAll('button').forEach((x) => (x.disabled = true));
        try {
          roster = await api.pick(b.dataset.key);
          chosenTeam = null;
          if (E.ROLES.every((r) => roster[r])) return api.done(roster);
          options = await api.options();
        } catch (err) { toast(err.message, 'error'); }
        draw();
      }));
    };
    draw();
  }

  // Resumen de un equipo ya armado: minimapa, valor y química.
  function teamSummary(roster) {
    const players = E.rosterPlayers(roster);
    return `<div class="dw-board"><div>${mapView([{ players, side: 'home' }])}</div><div>${chemistryBox(players)}</div></div>`;
  }

  // ---------- torneo: línea de tiempo de escenas ----------
  const label = (p, me) => (p.id === me ? 'Tu equipo' : p.bot ? p.name : `El equipo de ${p.name}`);
  const short = (p, me) => (p.id === me ? 'Tú' : p.name);

  function buildScenes(result, me) {
    const scenes = [];
    let alive = result.entrants.some((x) => x.id === me);
    const add = (type, dur, data) => scenes.push({ type, dur, ...data });
    result.rounds.forEach((round, ri) => {
      const mine = round.matches.find((m) => m.a.id === me || m.b.id === me);
      const watch = alive && mine ? mine : (!alive && round.size === 2 ? round.matches[0] : null);
      if (watch) {
        add('preview', 4000, { ri, m: watch });
        watch.games.forEach((g, gi) => add('game', 1500 + g.events.length * GAME_STEP + 2200, { ri, m: watch, gi }));
        add('series', 3000, { ri, m: watch });
      }
      if (round.size > 2) add('bracket', 4500, { ri });
      if (alive && mine && (mine.winner === 'a' ? mine.a.id : mine.b.id) !== me) {
        alive = false;
        add('out', 6000, { ri });
      }
    });
    add('end', Infinity, {});
    return scenes;
  }

  function bracketView(result, upto, me) {
    return `<div class="dw-bracket">${result.rounds.map((round, ri) => `
      <div class="dw-round"><h4>${round.name} <small>Bo${round.bestOf}</small></h4>
        ${round.matches.map((m) => {
          const shown = ri <= upto;
          const row = (p, s) => `<div class="dw-bteam ${shown && m.winner === s ? 'win' : ''} ${p.id === me ? 'me' : ''}"><span>${esc(short(p, me))}</span><b>${shown ? m.score[s === 'a' ? 0 : 1] : ''}</b></div>`;
          return `<div class="dw-bmatch">${row(m.a, 'a')}${row(m.b, 'b')}</div>`;
        }).join('')}
      </div>`).join('')}
      <div class="dw-round"><h4>Campeón</h4><div class="dw-bmatch champ">${upto >= result.rounds.length - 1 ? esc(short(result.champion, me)) : '?'}</div></div>
    </div>`;
  }

  function sideOf(m, me) { return m.a.id === me ? 'a' : m.b.id === me ? 'b' : null; }

  function vsView(m, me) {
    const card = (p) => `
      <div class="dw-vsteam ${p.id === me ? 'me' : ''}">
        <h4>${esc(label(p, me))}</h4>
        <div class="dw-vsplayers">${p.players.map((x) => `<div class="dw-vsp">${avatar(x)}<b>${esc(x.name)}</b><small>${x.year} · ${esc(x.tag)}</small><span>${x.rating}</span>${traitTag(x)}</div>`).join('')}</div>
        <p class="dw-vsval">Valor <b>${fmt1(p.value)}</b> <small>(media ${fmt1(p.avg)}, química ${signed(p.chem)})</small></p>
      </div>`;
    return `${card(m.a)}<div class="dw-vs">VS</div>${card(m.b)}`;
  }

  function gameView(round, m, gi, t, me) {
    const mySide = sideOf(m, me) || 'a';
    const home = mySide === 'a' ? m.a : m.b, away = mySide === 'a' ? m.b : m.a;
    const g = m.games[gi];
    const before = m.games.slice(0, gi);
    const shownEvents = Math.min(g.events.length, Math.max(0, Math.floor((t - 1200) / GAME_STEP) + 1));
    const finished = shownEvents >= g.events.length && t > 1500 + g.events.length * GAME_STEP;
    const winsOf = (s, list) => list.filter((x) => x.winner === s).length;
    const doneList = finished ? m.games.slice(0, gi + 1) : before;
    const score = [winsOf(mySide, doneList), winsOf(mySide === 'a' ? 'b' : 'a', doneList)];
    const boxes = Array.from({ length: m.bestOf }, (_, i) => {
      const gg = m.games[i];
      const done = i < gi || (i === gi && finished);
      const cls = !done ? (i === gi ? 'live' : '') : gg.winner === mySide ? 'w' : 'l';
      return `<span class="dw-box ${cls}"><small>M${i + 1}</small>${done ? (gg.winner === mySide ? '✓' : '✗') : i === gi ? '…' : '-'}</span>`;
    }).join('');
    const teamName = (side) => label(side === 'a' ? m.a : m.b, me);
    const events = g.events.slice(0, shownEvents).map((e) => {
      const good = e.side === mySide;
      const txt = e.text.replace('{eq}', teamName(e.side)).replace('{rival}', teamName(e.side === 'a' ? 'b' : 'a'));
      const neutral = !sideOf(m, me);
      return `<li class="dw-ev ${neutral ? (e.side === 'a' ? 'na' : 'nb') : good ? 'good' : 'bad'} ${e.kind}">${esc(txt)}</li>`;
    }).join('');
    return `
      <div class="dw-live">
        <div class="dw-live-map">${mapView([{ players: home.players, side: 'home' }, { players: away.players, side: 'away' }])}
          <p class="dw-live-teams"><span class="home">${esc(label(home, me))}</span> vs <span class="away">${esc(label(away, me))}</span></p></div>
        <div class="dw-live-side">
          <div class="dw-series"><span>${round.name} · Bo${m.bestOf}</span><b>${score[0]} - ${score[1]}</b></div>
          <div class="dw-boxes">${boxes}</div>
          <ul class="dw-events">${events}</ul>
          ${finished ? `<p class="dw-gameend ${g.winner === mySide ? 'win' : 'lose'}">${sideOf(m, me) ? (g.winner === mySide ? 'Partida ganada' : 'Partida perdida') : `Gana ${esc(teamName(g.winner))}`}</p>` : `<p class="muted small">Partida ${gi + 1} en juego…</p>`}
        </div>
      </div>`;
  }

  function finalCard(result, me, extra = {}) {
    const j = E.journey(result, me);
    const p = result.entrants.find((x) => x.id === me);
    if (!p) return `<section class="card"><h2>Campeón: ${esc(label(result.champion, me))}</h2>${bracketView(result, result.rounds.length, me)}</section>`;
    const champion = result.champion.id === me;
    return `
      <section class="card dw-final">
        <p class="eyebrow">${champion ? '¡Campeón del mundo!' : 'Tu equipo llegó a…'}</p>
        <h2 class="dw-reached">${champion ? 'CAMPEÓN' : esc((j.reached || '').toUpperCase())}</h2>
        <div class="dw-steps">
          <span class="dw-step"><b>${extra.rerollsUsed ?? 0}</b><small>rerolls usados</small></span>
          ${j.steps.map((s) => `<span class="dw-step ${s.won ? 'w' : 'l'}"><b>${s.won ? '✓' : '✗'}</b><small>${s.round} ${s.score}</small></span>`).join('')}
        </div>
        <div class="dw-final-list">${p.players.map((x) => `
          <div class="dw-final-row">${roleIcon(x.role)}${avatar(x)}<span><strong>${esc(x.name)}</strong><small>${x.year} · ${esc(x.team)}</small></span><b>${x.rating}</b></div>`).join('')}</div>
        <p class="dw-vsval">Valor del equipo <b>${fmt1(p.value)}</b> <small>(media ${fmt1(p.avg)}, química ${signed(p.chem)})</small></p>
        <p class="muted">Campeón del Worlds: <b>${esc(label(result.champion, me))}</b></p>
        ${extra.actions || ''}
      </section>
      <section class="card"><h3>Cuadro</h3>${bracketView(result, result.rounds.length, me)}</section>`;
  }

  // Reproduce el torneo. startAt (ms) permite que todos vayan al mismo ritmo en salas online.
  function playTournament(el, result, me, opts = {}) {
    const scenes = buildScenes(result, me);
    const startAt = opts.startAt || Date.now();
    let offset = 0; // saltos locales
    let lastKey = '';
    const tick = () => {
      if (!el.isConnected) return;
      let t = Date.now() - startAt + offset;
      let i = 0;
      while (i < scenes.length - 1 && t >= scenes[i].dur) { t -= scenes[i].dur; i++; }
      const s = scenes[i];
      const round = result.rounds[s.ri];
      const key = `${i}:${s.type === 'game' ? Math.floor(t / 400) : ''}`;
      if (key === lastKey) return;
      lastKey = key;
      let html = '';
      if (s.type === 'preview') html = `<section class="card"><p class="eyebrow">${round.name} · Bo${round.bestOf}</p><div class="dw-vswrap">${vsView(s.m, me)}</div></section>`;
      else if (s.type === 'game') html = `<section class="card">${gameView(round, s.m, s.gi, t, me)}</section>`;
      else if (s.type === 'series') {
        const side = sideOf(s.m, me);
        const won = side ? s.m.winner === side : null;
        const sc = side === 'b' ? [...s.m.score].reverse() : s.m.score;
        html = `<section class="card dw-center"><p class="eyebrow">${round.name}</p><h2>${won == null ? `Gana ${esc(label(s.m.winner === 'a' ? s.m.a : s.m.b, me))}` : won ? '¡Serie ganada!' : 'Serie perdida'}</h2><p class="dw-bigscore">${sc[0]} - ${sc[1]}</p></section>`;
      } else if (s.type === 'bracket') html = `<section class="card"><p class="eyebrow">Resultados de ${round.name.toLowerCase()}</p>${bracketView(result, s.ri, me)}</section>`;
      else if (s.type === 'out') html = `<section class="card dw-center"><p class="eyebrow">Eliminado en ${round.name.toLowerCase()}</p><h2>Tu Worlds termina aquí</h2><p class="muted">Sigues viendo el resto del torneo hasta la final.</p></section>`;
      else {
        clearInterval(timer);
        el.innerHTML = finalCard(result, me, opts);
        opts.onEnd?.();
        el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => opts.onAction?.(b.dataset.act)));
        return;
      }
      el.innerHTML = `${html}<div class="row center dw-skip">${opts.allowSkip ? '<button class="btn ghost sm" id="dwSkip">Saltar</button><button class="btn ghost sm" id="dwEnd">Ir al final</button>' : ''}</div>`;
      el.querySelector('#dwSkip')?.addEventListener('click', () => { offset += Math.max(0, scenes[i].dur - t) + 1; lastKey = ''; tick(); });
      el.querySelector('#dwEnd')?.addEventListener('click', () => { offset += 1e9; lastKey = ''; tick(); });
    };
    const timer = every(tick, 200);
    tick();
  }

  // ---------- menú ----------
  function renderMenu() {
    app.innerHTML = `
      <a class="back" href="#/">← Volver</a>
      <section class="card dw-intro">
        <p class="eyebrow">League of Legends</p>
        <h2>Draft Worlds</h2>
        <p class="muted">Arma tu equipo con jugadores de los Worlds de 2011 a 2025, cada uno en la versión de ese año, y juega un Mundial desde octavos o cuartos. Cada ronda eliges un equipo y uno de sus jugadores; la química entre ellos cuenta.</p>
      </section>
      <div class="modes">
        ${ctx.online?.() ? `
        <a class="mode" href="#/draft/oficial"><span class="mode-icon">CUP</span><span><strong>Sala oficial</strong><small>Una por semana, solo cuentas verificadas. El campeón gana una copa.</small></span></a>
        <a class="mode" href="#/draft/crear"><span class="mode-icon">VS</span><span><strong>Crear sala</strong><small>Juega con tus amigos con un código. Los huecos se llenan con bots.</small></span></a>` : ''}
        <a class="mode" href="#/draft/solo"><span class="mode-icon">BOT</span><span><strong>Contra bots</strong><small>Tú solo contra bots. Elige octavos o cuartos y la dificultad.</small></span></a>
      </div>
      ${ctx.online?.() ? `
      <form class="card join" id="dwJoin">
        <label class="field"><span>¿Tienes un código de sala de draft?</span>
          <div class="row"><input id="dwCode" maxlength="6" placeholder="Ej. K7Q2XM" autocapitalize="characters"><button class="btn">Entrar</button></div>
        </label>
      </form>` : ''}`;
    document.getElementById('dwJoin')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = document.getElementById('dwCode').value.trim().toUpperCase();
      if (!/^[0-9A-Z]{6}$/.test(code)) return toast('El código tiene 6 letras o números.', 'error');
      go(`#/draft/sala/${code}`);
    });
  }

  // ---------- modo solitario ----------
  function sizeAndLevel(prefix) {
    return `
      <label class="field"><span>Empezar desde</span>
        <select id="${prefix}Size"><option value="16">Octavos (16 equipos)</option><option value="8">Cuartos (8 equipos)</option></select></label>
      <label class="field"><span>Dificultad de los bots</span>
        <select id="${prefix}Level"><option value="facil">Fácil (eligen al azar)</option><option value="medio" selected>Media (entre sus 3 mejores opciones)</option><option value="imposible">Imposible (siempre la mejor)</option></select></label>`;
  }

  function renderSoloSetup() {
    app.innerHTML = `
      <a class="back" href="#/draft">← Volver</a>
      <section class="card narrow">
        <p class="eyebrow">Draft Worlds</p><h2>Contra bots</h2>
        ${sizeAndLevel('solo')}
        <p class="muted small">5 rondas: en cada una salen 3 equipos al azar; eliges uno y uno de sus jugadores. Tienes ${E.REROLLS} rerolls.</p>
        <button class="btn big" id="soloGo">Empezar draft</button>
      </section>`;
    document.getElementById('soloGo').onclick = () => {
      const size = +document.getElementById('soloSize').value;
      const level = document.getElementById('soloLevel').value;
      startSolo(size, level);
    };
  }

  function startSolo(size, level) {
    const seed = Math.random().toString(36).slice(2);
    const r = E.rng(`opts:${seed}`);
    let roster = E.emptyRoster();
    let used = 0;
    const api = {
      title: 'Contra bots',
      roster,
      rerollsLeft: E.REROLLS,
      options: async () => E.draftOptions(roster, r),
      reroll: async () => { used++; return E.draftOptions(roster, r); },
      pick: async (key) => { const p = E.PLAYER_BY_KEY[key]; if (!E.canPick(roster, p)) throw new Error('No puedes elegir a ese jugador.'); roster = { ...roster, [p.role]: key }; return roster; },
      done: (final) => {
        const me = 'me';
        const name = ctx.playerName?.() || 'Tú';
        const parts = [{ id: me, name, roster: final }];
        for (let i = 1; i < size; i++) parts.push({ id: `bot${i}`, name: `Bot ${i}`, bot: true, roster: E.botDraft(`${seed}:${i}`, level) });
        const result = E.simulateTournament(parts, seed);
        app.innerHTML = '<div id="dwPlay"></div>';
        playTournament(document.getElementById('dwPlay'), result, me, {
          allowSkip: true,
          rerollsUsed: used,
          actions: '<div class="row center"><button class="btn" data-act="again">Otro draft</button><a class="btn ghost" href="#/draft">Menú del draft</a></div>',
          onAction: (a) => a === 'again' && renderSoloSetup(),
        });
      },
    };
    app.innerHTML = '<div id="dwDraft"></div>';
    draftBoard(document.getElementById('dwDraft'), api);
  }

  function route(arg) {
    document.body.classList.add('wide');
    if (arg === 'solo') return renderSoloSetup();
    if (ctx.routeOnline && ctx.routeOnline(arg, ...[...arguments].slice(1))) return;
    return renderMenu();
  }

  return { route, stop, draftBoard, playTournament, sizeAndLevel, avatar, logo, later, every, finalCard, teamSummary };
}
