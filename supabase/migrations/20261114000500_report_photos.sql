begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 500000, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 500000,
  allowed_mime_types = array['image/jpeg'];

create table public.report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  width integer not null check (width between 1 and 1600),
  height integer not null check (height between 1 and 1600),
  bytes integer not null check (bytes between 1 and 500000),
  created_at timestamptz not null default now()
);
create index report_photos_report_idx on public.report_photos(report_id, created_at);
alter table public.report_photos enable row level security;
revoke all on public.report_photos from public, anon, authenticated;

create function public.can_upload_report_photo(p_object_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := storage.foldername(p_object_path);
begin
  return public.is_ashoka_member()
    and parts[1] = auth.uid()::text
    and exists (select 1 from public.reports r where r.id = parts[2]::uuid
      and r.owner_id = auth.uid() and r.section = 'general' and r.status = 'open');
exception when invalid_text_representation then return false;
end;
$$;

create function public.can_view_report_photo(p_object_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := storage.foldername(p_object_path);
begin
  return public.is_ashoka_member()
    and exists (select 1 from public.reports r where r.id = parts[2]::uuid
      and (r.owner_id = auth.uid() or r.status = 'open'));
exception when invalid_text_representation then return false;
end;
$$;

create policy "eligible members view available report photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'report-photos' and public.can_view_report_photo(name)
  );
create policy "owners upload photos to open general reports" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'report-photos' and public.can_upload_report_photo(name)
  );
create policy "owners delete photos from open general reports" on storage.objects
  for delete to authenticated using (
    bucket_id = 'report-photos' and public.can_upload_report_photo(name)
  );

create function public.add_report_photo(p_report_id uuid, p_object_path text, p_width integer, p_height integer, p_bytes integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); new_photo uuid;
begin
  if not public.is_ashoka_member() then raise exception 'University access required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  if p_object_path !~ ('^' || caller::text || '/' || p_report_id::text || '/[0-9a-f-]{36}[.]jpg$') then
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

create function public.list_report_photos(p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if not public.is_ashoka_member() then raise exception 'University access required' using errcode = '42501'; end if;
  if not exists(select 1 from public.reports where id = p_report_id and (owner_id = caller or status = 'open')) then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('path',object_path,'width',width,'height',height) order by created_at)
    from public.report_photos where report_id = p_report_id),'[]'::jsonb);
end;
$$;

revoke all on function public.can_upload_report_photo(text) from public, anon;
revoke all on function public.can_view_report_photo(text) from public, anon;
revoke all on function public.add_report_photo(uuid,text,integer,integer,integer) from public, anon;
revoke all on function public.list_report_photos(uuid) from public, anon;
grant execute on function public.can_upload_report_photo(text) to authenticated;
grant execute on function public.can_view_report_photo(text) to authenticated;
grant execute on function public.add_report_photo(uuid,text,integer,integer,integer) to authenticated;
grant execute on function public.list_report_photos(uuid) to authenticated;

commit;
