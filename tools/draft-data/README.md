# Datos del modo Draft Worlds

Equipos que llegaron a cuartos de cada Worlds (2011-2025), sacados de Leaguepedia.

- `AAAA.txt`: un jugador titular por línea: `año|equipo|puesto|posición|jugador|partidas|K|D|A|KDA|CS/min|oro/min|KP%|% de kills|% de oro`.
  Puesto: 1 campeón, 2 finalista, 3 semifinal, 5 cuartos.
- `titles.txt`: títulos de liga y MSI de cada equipo ese año (`año|equipo|título1,título2`).
- `logos.txt` y `photos.txt`: nombres de archivo de Leaguepedia.
- `build.mjs`: calcula la nota de cada jugador y genera `js/draft-data.js`. La fórmula, el MVP de cada final y los jugadores Clutch y Pecho frío están al principio del archivo.

Para regenerar después de cambiar algo: `node tools/draft-data/build.mjs` (con `--report` muestra el desglose de cada nota).
`photos.py` y `photos_fallback.py` vuelven a buscar las fotos (necesitan acceso a lol.fandom.com).
