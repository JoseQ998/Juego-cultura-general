// ================== CONFIGURACIÓN ==================
// Puedes editar este archivo directamente desde GitHub (icono del lápiz).

export const CONFIG = {
  // Datos de tu proyecto de Supabase para que el ranking y el registro sean
  // COMPARTIDOS entre todos los jugadores (ver README.md).
  // Los encuentras en Supabase → botón "Connect" (o Project Settings → API Keys):
  //   url: "Project URL"      (https://xxxxxxxx.supabase.co)
  //   key: "Publishable key"  (sb_publishable_...)  o la "anon key" antigua (eyJ...)
  // NUNCA pongas aquí la "secret key" ni la "service_role key".
  //
  // Si los dejas vacíos, el juego funciona en "modo local": el ranking y el
  // registro solo se guardan en el navegador de cada dispositivo.
  supabase: {
    url: 'https://antbxtpogiecbjndsfop.supabase.co',
    key: 'sb_publishable_1bpDx145jTUvQUMsktj6Hw_HK-J-aLo',
  },

  // Dominio para los correos internos de las cuentas (usuario@dominio). Nunca se envían
  // correos: solo hace falta que el dominio exista. Es el de la página en GitHub Pages.
  ACCOUNT_EMAIL_DOMAIN: 'joseq998.github.io',

  // Donaciones por Binance Pay: tu Binance ID (el número de tu perfil de Binance).
  // Solo sirve para recibir. No pongas aquí tu correo ni tu teléfono.
  // Si lo dejas vacío, la tarjeta de donación no se muestra.
  DONATION: {
    binanceId: '217244021',
  },

  // PIN del Registro SOLO para el modo local (sin Supabase).
  // Con Supabase no hay PIN: el registro solo lo ve la cuenta de administrador.
  ADMIN_PIN: '1234',

  // A partir de cuántos nombres distintos desde un mismo dispositivo o navegador
  // se marca como "sospechoso" en el registro.
  SUSPICIOUS_NAMES: 3,
};
