# Cultura General — juego de trivia

Página web de preguntas de cultura general. Funciona sin servidor propio: se publica gratis con **GitHub Pages** y, para que los rankings, las cuentas y el registro sean compartidos entre todos, se conecta a **Supabase** (también gratis).

> **Proyecto de fans, sin ánimo de lucro.** Cultura General es un juego hecho por diversión, para pasar el rato con amigos. Es gratis, no tiene publicidad y no cobra por jugar ni por ninguna función: no busca ganar dinero. Los nombres, marcas, imágenes y demás contenido de terceros pertenecen a sus dueños y se usan solo como homenaje. Más detalles en [Derechos de autor y marcas](#derechos-de-autor-y-marcas).

## Qué incluye

| Función | Detalle |
|---|---|
| **Reto semanal** | 15 preguntas iguales para todos, una sola partida por semana y por cuenta. Se renueva cada **sábado a las 8pm (hora de Venezuela)**. Las preguntas de una semana nunca se repiten en otra. Necesita cuenta (se crea al momento, sin esperar aprobación). |
| **Modo Aleatorio** | 15 preguntas distintas en cada partida, repartidas entre todas las categorías (evita repetir las que ya viste). Libre, sin cuenta. |
| **Salas** | Eliges las categorías (videojuegos, música, deportes, arte, historia, geografía, ciencia, cine y TV, literatura, tecnología, League of Legends y fútbol) y se genera un código de 6 o 7 caracteres. Todos los que entran con ese código reciben las mismas preguntas. Libre, sin cuenta. |
| **Draft Worlds** | Modo de League of Legends: armas un equipo con jugadores de los Worlds de 2011 a 2025 (cada uno en su versión de ese año) y juegas un Mundial simulado contra bots, en salas con tus amigos o en la **sala oficial semanal**, cuyo campeón gana una **copa**. |
| **Rankings** | Semanal (en directo), mensual y anual del reto semanal, con el filtro **Todos / Solo verificados**; **Copas** del Draft Worlds; uno del Aleatorio y uno por cada sala. |
| **10 segundos** | Límite por pregunta. Si se acaba el tiempo, cuenta como fallo. |
| **Panel de administrador** | Dar la insignia de **verificado** (como la de Twitter) a las cuentas que hayas comprobado, bloquear cuentas, cambiar contraseñas, borrar la partida semanal de alguien, elegir el tema de la semana y añadir la pregunta extra. |
| **Registro** | Solo para el administrador: todas las partidas, con aviso de los dispositivos y navegadores desde los que se jugó con varios nombres. |

**Puntuación (todos los modos):** cuenta el número de aciertos. Se mide el tiempo total de la partida y, si hay empate, gana quien tardó menos. El ranking mensual y el anual suman los aciertos de todas las semanas (y el tiempo total para desempatar). Cada semana cuenta para el mes en que empieza.

---

## 1. Publicar la página con GitHub Pages (sin laptop)

Todo esto se puede hacer desde el navegador del móvil en github.com:

1. **El repositorio tiene que ser público** (GitHub Pages en repositorios privados solo está en los planes de pago).
   `Settings` → abajo del todo, `Danger Zone` → `Change visibility` → `Public`.
2. `Settings` → `Pages`.
3. En **Source** elige `Deploy from a branch`.
4. En **Branch** elige la rama donde está el código (`claude/cool-dijkstra-gjelyd`) y la carpeta `/ (root)`. Pulsa **Save**.
5. Espera 1–2 minutos. Arriba de esa misma página aparecerá la dirección, del estilo:
   `https://joseq998.github.io/Juego-cultura-general/`

Cada vez que edites un archivo en GitHub la página se actualiza sola en uno o dos minutos.

## 2. Conectar Supabase

Sin este paso el juego funciona en **modo local**: cada dispositivo ve solo sus propias partidas, y no hay cuentas ni reto semanal.

1. Entra en <https://supabase.com/dashboard> y crea un proyecto (**New project**).
2. **Authentication → Sign In / Providers → Email**: deja **Email** activado y **desactiva "Confirm email"**. Guarda.
   Las cuentas del juego no usan correo: por dentro se crean como `usuario@joseq998.github.io`, una dirección que no existe y a la que nunca se envía nada. **No vuelvas a activar "Confirm email"**, porque entonces nadie podría entrar.
3. **SQL Editor** → **New query** → copia todo el contenido de [`supabase/setup.sql`](supabase/setup.sql), pégalo y pulsa **Run**. Debe terminar con *Success*. Se puede volver a ejecutar sin perder datos (hazlo cada vez que cambie ese archivo).
4. Pulsa **Connect** (arriba) o ve a **Project Settings → API Keys** y copia la **Project URL** y la **Publishable key** (`sb_publishable_...`). **Nunca** uses la *secret key* ni la *service_role key*.
5. En GitHub abre [`js/config.js`](js/config.js), pulsa el lápiz y rellena `supabase.url` y `supabase.key`. Guarda con **Commit changes**. Al pie de la página verás **Ranking en línea** con un cuadradito verde.

> La URL y la publishable key no son secretas: están pensadas para ir en el código de la web. Lo que protege los datos son los permisos que crea `setup.sql`: la hora de la semana la decide el servidor, cada cuenta solo puede jugar una vez por semana, y solo la cuenta de administrador puede ver el registro o tocar las cuentas.

**Proyecto en pausa:** en el plan gratuito, Supabase pausa los proyectos que pasan una semana sin actividad. Si el juego deja de guardar partidas, entra en el panel de Supabase y pulsa **Restore project**.

## 3. Hacerte administrador

1. En el juego, pulsa **Entrar** (al pie de la página) → **Crear cuenta** y regístrate con tu usuario.
2. En Supabase → **SQL Editor**, ejecuta (cambiando `tu_usuario` por el tuyo, en minúsculas):

   ```sql
   update public.profiles set is_admin = true, status = 'approved' where username = 'tu_usuario';
   ```

3. Recarga el juego: al pie aparecen **Admin** y **Registro**.

## 4. Cuentas y reto semanal

- **Crear cuenta:** solo usuario y contraseña. No se pide correo ni teléfono. La cuenta se puede usar **al momento**, sin esperar aprobación. La sesión se queda abierta en ese dispositivo hasta que se cierre.
- **Verificado:** en el panel, botón **Verificar** de cada cuenta. Pónselo a quien hayas comprobado por fuera (por ejemplo, por WhatsApp) que es quien dice ser: sale una insignia azul junto a su nombre en los rankings del reto semanal y en su cuenta. Se quita con **Quitar verificado**.
- **Solo verificados:** en los rankings semanal, mensual y anual hay un selector **Todos / Solo verificados**. Con "Solo verificados" se ocultan las cuentas sin insignia (por ejemplo, alguien que no es del grupo) y las posiciones se recalculan; no se borra a nadie. El navegador recuerda la opción elegida.
- **Bloquear:** una cuenta bloqueada no puede jugar el reto semanal y desaparece de los rankings. Se deshace con **Desbloquear**.
- **Contraseña olvidada:** en el panel, botón **Contraseña** de esa cuenta; pon una nueva y díselo por privado. Cada jugador puede cambiar la suya en **Mi cuenta**.
- **Una partida por semana:** cuenta como jugada en cuanto empieza. Si alguien sale a mitad, queda guardada como abandonada con lo que llevaba. Si tuvo un problema de verdad, en el panel puedes **Borrar partida** y podrá repetirla.
- **Tema de la semana:** en el panel eliges la categoría de la semana en curso (si nadie la ha jugado todavía) y de la siguiente. "Todas las categorías" reparte las 15 preguntas entre todas. La primera semana (desde el sábado 17 de octubre de 2026 a las 8pm) es solo de **fútbol**.
- **Pregunta extra o trampa:** en el mismo formulario escribe la pregunta, la respuesta correcta y 3 incorrectas. Sale **por sorpresa** al final, después de las 15 (el contador dice /15), y suma 1 acierto. Se puede cambiar o quitar mientras nadie haya jugado esa semana.
- **Preguntas que no se repiten:** Supabase guarda qué preguntas usó cada semana. Hay más de 800, suficientes para más de un año.

## 5. Draft Worlds

- **Estilo:** imita el cliente de League of Legends (azul marino, dorado y turquesa, letra Cinzel). Solo se aplica dentro del modo; el resto del juego mantiene su estilo. Se adapta a móvil, tablet y escritorio.
- **Nadie te dice quién es mejor:** no se muestra la nota de los jugadores, ni la media o el valor del equipo, ni quién fue MVP, ni hasta dónde llegó cada equipo en su Mundial. Solo se ve la química. Así gana quien más sabe de LoL.
- **Draft:** 5 rondas. En cada una salen 3 equipos-año al azar; con un toque en un equipo ves sus jugadores y con un toque en uno lo fichas para una posición libre (no hay que confirmar). No puedes repetir jugador (ninguna versión de otro año). Tienes **2 rerolls**.
- **Valor del equipo:** media de las notas + química. **Las notas no se muestran** (ni la media ni el valor), para que gane quien más sabe de LoL; solo se ve la química. La química suma por excompañeros, misma organización y misma región, y resta si tirador + apoyo o mid + jungla no tienen ningún vínculo; va de -6 a +12.
- **Simulación:** octavos y cuartos al mejor de 3; semifinal y final al mejor de 5. Cada partida se ve sobre el mapa de la Grieta del Invocador: los jugadores salen de la fuente, van a sus líneas y se mueven hacia cada jugada (peleas en las líneas, dragón, Barón, invasiones de jungla, asedio a la base); los que caen se ven en gris y al final el ganador entra hasta el Nexo rival. El jugador que protagoniza cada jugada se ve más grande y con un aro dorado (amarillo si es CLUTCH, azul hielo si es PECHO FRÍO). En una sala, todos ven el mismo movimiento. Los 8 jugadores **CLUTCH** y los 8 **PECHO FRÍO** pueden decidir una partida. Cuando pasa, el jugador sale en grande sobre el mapa con su jugada y cómo decide la partida (en dorado si es CLUTCH; si es PECHO FRÍO, en azul hielo y con la foto agrietada). Con música: en los CLUTCH suena *Legends Never Die* desde el 0:59 y explota justo cuando sale "Decide la partida", y en los PECHO FRÍO unos efectos de caricaturas antiguas. El botón del altavoz, arriba a la derecha, la silencia (se recuerda en ese navegador). Si te eliminan, sigues viendo el torneo hasta la final. Cada jugada se queda unos segundos para poder leerla y verla en el mapa, y ningún mensaje se repite en una misma serie. Contra bots, cada partida, la previa y el resultado de cada serie se quedan parados hasta que pulsas **Continuar**; en las salas online todos van al mismo ritmo y **Continuar** adelanta a lo siguiente. **Ir al final** va directo al resultado.
- **Contra bots:** sin cuenta ni conexión. Eliges octavos (16) o cuartos (8) y la dificultad: Fácil, Media o Imposible.
- **Salas:** en el menú del draft, **Crear sala** da un código de 6 caracteres. Todos pulsan **Listo** y quien la creó pulsa **Empezar**. Cada uno hace su draft a su ritmo; cuando solo falta uno, tiene **1 minuto** o su equipo se completa al azar. Si alguien pasa 3 minutos sin elegir (por ejemplo, porque cerró la página), también se completa al azar, para que la sala no se quede bloqueada. Las plazas libres se llenan con bots. Quien abra el enlace después puede mirar.
- **Sala oficial:** se abre cada **sábado a las 8pm** con la semana. Solo **cuentas verificadas**, los **16 primeros**. Cada uno arma su equipo al entrar y espera; **solo el administrador la inicia** (botón *Iniciar la sala oficial* dentro de la sala). Quien no terminó su equipo lo recibe completado al azar. El campeón gana **1 copa** (ranking **Copas**); si gana un bot, esa semana no hay copa.
- **Copa:** se entrega sola cuando la simulación termina en la pantalla del administrador (vale con *Ir al final*). Si la cerraste antes, en el panel aparece **Asignar copa**. El torneo sale de una semilla que guarda Supabase y todos ven el mismo; nadie puede darse una copa desde su navegador.
- **Dificultad de los bots de la sala oficial:** en el panel de administrador, sección *Draft Worlds* (por defecto Media).
- **Datos:** 120 equipos y 600 jugadores en `js/draft-data.js`, generado con `tools/draft-data/build.mjs` (cómo se calculan las notas en `tools/draft-data/README.md`). Si cambias los datos, ejecuta también `node tools/draft-data/sql.mjs` y vuelve a ejecutar `supabase/setup.sql` en Supabase. Las fotos y logos se cargan de Leaguepedia; si no cargan, salen las iniciales.

## 6. Registro (log)

- Con Supabase solo lo ve la cuenta de administrador (enlace **Registro** al pie o desde el panel). En modo local se protege con `ADMIN_PIN` de `js/config.js`.
- Muestra todas las partidas (reto semanal, Aleatorio y salas), incluidas las abandonadas, y cuántas veces salió el jugador de la pestaña.
- En `SUSPICIOUS_NAMES` (en `js/config.js`) decides a partir de cuántos nombres distintos se marca un dispositivo como sospechoso (por defecto 3).
- Puedes descargarlo en CSV. **Borrar todo** borra el registro y los rankings de Aleatorio y salas; no toca el reto semanal.

**Cómo detecta a quien usa varios nombres:** un identificador aleatorio guardado en el navegador (dispositivo) y una huella calculada con datos del navegador y la pantalla. **No se guarda la IP** ni ningún otro dato personal.

**Limitaciones (es una web sin servidor propio):** las respuestas van dentro del código de la página, así que alguien con conocimientos técnicos podría buscarlas. Para jugar entre amigos es suficiente, y el panel te deja ver y borrar partidas raras.

## Añadir o cambiar preguntas

Están en [`js/questions.js`](js/questions.js). Cada pregunta es una línea:

```js
['Texto de la pregunta', 'Respuesta correcta', 'Incorrecta 1', 'Incorrecta 2', 'Incorrecta 3'],
```

Las preguntas nuevas se añaden al **final** de su categoría (el reto semanal las identifica por su posición, por ejemplo `futbol-3`) y las categorías nuevas al **final** de `CATEGORIES` (el código de sala depende de ese orden). La respuesta correcta siempre va en segundo lugar; el juego baraja las opciones al mostrarlas.

## Derechos de autor y marcas

**Para qué es este juego.** Es un proyecto personal de fans, hecho solo para entretenerse y pasar el rato. Es gratis, no tiene publicidad, no vende nada y no cobra por jugar ni por ninguna función. Tampoco acepta donaciones.

**Contenido de terceros.** Todo lo que no es propio pertenece a sus respectivos dueños, y aquí no se reclama ninguna propiedad sobre ello:

- **League of Legends:** el arte de la Grieta del Invocador (de la wiki de League of Legends), los nombres de jugadores y equipos y las formas de los iconos de posición son de Riot Games y de los equipos, igual que la canción *Legends Never Die* (Worlds 2017, con Against The Current), de la que solo suenan unos segundos. Las fotos y los logos se cargan desde [Leaguepedia](https://lol.fandom.com). El modo Draft Worlds se hace siguiendo la [política de contenido de fans de Riot Games](https://www.riotgames.com/en/legal) ("Legal Jibber Jabber"), que permite proyectos de fans gratuitos.
- **Efectos de sonido de PECHO FRÍO:** efectos de caricaturas antiguas; pertenecen a sus dueños y solo suenan unos segundos.
- **Preguntas:** mencionan personas, obras, marcas y empresas solo con fines informativos y de entretenimiento.
- **Tipografías:** tienen licencia libre (SIL OFL); las licencias están en la carpeta `fonts/`.

**Si algo es tuyo y quieres que se quite**, abre un *issue* en este repositorio y se retirará lo antes posible.

*Cultura General no está respaldado por Riot Games y no refleja las opiniones de Riot Games ni de nadie involucrado oficialmente en la producción o gestión de las propiedades de Riot Games. Riot Games y todas las propiedades asociadas son marcas comerciales o marcas registradas de Riot Games, Inc.*

## Diseño

El estilo "Arcade neón" está en [`css/styles.css`](css/styles.css): arriba la estructura base y abajo el tema (colores en `:root`, tipografías y brillos). Las tipografías *Press Start 2P* y *Space Grotesk* van incluidas en la carpeta `fonts/` (licencia SIL OFL). El modo Draft Worlds tiene su propio estilo en [`css/draft.css`](css/draft.css), con *Cinzel* e *Inter* (también en `fonts/`, licencia SIL OFL).

## Archivos

```
index.html          Página principal
css/styles.css      Estilos (tema Arcade neón)
css/draft.css       Estilo del modo Draft Worlds (como el cliente de LoL)
fonts/              Tipografías del tema
js/app.js           Lógica del juego, reto semanal, salas, rankings, cuentas y panel
js/draft.js         Draft Worlds: draft, partidas en vivo, cuadro y modo contra bots
js/draft-online.js  Draft Worlds: salas con código y sala oficial
js/draft-engine.js  Draft Worlds: química, bots y simulación del torneo
js/draft-map.js     Draft Worlds: mapa y movimiento de los jugadores en cada partida
js/draft-sound.js   Draft Worlds: música de los momentos CLUTCH y PECHO FRÍO
audio/              Trozos de 9 s de esa música (clutch.mp3 y pecho-frio.mp3)
img/grieta.webp     Mapa de la Grieta del Invocador
js/draft-data.js    Draft Worlds: equipos y jugadores (generado)
tools/draft-data/   Datos de origen y scripts del Draft Worlds
js/questions.js     Banco de preguntas (807 preguntas, 12 categorías)
js/storage.js       Guardado en Supabase o en el navegador
js/identity.js      Identificación del dispositivo para el registro
js/config.js        Configuración (Supabase, etc.)
supabase/setup.sql  Tablas, permisos y funciones para Supabase
```

## Probarlo en un ordenador

Hay que servirlo desde un servidor local, porque los módulos de JavaScript no funcionan abriendo el archivo directamente:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```
