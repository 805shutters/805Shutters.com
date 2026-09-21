import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const db = new PGlite({ extensions: { pgcrypto } });
const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = (name: string) => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');

beforeAll(async () => {
  await db.exec(`
    create extension pgcrypto;
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql as $$ select coalesce(nullif(current_setting('test.auth_role', true), ''), 'service_role') $$;
    create table crm_profiles(id uuid, active boolean, email text);
    create table sales_quotes(id uuid primary key, quote_v2_backend boolean default true,
      quote_v2_revision bigint default 1, quote_v2_status text default 'priced',
      quote_v2_catalog_version text, quote_v2_last_priced_at timestamptz, status text default 'draft',
      sent_at timestamptz, signed_at timestamptz, total_amount numeric default 500,
      product_cost numeric, manufacturer_cost numeric, profit_amount numeric, updated_at timestamptz);
    create table sales_quote_line_items(id uuid primary key, quote_id uuid references sales_quotes,
      product_type text default 'Roman Shades', quantity int default 1, selected_design_id uuid,
      room_name text default 'Bedroom', width_whole numeric default 36, width_fraction text default '',
      height_whole numeric default 48, height_fraction text default '', sort_order int default 0);
    create table sales_quote_designs(id uuid primary key, line_item_id uuid references sales_quote_line_items on delete cascade,
      variant text default 'A', unit_price numeric default 500, options_json jsonb default '{"fabric":"Milk"}',
      quote_v2_selection jsonb default '{}', quote_v2_price_status text default 'authoritative',
      quote_v2_selection_fingerprint text, quote_v2_priced_catalog_version text,
      quote_v2_priced_at timestamptz, current_v2_snapshot_id uuid, unique(id,line_item_id));
    alter table sales_quote_line_items add foreign key(selected_design_id,id)
      references sales_quote_designs(id,line_item_id) deferrable initially deferred;
    create table sales_quote_v2_price_snapshots(id uuid primary key, quote_id uuid references sales_quotes on delete restrict,
      line_item_id uuid references sales_quote_line_items on delete restrict,
      design_id uuid references sales_quote_designs on delete restrict, retail_snapshot jsonb);
    create table sales_quote_v2_custom_overrides(id uuid primary key, quote_id uuid references sales_quotes on delete restrict,
      line_item_id uuid references sales_quote_line_items on delete restrict,
      design_id uuid references sales_quote_designs on delete restrict,
      original_snapshot_id uuid references sales_quote_v2_price_snapshots on delete restrict,
      override_input jsonb);
    create table sales_quote_line_price_overrides(design_id uuid references sales_quote_designs on delete cascade, unit_price numeric);
    create table mobile_quote_photos(photo_id uuid primary key,line_item_id uuid references sales_quote_line_items on delete cascade,object_path text);
    create table sales_quote_media(id uuid primary key,line_item_id uuid references sales_quote_line_items on delete set null,image_url text);
    create table sales_quote_v2_events(id uuid default gen_random_uuid(),quote_id uuid,event_type text,previous_revision bigint,new_revision bigint,actor_id uuid,idempotency_key text,event_payload jsonb);
    create function reject_v2_audit_mutation() returns trigger language plpgsql as $$ begin raise exception 'Quote V2 snapshots and events are append-only.'; end $$;
    create trigger immutable_prices before update or delete on sales_quote_v2_price_snapshots for each row execute function reject_v2_audit_mutation();
  `);
  const original = migration('20260726120000_add_quote_v2_structural_mutation_rpc');
  await db.exec(original.slice(0, original.indexOf('create table if not exists')));
  await db.exec(original.slice(original.indexOf('create or replace function public.mutate_quote_v2_structure(')));
  await db.exec(migration('20260921185005_quote_v2_soft_archive_priced_line_delete'));
  // Exercise the native delivery cost query verbatim without sending a delivery.
  const delivery = migration('20260910190000_native_quote_customer_delivery');
  const start = delivery.indexOf('(select jsonb_object_agg(l.id::text');
  const end = delivery.indexOf(') returning * into d;', start);
  const costQuery = delivery.slice(start, end).trim();
  await db.exec(`alter table sales_quote_v2_price_snapshots add catalog_version text default 'catalog', add internal_cost_snapshot jsonb default '{"productCostTotal":100}', add internal_landed_cost_total numeric default 100;
    create function reserve_native_quote_delivery(p_quote_id uuid) returns jsonb language sql as $query$ select ${costQuery} $query$;`);
  await db.exec(migration('20260921193754_filter_archived_quote_lines'));
  await db.exec(`grant select, insert on sales_quote_line_items, sales_quote_designs to authenticated; alter table sales_quote_line_items enable row level security; create policy test_staff_read on sales_quote_line_items for select to authenticated using (true); create policy test_staff_insert on sales_quote_line_items for insert to authenticated with check (true);`);
  await db.query('insert into crm_profiles values ($1,true,$2)', [id(999), '805shutters@gmail.com']);
}, 30_000);
afterAll(() => db.close());

