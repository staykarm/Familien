-- Fingeravtrykk av innholdet (tittel, tid, sted, notat, kategorier) slik det sist ble synket med Outlook.
-- Outlook endrer changeKey av seg selv rett etter at en hendelse er laget, så vi sammenligner innhold
-- i stedet for bare changeKey. Det hindrer ekko i loggen og falske konflikter.
alter table public.events add column if not exists outlook_synced_hash text;
