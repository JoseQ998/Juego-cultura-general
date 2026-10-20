// Mapa de la Grieta del Invocador y movimiento de los jugadores durante cada partida.
// Coordenadas en % de la imagen img/grieta.webp (x hacia la derecha, y hacia abajo).
// "home" es siempre el equipo de abajo a la izquierda (azul) y "away" el de arriba a la derecha (rojo).
// Todo sale de la partida y del tiempo transcurrido, así que en una sala todos ven lo mismo.
import { hashStr } from './draft-engine.js';

export const MAP_IMG = 'img/grieta.webp';
export const MAP_RATIO = 1000 / 842; // ancho / alto de la imagen

// Tiempos de una partida (ms desde que empieza la escena).
export const INTRO = 2000; // los jugadores salen de la fuente y llegan a sus líneas
export const STEP = 2100; // entre mensajes (cada jugada se ve un rato antes de pasar a la siguiente)
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


// ---------- quién participa en cada jugada ----------
// Para cada mensaje: dónde ocurre, qué posiciones del equipo que gana la jugada (S) y del otro (O)
// están, bajas del otro (d) y del propio (dS), y a veces un segundo grupo en otro sitio (also).
// Los que no participan siguen en su línea o en su jungla.
// Posiciones: t top, j jungla, m mid, b tirador, s apoyo, a = los 5.
// Sitios: top/mid/bot (frente de la línea), lane (una línea cualquiera), jungle:S/jungle:O (jungla de
// ese equipo), jungle, river, dragon, baron, objective (dragón o Barón), fight (centro del mapa),
// enemyBase (base de O), ownBase (base de S), nexus (Nexo de O).
const P = (at, S, O, d = 0, more = {}) => ({ at, S, O, d, ...more });
const PLAYS = {
  // inicio de la partida
  '{jg} invade la jungla rival y le roba el primer campamento a {r_jg}': P('jungle:O', 'j', 'j'),
  '{r_jg} se encuentra con toda la línea de {eq} en su jungla y sale sin buff': P('jungle:O', 'jmbs', 'j'),
  'Primera sangre: {mid} gana el duelo 1v1 contra {r_mid}': P('mid', 'm', 'm', 1),
  'Primera sangre: {jg} hace un gankeo perfecto a la línea superior': P('top', 'tj', 't', 1),
  '{sup} deja una ward a tiempo y salva a {adc} de un gankeo': P('bot', 'bs', 'jbs'),
  '{top} gana el duelo en solitario contra {r_top} y le saca ventaja de oro': P('top', 't', 't', 1),
  '{top} hace un teleport perfecto a la línea inferior y la pelea es 3v2': P('bot', 'tbs', 'bs', 2),
  '{adc} y {sup} ganan la línea inferior y doblan a la pareja rival': P('bot', 'bs', 'bs', 2),
  '{jg} contra-gankea en la línea de mid y salen 2 asesinatos': P('mid', 'jm', 'jm', 2),
  '{mid} rota a la línea inferior antes que {r_mid} y la pelea se decide ahí': P('bot', 'mbs', 'bs', 2),
  '{sup} engancha a {r_adc} y la línea inferior se cobra el asesinato': P('bot', 'bs', 'bs', 1),
  '{eq} consigue las primeras larvas del vacío': P('baron', 'jt', ''),
  '{eq} se lleva el Heraldo de la Grieta y lo usa para tirar la primera torre': P('baron', 'jtm', ''),
  '{eq} asegura el primer dragón': P('dragon', 'jbs', ''),
  '{r_jg} intenta robar el dragón pero {jg} gana el castigo': P('dragon', 'jbs', 'j', 1),
  '{eq} derriba la primera torre y se lleva el oro de la placa': P('lane', 'laners', 'laners', 0, { push: 0.14 }),
  '{r_top} se queda sin flash y {jg} lo castiga con un gankeo': P('top', 'tj', 't', 1),
  '{r_adc} se adelanta sin visión y la jungla de {eq} lo encuentra': P('jungle:S', 'jm', 'b', 1),
  '{mid} empuja la oleada y {r_mid} pierde casi 20 súbditos en las rotaciones': P('mid', 'm', 'm', 0, { push: 0.12 }),
  '{eq} hace un cambio de líneas y le quita 3 placas de torre al rival': P('top', 'bs', 't', 0, { push: 0.16 }),
  // mitad de la partida
  '{eq} gana una pelea de 3v3 en el río y se lleva el segundo dragón': P('dragon', 'jms', 'jms', 2),
  '{sup} encuentra a {r_mid} sin visión y {eq} lo elimina': P('river', 'sjm', 'm', 1),
  '{jg} roba el dragón delante de {r_jg}': P('dragon', 'j', 'jbs'),
  '{adc} sobrevive con poquísima vida y limpia la pelea con un doble asesinato': P('fight', 'jmbs', 'jmbs', 2, { dS: 1 }),
  '{mid} entra por el flanco y {eq} gana la pelea 4 por 1': P('fight', 'a', 'a', 4, { dS: 1 }),
  '{top} hace split-push en la línea superior y atrae a 2 rivales': P('top', 't', 'tj', 0, { push: 0.16 }),
  '{eq} tira la torre interior de mid y abre el mapa': P('mid', 'a', 'mj', 0, { push: 0.16 }),
  '{r_top} se queda solo en la línea superior y {eq} lo atrapa con 3 jugadores': P('top', 'tjm', 't', 1),
  '{eq} limpia toda la visión del lado del Barón y prepara el terreno': P('baron', 'jsm', ''),
  'Pelea en la jungla: {eq} se lleva 3 asesinatos sin bajas': P('jungle', 'jmbs', 'jmbs', 3),
  '{jg} hace un gankeo por detrás de la torre y {r_mid} cae': P('mid', 'jm', 'm', 1, { dive: true }),
  '{eq} consigue el alma del dragón': P('dragon', 'a', 'a', 2),
  '{sup} usa la definitiva en el momento justo y salva a {mid}': P('river', 'smj', 'jms', 1),
  '{adc} hace un triple asesinato en la pelea del dragón': P('dragon', 'a', 'a', 3),
  '{mid} castiga un mal posicionamiento de {r_adc} y lo elimina de un combo': P('river', 'mjs', 'bs', 1),
  '{eq} hace una iniciación perfecta 5v5 y gana la pelea': P('fight', 'a', 'a', 3),
  '{r_jg} se queda sin castigo y {eq} aprovecha para tomar el objetivo': P('objective', 'jmbs', 'jms'),
  '{top} aguanta un 1v2 y da tiempo a su equipo para tomar el dragón': P('dragon', 'jmbs', 'b', 0, { also: P('top', 't', 'tj') }),
  // final de la partida
  '{eq} consigue el Barón Nashor': P('baron', 'a', ''),
  '{jg} roba el Barón delante de todo el equipo rival': P('baron', 'jm', 'a'),
  '{eq} gana la pelea del Barón y destruye un inhibidor': P('baron', 'a', 'a', 4),
  '{eq} consigue el Dragón Ancestral y ejecuta al rival': P('dragon', 'a', 'a', 3),
  'Ace: {eq} elimina a los 5 rivales': P('fight', 'a', 'a', 5),
  '{adc} hace un pentakill': P('fight', 'a', 'a', 5),
  '{adc} hace un cuádruple asesinato': P('fight', 'a', 'a', 4),
  '{eq} entra en la base rival y tira 2 inhibidores': P('enemyBase', 'a', 'a', 2),
  '{top} hace backdoor mientras el rival pelea en el Barón': P('nexus', 't', '', 0, { also: P('baron', 'jmbs', 'a') }),
  '{eq} defiende la base con los inhibidores caídos y aguanta': P('ownBase', 'a', 'a', 2),
  'Carrera de bases: {eq} destruye el Nexo antes': P('nexus', 'a', '', 0, { also: P('ownBase', '', 'a') }),
  '{sup} se sacrifica para que {adc} escape y {eq} gana la pelea final': P('fight', 'a', 'a', 3, { dS: 1 }),
  '{eq} encuentra una pelea perfecta en la jungla y va directo al Nexo': P('jungle:O', 'a', 'a', 4),
  '{r_adc} cae por la espalda y el rival se queda sin daño en la pelea final': P('fight', 'a', 'a', 3),
  '{eq} gana la última pelea en el río y termina la partida': P('river', 'a', 'a', 4),
  '{mid} ejecuta al tirador rival y abre el camino hacia el Nexo': P('fight', 'a', 'a', 2),
  '{eq} destruye el Nexo': P('nexus', 'a', 'a', 5),
};
const LETTER = { t: 'top', j: 'jungle', m: 'mid', b: 'bot', s: 'support' };
const rolesOf = (code, lane) => (code === 'a' ? [...ROLES] : code === 'laners' ? ROLES.filter((r) => LANE_OF[r] === lane) : [...code].map((c) => LETTER[c]));

