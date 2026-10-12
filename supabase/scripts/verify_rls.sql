-- Rask RLS-sjekk i SQL-editoren. Forventet: anon ser 0 rader overalt.
set local role anon;
select 'members' as t, count(*) from public.members
union all select 'categories', count(*) from public.categories
union all select 'settings', count(*) from public.settings
union all select 'app_users', count(*) from public.app_users;
reset role;
