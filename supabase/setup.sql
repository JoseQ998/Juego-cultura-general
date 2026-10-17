-- =====================================================================
--  Cultura General · base de datos en Supabase
--
--  Cómo usarlo:
--    1. Supabase → tu proyecto → SQL Editor → New query.
--    2. Pega TODO este archivo y pulsa Run. Debe terminar en "Success".
--
--  Se puede ejecutar varias veces sin perder datos.
--
--  Después de registrarte en el juego, hazte administrador ejecutando
--  (cambia tu_usuario por el tuyo):
--    update public.profiles set is_admin = true, status = 'approved' where username = 'tu_usuario';
-- =====================================================================


-- ---------------------------------------------------------------------
-- Ajustes privados (no accesibles desde la web)
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.settings (
  key   text primary key,
  value text not null
);

-- Primera semana del modo semanal: la que empieza el sábado 17/10/2026 a las 8pm de Venezuela.
insert into private.settings (key, value) values ('first_week', '2963') on conflict (key) do nothing;

-- El registro ya no usa PIN: ahora es solo para la cuenta de administrador.
delete from private.settings where key = 'admin_pin';
drop function if exists public.check_admin_pin(text);
drop function if exists public.get_logs(text, int);
drop function if exists public.clear_logs(text);

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

-- Ranking de los modos libres (Aleatorio y salas): la mejor partida de cada nombre.
-- "score" es el número de aciertos.
create table if not exists public.scores (
  board      text not null,
  name_key   text not null,
  name       text not null,
  score      int  not null,
  correct    int  not null,
  total      int  not null,
  time_ms    int  not null,
  device_id  text,
  updated_at timestamptz not null default now(),
  primary key (board, name_key),
  constraint scores_board  check (board ~ '^(clasico|aleatorio|sala_[0-9A-Z]{6,7})$'),
  constraint scores_name   check (char_length(name) between 2 and 20 and char_length(name_key) between 2 and 40),
  constraint scores_values check (total between 1 and 20
                                  and score between 0 and total * 200
                                  and correct between 0 and total
                                  and time_ms between 0 and total * 10000),
  constraint scores_device check (char_length(coalesce(device_id, '')) <= 64)
);
create index if not exists scores_rank_idx on public.scores (board, score desc, time_ms asc);

-- Registro de todas las partidas.
create table if not exists public.logs (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null,
  name_key        text not null,
  mode            text not null,
  board           text not null,
  board_label     text,
  score           int  not null,
  correct         int  not null,
  total           int  not null,
  time_ms         int  not null,
  duration_ms     bigint,
  tab_switches    int  not null default 0,
  finished        boolean not null default true,  -- false = el jugador salió antes de terminar
  answered        int,                            -- preguntas respondidas
  device_id       text,
  fp              text,
  ua              text,
  names_on_device jsonb,
  constraint logs_values check (total between 1 and 20
                                and score between 0 and total * 200
                                and correct between 0 and total
                                and time_ms between 0 and total * 10000
                                and tab_switches between 0 and 1000),
  constraint logs_names check (names_on_device is null
                               or (jsonb_typeof(names_on_device) = 'array'
                                   and pg_column_size(names_on_device) < 4000))
);
create index if not exists logs_created_idx on public.logs (created_at desc);

-- Para quien ya hubiera ejecutado una versión anterior de este archivo.
alter table public.logs add column if not exists finished boolean not null default true;
alter table public.logs add column if not exists answered int;
alter table public.logs drop constraint if exists logs_answered;
alter table public.logs add constraint logs_answered check (answered is null or answered between 0 and total);
alter table public.logs drop constraint if exists logs_text;
alter table public.logs drop column if exists ip;  -- las versiones anteriores guardaban la IP
alter table public.logs add constraint logs_text check (char_length(name) between 2 and 20
                                                        and char_length(name_key) <= 40
                                                        and char_length(mode) <= 20
                                                        and char_length(board) <= 20
                                                        and char_length(coalesce(board_label, '')) <= 40
                                                        and char_length(coalesce(device_id, '')) <= 64
                                                        and char_length(coalesce(fp, '')) <= 64
                                                        and char_length(coalesce(ua, '')) <= 80);

