// Motor del modo Draft Worlds: química, valor de equipo, opciones del draft, bots,
// cuadro del torneo y simulación. Todo es determinista a partir de una semilla:
// con la misma semilla y los mismos equipos, todos ven el mismo Worlds.
import { DRAFT_TEAMS } from './draft-data.js';

export const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
export const ROLE_NAMES = { top: 'Top', jungle: 'Jungla', mid: 'Mid', bot: 'Tirador', support: 'Apoyo' };
export const LEVELS = { facil: 'Fácil', medio: 'Media', imposible: 'Imposible' };
export const REROLLS = 2;

export const TEAMS = DRAFT_TEAMS;
export const TEAM_BY_ID = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
const keyName = (n) => String(n).toLowerCase();

// Jugador-temporada enriquecido con los datos de su equipo. key = "equipo:posición".
export const PLAYERS = TEAMS.flatMap((t) => t.players.map((p) => ({
  ...p, key: `${t.id}:${p.role}`, teamId: t.id, year: t.year, team: t.name, tag: t.tag, org: t.org, region: t.region, logo: t.logo,
})));
export const PLAYER_BY_KEY = Object.fromEntries(PLAYERS.map((p) => [p.key, p]));

// Equipos-año en los que jugó cada persona (para saber quiénes fueron compañeros).
const TEAMS_OF = new Map();
for (const p of PLAYERS) {
  const k = keyName(p.name);
  if (!TEAMS_OF.has(k)) TEAMS_OF.set(k, new Set());
  TEAMS_OF.get(k).add(p.teamId);
}
export function exTeammates(a, b) {
  if (keyName(a.name) === keyName(b.name)) return false;
  const ta = TEAMS_OF.get(keyName(a.name));
  for (const t of TEAMS_OF.get(keyName(b.name)) || []) if (ta?.has(t)) return true;
  return false;
}

// ---------------- azar con semilla ----------------
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let a = (typeof seed === 'number' ? seed : hashStr(String(seed))) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
function shuffle(arr, r) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------------- química y valor ----------------
const DUOS = [['bot', 'support', 'Tirador y apoyo'], ['mid', 'jungle', 'Mid y jungla']];
export function chemistry(players) {
  const ps = players.filter(Boolean);
  const items = [];
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (exTeammates(a, b)) items.push({ pts: 2.5, text: `${a.name} y ${b.name} fueron compañeros` });
      else if (a.org === b.org) items.push({ pts: 1, text: `${a.name} y ${b.name}: misma organización` });
    }
  }
  const byRegion = {};
  ps.forEach((p) => { byRegion[p.region] = (byRegion[p.region] || 0) + 1; });
  for (const [region, n] of Object.entries(byRegion)) {
    const pts = n >= 5 ? 4 : n === 4 ? 2 : n === 3 ? 1 : 0;
    if (pts) items.push({ pts, text: `${n} jugadores de la ${region}` });
  }
  const byRole = Object.fromEntries(ps.map((p) => [p.role, p]));
  for (const [r1, r2, label] of DUOS) {
    const a = byRole[r1], b = byRole[r2];
    if (!a || !b) continue;
    if (exTeammates(a, b)) items.push({ pts: 1.5, text: `${label} se conocen: ${a.name} y ${b.name}` });
    else if (a.org !== b.org && a.region !== b.region) items.push({ pts: -3, text: `${label} sin ningún vínculo` });
  }
  const raw = items.reduce((s, x) => s + x.pts, 0);
  return { total: Math.max(-6, Math.min(12, raw)), items };
}

export function teamValue(players) {
  const ps = players.filter(Boolean);
  const avg = ps.length ? ps.reduce((s, p) => s + p.rating, 0) / ps.length : 0;
  const chem = chemistry(ps).total;
  return { avg, chem, value: avg + chem };
}

export const winProb = (d) => 1 / (1 + Math.exp(-0.0847 * d));

// ---------------- draft ----------------
// Equipo en construcción: { top: key|null, ... }
export const emptyRoster = () => Object.fromEntries(ROLES.map((r) => [r, null]));
export const rosterPlayers = (roster) => ROLES.map((r) => (roster[r] ? PLAYER_BY_KEY[roster[r]] : null));

