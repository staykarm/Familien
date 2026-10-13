-- Fase 4: huskeliste/oppgaver. Frist lagres som dato (+ valgfritt klokkeslett) i Oslo-tid.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  notes text,
  assignee_id uuid references public.members(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  due_date date,
  due_time time,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_time is null or due_date is not null)
);

create index if not exists tasks_due_idx on public.tasks (due_date) where status <> 'done';
create index if not exists tasks_status_idx on public.tasks (status, completed_at);

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

drop policy if exists "family all tasks" on public.tasks;
create policy "family all tasks" on public.tasks
  for all to authenticated using (public.is_family()) with check (public.is_family());
