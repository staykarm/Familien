-- Fase 2: aktiviteter i kalenderen og hvem som deltar.
-- Synkfeltene (outlook_*, sync_*) tas i bruk i fase 3, men ligger her fra start.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  notes text,
  category_id uuid references public.categories(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Myk sletting, slik at slettingen kan synkes til Outlook før raden fjernes.
  deleted_at timestamptz,
  origin text not null default 'app' check (origin in ('app', 'outlook')),
  outlook_id text unique,
  outlook_ical_uid text,
  outlook_change_key text,
  outlook_series_id text,
  outlook_last_modified timestamptz,
  sync_status text not null default 'local'
    check (sync_status in ('local', 'pending', 'synced', 'conflict', 'error')),
  sync_error text,
  check (end_at >= start_at)
);

create index if not exists events_range_idx on public.events (start_at, end_at) where deleted_at is null;

drop trigger if exists events_updated_at on public.events;
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

create table if not exists public.event_participants (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  primary key (event_id, member_id)
);

create index if not exists event_participants_member_idx on public.event_participants (member_id);

alter table public.events enable row level security;
alter table public.event_participants enable row level security;

drop policy if exists "family all events" on public.events;
create policy "family all events" on public.events
  for all to authenticated using (public.is_family()) with check (public.is_family());
drop policy if exists "family all event_participants" on public.event_participants;
create policy "family all event_participants" on public.event_participants
  for all to authenticated using (public.is_family()) with check (public.is_family());
