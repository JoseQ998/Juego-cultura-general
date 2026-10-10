# 🧠 Cultura General — juego de trivia

Página web de preguntas de cultura general. Funciona sin servidor propio: se publica gratis con **GitHub Pages** y, para que el ranking y el registro sean compartidos entre todos, se conecta a **Supabase** (también gratis).

## Qué incluye

| Función | Detalle |
|---|---|
| 🏛️ **Modo Clásico** | Siempre las mismas 15 preguntas, en el mismo orden, más 1 pregunta extra al final (16 en total). |
| 🎲 **Modo Aleatorio** | 15 preguntas distintas en cada partida, repartidas entre todas las categorías (evita repetir las que ya viste). |
| 👥 **Salas** | Eliges las categorías (videojuegos, música, deportes, arte, historia, geografía, ciencia, cine y TV, literatura, tecnología y League of Legends, con preguntas del juego y del competitivo: Mundial, MSI y LEC) y se genera un código de 6 o 7 caracteres. Todos los que entran con ese código reciben las mismas preguntas. |
| 🏆 **Rankings** | Uno por modo (Clásico, Aleatorio) y uno por cada sala. Se guarda la mejor partida de cada nombre. |
| ⏱️ **10 segundos** | Límite por pregunta. Si se acaba el tiempo, cuenta como fallo. |
| 📋 **Registro** | Página protegida con PIN que muestra todas las partidas y marca los dispositivos y navegadores desde los que se jugó con varios nombres distintos. También registra las partidas abandonadas a mitad. También cuenta cuántas veces salió el jugador de la pestaña durante la partida (por ejemplo, para buscar la respuesta). |

**Puntuación:** cada acierto vale 100 puntos, más un bonus de hasta 100 según lo rápido que respondas (máximo 3000 en Aleatorio y salas, 3200 en Clásico). Si hay empate, gana quien tardó menos.

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

## 2. Ranking y registro compartidos con Supabase (recomendado)

Sin este paso el juego funciona en **modo local**: cada dispositivo ve solo sus propias partidas en el ranking y en el registro. Para que todos compartan el mismo ranking y tú veas en el registro las partidas de todo el mundo:

1. Entra en <https://supabase.com/dashboard> y crea un proyecto (**New project**). Apunta la contraseña de la base de datos que te pide, aunque el juego no la necesita.
2. Cuando el proyecto esté listo, ve a **SQL Editor** → **New query**.
3. Copia todo el contenido de [`supabase/setup.sql`](supabase/setup.sql) y pégalo.
4. En la línea marcada con **▶**, cambia `CAMBIA_ESTE_PIN` por el PIN que quieras para el Registro (mínimo 6 caracteres; mejor con letras y números). **Cámbialo solo allí, en Supabase, no en GitHub.**
5. Pulsa **Run**. Debe terminar con *Success*.
6. Pulsa el botón **Connect** (arriba) o ve a **Project Settings → API Keys** y copia:
   - la **Project URL** (`https://xxxxxxxx.supabase.co`)
   - la **Publishable key** (`sb_publishable_...`) o, en proyectos antiguos, la **anon public key** (`eyJ...`).

   ⚠️ **Nunca** uses la *secret key* ni la *service_role key*.
7. En GitHub abre [`js/config.js`](js/config.js), pulsa el lápiz ✏️ y rellena:

   ```js
   supabase: {
     url: 'https://xxxxxxxx.supabase.co',
     key: 'sb_publishable_...',
   },
   ```

8. Guarda con **Commit changes**. En uno o dos minutos, al pie de la página verás **Ranking en línea** con un cuadradito verde. Si sale **Sin conexión con Supabase** (cuadradito rojo), mantén el dedo (o el ratón) sobre ese texto para ver el error.

> La URL y la publishable key no son secretas: están pensadas para ir en el código de la web. Lo que protege los datos son los permisos que crea `setup.sql`: desde la web solo se puede leer el ranking, crear salas y añadir partidas. Nadie puede leer, cambiar ni borrar el registro sin el PIN, ni poner puntuaciones imposibles.

**Cambiar el PIN más adelante:** en **SQL Editor** ejecuta

```sql
update private.settings set value = 'TuNuevoPIN' where key = 'admin_pin';
```

