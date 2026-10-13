-- Fase 8: kobling til Oda. Vi lagrer bare den krypterte økten (cookies), aldri passordet.
-- Ingen policyer: kun serveren (service role) leser/skriver. Bare én rad (id = 1).

create table if not exists public.oda_connection (
  id int primary key default 1 check (id = 1),
  email text not null,
  cookies_encrypted text not null,
  connected_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.oda_connection enable row level security;