export function canPick(roster, p) {
  if (roster[p.role]) return false;
  const names = rosterPlayers(roster).filter(Boolean).map((x) => keyName(x.name));
  return !names.includes(keyName(p.name));
}
const pickable = (roster, team) => team.players.some((p) => canPick(roster, { ...p, name: p.name }));

// 3 equipos al azar que tengan al menos un jugador elegible.
export function draftOptions(roster, r, avoid = []) {
  const pool = TEAMS.filter((t) => pickable(roster, t) && !avoid.includes(t.id));
  return shuffle(pool.length >= 3 ? pool : TEAMS.filter((t) => pickable(roster, t)), r).slice(0, 3).map((t) => t.id);
}

// Lo que gana el equipo al fichar a p (nota + cambio de química), para los bots.
function pickScore(roster, p) {
  const before = rosterPlayers(roster).filter(Boolean);
  const chemDelta = chemistry([...before, p]).total - chemistry(before).total;
  return p.rating + chemDelta * 2;
}

export function botChoose(roster, optionIds, level, r) {
  const cands = optionIds.flatMap((id) => TEAM_BY_ID[id].players.map((p) => PLAYER_BY_KEY[`${id}:${p.role}`]))
    .filter((p) => canPick(roster, p));
  if (!cands.length) return null;
  if (level === 'facil') return pick(cands, r);
  const ranked = cands.map((p) => ({ p, s: pickScore(roster, p) })).sort((a, b) => b.s - a.s);
  if (level === 'imposible') return ranked[0].p;
  return pick(ranked.slice(0, 3), r).p;
}

export function botDraft(seed, level) {
  const r = rng(`bot:${seed}`);
  const roster = emptyRoster();
  for (let round = 0; round < 5; round++) {
    let p = botChoose(roster, draftOptions(roster, r), level, r);
    if (!p) p = randomFill(roster, r);
    roster[p.role] = p.key;
  }
  return roster;
}

// Completa al azar una posición libre (cuando se acaba el tiempo).
export function randomFill(roster, r) {
  const cands = PLAYERS.filter((p) => canPick(roster, p));
  return pick(cands, r);
}
export function autoComplete(roster, seed) {
  const r = rng(`auto:${seed}`);
  const out = { ...roster };
  while (ROLES.some((x) => !out[x])) { const p = randomFill(out, r); out[p.role] = p.key; }
  return out;
}

// ---------------- torneo ----------------
const ROUND_NAMES = { 16: 'Octavos', 8: 'Cuartos', 4: 'Semifinal', 2: 'Final' };
const BEST_OF = { 16: 3, 8: 3, 4: 5, 2: 5 };

// participants: [{ id, name, bot, roster }]; size 8 o 16
export function simulateTournament(participants, seed) {
  const r = rng(`worlds:${seed}`);
  const entrants = participants.map((x) => {
    const players = rosterPlayers(x.roster);
    return { ...x, players, ...teamValue(players) };
  });
  let alive = shuffle(entrants, r);
  const rounds = [];
  while (alive.length > 1) {
    const n = alive.length;
    const matches = [];
    for (let i = 0; i < n; i += 2) matches.push(simulateSeries(alive[i], alive[i + 1], BEST_OF[n], r));
    rounds.push({ name: ROUND_NAMES[n], size: n, bestOf: BEST_OF[n], matches });
    alive = matches.map((m) => (m.winner === 'a' ? m.a : m.b));
  }
  return { rounds, champion: alive[0], entrants };
}

function simulateSeries(a, b, bestOf, r) {
  const need = Math.ceil(bestOf / 2);
  const games = [];
  let wa = 0, wb = 0;
  while (wa < need && wb < need) {
    const decisive = wa === need - 1 && wb === need - 1;
    const g = simulateGame(a, b, decisive, r);
    games.push(g);
    if (g.winner === 'a') wa++; else wb++;
  }
  return { a, b, bestOf, games, score: [wa, wb], winner: wa > wb ? 'a' : 'b' };
}