**Proyecto en pausa:** en el plan gratuito, Supabase pausa los proyectos que pasan una semana sin actividad. Si el juego deja de guardar partidas tras un tiempo sin uso, entra en el panel de Supabase y pulsa **Restore project**.

## 3. Registro (log) y PIN

- Abre el enlace **Registro** que está al pie de la página y escribe tu PIN.
- Con Supabase, el PIN se comprueba en el servidor y no aparece en el código de la web. En modo local se usa `ADMIN_PIN` de `js/config.js`.
- En `SUSPICIOUS_NAMES` (en `js/config.js`) decides a partir de cuántos nombres distintos se marca un dispositivo como sospechoso (por defecto 3).
- Puedes descargar todo el registro en CSV. **Borrar todo** borra el registro y también todos los rankings (Clásico, Aleatorio y los de cada sala); las salas siguen existiendo.

**Cómo detecta a quien usa varios nombres:**

- **Dispositivo:** identificador aleatorio que se guarda en el navegador la primera vez que alguien juega.
- **Huella del navegador:** se calcula con datos del navegador y la pantalla. Detecta al mismo móvil aunque borre los datos o use el modo incógnito.
- **Privacidad:** no se guarda la IP ni ningún otro dato personal; solo el nombre que pone cada jugador y estos dos identificadores anónimos. El inicio del juego lo avisa.

**Limitaciones (es una web sin servidor propio):**

- Las respuestas van dentro del código de la página, así que un jugador con conocimientos técnicos podría buscarlas, o enviar una puntuación alta pero posible sin jugar. Para jugar entre amigos es suficiente, y el registro te ayuda a detectar cosas raras.
- Para borrar a alguien del ranking: en Supabase → **Table Editor** → tabla `scores`, selecciona la fila y bórrala.

## Añadir o cambiar preguntas

Están en [`js/questions.js`](js/questions.js): 31 por categoría y 167 de League of Legends. Las partidas reparten las preguntas entre las categorías elegidas, así que ninguna acapara la partida aunque tenga muchas más. Cada pregunta es una línea:

```js
['Texto de la pregunta', 'Respuesta correcta', 'Incorrecta 1', 'Incorrecta 2', 'Incorrecta 3'],
```

Las preguntas nuevas se añaden al **final** de su categoría (el modo Clásico las identifica por su posición) y las categorías nuevas al **final** de `CATEGORIES` (el código de sala depende de ese orden). La respuesta correcta siempre va en segundo lugar; el juego baraja las opciones al mostrarlas. Las 15 preguntas del modo Clásico se eligen en `CLASSIC_IDS`, al final del mismo archivo (por ejemplo `'historia-1'` es la primera pregunta de Historia). Las preguntas extra del Clásico están justo debajo, en `CLASSIC_EXTRA`: solo aparecen en ese modo.

## Donaciones

La tarjeta "Apoya el juego" (con el logo de Binance, de [Simple Icons](https://simpleicons.org), licencia CC0) se abre con el botón **Donar** de la barra de arriba, en una ventana sobre la pantalla actual. El Binance ID se cambia en `js/config.js` → `DONATION.binanceId`. Solo sirve para recibir; no pongas ahí tu correo ni tu teléfono.

## Diseño

El estilo "Arcade neón" está en [`css/styles.css`](css/styles.css): arriba la estructura base y abajo el tema (colores en `:root`, tipografías y brillos). Las tipografías *Press Start 2P* y *Space Grotesk* van incluidas en la carpeta `fonts/` (licencia SIL OFL), así que no dependen de servicios externos.

## Archivos

```
index.html        Página principal
css/styles.css    Estilos (tema Arcade neón)
fonts/            Tipografías del tema
js/app.js         Lógica del juego, salas, rankings y registro
js/questions.js   Banco de preguntas (477 preguntas, 11 categorías)
js/storage.js     Guardado en Supabase o en el navegador
js/identity.js    Identificación del dispositivo para el registro
js/config.js      Configuración (Supabase, etc.)
supabase/setup.sql  Tablas, permisos y funciones para Supabase
```

## Probarlo en un ordenador

Hay que servirlo desde un servidor local, porque los módulos de JavaScript no funcionan abriendo el archivo directamente:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```
