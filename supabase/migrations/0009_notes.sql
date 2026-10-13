-- Notater (som iOS Notater): innhold lagres som Tiptap-dokument (jsonb) + ren tekst for søk og forhåndsvisning.
-- version brukes til å oppdage samtidige endringer fra to enheter.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.members(id) on delete set null,
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  title text not null default '',
  plain_text text not null default '',
  pinned boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- «Nylig slettet»: myk sletting, kan gjenopprettes.
  deleted_at timestamptz
);

create index if not exists notes_list_idx on public.notes (pinned desc, updated_at desc) where deleted_at is null;

drop trigger if exists notes_updated_at on public.notes;
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

drop policy if exists "family all notes" on public.notes;
create policy "family all notes" on public.notes
  for all to authenticated using (public.is_family()) with check (public.is_family());
