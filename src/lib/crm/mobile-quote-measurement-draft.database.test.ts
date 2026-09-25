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
  await db.exec(migration('20260921193754_filter_archived_quote_lines'));
  await db.exec(migration('20260925010000_quote_v2_measurement_only_drafts'));
  await db.exec(`alter table sales_quote_designs add product_type text, add supplier text, add material text,
    add louver_size text, add tilt_type text, add hinge_color text, add panel_config text, add mount_type text,
    add shade_type text, add lift_system text, add valance text, add fabric text, add motor_type text,
    add remote_type text, add hard_surface_install boolean, add ladder_over_15ft boolean,
    add requires_takedown boolean, add notes text;`);
  await db.query('insert into crm_profiles values ($1,true,$2)', [id(999), '805shutters@gmail.com']);
}, 30_000);
afterAll(() => db.close());
async function mutate(n: number, operations: object[], revision = 1, key = `measure-${n}`) {
  return (await db.query<{result: any}>('select mutate_quote_v2_structure($1,$2,$3,$4,$5) result', [id(n), revision, key, id(999), operations])).rows[0].result;
}
const line = (n: number, productType = "") => ({type: "line.create", lineItemId: id(n), patch: {
  roomName: "Window 1", productType, widthWhole: 36, widthFraction: "3/16", heightWhole: 60, heightFraction: "15/16",
}});
it('persists measurement-only windows without a design, invalidates pricing, and safely replays the same request', async () => {
  await db.query('insert into sales_quotes(id) values ($1)', [id(1)]);
  const result = await mutate(1, [line(10)]);
  expect(result).toMatchObject({revision: 2, lineCount: 1, selectedDesigns: {[id(10)]: null}, quoteV2Status: 'stale'});
  expect(await mutate(1, [line(10)])).toEqual(result);
  expect((await db.query('select product_type,width_fraction,height_fraction from sales_quote_line_items where id=$1', [id(10)])).rows)
    .toEqual([{product_type: '',width_fraction: '3/16',height_fraction: '15/16'}]);
  expect((await db.query('select * from sales_quote_designs')).rows).toHaveLength(0);
  expect((await db.query<any>('select total_amount from sales_quotes where id=$1',[id(1)])).rows[0].total_amount).toBe('0');
  await expect(mutate(1,[line(11)],1,'stale-revision')).rejects.toThrow(/revision conflict/);
});
it('requires selected designs for configured products and refuses locked quotes', async () => {
  await db.query('insert into sales_quotes(id) values ($1)',[id(2)]);
  await expect(mutate(2,[line(20,'Shutters')])).rejects.toThrow(/configured.*selected design/);
  expect((await db.query('select id from sales_quote_line_items where quote_id=$1',[id(2)])).rows).toHaveLength(0);
  await db.query("update sales_quotes set status='sold' where id=$1",[id(2)]);
  await expect(mutate(2,[line(20)])).rejects.toThrow(/unlocked, unsent/);
});
it('does not allow a design record before assigning the window product', async () => {
  await expect(mutate(1, [{type:'design.upsert',lineItemId:id(10),designId:id(102),variant:'A',selectDesign:true,patch:{notes:'Cannot create a design yet'}}],2,'unassigned-design'))
    .rejects.toThrow(/Unassigned.*cannot have designs/);
  expect((await db.query('select id from sales_quote_designs where line_item_id=$1',[id(10)])).rows).toHaveLength(0);
});
it('finishes the same window without disturbing its photo or dimensions', async () => {
  await db.query('insert into mobile_quote_photos values ($1,$2,$3)',[id(100),id(10),'private/reference']);
  const result = await mutate(1,[
    {type:'line.update',lineItemId:id(10),patch:{productType:'Shutters'}},
    {type:'design.upsert',lineItemId:id(10),designId:id(101),variant:'A',selectDesign:true,patch:{productType:'Shutters'}},
  ],2,'complete-window');
  expect(result.selectedDesigns[id(10)]).toBe(id(101));
  expect((await db.query('select line_item_id,object_path from mobile_quote_photos')).rows)
    .toEqual([{line_item_id:id(10),object_path:'private/reference'}]);
  expect((await db.query('select width_fraction,height_fraction from sales_quote_line_items where id=$1',[id(10)])).rows)
    .toEqual([{width_fraction:'3/16',height_fraction:'15/16'}]);
});
