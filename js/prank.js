// Semana especial de broma: antes del reto de verdad salen 10 preguntas "de Nintendo" que no cuentan para nada.
// Solo en la semana PRANK.week (del sábado 7 de noviembre de 2026 a las 8pm de Venezuela al sábado 14).
// Primera opción = respuesta correcta (como en questions.js). Una opción puede ser una imagen ({ img }) y la
// pregunta puede llevar su propia imagen ({ text, img }). Imágenes: renders de Smash Bros. Ultimate y wikis de
// Fandom, y emojis 3D de Microsoft (Fluent Emoji, licencia MIT).

export const PRANK = {
  week: 2966,
  category: { id: 'nintendo', name: 'Nintendo' },
  questions: [
    // Las dos primeras son normales, para que se confíe
    ['¿Cómo se llama el hermano de Mario?', 'Luigi', 'Wario', 'Toad', 'Yoshi'],
    [{ text: '¿Cómo se llama esto?', img: 'img/broma/nunchuk.webp' }, 'Nunchuk', 'Wiimote', 'Joy-Con', 'Wii Zapper'],
    ['¿De qué color es Kirby?', 'Rosa', 'Amarillo', 'Azul', 'Verde'],
    ['¿Cuál es más rápida?', { img: 'img/broma/calculadora.webp' }, { img: 'img/broma/switch-cuadrada.webp' }, { img: 'img/broma/wiiu.webp' }, { img: 'img/broma/gamecube.webp' }],
    ['¿Cuál de estos es un robo a mano armada?', { img: 'img/broma/eshop.webp' }, { img: 'img/broma/ladron.webp' }, { img: 'img/broma/pirata.webp' }, { img: 'img/broma/mapache.webp' }],
    // La "correcta" es Link
    ['¿Quién es Zelda?', { img: 'img/broma/link.webp' }, { img: 'img/broma/sonic.webp' }, { img: 'img/broma/pacman.webp' }, { img: 'img/broma/steve.webp' }],
    ['¿Quién es el personaje más lento?', { img: 'img/broma/sonic.webp' }, { img: 'img/broma/tortuga.webp' }, { img: 'img/broma/piedra.webp' }, { img: 'img/broma/mcqueen.webp' }],
    ['¿Cuál tiene peores gráficos?', 'Pokémon Escarlata', 'Un juego de PS1', 'Un dibujo de un niño de 5 años', 'POV de Perejil'],
    [{ text: '¿Qué es esto?', img: 'img/broma/switch.webp' }, 'Un pisapapeles caro', 'Una consola', 'Una tablet', 'Un juguete para niños'],
    ['¿Cuánto cuesta un juego de Nintendo cinco años después de salir?', 'Lo mismo que el día que salió', 'La mitad', 'Está en oferta a 5 dólares', 'Lo regalan'],
  ].map(([t, ...options], i) => ({ id: `broma-${i + 1}`, cat: 'nintendo', text: t.text ?? t, img: t.img, options })),
};

const KEY = 'cg_broma';
export function prankPending(weekId) {
  if (weekId !== PRANK.week) return false;
  try { return localStorage.getItem(KEY) !== String(weekId); } catch { return true; }
}
export function prankDone(weekId) {
  try { localStorage.setItem(KEY, String(weekId)); } catch {}
}
