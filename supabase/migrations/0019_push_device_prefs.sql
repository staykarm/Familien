-- Hver enhet har sine egne valg for varsler (typer, påminnelsestider, stille tid). Tom = standardvalg.
alter table public.push_subscriptions add column if not exists prefs jsonb not null default '{}';
