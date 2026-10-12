-- Startdata: familiemedlemmene og et sett med kategorier. Alt kan redigeres i appen.

insert into public.members (slug, name, color, icon, is_shared, sort_order, details) values
  ('ingvild', 'Ingvild', '#e5739a', '🌸', false, 1, '[]'),
  ('marius',  'Marius',  '#4f97d9', '⛵', false, 2, '[]'),
  ('edvard',  'Edvard',  '#f0a030', '🦖', false, 3,
    '[{"label":"Skole","value":""},{"label":"Aktiviteter","value":""},{"label":"Klesstørrelse","value":""},{"label":"Skostørrelse","value":""},{"label":"Allergier","value":""}]'),
  ('olav',    'Olav',    '#4fb071', '⚽', false, 4,
    '[{"label":"Skole","value":""},{"label":"Aktiviteter","value":""},{"label":"Klesstørrelse","value":""},{"label":"Skostørrelse","value":""},{"label":"Allergier","value":""}]'),
  ('felles',  'Felles',  '#9a7fd8', '🏠', true,  5, '[]')
on conflict (slug) do nothing;

insert into public.categories (scope, name, icon, color, sort_order) values
  ('event', 'Skole',        '🎒', '#4f97d9', 1),
  ('event', 'Barnehage',    '🧸', '#f0a030', 2),
  ('event', 'Trening',      '⚽', '#4fb071', 3),
  ('event', 'Bursdag',      '🎂', '#e5739a', 4),
  ('event', 'Lege/tannlege','🩺', '#e26d5a', 5),
  ('event', 'Jobb',         '💼', '#6b7a99', 6),
  ('event', 'Reise',        '✈️', '#3bb3c3', 7),
  ('event', 'Familie',      '🏠', '#9a7fd8', 8),
  ('event', 'Annet',        '📌', '#a39e93', 99),
  ('task', 'Hjemme',        '🧹', '#9a7fd8', 1),
  ('task', 'Skole',         '🎒', '#4f97d9', 2),
  ('task', 'Handle',        '🛒', '#4fb071', 3),
  ('task', 'Annet',         '📌', '#a39e93', 99),
  ('shopping', 'Frukt og grønt', '🥕', '#4fb071', 1),
  ('shopping', 'Meieri',          '🥛', '#4f97d9', 2),
  ('shopping', 'Kjøtt og fisk',   '🐟', '#e26d5a', 3),
  ('shopping', 'Brød og bakst',   '🍞', '#f0a030', 4),
  ('shopping', 'Tørrvarer',       '🥫', '#a3794f', 5),
  ('shopping', 'Frys',            '🧊', '#3bb3c3', 6),
  ('shopping', 'Snacks og drikke','🍿', '#e5739a', 7),
  ('shopping', 'Hus og hygiene',  '🧻', '#9a7fd8', 8),
  ('shopping', 'Annet',           '📦', '#a39e93', 99)
on conflict (scope, name) do nothing;
