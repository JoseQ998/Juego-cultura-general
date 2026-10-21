// Genera con Gemini las ilustraciones de los jugadores CLUTCH y PECHO FRÍO de Draft Worlds:
// cada jugador pintado como su campeón, a partir de su foto oficial de Leaguepedia.
// Necesita la variable de entorno GEMINI_API_KEY (clave de Google AI Studio).
//
//   node tools/ilustraciones/gemini.mjs faker-2017     una
//   node tools/ilustraciones/gemini.mjs todos          las que aún no existan
//
// Las imágenes se guardan en img/ilustraciones/<id>.png. Ver tools/ilustraciones/PLAN.md.
import fs from 'node:fs';
import path from 'node:path';
import { PLAYER_BY_KEY } from '../../js/draft-engine.js';

const KEY = process.env.GEMINI_API_KEY;
const API = 'https://generativelanguage.googleapis.com/v1beta';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '../../img/ilustraciones');

// id -> jugador del draft, campeón y cómo se ve ese campeón (para el texto que se le pide a Gemini)
export const ILUSTRACIONES = {
  'faker-2016': { key: '2016-skt:mid', champ: 'Orianna', look: "Orianna's golden clockwork Ball floating at his side and brass clockwork armor" },
  'ruler-2017': { key: '2017-ssg:bot', champ: 'Varus', look: "Varus' corrupted bow with glowing pink-purple energy and dark armor with glowing veins" },
  'rookie-2018': { key: '2018-ig:mid', champ: 'LeBlanc', look: "LeBlanc's violet and gold sorceress robes, magic chains and illusion mirror images" },
  'caps-2019': { key: '2019-g2:mid', champ: 'Ryze', look: "Ryze's glowing blue arcane runes orbiting him and the rune scroll on his back" },
  'tian-2019': { key: '2019-fpx:jungle', champ: 'Lee Sin', look: "Lee Sin's monk hand wraps and a golden dragon of energy coiling around him" },
  'deft-2022': { key: '2022-drx:bot', champ: 'Miss Fortune', look: "Miss Fortune's twin pirate pistols, long captain coat and flying bullets" },
  'faker-2024': { key: '2024-t1:mid', champ: 'Azir', look: "Azir's golden Shuriman emperor armor, falcon helmet and sand soldiers rising behind him" },
  'gumayusi-2025': { key: '2025-t1:bot', champ: 'Varus', look: "Varus' corrupted bow with glowing pink-purple energy and dark armor with glowing veins" },
  'deft-2015': { key: '2015-edg:bot', champ: 'Kalista', look: "Kalista's spectral spears and a ghostly cyan shroud" },
  'faker-2017': { key: '2017-skt:mid', champ: 'Galio', look: "a stone and gold gargoyle armor inspired by Galio and huge stone wings behind him" },
  'uzi-2018': { key: '2018-rng:bot', champ: 'Vayne', look: "Vayne's dark hunter coat, sunglasses and silver crossbow bolts" },
  'score-2018': { key: '2018-kt:jungle', champ: 'Xin Zhao', look: "Xin Zhao's Demacian spear and blue-gold armor" },
  'ruler-2022': { key: '2022-gen:bot', champ: 'Lucian', look: "Lucian's twin relic pistols shooting beams of white light" },
  'knight-2023': { key: '2023-jdg:mid', champ: 'Ahri', look: "Ahri's nine glowing fox tails and spirit orb" },
  'canyon-2024': { key: '2024-gen:jungle', champ: 'Nocturne', look: "Nocturne's shadow blades and nightmare darkness swirling around him" },
  'chovy-2025': { key: '2025-gen:mid', champ: 'Orianna', look: "Orianna's golden clockwork Ball floating at his side and brass clockwork armor" },
};

const photoUrl = (p) => `https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/${p.split('/').map(encodeURIComponent).join('/')}`;

function prompt(p, it) {
  const light = p.trait === 'clutch'
    ? 'warm golden light, golden sparks and embers, triumphant mood'
    : 'cold icy blue light, frost on his clothes, snow and ice crystals, tense mood';
  return [
    `Painted digital illustration in the style of League of Legends splash art.`,
    `The man in the attached photo is the esports player ${p.name}. Keep his face, hairstyle and glasses exactly like in the photo so he is clearly recognizable.`,
    `He is portrayed as the champion ${it.champ}: ${it.look}, worn over his ${p.team} ${p.year} team jersey.`,
    `Waist-up, confident heroic pose, ${light}, dramatic lighting, dark background, square 1:1 format, no text, no letters, no logos.`,
  ].join(' ');
}

async function pickModel() {
  const r = await fetch(`${API}/models?key=${KEY}&pageSize=200`);
  if (!r.ok) throw new Error(`No se pudo listar los modelos: ${r.status} ${await r.text()}`);
  const { models = [] } = await r.json();
  const ok = models.filter((m) => /image/.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent'));
  const pref = ok.find((m) => /pro-image/.test(m.name)) || ok.find((m) => /flash-image/.test(m.name)) || ok[0];
  if (!pref) throw new Error('Esta clave no tiene ningún modelo de Gemini que genere imágenes.');
  return pref.name; // "models/..."
}

async function generate(model, id) {
  const it = ILUSTRACIONES[id];
  const p = PLAYER_BY_KEY[it.key];
  if (!p || !it.champ) { console.log(`${id}: falta el campeón o el jugador, se salta`); return; }
  const ph = await fetch(photoUrl(p.photo));
  if (!ph.ok) throw new Error(`${id}: no se pudo bajar la foto (${ph.status})`);
  const mime = (ph.headers.get('content-type') || 'image/png').split(';')[0];
  const data = Buffer.from(await ph.arrayBuffer()).toString('base64');
  const body = {
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data } }, { text: prompt(p, it) }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1' } },
  };
  const r = await fetch(`${API}/${model}:generateContent?key=${KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${id}: ${r.status} ${JSON.stringify(j.error || j)}`);
  const parts = j.candidates?.[0]?.content?.parts || [];
  const img = parts.find((x) => x.inlineData?.data);
  if (!img) { console.log(`${id}: Gemini no devolvió imagen. ${parts.map((x) => x.text).filter(Boolean).join(' ') || JSON.stringify(j.promptFeedback || j.candidates?.[0]?.finishReason || '')}`); return; }
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${id}.png`);
  fs.writeFileSync(file, Buffer.from(img.inlineData.data, 'base64'));
  console.log(`${id}: ${file}`);
}

if (!KEY) { console.error('Falta GEMINI_API_KEY (ver tools/ilustraciones/PLAN.md).'); process.exit(1); }
const arg = process.argv[2];
const ids = arg === 'todos' ? Object.keys(ILUSTRACIONES).filter((id) => !fs.existsSync(path.join(OUT, `${id}.png`))) : [arg];
if (!ids[0] || !ILUSTRACIONES[ids[0]]) { console.error(`Uso: node tools/ilustraciones/gemini.mjs <${Object.keys(ILUSTRACIONES).join('|')}|todos>`); process.exit(1); }
const model = await pickModel();
console.log('Modelo:', model);
for (const id of ids) await generate(model, id);