// Jugadas de los jugadores CLUTCH y PECHO FRÍO (y sus frases propias): se deduce del texto.
function guessPlay(ev, actor, victim) {
  const text = ev.text;
  const one = actor || victim;
  const laneOf = (r) => (r ? LANE_OF[r] || 'jungle:O' : 'fight');
  if (/1v3/.test(text)) {
    const base = /tire la base|tirar la base/.test(text);
    return P(laneOf(actor), actor ? actor[0] : 'm', 'tjm', ev.kind === 'clutch' ? 2 : 0, base ? { also: P('enemyBase', 'jmbs'.replace(actor?.[0] || '', ''), 'bs') } : {});
  }
  if (/Bar[oó]n/.test(text)) return P('baron', 'a', 'a', 3);
  if (/Drag[oó]n/.test(text)) return P('dragon', 'a', 'a', 3);
  if (/sin visión|se adelanta|lo atrapan|se mete en la jungla|aislado/.test(text)) return P('jungle:S', 'jms', victim ? victim[0] : 'b', 1);
  if (/teleport/.test(text)) return P('fight', 'a', 'a', 3);
  // el PECHO FRÍO que no aparece no está en la pelea
  if (victim && /farmeando|desaparece|no aparece|se queda fuera|se queda mirando|no llega|entra tarde|se queda atrás/.test(text)) return P('fight', 'a', 'tjmbs'.replace(victim[0], ''), 3);
  if (/línea central|en la línea/.test(text) && one) return P(laneOf(one), 'jm', 'jm', 2);
  return P('fight', 'a', 'a', ev.kind === 'clutch' ? 3 : 2);
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const named = (text, name) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(name)}([^\\p{L}\\p{N}]|$)`, 'u').test(text);

function analyze(ev, teams, sideMap, seed) {
  const S = sideMap[ev.side];
  const O = other(S);
  const rolesIn = (side) => ROLES.filter((r) => { const p = teams[side].players.find((x) => x.role === r); return p && named(ev.text, p.name); });
  const actors = rolesIn(S);
  const victims = rolesIn(O);
  const play = PLAYS[ev.tpl] || guessPlay(ev, actors[0], victims[0]);
  return { S, O, actors, victims, play, seed };
}

// Posiciones de los 10 jugadores en el instante t de la partida gi de la serie m.
// Devuelve { pos: { 'home:top': { x, y, dead } ... }, ping: { x, y, side, step } | null, step }
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
  const laneAt = (e) => (e.play.at === 'lane' ? ['top', 'mid', 'bot'][hashStr(e.seed + 'lane') % 3] : e.play.at);

  // frente de cada línea (0 = pegado a la base azul, 1 = a la roja); se mueve hacia quien pierde
  const front = { top: 0.5, mid: 0.5, bot: 0.5 };
  for (let j = 0; j <= step; j++) {
    const e = info[j];
    const sign = e.O === 'away' ? 1 : -1;
    const at = laneAt(e);
    if (front[at] != null) front[at] = clamp(front[at] + sign * (e.play.push || 0.05), 0.12, 0.88);
    if (at === 'enemyBase' || at === 'nexus') for (const l of Object.keys(front)) front[l] = clamp(front[l] + sign * 0.1, 0.12, 0.88);
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

  // 2) la jugada en curso: solo se mueven los que participan
  let ping = null;
  if (step >= 0) {
    const e = info[step];
    const { S, O } = e;
    const revealed = t >= INTRO + step * STEP; // las bajas se ven cuando sale el mensaje
    const where = (at, k) => {
      const lane = at === 'lane' ? laneAt(e) : at;
      if (front[lane] != null) {
        const u = e.play.dive ? front[lane] + (O === 'away' ? 0.12 : -0.12) : front[lane];
        return lanePoint(lane, u).p;
      }
      if (at === 'baron') return BARON;
      if (at === 'dragon') return DRAGON;
      if (at === 'objective') return hashStr(e.seed + k) % 2 ? BARON : DRAGON;
      if (at === 'river') return RIVER[hashStr(e.seed + k) % 2];
      if (at === 'jungle:S' || at === 'jungle:O') { const side = at.endsWith('S') ? S : O; return camp(side, hashStr(e.seed + k)); }
      if (at === 'jungle') return camp(hashStr(e.seed + k) % 2 ? 'home' : 'away', hashStr(e.seed + k + 'c'));
      if (at === 'enemyBase') return BASE_GATE[O];
      if (at === 'ownBase') return BASE_GATE[S];
      if (at === 'nexus') return NEXUS[O];
      return lanePoint('mid', front.mid).p; // pelea en el centro del mapa
    };
    const deadOf = (roles, count, named) => {
      const first = named.filter((r) => roles.includes(r));
      const rest = roles.filter((r) => !first.includes(r)).sort((a, b) => hashStr(e.seed + a) - hashStr(e.seed + b));
      return revealed ? [...first, ...rest].slice(0, count) : [];
    };
    const group = (play, k) => {
      const lane = play.at === 'lane' ? laneAt(e) : play.at;
      const rs = rolesOf(play.S, lane), ro = rolesOf(play.O, lane);
      const P0 = where(play.at, k);
      const deadO = deadOf(ro, play.d || 0, e.victims);
      const deadS = deadOf(rs, play.dS || 0, []);
      const small = rs.length + ro.length <= 4;
      const rS = rs.length > 3 ? 5 : small ? 2.2 : 3.5, rO = ro.length > 3 ? 5 : small ? 2.2 : 3.5;
      if (play.at === 'nexus' && g.events[step].kind === 'end') {
        // final: el ganador alrededor del Nexo rival; el perdedor, caído junto a su fuente
        ring(toward(P0, [50, 50], 4), rs.length, 7, `${e.seed}S`).forEach((p, i) => set(S, rs[i], p));
        ring(toward(P0, FOUNTAIN[O], 4), ro.length, 3, `${e.seed}O`).forEach((p, i) => set(O, ro[i], p, revealed));
        return P0;
      }
      // cada equipo se coloca a su lado del punto de la jugada (hacia su propia base)
      if (rs.length) ring(toward(P0, NEXUS[S], ro.length ? (small ? 1.8 : 2.5) : 0), rs.length, rS, `${e.seed}${k}S`).forEach((p, i) => set(S, rs[i], p, deadS.includes(rs[i])));
      if (ro.length) ring(toward(P0, NEXUS[O], rs.length ? (small ? 1.8 : 4.5) : 0), ro.length, rO, `${e.seed}${k}O`).forEach((p, i) => set(O, ro[i], p, deadO.includes(ro[i])));
      return P0;
    };
    if (e.play.also) group(e.play.also, 'b');
    const P0 = group(e.play, 'a');
    ping = { x: P0[0], y: P0[1], side: S, step };
  }

  // 3) pequeños movimientos para que nadie esté quieto
  for (const [key, v] of Object.entries(pos)) {
    if (v.dead || t < 450) continue;
    v.x += (unit(`${seed}${key}${sub}x`) - 0.5) * 2;
    v.y += (unit(`${seed}${key}${sub}y`) - 0.5) * 2 * MAP_RATIO;
  }
  return { pos, ping, step };
}