async function seed(n: number, count = 1) {
  await db.query('insert into sales_quotes(id) values ($1)', [id(n)]);
  for (let i = 0; i < count; i++) {
    const l = n * 10 + i;
    await db.query('insert into sales_quote_line_items(id,quote_id) values ($1,$2)', [id(l), id(n)]);
    await db.query('insert into sales_quote_designs(id,line_item_id) values($1,$2)', [id(l + 1000), id(l)]);
    await db.query('update sales_quote_line_items set selected_design_id=$1 where id=$2', [id(l + 1000), id(l)]);
    await db.query('insert into sales_quote_v2_price_snapshots(id,quote_id,line_item_id,design_id,retail_snapshot) values($1,$2,$3,$4,$5)', [id(l + 2000), id(n), id(l), id(l + 1000), { retail: { unitPrice: 500 } }]);
    await db.query('update sales_quote_designs set current_v2_snapshot_id=$1 where id=$2', [id(l + 2000), id(l + 1000)]);
    await db.query('insert into sales_quote_v2_custom_overrides values($1,$2,$3,$4,$5,$6)', [id(l + 3000), id(n), id(l), id(l + 1000), id(l + 2000), { price: 400 }]);
    await db.query('insert into sales_quote_line_price_overrides values($1,400)', [id(l + 1000)]);
    await db.query('insert into mobile_quote_photos values($1,$2,$3)', [id(l + 4000), id(l), 'private/path']);
    await db.query('insert into sales_quote_media values($1,$2,$3)', [id(l + 5000), id(l), 'saved/media']);
  }
}
async function remove(n: number, operations: object[], revision = 1, key = `delete-${n}`, actor = id(999)) {
  return (await db.query<{ result: any }>('select mutate_quote_v2_structure($1,$2,$3,$4,$5) result', [id(n), revision, key, actor, operations])).rows[0].result;
}
const del = (line: number) => ({ type: 'line.delete', lineItemId: id(line) });

it('removes priced lines from active reads and counts while preserving their configuration and immutable history', async () => {
  await seed(10, 2); await seed(11);
  const histories = (await db.query('select * from sales_quote_v2_price_snapshots order by id')).rows;
  const design = (await db.query('select * from sales_quote_designs where id=$1', [id(1100)])).rows;
  const beforeCosts = (await db.query<any>('select reserve_native_quote_delivery($1) costs', [id(10)])).rows[0].costs;
  expect(Object.keys(beforeCosts)).toHaveLength(2);
  const result = await remove(10, [del(100)]);
  // Repricing would restore the active sibling snapshot; the archived one remains intact.
  await db.query('update sales_quote_designs set current_v2_snapshot_id=$1 where id=$2', [id(2101), id(1101)]);
  const afterCosts = (await db.query<any>('select reserve_native_quote_delivery($1) costs', [id(10)])).rows[0].costs;
  expect(Object.keys(afterCosts)).toEqual([id(101)]);
  expect(result).toMatchObject({ revision: 2, lineCount: 1, quoteV2Status: 'stale', selectedDesigns: { [id(101)]: id(1101) } });
  expect((await db.query('select id from sales_quote_active_line_items where id=$1', [id(100)])).rows).toEqual([]);
  expect((await db.query('select * from sales_quote_designs where id=$1', [id(1100)])).rows).toEqual(design);
  expect((await db.query('select * from sales_quote_v2_price_snapshots order by id')).rows).toEqual(histories);
  expect((await db.query('select id from sales_quote_v2_custom_overrides where line_item_id=$1', [id(100)])).rows).toHaveLength(1);
  expect((await db.query<any>('select archived_at from sales_quote_line_items where id=$1', [id(100)])).rows[0].archived_at).not.toBeNull();
  expect((await db.query<any>('select unit_price from sales_quote_designs where id=$1', [id(1110)])).rows[0].unit_price).toBe('500');
  expect(await remove(10, [del(100)])).toEqual(result);
  await expect(remove(10, [del(100)], 2, 'second-delete')).rejects.toThrow(/does not belong/);
});

