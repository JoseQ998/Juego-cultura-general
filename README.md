# Cultura General — juego de trivia

Página web de preguntas de cultura general. Funciona sin servidor propio: se publica gratis con **GitHub Pages** y, para que los rankings, las cuentas y el registro sean compartidos entre todos, se conecta a **Supabase** (también gratis).

## Qué incluye

| Función | Detalle |
|---|---|
| **Reto semanal** | 15 preguntas iguales para todos, una sola partida por semana y por cuenta. Se renueva cada **sábado a las 8pm (hora de Venezuela)**. Las preguntas de una semana nunca se repiten en otra. Necesita cuenta (se crea al momento, sin esperar aprobación). |
| **Modo Aleatorio** | 15 preguntas distintas en cada partida, repartidas entre todas las categorías (evita repetir las que ya viste). Libre, sin cuenta. |
| **Salas** | Eliges las categorías (videojuegos, música, deportes, arte, historia, geografía, ciencia, cine y TV, literatura, tecnología, League of Legends y fútbol) y se genera un código de 6 o 7 caracteres. Todos los que entran con ese código reciben las mismas preguntas. Libre, sin cuenta. |
| **Rankings** | Semanal (en directo), mensual y anual del reto semanal; uno del Aleatorio y uno por cada sala. |
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

- **Crear cuenta:** usuario, contraseña y "¿Quién eres?" (solo lo ve el administrador). No se pide correo ni teléfono. La cuenta se puede usar **al momento**, sin esperar aprobación. La sesión se queda abierta en ese dispositivo hasta que se cierre.
- **Verificado:** en el panel, botón **Verificar** de cada cuenta. Pónselo a quien hayas comprobado por fuera (por ejemplo, por WhatsApp) que es quien dice ser: sale una insignia azul junto a su nombre en los rankings del reto semanal y en su cuenta. Se quita con **Quitar verificado**.
- **Bloquear:** una cuenta bloqueada no puede jugar el reto semanal y desaparece de los rankings. Se deshace con **Desbloquear**.
- **Contraseña olvidada:** en el panel, botón **Contraseña** de esa cuenta; pon una nueva y díselo por privado. Cada jugador puede cambiar la suya en **Mi cuenta**.
- **Una partida por semana:** cuenta como jugada en cuanto empieza. Si alguien sale a mitad, queda guardada como abandonada con lo que llevaba. Si tuvo un problema de verdad, en el panel puedes **Borrar partida** y podrá repetirla.
- **Tema de la semana:** en el panel eliges la categoría de la semana en curso (si nadie la ha jugado todavía) y de la siguiente. "Todas las categorías" reparte las 15 preguntas entre todas. La primera semana (desde el sábado 17 de octubre de 2026 a las 8pm) es solo de **fútbol**.
- **Pregunta extra o trampa:** en el mismo formulario escribe la pregunta, la respuesta correcta y 3 incorrectas. Sale **por sorpresa** al final, después de las 15 (el contador dice /15), y suma 1 acierto. Se puede cambiar o quitar mientras nadie haya jugado esa semana.
- **Preguntas que no se repiten:** Supabase guarda qué preguntas usó cada semana. Hay más de 800, suficientes para más de un año.

## 5. Registro (log)

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

## Donaciones

La tarjeta "Apoya el juego" (con el logo de Binance, de [Simple Icons](https://simpleicons.org), licencia CC0) se abre con el botón **Donar** de la barra de arriba. El Binance ID se cambia en `js/config.js` → `DONATION.binanceId`. Solo sirve para recibir; no pongas ahí tu correo ni tu teléfono.

## Diseño

El estilo "Arcade neón" está en [`css/styles.css`](css/styles.css): arriba la estructura base y abajo el tema (colores en `:root`, tipografías y brillos). Las tipografías *Press Start 2P* y *Space Grotesk* van incluidas en la carpeta `fonts/` (licencia SIL OFL).

## Archivos

```
index.html          Página principal
css/styles.css      Estilos (tema Arcade neón)
fonts/              Tipografías del tema
js/app.js           Lógica del juego, reto semanal, salas, rankings, cuentas y panel
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
