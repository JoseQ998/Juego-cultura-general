// Semana especial de broma: antes del reto de verdad salen 10 preguntas "de Nintendo" que no cuentan para nada.
// Solo en la semana PRANK.week (la que empieza el sábado 7 de noviembre de 2026 a las 8pm de Venezuela).
// Primera opción = respuesta correcta (como en questions.js).

export const PRANK = {
  week: 2965,
  category: { id: 'nintendo', name: 'Nintendo' },
  questions: [
    ['¿Cómo se llama el hermano de Mario?', 'Luigi', 'Wario', 'Toad', 'Yoshi'],
    ['¿A qué princesa rescata Link en The Legend of Zelda?', 'Zelda', 'Peach', 'Daisy', 'Rosalina'],
    ['¿De qué color es Kirby?', 'Rosa', 'Amarillo', 'Azul', 'Verde'],
    ['¿En qué año salió la Nintendo Switch?', '2017', '2015', '2016', '2019'],
    ['¿Cómo se llama el villano principal de Super Mario?', 'Bowser', 'Ganondorf', 'King K. Rool', 'Ridley'],
    ['¿Cuál es el Pokémon número 1 de la Pokédex nacional?', 'Bulbasaur', 'Pikachu', 'Mew', 'Arceus'],
    ['¿Qué consola de Nintendo, lanzada en 2012, fue un fracaso de ventas?', 'Wii U', 'Wii', 'GameCube', 'Nintendo 3DS'],
    ['¿Cómo se llama la protagonista de Metroid?', 'Samus Aran', 'Palutena', 'Zelda', 'Ridley'],
    ['¿En qué juego aparece la frase «¡Es peligroso ir solo! Toma esto»?', 'The Legend of Zelda', 'Super Mario Bros.', 'Metroid', 'Kid Icarus'],
    ['¿Cuánto cuesta un juego de Nintendo cinco años después de salir?', 'Lo mismo que el día que salió', 'La mitad', 'Está en oferta a 5 dólares', 'Lo regalan'],
  ].map(([text, ...options], i) => ({ id: `broma-${i + 1}`, cat: 'nintendo', text, options })),
};

const KEY = 'cg_broma';
export function prankPending(weekId) {
  if (weekId !== PRANK.week) return false;
  try { return localStorage.getItem(KEY) !== String(weekId); } catch { return true; }
}
export function prankDone(weekId) {
  try { localStorage.setItem(KEY, String(weekId)); } catch {}
}
