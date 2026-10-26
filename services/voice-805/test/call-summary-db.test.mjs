import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const summarySql = readFileSync(new URL('../../../supabase/migrations/20261025194500_voice_805_call_summaries.sql', import.meta.url), 'utf8');
const schema = `
create role anon;
create role authenticated;
create role service_role;
create table public.crm_customers(id uuid primary key, display_name text, phone text, meta jsonb not null default '{}');
create table public.crm_jobs(id uuid primary key, phone text, meta jsonb not null default '{}');
create table public.crm_customer_contracts(id uuid primary key, customer_id uuid, job_id uuid, meta jsonb not null default '{}');
create table public.crm_customer_products(id uuid primary key, customer_id uuid, job_id uuid, meta jsonb not null default '{}');
create table public.crm_activity_events(
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_email text,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  after_data jsonb,
  metadata jsonb not null default '{}'
);
create function public.voice_805_normalize_phone(p_phone text)
returns text language sql immutable strict security invoker set search_path='' as $$
 select case
 when p_phone !~ '^[+0-9().[:space:]-]+$' then null
 when trim(p_phone) like '+%' and regexp_replace(p_phone,'[^0-9]','','g') ~ '^[1-9][0-9]{7,14}$'
 then '+' || regexp_replace(p_phone,'[^0-9]','','g')
 when length(regexp_replace(p_phone,'[^0-9]','','g'))=10 then '+1' || regexp_replace(p_phone,'[^0-9]','','g')
 when regexp_replace(p_phone,'[^0-9]','','g') ~ '^1[0-9]{10}$' then '+' || regexp_replace(p_phone,'[^0-9]','','g')
 else null end
$$;
`;
const customer = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const ownJob = '33333333-3333-4333-8333-333333333333';
const otherJob = '44444444-4444-4444-8444-444444444444';
const otherPhoneJob = '55555555-5555-4555-8555-555555555555';
const strayJob = '66666666-6666-4666-8666-666666666666';

function resultOf(row) {
  const value = row.result;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

test('call summary upsert attaches only a job linked to this customer', async () => {
  assert.doesNotMatch(summarySql, /unique_violation/);
  assert.match(summarySql, /v_phone/);
  assert.match(summarySql, /customer\.meta/);
  assert.match(summarySql, /job\.phone/);
  const db = new PGlite();
  try {
    await db.exec(schema + summarySql);
    await db.exec(`
      insert into crm_customers(id, display_name, phone) values
        ('${customer}','Pat','8055550199'),
        ('${other}','Other','8055550199');
      insert into crm_jobs(id, phone) values
        ('${ownJob}','(805) 555-0199'),
        ('${otherJob}','8055550199'),
        ('${otherPhoneJob}','8055550100'),
        ('${strayJob}','+18055550199');
      insert into crm_customer_contracts(id, customer_id, job_id) values
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','${customer}','${ownJob}'),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','${other}','${otherJob}'),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','${customer}','${otherPhoneJob}');
    `);
    const save = async (sid, id, phone, summary) => resultOf((await db.query(
      'select public.voice_805_save_summary($1,$2,$3,$4,$5,$6) result',
      [sid, id, phone, summary, 'incomplete', false],
    )).rows[0]);
    const first = await save('CA123', customer, '+18055550199', 'First summary');
    assert.equal(first.saved, true);
    assert.equal(first.customer_id, customer);
    assert.equal(first.job_id, ownJob);
    const second = await save('CA123', customer, '+18055550199', 'Second summary');
    assert.equal(second.job_id, ownJob);
    const events = (await db.query("select entity_type, entity_id::text as entity_id, after_data->>'summary' as summary from crm_activity_events order by entity_type")).rows;
    assert.deepEqual(events.map((row) => [row.entity_type, row.entity_id, row.summary]), [
      ['customer', customer, 'Second summary'],
      ['job', ownJob, 'Second summary'],
    ]);
    const twins = '77777777-7777-4777-8777-777777777777';
    const twinA = '88888888-8888-4888-8888-888888888888';
    const twinB = '99999999-9999-4999-8999-999999999999';
    await db.exec(`
      insert into crm_customers(id, display_name, phone) values ('${twins}','Twins','8055550188');
      insert into crm_jobs(id, phone) values ('${twinA}','8055550188'), ('${twinB}','+1 805 555 0188');
      insert into crm_customer_contracts(id, customer_id, job_id) values
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','${twins}','${twinA}'),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','${twins}','${twinB}');
    `);
    const many = await save('CA-twins', twins, '8055550188', 'Two jobs');
    assert.equal(many.saved, true);
    assert.equal(many.job_id, null);
    assert.equal((await db.query("select count(*)::int n from crm_activity_events where metadata->>'call_sid'='CA-twins' and entity_type='job'")).rows[0].n, 0);
    const productCustomer = 'aaaaaaaa-1111-4111-8111-111111111112';
    const productJob = 'aaaaaaaa-2222-4222-8222-222222222223';
    await db.exec(`
      insert into crm_customers(id, display_name, phone) values ('${productCustomer}','Product','8055550170');
      insert into crm_jobs(id, phone) values ('${productJob}','8055550170');
      insert into crm_customer_products(id, customer_id, job_id) values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','${productCustomer}','${productJob}');
    `);
    const product = await save('CA-product', productCustomer, '+18055550170', 'Product job');
    assert.equal(product.job_id, productJob);
    await db.exec(`update crm_customers set meta = '{"deleted_at":"2026-10-25"}' where id = '${customer}'`);
    const before = (await db.query('select count(*)::int n from crm_activity_events')).rows[0].n;
    const deleted = await save('CA-deleted', customer, '+18055550199', 'Gone');
    assert.deepEqual(deleted, { saved: false, reason: 'no-identity' });
    assert.equal((await db.query('select count(*)::int n from crm_activity_events')).rows[0].n, before);
    await db.exec(`update crm_jobs set meta = '{"deleted_at":"2026-10-25"}' where id = '${productJob}'`);
    const hidden = await save('CA-hidden-job', productCustomer, '+18055550170', 'Hidden job');
    assert.equal(hidden.saved, true);
    assert.equal(hidden.job_id, null);
    const droppedCustomer = 'bbbbbbbb-1111-4111-8111-111111111113';
    const droppedJob = 'bbbbbbbb-2222-4222-8222-222222222224';
    await db.exec(`
      insert into crm_customers(id, display_name, phone) values ('${droppedCustomer}','Dropped','8055550160');
      insert into crm_jobs(id, phone) values ('${droppedJob}','8055550160');
      insert into crm_customer_contracts(id, customer_id, job_id, meta) values
        ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1','${droppedCustomer}','${droppedJob}','{"deleted_at":"2026-10-25"}');
    `);
    const dropped = await save('CA-dropped-link', droppedCustomer, '+18055550160', 'Dropped link');
    assert.equal(dropped.saved, true);
    assert.equal(dropped.job_id, null);
    assert.equal((await db.query("select count(*)::int n from crm_activity_events where metadata->>'call_sid'='CA-dropped-link' and entity_type='job'")).rows[0].n, 0);
  } finally {
    await db.close();
  }
});
