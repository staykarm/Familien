-- Levering og henting registreres dag for dag (det finnes ikke noe fast mønster).
-- Erstatter ukeplanen (care_plans) og unntakene (care_overrides), som ikke brukes lenger og kan slettes senere.
create table if not exists public.care_entries (
  member_id uuid not null references public.members(id) on delete cascade,
  date date not null,
  drop_by uuid references public.members(id) on delete set null,
  drop_time time,
  pick_by uuid references public.members(id) on delete set null,
  pick_time time,
  updated_at timestamptz not null default now(),
  primary key (member_id, date)
);
create index if not exists care_entries_date_idx on public.care_entries (date);

drop trigger if exists care_entries_updated_at on public.care_entries;
create trigger care_entries_updated_at before update on public.care_entries
  for each row execute function public.set_updated_at();

alter table public.care_entries enable row level security;
drop policy if exists "family all care_entries" on public.care_entries;
create policy "family all care_entries" on public.care_entries
  for all to authenticated using (public.is_family()) with check (public.is_family());
