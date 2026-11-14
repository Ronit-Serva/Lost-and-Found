begin;

create or replace function public.can_upload_report_photo(p_object_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := storage.foldername(p_object_path);
begin
  return public.is_ashoka_member()
    and exists (select 1 from public.reports r where r.id = parts[1]::uuid
      and r.owner_id = auth.uid() and r.section = 'general' and r.status = 'open');
exception when invalid_text_representation then return false;
end;
$$;

create or replace function public.can_view_report_photo(p_object_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := storage.foldername(p_object_path);
begin
  return public.is_ashoka_member()
    and exists (select 1 from public.reports r where r.id = parts[1]::uuid
      and (r.owner_id = auth.uid() or r.status = 'open'));
exception when invalid_text_representation then return false;
end;
$$;

create or replace function public.add_report_photo(p_report_id uuid, p_object_path text, p_width integer, p_height integer, p_bytes integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); new_photo uuid;
begin
  if not public.is_ashoka_member() then raise exception 'University access required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  if p_object_path !~ ('^' || p_report_id::text || '/[0-9a-f-]{36}[.]jpg$') then
    raise exception 'Invalid photo path' using errcode = '22023';
  end if;
  if not exists (select 1 from public.reports where id = p_report_id and owner_id = caller and section = 'general' and status = 'open') then
    raise exception 'Open general report not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.report_photos where report_id = p_report_id) >= 3 then
    raise exception 'Report photo limit reached' using errcode = 'P0001';
  end if;
  insert into public.report_photos(report_id,owner_id,object_path,width,height,bytes)
    values(p_report_id,caller,p_object_path,p_width,p_height,p_bytes) returning id into new_photo;
  return new_photo;
end;
$$;

commit;
