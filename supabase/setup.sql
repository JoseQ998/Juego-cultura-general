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
  status       text not null default 'approved',
  is_admin     boolean not null default false,
  verified     boolean not null default false,  -- insignia de verificado (la pone el administrador)
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

-- Las cuentas ya no esperan aprobación: se pueden usar nada más crearlas.
-- El administrador marca como verificadas las que ha comprobado.
alter table public.profiles add column if not exists verified boolean not null default false;
alter table public.profiles alter column status set default 'approved';
update public.profiles set status = 'approved' where status = 'pending';

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
                           'status', status, 'is_admin', is_admin, 'verified', verified)
  from public.profiles where id = auth.uid();
$$;

-- Crea el perfil del usuario recién registrado (puede jugar desde ese momento).
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
  insert into public.profiles (id, username, display_name, who, status)
  values (v_uid, v_user, v_display, nullif(v_who, ''), 'approved')
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
    raise exception 'Tu cuenta está bloqueada' using errcode = '28000';
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
    raise exception 'Tu cuenta está bloqueada' using errcode = '28000';
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
drop function if exists public.weekly_ranking(int);
create or replace function public.weekly_ranking(p_week int)
returns table (name text, correct int, total int, answered int, time_ms int, finished boolean, started_at timestamptz,
               verified boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.display_name, p.correct, p.total, p.answered, p.time_ms, p.finished, p.started_at, pr.verified
  from public.weekly_plays p
  join public.profiles pr on pr.id = p.user_id
  where p.week_id = p_week and pr.status <> 'blocked'
  order by p.correct desc, p.time_ms asc, p.started_at asc;
$$;

-- Ranking mensual (p_month) o anual (p_month null): suma de aciertos de todas las
-- semanas. Cada semana cuenta para el mes en que empieza (hora de Venezuela).
drop function if exists public.period_ranking(int, int);
create or replace function public.period_ranking(p_year int, p_month int default null)
returns table (name text, correct bigint, time_ms bigint, weeks bigint, verified boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.display_name, sum(p.correct), sum(p.time_ms), count(*), pr.verified
  from public.weekly_plays p
  join public.profiles pr on pr.id = p.user_id
  where pr.status <> 'blocked'
    and extract(year from public.week_start(p.week_id) at time zone 'America/Caracas') = p_year
    and (p_month is null
         or extract(month from public.week_start(p.week_id) at time zone 'America/Caracas') = p_month)
  group by pr.id, pr.display_name, pr.verified
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

drop function if exists public.admin_users();
create or replace function public.admin_users()
returns table (id uuid, username text, display_name text, who text, status text, is_admin boolean,
               verified boolean, created_at timestamptz, plays bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select p.id, p.username, p.display_name, p.who, p.status, p.is_admin, p.verified, p.created_at,
           (select count(*) from public.weekly_plays w where w.user_id = p.id)
    from public.profiles p
    order by p.created_at desc;
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

-- Pone o quita la insignia de verificado.
create or replace function public.admin_set_verified(p_user uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.profiles set verified = coalesce(p_verified, false) where id = p_user;
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


-- =====================================================================
-- Draft Worlds: salas, sala oficial semanal y copas
-- El servidor decide las opciones de cada ronda y valida cada elección.
-- =====================================================================
create table if not exists public.draft_players (
  key     text primary key,  -- "equipo:posición", p. ej. "2016-skt:mid"
  team_id text not null,
  role    text not null check (role in ('top', 'jungle', 'mid', 'bot', 'support')),
  name    text not null
);
create index if not exists draft_players_team_idx on public.draft_players (team_id);

create table if not exists public.draft_lobbies (
  code              text primary key,
  name              text not null,
  size              int  not null default 16,
  level             text not null default 'medio',
  official          boolean not null default false,
  week_id           int unique,           -- solo la sala oficial
  host_token        text,
  status            text not null default 'waiting',
  seed              text,
  countdown_ends_at timestamptz,
  sim_started_at    timestamptz,
  champion_seat     int,
  created_at        timestamptz not null default now(),
  constraint draft_code   check (code ~ '^[0-9A-Z]{5,6}$'),
  constraint draft_name   check (char_length(name) between 1 and 40),
  constraint draft_size   check (size in (8, 16)),
  constraint draft_level  check (level in ('facil', 'medio', 'imposible')),
  constraint draft_status check (status in ('waiting', 'drafting', 'simulating'))
);
create index if not exists draft_lobbies_created_idx on public.draft_lobbies (created_at desc);

create table if not exists public.draft_seats (
  lobby     text not null references public.draft_lobbies (code) on delete cascade,
  seat      int  not null,
  token     text not null,
  user_id   uuid references public.profiles (id) on delete set null,
  name      text not null,
  ready     boolean not null default false,
  roster    jsonb not null default '{}'::jsonb,
  options   text[] not null default '{}',
  rerolls   int  not null default 0,
  done      boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (lobby, seat),
  unique (lobby, token),
  constraint draft_seat_name check (char_length(name) between 1 and 20),
  constraint draft_seat_token check (char_length(token) between 16 and 64)
);

create table if not exists public.draft_cups (
  week_id    int primary key,
  lobby      text not null,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  awarded_at timestamptz not null default now()
);

alter table public.draft_players enable row level security;
alter table public.draft_lobbies enable row level security;
alter table public.draft_seats   enable row level security;
alter table public.draft_cups    enable row level security;
revoke all on public.draft_players, public.draft_lobbies, public.draft_seats, public.draft_cups from anon, authenticated;

insert into private.settings (key, value) values ('draft_bot_level', 'medio') on conflict (key) do nothing;

-- DRAFT_PLAYERS_BEGIN (generado por tools/draft-data/sql.mjs; no editar a mano)
delete from public.draft_players where true;
insert into public.draft_players (key, team_id, role, name) values
('2011-fnc:top','2011-fnc','top','xPeke'),
('2011-fnc:jungle','2011-fnc','jungle','Cyanide'),
('2011-fnc:mid','2011-fnc','mid','Shushei'),
('2011-fnc:bot','2011-fnc','bot','LaMiaZlt'),
('2011-fnc:support','2011-fnc','support','Mellisan'),
('2011-aaa:top','2011-aaa','top','sOAZ'),
('2011-aaa:jungle','2011-aaa','jungle','Linak'),
('2011-aaa:mid','2011-aaa','mid','MoMa'),
('2011-aaa:bot','2011-aaa','bot','Yellowstar'),
('2011-aaa:support','2011-aaa','support','kujaa'),
('2011-tsm:top','2011-tsm','top','TheRainMan'),
('2011-tsm:jungle','2011-tsm','jungle','TheOddOne'),
('2011-tsm:mid','2011-tsm','mid','Reginald'),
('2011-tsm:bot','2011-tsm','bot','Chaox'),
('2011-tsm:support','2011-tsm','support','Xpecial'),
('2011-epik:top','2011-epik','top','Westrice'),
('2011-epik:jungle','2011-epik','jungle','Dan Dinh'),
('2011-epik:mid','2011-epik','mid','Salce'),
('2011-epik:bot','2011-epik','bot','Dyrus'),
('2011-epik:support','2011-epik','support','Doublelift'),
('2011-clg:top','2011-clg','top','HotshotGG'),
('2011-clg:jungle','2011-clg','jungle','SaintVicious'),
('2011-clg:mid','2011-clg','mid','bigfatlp'),
('2011-clg:bot','2011-clg','bot','Chauster'),
('2011-clg:support','2011-clg','support','Elementz'),
('2011-gde:top','2011-gde','top','Kevin'),
('2011-gde:jungle','2011-gde','jungle','Zylor'),
('2011-gde:mid','2011-gde','mid','Reyk'),
('2011-gde:bot','2011-gde','bot','CndyPnda'),
('2011-gde:support','2011-gde','support','Nyph'),
('2011-xan:top','2011-xan','top','Vech'),
('2011-xan:jungle','2011-xan','jungle','Radeon6870'),
('2011-xan:mid','2011-xan','mid','Axion'),
('2011-xan:bot','2011-xan','bot','d4rkness'),
('2011-xan:support','2011-xan','support','iNtrigueD'),
('2011-tp:top','2011-tp','top','wormy'),
('2011-tp:jungle','2011-tp','jungle','dabe'),
('2011-tp:mid','2011-tp','mid','iddo'),
('2011-tp:bot','2011-tp','bot','vy'),
('2011-tp:support','2011-tp','support','gibo'),
('2012-tpa:top','2012-tpa','top','Stanley'),
('2012-tpa:jungle','2012-tpa','jungle','Lilballz'),
('2012-tpa:mid','2012-tpa','mid','Toyz'),
('2012-tpa:bot','2012-tpa','bot','bebe'),
('2012-tpa:support','2012-tpa','support','MiSTakE'),
('2012-frst:top','2012-frst','top','Shy'),
('2012-frst:jungle','2012-frst','jungle','CloudTemplar'),
('2012-frst:mid','2012-frst','mid','RapidStar'),
('2012-frst:bot','2012-frst','bot','Woong'),
('2012-frst:support','2012-frst','support','MadLife'),
('2012-clgeu:top','2012-clgeu','top','Wickd'),
('2012-clgeu:jungle','2012-clgeu','jungle','Snoopeh'),
('2012-clgeu:mid','2012-clgeu','mid','Froggen'),
('2012-clgeu:bot','2012-clgeu','bot','yellowpete'),
('2012-clgeu:support','2012-clgeu','support','Krepo'),
('2012-m5:top','2012-m5','top','Darien'),
('2012-m5:jungle','2012-m5','jungle','Diamondprox'),
('2012-m5:mid','2012-m5','mid','Alex Ich'),
('2012-m5:bot','2012-m5','bot','Genja'),
('2012-m5:support','2012-m5','support','GoSu Pepper'),
('2012-ig:top','2012-ig','top','Pdd'),
('2012-ig:jungle','2012-ig','jungle','illuSioN'),
('2012-ig:mid','2012-ig','mid','zz1tai'),
('2012-ig:bot','2012-ig','bot','Kid'),
('2012-ig:support','2012-ig','support','XiaoXiao'),
('2012-njs:top','2012-njs','top','MaKNooN'),
('2012-njs:jungle','2012-njs','jungle','Watch'),
('2012-njs:mid','2012-njs','mid','SSONG'),
('2012-njs:bot','2012-njs','bot','PraY'),
('2012-njs:support','2012-njs','support','Cain'),
('2012-we:top','2012-we','top','Caomei'),
('2012-we:jungle','2012-we','jungle','Clearlove'),
('2012-we:mid','2012-we','mid','Misaya'),
('2012-we:bot','2012-we','bot','Weixiao'),
('2012-we:support','2012-we','support','Fzzf'),
('2012-tsm:top','2012-tsm','top','Dyrus'),
('2012-tsm:jungle','2012-tsm','jungle','TheOddOne'),
('2012-tsm:mid','2012-tsm','mid','Reginald'),
('2012-tsm:bot','2012-tsm','bot','Chaox'),
('2012-tsm:support','2012-tsm','support','Xpecial'),
('2013-skt:top','2013-skt','top','Impact'),
('2013-skt:jungle','2013-skt','jungle','Bengi'),
('2013-skt:mid','2013-skt','mid','Faker'),
('2013-skt:bot','2013-skt','bot','Piglet'),
('2013-skt:support','2013-skt','support','PoohManDu'),
('2013-rc:top','2013-rc','top','GoDlike'),
('2013-rc:jungle','2013-rc','jungle','Lucky'),
('2013-rc:mid','2013-rc','mid','Wh1t3zZ'),
('2013-rc:bot','2013-rc','bot','Uzi'),
('2013-rc:support','2013-rc','support','Tabe'),
('2013-fnc:top','2013-fnc','top','sOAZ'),
('2013-fnc:jungle','2013-fnc','jungle','Cyanide'),
('2013-fnc:mid','2013-fnc','mid','xPeke'),
('2013-fnc:bot','2013-fnc','bot','Puszu'),
('2013-fnc:support','2013-fnc','support','YellOwStaR'),
('2013-njbs:top','2013-njbs','top','Expession'),
('2013-njbs:jungle','2013-njbs','jungle','Watch'),
('2013-njbs:mid','2013-njbs','mid','Nagne'),
('2013-njbs:bot','2013-njbs','bot','PraY'),
('2013-njbs:support','2013-njbs','support','Cain'),
('2013-gmb:top','2013-gmb','top','Darien'),
('2013-gmb:jungle','2013-gmb','jungle','Diamondprox'),
('2013-gmb:mid','2013-gmb','mid','Alex Ich'),
('2013-gmb:bot','2013-gmb','bot','Genja'),
('2013-gmb:support','2013-gmb','support','Voidle'),
('2013-omg:top','2013-omg','top','Gogoing'),
('2013-omg:jungle','2013-omg','jungle','LoveLin'),
('2013-omg:mid','2013-omg','mid','Cool'),
('2013-omg:bot','2013-omg','bot','San'),
('2013-omg:support','2013-omg','support','Bigpomelo'),
('2013-sso:top','2013-sso','top','Looper'),
('2013-sso:jungle','2013-sso','jungle','DanDy'),
('2013-sso:mid','2013-sso','mid','dade'),
('2013-sso:bot','2013-sso','bot','Imp'),
('2013-sso:support','2013-sso','support','Mata'),
('2013-c9:top','2013-c9','top','Balls'),
('2013-c9:jungle','2013-c9','jungle','Meteos'),
('2013-c9:mid','2013-c9','mid','Hai'),
('2013-c9:bot','2013-c9','bot','Sneaky'),
('2013-c9:support','2013-c9','support','LemonNation'),
('2014-ssw:top','2014-ssw','top','Looper'),
('2014-ssw:jungle','2014-ssw','jungle','Dandy'),
('2014-ssw:mid','2014-ssw','mid','PawN'),
('2014-ssw:bot','2014-ssw','bot','imp'),
('2014-ssw:support','2014-ssw','support','Mata'),
('2014-shrc:top','2014-shrc','top','Cola'),
('2014-shrc:jungle','2014-shrc','jungle','inSec'),
('2014-shrc:mid','2014-shrc','mid','corn'),
('2014-shrc:bot','2014-shrc','bot','Uzi'),
('2014-shrc:support','2014-shrc','support','Zero'),
('2014-ssb:top','2014-ssb','top','Acorn'),
('2014-ssb:jungle','2014-ssb','jungle','Spirit'),
('2014-ssb:mid','2014-ssb','mid','Dade'),
('2014-ssb:bot','2014-ssb','bot','Deft'),
('2014-ssb:support','2014-ssb','support','Heart'),
('2014-omg:top','2014-omg','top','Gogoing'),
('2014-omg:jungle','2014-omg','jungle','LoveLin'),
('2014-omg:mid','2014-omg','mid','Cool'),
('2014-omg:bot','2014-omg','bot','San'),
('2014-omg:support','2014-omg','support','Cloud'),
('2014-c9:top','2014-c9','top','Balls'),
('2014-c9:jungle','2014-c9','jungle','Meteos'),
('2014-c9:mid','2014-c9','mid','Hai'),
('2014-c9:bot','2014-c9','bot','Sneaky'),
('2014-c9:support','2014-c9','support','LemonNation'),
('2014-edg:top','2014-edg','top','Koro1'),
('2014-edg:jungle','2014-edg','jungle','Clearlove'),
('2014-edg:mid','2014-edg','mid','U'),
('2014-edg:bot','2014-edg','bot','NaMei'),
('2014-edg:support','2014-edg','support','Fzzf'),
('2014-njws:top','2014-njws','top','Save'),
('2014-njws:jungle','2014-njws','jungle','Watch'),
('2014-njws:mid','2014-njws','mid','Ggoong'),
('2014-njws:bot','2014-njws','bot','Zefa'),
('2014-njws:support','2014-njws','support','GorillA'),
('2014-tsm:top','2014-tsm','top','Dyrus'),
('2014-tsm:jungle','2014-tsm','jungle','Amazing'),
('2014-tsm:mid','2014-tsm','mid','Bjergsen'),
('2014-tsm:bot','2014-tsm','bot','WildTurtle'),
('2014-tsm:support','2014-tsm','support','Lustboy'),
('2015-skt:top','2015-skt','top','MaRin'),
('2015-skt:jungle','2015-skt','jungle','Bengi'),
('2015-skt:mid','2015-skt','mid','Faker'),
('2015-skt:bot','2015-skt','bot','Bang'),
('2015-skt:support','2015-skt','support','Wolf'),
('2015-koo:top','2015-koo','top','Smeb'),
('2015-koo:jungle','2015-koo','jungle','Hojin'),
('2015-koo:mid','2015-koo','mid','Kuro'),
('2015-koo:bot','2015-koo','bot','PraY'),
('2015-koo:support','2015-koo','support','GorillA'),
('2015-og:top','2015-og','top','sOAZ'),
('2015-og:jungle','2015-og','jungle','Amazing'),
('2015-og:mid','2015-og','mid','xPeke'),
('2015-og:bot','2015-og','bot','Niels'),
('2015-og:support','2015-og','support','Mithy'),
('2015-fnc:top','2015-fnc','top','Huni'),
('2015-fnc:jungle','2015-fnc','jungle','Reignover'),
('2015-fnc:mid','2015-fnc','mid','Febiven'),
('2015-fnc:bot','2015-fnc','bot','Rekkles'),
('2015-fnc:support','2015-fnc','support','YellOwStaR'),
('2015-ahq:top','2015-ahq','top','Ziv'),
('2015-ahq:jungle','2015-ahq','jungle','Mountain'),
('2015-ahq:mid','2015-ahq','mid','Westdoor'),
('2015-ahq:bot','2015-ahq','bot','AN'),
('2015-ahq:support','2015-ahq','support','Albis'),
('2015-edg:top','2015-edg','top','AmazingJ'),
('2015-edg:jungle','2015-edg','jungle','Clearlove'),
('2015-edg:mid','2015-edg','mid','PawN'),
('2015-edg:bot','2015-edg','bot','Deft'),
('2015-edg:support','2015-edg','support','Meiko'),
('2015-fw:top','2015-fw','top','Steak'),
('2015-fw:jungle','2015-fw','jungle','Karsa'),
('2015-fw:mid','2015-fw','mid','Maple'),
('2015-fw:bot','2015-fw','bot','NL'),
('2015-fw:support','2015-fw','support','SwordArt'),
('2015-kt:top','2015-kt','top','Ssumday'),
('2015-kt:jungle','2015-kt','jungle','Score'),
('2015-kt:mid','2015-kt','mid','Nagne'),
('2015-kt:bot','2015-kt','bot','Arrow'),
('2015-kt:support','2015-kt','support','Piccaboo'),
('2016-skt:top','2016-skt','top','Duke'),
('2016-skt:jungle','2016-skt','jungle','Bengi'),
('2016-skt:mid','2016-skt','mid','Faker'),
('2016-skt:bot','2016-skt','bot','Bang'),
('2016-skt:support','2016-skt','support','Wolf'),
('2016-ssg:top','2016-ssg','top','CuVee'),
('2016-ssg:jungle','2016-ssg','jungle','Ambition'),
('2016-ssg:mid','2016-ssg','mid','Crown'),
('2016-ssg:bot','2016-ssg','bot','Ruler'),
('2016-ssg:support','2016-ssg','support','CoreJJ'),
('2016-rox:top','2016-rox','top','Smeb'),
('2016-rox:jungle','2016-rox','jungle','Peanut'),
('2016-rox:mid','2016-rox','mid','Kuro'),
('2016-rox:bot','2016-rox','bot','PraY'),
('2016-rox:support','2016-rox','support','GorillA'),
('2016-h2k:top','2016-h2k','top','Odoamne'),
('2016-h2k:jungle','2016-h2k','jungle','Jankos'),
('2016-h2k:mid','2016-h2k','mid','Ryu'),
('2016-h2k:bot','2016-h2k','bot','FORG1VEN'),
('2016-h2k:support','2016-h2k','support','Vander'),
('2016-c9:top','2016-c9','top','Impact'),
('2016-c9:jungle','2016-c9','jungle','Meteos'),
('2016-c9:mid','2016-c9','mid','Jensen'),
('2016-c9:bot','2016-c9','bot','Sneaky'),
('2016-c9:support','2016-c9','support','Smoothie'),
('2016-rng:top','2016-rng','top','Looper'),
('2016-rng:jungle','2016-rng','jungle','Mlxg'),
('2016-rng:mid','2016-rng','mid','Xiaohu'),
('2016-rng:bot','2016-rng','bot','Uzi'),
('2016-rng:support','2016-rng','support','Mata'),
('2016-edg:top','2016-edg','top','Mouse'),
('2016-edg:jungle','2016-edg','jungle','Clearlove'),
('2016-edg:mid','2016-edg','mid','Scout'),
('2016-edg:bot','2016-edg','bot','Deft'),
('2016-edg:support','2016-edg','support','Meiko'),
('2016-anx:top','2016-anx','top','Smurf'),
('2016-anx:jungle','2016-anx','jungle','PvPStejos'),
('2016-anx:mid','2016-anx','mid','Kira'),
('2016-anx:bot','2016-anx','bot','aMiracle'),
('2016-anx:support','2016-anx','support','Likkrit'),
('2017-ssg:top','2017-ssg','top','CuVee'),
('2017-ssg:jungle','2017-ssg','jungle','Ambition'),
('2017-ssg:mid','2017-ssg','mid','Crown'),
('2017-ssg:bot','2017-ssg','bot','Ruler'),
('2017-ssg:support','2017-ssg','support','CoreJJ'),
('2017-skt:top','2017-skt','top','Huni'),
('2017-skt:jungle','2017-skt','jungle','Peanut'),
('2017-skt:mid','2017-skt','mid','Faker'),
('2017-skt:bot','2017-skt','bot','Bang'),
('2017-skt:support','2017-skt','support','Wolf'),
('2017-rng:top','2017-rng','top','Letme'),
('2017-rng:jungle','2017-rng','jungle','Mlxg'),
('2017-rng:mid','2017-rng','mid','Xiaohu'),
('2017-rng:bot','2017-rng','bot','Uzi'),
('2017-rng:support','2017-rng','support','Ming'),
('2017-we:top','2017-we','top','957'),
('2017-we:jungle','2017-we','jungle','Condi'),
('2017-we:mid','2017-we','mid','xiye'),
('2017-we:bot','2017-we','bot','Mystic'),
('2017-we:support','2017-we','support','Ben'),
('2017-lz:top','2017-lz','top','Khan'),
('2017-lz:jungle','2017-lz','jungle','Cuzz'),
('2017-lz:mid','2017-lz','mid','Bdd'),
('2017-lz:bot','2017-lz','bot','PraY'),
('2017-lz:support','2017-lz','support','GorillA'),
('2017-fnc:top','2017-fnc','top','sOAZ'),
('2017-fnc:jungle','2017-fnc','jungle','Broxah'),
('2017-fnc:mid','2017-fnc','mid','Caps'),
('2017-fnc:bot','2017-fnc','bot','Rekkles'),
('2017-fnc:support','2017-fnc','support','Jesiz'),
('2017-msf:top','2017-msf','top','Alphari'),
('2017-msf:jungle','2017-msf','jungle','Maxlore'),
('2017-msf:mid','2017-msf','mid','PowerOfEvil'),
('2017-msf:bot','2017-msf','bot','Hans sama'),
('2017-msf:support','2017-msf','support','IgNar'),
('2017-c9:top','2017-c9','top','Impact'),
('2017-c9:jungle','2017-c9','jungle','Contractz'),
('2017-c9:mid','2017-c9','mid','Jensen'),
('2017-c9:bot','2017-c9','bot','Sneaky'),
('2017-c9:support','2017-c9','support','Smoothie'),
('2018-ig:top','2018-ig','top','TheShy'),
('2018-ig:jungle','2018-ig','jungle','Ning'),
('2018-ig:mid','2018-ig','mid','Rookie'),
('2018-ig:bot','2018-ig','bot','JackeyLove'),
('2018-ig:support','2018-ig','support','Baolan'),
('2018-fnc:top','2018-fnc','top','Bwipo'),
('2018-fnc:jungle','2018-fnc','jungle','Broxah'),
('2018-fnc:mid','2018-fnc','mid','Caps'),
('2018-fnc:bot','2018-fnc','bot','Rekkles'),
('2018-fnc:support','2018-fnc','support','Hylissang'),
('2018-g2:top','2018-g2','top','Wunder'),
('2018-g2:jungle','2018-g2','jungle','Jankos'),
('2018-g2:mid','2018-g2','mid','Perkz'),
('2018-g2:bot','2018-g2','bot','Hjarnan'),
('2018-g2:support','2018-g2','support','Wadid'),
('2018-c9:top','2018-c9','top','Licorice'),
('2018-c9:jungle','2018-c9','jungle','Svenskeren'),
('2018-c9:mid','2018-c9','mid','Jensen'),
('2018-c9:bot','2018-c9','bot','Sneaky'),
('2018-c9:support','2018-c9','support','Zeyzal'),
('2018-rng:top','2018-rng','top','Letme'),
('2018-rng:jungle','2018-rng','jungle','Karsa'),
('2018-rng:mid','2018-rng','mid','Xiaohu'),
('2018-rng:bot','2018-rng','bot','Uzi'),
('2018-rng:support','2018-rng','support','Ming'),
('2018-kt:top','2018-kt','top','Smeb'),
('2018-kt:jungle','2018-kt','jungle','Score'),
('2018-kt:mid','2018-kt','mid','Ucal'),
('2018-kt:bot','2018-kt','bot','Deft'),
('2018-kt:support','2018-kt','support','Mata'),
('2018-edg:top','2018-edg','top','Ray'),
('2018-edg:jungle','2018-edg','jungle','Haro'),
('2018-edg:mid','2018-edg','mid','Scout'),
('2018-edg:bot','2018-edg','bot','iBoy'),
('2018-edg:support','2018-edg','support','Meiko'),
('2018-af:top','2018-af','top','Kiin'),
('2018-af:jungle','2018-af','jungle','Spirit'),
('2018-af:mid','2018-af','mid','Kuro'),
('2018-af:bot','2018-af','bot','Kramer'),
('2018-af:support','2018-af','support','TusiN'),
('2019-fpx:top','2019-fpx','top','GimGoon'),
('2019-fpx:jungle','2019-fpx','jungle','Tian'),
('2019-fpx:mid','2019-fpx','mid','Doinb'),
('2019-fpx:bot','2019-fpx','bot','Lwx'),
('2019-fpx:support','2019-fpx','support','Crisp'),
('2019-g2:top','2019-g2','top','Wunder'),
('2019-g2:jungle','2019-g2','jungle','Jankos'),
('2019-g2:mid','2019-g2','mid','Caps'),
('2019-g2:bot','2019-g2','bot','Perkz'),
('2019-g2:support','2019-g2','support','Mikyx'),
('2019-ig:top','2019-ig','top','TheShy'),
('2019-ig:jungle','2019-ig','jungle','Ning'),
('2019-ig:mid','2019-ig','mid','Rookie'),
('2019-ig:bot','2019-ig','bot','JackeyLove'),
('2019-ig:support','2019-ig','support','Baolan'),
('2019-skt:top','2019-skt','top','Khan'),
('2019-skt:jungle','2019-skt','jungle','Clid'),
('2019-skt:mid','2019-skt','mid','Faker'),
('2019-skt:bot','2019-skt','bot','Teddy'),
('2019-skt:support','2019-skt','support','Effort'),
('2019-fnc:top','2019-fnc','top','Bwipo'),
('2019-fnc:jungle','2019-fnc','jungle','Broxah'),
('2019-fnc:mid','2019-fnc','mid','Nemesis'),
('2019-fnc:bot','2019-fnc','bot','Rekkles'),
('2019-fnc:support','2019-fnc','support','Hylissang'),
('2019-grf:top','2019-grf','top','Sword'),
('2019-grf:jungle','2019-grf','jungle','Tarzan'),
('2019-grf:mid','2019-grf','mid','Chovy'),
('2019-grf:bot','2019-grf','bot','Viper'),
('2019-grf:support','2019-grf','support','Lehends'),
('2019-spy:top','2019-spy','top','Vizicsacsi'),
('2019-spy:jungle','2019-spy','jungle','Xerxe'),
('2019-spy:mid','2019-spy','mid','Humanoid'),
('2019-spy:bot','2019-spy','bot','Kobbe'),
('2019-spy:support','2019-spy','support','Norskeren'),
('2019-dwg:top','2019-dwg','top','Nuguri'),
('2019-dwg:jungle','2019-dwg','jungle','Canyon'),
('2019-dwg:mid','2019-dwg','mid','ShowMaker'),
('2019-dwg:bot','2019-dwg','bot','Nuclear'),
('2019-dwg:support','2019-dwg','support','BeryL'),
('2020-dwg:top','2020-dwg','top','Nuguri'),
('2020-dwg:jungle','2020-dwg','jungle','Canyon'),
('2020-dwg:mid','2020-dwg','mid','ShowMaker'),
('2020-dwg:bot','2020-dwg','bot','Ghost'),
('2020-dwg:support','2020-dwg','support','BeryL'),
('2020-sn:top','2020-sn','top','Bin'),
('2020-sn:jungle','2020-sn','jungle','SofM'),
('2020-sn:mid','2020-sn','mid','Angel'),
('2020-sn:bot','2020-sn','bot','huanfeng'),
('2020-sn:support','2020-sn','support','SwordArt'),
('2020-g2:top','2020-g2','top','Wunder'),
('2020-g2:jungle','2020-g2','jungle','Jankos'),
('2020-g2:mid','2020-g2','mid','Caps'),
('2020-g2:bot','2020-g2','bot','Perkz'),
('2020-g2:support','2020-g2','support','Mikyx'),
('2020-tes:top','2020-tes','top','369'),
('2020-tes:jungle','2020-tes','jungle','Karsa'),
('2020-tes:mid','2020-tes','mid','knight'),
('2020-tes:bot','2020-tes','bot','JackeyLove'),
('2020-tes:support','2020-tes','support','yuyanjia'),
('2020-drx:top','2020-drx','top','Doran'),
('2020-drx:jungle','2020-drx','jungle','Pyosik'),
('2020-drx:mid','2020-drx','mid','Chovy'),
('2020-drx:bot','2020-drx','bot','Deft'),
('2020-drx:support','2020-drx','support','Keria'),
('2020-gen:top','2020-gen','top','Rascal'),
('2020-gen:jungle','2020-gen','jungle','Clid'),
('2020-gen:mid','2020-gen','mid','Bdd'),
('2020-gen:bot','2020-gen','bot','Ruler'),
('2020-gen:support','2020-gen','support','Life'),
('2020-fnc:top','2020-fnc','top','Bwipo'),
('2020-fnc:jungle','2020-fnc','jungle','Selfmade'),
('2020-fnc:mid','2020-fnc','mid','Nemesis'),
('2020-fnc:bot','2020-fnc','bot','Rekkles'),
('2020-fnc:support','2020-fnc','support','Hylissang'),
('2020-jdg:top','2020-jdg','top','Zoom'),
('2020-jdg:jungle','2020-jdg','jungle','Kanavi'),
('2020-jdg:mid','2020-jdg','mid','Yagao'),
('2020-jdg:bot','2020-jdg','bot','LokeN'),
('2020-jdg:support','2020-jdg','support','LvMao'),
('2021-edg:top','2021-edg','top','Flandre'),
('2021-edg:jungle','2021-edg','jungle','JieJie'),
('2021-edg:mid','2021-edg','mid','Scout'),
('2021-edg:bot','2021-edg','bot','Viper'),
('2021-edg:support','2021-edg','support','Meiko'),
('2021-dk:top','2021-dk','top','Khan'),
('2021-dk:jungle','2021-dk','jungle','Canyon'),
('2021-dk:mid','2021-dk','mid','ShowMaker'),
('2021-dk:bot','2021-dk','bot','Ghost'),
('2021-dk:support','2021-dk','support','BeryL'),
('2021-t1:top','2021-t1','top','Canna'),
('2021-t1:jungle','2021-t1','jungle','Oner'),
('2021-t1:mid','2021-t1','mid','Faker'),
('2021-t1:bot','2021-t1','bot','Gumayusi'),
('2021-t1:support','2021-t1','support','Keria'),
('2021-gen:top','2021-gen','top','Rascal'),
('2021-gen:jungle','2021-gen','jungle','Clid'),
('2021-gen:mid','2021-gen','mid','Bdd'),
('2021-gen:bot','2021-gen','bot','Ruler'),
('2021-gen:support','2021-gen','support','Life'),
('2021-rng:top','2021-rng','top','Xiaohu'),
('2021-rng:jungle','2021-rng','jungle','Wei'),
('2021-rng:mid','2021-rng','mid','Cryin'),
('2021-rng:bot','2021-rng','bot','GALA'),
('2021-rng:support','2021-rng','support','Ming'),
('2021-hle:top','2021-hle','top','Morgan'),
('2021-hle:jungle','2021-hle','jungle','Willer'),
('2021-hle:mid','2021-hle','mid','Chovy'),
('2021-hle:bot','2021-hle','bot','Deft'),
('2021-hle:support','2021-hle','support','Vsta'),
('2021-mad:top','2021-mad','top','Armut'),
('2021-mad:jungle','2021-mad','jungle','Elyoya'),
('2021-mad:mid','2021-mad','mid','Humanoid'),
('2021-mad:bot','2021-mad','bot','Carzzy'),
('2021-mad:support','2021-mad','support','Kaiser'),
('2021-c9:top','2021-c9','top','Fudge'),
('2021-c9:jungle','2021-c9','jungle','Blaber'),
('2021-c9:mid','2021-c9','mid','Perkz'),
('2021-c9:bot','2021-c9','bot','Zven'),
('2021-c9:support','2021-c9','support','Vulcan'),
('2022-drx:top','2022-drx','top','Kingen'),
('2022-drx:jungle','2022-drx','jungle','Pyosik'),
('2022-drx:mid','2022-drx','mid','Zeka'),
('2022-drx:bot','2022-drx','bot','Deft'),
('2022-drx:support','2022-drx','support','BeryL'),
('2022-t1:top','2022-t1','top','Zeus'),
('2022-t1:jungle','2022-t1','jungle','Oner'),
('2022-t1:mid','2022-t1','mid','Faker'),
('2022-t1:bot','2022-t1','bot','Gumayusi'),
('2022-t1:support','2022-t1','support','Keria'),
('2022-gen:top','2022-gen','top','Doran'),
('2022-gen:jungle','2022-gen','jungle','Peanut'),
('2022-gen:mid','2022-gen','mid','Chovy'),
('2022-gen:bot','2022-gen','bot','Ruler'),
('2022-gen:support','2022-gen','support','Lehends'),
('2022-jdg:top','2022-jdg','top','369'),
('2022-jdg:jungle','2022-jdg','jungle','Kanavi'),
('2022-jdg:mid','2022-jdg','mid','Yagao'),
('2022-jdg:bot','2022-jdg','bot','Hope'),
('2022-jdg:support','2022-jdg','support','Missing'),
('2022-edg:top','2022-edg','top','Flandre'),
('2022-edg:jungle','2022-edg','jungle','JieJie'),
('2022-edg:mid','2022-edg','mid','Scout'),
('2022-edg:bot','2022-edg','bot','Viper'),
('2022-edg:support','2022-edg','support','Meiko'),
('2022-rng:top','2022-rng','top','Breathe'),
('2022-rng:jungle','2022-rng','jungle','Wei'),
('2022-rng:mid','2022-rng','mid','Xiaohu'),
('2022-rng:bot','2022-rng','bot','GALA'),
('2022-rng:support','2022-rng','support','Ming'),
('2022-dk:top','2022-dk','top','Nuguri'),
('2022-dk:jungle','2022-dk','jungle','Canyon'),
('2022-dk:mid','2022-dk','mid','ShowMaker'),
('2022-dk:bot','2022-dk','bot','deokdam'),
('2022-dk:support','2022-dk','support','Kellin'),
('2022-rge:top','2022-rge','top','Odoamne'),
('2022-rge:jungle','2022-rge','jungle','Malrang'),
('2022-rge:mid','2022-rge','mid','Larssen'),
('2022-rge:bot','2022-rge','bot','Comp'),
('2022-rge:support','2022-rge','support','Trymbi'),
('2023-t1:top','2023-t1','top','Zeus'),
('2023-t1:jungle','2023-t1','jungle','Oner'),
('2023-t1:mid','2023-t1','mid','Faker'),
('2023-t1:bot','2023-t1','bot','Gumayusi'),
('2023-t1:support','2023-t1','support','Keria'),
('2023-wbg:top','2023-wbg','top','TheShy'),
('2023-wbg:jungle','2023-wbg','jungle','Weiwei'),
('2023-wbg:mid','2023-wbg','mid','Xiaohu'),
('2023-wbg:bot','2023-wbg','bot','Light'),
('2023-wbg:support','2023-wbg','support','Crisp'),
('2023-blg:top','2023-blg','top','Bin'),
('2023-blg:jungle','2023-blg','jungle','XUN'),
('2023-blg:mid','2023-blg','mid','Yagao'),
('2023-blg:bot','2023-blg','bot','Elk'),
('2023-blg:support','2023-blg','support','ON'),
('2023-jdg:top','2023-jdg','top','369'),
('2023-jdg:jungle','2023-jdg','jungle','Kanavi'),
('2023-jdg:mid','2023-jdg','mid','knight'),
('2023-jdg:bot','2023-jdg','bot','Ruler'),
('2023-jdg:support','2023-jdg','support','MISSING'),
('2023-gen:top','2023-gen','top','Doran'),
('2023-gen:jungle','2023-gen','jungle','Peanut'),
('2023-gen:mid','2023-gen','mid','Chovy'),
('2023-gen:bot','2023-gen','bot','Peyz'),
('2023-gen:support','2023-gen','support','Delight'),
('2023-lng:top','2023-lng','top','Zika'),
('2023-lng:jungle','2023-lng','jungle','Tarzan'),
('2023-lng:mid','2023-lng','mid','Scout'),
('2023-lng:bot','2023-lng','bot','GALA'),
('2023-lng:support','2023-lng','support','Hang'),
('2023-kt:top','2023-kt','top','Kiin'),
('2023-kt:jungle','2023-kt','jungle','Cuzz'),
('2023-kt:mid','2023-kt','mid','Bdd'),
('2023-kt:bot','2023-kt','bot','Aiming'),
('2023-kt:support','2023-kt','support','Lehends'),
('2023-nrg:top','2023-nrg','top','Dhokla'),
('2023-nrg:jungle','2023-nrg','jungle','Contractz'),
('2023-nrg:mid','2023-nrg','mid','Palafox'),
('2023-nrg:bot','2023-nrg','bot','FBI'),
('2023-nrg:support','2023-nrg','support','IgNar'),
('2024-t1:top','2024-t1','top','Zeus'),
('2024-t1:jungle','2024-t1','jungle','Oner'),
('2024-t1:mid','2024-t1','mid','Faker'),
('2024-t1:bot','2024-t1','bot','Gumayusi'),
('2024-t1:support','2024-t1','support','Keria'),
('2024-blg:top','2024-blg','top','Bin'),
('2024-blg:jungle','2024-blg','jungle','XUN'),
('2024-blg:mid','2024-blg','mid','knight'),
('2024-blg:bot','2024-blg','bot','Elk'),
('2024-blg:support','2024-blg','support','ON'),
('2024-gen:top','2024-gen','top','Kiin'),
('2024-gen:jungle','2024-gen','jungle','Canyon'),
('2024-gen:mid','2024-gen','mid','Chovy'),
('2024-gen:bot','2024-gen','bot','Peyz'),
('2024-gen:support','2024-gen','support','Lehends'),
('2024-wbg:top','2024-wbg','top','Breathe'),
('2024-wbg:jungle','2024-wbg','jungle','Tarzan'),
('2024-wbg:mid','2024-wbg','mid','Xiaohu'),
('2024-wbg:bot','2024-wbg','bot','Light'),
('2024-wbg:support','2024-wbg','support','Crisp'),
('2024-fly:top','2024-fly','top','Bwipo'),
('2024-fly:jungle','2024-fly','jungle','Inspired'),
('2024-fly:mid','2024-fly','mid','Quad'),
('2024-fly:bot','2024-fly','bot','Massu'),
('2024-fly:support','2024-fly','support','Busio'),
('2024-hle:top','2024-hle','top','Doran'),
('2024-hle:jungle','2024-hle','jungle','Peanut'),
('2024-hle:mid','2024-hle','mid','Zeka'),
('2024-hle:bot','2024-hle','bot','Viper'),
('2024-hle:support','2024-hle','support','Delight'),
('2024-lng:top','2024-lng','top','Zika'),
('2024-lng:jungle','2024-lng','jungle','Weiwei'),
('2024-lng:mid','2024-lng','mid','Scout'),
('2024-lng:bot','2024-lng','bot','GALA'),
('2024-lng:support','2024-lng','support','Hang'),
('2024-tes:top','2024-tes','top','369'),
('2024-tes:jungle','2024-tes','jungle','Tian'),
('2024-tes:mid','2024-tes','mid','Creme'),
('2024-tes:bot','2024-tes','bot','JackeyLove'),
('2024-tes:support','2024-tes','support','Meiko'),
('2025-t1:top','2025-t1','top','Doran'),
('2025-t1:jungle','2025-t1','jungle','Oner'),
('2025-t1:mid','2025-t1','mid','Faker'),
('2025-t1:bot','2025-t1','bot','Gumayusi'),
('2025-t1:support','2025-t1','support','Keria'),
('2025-kt:top','2025-kt','top','PerfecT'),
('2025-kt:jungle','2025-kt','jungle','Cuzz'),
('2025-kt:mid','2025-kt','mid','Bdd'),
('2025-kt:bot','2025-kt','bot','deokdam'),
('2025-kt:support','2025-kt','support','Peter'),
('2025-gen:top','2025-gen','top','Kiin'),
('2025-gen:jungle','2025-gen','jungle','Canyon'),
('2025-gen:mid','2025-gen','mid','Chovy'),
('2025-gen:bot','2025-gen','bot','Ruler'),
('2025-gen:support','2025-gen','support','Duro'),
('2025-tes:top','2025-tes','top','369'),
('2025-tes:jungle','2025-tes','jungle','Kanavi'),
('2025-tes:mid','2025-tes','mid','Creme'),
('2025-tes:bot','2025-tes','bot','JackeyLove'),
('2025-tes:support','2025-tes','support','Hang'),
('2025-al:top','2025-al','top','Flandre'),
('2025-al:jungle','2025-al','jungle','Tarzan'),
('2025-al:mid','2025-al','mid','Shanks'),
('2025-al:bot','2025-al','bot','Hope'),
('2025-al:support','2025-al','support','Kael'),
('2025-cfo:top','2025-cfo','top','Rest'),
('2025-cfo:jungle','2025-cfo','jungle','JunJia'),
('2025-cfo:mid','2025-cfo','mid','HongQ'),
('2025-cfo:bot','2025-cfo','bot','Doggo'),
('2025-cfo:support','2025-cfo','support','Kaiwing'),
('2025-g2:top','2025-g2','top','BrokenBlade'),
('2025-g2:jungle','2025-g2','jungle','SkewMond'),
('2025-g2:mid','2025-g2','mid','Caps'),
('2025-g2:bot','2025-g2','bot','Hans Sama'),
('2025-g2:support','2025-g2','support','Labrov'),
('2025-hle:top','2025-hle','top','Zeus'),
('2025-hle:jungle','2025-hle','jungle','Peanut'),
('2025-hle:mid','2025-hle','mid','Zeka'),
('2025-hle:bot','2025-hle','bot','Viper'),
('2025-hle:support','2025-hle','support','Delight');
-- DRAFT_PLAYERS_END

-- ---------- funciones internas ----------
-- Nombres (en minúsculas) de los jugadores de un equipo en construcción.
create or replace function private.draft_names(p_roster jsonb)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(lower(p.name)), '{}')
  from public.draft_players p
  where p.key in (select value from jsonb_each_text(p_roster));
$$;

-- 3 equipos al azar con algún jugador elegible.
create or replace function private.draft_new_options(p_roster jsonb)
returns text[]
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce(array_agg(team_id), '{}') from (
    select team_id from (
      select distinct p.team_id from public.draft_players p
      where not (p_roster ? p.role) and lower(p.name) <> all (private.draft_names(p_roster))
    ) t order by random() limit 3
  ) x;
$$;

-- Completa al azar las posiciones vacías.
create or replace function private.draft_fill(p_roster jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r text;
  k text;
  v_roster jsonb := coalesce(p_roster, '{}'::jsonb);
begin
  foreach r in array array['top', 'jungle', 'mid', 'bot', 'support'] loop
    if not (v_roster ? r) then
      select p.key into k from public.draft_players p
      where p.role = r and lower(p.name) <> all (private.draft_names(v_roster))
      order by random() limit 1;
      v_roster := v_roster || jsonb_build_object(r, k);
    end if;
  end loop;
  return v_roster;
end;
$$;

create or replace function private.draft_my_seat(p_code text, p_token text)
returns public.draft_seats
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.draft_seats;
begin
  select * into s from public.draft_seats where lobby = upper(p_code) and token = p_token;
  if not found then
    raise exception 'No estás en esta sala' using errcode = '28000';
  end if;
  return s;
end;
$$;

-- Avanza la sala: cuenta atrás del último jugador y paso a la simulación.
create or replace function private.draft_advance(p_code text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.draft_lobbies;
  v_left int;
begin
  select * into l from public.draft_lobbies where code = p_code for update;
  if not found or l.official or l.status <> 'drafting' then
    return;
  end if;
  if l.countdown_ends_at is not null and now() >= l.countdown_ends_at then
    update public.draft_seats set roster = private.draft_fill(roster), options = '{}', done = true
     where lobby = p_code and not done;
  end if;
  select count(*) into v_left from public.draft_seats where lobby = p_code and not done;
  if v_left = 0 then
    update public.draft_lobbies set status = 'simulating', sim_started_at = now() + interval '3 seconds', countdown_ends_at = null
     where code = p_code;
  elsif v_left = 1 and l.countdown_ends_at is null and (select count(*) from public.draft_seats where lobby = p_code) > 1 then
    update public.draft_lobbies set countdown_ends_at = now() + interval '60 seconds' where code = p_code;
  end if;
end;
$$;

-- Nombre con el que juega quien llama (con cuenta, su usuario).
create or replace function private.draft_player_name(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text := (select display_name from public.profiles where id = auth.uid());
begin
  v := coalesce(v, trim(coalesce(p_name, '')));
  if char_length(v) not between 2 and 20 then
    raise exception 'Escribe un nombre de 2 a 20 caracteres';
  end if;
  return v;
end;
$$;

-- ---------- salas ----------
create or replace function public.draft_create(p_name text, p_size int, p_level text, p_token text, p_player text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  delete from public.draft_lobbies where not official and created_at < now() - interval '1 day';
  if p_size not in (8, 16) or p_level not in ('facil', 'medio', 'imposible') then
    raise exception 'Configuración de sala no válida';
  end if;
  loop
    v_code := (select string_agg(substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.draft_lobbies where code = v_code);
  end loop;
  insert into public.draft_lobbies (code, name, size, level, host_token)
  values (v_code, coalesce(nullif(left(trim(coalesce(p_name, '')), 40), ''), 'Sala ' || v_code), p_size, p_level, p_token);
  insert into public.draft_seats (lobby, seat, token, user_id, name)
  values (v_code, 1, p_token, auth.uid(), private.draft_player_name(p_player));
  return v_code;
end;
$$;

create or replace function public.draft_join(p_code text, p_token text, p_player text)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.draft_lobbies;
  v_seat int;
begin
  select * into l from public.draft_lobbies where code = upper(p_code) for update;
  if not found then
    raise exception 'No existe ninguna sala con ese código';
  end if;
  select seat into v_seat from public.draft_seats where lobby = l.code and token = p_token;
  if found then
    return v_seat;
  end if;
  if l.official then
    if not private.is_approved() or not exists (select 1 from public.profiles where id = auth.uid() and verified) then
      raise exception 'La sala oficial es solo para cuentas verificadas' using errcode = '28000';
    end if;
    select seat into v_seat from public.draft_seats where lobby = l.code and user_id = auth.uid();
    if found then
      update public.draft_seats set token = p_token where lobby = l.code and seat = v_seat;
      return v_seat;
    end if;
    if l.status <> 'drafting' then
      raise exception 'La sala oficial de esta semana ya empezó';
    end if;
  elsif l.status <> 'waiting' then
    raise exception 'Esta sala ya empezó';
  end if;
  if (select count(*) from public.draft_seats where lobby = l.code) >= l.size then
    raise exception 'La sala está llena';
  end if;
  v_seat := coalesce((select max(seat) from public.draft_seats where lobby = l.code), 0) + 1;
  insert into public.draft_seats (lobby, seat, token, user_id, name, options)
  values (l.code, v_seat, p_token, auth.uid(), private.draft_player_name(p_player),
          case when l.official then private.draft_new_options('{}'::jsonb) else '{}' end);
  return v_seat;
end;
$$;

create or replace function public.draft_ready(p_code text, p_token text, p_ready boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.draft_seats := private.draft_my_seat(p_code, p_token);
begin
  update public.draft_seats set ready = coalesce(p_ready, false) where lobby = s.lobby and seat = s.seat;
end;
$$;

create or replace function public.draft_leave(p_code text, p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.draft_seats := private.draft_my_seat(p_code, p_token);
  l public.draft_lobbies;
begin
  select * into l from public.draft_lobbies where code = s.lobby;
  if l.status <> 'waiting' then
    raise exception 'La sala ya empezó';
  end if;
  if l.host_token = p_token then
    delete from public.draft_lobbies where code = l.code;
  else
    delete from public.draft_seats where lobby = s.lobby and seat = s.seat;
  end if;
end;
$$;

create or replace function public.draft_start(p_code text, p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.draft_lobbies;
begin
  select * into l from public.draft_lobbies where code = upper(p_code) for update;
  if not found then
    raise exception 'No existe esa sala';
  end if;
  if l.official then
    perform private.require_admin();
    if l.status <> 'drafting' then
      raise exception 'La sala oficial ya empezó';
    end if;
    if not exists (select 1 from public.draft_seats where lobby = l.code) then
      raise exception 'Todavía no ha entrado nadie';
    end if;
    update public.draft_seats set roster = private.draft_fill(roster), options = '{}', done = true
     where lobby = l.code and not done;
    update public.draft_lobbies
       set status = 'simulating', seed = md5(random()::text || clock_timestamp()::text),
           level = coalesce((select value from private.settings where key = 'draft_bot_level'), 'medio'),
           sim_started_at = now() + interval '3 seconds'
     where code = l.code;
    return;
  end if;
  if l.host_token is distinct from p_token then
    raise exception 'Solo quien creó la sala puede empezar' using errcode = '28000';
  end if;
  if l.status <> 'waiting' then
    raise exception 'La sala ya empezó';
  end if;
  if exists (select 1 from public.draft_seats where lobby = l.code and not ready) then
    raise exception 'Todavía hay jugadores sin pulsar "Listo"';
  end if;
  update public.draft_seats set options = private.draft_new_options(roster) where lobby = l.code;
  update public.draft_lobbies set status = 'drafting', seed = md5(random()::text || clock_timestamp()::text)
   where code = l.code;
end;
$$;

create or replace function public.draft_pick(p_code text, p_token text, p_key text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.draft_seats := private.draft_my_seat(p_code, p_token);
  l public.draft_lobbies;
  p public.draft_players;
  v_roster jsonb;
  v_done boolean;
begin
  select * into l from public.draft_lobbies where code = s.lobby;
  if l.status <> 'drafting' or s.done then
    raise exception 'Ya no puedes elegir';
  end if;
  select * into p from public.draft_players where key = p_key;
  if not found or not (p.team_id = any (s.options)) then
    raise exception 'Ese jugador no está entre tus opciones';
  end if;
  if s.roster ? p.role or lower(p.name) = any (private.draft_names(s.roster)) then
    raise exception 'No puedes elegir a ese jugador';
  end if;
  v_roster := s.roster || jsonb_build_object(p.role, p.key);
  v_done := (select count(*) from jsonb_object_keys(v_roster)) = 5;
  update public.draft_seats
     set roster = v_roster, done = v_done,
         options = case when v_done then '{}' else private.draft_new_options(v_roster) end
   where lobby = s.lobby and seat = s.seat;
  perform private.draft_advance(s.lobby);
end;
$$;

create or replace function public.draft_reroll(p_code text, p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.draft_seats := private.draft_my_seat(p_code, p_token);
begin
  if s.done or s.rerolls >= 2 or (select status from public.draft_lobbies where code = s.lobby) <> 'drafting' then
    raise exception 'No te quedan rerolls';
  end if;
  update public.draft_seats set rerolls = rerolls + 1, options = private.draft_new_options(roster)
   where lobby = s.lobby and seat = s.seat;
end;
$$;

-- Estado de la sala. Los equipos de los demás solo se ven cuando empieza la simulación.
create or replace function public.draft_state(p_code text, p_token text default null)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.draft_lobbies;
  me public.draft_seats;
begin
  perform private.draft_advance(upper(p_code));
  select * into l from public.draft_lobbies where code = upper(p_code);
  if not found then
    return null;
  end if;
  select * into me from public.draft_seats where lobby = l.code and token = p_token;
  return json_build_object(
    'code', l.code, 'name', l.name, 'size', l.size, 'level', l.level, 'official', l.official, 'week_id', l.week_id,
    'status', l.status, 'seed', case when l.status = 'simulating' then l.seed end,
    'countdown_ends_at', l.countdown_ends_at, 'sim_started_at', l.sim_started_at, 'champion_seat', l.champion_seat,
    'now', now(), 'host', l.host_token is not null and l.host_token = p_token,
    'me', case when me.seat is null then null else json_build_object(
      'seat', me.seat, 'ready', me.ready, 'done', me.done, 'roster', me.roster, 'options', me.options, 'rerolls', me.rerolls) end,
    'seats', coalesce((
      select json_agg(json_build_object(
        'seat', s.seat, 'name', s.name, 'ready', s.ready, 'done', s.done,
        'picks', (select count(*) from jsonb_object_keys(s.roster)),
        'verified', coalesce(pr.verified, false),
        'roster', case when l.status = 'simulating' then s.roster end) order by s.seat)
      from public.draft_seats s left join public.profiles pr on pr.id = s.user_id
      where s.lobby = l.code), '[]'::json)
  );
end;
$$;

-- ---------- sala oficial y copas ----------
-- Código de la sala oficial de la semana en curso (la crea si hace falta).
create or replace function public.draft_official()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_week int := private.current_week();
  v_code text := 'W' || v_week::text;
begin
  if now() < public.week_start(v_week) then
    return null;
  end if;
  insert into public.draft_lobbies (code, name, size, level, official, week_id, status)
  values (v_code, 'Sala oficial', 16, coalesce((select value from private.settings where key = 'draft_bot_level'), 'medio'),
          true, v_week, 'drafting')
  on conflict do nothing;
  return v_code;
end;
$$;

-- El administrador da la copa al campeón (lo calcula su navegador con la semilla del servidor).
create or replace function public.draft_award(p_code text, p_seat int)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.draft_lobbies;
  v_user uuid;
begin
  perform private.require_admin();
  select * into l from public.draft_lobbies where code = upper(p_code) for update;
  if not found or not l.official or l.status <> 'simulating' then
    raise exception 'Esa sala oficial no se ha jugado';
  end if;
  if l.champion_seat is not null then
    return; -- la copa de esa semana ya se entregó
  end if;
  update public.draft_lobbies set champion_seat = greatest(coalesce(p_seat, 0), 0) where code = l.code;
  if p_seat is null or p_seat <= 0 then
    return; -- ganó un bot: no hay copa
  end if;
  select user_id into v_user from public.draft_seats where lobby = l.code and seat = p_seat;
  if v_user is not null then
    insert into public.draft_cups (week_id, lobby, user_id) values (l.week_id, l.code, v_user) on conflict do nothing;
  end if;
end;
$$;

create or replace function public.draft_cup_ranking()
returns table (name text, verified boolean, cups bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.display_name, pr.verified, count(*)
  from public.draft_cups c join public.profiles pr on pr.id = c.user_id
  where pr.status <> 'blocked'
  group by pr.id, pr.display_name, pr.verified
  order by count(*) desc, min(c.awarded_at) asc;
$$;

create or replace function public.draft_admin()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return json_build_object(
    'level', coalesce((select value from private.settings where key = 'draft_bot_level'), 'medio'),
    'official', coalesce((
      select json_agg(json_build_object('code', l.code, 'week_id', l.week_id, 'status', l.status,
               'champion_seat', l.champion_seat, 'sim_started_at', l.sim_started_at,
               'players', (select count(*) from public.draft_seats s where s.lobby = l.code)) order by l.week_id desc)
      from (select * from public.draft_lobbies where official order by week_id desc limit 8) l), '[]'::json)
  );
end;
$$;

create or replace function public.draft_set_level(p_level text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_level not in ('facil', 'medio', 'imposible') then
    raise exception 'Dificultad no válida';
  end if;
  insert into private.settings (key, value) values ('draft_bot_level', p_level)
  on conflict (key) do update set value = excluded.value;
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
    'public.admin_set_verified(uuid, boolean)',
    'public.admin_set_password(uuid, text)',
    'public.admin_week(int)',
    'public.admin_delete_play(int, uuid)',
    'public.admin_set_week(int, text, jsonb)',
    'public.get_logs(int)',
    'public.clear_logs()',
    'public.draft_create(text, int, text, text, text)',
    'public.draft_join(text, text, text)',
    'public.draft_ready(text, text, boolean)',
    'public.draft_leave(text, text)',
    'public.draft_start(text, text)',
    'public.draft_pick(text, text, text)',
    'public.draft_reroll(text, text)',
    'public.draft_state(text, text)',
    'public.draft_official()',
    'public.draft_award(text, int)',
    'public.draft_cup_ranking()',
    'public.draft_admin()',
    'public.draft_set_level(text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end;
$$;
