// Mapa de la Grieta del Invocador y movimiento de los jugadores durante cada partida.
// Coordenadas en % de la imagen img/grieta.webp (x hacia la derecha, y hacia abajo).
// "home" es siempre el equipo de abajo a la izquierda (azul) y "away" el de arriba a la derecha (rojo).
// Todo sale de la partida y del tiempo transcurrido, así que en una sala todos ven lo mismo.
import { hashStr } from './draft-engine.js';

export const MAP_IMG = 'img/grieta.webp';
export const MAP_RATIO = 1000 / 842; // ancho / alto de la imagen

// Tiempos de una partida (ms desde que empieza la escena).
export const INTRO = 2000; // los jugadores salen de la fuente y llegan a sus líneas
export const STEP = 1700; // entre mensajes
export const MOVE = 1000; // se mueven hacia la jugada antes de que salga el mensaje
const WANDER = 750; // pequeños movimientos mientras tanto
export const gameDuration = (n) => INTRO + n * STEP + 1800;
export const shownEvents = (t, n) => (t < INTRO ? 0 : Math.min(n, Math.floor((t - INTRO) / STEP) + 1));
export const gameFinished = (t, n) => t >= INTRO + (n - 1) * STEP + 900;

const FOUNTAIN = { home: [6, 92], away: [93, 7] };
export const fountain = (side) => FOUNTAIN[side];
const NEXUS = { home: [13, 84], away: [85, 16] };
const BASE_GATE = { home: [25, 74], away: [75, 26] }; // inhibidores
const BARON = [35, 31];
const DRAGON = [64, 70];
const RIVER = [[40, 42], [60, 60]];
const CAMPS = { home: [[22, 52], [27, 61], [45, 74], [52, 81]], away: [[78, 48], [73, 39], [55, 26], [48, 19]] };
// Líneas desde la base azul hasta la roja
const LANES = {
  top: [[10, 66], [9, 40], [11, 17], [17, 10], [40, 9], [68, 10]],
  mid: [[33, 70], [50, 51], [67, 32]],
  bot: [[36, 90], [60, 92], [85, 90], [90, 82], [91, 58], [91, 33]],
};
const LANE_OF = { top: 'top', jungle: null, mid: 'mid', bot: 'bot', support: 'bot' };
const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];

// Posiciones fijas del draft (solo tu equipo, en su mitad del mapa).
export const DRAFT_SPOTS = { top: [10, 38], jungle: [25, 56], mid: [40, 60], bot: [62, 90], support: [57, 84] };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const unit = (seed) => (hashStr(seed) % 10007) / 10007; // número fijo entre 0 y 1 para cada semilla

// Punto a una fracción u (0 = base azul, 1 = base roja) del recorrido de una línea, y su dirección.
function lanePoint(lane, u) {
  const pts = LANES[lane];
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let d = clamp(u, 0, 1) * seg.reduce((a, b) => a + b, 0);
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? Math.min(1, d / seg[i]) : 0;
      const [a, b] = [pts[i], pts[i + 1]];
      return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], dir: [(b[0] - a[0]) / seg[i], (b[1] - a[1]) / seg[i]] };
    }
    d -= seg[i];
  }
  return { p: pts[pts.length - 1], dir: [0, -1] };
}

// n puntos alrededor de un centro (el radio en y se corrige porque la imagen es más ancha que alta).
function ring(c, n, r, seed) {
  if (n === 1) return [c];
  const a0 = unit(seed) * Math.PI * 2;
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * Math.PI * 2;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * MAP_RATIO];
  });
}
// Punto desplazado desde p hacia q una distancia d
function toward(p, q, d) {
  const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
  return [p[0] + (dx / len) * d, p[1] + (dy / len) * d];
}
const other = (s) => (s === 'home' ? 'away' : 'home');

// ---------- qué pasa en cada mensaje ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const named = (text, name) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(name)}([^\\p{L}\\p{N}]|$)`, 'u').test(text);

