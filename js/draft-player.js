// Minirreproductor de Draft Worlds: los himnos de los Mundiales mientras juegas.
// Empieza al entrar en el modo (salvo que lo hayas pausado), pasa sola a la siguiente canción,
// se para durante la animación de CLUTCH y PECHO FRÍO (y luego sigue donde iba) y se calla al salir del modo.
// El volumen se elige con la barra del reproductor y se recuerda.
import { soundOn } from './draft-sound.js';

export const SONGS = [
  { title: 'Heavy Is The Crown', artist: 'Linkin Park', year: 2024, file: 'audio/himnos/heavy-is-the-crown.mp3' },
  { title: 'Burn It All Down', artist: 'PVRIS', year: 2021, file: 'audio/himnos/burn-it-all-down.mp3' },
  { title: 'Phoenix', artist: 'Cailin Russo y Chrissy Costanza', year: 2019, file: 'audio/himnos/phoenix.mp3' },
  { title: 'Legends Never Die', artist: 'Against The Current', year: 2017, file: 'audio/himnos/legends-never-die.mp3' },
  { title: 'Ignite', artist: 'Zedd', year: 2016, file: 'audio/himnos/ignite.mp3' },
];
const KEY = 'dw-player'; // { i, paused, vol } de esta persona en este navegador

let audio = null;
let index = 0;
let paused = false; // la persona lo pausó (se recuerda)
let level = null; // volumen elegido, de 0 a 1 (se recuerda)
let inMode = false; // estamos en Draft Worlds
let waiting = false; // el navegador no dejó sonar todavía: se espera al primer toque
let holdTimer = 0;
let held = false; // parada mientras suena la música de un CLUTCH o PECHO FRÍO
let fadeTimer = 0;
const listeners = new Set();

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  if (Number.isInteger(saved.i) && SONGS[saved.i]) index = saved.i;
  paused = !!saved.paused;
  if (typeof saved.vol === 'number' && saved.vol >= 0 && saved.vol <= 1) level = saved.vol;
} catch { /* sin almacenamiento */ }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ i: index, paused, vol: level })); } catch { /* sin almacenamiento */ } };
const notify = () => listeners.forEach((fn) => fn());
// En iPhone el volumen de un <audio> no se puede cambiar desde la página: ahí la canción pasa por Web Audio
// (una ganancia) en cuanto se elige un volumen que no es el máximo, y mientras tanto suena al volumen del teléfono.
const canVolume = (() => { try { const a = new Audio(); a.volume = 0.5; return a.volume === 0.5; } catch { return false; } })();
if (level == null) level = canVolume ? 0.5 : 1;
let ac = null;
let gain = null;
function route() {
  if (canVolume || gain || !audio) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ac = new AC();
    gain = ac.createGain();
    ac.createMediaElementSource(audio).connect(gain).connect(ac.destination);
  } catch { gain = null; }
}
function applyLevel() {
  if (canVolume) { if (audio && !held) audio.volume = level; return; }
  if (level < 1) route();
  if (gain) { gain.gain.value = level; ac.resume().catch(() => {}); }
}

function el() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  if (canVolume) audio.volume = level;
  audio.src = SONGS[index].file;
  audio.addEventListener('ended', () => next());
  for (const ev of ['play', 'pause', 'timeupdate', 'loadedmetadata']) audio.addEventListener(ev, notify);
  return audio;
}

function start() {
  const a = el();
  if (!inMode || paused || !soundOn() || held) return;
  if (!canVolume) applyLevel();
  a.play().then(() => { waiting = false; }).catch(() => { waiting = true; });
  media();
}

// Primer toque en la página: si el navegador no dejó sonar al entrar, ahora sí.
for (const ev of ['pointerdown', 'keydown']) {
  addEventListener(ev, () => {
    if (ac?.state === 'suspended') ac.resume().catch(() => {});
    if (waiting && inMode) start();
  }, { capture: true, passive: true });
}

export function enter() {
  if (inMode) return;
  inMode = true;
  start();
  notify();
}

export function leave() {
  if (!inMode) return;
  inMode = false;
  clearTimeout(holdTimer);
  held = false;
  audio?.pause();
  restoreVolume();
  notify();
}

export function toggle() {
  if (audio && !audio.paused) { paused = true; audio.pause(); } else { paused = false; held = false; restoreVolume(); start(); }
  save();
  notify();
}

function go(step) {
  index = (index + step + SONGS.length) % SONGS.length;
  const a = el();
  a.src = SONGS[index].file;
  save();
  if (!paused) start(); else media();
  notify();
}
export const next = () => go(1);
export const prev = () => go(-1);

// El botón de sonido de arriba lo apaga todo; al volver a encenderlo sigue la canción si no estaba pausada.
export function soundChanged() {
  if (!soundOn()) audio?.pause();
  else start();
  notify();
}

function fadeTo(v, ms) {
  clearInterval(fadeTimer);
  if (!audio) return;
  const from = audio.volume, t0 = performance.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    audio.volume = from + (v - from) * k;
    if (k === 1) clearInterval(fadeTimer);
  }, 40);
}

function restoreVolume() {
  clearInterval(fadeTimer);
  if (audio && canVolume) audio.volume = level;
}

export const volume = () => level;
export function setVolume(v) {
  level = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
  save();
  if (canVolume && !held) clearInterval(fadeTimer);
  applyLevel();
  notify();
}

// Mientras suena la música de CLUTCH o PECHO FRÍO, la canción se para (bajando un momento antes si se puede)
// y después sigue donde iba, subiendo poco a poco.
export function hold(ms) {
  if (!audio || (audio.paused && !held)) return;
  clearTimeout(holdTimer);
  if (!held) {
    held = true;
    if (canVolume) {
      fadeTo(0, 250);
      setTimeout(() => { if (held) audio.pause(); }, 260);
    } else audio.pause();
  }
  holdTimer = setTimeout(release, ms);
}

export function release() {
  clearTimeout(holdTimer);
  if (!held) return;
  held = false;
  if (canVolume) { clearInterval(fadeTimer); audio.volume = 0; fadeTo(level, 900); }
  start();
}

export function state() {
  const a = audio;
  return {
    song: SONGS[index],
    playing: !!a && !a.paused,
    progress: a && a.duration ? a.currentTime / a.duration : 0,
  };
}

export function onChange(fn) { listeners.add(fn); }

// Controles del sistema (pantalla de bloqueo, auriculares).
function media() {
  if (!('mediaSession' in navigator)) return;
  const s = SONGS[index];
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: `${s.artist} · Worlds ${s.year}`, album: 'Draft Worlds' });
    navigator.mediaSession.setActionHandler('play', () => { if (audio?.paused) toggle(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (audio && !audio.paused) toggle(); });
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('previoustrack', prev);
  } catch { /* navegador sin esos controles */ }
}
