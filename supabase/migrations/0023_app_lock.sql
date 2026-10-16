-- Felles pinkode når appen åpnes, og Face ID / Touch ID (passkeys) per enhet.
-- Begge tabellene er hemmelige: RLS på, ingen policyer. Bare serveren (service role) leser dem.
create table if not exists public.app_lock (
  id smallint primary key default 1 check (id = 1),
  -- Null betyr standardkoden (0102).
  pin_hash text,
  -- Økes når koden endres eller man låser alle enheter, slik at gamle opplåsinger slutter å gjelde.
  pin_version integer not null default 1,
  -- Hvor ofte koden må tastes: 'session' (hver gang appen åpnes), 'day' eller 'month'.
  remember text not null default 'session' check (remember in ('session', 'day', 'month')),
  -- Antall sifre, slik at låsesiden kan sjekke koden straks den er tastet.
  pin_length smallint not null default 4,
  failed_count integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.app_lock enable row level security;

create table if not exists public.passkeys (
  id text primary key,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  label text not null default 'Enhet',
  rp_id text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.passkeys enable row level security;
