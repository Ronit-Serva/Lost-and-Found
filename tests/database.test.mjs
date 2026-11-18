import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'

const db = new PGlite({ extensions: { vector } })
const memberId = '11111111-1111-4111-8111-111111111111'
const peerId = '33333333-3333-4333-8333-333333333333'
const outsiderId = '22222222-2222-4222-8222-222222222222'
const unrelatedId = '44444444-4444-4444-8444-444444444444'

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
  const migrations = [
    '20261114000100_ashoka_auth.sql',
    '20261114000200_phase1_probe.sql',
    '20261114000300_retire_phase1_probe.sql',
    '20261114000400_reports.sql',
    '20261114000500_report_photos.sql',
    '20261114000600_remove_report_photo.sql',
    '20261114000700_hide_photo_owner_uuid.sql',
    '20261119000100_claim_submission.sql',
  ]
  for (const name of migrations) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
  }
  await db.query(`insert into auth.users values
    ($1, 'student@ashoka.edu.in', now(), '{"provider":"google"}', '{}'),
    ($2, 'peer@ashoka.edu.in', now(), '{"provider":"google"}', '{}'),
    ($3, 'outsider@gmail.com', now(), '{"provider":"google"}', '{"eligible":true,"hd":"ashoka.edu.in"}'),
    ($4, 'unrelated@ashoka.edu.in', now(), '{"provider":"google"}', '{}')`, [memberId, peerId, outsiderId, unrelatedId])
  await db.query(`insert into auth.identities values
    ($1, 'google', '{"email":"student@ashoka.edu.in"}'),
    ($2, 'google', '{"email":"peer@ashoka.edu.in"}'),
    ($3, 'google', '{"email":"outsider@gmail.com"}'),
    ($4, 'google', '{"email":"unrelated@ashoka.edu.in"}')`, [memberId, peerId, outsiderId, unrelatedId])
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

async function submitClaim(reportId, { requestId = randomUUID(), evidence = 'A zigzag stitch inside the pocket.', lostId = null } = {}) {
  return (await db.query('select public.submit_claim($1, $2, $3, $4) as id', [reportId, requestId, evidence, lostId])).rows[0].id
}

async function myClaims() {
  return (await db.query('select public.list_my_claims() as claims')).rows[0].claims
}

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

test('claim evidence and anonymous references are restricted to claimant and finder', async () => {
  await asCaller(memberId)
  const foundId = await create(general('found', 'Green tote'))
  await asCaller(peerId)
  const lostId = await create(general('lost', 'My canvas bag'))
  const evidence = 'An embroidered triangle in the lining.'
  const claimId = await submitClaim(foundId, { evidence: `\n ${evidence} \t`, lostId })

  for (const [caller, role, lostTitle] of [
    [peerId, 'claimant', 'My canvas bag'],
    [memberId, 'finder', null],
  ]) {
    await asCaller(caller)
    const [claim] = await myClaims()
    assert.equal(claim.id, claimId)
    assert.equal(claim.found_title, 'Green tote')
    assert.equal(claim.status, 'pending')
    assert.equal(claim.role, role)
    assert.equal(claim.evidence, evidence)
    assert.equal(claim.lost_title, lostTitle)
    const projection = JSON.stringify(claim)
    for (const value of [memberId, peerId, lostId, '@ashoka.edu.in']) {
      assert.equal(projection.includes(value), false)
    }
    for (const table of ['claims', 'claim_events', 'notifications']) {
      await assert.rejects(db.query(`select * from private.${table}`), { code: '42501' })
    }
  }

  await asCaller(unrelatedId)
  assert.deepEqual(await myClaims(), [])
  const { rows: [{ reports }] } = await db.query("select public.directory_reports('general', 'found', 'Green tote') as reports")
  assert.equal(reports[0].id, foundId)
  assert.equal(JSON.stringify(reports).includes(evidence), false)
  assert.equal(JSON.stringify(reports).includes(claimId), false)
  await asCaller(outsiderId)
  await assert.rejects(myClaims(), /University access required/)
  await assert.rejects(submitClaim(foundId), /University access required/)
  await asCaller('', 'anon')
  await assert.rejects(myClaims(), /permission denied for function/)
  await assert.rejects(submitClaim(foundId), /permission denied for function/)
})

