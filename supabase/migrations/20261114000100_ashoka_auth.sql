begin;

-- New-user rejection is an early guard. Policies must also use the helper below.
create or replace function public.allow_ashoka_google_signup(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(event->'user'->'app_metadata'->>'provider', '') <> 'google'
    or coalesce(event->'user'->>'email', '') !~* '^[^@[:space:]]+@ashoka[.]edu[.]in$'
  then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sign in with your @ashoka.edu.in Google account.'
    ));
  end if;

  -- Confirmation and identity checks happen after OAuth finishes, at data access.
  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
revoke all on function public.allow_ashoka_google_signup(jsonb) from public, anon, authenticated;
grant execute on function public.allow_ashoka_google_signup(jsonb) to supabase_auth_admin;

-- No input user ID: this function checks only the caller's current Auth records.
-- SECURITY DEFINER is needed to read protected Auth tables; no rows are exposed.
create or replace function public.is_ashoka_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as member
    where member.id = (select auth.uid())
      and member.email_confirmed_at is not null
      and member.email ~* '^[^@[:space:]]+@ashoka[.]edu[.]in$'
      and member.raw_app_meta_data->>'provider' = 'google'
      and exists (
        select 1
        from auth.identities as identity
        where identity.user_id = member.id
          and identity.provider = 'google'
          and lower(identity.identity_data->>'email') = lower(member.email)
      )
  );
$$;

revoke all on function public.is_ashoka_member() from public, anon;
grant execute on function public.is_ashoka_member() to authenticated;

comment on function public.is_ashoka_member() is
  'Caller-only eligibility check. Required in every app data/storage policy and sensitive function.';

commit;
