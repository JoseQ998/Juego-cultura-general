# 🧠 Cultura General — juego de trivia

Página web de preguntas de cultura general. Funciona sin servidor propio: se publica gratis con **GitHub Pages** y, si quieres que el ranking sea compartido entre todos, se conecta a **Firebase** (también gratis).

## Qué incluye

| Función | Detalle |
|---|---|
| 🏛️ **Modo Clásico** | Siempre las mismas 15 preguntas, en el mismo orden, más 1 pregunta extra al final (16 en total). |
| 🎲 **Modo Aleatorio** | 15 preguntas distintas en cada partida (evita repetir las que ya viste). |
| 👥 **Salas** | Eliges las categorías (videojuegos, música, deportes, arte, historia, geografía, ciencia, cine y TV, literatura, tecnología) y se genera un código de 6 caracteres. Todos los que entran con ese código reciben las mismas preguntas. |
| 🏆 **Rankings** | Uno por modo (Clásico, Aleatorio) y uno por cada sala. Se guarda la mejor partida de cada nombre. |
| ⏱️ **10 segundos** | Límite por pregunta. Si se acaba el tiempo, cuenta como fallo. |
| 📋 **Registro** | Página protegida con PIN que muestra todas las partidas y marca los dispositivos, huellas de navegador e IPs desde los que se jugó con varios nombres distintos. También cuenta cuántas veces salió el jugador de la pestaña durante la partida (por ejemplo, para buscar la respuesta). |

**Puntuación:** cada acierto vale 100 puntos, más un bonus de hasta 100 según lo rápido que respondas (máximo 3000 en Aleatorio y salas, 3200 en Clásico). Si hay empate, gana quien tardó menos.

---

## 1. Publicar la página con GitHub Pages (sin laptop)

Todo esto se puede hacer desde el navegador del móvil en github.com:

1. **El repositorio tiene que ser público** (GitHub Pages en repositorios privados solo está en los planes de pago).
   `Settings` → abajo del todo, `Danger Zone` → `Change visibility` → `Public`.
2. `Settings` → `Pages`.
3. En **Source** elige `Deploy from a branch`.
4. En **Branch** elige la rama donde está el código (por ejemplo `main`) y la carpeta `/ (root)`. Pulsa **Save**.
5. Espera 1–2 minutos. Arriba de esa misma página aparecerá la dirección, del estilo:
   `https://joseq998.github.io/Juego-cultura-general/`

Cada vez que edites un archivo en GitHub la página se actualiza sola en uno o dos minutos.

## 2. Ranking compartido con Firebase (recomendado)

Sin este paso el juego funciona en **modo local**: cada dispositivo ve solo sus propias partidas en el ranking y en el registro. Para que todos compartan el mismo ranking y tú veas en el registro las partidas de todo el mundo:

1. Entra en <https://console.firebase.google.com> con tu cuenta de Google → **Crear un proyecto** (puedes desactivar Google Analytics).
2. En el menú: **Compilación → Firestore Database → Crear base de datos** → elige una ubicación → **modo de producción**.
3. En la pestaña **Reglas** de Firestore, borra lo que haya, pega el contenido del archivo [`firestore.rules`](firestore.rules) y pulsa **Publicar**.
4. Ve a ⚙️ **Configuración del proyecto** → en "Tus apps" pulsa el icono **`</>`** (Web) → ponle un nombre → **Registrar app**. Te mostrará un bloque `const firebaseConfig = { ... }`.
5. En GitHub abre [`js/config.js`](js/config.js), pulsa el lápiz ✏️ y sustituye `firebase: null,` por los datos de ese bloque:

   ```js
   firebase: {
     apiKey: "AIza...",
     authDomain: "tu-proyecto.firebaseapp.com",
     projectId: "tu-proyecto",
     storageBucket: "tu-proyecto.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   },
   ```

6. Guarda con **Commit changes**. Cuando la página se actualice, abajo verás **🟢 Ranking en línea**.

> La `apiKey` de Firebase no es secreta: está pensada para ir en el código de la web. Lo que protege los datos son las reglas del paso 3.

## 3. Registro (log) y PIN

- Abre el enlace **📋 Registro** que está al pie de la página.
- El PIN por defecto es **`1234`**. **Cámbialo** en `js/config.js` (`ADMIN_PIN`).
- En `SUSPICIOUS_NAMES` decides a partir de cuántos nombres distintos se marca un dispositivo como sospechoso (por defecto 3).
- Puedes descargar todo el registro en CSV.

**Cómo detecta a quien usa varios nombres:**

- **Dispositivo:** identificador aleatorio que se guarda en el navegador la primera vez que alguien juega.
- **Huella del navegador:** se calcula con datos del navegador y la pantalla. Detecta al mismo móvil aunque borre los datos o use el modo incógnito.
- **IP:** dirección pública (usa `api.ipify.org`). Ojo: todos los que están en la misma wifi comparten IP. Si no quieres guardarla, pon `LOG_IP: false`.

**Limitaciones (es una web sin servidor):**

- El PIN está en el código, así que alguien que sepa mirar el código fuente puede verlo. Con Firebase, las reglas impiden que se modifique o borre el registro desde la web, pero sí se puede leer.
- Las respuestas van dentro del código de la página, así que un jugador con conocimientos técnicos podría buscarlas. Para jugar entre amigos es suficiente.
- Para borrar partidas del ranking o del registro en modo Firebase, hazlo desde la consola de Firebase (Firestore Database → Datos).

## Añadir o cambiar preguntas

Están en [`js/questions.js`](js/questions.js). Cada pregunta es una línea:

```js
['Texto de la pregunta', 'Respuesta correcta', 'Incorrecta 1', 'Incorrecta 2', 'Incorrecta 3'],
```

La respuesta correcta siempre va en segundo lugar; el juego baraja las opciones al mostrarlas. Las 15 preguntas del modo Clásico se eligen en `CLASSIC_IDS`, al final del mismo archivo (por ejemplo `'historia-1'` es la primera pregunta de Historia). Las preguntas extra del Clásico están justo debajo, en `CLASSIC_EXTRA`: solo aparecen en ese modo.

## Archivos

```
index.html        Página principal
css/styles.css    Estilos
js/app.js         Lógica del juego, salas, rankings y registro
js/questions.js   Banco de preguntas (180 preguntas, 10 categorías)
js/storage.js     Guardado en Firebase o en el navegador
js/identity.js    Identificación del dispositivo para el registro
js/config.js      Configuración (Firebase, PIN, etc.)
firestore.rules   Reglas de seguridad para Firebase
```

## Probarlo en un ordenador

Hay que servirlo desde un servidor local, porque los módulos de JavaScript no funcionan abriendo el archivo directamente:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```
