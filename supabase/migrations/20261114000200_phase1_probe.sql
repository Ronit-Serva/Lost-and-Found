begin;

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- A small persistent budget survives Edge cold starts and concurrent requests.
create table private.phase1_probe_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  runs integer not null check (runs between 1 and 3),
  primary key (user_id, day)
);
alter table private.phase1_probe_usage enable row level security;
revoke all on private.phase1_probe_usage from public, anon, authenticated;

create or replace function public.phase1_begin_probe()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare claimed integer;
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;

  insert into private.phase1_probe_usage as usage (user_id, day, runs)
  values (auth.uid(), (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, day) do update set runs = usage.runs + 1
    where usage.runs < 3
  returning runs into claimed;

  return claimed is not null;
end;
$$;

-- Ephemeral synthetic candidates: no report/profile/evidence data is read or saved.
create or replace function public.phase1_vector_probe(
  query_embedding extensions.vector,
  matching_embedding extensions.vector,
  unrelated_embedding extensions.vector
)
returns table (candidate text, similarity double precision)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_ashoka_member() then
    raise exception 'University access required' using errcode = '42501';
  end if;
  if query_embedding is null or matching_embedding is null or unrelated_embedding is null
    or extensions.vector_dims(query_embedding) <> 384
    or extensions.vector_dims(matching_embedding) <> 384
    or extensions.vector_dims(unrelated_embedding) <> 384
    or extensions.vector_norm(query_embedding) = 0
    or extensions.vector_norm(matching_embedding) = 0
    or extensions.vector_norm(unrelated_embedding) = 0
  then
    raise exception 'Three nonzero 384-dimensional vectors required' using errcode = '22023';
  end if;

  return query
    select sample.label, 1 - (sample.embedding operator(extensions.<=>) query_embedding)
    from (values ('matching'::text, matching_embedding), ('unrelated'::text, unrelated_embedding)) as sample(label, embedding)
    order by sample.embedding operator(extensions.<=>) query_embedding, sample.label;
end;
$$;

revoke all on function public.phase1_begin_probe() from public, anon;
grant execute on function public.phase1_begin_probe() to authenticated;
revoke all on function public.phase1_vector_probe(extensions.vector, extensions.vector, extensions.vector) from public, anon;
grant execute on function public.phase1_vector_probe(extensions.vector, extensions.vector, extensions.vector) to authenticated;

commit;
