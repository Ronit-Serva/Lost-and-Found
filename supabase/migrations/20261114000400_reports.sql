begin;

create type public.report_kind as enum ('lost', 'found');
create type public.report_section as enum ('general', 'id_card', 'room_key');
create type public.report_status as enum ('open', 'reserved', 'resolved', 'returned', 'withdrawn');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind public.report_kind not null,
  section public.report_section not null,
  status public.report_status not null default 'open',
  title text not null,
  category text,
  description text,
  location text,
  occurred_on date,
  approximate_date boolean not null default false,
  withheld_detail_confirmed boolean not null default false,
  cardholder_name text,
  roll_number text,
  id_number text,
  room_number text,
  holder_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_title_length check (char_length(title) between 1 and 120),
  constraint reports_general_shape check (
    (section = 'general' and category is not null and char_length(category) between 1 and 60
      and description is not null and char_length(description) between 1 and 1200
      and location is not null and char_length(location) between 1 and 120
      and occurred_on is not null and (kind = 'lost' or withheld_detail_confirmed)
      and cardholder_name is null and roll_number is null
      and id_number is null and room_number is null and holder_name is null)
    or (section = 'id_card' and category is null and description is null and location is null
      and occurred_on is null and not approximate_date and not withheld_detail_confirmed
      and room_number is null and holder_name is null
      and (roll_number is not null or id_number is not null)
      and (cardholder_name is null or char_length(cardholder_name) between 1 and 120))
    or (section = 'room_key' and category is null and description is null and location is null
      and occurred_on is null and not approximate_date and not withheld_detail_confirmed
      and cardholder_name is null and roll_number is null and id_number is null
      and room_number is not null and holder_name is not null
      and char_length(room_number) between 1 and 80 and char_length(holder_name) between 1 and 120)
  ),
  constraint reports_status_section check (
    (kind = 'lost' and status in ('open', 'resolved', 'withdrawn')) or
    (kind = 'found' and status in ('open', 'reserved', 'returned', 'withdrawn'))
  )
);

create index reports_discovery_idx on public.reports(section, kind, status, created_at desc);
create index reports_owner_idx on public.reports(owner_id, created_at desc);
alter table public.reports enable row level security;
revoke all on public.reports from public, anon, authenticated;

create function public.report_title(p_data jsonb, p_section public.report_section)
returns text language plpgsql immutable set search_path = '' as $$
declare result text;
begin
  if p_section = 'id_card' then
    result := coalesce(nullif(btrim(p_data->>'cardholder_name'), ''), 'ID card');
    return left(result || case when nullif(btrim(p_data->>'roll_number'), '') is not null
      then ' · Roll ' || btrim(p_data->>'roll_number') else '' end, 120);
  elsif p_section = 'room_key' then
    return left('Room key · ' || btrim(p_data->>'room_number') || ' · ' || btrim(p_data->>'holder_name'), 120);
  end if;
  return btrim(p_data->>'title');
end;
$$;

