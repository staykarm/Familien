-- Pushvarsler. Alle tre tabellene er hemmelige (ingen policyer): bare serveren (service role) når dem.

-- Én rad per enhet som har slått på varsler. member_id = hvem enheten tilhører (null = hele familien).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  member_id uuid references public.members(id) on delete set null,
  device text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
alter table public.push_subscriptions enable row level security;

-- VAPID-nøklene lages automatisk første gang. Den private nøkkelen lagres kryptert.
create table if not exists public.push_keys (
  id smallint primary key default 1 check (id = 1),
  public_key text not null,
  private_key_encrypted text not null,
  created_at timestamptz not null default now()
);
alter table public.push_keys enable row level security;

-- Hva som er sendt, så påminnelser og morgenoversikten bare går ut én gang.
create table if not exists public.push_log (
  key text primary key,
  sent_at timestamptz not null default now()
);
create index if not exists push_log_sent_idx on public.push_log (sent_at);
alter table public.push_log enable row level security;
