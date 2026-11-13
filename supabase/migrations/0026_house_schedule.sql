-- Huset: planlagte handlinger («skru av varmekablene kl. 10»). Lagres av «Spør huset» og utføres av
-- /api/cron/push (hvert 5. minutt). `commands` er en liste med handlinger av samme slag som knappene i Huset
-- (homeCommandSchema), aldri «slå på» for brytere (det krever kode).
create table if not exists public.house_schedule (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null,
  commands jsonb not null,
  description text not null check (char_length(description) between 1 and 200),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  result text
);
create index if not exists house_schedule_pending on public.house_schedule (run_at) where done_at is null;
alter table public.house_schedule enable row level security;
drop policy if exists "family all house_schedule" on public.house_schedule;
create policy "family all house_schedule" on public.house_schedule
  for all to authenticated using (public.is_family()) with check (public.is_family());
