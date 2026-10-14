-- Gjentakende aktiviteter. Appen lager én vanlig aktivitet per gang og samler dem i en serie,
-- slik at hver forekomst kan endres for seg og synkes til Outlook som en vanlig hendelse.

create table if not exists public.event_series (
  id uuid primary key default gen_random_uuid(),
  freq text not null check (freq in ('daily', 'weekly', 'monthly')),
  "interval" smallint not null default 1 check ("interval" between 1 and 4),
  -- ISO-ukedager, 1 = mandag … 7 = søndag. Brukes bare for ukentlig.
  weekdays smallint[] not null default '{}',
  until date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists event_series_updated_at on public.event_series;
create trigger event_series_updated_at before update on public.event_series
  for each row execute function public.set_updated_at();

alter table public.event_series enable row level security;
drop policy if exists "family all event_series" on public.event_series;
create policy "family all event_series" on public.event_series
  for all to authenticated using (public.is_family()) with check (public.is_family());

alter table public.events add column if not exists series_id uuid references public.event_series(id) on delete set null;
create index if not exists events_series_idx on public.events (series_id, start_at) where series_id is not null;

-- Lager (eller fornyer) en serie og alle forekomstene i én transaksjon. Returnerer seriens id.
-- p_replace_from: seriens aktiviteter fra og med dette tidspunktet fjernes først («denne og senere»).
-- p_replace_event: denne aktiviteten fjernes (når en enkelt aktivitet gjøres om til en serie).
-- Aktiviteter som finnes i Outlook slettes mykt, så synken får fjernet dem der.
create or replace function public.save_event_series(
  p_series_id uuid,
  p_freq text,
  p_interval integer,
  p_weekdays smallint[],
  p_until date,
  p_replace_from timestamptz,
  p_replace_event uuid,
  p_title text,
  p_starts timestamptz[],
  p_ends timestamptz[],
  p_all_day boolean,
  p_location text,
  p_notes text,
  p_category_id uuid,
  p_participants uuid[]
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_series uuid;
begin
  if coalesce(array_length(p_participants, 1), 0) = 0 then
    raise exception 'Velg minst én deltaker';
  end if;
  if coalesce(array_length(p_starts, 1), 0) = 0 or array_length(p_starts, 1) <> array_length(p_ends, 1) then
    raise exception 'Serien har ingen datoer';
  end if;
  if array_length(p_starts, 1) > 200 then
    raise exception 'For mange gjentakelser';
  end if;

  if p_series_id is null then
    insert into public.event_series (freq, "interval", weekdays, until)
    values (p_freq, p_interval, p_weekdays, p_until)
    returning id into v_series;
  else
    update public.event_series
    set freq = p_freq, "interval" = p_interval, weekdays = p_weekdays, until = p_until
    where id = p_series_id
    returning id into v_series;
    if v_series is null then
      raise exception 'Fant ikke serien';
    end if;
  end if;

  -- Fjern det som skal erstattes.
  update public.events
  set deleted_at = now(), sync_status = 'pending'
  where deleted_at is null and outlook_id is not null
    and ((p_replace_from is not null and series_id = v_series and start_at >= p_replace_from) or id = p_replace_event);
  delete from public.events
  where deleted_at is null and outlook_id is null
    and ((p_replace_from is not null and series_id = v_series and start_at >= p_replace_from) or id = p_replace_event);

  with ins as (
    insert into public.events (title, start_at, end_at, all_day, location, notes, category_id, series_id)
    select p_title, t.s, t.e, p_all_day, p_location, p_notes, p_category_id, v_series
    from unnest(p_starts, p_ends) as t(s, e)
    returning id
  )
  insert into public.event_participants (event_id, member_id)
  select ins.id, m from ins cross join unnest(p_participants) as m;

  return v_series;
end;
$$;

revoke execute on function public.save_event_series(uuid, text, integer, smallint[], date, timestamptz, uuid, text, timestamptz[], timestamptz[], boolean, text, text, uuid, uuid[]) from public, anon;
grant execute on function public.save_event_series(uuid, text, integer, smallint[], date, timestamptz, uuid, text, timestamptz[], timestamptz[], boolean, text, text, uuid, uuid[]) to authenticated, service_role;
