import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { prepareNormanLegacyPricing, type NormanQuotePricingState } from './sales-quote-norman-price';
import fixtures from './sales-quote-norman-price.fixtures.json';
import { quoteLabProductType } from '@/lib/quote-lab/builder';
const db = new PGlite();
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
beforeAll(async () => {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table sales_quotes(sent_at timestamptz,signed_at timestamptz,id uuid primary key,quote_v2_backend boolean default false,quote_v2_revision bigint default 1,quote_v2_status text,quote_v2_catalog_version text,status text default 'draft',installer_notes text,total_amount numeric default 0);
 create table sales_quote_line_items(archived_at timestamptz,id uuid primary key,quote_id uuid references sales_quotes,product_type text,quantity int default 1,selected_design_id uuid);
 create table sales_quote_designs(supplier text,quote_v2_selection jsonb,id uuid primary key default gen_random_uuid(),line_item_id uuid references sales_quote_line_items on delete cascade,variant text,product_type text,unit_price numeric default 0,options_json jsonb default '{}',quote_v2_price_status text,quote_v2_selection_fingerprint text,quote_v2_priced_catalog_version text,quote_v2_priced_at timestamptz,current_v2_snapshot_id uuid,unique(line_item_id,variant));
 create table sales_quote_v2_price_snapshots(id uuid primary key default gen_random_uuid(),quote_id uuid,line_item_id uuid,design_id uuid,quote_revision bigint,selection_fingerprint text,catalog_version text,retail_total numeric,internal_landed_cost_total numeric,retail_snapshot jsonb,internal_cost_snapshot jsonb,validation_snapshot jsonb,provenance_snapshot jsonb,created_by uuid);
 create function save_quote_v2_pricing_batch(uuid,bigint,text,uuid,jsonb) returns table(quote_id uuid,new_revision bigint,quote_status text,quote_total numeric,priced_design_count integer,blocked_design_count integer) language plpgsql as $$ begin
 update sales_quote_designs set unit_price=999,quote_v2_price_status='authoritative',quote_v2_priced_catalog_version='catalog',options_json='{}' where line_item_id in(select id from sales_quote_line_items where sales_quote_line_items.quote_id=$1);
 update sales_quotes set quote_v2_revision=quote_v2_revision+1 where id=$1;
 return query select $1,$2+1,'priced'::text,999::numeric,1,0;
 end $$;`);
 await db.exec(readFileSync('supabase/migrations/20260911173000_staff_line_price_overrides.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20260912002500_line_price_contract_totals.sql','utf8'));
 await db.exec('create table sales_quote_v2_customer_send_preparations(id uuid);');
 await db.exec(readFileSync('supabase/migrations/20260914231500_customer_installation_shipping_snapshots.sql','utf8'));
 await db.exec(`alter table sales_quotes add quote_v2_last_priced_at timestamptz;
 alter table sales_quote_line_items add room_name text,add width_whole int,add width_fraction text,add height_whole int,add height_fraction text;
 create table sales_quote_v2_events(id uuid primary key default gen_random_uuid(),quote_id uuid,event_type text,previous_revision bigint,new_revision bigint,actor_id uuid,idempotency_key text,event_payload jsonb);
 create function is_805_crm_user() returns boolean language sql as $$select true$$;`);
 await db.exec(readFileSync('supabase/migrations/20260725213000_add_quote_v2_custom_mode.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20260921120000_manual_customer_installation_policy.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20260921121000_custom_mode_customer_installation_policy.sql','utf8'));

  await db.exec(`alter table sales_quote_designs add material text,add louver_size text,add tilt_type text,
    add hinge_color text,add panel_config text,add mount_type text,add shade_type text,add lift_system text,
    add valance text,add motor_type text,add remote_type text,add fabric text;
    alter table sales_quotes add customer_signature text;`);
  await db.exec('create view sales_quote_active_line_items as select * from sales_quote_line_items where archived_at is null;');
  const unknownCost = readFileSync('supabase/migrations/20260921214000_allow_explicit_unknown_quote_cost.sql','utf8');
  await db.exec(unknownCost.slice(0, unknownCost.indexOf('alter table')));
  await db.exec(readFileSync('supabase/migrations/20260923022748_norman_legacy_grid_pricing.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260926024004_legacy_sundance_retail_pricing.sql','utf8'));
}, 30000);
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec('truncate sales_quote_line_price_overrides,sales_quote_line_price_events,sales_quote_v2_price_snapshots,sales_quote_designs,sales_quote_line_items,sales_quotes cascade;');
  await db.query('insert into sales_quotes(id) values($1)', [id(1)]);
  for (const n of [2,3,4]) {
    await db.query("insert into sales_quote_line_items(id,quote_id,product_type,quantity,selected_design_id) values($1,$2,'Roller Shades',2,$3)", [id(n),id(1),id(n+10)]);
    await db.query("insert into sales_quote_designs(id,line_item_id,variant,supplier,unit_price) values($1,$2,'A',$3,$4)", [id(n+10),id(n),n===4?'Onyx':'Norman',n===3?111:222]);
  }
  await db.query("update sales_quote_designs set options_json='{\"manual_price_override\":true}' where id=$1", [id(13)]);
});
async function state() { return (await db.query<{value:any}>('select read_norman_quote_pricing_state($1) as value',[id(1)])).rows[0].value; }
async function save(expected:any, results:any[]) { return (await db.query<{value:any}>('select save_norman_quote_pricing($1,$2,$3,$4) as value',[id(1),expected,results,id(50)])).rows[0].value; }
function result() {
  const catalog='norman-test'; const fingerprint=`sha256:${'a'.repeat(64)}`;
  return {lineItemId:id(2),designId:id(12),selectDesign:true,
    selection:{manufacturerId:'norman',productId:'roller',catalogVersion:catalog},
    selectionFingerprint:fingerprint,catalogVersion:catalog,priceStatus:'authoritative',
    authoritativeSnapshot:{priceStatus:'authoritative',selectionFingerprint:fingerprint,catalogVersion:catalog,
      catalogAsOf:'2026-09-22',quotePricingPolicy:'grid_options_quote_v1',
      retail:{ok:true,validationStatus:'valid',catalogVersion:catalog,unitPrice:139,onceTotal:0.01,total:278.01,quantity:2}},
    internalCostSnapshot:{productCostTotal:20,freightAllocated:5,oversizeAllocated:0,processingFeeAllocated:0,landedCostTotal:25},
    validationSnapshot:[],provenanceSnapshot:{catalogVersion:catalog,sources:['norman-guide']}};
}
it('saves source-priced Sundance through the same protected writer', async () => {
  await db.query("update sales_quote_designs set supplier='Sundance' where id=$1",[id(12)]);
  const expected=await state();
  const priced=result();priced.selection.manufacturerId='sundance';priced.selection.productId='sundance_sheerview';
  expect(await save(expected,[priced])).toMatchObject({pricedDesignCount:1,blockedDesignCount:0,total:944.01});
  const after=await state();
  expect(after.designs.filter((d:any)=>d.id!==id(12))).toEqual(expected.designs.filter((d:any)=>d.id!==id(12)));
});
it('rejects a source manufacturer that differs from the saved Sundance supplier',async()=>{
  await db.query("update sales_quote_designs set supplier='Sundance' where id=$1",[id(12)]);
  const expected=await state();
  await expect(save(expected,[result()])).rejects.toThrow(/identity or provenance/);
  expect(await state()).toEqual(expected);
});
it('saves only Norman automatic pricing, preserves cents and mixed manual/other lines, keeps legacy mode',async()=>{
  const before=await state();
  expect(await save(before,[result()])).toMatchObject({pricedDesignCount:1,blockedDesignCount:0,total:944.01});
  const after=await state();
  expect(after.quote.quote_v2_backend).toBe(false);
  expect(after.quote.quote_v2_revision).toBe(2);
  expect(after.designs.filter((d:any)=>d.id!==id(12))).toEqual(before.designs.filter((d:any)=>d.id!==id(12)));
  expect(after.designs[0].options_json.authoritative_once_total).toBe(0.01);
  expect(after.designs[0].options_json.authoritative_v2_snapshot).toEqual(result().authoritativeSnapshot);
  expect((await db.query('select * from sales_quote_v2_price_snapshots')).rows).toHaveLength(1);
});
it.each(['size','manual','archive','added-line','changed-alternative'])('rejects concurrent %s changes without saving a price',async(change)=>{
  const before=await state();
  if(change==='size') await db.query('update sales_quote_line_items set width_whole=50 where id=$1',[id(2)]);
  if(change==='manual') await db.query('update sales_quote_designs set unit_price=999 where id=$1',[id(12)]);
  if(change==='archive') await db.query('update sales_quote_line_items set archived_at=now() where id=$1',[id(2)]);
  if(change==='added-line') await db.query('insert into sales_quote_line_items(id,quote_id) values($1,$2)',[id(9),id(1)]);
  if(change==='changed-alternative') await db.query("insert into sales_quote_designs(id,line_item_id,variant) values($1,$2,'B')",[id(20),id(2)]);
  const changed=await state();
  await expect(save(before,[result()])).rejects.toThrow(/changed/);
  expect(await state()).toEqual(changed);
  expect((await db.query('select * from sales_quote_v2_price_snapshots')).rows).toHaveLength(0);
});
it.each(['manual','other-manufacturer','unselected','archived','sent-snapshot'])('refuses a %s result even with fresh state',async(kind)=>{
  const r=result();
  if(kind==='manual'){r.lineItemId=id(3);r.designId=id(13);}
  if(kind==='other-manufacturer'){r.lineItemId=id(4);r.designId=id(14);}
  if(kind==='unselected') {await db.query("insert into sales_quote_designs(id,line_item_id,variant,supplier) values($1,$2,'B','Norman')",[id(20),id(2)]);r.designId=id(20);}
  if(kind==='archived') await db.query('update sales_quote_line_items set archived_at=now() where id=$1',[id(2)]);
  if(kind==='sent-snapshot') await db.query("update sales_quote_designs set options_json='{\"sent_price_snapshot\":{}}' where id=$1",[id(12)]);
  await expect(save(await state(),[r])).rejects.toThrow(/selected|active/);
});
it.each(['sent','signed','v2'])('refuses %s quotes',async(kind)=>{
  if(kind==='sent') await db.query('update sales_quotes set sent_at=now() where id=$1',[id(1)]);
  if(kind==='signed') await db.query('update sales_quotes set signed_at=now() where id=$1',[id(1)]);
  if(kind==='v2') await db.query('update sales_quotes set quote_v2_backend=true where id=$1',[id(1)]);
  await expect(save(await state(),[result()])).rejects.toThrow(/legacy draft/);
});
it('keeps known retail with explicitly unresolved dealer cost',async()=>{
  const r:any=result();r.internalCostSnapshot={quotePricingPolicy:'grid_options_quote_v1',status:'unresolved',costStatus:'incomplete',
    productCostUnit:null,productCostTotal:null,freightAllocated:null,oversizeAllocated:null,processingFeeAllocated:null,landedCostTotal:null};
  expect(await save(await state(),[r])).toMatchObject({pricedDesignCount:1});
  expect((await db.query<any>('select internal_landed_cost_total from sales_quote_v2_price_snapshots')).rows[0].internal_landed_cost_total).toBeNull();
});
it('persists a specific missing-price explanation without an immutable zero price',async()=>{
  const r:any=result();r.priceStatus='blocked';r.authoritativeSnapshot=null;r.internalCostSnapshot=null;r.staffPricingError='Roller traditional hold-down price is missing.';
  expect(await save(await state(),[r])).toMatchObject({blockedDesignCount:1});
  const s=await state();expect(s.designs[0].options_json.authoritative_price_error).toBe(r.staffPricingError);
  expect(s.designs[0].current_v2_snapshot_id).toBeNull();
  expect((await db.query('select * from sales_quote_v2_price_snapshots')).rows).toHaveLength(0);
});
it('rejects malformed amounts and rolls back an earlier result in the same batch',async()=>{
  const r=result();r.authoritativeSnapshot.retail.total=1;
  await expect(save(await state(),[r])).rejects.toThrow(/total/);
  await expect(save(await state(),[result(),result()])).rejects.toThrow(/Duplicate/);
  expect((await db.query('select * from sales_quote_v2_price_snapshots')).rows).toHaveLength(0);
});
it('retains Norman once charges when a different line price is manually edited',async()=>{
  await save(await state(),[result()]);
  const response=(await db.query<any>('select set_sales_quote_line_price($1,$2,$3,300,$4,null,$5) as value',[id(1),id(4),'A',id(50),id(80)])).rows[0].value;
  expect(response.total).toBe(1178.01); // Norman278.01 + existingmanual222 + Onyx(300+39)*2.
});
it('restricts both RPCs to the server role',async()=>{
  await db.exec('set role authenticated');
  await expect(state()).rejects.toThrow(/permission denied/);
  await expect(save({},[])).rejects.toThrow(/permission denied/);
  await db.exec('reset role');
});


describe('real Norman calculator to atomic SQL persistence', () => {
  async function configure(productId: string, quantity: number) {
    const fixture=fixtures.find(f=>f.selection.productId===productId)!;
    const selection=fixture.selection;
    const configuration=selection.configuration as Record<string,unknown>;
    const columns=['material','louver_size','tilt_type','hinge_color','panel_config','mount_type','shade_type','lift_system','valance','motor_type','remote_type'];
    await db.query(`update sales_quote_line_items set product_type=$1,quantity=$2,width_whole=$3,width_fraction='0',height_whole=$4,height_fraction='0' where id=$5`,
      [quoteLabProductType(productId),quantity,selection.widthInches,selection.heightInches,id(2)]);
    await db.query(`update sales_quote_designs set product_type=$1,fabric=$2,options_json=$3,
      ${columns.map((column,i)=>`${column}=$${i+4}`).join(',')} where id=$${columns.length+4}`,
      [quoteLabProductType(productId),configuration.fabric_collection??null,
        {...configuration,fabric_color_collection:configuration.fabric_collection,catalog_product_id:productId,catalog_program_id:selection.programId},
        ...columns.map(column=>configuration[column]??null),id(12)]);
    return fixture;
  }
  it.each(fixtures.map(f=>f.selection.productId))('%s saves its real grid result and source/cost metadata', async productId=>{
    await configure(productId,1);
    const before=await state();
    const prepared=prepareNormanLegacyPricing(before as NormanQuotePricingState,'2026-09-22');
    expect(prepared).toHaveLength(1);
    expect(prepared[0].priceStatus).toBe('authoritative');
    const payload=prepared[0].rpcResult;
    const retail=(payload.authoritativeSnapshot as any).retail;
    const outcome=await save(before,[payload]);
    expect(outcome.total).toBeCloseTo(retail.total+666,2);
    const after=await state();
    expect(after.quote.quote_v2_backend).toBe(false);
    expect(Number(after.designs[0].unit_price)).toBe(retail.unitPrice);
    expect(after.designs[0].options_json.authoritative_v2_snapshot).toEqual(payload.authoritativeSnapshot);
    expect(after.designs.slice(1)).toEqual(before.designs.slice(1));
  });
  it.each(['faux_wood','smartprivacy_faux'])('%s preserves the real quantity-three cent allocation',async productId=>{
    await configure(productId,3);
    const before=await state();
    const [prepared]=prepareNormanLegacyPricing(before as NormanQuotePricingState,'2026-09-22');
    const retail=(prepared.rpcResult.authoritativeSnapshot as any).retail;
    expect(retail.onceTotal).toBe(0.02);
    const saved=await save(before,[prepared.rpcResult]);
    expect(saved.total).toBeCloseTo(retail.total+666,2);
    const after=await state();
    expect(Number(after.designs[0].unit_price)*3+after.designs[0].options_json.authoritative_once_total).toBeCloseTo(retail.total,2);
  });
  it('resets the old Norman once charge when the same line receives a manual price',async()=>{
    await save(await state(),[result()]);
    const response=(await db.query<any>('select set_sales_quote_line_price($1,$2,$3,100,$4,null,$5) as value',[id(1),id(2),'A',id(50),id(81)])).rows[0].value;
    expect(response.total).toBe(944);
    const after=await state();
    expect(after.designs[0].options_json.authoritative_once_total).toBe(0);
    expect(after.designs[0].options_json.norman_grid_pricing).toBe(false);
    expect(after.designs[0].options_json.manual_price_override).toBe(true);
  });
});


it('refuses a changed manual total implementation before applying its independent reset patch',async()=>{
  const definition=(await db.query<{definition:string}>("select pg_get_functiondef('set_sales_quote_line_price(uuid,uuid,text,numeric,uuid,bigint,uuid,boolean)'::regprocedure) as definition")).rows[0].definition;
  const changed=definition.replace("case when q.quote_v2_backend or chosen.options_json->'norman_grid_pricing'='true'::jsonb then coalesce((chosen.options_json->>'authoritative_once_total')::numeric,0) else 0 end",'0');
  expect(changed).not.toBe(definition);
  await db.exec('begin');
  try {
    await db.exec(changed);
    await expect(db.exec(readFileSync('supabase/migrations/20260923022748_norman_legacy_grid_pricing.sql','utf8')))
      .rejects.toThrow(/manual-price total calculation/);
  } finally { await db.exec('rollback'); }
});
it('can safely repeat its migration without changing pricing state',async()=>{
  const before=await state();
  await db.exec(readFileSync('supabase/migrations/20260923022748_norman_legacy_grid_pricing.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260926024004_legacy_sundance_retail_pricing.sql','utf8'));
  expect(await state()).toEqual(before);
});
