# Ilustraciones de CLUTCH y PECHO FRÍO

Ya están hechas y en el juego (`img/ilustraciones/<id>.webp`, tabla `ART` de `js/draft.js`), como montajes
sin IA: ver "Cómo se hicieron" al final. La de Faker 2024 como Azir no es un montaje: es una ilustración de internet
(de autor desconocido) que eligió el dueño del juego, con el mismo tono dorado que las demás. Las opciones A y B (Gemini) quedan por si se quieren sustituir por
ilustraciones pintadas de verdad.

Idea: en la animación de Draft Worlds, en lugar de la foto del jugador, sale una ilustración pintada
del jugador como su campeón (al estilo de las presentaciones de los Mundiales). Los CLUTCH en luz dorada
y los PECHO FRÍO en hielo. El campeón de cada uno es el que más jugó en ese Mundial (Leaguepedia).

| id | Jugador | Campeón | Rasgo |
|---|---|---|---|
| faker-2016 | Faker · SKT T1 2016 | Orianna | CLUTCH |
| ruler-2017 | Ruler · Samsung Galaxy 2017 | Varus | CLUTCH |
| rookie-2018 | Rookie · Invictus Gaming 2018 | LeBlanc | CLUTCH |
| caps-2019 | Caps · G2 Esports 2019 | Ryze | CLUTCH |
| tian-2019 | Tian · FunPlus Phoenix 2019 | Lee Sin | CLUTCH |
| deft-2022 | Deft · DRX 2022 | Miss Fortune | CLUTCH |
| faker-2024 | Faker · T1 2024 | Azir | CLUTCH |
| gumayusi-2025 | Gumayusi · T1 2025 | Varus | CLUTCH |
| deft-2015 | Deft · EDG 2015 | Kalista | PECHO FRÍO |
| faker-2017 | Faker · SKT T1 2017 | Galio | PECHO FRÍO |
| uzi-2018 | Uzi · RNG 2018 | Vayne | PECHO FRÍO |
| score-2018 | Score · KT Rolster 2018 | Xin Zhao | PECHO FRÍO |
| ruler-2022 | Ruler · Gen.G 2022 | Lucian | PECHO FRÍO |
| knight-2023 | knight · JD Gaming 2023 | Ahri | PECHO FRÍO |
| canyon-2024 | Canyon · Gen.G 2024 | Nocturne | PECHO FRÍO |
| chovy-2025 | Chovy · Gen.G 2025 | Orianna | PECHO FRÍO |
| kingen-2022 | Kingen · DRX 2022 | Gnar (su más jugado en 2022; el del Mundial no se pudo confirmar) | CLUTCH |
| zeus-2023 | Zeus · T1 2023 | Aatrox | CLUTCH |
| mata-2014 | Mata · Samsung White 2014 | Janna | CLUTCH |
| meiko-2021 | Meiko · EDward Gaming 2021 | Nami (empatado con Lulu y Yuumi) | CLUTCH |
| khan-2017 | Khan · Longzhu Gaming 2017 | Jayce (su campeón emblemático; el del Mundial no se pudo confirmar) | PECHO FRÍO |
| bin-2024 | Bin · Bilibili Gaming 2024 | Jax | PECHO FRÍO |
| ming-2018 | Ming · RNG 2018 | Tahm Kench (su más jugado en 2018; el del Mundial no se pudo confirmar) | PECHO FRÍO |
| lehends-2022 | Lehends · Gen.G 2022 | Yuumi (su más jugado en 2022; el del Mundial no se pudo confirmar) | PECHO FRÍO |

## Opción A: con la app de Gemini (sin clave)

1. En gemini.google.com (o la app), sube la foto oficial del jugador (de Leaguepedia).
2. Pega el texto de abajo cambiando lo que va entre corchetes.
3. Descarga la imagen y pásala en la sesión de Claude diciendo a qué jugador va (por ejemplo "faker-2017").

> Painted digital illustration in the style of League of Legends splash art. The man in the attached photo is the esports player [JUGADOR]. Keep his face, hairstyle and glasses exactly like in the photo so he is clearly recognizable. He is portrayed as the champion [CAMPEÓN]: [CÓMO SE VE EL CAMPEÓN], worn over his [EQUIPO AÑO] team jersey. Waist-up, confident heroic pose, [LUZ], dramatic lighting, dark background, square 1:1 format, no text, no letters, no logos.

- [LUZ] CLUTCH: `warm golden light, golden sparks and embers, triumphant mood`
- [LUZ] PECHO FRÍO: `cold icy blue light, frost on his clothes, snow and ice crystals, tense mood`
- [CÓMO SE VE EL CAMPEÓN]: ver `look` de cada jugador en `gemini.mjs`.

## Opción B: que Claude las genere (con clave)

1. Crea una clave en Google AI Studio (aistudio.google.com → Get API key). Según el modelo, Google puede cobrar
   unos céntimos por imagen.
2. Guárdala en la configuración del entorno de Claude Code (menú del entorno en la barra de título de la sesión →
   Edit → Network secrets / API credentials) con el nombre `GEMINI_API_KEY`. No la pegues en el chat.
   El dominio generativelanguage.googleapis.com ya está permitido en la red del entorno.