create function public.create_report(p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  report_type public.report_kind;
  report_section public.report_section;
  active_count integer;
  new_id uuid;
  allowed_keys text[];
begin
  if not public.is_ashoka_member() then raise exception 'University access required' using errcode = '42501'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Report object required' using errcode = '22023'; end if;
  report_type := (p_data->>'kind')::public.report_kind;
  report_section := (p_data->>'section')::public.report_section;

  if report_section = 'general' then
    allowed_keys := array['kind','section','title','category','description','location','occurred_on','approximate_date','withheld_detail_confirmed'];
  elsif report_section = 'id_card' then
    allowed_keys := array['kind','section','cardholder_name','roll_number','id_number'];
  else
    allowed_keys := array['kind','section','room_number','holder_name'];
  end if;
  if exists (select 1 from jsonb_object_keys(p_data) key where not (key = any(allowed_keys))) then
    raise exception 'Unsupported report field for section' using errcode = '22023';
  end if;
  if not (p_data ? 'kind' and p_data ? 'section') then raise exception 'Report type and section required' using errcode = '22023'; end if;

  -- All create/edit/close paths acquire the same per-user transaction lock.
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  select count(*) into active_count from public.reports r where r.owner_id = caller
    and r.kind = report_type and (r.status = 'open' or (report_type = 'found' and r.status = 'reserved'));
  if active_count >= 3 then raise exception 'Active report limit reached' using errcode = 'P0001', detail = report_type::text; end if;

  insert into public.reports (owner_id, kind, section, title, category, description, location,
    occurred_on, approximate_date, withheld_detail_confirmed, cardholder_name, roll_number,
    id_number, room_number, holder_name)
  values (caller, report_type, report_section, public.report_title(p_data, report_section),
    nullif(btrim(p_data->>'category'), ''), nullif(btrim(p_data->>'description'), ''),
    nullif(btrim(p_data->>'location'), ''), nullif(p_data->>'occurred_on', '')::date,
    coalesce((p_data->>'approximate_date')::boolean, false),
    coalesce((p_data->>'withheld_detail_confirmed')::boolean, false),
    nullif(btrim(p_data->>'cardholder_name'), ''), nullif(btrim(p_data->>'roll_number'), ''),
    nullif(btrim(p_data->>'id_number'), ''), nullif(btrim(p_data->>'room_number'), ''),
    nullif(btrim(p_data->>'holder_name'), '')) returning id into new_id;
  return new_id;
end;
$$;

create function public.edit_report(p_report_id uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  old_report public.reports%rowtype;
  allowed_keys text[];
begin
  if not public.is_ashoka_member() then raise exception 'University access required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  select * into old_report from public.reports where id = p_report_id and owner_id = caller for update;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
  if old_report.status <> 'open' then raise exception 'Only open reports can be edited' using errcode = '55000'; end if;
  if p_data ? 'kind' or p_data ? 'section' then raise exception 'Report type and section are immutable' using errcode = '22023'; end if;
  if old_report.section = 'general' then
    allowed_keys := array['title','category','description','location','occurred_on','approximate_date','withheld_detail_confirmed'];
  elsif old_report.section = 'id_card' then allowed_keys := array['cardholder_name','roll_number','id_number'];
  else allowed_keys := array['room_number','holder_name']; end if;
  if exists (select 1 from jsonb_object_keys(p_data) key where not (key = any(allowed_keys))) then
    raise exception 'Unsupported report field for section' using errcode = '22023';
  end if;
  update public.reports set
    title = case when old_report.section = 'general' then coalesce(nullif(btrim(p_data->>'title'), ''), title)
      else public.report_title(p_data || jsonb_build_object('cardholder_name',coalesce(p_data->>'cardholder_name',old_report.cardholder_name),
        'roll_number',coalesce(p_data->>'roll_number',old_report.roll_number),'id_number',coalesce(p_data->>'id_number',old_report.id_number),
        'room_number',coalesce(p_data->>'room_number',old_report.room_number),'holder_name',coalesce(p_data->>'holder_name',old_report.holder_name)), old_report.section) end,
    category = case when p_data ? 'category' then nullif(btrim(p_data->>'category'), '') else category end,
    description = case when p_data ? 'description' then nullif(btrim(p_data->>'description'), '') else description end,
    location = case when p_data ? 'location' then nullif(btrim(p_data->>'location'), '') else location end,
    occurred_on = case when p_data ? 'occurred_on' then nullif(p_data->>'occurred_on', '')::date else occurred_on end,
    approximate_date = coalesce((p_data->>'approximate_date')::boolean, approximate_date),
    withheld_detail_confirmed = coalesce((p_data->>'withheld_detail_confirmed')::boolean, withheld_detail_confirmed),
    cardholder_name = case when p_data ? 'cardholder_name' then nullif(btrim(p_data->>'cardholder_name'), '') else cardholder_name end,
    roll_number = case when p_data ? 'roll_number' then nullif(btrim(p_data->>'roll_number'), '') else roll_number end,
    id_number = case when p_data ? 'id_number' then nullif(btrim(p_data->>'id_number'), '') else id_number end,
    room_number = case when p_data ? 'room_number' then nullif(btrim(p_data->>'room_number'), '') else room_number end,
    holder_name = case when p_data ? 'holder_name' then nullif(btrim(p_data->>'holder_name'), '') else holder_name end,
    updated_at = now() where id = p_report_id;
end;
$$;

create function public.close_report(p_report_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if not public.is_ashoka_member() then raise exception 'University access required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  update public.reports set status = case when kind = 'lost' then 'resolved'::public.report_status
    else 'withdrawn'::public.report_status end, updated_at = now()
    where id = p_report_id and owner_id = caller and status = 'open';
  if not found then raise exception 'Open report not found' using errcode = 'P0002'; end if;
end;
$$;

create function public.list_my_reports()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ashoka_member() then raise exception 'University access required' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'kind',kind,'section',section,'status',status,'title',title,'category',category,
    'description',description,'location',location,'occurred_on',occurred_on,'approximate_date',approximate_date,
    'cardholder_name',cardholder_name,'roll_number',roll_number,'id_number',id_number,
    'room_number',room_number,'holder_name',holder_name,'created_at',created_at) order by created_at desc)
    from public.reports where owner_id = auth.uid()), '[]'::jsonb);
