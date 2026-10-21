// Música de los momentos CLUTCH y PECHO FRÍO de Draft Worlds.
// Los archivos van en audio/, ya recortados al trozo que debe sonar (13 s), y se apuntan aquí.
// Un momento sin archivo no suena; si no hay ninguno, no sale el botón de sonido.
import { hold, release } from './draft-player.js';

const FILES = {
  clutch: 'audio/clutch.mp3', // Legends Never Die (Worlds 2017) desde el 0:59: explota a los 3,3 s, con "Decide la partida"
  choke: 'audio/pecho-frio.mp3', // efectos de caricaturas antiguas, desde el principio
};
const KEY = 'dw-sound';
const VOLUME = 0.8;

let ac = null; // AudioContext: se crea con el primer toque, porque los navegadores no dejan sonar antes
const buffers = {}; // tipo -> Promise<AudioBuffer | null>
let current = null; // { src, gain }
let seq = 0; // cada nueva orden invalida a las que aún estaban cargando

export function soundOn() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function setSound(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* sin almacenamiento: solo esta vez */ }
  if (!on) stopMusic();
}

// ¿Hay alguna música? (para enseñar el botón de sonido o no)
export const hasMusic = () => Object.keys(FILES).length > 0;

// Crea el AudioContext (o lo reanuda si el navegador lo paró: suspendido, interrumpido en iPhone, pestaña en segundo
// plano). Funciona tras cualquier toque en la página, también si fue antes de entrar en Draft Worlds.
function wake() {
  if (!hasMusic() || !document.body.classList.contains('dw')) return;
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
  }
  if (ac.state !== 'running') ac.resume().catch(() => {});
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, wake, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
const running = () => new Promise((res) => {
  if (ac.state === 'running') return res(true);
  ac.resume().catch(() => {});
  setTimeout(() => res(ac.state === 'running'), 400);
});
// En iPhone, que suene aunque el teléfono esté en silencio, como un vídeo (Safari 16.4 o más nuevo).
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* no disponible */ }

function load(kind) {
  if (!ac || !FILES[kind]) return Promise.resolve(null);
  buffers[kind] ||= fetch(FILES[kind])
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((data) => data && new Promise((res, rej) => ac.decodeAudioData(data, res, rej)))
    .catch(() => null);
  return buffers[kind];
}

// Deja la música cargada antes de que haga falta.
export function preloadMusic() {
  if (!soundOn()) return;
  wake();
  Object.keys(FILES).forEach(load);
}

// Suena la música de ese momento desde atMs (por si se llega a mitad) hasta totalMs, con entrada y salida suaves.
// El punto de la canción se calcula al empezar a sonar, así que si tarda en cargar sigue cuadrando con la animación,
// y se adelanta lo que tarda el altavoz del aparato en sacar el sonido (outputLatency).
// Los himnos del reproductor solo se paran si esta música llega a sonar; si no puede (sin cargar, o el navegador no
// deja sonar todavía), los himnos siguen.
export async function playMusic(kind, atMs, totalMs) {
  const my = ++seq;
  if (!soundOn()) return;
  wake();
  if (!ac) return;
  const t0 = performance.now() - atMs; // cuándo empezó la animación
  const buf = await load(kind);
  if (my !== seq || !buf || !(await running()) || my !== seq) return;
  stopMusic(false);
  const lat = ac.outputLatency || ac.baseLatency || 0;
  const off = (performance.now() - t0) / 1000 + lat;
  const left = Math.min(totalMs / 1000, buf.duration) - off;
  if (left < 0.5) return;
  hold(totalMs - (performance.now() - t0));
  const src = ac.createBufferSource();
  const gain = ac.createGain();
  src.buffer = buf;
  src.connect(gain).connect(ac.destination);
  const now = ac.currentTime;
  const fade = Math.min(1.5, left / 3);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(VOLUME, now + 0.25);
  gain.gain.setValueAtTime(VOLUME, now + left - fade);
  gain.gain.linearRampToValueAtTime(0, now + left);
  src.start(now, off);
  src.stop(now + left + 0.05);
  current = { src, gain };
}

export function stopMusic(cancelLoading = true) {
  if (cancelLoading) { seq++; release(); }
  if (!current || !ac) return;
  const { src, gain } = current;
  current = null;
  const now = ac.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.3);
  try { src.stop(now + 0.35); } catch { /* ya parada */ }
}