3. Abre una sesión nueva (la clave se lee al empezar) y pide: "Sigue con las ilustraciones de Draft Worlds:
   lee tools/ilustraciones/PLAN.md".

Para Claude en esa sesión:
- `node tools/ilustraciones/gemini.mjs faker-2017` genera una de prueba en `img/ilustraciones/faker-2017.png`.
  Enséñasela al usuario antes de generar el resto (`node tools/ilustraciones/gemini.mjs todos`).
- Si Gemini rechaza la imagen (filtros de personas reales) o no se parece, prueba a reformular el texto; si no hay
  forma, díselo al usuario.
- Uzi 2018 y knight 2023 no se pudieron confirmar en Leaguepedia; se eligieron Vayne y Ahri. Si quieres, confírmalos
  (tabla ScoreboardPlayers del Mundial de ese año) y cámbialos aquí y en la tabla `ART` de `js/draft.js`.

## Integración en la animación (cuando estén aprobadas)

- Pasar cada PNG a WebP (~1024 px, calidad 82) en `img/ilustraciones/<id>.webp`.
- En `js/draft.js`, una tabla clave del jugador → { archivo, campeón } y, en `cinema()`, usar la ilustración en lugar
  de la foto (en PECHO FRÍO también se rompe en pedazos) y mostrar "como <campeón>" debajo del nombre.
  Los jugadores sin ilustración siguen con su foto.
- Maquetas de referencia: la ilustración ocupa la mitad izquierda (ordenador) o la parte de arriba (móvil),
  fundida con el fondo, y el texto al lado o debajo.

## Cómo se hicieron

`montaje.py` (Python con pillow, numpy y opencv-python-headless): la foto oficial del jugador de Leaguepedia (ya viene
con el fondo transparente) delante del arte oficial del campeón (`<Campeón>_OriginalSkin.jpg` de la wiki de League of
Legends), pintada con filtros de OpenCV, con luz dorada (CLUTCH) o de hielo (PECHO FRÍO), halo y partículas. Después
se pasa a WebP de 1024 px, calidad 80.

    python3 tools/ilustraciones/montaje.py foto.png Orianna.jpg faker-2016.png clutch 0.68 0.38 1.4

Los números son el centro del recorte del arte del campeón (x, y de 0 a 1) y el zoom; opcionales, más luz para artes
oscuros y la parte de arriba de la foto que se usa (para fotos de cuerpo entero). Los que se usaron:

| id | campeón | rasgo | x | y | zoom | luz | alto |
|---|---|---|---|---|---|---|---|
| faker-2016 | Orianna | clutch | 0.68 | 0.38 | 1.4 |  |  |
| ruler-2017 | Varus | clutch | 0.55 | 0.38 | 1.4 |  |  |
| rookie-2018 | LeBlanc | clutch | 0.60 | 0.38 | 1.4 |  |  |
| caps-2019 | Ryze | clutch | 0.68 | 0.40 | 1.35 | 1.15 |  |
| tian-2019 | Lee Sin | clutch | 0.55 | 0.40 | 1.2 |  |  |
| deft-2022 | Miss Fortune | clutch | 0.75 | 0.42 | 1.4 |  |  |
| faker-2024 | Azir | clutch | 0.68 | 0.35 | 1.4 |  |  | (ya no se usa: ver arriba)
| gumayusi-2025 | Varus | clutch | 0.55 | 0.38 | 1.4 |  |  |
| deft-2015 | Kalista | choke | 0.72 | 0.38 | 1.4 | 1.1 | 0.62 |
| faker-2017 | Galio | choke | 0.49 | 0.33 | 1.55 |  |  |
| uzi-2018 | Vayne | choke | 0.55 | 0.42 | 1.3 |  |  |
| score-2018 | Xin Zhao | choke | 0.50 | 0.40 | 1.4 |  |  |
| ruler-2022 | Lucian | choke | 0.68 | 0.40 | 1.35 | 1.9 |  |
| knight-2023 | Ahri | choke | 0.60 | 0.35 | 1.4 |  |  |
| canyon-2024 | Nocturne | choke | 0.62 | 0.40 | 1.25 | 1.9 | 0.85 |
| chovy-2025 | Orianna | choke | 0.68 | 0.38 | 1.4 |  |  |
| kingen-2022 | Gnar | clutch | 0.61 | 0.75 | 1.6 | 1.2 |  |
| zeus-2023 | Aatrox | clutch | 0.66 | 0.38 | 1.3 | 1.7 |  |
| mata-2014 | Janna | clutch | 0.60 | 0.38 | 1.3 |  |  |
| meiko-2021 | Nami | clutch | 0.62 | 0.35 | 1.3 |  |  |
| khan-2017 | Jayce | choke | 0.62 | 0.38 | 1.25 |  |  |
| bin-2024 | Jax | choke | 0.68 | 0.40 | 1.3 | 1.3 |  |
| ming-2018 | Tahm Kench | choke | 0.60 | 0.45 | 1.15 | 1.4 |  |
| lehends-2022 | Yuumi | choke | 0.45 | 0.40 | 1.3 |  |  |