function simulateGame(a, b, decisive, r) {
  const chance = decisive ? 0.08 : 0.04;
  const swings = [];
  for (const [side, team] of [['a', a], ['b', b]]) {
    for (const p of team.players) {
      if (!p.trait) continue;
      if (r() < chance) swings.push({ side, p, winner: p.trait === 'clutch' ? side : (side === 'a' ? 'b' : 'a') });
    }
  }
  const sides = new Set(swings.map((s) => s.winner));
  let winner, swing = null;
  if (sides.size === 1) { winner = swings[0].winner; swing = swings[0]; }
  else winner = r() < winProb(a.value - b.value) ? 'a' : 'b';
  return { winner, decisive, events: gameEvents(a, b, winner, swing, r) };
}

// ---------------- mensajes ----------------
// {top} {jg} {mid} {adc} {sup} = jugadores del equipo protagonista; {r_*} = del rival; {eq} / {rival} = nombres de equipo.
const EARLY = [
  '{jg} invade la jungla rival y le roba el primer campamento a {r_jg}',
  '{r_jg} se encuentra con toda la línea de {eq} en su jungla y sale sin buff',
  'Primera sangre: {mid} gana el duelo 1v1 contra {r_mid}',
  'Primera sangre: {jg} hace un gankeo perfecto a la línea superior',
  '{sup} deja una ward a tiempo y salva a {adc} de un gankeo',
  '{top} gana el duelo en solitario contra {r_top} y le saca ventaja de oro',
  '{top} hace un teleport perfecto a la línea inferior y la pelea es 3v2',
  '{adc} y {sup} ganan la línea inferior y doblan a la pareja rival',
  '{jg} contra-gankea en la línea de mid y salen 2 asesinatos',
  '{mid} rota a la línea inferior antes que {r_mid} y la pelea se decide ahí',
  '{sup} engancha a {r_adc} y la línea inferior se cobra el asesinato',
  '{eq} consigue las primeras larvas del vacío',
  '{eq} se lleva el Heraldo de la Grieta y lo usa para tirar la primera torre',
  '{eq} asegura el primer dragón',
  '{r_jg} intenta robar el dragón pero {jg} gana el castigo',
  '{eq} derriba la primera torre y se lleva el oro de la placa',
  '{r_top} se queda sin flash y {jg} lo castiga con un gankeo',
  '{r_adc} se adelanta sin visión y la jungla de {eq} lo encuentra',
  '{mid} empuja la oleada y {r_mid} pierde casi 20 súbditos en las rotaciones',
  '{eq} hace un cambio de líneas y le quita 3 placas de torre al rival',
];
const MID = [
  '{eq} gana una pelea de 3v3 en el río y se lleva el segundo dragón',
  '{sup} encuentra a {r_mid} sin visión y {eq} lo elimina',
  '{jg} roba el dragón delante de {r_jg}',
  '{adc} sobrevive con poquísima vida y limpia la pelea con un doble asesinato',
  '{mid} entra por el flanco y {eq} gana la pelea 4 por 1',
  '{top} hace split-push en la línea superior y atrae a 2 rivales',
  '{eq} tira la torre interior de mid y abre el mapa',
  '{r_top} se queda solo en la línea superior y {eq} lo atrapa con 3 jugadores',
  '{eq} limpia toda la visión del lado del Barón y prepara el terreno',
  'Pelea en la jungla: {eq} se lleva 3 asesinatos sin bajas',
  '{jg} hace un gankeo por detrás de la torre y {r_mid} cae',
  '{eq} consigue el alma del dragón',
  '{sup} usa la definitiva en el momento justo y salva a {mid}',
  '{adc} hace un triple asesinato en la pelea del dragón',
  '{mid} castiga un mal posicionamiento de {r_adc} y lo elimina de un combo',
  '{eq} hace una iniciación perfecta 5v5 y gana la pelea',
  '{r_jg} se queda sin castigo y {eq} aprovecha para tomar el objetivo',
  '{top} aguanta un 1v2 y da tiempo a su equipo para tomar el dragón',
];
const LATE = [
  '{eq} consigue el Barón Nashor',
  '{jg} roba el Barón delante de todo el equipo rival',
  '{eq} gana la pelea del Barón y destruye un inhibidor',
  '{eq} consigue el Dragón Ancestral y ejecuta al rival',
  'Ace: {eq} elimina a los 5 rivales',
  '{adc} hace un pentakill',
  '{adc} hace un cuádruple asesinato',
  '{eq} entra en la base rival y tira 2 inhibidores',
  '{top} hace backdoor mientras el rival pelea en el Barón',
  '{eq} defiende la base con los inhibidores caídos y aguanta',
  'Carrera de bases: {eq} destruye el Nexo antes',
  '{sup} se sacrifica para que {adc} escape y {eq} gana la pelea final',
  '{eq} encuentra una pelea perfecta en la jungla y va directo al Nexo',
  '{r_adc} cae por la espalda y el rival se queda sin daño en la pelea final',
  '{eq} gana la última pelea en el río y termina la partida',
  '{mid} ejecuta al tirador rival y abre el camino hacia el Nexo',
];
const END = '{eq} destruye el Nexo';

