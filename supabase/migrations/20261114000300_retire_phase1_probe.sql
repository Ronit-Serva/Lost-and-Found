begin;

drop function if exists public.phase1_vector_probe(extensions.vector, extensions.vector, extensions.vector);
drop function if exists public.phase1_begin_probe();
drop table if exists private.phase1_probe_usage;

commit;
