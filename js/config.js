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

  // Donaciones por Binance Pay.
  //   binanceUser: tu nombre de usuario de Binance (se muestra en la página).
  //   binanceId:   tu Binance ID (número que aparece en tu perfil de Binance). Binance Pay
  //                solo permite enviar dinero al Binance ID, correo o teléfono, no al usuario,
  //                así que conviene rellenarlo. Si lo dejas vacío, no se muestra.
  DONATION: {
    binanceUser: 'JoseQ998',
    binanceId: '',
  },

  // PIN del Registro SOLO para el modo local.
  // Con Supabase, el PIN se configura en Supabase (supabase/setup.sql) y no aparece en el código.
  ADMIN_PIN: '1234',

  // A partir de cuántos nombres distintos desde un mismo dispositivo o navegador
  // se marca como "sospechoso" en el registro.
  SUSPICIOUS_NAMES: 3,
};
