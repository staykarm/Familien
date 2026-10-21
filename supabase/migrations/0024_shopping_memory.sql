-- Handlelisten husker hvilken avdeling en vare hører til: valgt av familien ('user') eller foreslått av Claude ('ai').
-- Nøkkelen er varenavnet i små bokstaver uten ekstra mellomrom.
create table if not exists public.shopping_category_memory (
  name_key text primary key,
  category_id uuid not null references public.categories(id) on delete cascade,
  source text not null default 'user' check (source in ('user', 'ai')),
  updated_at timestamptz not null default now()
);
alter table public.shopping_category_memory enable row level security;
drop policy if exists "family all shopping_category_memory" on public.shopping_category_memory;
create policy "family all shopping_category_memory" on public.shopping_category_memory
  for all to authenticated using (public.is_family()) with check (public.is_family());
