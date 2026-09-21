import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const id = (n:number) => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let request=100;
beforeAll(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table sales_quotes(id uuid primary key,quote_v2_backend boolean default false,quote_v2_revision bigint default 1,quote_v2_status text,quote_v2_catalog_version text,status text default 'draft',installer_notes text,total_amount numeric default 0);
 create table sales_quote_line_items(id uuid primary key,quote_id uuid references sales_quotes,product_type text,quantity int default 1,selected_design_id uuid);
 create table sales_quote_designs(id uuid primary key default gen_random_uuid(),line_item_id uuid references sales_quote_line_items on delete cascade,variant text,product_type text,unit_price numeric default 0,options_json jsonb default '{}',quote_v2_price_status text,quote_v2_selection_fingerprint text,quote_v2_priced_catalog_version text,quote_v2_priced_at timestamptz,current_v2_snapshot_id uuid,unique(line_item_id,variant));
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
 await db.query(`insert into sales_quotes(id,quote_v2_backend) values($1,false),($2,true)`,[id(1),id(2)]);
 await db.query(`insert into sales_quote_line_items(id,quote_id,product_type,quantity) values($1,$2,'Shutters',2),($3,$4,'Unsupported catalog',3)`,[id(11),id(1),id(12),id(2)]);
},30000);
afterAll(()=>db.close());
async function save(q:number,l:number,price:number,revision:number|null=null,req=++request,variant='A') {
 const r=await db.query<{result:any}>('select set_sales_quote_line_price($1,$2,$3,$4,$5,$6,$7) as result',[id(q),id(l),variant,price,id(50),revision,id(req)]);
 return r.rows[0].result;
}
it('creates a missing legacy design and persists zero with a quantity-aware total',async()=>{
 expect(await save(1,11,123.45)).toMatchObject({unitPrice:123.45,total:246.9});
 expect(await save(1,11,0)).toMatchObject({unitPrice:0,total:0});
});
it('overrides blocked V2 without a catalog or cost snapshot, including below-cost and zero',async()=>{
 const r=await save(2,12,1.25,1,200);expect(r).toMatchObject({unitPrice:1.25,total:3.75,revision:2,quoteStatus:'priced'});
 expect(await save(2,12,1.25,1,200)).toEqual(r);
 await expect(save(2,12,2,2,200)).rejects.toThrow(/different price/);
 await expect(save(2,12,2,1)).rejects.toThrow(/changed/);
 expect(await save(2,12,0,2)).toMatchObject({total:0,revision:3});
 const snap=await db.query<{retail_snapshot:any,internal_cost_snapshot:any}>('select retail_snapshot,internal_cost_snapshot from sales_quote_v2_price_snapshots order by quote_revision desc limit 1');
 expect(snap.rows[0].retail_snapshot.retail).toMatchObject({unitPrice:0,quantity:3,total:0,onceTotal:0});
 expect(JSON.stringify(snap.rows[0].retail_snapshot)).not.toMatch(/manufacturerCost|landedCost/);
});
it('keeps the chosen custom price after catalog repricing and quantity changes',async()=>{
 await db.query('update sales_quote_line_items set quantity=5 where id=$1',[id(12)]);
 const r=await db.query<any>('select * from save_quote_v2_pricing_batch($1,3,$2,$3,$4)',[id(2),'batch-test',id(50),[]]);
 expect(r.rows[0]).toMatchObject({quote_total:'0.00',new_revision:5,priced_design_count:1,blocked_design_count:0});
 expect(Object.values(r.rows[0].manual_prices)[0]).toMatchObject({unitPrice:0,quantity:5,total:0});
});
it('selects the edited alternative without billing its sibling',async()=>{
 expect(await save(1,11,15000.99,null,++request,'B')).toMatchObject({total:30001.98});
});
it('rejects cross-quote lines, invalid numbers and unauthenticated direct writes',async()=>{
 await expect(save(1,12,30)).rejects.toThrow(/not found on this quote/);
 await expect(save(1,11,-1)).rejects.toThrow(/\$0/);
 await expect(db.exec(`set role authenticated; select set_sales_quote_line_price('${id(1)}','${id(11)}','A',1,'${id(50)}',null,'${id(500)}');`)).rejects.toThrow(/permission denied/);
 await db.exec('reset role');
});
it('preserves contract product and cost evidence when changing an already priced line',async()=>{
 await db.query('insert into sales_quotes(id,quote_v2_backend) values($1,true)',[id(3)]);
 await db.query("insert into sales_quote_line_items(id,quote_id,product_type,quantity,selected_design_id) values($1,$2,'Shutters',3,$3)",[id(13),id(3),id(20)]);
 await db.query("insert into sales_quote_designs(id,line_item_id,variant,unit_price,current_v2_snapshot_id) values($1,$2,'A',500,$3)",[id(20),id(13),id(21)]);
 const retail={ok:true,validationStatus:'valid',catalogVersion:'norman-test',productId:'norman-shutters',programId:'woodlore',programName:'Woodlore',matchedWidth:36,matchedHeight:48,unitPrice:500,total:1500,quantity:3};
 const cost={productCostUnit:100,productCostTotal:300,freightAllocated:0.01,oversizeAllocated:0,processingFeeAllocated:0,landedCostTotal:300.01};
 await db.query('insert into sales_quote_v2_price_snapshots(id,design_id,catalog_version,retail_snapshot,internal_cost_snapshot,internal_landed_cost_total) values($1,$2,$3,$4,$5,300.01)',[id(21),id(20),'norman-test',{retail},cost]);
 await save(3,13,25,1);
 await save(3,13,0,2);
 const {rows}=await db.query<any>('select s.* from sales_quote_designs d join sales_quote_v2_price_snapshots s on s.id=d.current_v2_snapshot_id where d.id=$1',[id(20)]);
 expect(rows[0].retail_snapshot.retail).toMatchObject({...retail,unitPrice:0,total:0});
 expect(rows[0].internal_cost_snapshot).toEqual(cost);
 expect(rows[0].internal_landed_cost_total).toBe('300.01');
 expect(rows[0].selection_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
 expect(rows[0].catalog_version).toBe('norman-test');
 expect(rows[0].provenance_snapshot.originalSnapshotId).toBe(id(21));
});

it('retains contract discount, tax, and extras when setting an exact line price',async()=>{
 await db.query('insert into sales_quotes(id,installer_notes) values($1,$2)',[id(4),JSON.stringify({__adminControls:{showExtras:true,extraFees:[{amount:100}],showDiscount:true,discountPercent:10,showTax:true,taxPercent:8}})]);
 await db.query("insert into sales_quote_line_items(id,quote_id,product_type,quantity) values($1,$2,'Roller Shades',2)",[id(14),id(4)]);
 expect(await save(4,14,500)).toMatchObject({unitPrice:539,total:1153.44});
});

const charges = (quantity=1,units=1) => ({version:'blind-shade-install-ship-v1',eligibleUnitsPerWindow:units,quantity,
 eligibleUnitCount:quantity*units,installationPerUnit:25,shippingPerUnit:14,installationTotal:25*quantity*units,
 shippingTotal:14*quantity*units,perWindowTotal:39*units,total:39*quantity*units});
it('preserves fixed per-unit charges under quote discounts, extras and tax in SQL',async()=>{
 const controls={showDiscount:true,discountPercent:10};
 const calculate=async(c:object)=> (await db.query<any>('select quote_customer_adjusted_total(417,117,$1) as total',[JSON.stringify({__adminControls:c})])).rows[0].total;
 expect(await calculate(controls)).toBe('387.00');
 expect(await calculate({...controls,showTax:true,taxPercent:8})).toBe('417.96');
 expect(await calculate({...controls,showExtras:true,extraFees:[{amount:100}]})).toBe('477.00');
 expect(await calculate({...controls,showDiscount:false})).toBe('417.00');
});
it('projects only validated customer charges and rejects corrupted policy data',async()=>{
 const project=async(c:unknown,qty=3)=> (await db.query<any>('select quote_customer_price_with_charges($1,$2,$3) as price',[{unitPrice:139,total:417},{customerCharges:c,manufacturerCost:999},qty])).rows[0].price;
 expect(await project(charges(3))).toEqual({unitPrice:139,total:417,customerCharges:charges(3)});
 expect(await project(null)).toEqual({unitPrice:139,total:417});
 for(const invalid of [{...charges(3),total:1},{...charges(3),manufacturerCost:1},{...charges(3),version:'fake'},{...charges(3),quantity:'3'},charges(2)]) {
   await expect(project(invalid)).rejects.toThrow(/Customer|customer|Invalid/);
 }
 await expect(project(charges(3,4))).rejects.toThrow(/exceeds/);
 const guard=await db.query<any>("select quote_v2_structure_is_protected_key('customer_charges') as protected");
 expect(guard.rows[0].protected).toBe(true);
});
it('freezes normalized customer adjustments without private editor fields',async()=>{
 const {rows}=await db.query<any>('select quote_customer_adjustments($1) as adjustments',[JSON.stringify({__adminControls:{
 showExtras:true,extraFees:[{id:'private',name:'Permit',amount:100}],showDiscount:true,discountPercent:10,showTax:false,taxPercent:8,depositPercent:35,
 manufacturerCost:123}})]);
 expect(rows[0].adjustments).toEqual({fees:[{name:'Permit',amount:100}],discountFlat:0,discountPercent:10,taxPercent:0,depositPercent:35,
 totalOverride:null,balanceDueOverride:null,balanceAdjustmentNote:null});
 expect((await db.query<any>("select quote_customer_adjustments('ordinary notes') as adjustments")).rows[0].adjustments.depositPercent).toBe(50);
});
it('manual merchandise override retains fixed fees and keeps other selected units undiscounted',async()=>{
 await db.query('insert into sales_quotes(id,quote_v2_backend,installer_notes) values($1,true,$2)',[id(5),JSON.stringify({__adminControls:{showDiscount:true,discountPercent:10}})]);
 await db.query("insert into sales_quote_line_items(id,quote_id,product_type,quantity,selected_design_id) values($1,$2,'Roller Shades',3,$3),($4,$2,'Roller Shades',1,$5)",[id(15),id(5),id(30),id(16),id(31)]);
 const stored={authoritative_price_breakdown:{customerCharges:charges(3)},authoritative_once_total:0};
 const overridden={customer_charges:charges(),authoritative_price_breakdown:{customerCharges:charges()},authoritative_v2_snapshot:{retail:{customerCharges:charges()}}};
 await db.query("insert into sales_quote_designs(id,line_item_id,variant,unit_price,options_json,quote_v2_price_status,current_v2_snapshot_id) values($1,$2,'A',139,$3,'authoritative',null),($4,$5,'A',139,$6,'authoritative',$7),($8,$2,'B',999,$9,'authoritative',null)",[id(30),id(15),stored,id(31),id(16),overridden,id(32),id(33),{customer_charges:charges(99)}]);
 await db.query('insert into sales_quote_v2_price_snapshots(id,design_id,catalog_version,retail_snapshot) values($1,$2,$3,$4)',[id(32),id(31),'test',{retail:{customerCharges:charges(),unitPrice:139,quantity:1,total:139}}]);
 expect(await save(5,16,0,1)).toMatchObject({total:426,unitPrice:39});
 const {rows}=await db.query<any>('select d.options_json,s.retail_snapshot from sales_quote_designs d join sales_quote_v2_price_snapshots s on s.id=d.current_v2_snapshot_id where d.id=$1',[id(31)]);
 expect(rows[0].options_json.customer_charges).toEqual(charges());
 expect(rows[0].retail_snapshot.retail).toMatchObject({unitPrice:39,base:0,customerCharges:charges()});
 expect(rows[0].options_json.manual_merchandise_unit_price).toBe(0);
 expect(rows[0].options_json.manual_price_override).toBe(true);
 const original=await db.query<any>('select retail_snapshot from sales_quote_v2_price_snapshots where id=$1',[id(32)]);
 expect(original.rows[0].retail_snapshot.retail.customerCharges).toEqual(charges());
});

it('rejects native adjustments that the public contract would clamp differently',async()=>{
 for(const controls of [{showExtras:true,extraFees:[{amount:-1}]},{discountPercent:101},{taxPercent:-1},{depositPercent:101}]) {
  await expect(db.query('select quote_customer_adjustments($1)',[JSON.stringify({__adminControls:controls})])).rejects.toThrow(/Native quote/);
 }
});

it('charges split physical units once across save, replay and quantity reapply',async()=>{
 await db.query('insert into sales_quotes(id,quote_v2_backend) values($1,true)',[id(6)]);
 await db.query("insert into sales_quote_line_items(id,quote_id,product_type,quantity,selected_design_id) values($1,$2,'Faux Wood Blinds',2,$3)",[id(17),id(6),id(40)]);
 await db.query("insert into sales_quote_designs(id,line_item_id,variant,options_json) values($1,$2,'A',$3)",[id(40),id(17),{catalog_product_id:'lotus_faux_wood_blinds',lotus_blind_count:3}]);
 const first=await save(6,17,100,1,600);expect(first).toMatchObject({unitPrice:217,merchandiseUnitPrice:100,total:434});
 expect(await save(6,17,100,1,600)).toEqual(first);
 const before=await db.query<any>('select current_v2_snapshot_id from sales_quote_designs where id=$1',[id(40)]);
 expect(await save(6,17,100,2)).toMatchObject({unitPrice:217,total:434});
 // Reapply is performed inside catalog save; persisted source choice survives that catalog write.
 await db.query('update sales_quote_line_items set quantity=4 where id=$1',[id(17)]);
 const reapply=await db.query<any>('select set_sales_quote_line_price($1,$2,$3,100,$4,3,$5,true) as r',[id(6),id(17),'A',id(50),id(601)]);
 expect(reapply.rows[0].r).toMatchObject({unitPrice:217,total:868});
 const stored=await db.query<any>('select options_json from sales_quote_designs where id=$1',[id(40)]);
 expect(stored.rows[0].options_json.customer_charges).toEqual(charges(4,3));
 const batch=await db.query<any>('select * from save_quote_v2_pricing_batch($1,4,$2,$3,$4)',[id(6),'charged-batch',id(50),[]]);
 expect(batch.rows[0]).toMatchObject({quote_total:'868.00',new_revision:6});
 const old=await db.query<any>('select retail_snapshot from sales_quote_v2_price_snapshots where id=$1',[before.rows[0].current_v2_snapshot_id]);
 expect(old.rows[0].retail_snapshot.retail.customerCharges).toEqual(charges(2,3));
});
it('keeps historical all-in override reapply unchanged and rejects locked quote writes',async()=>{
 await db.query('update sales_quote_line_price_overrides set customer_charge_policy=null where design_id=$1',[id(40)]);
 await db.query("update sales_quote_designs set options_json=options_json-array['manual_customer_charge_policy','manual_merchandise_unit_price'] where id=$1",[id(40)]);
 const old=await db.query<any>('select set_sales_quote_line_price($1,$2,$3,100,$4,6,$5,true) as r',[id(6),id(17),'A',id(50),id(602)]);
 expect(old.rows[0].r).toMatchObject({unitPrice:100,total:400});
 await db.query("update sales_quotes set status='sent' where id=$1",[id(6)]);
 await expect(save(6,17,200,7)).rejects.toThrow(/unlocked draft/);
 expect((await db.query<any>('select unit_price from sales_quote_designs where id=$1',[id(40)])).rows[0].unit_price).toBe('100.00');
});
it('validates physical counts and excludes component-only parts in the database',async()=>{
 const make=async(product:string,config:object,retail:object={})=>(await db.query<any>('select quote_manual_customer_charges($1,$2,$3) as c',[{options_json:{catalog_product_id:product,...config}},{product_type:'Shades',quantity:2},retail])).rows[0].c;
 expect(await make('honeycomb',{lift_system:'Cordless Day & Night'},{configurationUnits:2})).toEqual(charges(2));
 expect(await make('honeycomb',{lift_system:'SmartFit Dual Shade'})).toEqual(charges(2,2));
 expect(await make('lotus_parts',{lotus_blind_count:3})).toBeNull();
 await expect(make('roller',{roller_coupling_count:1.5})).rejects.toThrow(/physical/);
});
it('Custom Mode persists and validates fixed charges while preserving original snapshots',async()=>{
 await db.query('insert into sales_quotes(id,quote_v2_backend,installer_notes) values($1,true,$2)',[id(7),JSON.stringify({__adminControls:{showDiscount:true,discountPercent:10}})]);
 await db.query("insert into sales_quote_line_items(id,quote_id,product_type,quantity,selected_design_id) values($1,$2,'Roller Shades',2,$3)",[id(18),id(7),id(41)]);
 await db.query("insert into sales_quote_designs(id,line_item_id,variant,unit_price,current_v2_snapshot_id,options_json) values($1,$2,'A',139,$3,$4)",[id(41),id(18),id(42),{catalog_product_id:'roller'}]);
 const original={retail:{productId:'roller',programId:'test',quantity:2,unitPrice:139,total:278,customerCharges:charges(2)}};
 await db.query('insert into sales_quote_v2_price_snapshots(id,design_id,catalog_version,retail_snapshot) values($1,$2,$3,$4)',[id(42),id(41),'catalog',original]);
 const apply=async(retail:object,key:string)=>db.query<any>('select apply_quote_v2_custom_override($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,$12) as r',[id(7),id(18),id(41),key,id(50),{},{},{retail},{},{customFingerprint:'fixture'}, {},{sellPrice:100,landedCost:50}]);
 await expect(apply({unitPrice:100,total:200,quantity:2},'bad')).rejects.toThrow(/fixed customer charges/);
 const retail={productId:'roller',unitPrice:139,total:278,quantity:2,customerCharges:charges(2)};
 expect((await apply(retail,'good')).rows[0].r).toMatchObject({unitPrice:139,total:278});
 expect((await db.query<any>('select total_amount from sales_quotes where id=$1',[id(7)])).rows[0].total_amount).toBe('258.00');
 expect((await db.query<any>('select retail_snapshot from sales_quote_v2_price_snapshots where id=$1',[id(42)])).rows[0].retail_snapshot).toEqual(original);
});