-- Salas.
create table if not exists public.lobbies (
  code       text primary key,
  name       text not null,
  cats       text[] not null,
  created_by text,
  created_at timestamptz not null default now(),
  constraint lobbies_code check (code ~ '^[0-9A-Z]{6,7}$'),
  constraint lobbies_name check (char_length(name) between 1 and 40 and char_length(coalesce(created_by, '')) <= 20),
  constraint lobbies_cats check (cardinality(cats) between 1 and 20)
);
create index if not exists lobbies_created_idx on public.lobbies (created_at desc);

alter table public.scores drop constraint if exists scores_board;
alter table public.scores add constraint scores_board check (board ~ '^(clasico|aleatorio|sala_[0-9A-Z]{6,7})$');
alter table public.lobbies drop constraint if exists lobbies_code;
alter table public.lobbies add constraint lobbies_code check (code ~ '^[0-9A-Z]{6,7}$');

-- Cuentas de jugador (las crea Supabase Auth; aquí van los datos del juego).
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique,
  display_name text not null,
  who          text,
  status       text not null default 'pending',
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint profiles_username check (username ~ '^[a-z0-9_.-]{3,20}$'),
  constraint profiles_display  check (char_length(display_name) between 3 and 20),
  constraint profiles_who      check (char_length(coalesce(who, '')) <= 120),
  constraint profiles_status   check (status in ('pending', 'approved', 'rejected', 'blocked'))
);

-- Semanas del modo semanal. Cada semana va del sábado 8pm (Venezuela) al sábado siguiente.
create table if not exists public.weeks (
  id           int primary key,
  theme        text,       -- categoría de la semana (null = todas las categorías)
  question_ids text[],     -- las preguntas de la semana (se eligen al empezar la semana)
  extra        jsonb,      -- pregunta extra opcional: {"text": ..., "options": [correcta, mal, mal, mal]}
  created_at   timestamptz not null default now(),
  constraint weeks_theme check (theme is null or theme ~ '^[a-z]{2,20}$'),
  constraint weeks_questions check (question_ids is null or cardinality(question_ids) between 1 and 15)
);
-- La primera semana es solo de fútbol.
insert into public.weeks (id, theme) values (2963, 'futbol') on conflict (id) do nothing;

