begin;

create type public.report_contact_method as enum ('email', 'whatsapp');

alter table public.reports
  add column contact_method public.report_contact_method,
  add constraint reports_specialized_contact check (
    contact_method is null or section in ('id_card', 'room_key')
  );

create table private.whatsapp_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_number text not null check (phone_number ~ '^\+[1-9][0-9]{1,14}$')
);
alter table private.whatsapp_contacts enable row level security;
revoke all on private.whatsapp_contacts from public, anon, authenticated;

-- This lookup takes an owner ID and therefore stays private. Verify the current
-- address from Auth each time; account metadata supplied by a user is ignored.
create function private.report_contact(p_owner_id uuid, p_method public.report_contact_method)
returns text language sql stable set search_path = '' as $$
  select case p_method
    when 'email' then (
      select member.email
      from auth.users member
      where member.id = p_owner_id
        and member.email_confirmed_at is not null
        and member.email ~* '^[^@[:space:]]+@ashoka[.]edu[.]in$'
        and member.raw_app_meta_data->>'provider' = 'google'
        and exists (
          select 1 from auth.identities identity
          where identity.user_id = member.id and identity.provider = 'google'
            and lower(identity.identity_data->>'email') = lower(member.email)
        )
    )
    when 'whatsapp' then (
      select phone_number from private.whatsapp_contacts where user_id = p_owner_id
    )
  end;
$$;
revoke all on function private.report_contact(uuid, public.report_contact_method) from public, anon, authenticated;

create function public.get_my_whatsapp()
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;
  return private.report_contact(auth.uid(), 'whatsapp');
end;
$$;

create function public.set_my_whatsapp(p_number text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;
  if p_number is not null and p_number !~ '^\+[1-9][0-9]{1,14}$' then
    raise exception 'Enter an international WhatsApp number starting with + and a country code' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  if p_number is null then
    if exists (
      select 1 from public.reports
      where owner_id = caller and status = 'open' and contact_method = 'whatsapp'
    ) then
      raise exception 'Change or close open WhatsApp listings before removing your number' using errcode = '55000';
    end if;
    delete from private.whatsapp_contacts where user_id = caller;
  else
    insert into private.whatsapp_contacts (user_id, phone_number) values (caller, p_number)
    on conflict (user_id) do update set phone_number = excluded.phone_number;
  end if;
end;
$$;

create function private.require_report_contact(p_owner_id uuid, p_method text)
returns public.report_contact_method language plpgsql stable set search_path = '' as $$
declare
  method public.report_contact_method;
begin
  if p_method is null or p_method not in ('email', 'whatsapp') then
    raise exception 'Choose Email or WhatsApp for this listing' using errcode = '22023';
  end if;

  method := p_method::public.report_contact_method;
  if private.report_contact(p_owner_id, method) is null then
    if method = 'whatsapp' then
      raise exception 'Save a WhatsApp number before choosing WhatsApp' using errcode = '22023';
    end if;
    raise exception 'Verified Ashoka email unavailable' using errcode = '42501';
  end if;
  return method;
end;
$$;
revoke all on function private.require_report_contact(uuid, text) from public, anon, authenticated;

-- Keep the established report validation and quota behavior callable only from
-- the restricted wrappers. A renamed public RPC alone would still be callable.
alter function public.create_report(jsonb) set schema private;
alter function public.edit_report(uuid, jsonb) set schema private;
revoke all on function private.create_report(jsonb), private.edit_report(uuid, jsonb)
  from public, anon, authenticated;

create function public.create_report(p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  method public.report_contact_method;
  new_report_id uuid;
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object'
    or p_data->>'section' is null or p_data->>'section' not in ('id_card', 'room_key') then
    raise exception 'Choose ID cards or Room keys' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  method := private.require_report_contact(caller, p_data->>'contact_method');
  new_report_id := private.create_report(p_data - 'contact_method');
  update public.reports set contact_method = method where id = new_report_id;
  return new_report_id;
end;
$$;

create function public.edit_report(p_report_id uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  method public.report_contact_method;
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Report object required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  if not exists (
    select 1 from public.reports
    where id = p_report_id and owner_id = caller and section in ('id_card', 'room_key') and status = 'open'
  ) then
    raise exception 'Open ID card or room key report not found' using errcode = 'P0002';
  end if;

  method := private.require_report_contact(caller, p_data->>'contact_method');
  perform private.edit_report(p_report_id, p_data - 'contact_method');
  update public.reports set contact_method = method where id = p_report_id;
end;
$$;

create or replace function public.list_my_reports()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
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
    from public.reports r
    cross join lateral (
      select case when r.status = 'open' then private.report_contact(r.owner_id, r.contact_method) end as value
    ) contact
    where r.owner_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

create or replace function public.directory_reports(
  p_section public.report_section,
  p_kind public.report_kind,
  p_query text default ''
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  term text := lower(btrim(regexp_replace(coalesce(p_query, ''), '[[:space:]]+', ' ', 'g')));
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;
  if p_section is null or p_section not in ('id_card', 'room_key') then
    return '[]'::jsonb;
  end if;
  if char_length(term) > 120 then
    raise exception 'Search query too long' using errcode = '22023';
  end if;

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
      limit 100
    ) as r
  ), '[]'::jsonb);
end;
$$;

create function public.mark_report_returned(p_report_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  state public.report_status;
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  select status into state from public.reports
  where id = p_report_id and owner_id = caller and kind = 'found' and section in ('id_card', 'room_key')
  for update;
  if not found or state not in ('open', 'returned') then
    raise exception 'Returnable report not found' using errcode = 'P0002';
  end if;
  if state = 'returned' then
    return;
  end if;

  update public.reports set status = 'returned', updated_at = now() where id = p_report_id;

  -- Preserve coherent history for any pending claims from the earlier workflow.
  with rejected as (
    update private.claims set status = 'rejected'
    where found_report_id = p_report_id and status = 'pending'
    returning id, claimant_id
  ), events as (
    insert into private.claim_events(claim_id, status, reason)
    select id, 'rejected', 'item returned' from rejected
    returning id, claim_id
  )
  insert into private.notifications(event_id, recipient_id)
  select events.id, rejected.claimant_id from events join rejected on rejected.id = events.claim_id;
end;
$$;

revoke all on function public.get_my_whatsapp(), public.set_my_whatsapp(text),
  public.create_report(jsonb), public.edit_report(uuid, jsonb), public.mark_report_returned(uuid),
  public.list_my_reports(), public.directory_reports(public.report_section, public.report_kind, text)
  from public, anon, authenticated;
grant execute on function public.get_my_whatsapp(), public.set_my_whatsapp(text),
  public.create_report(jsonb), public.edit_report(uuid, jsonb), public.mark_report_returned(uuid),
  public.list_my_reports(), public.directory_reports(public.report_section, public.report_kind, text)
  to authenticated;

drop policy "eligible members view available report photos" on storage.objects;
drop policy "owners upload photos to open general reports" on storage.objects;
drop policy "owners delete photos from open general reports" on storage.objects;
revoke all on function public.can_upload_report_photo(text), public.can_view_report_photo(text),
  public.add_report_photo(uuid, text, integer, integer, integer), public.list_report_photos(uuid),
  public.remove_report_photo(uuid, text), public.submit_claim(uuid, uuid, text, uuid), public.list_my_claims()
  from public, anon, authenticated;

commit;
