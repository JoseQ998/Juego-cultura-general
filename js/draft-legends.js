// Equipo Leyendas de Draft Worlds: los amigos del grupo, cada uno con una habilidad especial.
// Sale en el draft de las salas normales y contra bots (nunca en la sala oficial ni lo eligen los bots).
// Las habilidades solo existen con las reglas 5 (ver simulateTournament en draft-engine.js).

export const LEGENDS_ID = 'leyendas';

export const LEGENDS = {
  id: LEGENDS_ID, year: 2026, name: 'Leyendas', tag: 'LEY', org: 'leyendas', region: 'Leyendas', place: null, logo: null,
  players: [
    { role: 'top', name: 'JoseQ998', rating: 87, photo: 'img/leyendas/joseq998.webp', power: 'admin' },
    { role: 'jungle', name: 'Elias', rating: 95, photo: 'img/leyendas/elias.webp', power: 'toxic' },
    { role: 'mid', name: 'J0hnN1', rating: 85, photo: 'img/leyendas/j0hnn1.webp' },
    { role: 'bot', name: 'Betancourt', rating: 82, photo: 'img/leyendas/betancourt.webp', power: 'coin' },
    { role: 'support', name: 'Pink Ward', rating: 40, photo: 'img/leyendas/ward.webp', power: 'ward' },
  ],
};

// Probabilidades de las habilidades
export const POWER = {
  wardIsWard: 0.05, // el Pink Ward es de verdad un ward (nota 10); si no, es la Neeko de Perejil (nota 90)
  neekoRating: 90,
  wardRating: 10,
  toxic: 0.30, // por partida: Elias la lía (mitad baneo, mitad apagón)
  botRating: 70, // el bot que sustituye a Elias
  coin: 0.30, // por partida: Betancourt la decide él solo (mitad gana, mitad pierde)
  give: 0.10, // por partida: /give de JoseQ998 (su equipo suma GIVE_BONUS en esa partida)
  giveBonus: 20,
  summon: 0.04, // por partida: JoseQ998 invoca a 5 leyendas y gana la partida 10 contra 5
  win: 0.008, // por partida (≈ 2 % por serie): /win, gana la serie
  afk: 0.02, // por partida (≈ 5 % por serie): se le apaga la laptop y pierde la serie
};

export const NEEKO = { name: 'Neeko de Perejil', photo: 'img/leyendas/neeko.webp' };
export const SUB_BOT = { name: 'Bot', photo: 'img/leyendas/bot.svg' };

// Mensajes ({victima} = un jugador del equipo rival al azar)
export const MSG = {
  neeko: ['¡El Pink Ward se transforma: era la Neeko de Perejil desde el principio!'],
  ward: ['El Pink Ward era… solo un Pink Ward. Su equipo juega con un ward de apoyo'],
  'admin-give': ['JoseQ998 abre la consola y usa /give: Barón, Dragón Ancestral, alma de dragón y 10.000 de oro para su equipo'],
  'admin-summon': ['JoseQ998 invoca a las leyendas: {lista} entran a la Grieta y terminan la partida en un 10 contra 5'],
  'admin-win': ['JoseQ998 escribe /win en la consola: su equipo gana la serie'],
  afk: ['A JoseQ998 se le apaga la laptop: se queda AFK y su equipo pierde la serie'],
  'toxic-ban': ['Elias insulta a {victima} y lo banean en plena partida: remake, y un bot ocupa su lugar el resto del torneo'],
  'toxic-luz': ['Elias toca un botón y deja sin luz a toda su urbanización: su equipo pierde la partida y entra un bot el resto de la serie'],
  'coin-win': [
    'Betancourt entra, mata a 4 y roba el Dragón Ancestral, dándole la partida a su equipo',
    'Betancourt hace un pentakill y acaba la partida',
    'Betancourt realiza una defensa magistral junto a sus supports mujeres y ganan la partida',
  ],
  'coin-lose': [
    'Betancourt persiguió a {victima}, que se fue con poca vida, y por muerto de hambre perdieron la partida',
    'Betancourt se lanzó 1 contra 5 y se suicidó: perdieron la partida',
    'Betancourt vio que había un Nautilus en el otro equipo: perdieron la partida',
  ],
  forfeitWin: 'JoseQ998 sigue con el /win: partida ganada sin jugar',
  forfeitAfk: 'JoseQ998 sigue sin conexión: partida perdida por AFK',
};

// Cómo se ve cada habilidad en la animación: tono (clutch = dorado, choke = hielo y se rompe), sello y cinta.
export const FX = {
  neeko: { tone: 'clutch', stamp: 'Sorpresa', kicker: 'Habilidad especial', ribbon: 'Era la Neeko de Perejil' },
  ward: { tone: 'choke', stamp: 'Solo un ward', kicker: 'Habilidad especial', ribbon: 'Solo da visión' },
  'admin-give': { tone: 'clutch', stamp: 'Admin', kicker: 'Poder de administrador', ribbon: '/give' },
  'admin-summon': { tone: 'clutch', stamp: 'Admin', kicker: 'Poder de administrador', ribbon: '10 contra 5' },
  'admin-win': { tone: 'clutch', stamp: 'Admin', kicker: 'Poder de administrador', ribbon: '/win: gana la serie' },
  afk: { tone: 'choke', stamp: 'AFK', kicker: 'Desconectado', ribbon: 'Pierden la serie' },
  'toxic-ban': { tone: 'choke', stamp: 'Baneado', kicker: 'Tóxico', ribbon: 'Remake' },
  'toxic-luz': { tone: 'choke', stamp: 'Sin luz', kicker: 'Tóxico', ribbon: 'Pierden la partida' },
  'coin-win': { tone: 'clutch', stamp: 'Héroe', kicker: 'O la gana solo…', ribbon: 'La gana él solo' },
  'coin-lose': { tone: 'choke', stamp: 'Villano', kicker: '…o la pierde solo', ribbon: 'La pierde él solo' },
};
