// Interfaz del modo Draft Worlds (estilo del cliente de LoL): menú, draft, partidas en vivo, cuadro y
// resultado final. Sirve igual para jugar en solitario contra bots que para las salas online.
// Nunca se muestra nada que diga si un jugador es mejor o peor que otro (ni notas, ni medias, ni
// valor del equipo, ni MVP, ni cómo quedó su equipo): solo la química, que sale de reglas conocidas.
import * as E from './draft-engine.js';
import * as MAP from './draft-map.js';
import { soundOn, setSound, hasMusic, preloadMusic, playMusic, stopMusic } from './draft-sound.js';
import * as PLAYER from './draft-player.js';

// Imágenes de Leaguepedia (sin "referrer": su servidor rechaza las imágenes pedidas desde otras webs).
// Las rutas que empiezan por img/ son imágenes guardadas en el propio juego.
const FILE = (f, w) => (f.startsWith('img/') ? f
  : `https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/${f.split('/').map(encodeURIComponent).join('/')}/revision/latest/scale-to-width-down/${w}`);
const PHOTO_W = 240; // un solo tamaño por imagen: cada foto se descarga una vez
const LOGO_W = 160;

// Iconos de posición: las formas de los iconos oficiales de LoL, dibujadas en SVG para que se vean
// nítidos a cualquier tamaño, cada uno con su color (top rojo, jungla verde, mid naranja,
// tirador azul, apoyo celeste).
const TOP_ICON = '<path d="M2 2h28l-6 6H8v16l-6 6z"/><path d="M30 8v22H8l5-5h12V13z" opacity=".3"/><rect x="12.5" y="12.5" width="7" height="7" opacity=".7"/>';
const ROLE_ICON = {
  top: TOP_ICON,
  jungle: '<path d="M16 30C14.4 21 14.6 11 17 2c1.7 9 1.4 19-1 28z"/><path d="M15 30C11 25 7.4 18 5 10c5.6 5 8.7 11 10 20zM17 30c4-5 7.6-12 10-20-5.6 5-8.7 11-10 20z"/><path d="M13 30c-4.2-1.8-8.2-5.6-11-11 5.2 2 9.1 5.6 11 11zM19 30c4.2-1.8 8.2-5.6 11-11-5.2 2-9.1 5.6-11 11z" opacity=".75"/>',
  mid: '<path d="M2 2h16l-5 5H7v6l-5 5zM30 30H14l5-5h6v-6l5-5z" opacity=".3"/><path d="M2 25L25 2h5v5L7 30H2z"/>',
  bot: `<g transform="rotate(180 16 16)">${TOP_ICON}</g>`,
  support: '<path d="M16 1l3.6 6L16 11.2 12.4 7z"/><path d="M14.4 12.6L2.5 9.5l3.7 5.6-2 2.6 9.6-.2zM17.6 12.6l11.9-3.1-3.7 5.6 2 2.6-9.6-.2z" opacity=".85"/><path d="M14 13h4l-1.1 17h-1.8z"/>',
};
export const roleIcon = (r) => `<svg class="dw-role ${r}" viewBox="0 0 32 32" role="img" aria-label="${E.ROLE_NAMES[r]}"><title>${E.ROLE_NAMES[r]}</title>${ROLE_ICON[r]}</svg>`;

// Adornos del estilo hextech (los degradados se definen una vez en la página)
const DEFS = `<svg class="hx-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
  <linearGradient id="hxGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0e6d2"/><stop offset=".45" stop-color="#c8aa6e"/><stop offset="1" stop-color="#785a28"/></linearGradient>
  <linearGradient id="hxHex" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdfafa"/><stop offset=".5" stop-color="#0ac8b9"/><stop offset="1" stop-color="#005a82"/></linearGradient>
  <radialGradient id="hxGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#0ac8b9" stop-opacity=".45"/><stop offset="1" stop-color="#0ac8b9" stop-opacity="0"/></radialGradient>
</defs></svg>`;
const EMBLEM = '<svg class="emblem" viewBox="0 0 40 44" aria-hidden="true"><path d="M20 1.5l17 9.8v21.4L20 42.5 3 32.7V11.3z" fill="#010a13" stroke="url(#hxGold)" stroke-width="2"/><path d="M20 7l12.2 7v16L20 37 7.8 30V14z" fill="none" stroke="#785a28" stroke-width=".8"/><path d="M20 11l7 11-7 11-7-11z" fill="url(#hxHex)"/><path d="M20 15.5l4 6.5-4 6.5-4-6.5z" fill="#cdfafa" opacity=".85"/></svg>';
const LOCK = '<svg class="lock" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 017 0v2h1v7h-9V7zm2 0h3V5a1.5 1.5 0 00-3 0z" fill="currentColor"/></svg>';
const REROLL = '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 8.5A6.6 6.6 0 004.6 5.4L3 3.8V9h5.2L6.1 6.9a4.6 4.6 0 018.3 1.6zM3.5 11.5a6.6 6.6 0 0011.9 3.1L17 16.2V11h-5.2l2.1 2.1a4.6 4.6 0 01-8.3-1.6z" fill="currentColor"/></svg>';
const CUP = `<svg class="cup" viewBox="0 0 120 150" aria-hidden="true">
  <circle cx="60" cy="62" r="58" fill="url(#hxGlow)"/>
  <path d="M60 4l50 28.9v57.8L60 119.6 10 90.7V32.9z" fill="none" stroke="url(#hxGold)" stroke-width="1.6" opacity=".9"/>
  <path d="M60 12l43 24.8v49.6L60 111.2 17 86.4V36.8z" fill="none" stroke="#785a28" stroke-width=".8"/>
  <path d="M38 28h44v18c0 17-9 29-22 32-13-3-22-15-22-32z" fill="url(#hxGold)"/>
  <path d="M38 34H27c0 14 6 22 16 24M82 34h11c0 14-6 22-16 24" fill="none" stroke="url(#hxGold)" stroke-width="3.2"/>
  <path d="M55 77h10v13H55z" fill="#c8aa6e"/><path d="M44 90h32l5 10H39z" fill="url(#hxGold)"/>
  <path d="M60 36l6 9-6 9-6-9z" fill="url(#hxHex)"/>
  <path d="M30 128h60" stroke="url(#hxGold)" stroke-width="1"/><path d="M60 123l5 5-5 5-5-5z" fill="#c8aa6e"/>
</svg>`;
const TRAIT_INFO = {
  clutch: 'Aparece cuando importa: en la partida decisiva de una serie puede ganarla él solo.',
  choke: 'Rey de la liga: en las partidas normales juega por encima de su nivel, pero en la decisiva de una serie puede hundir a su equipo.',
};
const GAME_MIN = 33; // minutos de partida que se muestran en el reloj (solo decoración)