const CLUTCH_ANY = [
  '{jugador} se echa el equipo a la espalda y da la vuelta a una partida perdida',
  '{jugador} aparece cuando más importa y gana la pelea él solo',
  '{jugador} sale vivo de un 1v3 y la pelea cambia de dueño',
  'Con la serie en juego, {jugador} no falla',
  '{jugador} encuentra el flanco perfecto y destroza al equipo rival',
  '{jugador} juega como en sus mejores días y nadie puede pararlo',
];
const CLUTCH_ROLE = {
  top: ['{jugador} hace un teleport perfecto por la espalda y gana la pelea final', '{jugador} aguanta un 1v3 y gana tiempo para que su equipo tire la base'],
  jungle: ['{jugador} roba el Barón contra todo pronóstico y le da la vuelta a la partida', '{jugador} roba el Dragón Ancestral en el último segundo'],
  mid: ['{jugador} hace un pentakill y la partida termina ahí', '{jugador} esquiva todo, elimina a 3 rivales y abre el camino al Nexo'],
  bot: ['{jugador} sobrevive con 1 de vida y limpia la pelea entera', '{jugador} hace un cuádruple asesinato en la pelea del Barón'],
  support: ['{jugador} engancha al carry rival justo a tiempo y gana la pelea decisiva', '{jugador} se mete entre todo el equipo rival con la definitiva y gana la pelea'],
};
const CHOKE_ANY = [
  '{jugador} se congela con la presión del Worlds',
  '{jugador} desaparece en el momento decisivo',
  '{jugador} entra solo a la pelea y regala la partida',
  '{jugador} se adelanta sin visión, lo atrapan y su equipo pierde el Barón',
  'A {jugador} le tiembla la mano en la pelea más importante',
  '{jugador} se queda mirando mientras su equipo pierde la pelea final',
];
const CHOKE_ROLE = {
  top: ['{jugador} pierde la línea, se queda atrás y no llega a la pelea decisiva', '{jugador} hace un teleport y aparece en mitad de los 5 rivales'],
  jungle: ['{jugador} pierde el castigo del Barón y el rival se lo roba', '{jugador} falla el castigo del Dragón Ancestral y la partida se acaba ahí'],
  mid: ['{jugador} falla la definitiva y su equipo pierde la pelea', '{jugador} se queda sin flash y cae al primer intento en la pelea final'],
  bot: ['{jugador} se posiciona demasiado adelante y cae antes de hacer daño', '{jugador} falla sus golpes con la torre del Nexo casi caída y el rival defiende'],
  support: ['{jugador} falla el gancho decisivo y deja a su equipo sin iniciación', '{jugador} pierde la visión del Barón y el rival lo asegura sin oposición'],
};
// Frases propias de los 16 jugadores con rasgo (clave: nombre + año).
const OWN = {
  'Faker 2016': ['{jugador} hace una jugada imposible en la línea central y el rival no sabe qué pasó', '{jugador} dicta el ritmo de la partida como el mejor del mundo'],
  'Ruler 2017': ['{jugador} no deja de disparar en la pelea final y barre al equipo rival', '{jugador} se coloca perfecto y el rival no consigue tocarlo'],
  'Rookie 2018': ['{jugador} elimina a dos rivales de un solo combo y la partida gira', '{jugador} gana la línea central y rota a todas las peleas'],
  'Caps 2019': ['{jugador} se inventa un flanco imposible y deja al rival sin respuesta', '{jugador} hace una jugada arriesgada que sale perfecta'],
  'Tian 2019': ['{jugador} encuentra una patada perfecta y abre la pelea decisiva', '{jugador} aparece en todos los gankeos y el mapa es suyo'],
  'Deft 2022': ['{jugador} juega la partida de su vida y no quiere que el sueño termine', '{jugador} limpia la última pelea y su equipo cree en el milagro'],
  'Faker 2024': ['{jugador} encuentra la iniciación perfecta y su equipo arrasa', '{jugador} lee la pelea antes que nadie y la gana sin despeinarse'],
  'Gumayusi 2025': ['{jugador} sale vivo de una pelea imposible y gana la partida', '{jugador} remata a los rivales uno por uno en la pelea final'],
  'Uzi 2018': ['{jugador} queda aislado en la pelea del Barón y su equipo se derrumba', '{jugador} fuerza una pelea que no tocaba y su equipo la pierde'],
  'Chovy 2025': ['{jugador} no aparece en la pelea decisiva y el rival lo aprovecha', '{jugador} se queda atrás farmeando mientras su equipo pierde la pelea'],
  'Knight 2023': ['{jugador} lanza la definitiva al vacío y el rival gana la pelea', '{jugador} entra tarde a la pelea y su equipo ya no puede hacer nada'],
  'Faker 2017': ['{jugador} no encuentra la manera de abrir la partida y su equipo se queda sin ideas', '{jugador} cae primero en la pelea final y su equipo se queda sin daño'],
  'Deft 2015': ['{jugador} cae antes de poder hacer daño y la pelea se pierde', '{jugador} se queda sin flash en el peor momento'],
  'Score 2018': ['{jugador} pierde el Barón contra el castigo rival y la partida cambia de dueño', '{jugador} se mete en la jungla rival sin visión y lo atrapan'],
  'Ruler 2022': ['{jugador} se queda fuera de la pelea final y el rival lo aprovecha', '{jugador} falla en la pelea más importante del año'],
  'Canyon 2024': ['{jugador} pierde el duelo de castigos por el Barón', '{jugador} se adelanta solo y su equipo pierde el control del mapa'],
};

