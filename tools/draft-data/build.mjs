// Calcula las notas de cada jugador-temporada y genera js/draft-data.js
// Uso: node tools/draft-data/build.mjs [--report]  (los datos en bruto están en esta carpeta)
import fs from 'node:fs';
import crypto from 'node:crypto';
const DIR = new URL('.', import.meta.url).pathname;
const OUT = new URL('../../js/draft-data.js', import.meta.url).pathname;

// ---------- equipos: organización (para "misma organización"), región y siglas ----------
const TEAMS = {
  'Afreeca Freecs': ['afreeca', 'LCK', 'AF'],
  'Albus NoX Luna': ['anx', 'CIS', 'ANX'],
  'Anyone\'s Legend': ['al', 'LPL', 'AL'],
  'Azubu Frost': ['frost', 'LCK', 'FRST'],
  'Bilibili Gaming': ['blg', 'LPL', 'BLG'],
  'CTBC Flying Oyster': ['cfo', 'PCS', 'CFO'],
  'Cloud9': ['c9', 'LCS', 'C9'],
  'Counter Logic Gaming': ['clg', 'LCS', 'CLG'],
  'Counter Logic Gaming Europe': ['clgeu', 'LEC', 'CLG.EU'],
  'DAMWON Gaming': ['dk', 'LCK', 'DWG'],
  'DWG KIA': ['dk', 'LCK', 'DK'],
  'DRX': ['drx', 'LCK', 'DRX'],
  'EDward Gaming': ['edg', 'LPL', 'EDG'],
  'Epik Gamer': ['epik', 'LCS', 'EPIK'],
  'Flash Wolves': ['fw', 'LMS', 'FW'],
  'FlyQuest': ['fly', 'LCS', 'FLY'],
  'Fnatic': ['fnc', 'LEC', 'FNC'],
  'FunPlus Phoenix': ['fpx', 'LPL', 'FPX'],
  'G2 Esports': ['g2', 'LEC', 'G2'],
  'Gambit Gaming': ['gambit', 'LEC', 'GMB'],
  'Moscow Five': ['gambit', 'LEC', 'M5'],
  'Gen.G': ['samsung', 'LCK', 'GEN'],
  'Samsung Blue': ['samsung', 'LCK', 'SSB'],
  'Samsung White': ['samsung', 'LCK', 'SSW'],
  'Samsung Ozone': ['samsung', 'LCK', 'SSO'],
  'Samsung Galaxy': ['samsung', 'LCK', 'SSG'],
  'Griffin': ['griffin', 'LCK', 'GRF'],
  'H2k-Gaming': ['h2k', 'LEC', 'H2K'],
  'Hanwha Life Esports': ['hle', 'LCK', 'HLE'],
  'Invictus Gaming': ['ig', 'LPL', 'IG'],
  'JD Gaming': ['jdg', 'LPL', 'JDG'],
  'KOO Tigers': ['tigers', 'LCK', 'KOO'],
  'ROX Tigers': ['tigers', 'LCK', 'ROX'],
  'KT Rolster': ['kt', 'LCK', 'KT'],
  'LNG Esports': ['lng', 'LPL', 'LNG'],
  'Longzhu Gaming': ['drx', 'LCK', 'LZ'],
  'MAD Lions': ['mad', 'LEC', 'MAD'],
  'Misfits Gaming': ['msf', 'LEC', 'MSF'],
  'NRG': ['nrg', 'LCS', 'NRG'],
  'NaJin Sword': ['najin', 'LCK', 'NJS'],
  'NaJin Black Sword': ['najin', 'LCK', 'NJBS'],
  'NaJin White Shield': ['najin', 'LCK', 'NJWS'],
  'OMG': ['omg', 'LPL', 'OMG'],
  'Origen': ['og', 'LEC', 'OG'],
  'Rogue': ['rogue', 'LEC', 'RGE'],
  'Royal Club': ['rng', 'LPL', 'RC'],
  'Star Horn Royal Club': ['rng', 'LPL', 'SHRC'],
  'Royal Never Give Up': ['rng', 'LPL', 'RNG'],
  'SK Telecom T1': ['t1', 'LCK', 'SKT'],
  'T1': ['t1', 'LCK', 'T1'],
  'Splyce': ['spy', 'LEC', 'SPY'],
  'Suning': ['sn', 'LPL', 'SN'],
  'TSM': ['tsm', 'LCS', 'TSM'],
  'Taipei Assassins': ['tpa', 'LMS', 'TPA'],
  'Team Pacific': ['pacific', 'SEA', 'TP'],
  'Team WE': ['we', 'LPL', 'WE'],
  'Team gamed!de': ['gamed', 'LEC', 'GDE'],
  'Top Esports': ['tes', 'LPL', 'TES'],
  'Weibo Gaming': ['wbg', 'LPL', 'WBG'],
  'Xan': ['xan', 'SEA', 'XAN'],
  'against All authority': ['aaa', 'LEC', 'aAa'],
  'ahq e-Sports Club': ['ahq', 'LMS', 'AHQ'],
};

