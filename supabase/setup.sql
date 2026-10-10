-- =====================================================================
--  Cultura General · base de datos en Supabase
--
--  Cómo usarlo:
--    1. Supabase → tu proyecto → SQL Editor → New query.
--    2. Pega TODO este archivo.
--    3. Cambia el PIN en la línea marcada con ▶ (justo debajo).
--       Hazlo SOLO en Supabase, no en GitHub: el repositorio es público.
--    4. Pulsa Run. Debe terminar con "Success. No rows returned".
--
--  Se puede ejecutar varias veces sin perder datos.
-- =====================================================================

-- ▶ PIN del Registro: escribe el tuyo entre las comillas (mínimo 6 caracteres).
select set_config('app.pin', 'CAMBIA_ESTE_PIN', false);


-- ---------------------------------------------------------------------
-- Ajustes privados (no accesibles desde la web)
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.settings (
  key   text primary key,
  value text not null
);

-- Si dejas 'CAMBIA_ESTE_PIN', no se sobrescribe un PIN que ya hubieras puesto antes.
insert into private.settings (key, value)
values ('admin_pin', current_setting('app.pin'))
on conflict (key) do update
  set value = excluded.value
  where excluded.value <> 'CAMBIA_ESTE_PIN';


-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

-- Ranking: la mejor partida de cada nombre en cada modo/sala.
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
  constraint scores_board  check (board ~ '^(clasico|aleatorio|sala_[0-9A-Z]{6})$'),
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
  device_id       text,
  fp              text,
  ip              text,
  ua              text,
  names_on_device jsonb,
  constraint logs_text check (char_length(name) between 2 and 20
                              and char_length(name_key) <= 40
                              and char_length(mode) <= 20
                              and char_length(board) <= 20
                              and char_length(coalesce(board_label, '')) <= 40
                              and char_length(coalesce(device_id, '')) <= 64
                              and char_length(coalesce(fp, '')) <= 64
                              and char_length(coalesce(ip, '')) <= 64
                              and char_length(coalesce(ua, '')) <= 80),
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

-- Salas.
create table if not exists public.lobbies (
  code       text primary key,
  name       text not null,
  cats       text[] not null,
  created_by text,
  created_at timestamptz not null default now(),
  constraint lobbies_code check (code ~ '^[0-9A-Z]{6}$'),
  constraint lobbies_name check (char_length(name) between 1 and 40 and char_length(coalesce(created_by, '')) <= 20),
  constraint lobbies_cats check (cardinality(cats) between 1 and 20)
);
create index if not exists lobbies_created_idx on public.lobbies (created_at desc);


-- ---------------------------------------------------------------------
-- El registro guarda la hora y la IP que ve el servidor (no se pueden falsear desde la web)
-- ---------------------------------------------------------------------
create or replace function private.logs_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  h   json;
  srv text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  if h is not null then
    srv := coalesce(h ->> 'cf-connecting-ip',
                    nullif(trim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''),
                    h ->> 'x-real-ip');
  end if;
  if srv is not null then
    new.ip := left(srv, 64);
  end if;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists logs_before_insert on public.logs;
create trigger logs_before_insert
  before insert on public.logs
  for each row execute function private.logs_before_insert();


-- ---------------------------------------------------------------------
-- Permisos: la web puede leer el ranking y las salas, crear salas y
-- añadir partidas al registro. NO puede leer, cambiar ni borrar el registro.
-- ---------------------------------------------------------------------
alter table public.scores  enable row level security;
alter table public.logs    enable row level security;
alter table public.lobbies enable row level security;

revoke all on public.scores, public.logs, public.lobbies from anon, authenticated;
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
-- Funciones que llama la web
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

-- Comprueba el PIN del Registro: devuelve 'ok', 'bad' o 'unset'.
create or replace function public.check_admin_pin(p_pin text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text;
begin
  select value into v from private.settings where key = 'admin_pin';
  if v is null or v = 'CAMBIA_ESTE_PIN' or char_length(v) < 4 then
    return 'unset';
  end if;
  if p_pin is distinct from v then
    perform pg_sleep(1); -- frena a quien intente adivinarlo probando muchos PIN
    return 'bad';
  end if;
  return 'ok';
end;
$$;

-- Devuelve el registro (solo con el PIN correcto).
create or replace function public.get_logs(p_pin text, p_limit int default 1000)
returns setof public.logs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.check_admin_pin(p_pin) <> 'ok' then
    raise exception 'PIN incorrecto' using errcode = '28000';
  end if;
  return query
    select * from public.logs
    order by created_at desc
    limit least(greatest(coalesce(p_limit, 1000), 1), 5000);
end;
$$;

-- Borra todo el registro (solo con el PIN correcto).
create or replace function public.clear_logs(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.check_admin_pin(p_pin) <> 'ok' then
    raise exception 'PIN incorrecto' using errcode = '28000';
  end if;
  delete from public.logs where true;
end;
$$;

revoke all on function public.submit_score(text, text, text, int, int, int, int, text) from public;
revoke all on function public.check_admin_pin(text) from public;
revoke all on function public.get_logs(text, int) from public;
revoke all on function public.clear_logs(text) from public;
grant execute on function public.submit_score(text, text, text, int, int, int, int, text) to anon, authenticated;
grant execute on function public.check_admin_pin(text) to anon, authenticated;
grant execute on function public.get_logs(text, int) to anon, authenticated;
grant execute on function public.clear_logs(text) to anon, authenticated;