-- Una partida por cuenta y semana. Se crea al empezar y se actualiza en cada respuesta.
create table if not exists public.weekly_plays (
  week_id    int  not null references public.weeks (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  total      int  not null,
  answered   int  not null default 0,
  correct    int  not null default 0,
  time_ms    int  not null default 0,
  finished   boolean not null default false,
  device_id  text,
  fp         text,
  ua         text,
  primary key (week_id, user_id),
  constraint plays_values check (total between 1 and 20
                                 and answered between 0 and total
                                 and correct between 0 and answered
                                 and time_ms between 0 and total * 10000 + 5000),
  constraint plays_text check (char_length(coalesce(device_id, '')) <= 64
                               and char_length(coalesce(fp, '')) <= 64
                               and char_length(coalesce(ua, '')) <= 80)
);
create index if not exists weekly_plays_user_idx on public.weekly_plays (user_id);

-- La puntuación pasó de "puntos" a "aciertos": se vacían una sola vez los rankings antiguos.
do $$
begin
  if not exists (select 1 from private.settings where key = 'scoring_v2') then
    delete from public.scores where true;
    insert into private.settings (key, value) values ('scoring_v2', '1');
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- La hora del registro la pone el servidor (no se puede falsear desde la web)
-- ---------------------------------------------------------------------
create or replace function private.logs_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists logs_before_insert on public.logs;
create trigger logs_before_insert
  before insert on public.logs
  for each row execute function private.logs_before_insert();


-- ---------------------------------------------------------------------
-- Permisos: la web puede leer el ranking libre y las salas, crear salas y
-- añadir partidas al registro. Todo lo demás pasa por las funciones de abajo,
-- que comprueban quién llama.
-- ---------------------------------------------------------------------
alter table public.scores       enable row level security;
alter table public.logs         enable row level security;
alter table public.lobbies      enable row level security;
alter table public.profiles     enable row level security;
alter table public.weeks        enable row level security;
alter table public.weekly_plays enable row level security;

revoke all on public.scores, public.logs, public.lobbies, public.profiles, public.weeks, public.weekly_plays
  from anon, authenticated;
grant select         on public.scores  to anon, authenticated;
grant insert         on public.logs    to anon, authenticated;
grant select, insert on public.lobbies to anon, authenticated;

drop policy if exists "ranking visible" on public.scores;
create policy "ranking visible" on public.scores
  for select to anon, authenticated using (true);

drop policy if exists "registrar partida" on public.logs;
create policy "registrar partida" on public.logs
  for insert to anon, authenticated with check (true);

drop policy if exists "salas visibles" on public.lobbies;
create policy "salas visibles" on public.lobbies
  for select to anon, authenticated using (true);

drop policy if exists "crear sala" on public.lobbies;
create policy "crear sala" on public.lobbies
  for insert to anon, authenticated with check (true);


-- ---------------------------------------------------------------------
-- Utilidades internas
-- ---------------------------------------------------------------------

-- Número de semana: cambia cada domingo a las 00:00 UTC (sábado 8pm en Venezuela).
create or replace function public.week_id_at(p_ts timestamptz)
returns int
language sql
immutable
set search_path = ''
as $$
  select floor((extract(epoch from p_ts) - 259200) / 604800)::int;
$$;

create or replace function public.week_start(p_week int)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select to_timestamp(259200 + p_week::bigint * 604800);
$$;

-- Semana en curso (antes de la primera semana, devuelve la primera).
create or replace function private.current_week()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(public.week_id_at(now()),
                  coalesce((select value::int from private.settings where key = 'first_week'), 0));
$$;

create or replace function private.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved');
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved' and is_admin);
$$;

create or replace function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede hacer esto' using errcode = '28000';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- Funciones que llama la web: modos libres
-- ---------------------------------------------------------------------

-- Guarda una puntuación solo si mejora la anterior de ese nombre.
create or replace function public.submit_score(
  p_board     text,
  p_name      text,
  p_name_key  text,
  p_score     int,
  p_correct   int,
  p_total     int,
  p_time_ms   int,
  p_device_id text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.scores as s
    (board, name_key, name, score, correct, total, time_ms, device_id, updated_at)
  values
    (p_board, p_name_key, p_name, p_score, p_correct, p_total, p_time_ms, p_device_id, now())
  on conflict (board, name_key) do update
    set name       = excluded.name,
        score      = excluded.score,
        correct    = excluded.correct,
        total      = excluded.total,
        time_ms    = excluded.time_ms,
        device_id  = excluded.device_id,
        updated_at = excluded.updated_at
    where excluded.score > s.score
       or (excluded.score = s.score and excluded.time_ms < s.time_ms);
$$;


-- ---------------------------------------------------------------------
-- Cuentas
-- ---------------------------------------------------------------------

-- Perfil de quien llama (null si no tiene).
create or replace function public.my_profile()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object('username', username, 'display_name', display_name,
                           'status', status, 'is_admin', is_admin)
  from public.profiles where id = auth.uid();
$$;

-- Crea el perfil del usuario recién registrado (queda pendiente de aprobación).
-- El nombre y el "¿Quién eres?" se leen de los datos con los que se registró.
create or replace function public.register_profile()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_user    text := lower(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1));
  v_display text := trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'display', ''));
  v_who     text := left(trim(coalesce(auth.jwt() -> 'user_metadata' ->> 'who', '')), 120);
