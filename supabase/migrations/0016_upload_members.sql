-- Hvem alt i en innlest fil gjelder (f.eks. ett av barna). Tom liste = Claude finner det ut selv.
alter table public.uploads add column if not exists member_ids uuid[] not null default '{}';