// Si una imagen falla se reintenta un par de veces y, si no hay manera, quedan las iniciales.
if (typeof window !== 'undefined' && !window.dwImgErr) {
  window.dwImgErr = (el) => {
    const n = Number(el.dataset.try || 0);
    if (n >= 2) { el.remove(); return; }
    el.dataset.try = n + 1;
    setTimeout(() => { if (el.isConnected) el.src = `${el.src.split('?')[0]}?try=${n + 1}`; }, 800 * (n + 1));
  };
}

export function createDraft(ctx) {
  const { app, esc, toast, go } = ctx;
  let timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; };

  function stop() {
    timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    timers = [];
    stopMusic();
    ctx.onStop?.();
  }

  // ---------- piezas visuales ----------
  const initials = (n) => esc(String(n).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase());
  const img = (path, w) => `<img src="${FILE(path, w)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="dwImgErr(this)">`;
  const photo = (p) => `<span class="ph"><b>${initials(p.name)}</b>${p.photo ? img(p.photo, PHOTO_W) : ''}</span>`;
  function avatar(p, { badge = true } = {}) {
    return `<span class="av"><span class="ring">${photo(p)}</span>${badge ? `<span class="rb">${roleIcon(p.role)}</span>` : ''}</span>`;
  }
  function logo(team, cls = '') {
    return `<span class="lg ${cls}"><b>${esc(team.tag)}</b>${team.logo ? img(team.logo, LOGO_W) : ''}</span>`;
  }
  const traitTag = (p, sm = true) => (p.trait === 'clutch' ? `<span class="trait clutch${sm ? ' sm' : ''}">Clutch</span>`
    : p.trait === 'choke' ? `<span class="trait choke${sm ? ' sm' : ''}">Pecho frío</span>` : '');
  const fmt1 = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt1(Math.abs(n));
  const whyNot = (roster, p) => (roster[p.role] ? `Ya tienes ${E.ROLE_NAMES[p.role].toLowerCase()}` : E.canPick(roster, p) ? '' : 'Ya está en tu equipo');

  // Página del modo: barra superior del "cliente" y el contenido.
  // phase: 'menu' | 'draft' | 'mundial' | 'resultado'; chip: texto pequeño a la derecha.
  function shell(inner, { phase = 'menu', chip = '' } = {}) {
    const steps = [['draft', 'Draft'], ['mundial', 'Mundial'], ['resultado', 'Resultado']];
    return `${DEFS}
      <div class="hx">
        <header class="cl-top">
          <a class="brand" href="#/draft">${EMBLEM}<span><b>Draft Worlds</b><small>Mundiales 2011 – 2025</small></span></a>
          ${phase === 'menu' ? '' : `<nav class="nav" aria-label="Fase">${steps.map(([k, l]) => `<span class="${k === phase ? 'on' : ''}">${l}</span>`).join('')}</nav>`}
          ${playerHtml()}
          <div class="top-right">${chip ? `<span class="chip">${esc(chip)}</span>` : ''}${SOUND_BTN}<a class="exit" href="${phase === 'menu' ? '#/' : '#/draft'}">${phase === 'menu' ? 'Inicio' : 'Salir'}</a></div>
        </header>
        ${inner}
      </div>`;
  }
  const page = (inner, opts) => { app.innerHTML = shell(inner, opts); bindSound(); bindPlayer(); PLAYER.enter(); };

  // Minirreproductor de himnos (ver draft-player.js).
  const MP_ICON = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2.4v14H6zM19 5v14L9.5 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.6 5H18v14h-2.4zM5 5v14l9.5-7z"/></svg>',
    play: '<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  };
  function playerHtml() {
    const { song } = PLAYER.state();
    return `<div class="mp" role="group" aria-label="Música">
      <span class="mp-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="mp-txt"><b class="mp-title">${esc(song.title)}</b><small class="mp-sub">${esc(song.artist)} · Worlds ${song.year}</small></span>
      <span class="mp-ctl">
        <button type="button" class="mp-btn" data-mp="prev" aria-label="Canción anterior" title="Canción anterior">${MP_ICON.prev}</button>
        <button type="button" class="mp-btn mp-play" data-mp="play">${MP_ICON.play}${MP_ICON.pause}</button>
        <button type="button" class="mp-btn" data-mp="next" aria-label="Siguiente canción" title="Siguiente canción">${MP_ICON.next}</button>
      </span>
      <span class="mp-bar" aria-hidden="true"><i></i></span>
    </div>`;
  }
  function paintPlayer() {
    const mp = app.querySelector('.mp');
    if (!mp) return;
    const { song, playing, progress } = PLAYER.state();
    mp.classList.toggle('on', playing);
    mp.querySelector('.mp-title').textContent = song.title;
    mp.querySelector('.mp-sub').textContent = `${song.artist} · Worlds ${song.year}`;
    const b = mp.querySelector('.mp-play');
    b.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    b.title = playing ? 'Pausar' : 'Reproducir';
    mp.querySelector('.mp-bar i').style.transform = `scaleX(${progress.toFixed(4)})`;
  }
  PLAYER.onChange(paintPlayer);
  function bindPlayer() {
    const mp = app.querySelector('.mp');
    if (!mp) return;
    const act = { prev: PLAYER.prev, play: PLAYER.toggle, next: PLAYER.next };
    mp.querySelectorAll('[data-mp]').forEach((b) => (b.onclick = () => act[b.dataset.mp]()));
    paintPlayer();
  }
  // Botón de música: solo sale si hay alguna música (ver draft-sound.js).
  const SOUND_BTN = `<button class="snd" type="button" hidden aria-label="Música" title="Música">
    <svg class="i-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    <svg class="i-off" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
  function bindSound() {
    const b = app.querySelector('.snd');
    if (!b) return;
    const paint = () => { b.classList.toggle('off', !soundOn()); b.setAttribute('aria-pressed', String(soundOn())); };
    paint();
    b.onclick = () => { setSound(!soundOn()); paint(); PLAYER.soundChanged(); if (soundOn()) preloadMusic(); };
    b.hidden = !hasMusic();
  }
  const head = (kicker, title, done = null) => `
    <div class="cs-head">
      <p class="kicker">${kicker}</p>
      <h1 class="title">${title}</h1>
      ${done == null ? '' : `<div class="pips" aria-label="Ronda ${done + 1} de 5">${Array.from({ length: 5 }, (_, i) => `<span class="pip ${i < done ? 'done' : i === done ? 'now' : ''}"></span>`).join('<i></i>')}</div>`}
    </div>`;

  // ---------- paneles del draft ----------
  function slots(roster, preview = null) {
    const n = E.ROLES.filter((r) => roster[r]).length;
    const items = E.ROLES.map((r) => {
      const p = roster[r] ? E.PLAYER_BY_KEY[roster[r]] : preview?.role === r ? preview : null;
      if (p) {
        const pv = !roster[r];
        return `<li class="slot ${pv ? 'preview' : 'filled'}">${avatar(p)}
          <div class="slot-txt"><span class="slot-role">${E.ROLE_NAMES[r]}${pv ? ' · Vista previa' : ''}</span><span class="slot-name"><strong>${esc(p.name)}</strong>${traitTag(p)}</span><small>${esc(p.team)} · ${p.year}</small></div></li>`;
      }
      return `<li class="slot empty"><span class="av"><span class="ring empty"><span class="ph">${roleIcon(r)}</span></span></span>
        <div class="slot-txt"><span class="slot-role">${E.ROLE_NAMES[r]}</span><span class="slot-name"><strong>Libre</strong></span><small>Posición por cubrir</small></div></li>`;
    });
    return `<div class="col-label"><span>Tu equipo</span><em>${n} / 5</em></div><ol class="slots">${items.join('')}</ol>`;
  }

  // Mapa del draft: tus jugadores en su posición de tu mitad del mapa.
  function miniMap(roster, preview = null) {
    const toks = E.ROLES.map((r) => {
      const [x, y] = MAP.DRAFT_SPOTS[r];
      const p = roster[r] ? E.PLAYER_BY_KEY[roster[r]] : preview?.role === r ? preview : null;
      if (!p) return `<span class="mspot" style="left:${x}%;top:${y}%" title="${E.ROLE_NAMES[r]} libre">${roleIcon(r)}</span>`;
      return `<span class="mtok ${roster[r] ? '' : 'pv'}" style="left:${x}%;top:${y}%"><span class="ring">${photo(p)}</span><span class="nm">${esc(p.name)}</span></span>`;
    });
    return `
      <section class="panel map-panel">
        <h3 class="panel-h">La Grieta <small>Tu alineación</small></h3>
        <div class="mmap"><img class="bg" src="${MAP.MAP_IMG}" alt="Mapa de la Grieta del Invocador" draggable="false">${toks.join('')}</div>
      </section>`;
  }

  function chemPanel(players) {
    const ch = E.chemistry(players.filter(Boolean));
    const pct = (v) => ((Math.max(-6, Math.min(12, v)) + 6) / 18) * 100;
    return `
      <section class="panel chem">
        <h3 class="panel-h">Química <small>de −6 a +12</small></h3>
        <div class="chem-top"><b class="chem-val ${ch.total < 0 ? 'neg' : ''}">${signed(ch.total)}</b><small>Química del equipo</small></div>
        <div class="gauge"><span class="fill ${ch.total < 0 ? 'neg' : ''}" style="left:${Math.min(pct(0), pct(ch.total)).toFixed(2)}%;width:${Math.abs(pct(ch.total) - pct(0)).toFixed(2)}%"></span><span class="zero" style="left:${pct(0)}%"></span></div>
        <div class="gscale"><span style="left:0">−6</span><span style="left:${pct(0)}%">0</span><span style="left:${pct(6)}%">+6</span><span style="left:100%">+12</span></div>
        ${ch.items.length ? `<ul class="chem-list">${ch.items.map((i) => `<li class="${i.pts >= 0 ? 'pos' : 'neg'}"><b>${signed(i.pts)}</b><span>${esc(i.text)}</span></li>`).join('')}</ul>` : '<p class="muted">Sin química todavía.</p>'}
        <p class="chem-rules">Excompañeros <b>+2,5</b> · misma organización <b>+1</b> · 3/4/5 de la misma región <b>+1/+2/+4</b> · tirador y apoyo, o mid y jungla, sin ningún vínculo <b class="neg">−3</b></p>
      </section>`;
  }

  function teamCard(id, roster, selected) {
    const t = E.TEAM_BY_ID[id];
    const rows = t.players.map((pp) => {
      const p = E.PLAYER_BY_KEY[`${id}:${pp.role}`];
      const why = whyNot(roster, p);
      return `<li class="${why ? 'off' : ''}" ${why ? `title="${why}"` : ''}>${roleIcon(p.role)}<span class="nm">${esc(p.name)}</span>${traitTag(p)}${why && !p.trait ? LOCK : ''}</li>`;
    }).join('');
    const free = t.players.filter((pp) => E.canPick(roster, E.PLAYER_BY_KEY[`${id}:${pp.role}`])).length;
    return `
      <button class="tcard ${selected ? 'sel' : ''}" type="button" data-team="${id}" aria-pressed="${selected}">
        ${selected ? '<span class="sel-tag">Seleccionado</span>' : ''}
        <span class="bv-out"><span class="bv-in">
          <span class="wm">${t.logo ? img(t.logo, LOGO_W) : ''}</span>
          <span class="tc-head">
            ${logo(t, 'tc-logo')}
            <span class="tc-id">
              <span class="tc-year">${t.year}</span>
              <span class="tc-name">${esc(t.name)}</span>
              <span class="tc-badges"><span class="badge reg">${esc(t.region)}</span></span>
            </span>
          </span>
          <span class="divider"></span>
          <ul class="tc-roster">${rows}</ul>
          <span class="tc-foot">${free} de 5 disponibles</span>
        </span></span>
      </button>`;
  }

  function playerCard(p, roster, selected) {
    const why = whyNot(roster, p);
    return `
      <button class="pcard ${why ? 'off' : ''} ${selected ? 'sel' : ''}" type="button" data-key="${p.key}" ${why ? 'disabled' : ''}>
        <span class="bv-out"><span class="bv-in">
          <span class="pc-photo">${p.photo ? img(p.photo, PHOTO_W) : ''}<b>${initials(p.name)}</b>${why ? `<span class="pc-lock">${LOCK}<em>${why}</em></span>` : ''}</span>
          <span class="pc-role">${roleIcon(p.role)}</span>
          <span class="pc-txt">
            <strong>${esc(p.name)}</strong>
            <small>${E.ROLE_NAMES[p.role]}</small>
            <span class="pc-tags">${traitTag(p)}</span>
            ${why ? `<em class="pc-why">${why}</em>` : ''}
          </span>
        </span></span>
      </button>`;
  }

  // ---------- draft ----------
  // api: { title, roster, rerollsLeft, options(): Promise<ids>, reroll(): Promise<ids>, pick(key): Promise<roster>, done(roster) }
  // Un solo toque: tocar un equipo lo abre y tocar un jugador lo ficha.
  async function draftBoard(el, api) {
    let roster = api.roster;
    let options = await api.options();
    let team = null; // equipo abierto: se eligen sus jugadores
    let busy = null; // 'reroll' o la clave del jugador que se está fichando
    const draw = () => {
      if (!el.isConnected) return;
      const done = E.ROLES.filter((r) => roster[r]).length;
      const players = E.rosterPlayers(roster);
      const t = team && E.TEAM_BY_ID[team];
      const kicker = `${esc(api.title || 'Draft Worlds')} · Ronda ${Math.min(5, done + 1)} de 5`;
      let center, foot;
      if (!t) {
        center = `
          <div class="col-label center"><span>Equipos de esta ronda</span><em>Toca un equipo para ver sus jugadores</em></div>
          <div class="opts">${options.map((id) => teamCard(id, roster, false)).join('')}</div>`;
        foot = `
          <p class="foot-hint">Toca un equipo y después a uno de sus jugadores para una posición libre. No puedes repetir jugador.</p>
          <div class="foot-btns">
            <button class="btn-ghost" type="button" id="dwReroll" ${api.rerollsLeft > 0 && !busy ? '' : 'disabled'}>${REROLL}<span>Reroll</span><em class="rr">${Array.from({ length: E.REROLLS }, (_, i) => `<i class="${i < api.rerollsLeft ? 'on' : ''}"></i>`).join('')}</em><small>${api.rerollsLeft} ${api.rerollsLeft === 1 ? 'restante' : 'restantes'}</small></button>
          </div>`;
      } else {
        const free = t.players.filter((pp) => E.canPick(roster, E.PLAYER_BY_KEY[`${t.id}:${pp.role}`])).length;
        const traits = [...new Set(t.players.map((pp) => pp.trait).filter(Boolean))];
        center = `
          <div class="team-bar">
            <button class="back" type="button" id="dwBack"><span aria-hidden="true">‹</span> Equipos</button>
            ${logo(t, 'tb-logo')}
            <div class="tb-id"><strong>${esc(t.name)}</strong><small>${t.year} · ${esc(t.region)}</small></div>
            <span class="tb-free">${free} de 5 disponibles</span>
          </div>
          <div class="pgrid">${t.players.map((pp) => { const p = E.PLAYER_BY_KEY[`${t.id}:${pp.role}`]; return playerCard(p, roster, p.key === busy); }).join('')}</div>
          ${traits.length ? `<div class="trait-help">${traits.map((k) => `<p>${traitTag({ trait: k })} ${TRAIT_INFO[k]}</p>`).join('')}</div>` : ''}`;
        foot = `
          <p class="foot-hint">Toca a un jugador para ficharlo. Los atenuados no se pueden elegir: su posición ya está ocupada o ya están en tu equipo.</p>
          <div class="foot-btns">
            <button class="btn-ghost" type="button" id="dwBack2" ${busy ? 'disabled' : ''}><span aria-hidden="true">‹</span><span>Volver a los equipos</span></button>
          </div>`;
      }
      el.innerHTML = `
        <div class="cs ${busy ? 'busy' : ''}">
          ${head(kicker, t ? 'Elige a tu jugador' : 'Elige un equipo', Math.min(4, done))}
          <div class="cs-body">
            <aside class="col-left">${slots(roster)}</aside>
            <main class="col-center">${center}</main>
            <aside class="col-right">${miniMap(roster)}${chemPanel(players)}</aside>
          </div>
          <footer class="cs-foot">${foot}</footer>
        </div>`;
      el.querySelectorAll('[data-team]').forEach((b) => (b.onclick = () => {
        if (busy) return;
        team = b.dataset.team;
        draw();
        el.querySelector('.col-center')?.scrollIntoView({ block: 'nearest' });
      }));
      const back = () => { if (!busy) { team = null; draw(); } };
      el.querySelector('#dwBack')?.addEventListener('click', back);
      el.querySelector('#dwBack2')?.addEventListener('click', back);
      el.querySelectorAll('[data-key]').forEach((b) => (b.onclick = async () => {
        if (busy) return;
        busy = b.dataset.key; draw();
        try {
          roster = await api.pick(busy);
          team = null;
          if (E.ROLES.every((r) => roster[r])) return api.done(roster);
          options = await api.options();
        } catch (err) { toast(err.message, 'error'); }
        busy = null; draw();
      }));
      el.querySelector('#dwReroll')?.addEventListener('click', async () => {
        busy = 'reroll'; draw();
        try { options = await api.reroll(); api.rerollsLeft--; } catch (err) { toast(err.message, 'error'); }
        busy = null; draw();
      });
    };
    draw();
  }

  // Resumen de un equipo ya armado: mapa y química.
  function teamSummary(roster) {
    return `<div class="sum">${miniMap(roster)}${chemPanel(E.rosterPlayers(roster))}</div>`;
  }

  // ---------- torneo: línea de tiempo de escenas ----------
  const label = (p, me) => (p.id === me ? 'Tu equipo' : p.bot ? p.name : `El equipo de ${p.name}`);
  const short = (p, me) => (p.id === me ? 'Tú' : p.name);
  const sideOf = (m, me) => (m.a.id === me ? 'a' : m.b.id === me ? 'b' : null);

  function buildScenes(result, me) {
    const scenes = [];
    let alive = result.entrants.some((x) => x.id === me);
    const add = (type, dur, data) => scenes.push({ type, dur, ...data });
    result.rounds.forEach((round, ri) => {
      const mine = round.matches.find((m) => m.a.id === me || m.b.id === me);
      const watch = alive && mine ? mine : (!alive && round.size === 2 ? round.matches[0] : null);
      if (watch) {
        add('preview', 7000, { ri, m: watch });
        watch.games.forEach((g, gi) => add('game', MAP.gameDuration(g.events), { ri, m: watch, gi }));
      }
      // resultado de la serie, si te eliminan y cómo sigue el cuadro, en una sola pantalla
      const out = alive && mine && (mine.winner === 'a' ? mine.a.id : mine.b.id) !== me;
      const bracket = round.size > 2;
      if (watch || bracket) add('series', (watch ? 4500 : 0) + (bracket ? 7000 : 0) + (out ? 2500 : 0), { ri, m: watch, out, bracket });
      if (out) alive = false;
    });
    add('end', Infinity, {});
    return scenes;
  }

  function bracketView(result, upto, me) {
    const match = (m, shown) => {
      const row = (p, s) => `<div class="bm-row ${shown && m.winner === s ? 'win' : ''} ${p.id === me ? 'mine-row' : ''}"><span>${esc(short(p, me))}</span><b>${shown ? m.score[s === 'a' ? 0 : 1] : ''}</b></div>`;
      return `<div class="bm ${m.a.id === me || m.b.id === me ? 'mine' : ''}">${row(m.a, 'a')}${row(m.b, 'b')}</div>`;
    };
    const cols = result.rounds.map((r, ri) => {
      const shown = ri <= upto;
      const pairs = [];
      if (r.matches.length > 1) for (let i = 0; i < r.matches.length; i += 2) pairs.push(`<div class="pair">${match(r.matches[i], shown)}${match(r.matches[i + 1], shown)}</div>`);
      else pairs.push(`<div class="pair single">${match(r.matches[0], shown)}</div>`);
      return `<div class="br-col"><h4>${r.name} <small>Bo${r.bestOf}</small></h4><div class="br-list">${pairs.join('')}</div></div>`;
    });
    const champ = upto >= result.rounds.length - 1 ? result.champion : null;
    cols.push(`<div class="br-col champ"><h4>Campeón</h4><div class="br-list"><div class="pair single"><div class="bm champion ${champ?.id === me ? 'mine' : ''}"><span class="bm-cup">${CUP}</span><strong>${champ ? esc(short(champ, me)) : '?'}</strong></div></div></div></div>`);
    return `<div class="bracket r${result.rounds.length}">${cols.join('')}</div>`;
  }

  function vsView(round, m, me) {
    const mine = sideOf(m, me);
    const [l, r] = m.b.id === me ? [m.b, m.a] : [m.a, m.b]; // tu equipo siempre a la izquierda
    const team = (p, side) => `
      <div class="vs-team ${side}">
        <p class="vs-side">${side === 'home' ? 'Lado azul' : 'Lado rojo'}</p>
        <h3>${esc(label(p, me))}</h3>
        <div class="vs-players">${p.players.map((x) => `
          <div class="vs-p">${avatar(x)}<b>${esc(x.name)}</b><small>${x.year} · ${esc(x.tag)}</small>${traitTag(x)}</div>`).join('')}</div>
        <p class="vs-chem">Química <b class="${p.chem < 0 ? 'neg' : ''}">${signed(p.chem)}</b></p>
      </div>`;
    return `
      <div class="vs">
        ${head(`${round.name} · Al mejor de ${m.bestOf}`, mine ? 'Tu próxima serie' : 'La final del Mundial')}
        <div class="vs-grid">${team(l, 'home')}<div class="vs-mid"><span>VS</span></div>${team(r, 'away')}</div>
      </div>`;
  }

  // ---------- partida en vivo ----------
  const clockAt = (t, dur) => {
    const s = Math.max(0, Math.round((1.5 + (Math.min(t, dur) / dur) * (GAME_MIN - 1.5)) * 60));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  function scoreHtml(round, m, gi, t, me) {
    const side = sideOf(m, me) || 'a';
    const g = m.games[gi];
    const finished = MAP.gameFinished(t, g.events);
    const done = m.games.slice(0, finished ? gi + 1 : gi);
    const w = done.filter((x) => x.winner === side).length;
    const boxes = Array.from({ length: m.bestOf }, (_, i) => {
      const isDone = i < gi || (i === gi && finished);
      const cls = isDone ? (m.games[i].winner === side ? 'w' : 'l') : i === gi ? 'cur' : '';
      return `<span class="box ${cls}">M${i + 1}</span>`;
    }).join('');
    return `<p class="sb-round">${round.name} · Al mejor de ${m.bestOf}</p>
      <div class="sb-score"><b>${w}</b><span>–</span><b>${done.length - w}</b></div>
      <div class="boxes">${boxes}</div>`;
  }

  function feedHtml(m, gi, t, me) {
    const mine = sideOf(m, me);
    const side = mine || 'a';
    const g = m.games[gi];
    const dur = MAP.gameDuration(g.events);
    const k = MAP.shownEvents(t, g.events);
    const times = MAP.eventTimes(g.events);
    const teamName = (s) => label(s === 'a' ? m.a : m.b, me);
    const items = g.events.slice(0, k).map((e, j) => {
      const good = e.side === side;
      const txt = e.text.replaceAll('{eq}', teamName(e.side)).replaceAll('{rival}', teamName(e.side === 'a' ? 'b' : 'a'));
      const tag = e.kind === 'clutch' ? '<span class="trait clutch sm">Clutch</span>' : e.kind === 'choke' ? '<span class="trait choke sm">Pecho frío</span>' : '';
      const cls = mine ? (good ? 'good' : 'bad') : (e.side === 'a' ? 'good' : 'bad');
      const word = mine ? (good ? 'A favor' : 'En contra') : esc(teamName(e.side));
      return `<li class="ev ${cls} ${e.kind} ${j === k - 1 ? 'new' : ''}"><time>${clockAt(times[j], dur)}</time>
        <div><span class="ev-meta"><span class="ev-side">${word}</span>${tag}</span><p>${esc(txt)}</p></div></li>`;
    }).join('');
    const tail = MAP.gameFinished(t, g.events)
      ? `<li class="ev-result ${g.winner === side ? 'win' : 'lose'}">${mine ? (g.winner === side ? 'Partida ganada' : 'Partida perdida') : `Gana ${esc(teamName(g.winner))}`}</li>`
      : `<li class="ev-wait"><span class="spin"></span>Partida ${gi + 1} en juego…</li>`;
    return items + tail;
  }

  function gameView(round, m, gi, t, me) {
    const mine = sideOf(m, me);
    const side = mine || 'a';
    const home = side === 'a' ? m.a : m.b, away = side === 'a' ? m.b : m.a;
    const L = MAP.gameLayout(m, gi, t, me);
    const tok = (s, p) => {
      const v = L.pos[`${s}:${p.role}`];
      return `<div class="tok ${s}${v.dead ? ' dead' : ''}" data-tok="${s}:${p.role}" style="left:${v.x.toFixed(2)}%;top:${v.y.toFixed(2)}%"><span class="ring">${photo(p)}</span><span class="nm">${esc(p.name)}</span></div>`;
    };
    const sbTeam = (p, s) => `
      <div class="sb-team ${s}">
        <div class="sb-id"><span class="sb-side">${s === 'home' ? 'Lado azul' : 'Lado rojo'}</span><strong>${esc(label(p, me))}</strong></div>
        <div class="sb-mini">${p.players.map((x) => `<span class="ring" title="${esc(x.name)} · ${E.ROLE_NAMES[x.role]}">${photo(x)}</span>`).join('')}</div>
      </div>`;
    const traits = [home, away].map((x, i) => {
      const tr = x.players.filter((pl) => pl.trait);
      return `<p class="${i ? 'away' : 'home'}"><b>${esc(label(x, me))}</b>${tr.length ? tr.map((pl) => `<span>${esc(pl.name)} ${traitTag(pl)}</span>`).join('') : '<span class="none">Ninguno</span>'}</p>`;
    }).join('');
    const won = m.games[gi].winner === side;
    return `
      <div class="live">
        <div class="scorebar">${sbTeam(home, 'home')}<div class="sb-mid">${scoreHtml(round, m, gi, t, me)}</div>${sbTeam(away, 'away')}</div>
        <div class="live-grid">
          <div class="mapwrap">
            <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
            <div class="mapin">
              <img class="bg" src="${MAP.MAP_IMG}" alt="Grieta del Invocador" draggable="false">
              <span class="ping"></span>
              ${home.players.map((p) => tok('home', p)).join('')}${away.players.map((p) => tok('away', p)).join('')}
              <div class="verdict ${won ? 'win' : 'lose'}"><span>${mine ? (won ? 'Victoria' : 'Derrota') : `Gana ${esc(short(won ? home : away, me))}`}</span></div>
            </div>
            <div class="hud"><span>Partida ${gi + 1}</span><b class="clock">${clockAt(t, MAP.gameDuration(m.games[gi].events))}</b></div>
          </div>
          <aside class="panel feed">
            <h3 class="panel-h">Crónica de la partida <small>M${gi + 1} · ${round.name}</small></h3>
            <div class="feed-legend">${mine ? '<span class="good">A favor</span><span class="bad">En contra</span>' : `<span class="good">${esc(short(m.a, me))}</span><span class="bad">${esc(short(m.b, me))}</span>`}<span class="trait-l">Rasgo</span></div>
            <ol class="events">${feedHtml(m, gi, t, me)}</ol>
            <div class="feed-traits"><span class="ft-h">Rasgos en esta serie</span>${traits}</div>
          </aside>
        </div>
      </div>`;
  }

  // Mueve a los jugadores, el destello de la jugada y destaca a su protagonista.
  function moveTokens(mapEl, m, gi, t, me) {
    if (!mapEl) return;
    const L = MAP.gameLayout(m, gi, t, me);
    const focus = new Set(L.focus?.keys || []);
    for (const el of mapEl.querySelectorAll('[data-tok]')) {
      const v = L.pos[el.dataset.tok];
      if (!v) continue;
      if (el.classList.contains('dead') && !v.dead) {
        // reaparece en su fuente y vuelve caminando
        const [fx, fy] = MAP.fountain(el.dataset.tok.split(':')[0]);
        el.style.transition = 'none';
        el.style.left = `${fx}%`;
        el.style.top = `${fy}%`;
        void el.offsetWidth;
        el.style.transition = '';
      }
      el.classList.toggle('dead', v.dead);
      const f = focus.has(el.dataset.tok) && !v.dead;
      el.classList.toggle('focus', f);
      el.classList.toggle('clutch', f && L.focus.kind === 'clutch');
      el.classList.toggle('choke', f && L.focus.kind === 'choke');
      el.style.left = `${v.x.toFixed(2)}%`;
      el.style.top = `${v.y.toFixed(2)}%`;
    }
    const ping = mapEl.querySelector('.ping');
    if (ping && L.ping && ping.dataset.step !== String(L.ping.step)) {
      ping.dataset.step = L.ping.step;
      ping.className = `ping ${L.ping.side}`;
      ping.style.left = `${L.ping.x}%`;
      ping.style.top = `${L.ping.y}%`;
      void ping.offsetWidth;
      ping.classList.add('on');
    } else if (ping && !L.ping && ping.dataset.step) {
      ping.className = 'ping';
      delete ping.dataset.step;
    }
    mapEl.classList.toggle('finished', MAP.gameFinished(t, m.games[gi].events));
    cinema(mapEl, m, gi, t, me, L);
  }

  // CLUTCH o PECHO FRÍO: el jugador sale en grande sobre el mapa con su jugada y cómo decide la partida.
  // Todo va con retrasos negativos (--el), así que quien llega a mitad la ve en el mismo punto.
  function cinema(mapEl, m, gi, t, me, L) {
    const c = MAP.cineAt(t, m.games[gi].events);
    const key = c ? `${gi}:${c.step}` : '';
    mapEl.classList.toggle('cine-on', !!c);
    const old = mapEl.querySelector('.cine');
    if (old && old.dataset.key === key) return;
    old?.remove();
    mapEl.querySelector('.cine-wave')?.remove();
    if (!c) return;
    const { ev } = c;
    const p = E.PLAYER_BY_KEY[ev.key];
    if (!p) return;
    const clutch = ev.kind === 'clutch';
    const pSide = clutch ? ev.side : ev.side === 'a' ? 'b' : 'a';
    const team = label(pSide === 'a' ? m.a : m.b, me);
    const txt = ev.text.replaceAll('{eq}', label(ev.side === 'a' ? m.a : m.b, me));
    const decide = clutch ? 'Decide la partida' : `Le cuesta la partida a ${team === 'Tu equipo' ? 'tu equipo' : esc(team)}`;
    const cracks = clutch ? '' : `<svg class="cine-crack" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M52 48 L40 30 L44 18 L36 2"/><path d="M52 48 L70 38 L78 22 L96 14"/><path d="M52 48 L62 66 L58 82 L66 98"/>
      <path d="M52 48 L32 58 L20 54 L4 66"/><path d="M40 30 L28 26"/><path d="M70 38 L84 44"/><path d="M62 66 L76 72"/></svg>`;
    playMusic(ev.kind, c.el, MAP.CINE_MUSIC);
    const box = document.createElement('div');
    box.className = `cine ${ev.kind}`;
    box.dataset.key = key;
    box.style.setProperty('--el', `${-c.el}ms`);
    box.innerHTML = `
      <div class="cine-flash"></div>
      <div class="cine-band"><span class="cine-lines"></span></div>
      <div class="cine-photo"><span class="cine-rays"></span><span class="cine-face"><span class="cine-in">${p.photo ? img(p.photo, PHOTO_W) : ''}<b>${initials(p.name)}</b></span></span>${cracks}</div>
      <div class="cine-txt">
        <p class="cine-stamp">${clutch ? 'Clutch' : 'Pecho frío'}</p>
        <p class="cine-name">${esc(p.name)}<small>${E.ROLE_NAMES[p.role]} · ${esc(p.team)} ${p.year}</small></p>
        <p class="cine-msg">${esc(txt)}</p>
        <p class="cine-decide"><span>${decide}</span></p>
      </div>`;
    mapEl.appendChild(box);
    // onda sobre el jugador en el mapa cuando la jugada se resuelve
    const pos = L.pos[`${pSide === (m.b.id === me ? 'b' : 'a') ? 'home' : 'away'}:${p.role}`];
    if (pos) {
      const wave = document.createElement('span');
      wave.className = `cine-wave ${ev.kind}`;
      wave.style.cssText = `left:${pos.x}%;top:${pos.y}%;--el:${-c.el}ms`;
      mapEl.appendChild(wave);
    }
  }

  // ---------- resultado final ----------
  function finalCard(result, me, extra = {}) {
    const p = result.entrants.find((x) => x.id === me);
    const champion = result.champion.id === me;
    const actions = extra.actions || '';
    if (!p) {
      return `
        <div class="res">
          <div class="banner">${CUP}<p class="kicker">Mundial terminado</p><h1 class="res-title">${esc(label(result.champion, me))}</h1><div class="flourish"><i></i><span></span><i></i></div><p class="res-sub">Campeón del mundo</p></div>
          <section class="panel br-panel"><h3 class="panel-h">Cuadro del Mundial <small>Octavos y cuartos al mejor de 3 · semifinal y final al mejor de 5</small></h3>${bracketView(result, result.rounds.length, me)}</section>
          ${actions}
        </div>`;
    }
    const j = E.journey(result, me);
    const last = j.steps[j.steps.length - 1];
    const steps = j.steps.map((s, i) => {
      const mm = result.rounds[i].matches.find((x) => x.a.id === me || x.b.id === me);
      const side = sideOf(mm, me);
      const opp = side === 'a' ? mm.b : mm.a;
      const games = mm.games.map((g) => `<i class="${g.winner === side ? 'w' : 'l'}"></i>`).join('');
      return `
        <div class="step ${s.won ? 'w' : 'l'}">
          <span class="st-round">${s.round} <small>Bo${mm.bestOf}</small></span>
          <span class="st-score">${s.score}</span>
          <span class="st-vs">contra ${esc(label(opp, me))}</span>
          <span class="st-games">${games}</span>
          <span class="st-res">${s.won ? 'Serie ganada' : 'Serie perdida'}</span>
        </div>`;
    }).join('');
    const lastM = result.rounds[j.steps.length - 1].matches.find((x) => x.a.id === me || x.b.id === me);
    const lastOpp = sideOf(lastM, me) === 'a' ? lastM.b : lastM.a;
    const used = extra.rerollsUsed ?? 0;
    const team = p.players.map((x) => `
      <div class="fcard"><span class="bv-out"><span class="bv-in">
        <span class="fc-photo">${x.photo ? img(x.photo, PHOTO_W) : ''}<b>${initials(x.name)}</b></span>
        <span class="pc-role">${roleIcon(x.role)}</span>
        <span class="fc-txt">
          <small class="fc-role">${E.ROLE_NAMES[x.role]}</small>
          <strong>${esc(x.name)}</strong>
          <span class="fc-team">${logo(E.TEAM_BY_ID[x.teamId], 'mini')}<span>${esc(x.team)}</span></span>
          <span class="fc-year">${x.year}</span>
          <span class="fc-tags">${traitTag(x)}</span>
        </span>
      </span></span></div>`).join('');
    return `
      <div class="res">
        <div class="banner">
          ${CUP}
          <p class="kicker">Mundial simulado · ${result.entrants.length} equipos</p>
          <h1 class="res-title ${champion ? '' : 'lost'}">${champion ? 'Campeón del mundo' : `Hasta ${esc((j.reached || '').toLowerCase())}`}</h1>
          <div class="flourish"><i></i><span></span><i></i></div>
          <p class="res-sub">${champion ? `Ganaste la final ${last.score} contra ${esc(label(lastOpp, me))}` : `Caíste en ${esc(last.round.toLowerCase())} ${last.score} contra ${esc(label(lastOpp, me))} · Campeón: ${esc(label(result.champion, me))}`}</p>
        </div>
        <section class="panel path-panel">
          <h3 class="panel-h">Tu camino <small>Resultado de cada serie</small></h3>
          <div class="path">${steps}
            <div class="step rr"><span class="st-round">Rerolls</span><span class="st-score">${used}<small>/ ${E.REROLLS}</small></span><span class="st-vs">usados en el draft</span><span class="st-games">${Array.from({ length: E.REROLLS }, (_, i) => `<i class="${i < used ? 'on' : ''}"></i>`).join('')}</span></div>
          </div>
        </section>
        <div class="res-row">
          <section class="panel team-panel"><h3 class="panel-h">Tu equipo <small>Draft de 5 rondas</small></h3><div class="team5">${team}</div></section>
          ${chemPanel(p.players)}
        </div>
        <section class="panel br-panel"><h3 class="panel-h">Cuadro del Mundial <small>Octavos y cuartos al mejor de 3 · semifinal y final al mejor de 5</small></h3>${bracketView(result, result.rounds.length, me)}</section>
        ${actions}
      </div>`;
  }

  // Reproduce el torneo. startAt (ms) permite que todos vayan al mismo ritmo en salas online.
  // opts.pause: cada escena se para al terminar hasta que se pulsa Continuar.
  function playTournament(el, result, me, opts = {}) {
    const scenes = buildScenes(result, me);
    const startAt = opts.startAt || Date.now();
    let offset = 0; // saltos y pausas locales
    let passed = 0; // con pausa: las escenas anteriores a esta ya se dejaron atrás con Continuar
    let lastKey = '';
    let lastFeed = '', lastScore = '';
    const holdOf = (s) => (s.type === 'game' ? MAP.gameHold(s.m.games[s.gi].events) : 0);
    preloadMusic();
    // escena actual y tiempo dentro de ella
    const locate = () => {
      let t = Date.now() - startAt + offset;
      let i = 0;
      for (;;) {
        if (opts.pause && i >= passed && scenes[i].type !== 'end' && t > holdOf(scenes[i])) {
          offset -= t - holdOf(scenes[i]); // el tiempo no avanza hasta pulsar Continuar
          return { i, t: holdOf(scenes[i]), paused: true };
        }
        if (i < scenes.length - 1 && t >= scenes[i].dur) { t -= scenes[i].dur; i++; } else break;
      }
      return { i, t, paused: false };
    };
    const skipRow = () => (opts.allowSkip ? '<div class="skip-row"><button class="btn-ghost" type="button" id="dwSkip"><span>Continuar</span></button><button class="btn-ghost hex" type="button" id="dwEnd"><span>Ir al final</span></button></div>' : '');
    // cuando está parado, Continuar se ve dorado
    const markPaused = (paused) => {
      const b = el.querySelector('#dwSkip');
      if (!b) return;
      b.classList.toggle('btn-lock', paused);
      b.classList.toggle('btn-ghost', !paused);
    };
    const tick = () => {
      if (!el.isConnected) return;
      const { i, t, paused } = locate();
      markPaused(paused);
      const s = scenes[i];
      const round = result.rounds[s.ri];
      if (s.type === 'game' && lastKey === String(i)) {
        const feed = feedHtml(s.m, s.gi, t, me);
        if (feed !== lastFeed) { lastFeed = feed; const f = el.querySelector('.events'); f.innerHTML = feed; f.scrollTop = f.scrollHeight; }
        const score = scoreHtml(round, s.m, s.gi, t, me);
        if (score !== lastScore) { lastScore = score; el.querySelector('.sb-mid').innerHTML = score; }
        el.querySelector('.clock').textContent = clockAt(t, MAP.gameDuration(s.m.games[s.gi].events));
        moveTokens(el.querySelector('.mapin'), s.m, s.gi, t, me);
        return;
      }
      if (lastKey === String(i)) return;
      lastKey = String(i);
      stopMusic(); // la música de un momento no pasa a la escena siguiente
      lastFeed = ''; lastScore = '';
      let html = '';
      if (s.type === 'preview') html = vsView(round, s.m, me);
      else if (s.type === 'game') html = gameView(round, s.m, s.gi, t, me);
      else if (s.type === 'series') {
        if (s.m) {
          const side = sideOf(s.m, me);
          const won = side ? s.m.winner === side : null;
          const sc = side === 'b' ? [...s.m.score].reverse() : s.m.score;
          const out = s.out ? `<p class="res-sub">Quedas eliminado en ${round.name.toLowerCase()}. Sigues viendo el resto del torneo hasta la final.</p>` : '';
          html += `<div class="stage${s.bracket ? ' tight' : ''}"><div class="banner">${head(round.name, won == null ? `Gana ${esc(label(s.m.winner === 'a' ? s.m.a : s.m.b, me))}` : won ? 'Serie ganada' : 'Serie perdida')}<p class="big-score ${won === false ? 'lost' : ''}">${sc[0]} – ${sc[1]}</p>${out}</div></div>`;
        }
        if (s.bracket) html += `<div class="res"><section class="panel br-panel"><h3 class="panel-h">Resultados de ${round.name.toLowerCase()} <small>Así sigue el cuadro</small></h3>${bracketView(result, s.ri, me)}</section></div>`;
      } else {
        clearInterval(timer);
        el.innerHTML = finalCard(result, me, opts);
        el.closest('.hx')?.querySelectorAll('.nav span').forEach((x) => x.classList.toggle('on', x.textContent === 'Resultado'));
        opts.onEnd?.();
        el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => opts.onAction?.(b.dataset.act)));
        return;
      }
      el.innerHTML = `${html}${skipRow()}`;
      markPaused(paused);
      if (s.type === 'game') moveTokens(el.querySelector('.mapin'), s.m, s.gi, t, me);
      el.querySelector('#dwSkip')?.addEventListener('click', () => { const c = locate(); passed = c.i + 1; offset += Math.max(0, scenes[c.i].dur - c.t) + 1; lastKey = ''; tick(); });
      el.querySelector('#dwEnd')?.addEventListener('click', () => { passed = scenes.length - 1; offset += 1e9; lastKey = ''; tick(); });
    };
    const timer = every(tick, 200);
    tick();
  }

  // ---------- menú ----------
  function renderMenu() {
    const online = ctx.online?.();
    const tile = (href, key, title, text) => `
      <a class="mode-tile" href="${href}"><span class="bv-out"><span class="bv-in">
        <span class="mt-ico">${key}</span><strong>${title}</strong><small>${text}</small>
      </span></span></a>`;
    page(`
      <div class="menu">
        ${head('League of Legends · Mundiales 2011 – 2025', 'Draft Worlds')}
        <p class="intro">Arma tu equipo con jugadores de los Mundiales, cada uno en su versión de ese año, y juega un Mundial desde octavos o cuartos. En cada ronda eliges un equipo y uno de sus jugadores; la química entre ellos cuenta. Nadie te dice quién es mejor: eso lo sabes tú.</p>
        <div class="tiles">
          ${tile('#/draft/solo', roleIcon('mid'), 'Contra bots', 'Tú solo contra bots. Elige octavos o cuartos y la dificultad.')}
          ${online ? tile('#/draft/crear', roleIcon('support'), 'Crear sala', 'Juega con tus amigos con un código. Los huecos se llenan con bots.') : ''}
          ${online ? tile('#/draft/oficial', CUP, 'Sala oficial', 'Una por semana, solo cuentas verificadas. El campeón gana una copa.') : ''}
        </div>
        ${online ? `
        <form class="panel join-panel" id="dwJoin">
          <h3 class="panel-h">Unirse a una sala <small>Código de 6 letras o números</small></h3>
          <div class="join-row"><input id="dwCode" maxlength="6" placeholder="Ej. K7Q2XM" autocapitalize="characters" autocomplete="off"><button class="btn-ghost hex" type="submit"><span>Entrar</span></button></div>
          <a class="link" href="#/ranking/copas">Ver el ranking de copas</a>
        </form>` : ''}
      </div>`, { phase: 'menu' });
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
        <select id="${prefix}Level"><option value="facil">Fácil</option><option value="medio" selected>Media</option><option value="imposible">Imposible</option></select></label>`;
  }

  function renderSoloSetup() {
    page(`
      <div class="setup">
        ${head('Draft Worlds', 'Contra bots')}
        <section class="panel form-panel">
          ${sizeAndLevel('solo')}
          <p class="muted">5 rondas: en cada una salen 3 equipos al azar; eliges uno y uno de sus jugadores. Tienes ${E.REROLLS} rerolls.</p>
          <div class="form-btns"><a class="btn-ghost" href="#/draft"><span>Volver</span></a><button class="btn-lock" type="button" id="soloGo"><span>Empezar draft</span></button></div>
        </section>
      </div>`, { phase: 'draft', chip: 'Contra bots' });
    document.getElementById('soloGo').onclick = () => {
      const size = +document.getElementById('soloSize').value;
      const level = document.getElementById('soloLevel').value;
      startSolo(size, level);
    };
  }

  const LEVEL_NAMES = { facil: 'Fácil', medio: 'Media', imposible: 'Imposible' };

  function startSolo(size, level) {
    const seed = Math.random().toString(36).slice(2);
    const r = E.rng(`opts:${seed}`);
    let roster = E.emptyRoster();
    let used = 0;
    const chip = `Contra bots · Dificultad ${LEVEL_NAMES[level].toLowerCase()}`;
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
        page('<div id="dwPlay"></div>', { phase: 'mundial', chip });
        playTournament(document.getElementById('dwPlay'), result, me, {
          allowSkip: true,
          pause: true,
          rerollsUsed: used,
          actions: '<div class="res-actions"><a class="btn-ghost" href="#/draft"><span>Menú del draft</span></a><button class="btn-lock" type="button" data-act="again"><span>Otro draft</span></button></div>',
          onAction: (a) => a === 'again' && renderSoloSetup(),
        });
      },
    };
    page('<div id="dwDraft"></div>', { phase: 'draft', chip });
    draftBoard(document.getElementById('dwDraft'), api);
  }

  function route(arg) {
    if (arg === 'solo') return renderSoloSetup();
    if (ctx.routeOnline && ctx.routeOnline(arg, ...[...arguments].slice(1))) return;
    return renderMenu();
  }

  return { route, stop, leave: PLAYER.leave, page, shell, head, draftBoard, playTournament, sizeAndLevel, avatar, logo, later, every, finalCard, teamSummary, chemPanel, miniMap };
}
