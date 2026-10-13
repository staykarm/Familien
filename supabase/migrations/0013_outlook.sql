-- Fase 3: synk med den delte Outlook-kalenderen (Microsoft Graph).

-- Koblingen til Outlook. Én rad. Ingen policyer: tokens er hemmelige, kun serveren (service role) leser/skriver.
create table if not exists public.outlook_connection (
  id int primary key default 1 check (id = 1),
  account_email text not null,
  account_name text,
  tokens_encrypted text not null,
  calendar_id text,
  calendar_name text,
  delta_link text,
  delta_window_start timestamptz,
  subscription_id text,
  subscription_expires_at timestamptz,
  site_url text,
  sync_lock_until timestamptz,
  resync_requested boolean not null default false,
  last_sync_at timestamptz,
  last_error text,
  connected_at timestamptz not null default now()
);
alter table public.outlook_connection enable row level security;

-- Outlook sin versjon når samme aktivitet er endret både i appen og i Outlook.
alter table public.events add column if not exists outlook_conflict jsonb;

-- Synklogg som vises i Innstillinger.
create table if not exists public.sync_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  direction text not null check (direction in ('in', 'out', 'system')),
  ok boolean not null default true,
  message text not null,
  event_id uuid
);
create index if not exists sync_log_created_idx on public.sync_log (created_at desc);
alter table public.sync_log enable row level security;
drop policy if exists "family read sync_log" on public.sync_log;
create policy "family read sync_log" on public.sync_log
  for select to authenticated using (public.is_family());