begin
  if v_uid is null then
    raise exception 'Inicia sesión primero' using errcode = '28000';
  end if;
  if lower(v_display) <> v_user then
    v_display := v_user;
  end if;
  insert into public.profiles (id, username, display_name, who)
  values (v_uid, v_user, v_display, nullif(v_who, ''))
  on conflict (id) do nothing;
  return public.my_profile();
end;
$$;


-- ---------------------------------------------------------------------
-- Modo semanal
-- ---------------------------------------------------------------------

-- Datos de la semana en curso. Si aún no tiene preguntas, incluye las ya usadas
-- en otras semanas para que la web elija 15 nuevas.
create or replace function public.get_week()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   int := private.current_week();
  w      public.weeks;
  v_used text[];
  v_play json;
begin
  insert into public.weeks (id) values (v_id) on conflict (id) do nothing;
  select * into w from public.weeks where id = v_id;
  if w.question_ids is null then
    select coalesce(array_agg(q), '{}') into v_used
    from public.weeks x, unnest(x.question_ids) q
    where x.id <> v_id;
  end if;
  select json_build_object('answered', answered, 'correct', correct, 'total', total,
                           'time_ms', time_ms, 'finished', finished, 'started_at', started_at)
    into v_play
  from public.weekly_plays where week_id = v_id and user_id = auth.uid();
  return json_build_object(
    'id', v_id,
    'starts_at', public.week_start(v_id),
    'ends_at', public.week_start(v_id + 1),
    'now', now(),
    'open', now() >= public.week_start(v_id),
    'theme', w.theme,
    'question_ids', w.question_ids,
    'extra', w.extra,
    'used_ids', v_used,
    'my_play', v_play
  );
end;
$$;

