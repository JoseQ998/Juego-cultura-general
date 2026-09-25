// ================== CONFIGURACIÓN ==================
// Puedes editar este archivo directamente desde GitHub (icono del lápiz).

export const CONFIG = {
  // Pega aquí la configuración de tu proyecto de Firebase para que el ranking
  // y el registro sean COMPARTIDOS entre todos los jugadores (ver README.md).
  // Si lo dejas en null, el juego funciona en "modo local": el ranking y el
  // registro solo se guardan en el navegador de cada dispositivo.
  //
  // Ejemplo:
  // firebase: {
  //   apiKey: "AIza...",
  //   authDomain: "mi-juego.firebaseapp.com",
  //   projectId: "mi-juego",
  //   storageBucket: "mi-juego.appspot.com",
  //   messagingSenderId: "123456789",
  //   appId: "1:123456789:web:abc123"
  // },
  firebase: null,

  // PIN para entrar a la página de Registro (log). ¡Cámbialo!
  // Ojo: es una protección básica, cualquiera que lea el código puede verlo.
  ADMIN_PIN: '1234',

  // A partir de cuántos nombres distintos desde un mismo dispositivo/IP
  // se marca como "sospechoso" en el registro.
  SUSPICIOUS_NAMES: 3,

  // Guardar la IP pública del jugador en el registro (usa api.ipify.org).
  LOG_IP: true,
};