test('claim submission validates target, evidence, linked report ownership, and active duplicates', async () => {
  await asCaller(memberId)
  const foundId = await create(general('found', 'Blue jacket'))
  await assert.rejects(submitClaim(foundId), /cannot claim your own report/)

  await asCaller(unrelatedId)
  const unrelatedLostId = await create(general('lost', 'Campus scarf'))
  await asCaller(peerId)
  await assert.rejects(submitClaim(unrelatedLostId), /Found report is unavailable/)
  await assert.rejects(submitClaim(foundId, { lostId: unrelatedLostId }), /must be your own lost report/)
  await assert.rejects(submitClaim(foundId, { lostId: foundId }), /must be your own lost report/)
  await assert.rejects(submitClaim(foundId, { evidence: '\n \t' }), /Enter 1 to 2000 characters/)
  await assert.rejects(submitClaim(foundId, { evidence: 'x'.repeat(2001) }), /Enter 1 to 2000 characters/)
  const requestId = randomUUID()
  const claimId = await submitClaim(foundId, { requestId })
  assert.equal(await submitClaim(foundId, { requestId }), claimId)
  await assert.rejects(submitClaim(foundId, { requestId, evidence: 'Different evidence' }), /Request ID was already used/)
  await assert.rejects(submitClaim(foundId), /already have an active claim/)

  await asCaller(unrelatedId)
  const secondClaimId = await submitClaim(foundId)
  await asCaller(memberId)
  await db.query('select public.close_report($1)', [foundId])
  for (const [caller, id] of [[peerId, claimId], [unrelatedId, secondClaimId]]) {
    await asCaller(caller)
    const claim = (await myClaims()).find((entry) => entry.id === id)
    assert.equal(claim.status, 'rejected')
    assert.equal(claim.outcome_reason, 'report withdrawn')
  }
  await asCaller(peerId)
  assert.equal(await submitClaim(foundId, { requestId }), claimId, 'an exact retry succeeds after report closure')
  await assert.rejects(submitClaim(foundId), /Found report is unavailable/)

  await db.exec('reset role')
  const { rows } = await db.query(`
    select e.claim_id, e.status, n.recipient_id
    from private.claim_events e join private.notifications n on n.event_id = e.id
    where e.claim_id in ($1, $2)
    order by e.status, n.recipient_id, e.claim_id
  `, [claimId, secondClaimId])
  assert.deepEqual(rows.slice(0, 2).map(({ status, recipient_id }) => ({ status, recipient_id })), [
    { status: 'pending', recipient_id: memberId },
    { status: 'pending', recipient_id: memberId },
  ])
  assert.deepEqual(rows.slice(2), [
    { claim_id: claimId, status: 'rejected', recipient_id: peerId },
    { claim_id: secondClaimId, status: 'rejected', recipient_id: unrelatedId },
  ])
})

test('a failed claim notification rolls back the claim, event, and request ID', async () => {
  await asCaller(unrelatedId)
  const foundId = await create(general('found', 'Black water bottle'))
  await db.exec('reset role')
  const counts = async () => (await db.query(`
    select (select count(*)::int from private.claims) as claims,
           (select count(*)::int from private.claim_events) as events,
           (select count(*)::int from private.notifications) as notifications
  `)).rows[0]
  const before = await counts()
  await db.exec('alter table private.notifications add constraint fixture_reject_notification check (false) not valid')
  const requestId = randomUUID()
  try {
    await asCaller(peerId)
    await assert.rejects(submitClaim(foundId, { requestId }), /fixture_reject_notification/)
    await db.exec('reset role')
    assert.deepEqual(await counts(), before)
  } finally {
    await db.exec('reset role; alter table private.notifications drop constraint fixture_reject_notification')
  }

  await asCaller(peerId)
  await submitClaim(foundId, { requestId })
  await db.exec('reset role')
  assert.deepEqual(await counts(), {
    claims: before.claims + 1,
    events: before.events + 1,
    notifications: before.notifications + 1,
  })
})