end;
$$;

create function public.directory_reports(p_section public.report_section, p_kind public.report_kind, p_query text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare term text := lower(regexp_replace(coalesce(p_query,''), '\s+', ' ', 'g'));
begin
  if not public.is_ashoka_member() then raise exception 'University access required' using errcode = '42501'; end if;
  if char_length(term) > 120 then raise exception 'Search query too long' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'kind',r.kind,'section',r.section,'title',r.title,'category',r.category,
    'description',r.description,'location',r.location,'occurred_on',r.occurred_on,
    'approximate_date',r.approximate_date,'cardholder_name',r.cardholder_name,
    'roll_number',r.roll_number,'id_number',r.id_number,'room_number',r.room_number,
    'holder_name',r.holder_name,'created_at',r.created_at) order by r.created_at desc)
    from public.reports r where r.section = p_section and r.kind = p_kind
      and r.status = 'open' and r.owner_id <> auth.uid()
      and (term = '' or (p_section = 'general' and (r.title ilike '%'||term||'%' or r.category ilike '%'||term||'%' or r.description ilike '%'||term||'%' or r.location ilike '%'||term||'%'))
        or (p_section = 'id_card' and (lower(coalesce(r.cardholder_name,'')) like '%'||term||'%' or lower(coalesce(r.roll_number,'')) like '%'||term||'%' or lower(coalesce(r.id_number,'')) like '%'||term||'%'))
        or (p_section = 'room_key' and (lower(coalesce(r.room_number,'')) like '%'||term||'%' or lower(coalesce(r.holder_name,'')) like '%'||term||'%')))
    limit 100), '[]'::jsonb);
end;
$$;

revoke all on function public.create_report(jsonb) from public, anon;
revoke all on function public.edit_report(uuid,jsonb) from public, anon;
revoke all on function public.close_report(uuid) from public, anon;
revoke all on function public.list_my_reports() from public, anon;
revoke all on function public.directory_reports(public.report_section,public.report_kind,text) from public, anon;
grant execute on function public.create_report(jsonb) to authenticated;
grant execute on function public.edit_report(uuid,jsonb) to authenticated;
grant execute on function public.close_report(uuid) to authenticated;
grant execute on function public.list_my_reports() to authenticated;
grant execute on function public.directory_reports(public.report_section,public.report_kind,text) to authenticated;

commit;
