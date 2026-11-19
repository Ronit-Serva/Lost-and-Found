begin;

-- Keep the original validation and owner locks behind the public entry points.
alter function public.create_report(jsonb) rename to create_contact_report;
alter function public.edit_report(uuid, jsonb) rename to edit_contact_report;
alter function public.create_contact_report(jsonb) set schema private;
alter function public.edit_contact_report(uuid, jsonb) set schema private;
revoke all on function private.create_contact_report(jsonb), private.edit_contact_report(uuid, jsonb)
  from public, anon, authenticated;

create function private.validate_specialized_report_fields(p_data jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  field text;
  value jsonb;
  max_length integer;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Report object required' using errcode = '22023';
  end if;
  foreach field in array array['roll_number', 'id_number', 'cardholder_name', 'room_number', 'holder_name', 'whatsapp_number']
  loop
    value := p_data->field;
    if value is null or (value = 'null'::jsonb and field <> 'whatsapp_number') then
      continue;
    end if;
    max_length := case
      when field in ('cardholder_name', 'holder_name') then 120
      when field = 'whatsapp_number' then 16
      else 80
    end;
    if jsonb_typeof(value) <> 'string' or char_length(p_data->>field) > max_length then
      raise exception 'Invalid report field: %', field using errcode = '22023';
    end if;
  end loop;
end;
$$;
revoke all on function private.validate_specialized_report_fields(jsonb) from public, anon, authenticated;

-- The optional number is a profile update coupled to a successful listing write.
-- The saved profile continues to supply the value for open WhatsApp listings.
create function private.save_listing_whatsapp(p_data jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  if p_data ? 'whatsapp_number' then
    if p_data->>'contact_method' is distinct from 'whatsapp' then
      raise exception 'Choose WhatsApp to save a number from the listing form' using errcode = '22023';
    end if;
    perform public.set_my_whatsapp(p_data->>'whatsapp_number');
  end if;
end;
$$;
revoke all on function private.save_listing_whatsapp(jsonb) from public, anon, authenticated;

create function public.create_report(p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;
  perform private.validate_specialized_report_fields(p_data);
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  if (
    select count(*) from public.reports
    where owner_id = caller and created_at >= now() - interval '24 hours'
  ) >= 30 then
    raise exception 'Daily report limit reached' using errcode = 'PT429';
  end if;
  perform private.save_listing_whatsapp(p_data);
  return private.create_contact_report(p_data - 'whatsapp_number');
end;
$$;

create function public.edit_report(p_report_id uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;
  perform private.validate_specialized_report_fields(p_data);
  perform private.save_listing_whatsapp(p_data);
  perform private.edit_contact_report(p_report_id, p_data - 'whatsapp_number');
end;
$$;

create table private.directory_request_budget (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null check (requests between 1 and 30)
);
alter table private.directory_request_budget enable row level security;
revoke all on private.directory_request_budget from public, anon, authenticated;

create function private.consume_directory_request(p_user_id uuid)
returns void language plpgsql set search_path = '' as $$
declare
  current_window timestamptz := date_trunc('minute', statement_timestamp());
begin
  insert into private.directory_request_budget as budget (user_id, window_start, requests)
  values (p_user_id, current_window, 1)
  on conflict (user_id) do update set
    window_start = greatest(budget.window_start, excluded.window_start),
    requests = case when budget.window_start < excluded.window_start then 1 else budget.requests + 1 end
  where budget.window_start < excluded.window_start or budget.requests < 30;
  if not found then
    raise exception 'Directory request limit reached. Try again shortly.' using errcode = 'PT429';
  end if;
end;
$$;
revoke all on function private.consume_directory_request(uuid) from public, anon, authenticated;

drop function public.list_my_reports();
drop function public.directory_reports(public.report_section, public.report_kind, text);

create function public.list_my_reports(p_closed_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;
  if p_closed_offset is null or p_closed_offset < 0 then
    raise exception 'Invalid history page' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'section', r.section, 'status', r.status, 'title', r.title,
        'category', r.category, 'description', r.description, 'location', r.location,
        'occurred_on', r.occurred_on, 'approximate_date', r.approximate_date,
        'cardholder_name', r.cardholder_name, 'roll_number', r.roll_number, 'id_number', r.id_number,
        'room_number', r.room_number, 'holder_name', r.holder_name, 'created_at', r.created_at
      )
      || case when contact.value is not null then jsonb_build_object(
        'contact_method', r.contact_method, 'contact_value', contact.value
      ) else '{}'::jsonb end
      order by r.created_at desc, r.id
    )
    from (
      (select active.* from public.reports active
        where active.owner_id = auth.uid() and active.status in ('open', 'reserved'))
      union all
      (select closed.* from public.reports closed
        where closed.owner_id = auth.uid() and closed.status not in ('open', 'reserved')
        order by closed.created_at desc, closed.id
        limit 25 offset p_closed_offset)
    ) r
    cross join lateral (
      select case when r.status = 'open' then private.report_contact(r.owner_id, r.contact_method) end as value
    ) contact
  ), '[]'::jsonb);
end;
$$;

create function public.directory_reports(
  p_section public.report_section,
  p_kind public.report_kind,
  p_query text default '',
  p_offset integer default 0
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  term text;
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;
  if p_section is null or p_section not in ('id_card', 'room_key') then
    return '[]'::jsonb;
  end if;
  if char_length(p_query) > 120 then
    raise exception 'Search query too long' using errcode = '22023';
  end if;

  if p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception 'Invalid directory page' using errcode = '22023';
  end if;
  term := lower(btrim(regexp_replace(coalesce(p_query, ''), '[[:space:]]+', ' ', 'g')));
  perform private.consume_directory_request(auth.uid());

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'section', r.section, 'status', r.status, 'title', r.title,
      'cardholder_name', r.cardholder_name, 'roll_number', r.roll_number, 'id_number', r.id_number,
      'room_number', r.room_number, 'holder_name', r.holder_name, 'created_at', r.created_at,
      'contact_method', r.contact_method, 'contact_value', r.contact_value
    ) order by r.created_at desc, r.id)
    from (
      select r.*, contact.value as contact_value
      from public.reports r
      cross join lateral (
        select private.report_contact(r.owner_id, r.contact_method) as value
      ) contact
      where r.section = p_section and r.kind = p_kind and r.status = 'open' and r.owner_id <> auth.uid()
        and r.contact_method is not null and contact.value is not null
        and (
          term = '' or (
            p_section = 'id_card' and (
              strpos(lower(regexp_replace(r.cardholder_name, '[[:space:]]+', ' ', 'g')), term) > 0
              or strpos(lower(r.roll_number), term) > 0 or strpos(lower(r.id_number), term) > 0
            )
          ) or (
            p_section = 'room_key' and (
              strpos(lower(r.room_number), term) > 0
              or strpos(lower(regexp_replace(r.holder_name, '[[:space:]]+', ' ', 'g')), term) > 0
            )
          )
        )
      order by r.created_at desc, r.id
      limit 15 offset p_offset
    ) as r
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.create_report(jsonb), public.edit_report(uuid, jsonb),
  public.list_my_reports(integer), public.directory_reports(public.report_section, public.report_kind, text, integer)
  from public, anon, authenticated;
grant execute on function public.create_report(jsonb), public.edit_report(uuid, jsonb),
  public.list_my_reports(integer), public.directory_reports(public.report_section, public.report_kind, text, integer)
  to authenticated;

commit;