function analyze(ev, teams, sideMap, seed) {
  const S = sideMap[ev.side];
  const O = other(S);
  const text = ev.text;
  const rolesIn = (side) => ROLES.filter((r) => { const p = teams[side].players.find((x) => x.role === r); return p && named(text, p.name); });
  const actors = rolesIn(S);
  const victims = rolesIn(O);
  const lanes = ['top', 'mid', 'bot'];
  const pickLane = () => lanes[hashStr(seed + 'lane') % 3];
  let loc;
  if (ev.kind === 'end' || /Nexo|inhibidor|base rival|backdoor|la base/.test(text)) loc = /defiende la base/.test(text) ? 'ownBase' : 'enemyBase';
  else if (/Bar[oó]n|larvas|Heraldo/.test(text)) loc = 'baron';
  else if (/[Dd]rag[oó]n|alma/.test(text)) loc = 'dragon';
  else if (/línea superior|split-push/.test(text)) loc = 'top';
  else if (/línea inferior/.test(text)) loc = 'bot';
  else if (/línea de mid|torre interior de mid|línea central/.test(text)) loc = 'mid';
  else if (/jungla/.test(text)) loc = /rival|invade|en su jungla/.test(text) ? (ev.kind === 'choke' ? `jungle:${S}` : `jungle:${O}`) : `jungle:${hashStr(seed) % 2 ? 'home' : 'away'}`;
  else if (/río/.test(text)) loc = 'river';
  else {
    const r = actors[0] || victims[0];
    loc = r ? (LANE_OF[r] || `jungle:${O}`) : /torre|placas|oleada/.test(text) ? pickLane() : 'fight';
  }
  // bajas del equipo que pierde la jugada
  let deaths = 0;
  if (/\bAce\b|pentakill|elimina a los 5/.test(text)) deaths = 5;
  else if (/cuádruple|4 por 1/.test(text)) deaths = 4;
  else if (/triple|3 asesinatos/.test(text)) deaths = 3;
  else if (/doble|2 asesinatos/.test(text)) deaths = 2;
  else if (ev.kind === 'clutch') deaths = 3;
  else if (ev.kind === 'choke') deaths = 2;
  else if (/Primera sangre|elimina|cae|atrapa|asesinato|castiga|engancha|ejecuta|lo encuentra/.test(text)) deaths = 1;
  else if (/pelea|iniciación/.test(text)) deaths = 2;
  else if (loc === 'ownBase') deaths = 2;
  const push = /torre|placas|inhibidor|oleada|split-push|abre el mapa/.test(text) ? 0.12 : 0.05;
  return { S, O, loc, actors, victims, deaths, alsoS: /4 por 1/.test(text) ? 1 : 0, push };
}