it('deletes the last priced line and clears a priced draft with zero active lines and preserved histories', async () => {
  await seed(12); await seed(13, 2);
  expect(await remove(12, [del(120)])).toMatchObject({ lineCount: 0, quoteV2Status: 'draft' });
  expect(await remove(13, [{ type: 'lines.clear' }])).toMatchObject({ lineCount: 0, quoteV2Status: 'draft' });
  expect((await db.query<any>('select total_amount from sales_quotes where id=$1', [id(12)])).rows[0].total_amount).toBe('0');
  expect((await db.query('select id from sales_quote_v2_price_snapshots where quote_id=$1', [id(13)])).rows).toHaveLength(2);
  expect((await db.query('select id from sales_quote_active_line_items where quote_id=$1', [id(13)])).rows).toHaveLength(0);
});

it('rejects unauthorized, stale, cross-quote and finalized mutations atomically', async () => {
  await seed(14); await seed(15);
  await expect(remove(14, [del(140)], 1, 'bad-actor', id(888))).rejects.toThrow(/not authorized/);
  await expect(remove(14, [del(140)], 2)).rejects.toThrow(/revision conflict/);
  await expect(remove(14, [del(150)])).rejects.toThrow(/does not belong/);
  await expect(remove(14, [del(140), del(150)])).rejects.toThrow(/does not belong/);
  expect((await db.query('select id from sales_quote_active_line_items where id=$1', [id(140)])).rows).toHaveLength(1);
  await db.query("update sales_quotes set status='sent' where id=$1", [id(14)]);
  await expect(remove(14, [del(140)])).rejects.toThrow(/unlocked, unsent/);
  await db.exec("set test.auth_role='authenticated'");
  await expect(remove(15, [del(150)])).rejects.toThrow(/service role/);
  await db.exec('reset test.auth_role');
});

it('keeps the active view invoker-secured and permits ordinary legacy inserts', async () => {
  expect((await db.query<any>("select reloptions from pg_class where oid='sales_quote_active_line_items'::regclass")).rows[0].reloptions).toContain('security_invoker=true');
  const grants = (await db.query<any>("select has_table_privilege('anon','sales_quote_active_line_items','select') anon_read, has_table_privilege('authenticated','sales_quote_active_line_items','select') staff_read, has_table_privilege('authenticated','sales_quote_active_line_items','delete') staff_delete")).rows[0];
  expect(grants).toEqual({ anon_read: false, staff_read: true, staff_delete: false });
  await db.exec('set role authenticated');
  expect((await db.query('select id from sales_quote_active_line_items where id=$1', [id(100)])).rows).toEqual([]);
  await db.query('insert into sales_quote_line_items(id,quote_id) values($1,$2)', [id(8000), id(15)]);
  await db.exec('reset role');
  await db.exec('drop policy test_staff_read on sales_quote_line_items; set role authenticated');
  expect((await db.query('select id from sales_quote_active_line_items')).rows).toEqual([]);
  await db.exec('reset role');
});
