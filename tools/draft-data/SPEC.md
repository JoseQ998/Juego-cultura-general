# Modo Draft Worlds: especificación acordada con el dueño del juego

Todo lo de este archivo ya está decidido. Los datos están en `js/draft-data.js` (generado por `build.mjs`)
y los mensajes de la simulación en `mensajes.md` (aprobados; quitar la palabra "borrador" al usarlos).

## 1. Draft (cada participante arma su equipo)

- 5 rondas. En cada ronda salen **3 equipos-año al azar** (cada participante ve opciones distintas).
- Eliges un equipo y luego **un jugador** de ese equipo. Ocupa su posición (top, jungla, mid, tirador, apoyo).
  Los jugadores de posiciones ya cubiertas salen bloqueados.
- **No se puede repetir jugador** dentro de tu equipo (ninguna versión de otro año del mismo jugador).
  Entre participantes sí se puede repetir (dos pueden tener a Faker 2016).
- **2 rerolls** por draft (cambian las 3 opciones de esa ronda).
- Las tarjetas muestran foto, nombre, año, equipo (logo) y posición, y las etiquetas **CLUTCH**
  (amarillo) y **PECHO FRÍO** (azul hielo) cuando correspondan.
- Diseño: estilo del cliente de LoL (elegido entre 4 propuestas): tus 5 posiciones a la izquierda, los 3 equipos
  en el centro, la Grieta y la química a la derecha; un toque en un equipo abre sus jugadores y un toque en un
  jugador lo ficha (sin botones de confirmar). Se adapta a móvil, tablet y escritorio. NO se muestra nada que diga si un jugador es mejor o peor: ni nota, ni media, ni
  valor del equipo, ni MVP de la final, ni hasta dónde llegó su equipo ese año.

## 2. Valor del equipo

- **Las notas no se muestran en ningún sitio** (ni la media ni el valor del equipo, que las delatarían): así gana
  quien más sabe de LoL. Solo se ve la química.

- Nota de cada jugador: ya calculada en los datos (40-99).
- **Valor = media de los 5 + química.**
- **Química (máximo +12, mínimo -6):**
  - Excompañeros (jugaron juntos en el mismo equipo-año de los datos, aunque se elijan versiones de otros años): **+2,5 por pareja**.
  - Misma organización (campo `org`), distinto año y no excompañeros: **+1 por pareja**.
  - Misma región (campo `region`): 3 / 4 / 5 jugadores → **+1 / +2 / +4**.
  - Parejas clave: **tirador + apoyo** y **mid + jungla**. En cada una:
    excompañeros → **+1,5 extra**; misma organización o misma región → 0; sin ningún vínculo → **-3**.

## 3. Simulación

- Probabilidad de ganar una partida según la diferencia de valor `d`: `p = 1 / (1 + e^(-0.0847·d))`
  (5 puntos → 60 %, 10 → 70 %, 20 → 85 %).
- **Rasgos (reglas 3, desde el 21/10/2026 03:00 UTC):** 12 CLUTCH y 12 PECHO FRÍO, con 2 tops y 2 supports de cada uno.
  Solo deciden en la partida decisiva (la 3.ª de un Bo3 o la 5.ª de un Bo5): cada CLUTCH tiene un 15 % de ganarla para su
  equipo pase lo que pase y cada PECHO FRÍO un 30 % de perderla. En las demás partidas los PECHO FRÍO suman al valor de su
  equipo ("rey de la liga"): 3,5 / 5,75 / 7,75 / 9 / 10 en total con 1 / 2 / 3 / 4 / 5 PECHO FRÍO (cada uno suma menos que
  el anterior, para que no compense acumularlos). Simulado entre 8 equipos con la misma nota: 1, 3 o 5 CLUTCH → 15 %, 20 %
  y 23 % de ser campeón; 1, 3 o 5 PECHO FRÍO → 15 %, 20 % y 24 %; sin rasgo, 12 %.
  Reglas 2 (salas que empezaron entre las 00:30 y las 03:00 UTC del 21/10/2026): como las 3, pero sin los tops y supports
  nuevos y con 4 por cada PECHO FRÍO. Reglas 1 (salas anteriores): 4 % por partida (8 % en la decisiva) de ganarla (CLUTCH)
  o perderla (PECHO FRÍO). `rulesFor(sim_started_at)` elige las reglas de cada sala, así su resultado y su copa no cambian.
