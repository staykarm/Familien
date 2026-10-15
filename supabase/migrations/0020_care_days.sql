-- Henting på enkeltdatoer framover. Overstyrer den faste ukeplanen (care_plans) for den dagen.
-- pick_by og pick_time begge tomme = ingen henting den dagen (f.eks. fridag).
create table if not exists public.care_days (
  member_id uuid not null references public.members(id) on delete cascade,
  date date not null,
  pick_by uuid references public.members(id) on delete set null,
  pick_time time,
  updated_at timestamptz not null default now(),
  primary key (member_id, date)
);

drop trigger if exists care_days_updated_at on public.care_days;
create trigger care_days_updated_at before update on public.care_days
  for each row execute function public.set_updated_at();

alter table public.care_days enable row level security;
drop policy if exists "family all care_days" on public.care_days;
create policy "family all care_days" on public.care_days
  for all to authenticated using (public.is_family()) with check (public.is_family());
