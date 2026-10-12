-- Kjør i Supabase SQL-editoren ETTER at brukerne er opprettet under
-- Authentication → Users. Bytt ut e-postadressene med de dere faktisk bruker.

insert into public.app_users (user_id, role, member_id, display_name)
select u.id, v.role, m.id, v.display_name
from (values
  ('ingvild@example.com', 'adult',  'ingvild', 'Ingvild'),
  ('marius@example.com',  'adult',  'marius',  'Marius'),
  ('familie@example.com', 'shared', null,      'Familien')
) as v(email, role, member_slug, display_name)
join auth.users u on lower(u.email) = lower(v.email)
left join public.members m on m.slug = v.member_slug
on conflict (user_id) do update
  set role = excluded.role, member_id = excluded.member_id, display_name = excluded.display_name;

-- Kontroll: skal gi tre rader.
select a.display_name, a.role, u.email from public.app_users a join auth.users u on u.id = a.user_id;
