-- Levering og henting (f.eks. barnehage) per barn og ukedag. Bare hverdager: 1 = mandag … 5 = fredag.
create table if not exists public.care_plans (
  member_id uuid not null references public.members(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),
  drop_by uuid references public.members(id) on delete set null,
  drop_time time,
  pick_by uuid references public.members(id) on delete set null,
  pick_time time,
  updated_at timestamptz not null default now(),
  primary key (member_id, weekday)
);

drop trigger if exists care_plans_updated_at on public.care_plans;
create trigger care_plans_updated_at before update on public.care_plans
  for each row execute function public.set_updated_at();

alter table public.care_plans enable row level security;
drop policy if exists "family all care_plans" on public.care_plans;
create policy "family all care_plans" on public.care_plans
  for all to authenticated using (public.is_family()) with check (public.is_family());
