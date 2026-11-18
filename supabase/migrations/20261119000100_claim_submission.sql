begin;

create type public.claim_status as enum (
  'pending', 'accepted', 'rejected', 'withdrawn', 'cancelled', 'completed'
);

create table private.claims (
  id uuid primary key default gen_random_uuid(),
  found_report_id uuid not null references public.reports(id) on delete cascade,
  claimant_id uuid not null references auth.users(id) on delete cascade,
  lost_report_id uuid references public.reports(id) on delete set null,
  request_id uuid not null,
  evidence text not null check (char_length(evidence) between 1 and 2000 and evidence ~ '[^[:space:]]'),
  status public.claim_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (claimant_id, request_id)
);

create unique index claims_one_active_per_claimant
  on private.claims(found_report_id, claimant_id) where status in ('pending', 'accepted');
create unique index claims_one_accepted_per_report
  on private.claims(found_report_id) where status = 'accepted';
create index claims_found_history_idx on private.claims(found_report_id, created_at desc);
create index claims_claimant_history_idx on private.claims(claimant_id, created_at desc);

create table private.claim_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references private.claims(id) on delete cascade,
  status public.claim_status not null,
  reason text check (reason is null or status = 'rejected'),
  created_at timestamptz not null default now(),
  unique (claim_id, status)
);

create table private.notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references private.claim_events(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (event_id, recipient_id)
);
create index notifications_recipient_idx on private.notifications(recipient_id, created_at desc);

alter table private.claims enable row level security;
alter table private.claim_events enable row level security;
alter table private.notifications enable row level security;
revoke all on private.claims, private.claim_events, private.notifications from public, anon, authenticated;

create function public.submit_claim(
  p_found_report_id uuid,
  p_request_id uuid,
  p_evidence text,
  p_lost_report_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  target public.reports%rowtype;
  prior private.claims%rowtype;
  normalized_evidence text := regexp_replace(p_evidence, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  claim_id uuid;
  event_id uuid;
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;
  if p_request_id is null or normalized_evidence is null or char_length(normalized_evidence) not between 1 and 2000 then
    raise exception 'Enter 1 to 2000 characters of evidence and supply a request ID' using errcode = '22023';
  end if;

  -- Serialize with report closure and reservation before checking availability.
  select * into target from public.reports
  where id = p_found_report_id and kind = 'found'
  for update;
  if not found then
    raise exception 'Found report is unavailable' using errcode = 'P0002';
  end if;

  select * into prior from private.claims where claimant_id = caller and request_id = p_request_id;
  if found then
    if prior.found_report_id = target.id and prior.evidence = normalized_evidence
      and prior.lost_report_id is not distinct from p_lost_report_id then
      return prior.id;
    end if;
    raise exception 'Request ID was already used' using errcode = '22023';
  end if;

  if target.owner_id = caller then
    raise exception 'You cannot claim your own report' using errcode = '42501';
  end if;
  if target.status <> 'open' then
    raise exception 'Found report is unavailable' using errcode = '55000';
  end if;
  if exists (
    select 1 from private.claims where found_report_id = target.id
      and claimant_id = caller and status in ('pending', 'accepted')
  ) then
    raise exception 'You already have an active claim for this report' using errcode = '23505';
  end if;
  if p_lost_report_id is not null then
    perform 1 from public.reports where id = p_lost_report_id and kind = 'lost' and owner_id = caller for key share;
    if not found then
      raise exception 'Linked report must be your own lost report' using errcode = '22023';
    end if;
  end if;

  insert into private.claims(found_report_id, claimant_id, lost_report_id, request_id, evidence)
  values (target.id, caller, p_lost_report_id, p_request_id, normalized_evidence)
  on conflict (claimant_id, request_id) do nothing
  returning id into claim_id;
  if not found then
    raise exception 'Request ID was already used' using errcode = '22023';
  end if;

  insert into private.claim_events(claim_id, status) values (claim_id, 'pending') returning id into event_id;
  insert into private.notifications(event_id, recipient_id) values (event_id, target.owner_id);
  return claim_id;
end;
$$;

create function public.list_my_claims()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'role', case when c.claimant_id = auth.uid() then 'claimant' else 'finder' end,
      'found_title', r.title, 'section', r.section, 'status', c.status,
      'evidence', c.evidence, 'created_at', c.created_at, 'outcome_reason', outcome.reason,
      'lost_title', case when c.claimant_id = auth.uid() then lost.title end
    ) order by c.created_at desc, c.id)
    from private.claims c
    join public.reports r on r.id = c.found_report_id
    left join public.reports lost on lost.id = c.lost_report_id and c.claimant_id = auth.uid()
    left join private.claim_events outcome on outcome.claim_id = c.id and outcome.status = 'rejected'
    where c.claimant_id = auth.uid() or r.owner_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

create or replace function public.close_report(p_report_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  report_kind public.report_kind;
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  update public.reports set
    status = case kind when 'lost' then 'resolved'::public.report_status else 'withdrawn'::public.report_status end,
    updated_at = now()
  where id = p_report_id and owner_id = caller and status = 'open'
  returning kind into report_kind;
  if not found then
    raise exception 'Open report not found' using errcode = 'P0002';
  end if;

  if report_kind = 'found' then
    -- Read claims after the report update acquires its lock, including submissions that just committed.
    with rejected as (
      update private.claims set status = 'rejected'
      where found_report_id = p_report_id and status = 'pending'
      returning id, claimant_id
    ), events as (
      insert into private.claim_events(claim_id, status, reason)
      select id, 'rejected', 'report withdrawn' from rejected
      returning id, claim_id
    )
    insert into private.notifications(event_id, recipient_id)
    select events.id, rejected.claimant_id from events join rejected on rejected.id = events.claim_id;
  end if;
end;
$$;

revoke all on function public.submit_claim(uuid, uuid, text, uuid), public.list_my_claims() from public, anon, authenticated;
grant execute on function public.submit_claim(uuid, uuid, text, uuid), public.list_my_claims() to authenticated;

commit;
