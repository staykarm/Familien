-- Familien — grunnskjema: brukere, medlemmer, kategorier, innstillinger og lagring.
--
-- Tilgangsmodell: bare innloggede brukere som står i app_users har tilgang
-- (public.is_family()). Tabeller med hemmeligheter (kommer i senere faser) får
-- ingen policyer i det hele tatt og nås kun med service role fra serveren.

-- Hjelpefunksjoner ----------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Medlemmer -----------------------------------------------------------------------

create table public.members (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default '🙂',
  avatar_path text,
  -- Fritekstdetaljer som liste av { label, value }, f.eks. skole, størrelser, allergier.
  details jsonb not null default '[]'::jsonb check (jsonb_typeof(details) = 'array'),
  is_shared boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger members_updated_at before update on public.members
  for each row execute function public.set_updated_at();

-- Appbrukere (kobling auth.users → familie) ---------------------------------------

create table public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- adult: Ingvild/Marius med egen innlogging. shared: delt familiebruker for barna.
  role text not null check (role in ('adult', 'shared')),
  member_id uuid references public.members(id) on delete set null,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.is_family()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_users where user_id = (select auth.uid()));
$$;

create or replace function public.is_adult()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_users where user_id = (select auth.uid()) and role = 'adult'
  );
$$;

revoke execute on function public.is_family() from public, anon;
revoke execute on function public.is_adult() from public, anon;
grant execute on function public.is_family() to authenticated;
grant execute on function public.is_adult() to authenticated;

-- Kategorier ----------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('event', 'task', 'shopping')),
  name text not null,
  icon text not null default '📌',
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- Navnet på Outlook-kategorien (fase 3). Null = samme som name.
  outlook_category text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (scope, name)
);

-- Innstillinger -------------------------------------------------------------------

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- RLS -----------------------------------------------------------------------------

alter table public.members enable row level security;
alter table public.app_users enable row level security;
alter table public.categories enable row level security;
alter table public.settings enable row level security;

-- Medlemmene er faste (fire + Felles): familien kan lese og redigere, ikke opprette/slette.
create policy "family read members" on public.members
  for select to authenticated using (public.is_family());
create policy "family update members" on public.members
  for update to authenticated using (public.is_family()) with check (public.is_family());

-- app_users vedlikeholdes kun via SQL (se supabase/scripts/link_users.sql).
create policy "family read app_users" on public.app_users
  for select to authenticated using (public.is_family());

create policy "family all categories" on public.categories
  for all to authenticated using (public.is_family()) with check (public.is_family());

create policy "family all settings" on public.settings
  for all to authenticated using (public.is_family()) with check (public.is_family());

-- Lagring -------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('uploads', 'uploads', false, 26214400, null)
on conflict (id) do nothing;

create policy "family read files" on storage.objects
  for select to authenticated
  using (bucket_id in ('avatars', 'uploads') and public.is_family());
create policy "family insert files" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('avatars', 'uploads') and public.is_family());
create policy "family update files" on storage.objects
  for update to authenticated
  using (bucket_id in ('avatars', 'uploads') and public.is_family())
  with check (bucket_id in ('avatars', 'uploads') and public.is_family());
create policy "family delete files" on storage.objects
  for delete to authenticated
  using (bucket_id in ('avatars', 'uploads') and public.is_family());