- **Por qué los PECHO FRÍO tienen notas más bajas:** la nota parte de lo lejos que llegó el equipo en ese Mundial
  (campeón 80, finalista 72, semifinal 64, cuartos 56) y suma títulos, MVP de la final y rendimiento. Los PECHO FRÍO son,
  por definición, jugadores cuyo equipo cayó antes de lo esperado, así que salen más bajos; el "rey de la liga" lo compensa.
  Si saltan efectos contrarios en la misma partida, se anulan y se juega normal.
- **Formato:** octavos Bo3, cuartos Bo3, semifinal Bo5, final Bo5 (en todas las salas). Sorteo del cuadro al azar.
- Presentación de cada partida: mapa con los 10 jugadores (tu equipo cian, rival rosa), marcador de la serie,
  casillas M1…M5 con ✓/✗, y de 4 a 6 mensajes por partida (inicio, mitad, final), en verde si favorecen
  a tu equipo y en rojo si favorecen al rival, coherentes con el resultado. Cada partida dura unos 8-10 s.
- Mensajes de rasgo: destacados (brillo amarillo para Clutch, azul hielo para Pecho frío) y **sin título**
  (no escribir "CLUTCH:"; se entiende por el texto). **Nunca poner el año del jugador en los mensajes.**
  Además, cada uno de los 24 jugadores con rasgo tiene 1-2 frases propias (escribirlas; frases de juego,
  no hechos históricos inventados).
- Antes de cada serie, pantalla "TU EQUIPO vs RIVAL" con las 5 tarjetas de cada lado, valor y química.
- Si te eliminan, puedes **seguir mirando** el resto del Worlds hasta la final.

## 4. Bots

- Rellenan las plazas libres. Dificultades: **Fácil** = elige al azar; **Media** = al azar entre las 3 mejores
  opciones; **Imposible** = siempre la mejor.
- Salas normales: el creador elige la dificultad. Sala oficial: **Media** por defecto, configurable por el
  administrador en el panel de admin.

## 5. Salas normales (modo libre)

- Se crean con código (como las salas de preguntas). Sin cuenta obligatoria (con cuenta se juega con el usuario).
- El creador elige **octavos (16 participantes) o cuartos (8)**; el resto se llena con bots.
- Todos pulsan **Listo**; cuando todos están listos, el creador pulsa **Empezar**.
- Draft **a su ritmo**. Cuando termina el **penúltimo humano**, empieza una **cuenta atrás de 1 minuto** para el
  último; si no termina, sus posiciones vacías se completan **al azar**. Después empieza la simulación.

## 6. Sala oficial (semanal) y copas

- Se abre sola cuando empieza la semana (sábado 8 pm de Venezuela, misma semana que el reto semanal).
- Solo **cuentas verificadas**. Entran los **16 primeros**. Siempre **desde octavos**.
- Al entrar, cada uno arma su equipo y queda esperando. **Solo el administrador la inicia** (no hace falta "Listo").
- Una por semana: cuando se juega, se cierra hasta la semana siguiente.
- El campeón gana **1 copa**. **Ranking de copas** acumulado (pestaña aparte en Rankings). Hace falta cuenta.
- Las copas no se pueden falsear desde el navegador: el resultado oficial lo decide el servidor (semilla
  guardada en Supabase / función SECURITY DEFINER) y todos ven la misma simulación.

## 7. Imágenes

- Logo y foto: archivos de Leaguepedia enlazados directamente en `https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/<ruta>`
  (campos `logo` y `photo`, con la ruta que calcula `build.mjs`) y con `referrerpolicy="no-referrer"`: ese servidor
  rechaza las imágenes pedidas desde otras webs, y `Special:FilePath` pasa por una redirección que Cloudflare puede bloquear.
  Si no hay archivo o no carga, iniciales con el color del equipo.
- Mapa: arte de la Grieta del Invocador (`img/grieta.webp`, recortado de "Summoner's Rift Update Map" de la wiki de LoL).
  En cada partida los jugadores se mueven según los mensajes (`js/draft-map.js`).
- Iconos de posición: las formas de los iconos oficiales en SVG, con el color de cada rol.

## 8. Inicio

- Tarjeta nueva "Draft Worlds" en el inicio cuando el modo esté listo.

## 9. Forma de trabajo

- Por partes: 1) draft + simulación jugable contra bots (local); 2) salas normales con Supabase;
  3) sala oficial, copas y configuración en el panel de admin.
- Probar cada parte (PostgreSQL local con el esquema de Supabase, simuladores de GoTrue/PostgREST,
  Playwright), actualizar `supabase/setup.sql` y el README, commit y push a `claude/cool-dijkstra-gjelyd`.