-- Fija las preguntas de la semana en curso (solo la primera vez; si otro jugador
-- se adelantó, devuelve las suyas). Ninguna puede haberse usado en otra semana.
create or replace function public.set_week_questions(p_week int, p_ids text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_approved() then
    raise exception 'Tu cuenta no está aprobada' using errcode = '28000';
  end if;
  if p_week <> private.current_week() then
    raise exception 'Esa semana no está en curso';
  end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 15
     or exists (select 1 from unnest(p_ids) i where i !~ '^[a-z]{2,20}-[0-9]{1,4}$')
     or (select count(distinct i) from unnest(p_ids) i) <> cardinality(p_ids) then
    raise exception 'Lista de preguntas no válida';
  end if;
  if exists (select 1 from public.weeks x, unnest(x.question_ids) q
             where x.id <> p_week and q = any (p_ids)) then
    raise exception 'Alguna pregunta ya se usó en otra semana';
  end if;
  update public.weeks set question_ids = p_ids where id = p_week and question_ids is null;
  return (select question_ids from public.weeks where id = p_week);
end;
$$;

-- Empieza la partida semanal. Cuenta como jugada desde este momento.
create or replace function public.start_weekly(p_device text, p_fp text, p_ua text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    int := private.current_week();
  w       public.weeks;
  v_total int;
  v_rows  int;
begin
  if not private.is_approved() then
    raise exception 'Tu cuenta no está aprobada' using errcode = '28000';
  end if;
  if now() < public.week_start(v_id) then
    raise exception 'El modo semanal todavía no ha empezado';
  end if;
  select * into w from public.weeks where id = v_id;
  if w.question_ids is null then
    raise exception 'Las preguntas de la semana aún no están listas';
  end if;
  v_total := cardinality(w.question_ids) + case when w.extra is null then 0 else 1 end;
  insert into public.weekly_plays (week_id, user_id, total, device_id, fp, ua)
  values (v_id, auth.uid(), v_total, left(p_device, 64), left(p_fp, 64), left(p_ua, 80))
  on conflict (week_id, user_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Ya jugaste esta semana';
  end if;
  return json_build_object('week_id', v_id, 'total', v_total);
end;
$$;

-- Guarda el progreso tras cada respuesta. Solo puede avanzar, nunca retroceder,
-- y la partida se cierra como mucho una hora después de empezar.
create or replace function public.weekly_progress(
  p_week     int,
  p_answered int,
  p_correct  int,
  p_time_ms  int,
  p_finished boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_approved() then
    return false;
  end if;
  update public.weekly_plays p
     set answered = p_answered, correct = p_correct, time_ms = p_time_ms,
         finished = p_finished, updated_at = now()
   where p.week_id = p_week and p.user_id = auth.uid()
     and not p.finished
     and p_answered >= p.answered and p_answered <= p.total
     and p_correct >= p.correct and p_correct - p.correct <= p_answered - p.answered
     and p_time_ms >= p.time_ms and p_time_ms <= p_answered * 10000 + 2000
     and (not p_finished or p_answered = p.total)
     and now() <= p.started_at + interval '1 hour';
  return found;
end;
$$;

-- Ranking de una semana: más aciertos primero; en empate, menos tiempo.
create or replace function public.weekly_ranking(p_week int)
returns table (name text, correct int, total int, answered int, time_ms int, finished boolean, started_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.display_name, p.correct, p.total, p.answered, p.time_ms, p.finished, p.started_at
  from public.weekly_plays p
  join public.profiles pr on pr.id = p.user_id
  where p.week_id = p_week and pr.status <> 'blocked'
  order by p.correct desc, p.time_ms asc, p.started_at asc;
$$;

-- Ranking mensual (p_month) o anual (p_month null): suma de aciertos de todas las
-- semanas. Cada semana cuenta para el mes en que empieza (hora de Venezuela).
create or replace function public.period_ranking(p_year int, p_month int default null)
returns table (name text, correct bigint, time_ms bigint, weeks bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.display_name, sum(p.correct), sum(p.time_ms), count(*)
  from public.weekly_plays p
  join public.profiles pr on pr.id = p.user_id
  where pr.status <> 'blocked'
    and extract(year from public.week_start(p.week_id) at time zone 'America/Caracas') = p_year
    and (p_month is null
         or extract(month from public.week_start(p.week_id) at time zone 'America/Caracas') = p_month)
  group by pr.id, pr.display_name
  order by sum(p.correct) desc, sum(p.time_ms) asc;
$$;

-- Semanas jugadas hasta ahora (para elegir en el ranking).
create or replace function public.list_weeks()
returns table (id int, starts_at timestamptz, theme text, plays bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, public.week_start(w.id), w.theme,
         (select count(*) from public.weekly_plays p where p.week_id = w.id)
  from public.weeks w
  where w.id <= private.current_week()
    and w.id >= coalesce((select value::int from private.settings where key = 'first_week'), 0)
  order by w.id desc;
$$;


-- ---------------------------------------------------------------------
-- Panel del administrador
-- ---------------------------------------------------------------------

create or replace function public.admin_users()
returns table (id uuid, username text, display_name text, who text, status text, is_admin boolean,
               created_at timestamptz, plays bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select p.id, p.username, p.display_name, p.who, p.status, p.is_admin, p.created_at,
           (select count(*) from public.weekly_plays w where w.user_id = p.id)
    from public.profiles p
    order by (p.status = 'pending') desc, p.created_at desc;
end;
$$;

create or replace function public.admin_set_status(p_user uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user = auth.uid() then
    raise exception 'No puedes cambiar el estado de tu propia cuenta';
  end if;
  update public.profiles set status = p_status where id = p_user;
end;
$$;

-- Cambia la contraseña de un jugador que la olvidó.
create or replace function public.admin_set_password(p_user uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if char_length(coalesce(p_password, '')) not between 6 and 72 then
    raise exception 'La contraseña debe tener entre 6 y 72 caracteres';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user;
end;
$$;

-- Datos completos de una semana: tema, extra y partidas (con dispositivo).
create or replace function public.admin_week(p_week int)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w public.weeks;
begin
  perform private.require_admin();
  select * into w from public.weeks where id = p_week;
  return json_build_object(
    'id', p_week,
    'starts_at', public.week_start(p_week),
    'theme', w.theme,
    'question_ids', w.question_ids,
    'extra', w.extra,
    'plays', coalesce((
      select json_agg(json_build_object(
               'user_id', p.user_id, 'name', pr.display_name, 'correct', p.correct, 'total', p.total,
               'answered', p.answered, 'time_ms', p.time_ms, 'finished', p.finished,
               'started_at', p.started_at, 'device_id', p.device_id, 'fp', p.fp, 'ua', p.ua)
             order by p.correct desc, p.time_ms asc)
      from public.weekly_plays p join public.profiles pr on pr.id = p.user_id
      where p.week_id = p_week), '[]'::json)
  );
end;
$$;

-- Borra la partida semanal de alguien para que pueda volver a jugarla.
create or replace function public.admin_delete_play(p_week int, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.weekly_plays where week_id = p_week and user_id = p_user;
end;
$$;

-- Tema y pregunta extra de la semana en curso o de una futura. Solo se puede
-- cambiar mientras nadie la haya jugado. Si cambia el tema, se eligen preguntas nuevas.
create or replace function public.admin_set_week(p_week int, p_theme text, p_extra jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_week < private.current_week() then
    raise exception 'Esa semana ya terminó';
  end if;
  if exists (select 1 from public.weekly_plays where week_id = p_week) then
    raise exception 'Alguien ya jugó esa semana: no se puede cambiar';
  end if;
  if p_extra is not null and not (
       jsonb_typeof(p_extra -> 'text') = 'string'
       and char_length(p_extra ->> 'text') between 5 and 200
       and jsonb_typeof(p_extra -> 'options') = 'array'
       and jsonb_array_length(p_extra -> 'options') = 4
       and (select bool_and(jsonb_typeof(o) = 'string' and char_length(o #>> '{}') between 1 and 80)
            from jsonb_array_elements(p_extra -> 'options') o)) then
    raise exception 'La pregunta extra necesita un texto y 4 respuestas';
  end if;
  insert into public.weeks (id, theme, extra) values (p_week, nullif(p_theme, ''), p_extra)
  on conflict (id) do update
    set question_ids = case when public.weeks.theme is not distinct from excluded.theme
                            then public.weeks.question_ids end,
        theme = excluded.theme,
        extra = excluded.extra;
end;
$$;

-- Registro de partidas.
create or replace function public.get_logs(p_limit int default 1000)
returns setof public.logs
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select * from public.logs
    order by created_at desc
    limit least(greatest(coalesce(p_limit, 1000), 1), 5000);
end;
$$;

-- Borra el registro y los rankings de Aleatorio y salas (no toca el semanal).
create or replace function public.clear_logs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.logs where true;
  delete from public.scores where true;
end;
$$;


-- ---------------------------------------------------------------------
-- Quién puede llamar a cada función (cada una comprueba además los permisos)
-- ---------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.submit_score(text, text, text, int, int, int, int, text)',
    'public.my_profile()',
    'public.register_profile()',
    'public.get_week()',
    'public.set_week_questions(int, text[])',
    'public.start_weekly(text, text, text)',
    'public.weekly_progress(int, int, int, int, boolean)',
    'public.weekly_ranking(int)',
    'public.period_ranking(int, int)',
    'public.list_weeks()',
    'public.admin_users()',
    'public.admin_set_status(uuid, text)',
    'public.admin_set_password(uuid, text)',
    'public.admin_week(int)',
    'public.admin_delete_play(int, uuid)',
    'public.admin_set_week(int, text, jsonb)',
    'public.get_logs(int)',
    'public.clear_logs()'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end;
$$;
