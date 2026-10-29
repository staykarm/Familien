-- Huset: faste grupper av Sonos-rom («1. etasje», «Middag» …), og Spotify-kontoene til familien.

-- Faste grupper. Rommene er entity-id-ene i Home Assistant (media_player.*).
-- Valgfritt: musikk (Spotify-lenke) og volum som settes når gruppen startes.
create table if not exists public.house_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  speaker_ids text[] not null default '{}',
  spotify_url text,
  spotify_name text,
  volume int check (volume between 0 and 100),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.house_groups enable row level security;
drop policy if exists "family all house_groups" on public.house_groups;
create policy "family all house_groups" on public.house_groups
  for all to authenticated using (public.is_family()) with check (public.is_family());

-- Spotify-innlogging per person (spillelister og likte sanger). Tokens er kryptert.
-- Hemmelig tabell: RLS på og ingen policyer, så bare service role kan lese den.
create table if not exists public.spotify_accounts (
  member_id uuid primary key references public.members(id) on delete cascade,
  spotify_user_id text not null,
  display_name text,
  tokens_encrypted text not null,
  updated_at timestamptz not null default now()
);
alter table public.spotify_accounts enable row level security;