// Posiciones de los 10 jugadores en el instante t de la partida gi de la serie m.
// Devuelve { pos: { 'home:top': { x, y, dead } ... }, ping: { x, y, side } | null, step }
export function gameLayout(m, gi, t, me) {
  const g = m.games[gi];
  const n = g.events.length;
  const homeLetter = m.b.id === me ? 'b' : 'a';
  const sideMap = { [homeLetter]: 'home', [homeLetter === 'a' ? 'b' : 'a']: 'away' };
  const teams = { home: homeLetter === 'a' ? m.a : m.b, away: homeLetter === 'a' ? m.b : m.a };
  const seed = `${m.a.id}|${m.b.id}|${gi}`;
  const step = t < INTRO - MOVE ? -1 : Math.min(n - 1, Math.floor((t - INTRO + MOVE) / STEP));
  const sub = Math.floor(t / WANDER);
  const info = g.events.map((ev, j) => analyze(ev, teams, sideMap, `${seed}|${j}`));

  // frente de cada línea (0 = pegado a la base azul, 1 = a la roja); se mueve hacia quien pierde
  const front = { top: 0.5, mid: 0.5, bot: 0.5 };
  for (let j = 0; j <= step; j++) {
    const e = info[j];
    const sign = e.O === 'away' ? 1 : -1;
    if (front[e.loc] != null) front[e.loc] = clamp(front[e.loc] + sign * e.push, 0.12, 0.88);
    if (e.loc === 'enemyBase') for (const l of Object.keys(front)) front[l] = clamp(front[l] + sign * 0.1, 0.12, 0.88);
  }

  const pos = {};
  const set = (side, role, p, dead = false) => { pos[`${side}:${role}`] = { x: clamp(p[0], 2, 98), y: clamp(p[1], 3, 97), dead }; };
  const laneSpot = (side, lane, role) => {
    const { p, dir } = lanePoint(lane, front[lane] + (side === 'home' ? -0.05 : 0.05));
    const perp = [-dir[1], dir[0]];
    const k = role === 'support' ? -1.8 : role === 'bot' ? 1.8 : 0;
    return [p[0] + perp[0] * k, p[1] + perp[1] * k * MAP_RATIO];
  };
  const camp = (side, k) => CAMPS[side][k % CAMPS[side].length];

  // 1) por defecto: cada uno en su línea; el jungla va de campamento en campamento
  for (const side of ['home', 'away']) {
    for (const role of ROLES) {
      if (t < 450) set(side, role, ring(FOUNTAIN[side], 5, 2, seed + side)[ROLES.indexOf(role)]);
      else if (role === 'jungle') set(side, role, camp(side, Math.floor(sub / 3) + (side === 'away' ? 2 : 0)));
      else set(side, role, laneSpot(side, LANE_OF[role], role));
    }
  }

  // 2) la jugada en curso
  let ping = null;
  if (step >= 0) {
    const e = info[step];
    const { S, O } = e;
    const all = ROLES;
    // quién muere en la jugada
    const deadOf = (side, count, named) => {
      const list = [...named];
      const rest = all.filter((r) => !list.includes(r)).sort((a, b) => hashStr(seed + step + side + a) - hashStr(seed + step + side + b));
      return [...list, ...rest].slice(0, count);
    };
    // las bajas se ven cuando sale el mensaje, no antes
    const revealed = t >= INTRO + step * STEP;
    const deadO = revealed ? deadOf(O, e.deaths, e.victims) : [];
    const deadS = revealed ? deadOf(S, e.alsoS, []) : [];
    const place = (side, roles, center, r, die = []) => {
      const pts = ring(center, roles.length, r, `${seed}${step}${side}`);
      roles.forEach((role, i) => set(side, role, pts[i], die.includes(role)));
    };
    const meet = (P, rS, rO, nS = all, nO = all, dS = 2.5, dO = 5) => {
      place(S, nS, toward(P, NEXUS[S], dS), rS, deadS);
      place(O, nO, toward(P, NEXUS[O], dO), rO, deadO);
    };
    let P;
    if (e.loc === 'enemyBase') {
      if (g.events[step].kind === 'end') {
        P = NEXUS[O];
        place(S, all, toward(P, [50, 50], 4), 7);
        place(O, all, toward(P, FOUNTAIN[O], 4), 3, revealed ? all : []);
      } else {
        P = BASE_GATE[O];
        meet(P, 5, 4, all, all, 1, 7);
      }
    } else if (e.loc === 'ownBase') {
      P = BASE_GATE[S];
      place(S, all, toward(P, NEXUS[S], 6), 4, deadS);
      place(O, all, toward(P, NEXUS[O], 2), 5, deadO);
    } else if (e.loc === 'baron' || e.loc === 'dragon') {
      P = e.loc === 'baron' ? BARON : DRAGON;
      meet(P, 4.5, 5, all, all, 2, 9);
    } else if (e.loc === 'river') {
      P = RIVER[hashStr(seed + step) % 2];
      const who = ['jungle', 'mid', 'support'];
      meet(P, 3.5, 3.5, [...new Set([...who, ...e.actors])], [...new Set([...who, ...e.victims])], 2, 4);
    } else if (e.loc.startsWith('jungle:')) {
      const owner = e.loc.slice(7);
      P = camp(owner, hashStr(seed + step));
      const nS = [...new Set(['jungle', ...e.actors])], nO = [...new Set(['jungle', ...e.victims])];
      meet(P, 3, 3, nS, nO, 1.5, 3.5);
    } else if (e.loc === 'fight') {
      P = lanePoint('mid', front.mid).p;
      meet(P, 5, 5, all, all, 3, 4);
    } else {
      // pelea en una línea: los de esa línea más quien aparezca en el mensaje
      const lane = e.loc;
      const laners = all.filter((r) => LANE_OF[r] === lane);
      const nS = [...new Set([...laners, ...e.actors])], nO = [...new Set([...laners, ...e.victims])];
      P = lanePoint(lane, front[lane]).p;
      meet(P, 3, 3, nS, nO, 2, 2.5);
    }
    ping = { x: P[0], y: P[1], side: S, step };
  }

  // 3) pequeños movimientos para que nadie esté quieto
  for (const [key, v] of Object.entries(pos)) {
    if (v.dead || t < 450) continue;
    v.x += (unit(`${seed}${key}${sub}x`) - 0.5) * 2.4;
    v.y += (unit(`${seed}${key}${sub}y`) - 0.5) * 2.4 * MAP_RATIO;
  }
  return { pos, ping, step };
}
