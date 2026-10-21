# Ilustraciones de CLUTCH y PECHO FRÍO

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
| faker-2024 | Faker · T1 2024 | Sylas | CLUTCH |
| gumayusi-2025 | Gumayusi · T1 2025 | Varus | CLUTCH |
| deft-2015 | Deft · EDG 2015 | Kalista | PECHO FRÍO |
| faker-2017 | Faker · SKT T1 2017 | Galio | PECHO FRÍO |
| uzi-2018 | Uzi · RNG 2018 | por confirmar | PECHO FRÍO |
| score-2018 | Score · KT Rolster 2018 | Xin Zhao | PECHO FRÍO |
| ruler-2022 | Ruler · Gen.G 2022 | Lucian | PECHO FRÍO |
| knight-2023 | knight · JD Gaming 2023 | por confirmar | PECHO FRÍO |
| canyon-2024 | Canyon · Gen.G 2024 | Nocturne | PECHO FRÍO |
| chovy-2025 | Chovy · Gen.G 2025 | Orianna | PECHO FRÍO |

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
- Antes, confirma el campeón de Uzi 2018 y knight 2023 en Leaguepedia (tabla ScoreboardPlayers del Mundial de ese año).

## Integración en la animación (cuando estén aprobadas)

- Pasar cada PNG a WebP (~1024 px, calidad 82) en `img/ilustraciones/<id>.webp`.
- En `js/draft.js`, una tabla clave del jugador → { archivo, campeón } y, en `cinema()`, usar la ilustración en lugar
  de la foto (en PECHO FRÍO también se rompe en pedazos) y mostrar "como <campeón>" debajo del nombre.
  Los jugadores sin ilustración siguen con su foto.
- Maquetas de referencia: la ilustración ocupa la mitad izquierda (ordenador) o la parte de arriba (móvil),
  fundida con el fondo, y el texto al lado o debajo.
