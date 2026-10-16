-- Levering/henting av noen utenfor familien i appen (f.eks. «Farmor»): fritekst i stedet for et medlem.
alter table public.care_entries add column if not exists drop_other text;
alter table public.care_entries add column if not exists pick_other text;
