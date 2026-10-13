-- Lagrer en aktivitet og deltakerne i én transaksjon. Returnerer id-en.
-- security invoker: RLS gjelder for den som kaller (eller service role uten innlogging).

create or replace function public.save_event(
  p_id uuid,
  p_title text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_all_day boolean,
  p_location text,
  p_notes text,
  p_category_id uuid,
  p_participants uuid[]
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(array_length(p_participants, 1), 0) = 0 then
    raise exception 'Velg minst én deltaker';
  end if;

  if p_id is null then
    insert into public.events (title, start_at, end_at, all_day, location, notes, category_id)
    values (p_title, p_start_at, p_end_at, p_all_day, p_location, p_notes, p_category_id)
    returning id into v_id;
  else
    update public.events
    set title = p_title, start_at = p_start_at, end_at = p_end_at, all_day = p_all_day,
        location = p_location, notes = p_notes, category_id = p_category_id,
        sync_status = case when outlook_id is null then sync_status else 'pending' end
    where id = p_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'Fant ikke aktiviteten';
    end if;
  end if;

  delete from public.event_participants where event_id = v_id;
  insert into public.event_participants (event_id, member_id)
  select v_id, m from unnest(p_participants) as m;

  return v_id;
end;
$$;

revoke execute on function public.save_event(uuid, text, timestamptz, timestamptz, boolean, text, text, uuid, uuid[]) from public, anon;
grant execute on function public.save_event(uuid, text, timestamptz, timestamptz, boolean, text, text, uuid, uuid[]) to authenticated, service_role;
