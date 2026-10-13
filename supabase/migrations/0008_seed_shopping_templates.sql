-- Startdata: to faste lister. Kan endres og slettes i appen.

insert into public.shopping_templates (name, icon, sort_order) values
  ('Ukeshandel', '🧺', 1),
  ('Fredagskos', '🌮', 2)
on conflict (name) do nothing;

insert into public.shopping_template_items (template_id, name, quantity, category_id, sort_order)
select t.id, v.name, v.quantity, c.id, v.sort_order
from (values
  ('Ukeshandel', 'Melk', '2', 'Meieri', 1),
  ('Ukeshandel', 'Brød', '2', 'Brød og bakst', 2),
  ('Ukeshandel', 'Egg', '12 stk', 'Meieri', 3),
  ('Ukeshandel', 'Ost', null, 'Meieri', 4),
  ('Ukeshandel', 'Smør', null, 'Meieri', 5),
  ('Ukeshandel', 'Bananer', null, 'Frukt og grønt', 6),
  ('Ukeshandel', 'Epler', null, 'Frukt og grønt', 7),
  ('Ukeshandel', 'Agurk', null, 'Frukt og grønt', 8),
  ('Ukeshandel', 'Kyllingfilet', null, 'Kjøtt og fisk', 9),
  ('Ukeshandel', 'Pasta', null, 'Tørrvarer', 10),
  ('Ukeshandel', 'Pålegg', null, 'Meieri', 11),
  ('Fredagskos', 'Tortillalefser', null, 'Brød og bakst', 1),
  ('Fredagskos', 'Kjøttdeig', '400 g', 'Kjøtt og fisk', 2),
  ('Fredagskos', 'Tacokrydder', null, 'Tørrvarer', 3),
  ('Fredagskos', 'Rømme', null, 'Meieri', 4),
  ('Fredagskos', 'Revet ost', null, 'Meieri', 5),
  ('Fredagskos', 'Salsa', null, 'Tørrvarer', 6),
  ('Fredagskos', 'Mais', null, 'Tørrvarer', 7),
  ('Fredagskos', 'Chips', null, 'Snacks og drikke', 8),
  ('Fredagskos', 'Brus', null, 'Snacks og drikke', 9)
) as v(template, name, quantity, category, sort_order)
join public.shopping_templates t on t.name = v.template
left join public.categories c on c.scope = 'shopping' and c.name = v.category
where not exists (select 1 from public.shopping_template_items i where i.template_id = t.id);