// MVP de la final de cada Worlds (Riot lo entrega oficialmente desde 2014)
const FINALS_MVP = {
  2014: 'Mata', 2015: 'MaRin', 2016: 'Faker', 2017: 'Ruler', 2018: 'Ning', 2019: 'Tian', 2020: 'Canyon',
  2021: 'Scout', 2022: 'Kingen', 2023: 'Zeus', 2024: 'Faker', 2025: 'Gumayusi',
};
const CLUTCH = ['Faker 2016', 'Ruler 2017', 'Rookie 2018', 'Caps 2019', 'Tian 2019', 'Deft 2022', 'Faker 2024', 'Gumayusi 2025'];
const CHOKE = ['Uzi 2018', 'Chovy 2025', 'Knight 2023', 'Faker 2017', 'Deft 2015', 'Score 2018', 'Ruler 2022', 'Canyon 2024'];
const BASE = { 1: 80, 2: 72, 3: 64, 5: 56 };
const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];

// ---------- lectura ----------
const rows = [];
for (const f of fs.readdirSync(DIR).filter((f) => /^\d{4}\.txt$/.test(f)).sort()) {
  for (const line of fs.readFileSync(DIR + f, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const c = line.split('|');
    const n = (i) => (c[i] === '' || c[i] === undefined ? null : Number(c[i]));
    rows.push({
      year: +c[0], team: c[1], place: +c[2], role: c[3], name: c[4],
      g: n(5), k: n(6), d: n(7), a: n(8), kda: n(9), csm: n(10), gm: n(11), kp: n(12), ks: n(13), gs: n(14),
    });
  }
}
const titles = new Map();
if (fs.existsSync(DIR + 'titles.txt')) {
  for (const line of fs.readFileSync(DIR + 'titles.txt', 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const [y, team, list = ''] = line.split('|');
    titles.set(`${y}|${team}`, list.split(',').map((t) => t.trim().replace(/\?$/, '')).filter(Boolean));
  }
}
// Logos y fotos (nombres de archivo de Leaguepedia)
const readPairs = (f, keyFn) => {
  const m = new Map();
  if (!fs.existsSync(DIR + f)) return m;
  for (const line of fs.readFileSync(DIR + f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const c = line.split('|');
    const [k, v] = keyFn(c);
    if (v) m.set(k, v);
  }
  return m;
};
const logos = readPairs('logos.txt', (c) => [c[0], c[1]]);
const photos = readPairs('photos.txt', (c) => [`${c[0]}|${c[1]}|${c[2]}`, c[3]]);
const missingTeams = [...new Set(rows.map((r) => r.team))].filter((t) => !TEAMS[t]);
if (missingTeams.length) console.warn('FALTAN EQUIPOS EN TEAMS:', missingTeams);

// ---------- rendimiento: comparación con su misma posición y año ----------
const z = (vals) => {
  const ok = vals.filter((v) => v != null);
  const m = ok.reduce((s, v) => s + v, 0) / ok.length;
  const sd = Math.sqrt(ok.reduce((s, v) => s + (v - m) ** 2, 0) / ok.length) || 1;
  return vals.map((v) => (v == null ? 0 : (v - m) / sd));
};
for (const y of new Set(rows.map((r) => r.year))) {
  for (const role of ROLES) {
    const g = rows.filter((r) => r.year === y && r.role === role);
    const kda = z(g.map((r) => Math.log(r.kda + 0.5)));
    const hasKp = g.every((r) => r.kp != null);
    const kp = z(g.map((r) => (hasKp ? r.kp : r.k + r.a)));
    const share = z(g.map((r) => (r.gs != null ? r.gs : r.csm)));
    g.forEach((r, i) => {
      const comp = role === 'support' ? 0.6 * kda[i] + 0.4 * kp[i] : 0.5 * kda[i] + 0.3 * kp[i] + 0.2 * share[i];
      r.perf = Math.max(-15, Math.min(10, Math.round(comp * 6)));
    });
  }
}

// ---------- nota final ----------
for (const r of rows) {
  const t = titles.get(`${r.year}|${r.team}`) || [];
  r.titles = t;
  r.mvp = (FINALS_MVP[r.year] || '').toLowerCase() === r.name.toLowerCase();
  const msi = t.filter((x) => /^MSI$/i.test(x)).length;
  const leagues = t.length - msi;
  r.parts = { base: BASE[r.place], mvp: r.mvp ? 6 : 0, msi: msi * 3, leagues: leagues * 3, perf: r.perf };
  r.rating = Math.max(40, Math.min(99, Object.values(r.parts).reduce((s, v) => s + v, 0)));
  const key = `${r.name} ${r.year}`.toLowerCase();
  const has = (list) => list.some((k) => k.toLowerCase() === key);
  r.trait = has(CLUTCH) ? 'clutch' : has(CHOKE) ? 'choke' : null;
}
const keyOf = (s) => s.toLowerCase();
for (const k of [...CLUTCH, ...CHOKE]) {
  if (!rows.some((r) => keyOf(`${r.name} ${r.year}`) === keyOf(k))) console.warn('RASGO SIN JUGADOR:', k);
}

// ---------- salida ----------
// Ruta del archivo en el servidor de imágenes de Leaguepedia (carpetas por el md5 del nombre, como en MediaWiki).
// Se enlaza directamente porque Special:FilePath pasa por una redirección que Cloudflare puede bloquear.
function filePath(name) {
  let n = name.replace(/ /g, '_');
  n = n[0].toUpperCase() + n.slice(1);
  const h = crypto.createHash('md5').update(n).digest('hex');
  return `${h[0]}/${h.slice(0, 2)}/${n}`;
}
const teams = [];
for (const r of rows) {
  const id = `${r.year}-${(TEAMS[r.team]?.[2] || r.team).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  let t = teams.find((x) => x.id === id);
  if (!t) {
    const [org, region, tag] = TEAMS[r.team] || [r.team, '?', r.team];
    t = { id, year: r.year, name: r.team, tag, org, region, place: r.place, ...(logos.get(r.team) ? { logo: filePath(logos.get(r.team)) } : {}), players: [] };
    teams.push(t);
  }
  const photo = photos.get(`${r.year}|${r.team}|${r.name}`);
  t.players.push({ role: r.role, name: r.name, rating: r.rating, ...(photo ? { photo: filePath(photo) } : {}), ...(r.trait ? { trait: r.trait } : {}), ...(r.mvp ? { mvp: true } : {}) });
}
if (process.argv.includes('--report')) {
  for (const r of rows) console.log(`${r.year} ${r.team.padEnd(26)} ${r.role.padEnd(8)} ${r.name.padEnd(13)} ${String(r.rating).padStart(2)}  ${JSON.stringify(r.parts)} ${r.titles.join(',')}${r.trait ? ' [' + r.trait + ']' : ''}`);
}
const header = `// Datos del modo Draft Worlds: equipos que llegaron a cuartos de cada Worlds (2011-2025).
// Generado a partir de las estadísticas de Leaguepedia. Nota de cada jugador (40-99):
// base por ronda (campeón 80, finalista 72, semifinal 64, cuartos 56) + MVP de la final 6
// + MSI 3 + cada título de liga ese año 3 + rendimiento en ese Worlds (-15 a +10).
// place: 1 campeón, 2 finalista, 3 semifinal, 5 cuartos.
// logo y photo son rutas de archivos de Leaguepedia: https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/<ruta>
`;
fs.writeFileSync(OUT, header + 'export const DRAFT_TEAMS = ' + JSON.stringify(teams, null, 0).replace(/\},\{"id"/g, '},\n{"id"') + ';\n');
console.log('equipos:', teams.length, 'jugadores:', rows.length, '->', OUT);