function fill(tpl, us, them) {
  const map = { top: 'top', jg: 'jungle', mid: 'mid', adc: 'bot', sup: 'support' };
  return tpl.replace(/\{(r_)?(top|jg|mid|adc|sup)\}/g, (_, rival, k) => {
    const team = rival ? them : us;
    return team.players.find((p) => p.role === map[k])?.name || '';
  });
}

function gameEvents(a, b, winner, swing, r) {
  const teams = { a, b };
  const other = (s) => (s === 'a' ? 'b' : 'a');
  const loser = other(winner);
  const ev = [];
  const add = (pool, side) => {
    const tpl = pick(pool, r);
    ev.push({ side, kind: 'normal', tpl, text: fill(tpl, teams[side], teams[other(side)]) });
  };
  add(EARLY, r() < 0.6 ? winner : loser);
  if (r() < 0.5) add(EARLY, r() < 0.5 ? winner : loser);
  add(MID, r() < 0.65 ? winner : loser);
  if (r() < 0.5) add(MID, winner);
  if (swing) {
    const { p } = swing;
    const own = OWN[`${p.name} ${p.year}`] || [];
    const pool = p.trait === 'clutch' ? [...CLUTCH_ANY, ...CLUTCH_ROLE[p.role], ...own, ...own] : [...CHOKE_ANY, ...CHOKE_ROLE[p.role], ...own, ...own];
    const tpl = pick(pool, r);
    ev.push({ side: winner, kind: p.trait, tpl, text: tpl.replace('{jugador}', p.name) });
  } else {
    add(LATE, winner);
  }
  ev.push({ side: winner, kind: 'end', tpl: END, text: END });
  return ev;
}

// Resultado de cada participante: hasta qué ronda llegó y cómo le fue en cada una.
export function journey(result, id) {
  const steps = [];
  for (const round of result.rounds) {
    const m = round.matches.find((x) => x.a.id === id || x.b.id === id);
    if (!m) break;
    const mine = m.a.id === id ? 'a' : 'b';
    const won = m.winner === mine;
    const [sa, sb] = m.score;
    steps.push({ round: round.name, won, score: mine === 'a' ? `${sa}-${sb}` : `${sb}-${sa}`, opponent: mine === 'a' ? m.b : m.a });
    if (!won) break;
  }
  const last = steps[steps.length - 1];
  const reached = last?.won && last.round === 'Final' ? 'Campeón' : last?.round;
  return { steps, reached };
}
