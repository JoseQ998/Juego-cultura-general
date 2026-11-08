-- OPCIONAL: ya no hace falta (en el panel de administrador están "Borrar todas las partidas" y "Cambiar las preguntas").
-- Hace lo mismo y además aparta las 15 preguntas que ya se jugaron en la semana 2966 para que no vuelvan a salir.
-- Si lo usas, ejecútalo UNA vez en Supabase → SQL Editor.

begin;

-- 1. Las 15 preguntas que ya se jugaron quedan apartadas en una fila "semana 1" (no sale en ningún
--    ranking ni lista) para que no vuelvan a salir en otra semana.
insert into public.weeks (id, question_ids)
select 1, question_ids from public.weeks where id = 2966 and question_ids is not null
on conflict (id) do nothing;

-- 2. Las preguntas nuevas de la semana.
update public.weeks
   set question_ids = array['videojuegos-57', 'videojuegos-58', 'videojuegos-59', 'videojuegos-60',
                            'videojuegos-61', 'videojuegos-62', 'videojuegos-63', 'videojuegos-64',
                            'videojuegos-65', 'videojuegos-66', 'videojuegos-67', 'videojuegos-68',
                            'videojuegos-69', 'videojuegos-70', 'videojuegos-71']
 where id = 2966;

-- 3. Borra TODAS las partidas de esta semana para que todos vuelvan a jugar.
delete from public.weekly_plays where week_id = 2966;

commit;

-- Comprobación: debe salir la lista nueva y 0 partidas.
select id, theme, question_ids, (select count(*) from public.weekly_plays where week_id = 2966) as partidas
from public.weeks where id in (1, 2966);
