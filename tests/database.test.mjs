import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'

const db = new PGlite({ extensions: { vector } })
const memberId = '11111111-1111-4111-8111-111111111111'
const peerId = '33333333-3333-4333-8333-333333333333'
const outsiderId = '22222222-2222-4222-8222-222222222222'

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role supabase_auth_admin;
    create schema auth;
    create schema storage;
    grant usage on schema storage to authenticated;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant select, insert, delete on storage.objects to authenticated;
    create function storage.foldername(p_path text) returns text[] language sql immutable as $$select (string_to_array(p_path,'/'))[1:array_length(string_to_array(p_path,'/'),1)-1]$$;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb);
    create table auth.identities (user_id uuid, provider text, identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
  `)
  for (const name of ['20261114000100_ashoka_auth.sql', '20261114000200_phase1_probe.sql', '20261114000300_retire_phase1_probe.sql', '20261114000400_reports.sql', '20261114000500_report_photos.sql', '20261114000600_remove_report_photo.sql', '20261114000700_hide_photo_owner_uuid.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
  }
  await db.query(`insert into auth.users values
    ($1, 'student@ashoka.edu.in', now(), '{"provider":"google"}', '{}'),
    ($2, 'peer@ashoka.edu.in', now(), '{"provider":"google"}', '{}'),
    ($3, 'outsider@gmail.com', now(), '{"provider":"google"}', '{"eligible":true,"hd":"ashoka.edu.in"}')`, [memberId, peerId, outsiderId])
  await db.query(`insert into auth.identities values
    ($1, 'google', '{"email":"student@ashoka.edu.in"}'),
    ($2, 'google', '{"email":"peer@ashoka.edu.in"}'),
    ($3, 'google', '{"email":"outsider@gmail.com"}')`, [memberId, peerId, outsiderId])
})
after(async () => { await db.close() })

async function asCaller(id, role = 'authenticated') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await db.exec(`set role ${role}`)
}
async function allowed() { return (await db.query('select public.is_ashoka_member() as allowed')).rows[0].allowed }
async function create(data) { return (await db.query('select public.create_report($1::jsonb) as id', [JSON.stringify(data)])).rows[0].id }
const general = (kind, title) => ({ kind, section: 'general', title, category: 'Accessories', description: 'Blue canvas pouch', location: 'Library', occurred_on: '2026-11-13', withheld_detail_confirmed: kind === 'found' })

test('signup hook accepts only exact Ashoka Google addresses, including case variants', async () => {
  await asCaller('', 'supabase_auth_admin')
  for (const [email, provider, expected] of [
    ['student@ashoka.edu.in', 'google', true], ['Student@ASHOKA.EDU.IN', 'google', true],
    ['student@gmail.com', 'google', false], ['student@ashoka.edu.in.evil.test', 'google', false],
    ['student@sub.ashoka.edu.in', 'google', false], ['student@ashoka.edu.in ', 'google', false],
    ['a@b@ashoka.edu.in', 'google', false], ['@ashoka.edu.in', 'google', false],
    [null, 'google', false], ['student@ashoka.edu.in', 'email', false], ['student@ashoka.edu.in', null, false],
  ]) {
    const { rows } = await db.query('select public.allow_ashoka_google_signup($1::jsonb) as result', [JSON.stringify({ user: { email, app_metadata: { provider } } })])
    assert.equal(!rows[0].result.error, expected, `${email}/${provider}`)
  }
})

test('membership rejects unconfirmed, mismatched, missing and non-Google identities', async () => {
  await asCaller(memberId); assert.equal(await allowed(), true)
  await db.exec('reset role; update auth.users set email_confirmed_at = null')
  await asCaller(memberId); assert.equal(await allowed(), false)
  await db.exec('reset role; update auth.users set email_confirmed_at = now()')
  await asCaller(outsiderId); assert.equal(await allowed(), false, 'forged user metadata cannot authorize outsider')
  await db.exec(`reset role; update auth.identities set identity_data = '{"email":"other@ashoka.edu.in"}' where user_id = '${memberId}'`)
  await asCaller(memberId); assert.equal(await allowed(), false)
  await db.exec(`reset role; update auth.identities set identity_data = '{"email":"STUDENT@ASHOKA.EDU.IN"}' where user_id = '${memberId}'`)
  await asCaller(memberId); assert.equal(await allowed(), true)
  await db.exec(`reset role; update auth.users set raw_app_meta_data = '{"provider":"email"}' where id = '${memberId}'`)
  await asCaller(memberId); assert.equal(await allowed(), false)
  await db.exec(`reset role; update auth.users set raw_app_meta_data = '{"provider":"google"}' where id = '${memberId}'; update auth.identities set provider = 'email' where user_id = '${memberId}'`)
  await asCaller(memberId); assert.equal(await allowed(), false)
  await db.exec(`reset role; update auth.identities set provider = 'google' where user_id = '${memberId}'`)
  await asCaller(''); assert.equal(await allowed(), false)
})

test('phase-one synthetic budget and endpoints are retired while Auth remains', async () => {
  await asCaller(memberId)
  assert.equal(await allowed(), true)
  await db.exec('reset role')
  assert.equal((await db.query("select to_regclass('private.phase1_probe_usage') as probe_table")).rows[0].probe_table, null)
  await assert.rejects(db.query('select public.phase1_begin_probe()'), /function public.phase1_begin_probe\(\) does not exist/)
  await assert.rejects(db.query('select * from public.phase1_vector_probe(null, null, null)'), /function public.phase1_vector_probe/)
})

test('unauthorized users cannot call report APIs or read base report data', async () => {
  await asCaller(outsiderId)
  await assert.rejects(create(general('lost', 'Wallet')), /University access required/)
  await assert.rejects(db.query('select * from public.directory_reports(\'general\',\'lost\',\'\')'), /University access required/)
  await asCaller(memberId)
  await assert.rejects(db.query('select * from public.reports'), /permission denied/)
  await asCaller('', 'anon')
  await assert.rejects(db.query("select public.is_ashoka_member()"), /permission denied/)
  await assert.rejects(db.query("select public.create_report('{}'::jsonb)"), /permission denied/)
})

test('mixed-section active quotas block a fourth and close releases one slot', async () => {
  await asCaller(memberId)
  await create({ kind: 'lost', section: 'id_card', cardholder_name: 'Asha', roll_number: '00127' })
  await create({ kind: 'lost', section: 'room_key', room_number: 'D-04-012', holder_name: 'Asha' })
  await create(general('lost', 'Wallet'))
  await assert.rejects(create({ kind: 'lost', section: 'id_card', id_number: '000998' }), /Active report limit reached/)
  assert.equal((await db.query("select count(*)::int as n from jsonb_array_elements(public.list_my_reports())")).rows[0].n, 3)
  await db.query('select public.close_report((public.list_my_reports()->0->>\'id\')::uuid)')
  await create({ kind: 'lost', section: 'id_card', id_number: '000998' })
  await assert.rejects(create({ kind: 'lost', section: 'id_card', cardholder_name: 'Bad photo', id_number: '1', description: 'not allowed' }), /Unsupported report field/)
})

test('directory returns only safe campus fields and never owner identity', async () => {
  await asCaller(memberId)
  const id = await create({ kind: 'found', section: 'id_card', cardholder_name: 'Asha Sen', roll_number: '000127', id_number: 'ID-0009' })
  await asCaller(peerId)
  const { rows } = await db.query("select public.directory_reports('id_card','found','000127') as reports")
  const [item] = rows[0].reports
  assert.equal(item.id, id)
  assert.equal(item.roll_number, '000127')
  assert.equal(item.id_number, 'ID-0009')
  assert.equal('owner_id' in item, false)
  assert.equal('email' in item, false)
})

test('specialized form constraints and immutable type/section are enforced', async () => {
  await asCaller(peerId)
  await assert.rejects(create({ kind: 'lost', section: 'room_key', room_number: 'D-4', holder_name: 'Asha', description: 'private field' }), /Unsupported report field/)
  await assert.rejects(create({ kind: 'lost', section: 'id_card', cardholder_name: 'Asha' }), /reports_general_shape/)
  const id = await create({ kind: 'lost', section: 'room_key', room_number: 'D-04-012', holder_name: 'Asha' })
  await assert.rejects(db.query("select public.edit_report($1, '{\"section\":\"general\"}'::jsonb)", [id]), /immutable/)
})

test('photo mutation is owner-only, general-only, and capped at three per report', async () => {
  await asCaller(memberId)
  const id = await create(general('found', 'Bag'))
  const objectPath = `${id}/00000000-0000-4000-8000-000000000010.jpg`
  await db.query("insert into storage.objects(bucket_id,name) values('report-photos',$1)", [objectPath])
  assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n, 1)
  for (let i = 0; i < 3; i++) {
    await db.query('select public.add_report_photo($1,$2,100,80,1234)', [id, `${id}/00000000-0000-4000-8000-00000000000${i}.jpg`])
  }
  await assert.rejects(db.query('select public.add_report_photo($1,$2,100,80,1234)', [id, `${id}/00000000-0000-4000-8000-000000000004.jpg`]), /photo limit/)
  await asCaller(peerId)
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('report-photos',$1)", [`${id}/00000000-0000-4000-8000-000000000011.jpg`]), /row-level security/)
  assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n, 1, 'eligible peer may view an open report photo')
  await assert.rejects(db.query('select public.add_report_photo($1,$2,100,80,1234)', [id, `${id}/00000000-0000-4000-8000-000000000004.jpg`]), /Open general report not found/)
  const { rows } = await db.query('select public.list_report_photos($1) as photos', [id])
  assert.equal(rows[0].photos.length, 3)
  await asCaller(memberId)
  await db.query('select public.close_report($1)', [id])
  await asCaller(peerId)
  assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n, 0, 'closed report photos leave peer discovery')
  await asCaller(memberId)
  assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n, 1, 'owner retains access to history photos')
  const { rows: policies } = await db.query("select count(*)::int as n from pg_policies where schemaname='storage' and tablename='objects'")
  assert.equal(policies[0].n, 3)
})
