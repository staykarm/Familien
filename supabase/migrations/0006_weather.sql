-- Fase 5: buffer for værvarsel fra MET Norway (Yr). Vi respekterer Expires/Last-Modified
-- og spør aldri MET direkte fra nettleseren. Ingen policyer: kun serveren (service role) leser/skriver.

create table if not exists public.weather_cache (
  lat numeric(7, 4) not null,
  lon numeric(7, 4) not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  last_modified text,
  fetched_at timestamptz not null default now(),
  primary key (lat, lon)
);

alter table public.weather_cache enable row level security;
