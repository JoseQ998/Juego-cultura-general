// Escribe en supabase/setup.sql la tabla de jugadores del draft (para validar las elecciones en el servidor).
// Uso: node tools/draft-data/sql.mjs   (después de build.mjs)
import fs from 'node:fs';
import { DRAFT_TEAMS } from '../../js/draft-data.js';
const FILE = new URL('../../supabase/setup.sql', import.meta.url).pathname;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = DRAFT_TEAMS.flatMap((t) => t.players.map((p) => `(${q(`${t.id}:${p.role}`)},${q(t.id)},${q(p.role)},${q(p.name)})`));
const block = `-- DRAFT_PLAYERS_BEGIN (generado por tools/draft-data/sql.mjs; no editar a mano)
delete from public.draft_players where true;
insert into public.draft_players (key, team_id, role, name) values
${rows.join(',\n')};
-- DRAFT_PLAYERS_END`;
const sql = fs.readFileSync(FILE, 'utf8');
const re = /-- DRAFT_PLAYERS_BEGIN[\s\S]*?-- DRAFT_PLAYERS_END/;
if (!re.test(sql)) throw new Error('Faltan los marcadores DRAFT_PLAYERS_BEGIN/END en setup.sql');
fs.writeFileSync(FILE, sql.replace(re, block));
console.log('jugadores del draft en setup.sql:', rows.length);
