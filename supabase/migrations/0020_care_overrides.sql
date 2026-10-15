-- Unntak fra den faste ukeplanen for levering og henting (care_plans), over én eller flere dager.
-- For hver del (levering/henting): *_override = false → som vanlig (ukeplanen).
-- *_override = true → personen og klokkeslettet her; begge tomme = ingen levering/henting.
-- Overlapper flere unntak, gjelder det sist lagrede.
create table if not exists public.care_overrides (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  note text,
  drop_override boolean not null default false,
  drop_by uuid references public.members(id) on delete set null,
  drop_time time,
  pick_override boolean not null default false,
  pick_by uuid references public.members(id) on delete set null,
  pick_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (to_date >= from_date)
);
create index if not exists care_overrides_member_idx on public.care_overrides (member_id, to_date);

drop trigger if exists care_overrides_updated_at on public.care_overrides;
create trigger care_overrides_updated_at before update on public.care_overrides
  for each row execute function public.set_updated_at();

alter table public.care_overrides enable row level security;
drop policy if exists "family all care_overrides" on public.care_overrides;
create policy "family all care_overrides" on public.care_overrides
  for all to authenticated using (public.is_family()) with check (public.is_family());

-- Ble aldri tatt i bruk (erstattet av care_overrides).
drop table if exists public.care_days;
