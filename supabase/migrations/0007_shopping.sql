-- Fase 6: felles handleliste og faste lister (maler).

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  quantity text check (quantity is null or char_length(quantity) <= 40),
  category_id uuid references public.categories(id) on delete set null,
  checked boolean not null default false,
  checked_at timestamptz,
  added_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists shopping_items_checked_idx on public.shopping_items (checked, created_at);

create table if not exists public.shopping_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 60),
  icon text not null default '🛒',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.shopping_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.shopping_templates(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  quantity text check (quantity is null or char_length(quantity) <= 40),
  category_id uuid references public.categories(id) on delete set null,
  sort_order int not null default 0
);

create index if not exists shopping_template_items_template_idx on public.shopping_template_items (template_id, sort_order);

alter table public.shopping_items enable row level security;
alter table public.shopping_templates enable row level security;
alter table public.shopping_template_items enable row level security;

drop policy if exists "family all shopping_items" on public.shopping_items;
create policy "family all shopping_items" on public.shopping_items
  for all to authenticated using (public.is_family()) with check (public.is_family());
drop policy if exists "family all shopping_templates" on public.shopping_templates;
create policy "family all shopping_templates" on public.shopping_templates
  for all to authenticated using (public.is_family()) with check (public.is_family());
drop policy if exists "family all shopping_template_items" on public.shopping_template_items;
create policy "family all shopping_template_items" on public.shopping_template_items
  for all to authenticated using (public.is_family()) with check (public.is_family());
