begin;

create function public.remove_report_photo(p_report_id uuid, p_object_path text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); removed integer;
begin
  if not public.is_ashoka_member() then raise exception 'University access required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  delete from public.report_photos p using public.reports r
    where p.report_id = p_report_id and p.object_path = p_object_path
      and p.owner_id = caller and r.id = p.report_id and r.owner_id = caller and r.status = 'open';
  get diagnostics removed = row_count;
  if removed = 0 then raise exception 'Photo not found' using errcode = 'P0002'; end if;
  return true;
end;
$$;
revoke all on function public.remove_report_photo(uuid,text) from public, anon;
grant execute on function public.remove_report_photo(uuid,text) to authenticated;

commit;
