-- Fase 7: opplastede filer og AI-forslag som venter på godkjenning.
-- Filene ligger i den private bucketen «uploads» (laget i 0001).

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  filename text not null,
  mime text not null,
  size_bytes int not null default 0,
  uploaded_by uuid references public.members(id) on delete set null,
  status text not null default 'uploaded' check (status in ('uploaded', 'analyzing', 'done', 'failed')),
  error text,
  summary text,
  created_at timestamptz not null default now(),
  analyzed_at timestamptz
);

create index if not exists uploads_created_idx on public.uploads (created_at desc);

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads(id) on delete cascade,
  kind text not null check (kind in ('event', 'task', 'shopping')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- Id-en til aktiviteten/oppgaven/varen som ble laget ved godkjenning.
  created_ref uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists suggestions_upload_idx on public.suggestions (upload_id, kind);

alter table public.uploads enable row level security;
alter table public.suggestions enable row level security;

drop policy if exists "family all uploads" on public.uploads;
create policy "family all uploads" on public.uploads
  for all to authenticated using (public.is_family()) with check (public.is_family());
drop policy if exists "family all suggestions" on public.suggestions;
create policy "family all suggestions" on public.suggestions
  for all to authenticated using (public.is_family()) with check (public.is_family());
