import { computeQuoteMoney, parseAdjustments } from './quote-money';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { customerConfigurationFromSelection } from './sales-quote-v2-customer-configuration';
const db = new PGlite({extensions:{pgcrypto}});
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const migration=(name:string)=>readFileSync(`supabase/migrations/${name}.sql`,'utf8');
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
 await db.exec(`
 create extension pgcrypto;
 create schema auth;
 alter table sales_quotes add quote_v2_last_priced_at timestamptz,add product_cost numeric,add manufacturer_cost numeric,add profit_amount numeric,add updated_at timestamptz;
 create table sales_quote_v2_events(id uuid default gen_random_uuid(),quote_id uuid,event_type text,previous_revision bigint,new_revision bigint,actor_id uuid,idempotency_key text,event_payload jsonb);
 create function auth.role() returns text language sql as $$ select 'service_role'::text $$;
 alter table sales_quotes add customer_name text default 'Test customer',add customer_phone text default '5550000000',add customer_email text default 'test@example.invalid',add customer_address text,add sales_owner text,add appointment_date date,add deposit_paid numeric default 0,add account_id uuid,add quote_number text,add share_token uuid default gen_random_uuid(),add quote_group_id uuid,add quote_letter text;
 alter table sales_quote_line_items add room_name text,add width_whole numeric default 36,add width_fraction text default '',add height_whole numeric default 48,add height_fraction text default '',add sort_order integer default 0;
 alter table sales_quote_designs add quote_v2_selection jsonb;
 create table sales_quote_v2_draft_requests(quote_id uuid);
 create table crm_profiles(id uuid,active boolean,email text);
 create table crm_jobs(id uuid primary key default gen_random_uuid(),external_source text,external_id text,source text,status text,priority text,customer_name text,phone text,email text,address text,city text,product_interest text,sales_owner text,next_action text,next_action_due timestamptz,appointment_start timestamptz,appointment_end timestamptz,estimated_total numeric,deposit_paid numeric,notes text,meta jsonb,updated_at timestamptz,unique(external_source,external_id));
 create table crm_quotes(id uuid primary key default gen_random_uuid(),external_source text,external_id text,job_id uuid,quote_number text,status text,quote_total numeric,materials_cost numeric,labor_cost numeric,discount numeric,tax numeric,deposit_required numeric,balance_due numeric,sold_by text,sent_at timestamptz,customer_email text,customer_phone text,customer_address text,share_token text,quote_group_id uuid,quote_label text,notes text,meta jsonb,updated_at timestamptz,unique(external_source,external_id));
 create table crm_quote_line_items(id uuid primary key,quote_id uuid,room text,width_in numeric,height_in numeric,quantity integer,discount_percent numeric,sort_order integer,selected_design_id uuid,notes text,updated_at timestamptz);
 create table crm_quote_designs(id uuid primary key,line_item_id uuid,label text,sort_order integer,product_id text,program_id text,fabric text,surcharges jsonb,motorization jsonb,unit_price numeric,price_breakdown jsonb,price_status text,priced_at timestamptz,notes text,details jsonb,wholesale_unit_price numeric,updated_at timestamptz);
 create table sales_quote_v2_customer_send_preparations(id uuid primary key,quote_id uuid,quote_revision bigint,catalog_version text,retail_total numeric,customer_payload jsonb,crm_job_id uuid,crm_quote_id uuid,prepared_via text,created_by uuid,idempotency_key text,prepared_at timestamptz);
 `);
 const atomic=migration('20260722193000_add_quote_v2_atomic_customer_send');
 await db.exec(atomic.slice(0,atomic.indexOf('create table if not exists')));
 await db.exec(migration('20260722192000_add_quote_v2_authoritative_pricing_batch_rpc'));
 await db.exec(migration('20260911173000_staff_line_price_overrides'));
 await db.exec(migration('20260912002500_line_price_contract_totals'));
 await db.exec(migration('20260914231500_customer_installation_shipping_snapshots'));
 await db.exec(migration('20260914232000_customer_quote_adjustment_rounding'));
 await db.exec(migration('20260914232500_preserve_unchanged_manual_quote_snapshots'));
 await db.exec('alter table crm_quotes alter column materials_cost set not null');
 await db.exec('alter table sales_quote_v2_price_snapshots alter column internal_landed_cost_total set not null');
 await db.exec(migration('20260921214000_allow_explicit_unknown_quote_cost'));
 await db.exec(`
 alter table sales_quotes add archived_at timestamptz,add signed_at timestamptz,add sent_at timestamptz,add sent_via text,add customer_signature text,add customer_printed_name text;
 alter table sales_quote_line_items add archived_at timestamptz;
 create view sales_quote_active_line_items as select * from sales_quote_line_items where archived_at is null;
 alter table crm_quotes add signed_at timestamptz,add sold_at timestamptz,add approved_at timestamptz,add sent_via text,add customer_signature text,add customer_printed_name text,add manufacturer_name text,add manufacturer_order_ref text,add manufacturer_order_url text,add manufacturer_document_url text;
 alter table crm_jobs add lead_id uuid;
 alter table crm_quote_line_items alter column id set default gen_random_uuid();
 alter table crm_quote_designs alter column id set default gen_random_uuid();
 create function reject_v2_audit_mutation() returns trigger language plpgsql as $$ begin raise exception 'immutable'; end $$;
 `);
 await db.exec(migration('20260728120000_partition_partial_quote_acceptance'));
 await db.exec(migration('20260910190000_native_quote_customer_delivery'));
 await db.exec(migration('20260910190100_native_quote_acceptance'));
 await db.exec(migration('20260910190200_native_quote_delivery_audit'));
 await db.exec(migration('20260921230321_native_delivery_current_quote_compatibility'));
 await db.exec(migration('20260921231350_native_delivery_manual_cost_compatibility'));
 await db.exec(migration('20260921231455_native_delivery_source_lifecycle'));
 await db.exec(migration('20260921231523_native_manual_snapshot_customer_projection'));
 await db.exec(migration('20260921231841_native_delivery_customer_configuration_fields'));
 await db.exec(migration('20260923195631_native_delivery_split_tilt_configuration'));
 await db.query('insert into crm_profiles values($1,true,$2)',[id(50),'805shutters@gmail.com']);
},30000);
afterAll(()=>db.close());
const customerCharges={version:'blind-shade-install-ship-v1',eligibleUnitsPerWindow:1,quantity:3,eligibleUnitCount:3,installationPerUnit:25,shippingPerUnit:14,installationTotal:75,shippingTotal:42,perWindowTotal:39,total:117};
const fingerprint='sha256:'+ 'a'.repeat(64);
const price={productId:'lotus-cellular-shades',programId:'cellular-test',programName:'Cellular',matchedWidth:36,matchedHeight:48,base:100,surchargeLines:[],unitPrice:139,discountPercent:0,discountAmount:0,quantity:3,onceTotal:0,total:417,customerCharges};
const selection={catalogVersion:'catalog-test',manufacturerId:'lotus',productId:price.productId,widthInches:36,heightInches:48,quantity:3,configuration:{supplier:'Lotus',mount_type:'Inside Mount'},options:{}};
async function seed(n:number,corrupt=false){
 const retail={...price,ok:true,validationStatus:'valid',catalogVersion:'catalog-test',...(corrupt?{customerCharges:{...customerCharges,total:1}}:{})};
 const snapshot={priceStatus:'authoritative',selectionFingerprint:fingerprint,catalogVersion:'catalog-test',retail};
 await db.query('insert into sales_quotes(id,quote_v2_backend,quote_v2_status,quote_v2_catalog_version,total_amount,installer_notes) values($1,true,$2,$3,387,$4)',[id(n),'priced','catalog-test',JSON.stringify({__adminControls:{showDiscount:true,discountPercent:10,depositPercent:35}})]);
 await db.query('insert into sales_quote_v2_draft_requests values($1)',[id(n)]);
 await db.query("insert into sales_quote_line_items(id,quote_id,product_type,quantity,selected_design_id,room_name) values($1,$2,'Cellular Shades',3,$3,'Living room')",[id(n+100),id(n),id(n+200)]);
 await db.query("insert into sales_quote_designs(id,line_item_id,variant,unit_price,quote_v2_price_status,quote_v2_selection,quote_v2_selection_fingerprint,quote_v2_priced_catalog_version,current_v2_snapshot_id,options_json) values($1,$2,'A',139,'authoritative',$3,$4,'catalog-test',$5,$6)",[id(n+200),id(n+100),selection,fingerprint,id(n+300),{authoritative_price_breakdown:price}]);
 await db.query('insert into sales_quote_v2_price_snapshots(id,quote_id,line_item_id,design_id,quote_revision,selection_fingerprint,catalog_version,retail_total,internal_landed_cost_total,retail_snapshot,internal_cost_snapshot) values($1,$2,$3,$4,1,$5,$6,417,90,$7,$8)',[id(n+300),id(n),id(n+100),id(n+200),fingerprint,'catalog-test',snapshot,{productCostUnit:30,productCostTotal:90,freightAllocated:0,oversizeAllocated:0,processingFeeAllocated:0,landedCostTotal:90}]);
 return snapshot;
}
function payload(n:number,linePrice:object=price,total=387){return {backend:'authoritative_v2',total,lines:[{lineItemId:id(n+100),selectedDesignId:id(n+200),selectedVariant:'A',room:'Living room',productType:'Cellular Shades',widthInches:36,heightInches:48,quantity:3,configuration:{manufacturerId:'lotus',selections:{supplier:'Lotus',mount_type:'Inside Mount'}},price:linePrice}]};}
async function prepare(n:number,p=payload(n),revision=1,key='test'){
 return (await db.query<any>('select * from prepare_native_quote_customer_snapshot($1,$2,$3,$4,$5,$6,$7)',[id(n),revision,'catalog-test',key,id(50),'email',p])).rows[0];
}
it('executes real native preparation and reads fixed charges and $387 back from every customer mirror',async()=>{
 const original=await seed(1);
 const result=await prepare(1);
 expect(result.quote_total).toBe('387.00');
 expect(result.customer_payload).toEqual(payload(1));
 const mirror=(await db.query<any>('select q.*,j.estimated_total from crm_quotes q join crm_jobs j on j.id=q.job_id where q.id=$1',[result.crm_quote_id])).rows[0];
 expect(mirror).toMatchObject({quote_total:'387.00',estimated_total:'387.00',deposit_required:'135.45',balance_due:'251.55',status:'draft',sent_at:null});
 expect(mirror.meta.adjustments).toMatchObject({discountPercent:10,depositPercent:35});
 const design=(await db.query<any>('select d.*,l.selected_design_id,l.quantity from crm_quote_designs d join crm_quote_line_items l on l.id=d.line_item_id where d.id=$1',[id(201)])).rows[0];
 expect(design.price_breakdown).toEqual(price);
 expect(design).toMatchObject({unit_price:'139.00',quantity:3,selected_design_id:id(201)});
 const stored=(await db.query<any>('select * from sales_quote_v2_customer_send_preparations where id=$1',[result.send_preparation_id])).rows[0];
 expect(stored.customer_payload).toEqual(payload(1));
 expect(stored.retail_total).toBe('387.00');
 expect((await db.query<any>('select retail_snapshot from sales_quote_v2_price_snapshots where id=$1',[id(301)])).rows[0].retail_snapshot).toEqual(original);
 expect((await prepare(1)).send_preparation_id).toBe(result.send_preparation_id);
 expect((await db.query<any>('select status,quote_v2_revision from sales_quotes where id=$1',[id(1)])).rows[0]).toMatchObject({status:'draft',quote_v2_revision:1});
});
it('rejects corrupt stored fee policy atomically before creating any CRM mirror',async()=>{
 await seed(2,true);
 await expect(prepare(2)).rejects.toThrow(/Customer installation\/shipping amounts/);
 expect((await db.query<any>('select count(*)::int as count from crm_quotes where external_id=$1',['quote:'+id(2)])).rows[0].count).toBe(0);
});
it('prepares an exact manual price after removing automatic fees and preserves its source snapshot',async()=>{
 const original=await seed(3);
 await db.query('select set_sales_quote_line_price($1,$2,$3,100,$4,1,$5)',[id(3),id(103),'A',id(50),id(999)]);
 const {customerCharges:removed,...manualPrice}=price;
 const expected={...manualPrice,base:100,unitPrice:100,total:300};
 const result=await prepare(3,payload(3,expected,270),2);
 expect(result.quote_total).toBe('270.00');
 expect((await db.query<any>('select price_breakdown from crm_quote_designs where id=$1',[id(203)])).rows[0].price_breakdown).toEqual(expected);
 expect((await db.query<any>('select retail_snapshot from sales_quote_v2_price_snapshots where id=$1',[id(303)])).rows[0].retail_snapshot).toEqual(original);
});
it('rounds discount and tax to cents before the next monetary step',async()=>{
 const controls=JSON.stringify({__adminControls:{showDiscount:true,discountPercent:10,showTax:true,taxPercent:8}});
 const result=(await db.query<any>('select quote_customer_adjusted_total(139.05,39,$1) as total',[controls])).rows[0];
 // $100.05 merchandise -> $10.01 discount; $129.04 taxable -> $10.32 tax.
 expect(result.total).toBe('139.36');
});

it('real batch preserves untouched manual snapshots and costs while pricing another line',async()=>{
 await seed(4); await seed(5);
 await db.query('update sales_quote_line_items set quote_id=$1 where id=$2',[id(4),id(105)]);
 await db.query('update sales_quote_v2_price_snapshots set quote_id=$1 where id=$2',[id(4),id(305)]);
 await db.query('select set_sales_quote_line_price($1,$2,$3,100,$4,1,$5)',[id(4),id(104),'A',id(50),id(998)]);
 const before=(await db.query<any>('select * from sales_quote_designs where id=$1',[id(204)])).rows[0];
 const result=(n:number)=>({lineItemId:id(n+100),designId:id(n+200),selection,selectionFingerprint:fingerprint,catalogVersion:'catalog-test',priceStatus:'authoritative',selectDesign:true,
 authoritativeSnapshot:{priceStatus:'authoritative',selectionFingerprint:fingerprint,catalogVersion:'catalog-test',catalogAsOf:'2026-09-14',retail:{...price,ok:true,validationStatus:'valid',catalogVersion:'catalog-test'}},
 internalCostSnapshot:{productCostUnit:30,productCostTotal:90,freightAllocated:0,oversizeAllocated:0,processingFeeAllocated:0,landedCostTotal:90},validationSnapshot:[],provenanceSnapshot:{source:'test'}});
 const batch=[result(4),result(5)];
 const save=async(rev=2,key='manual-batch')=>(await db.query<any>('select * from save_quote_v2_pricing_batch($1,$2,$3,$4,$5)',[id(4),rev,key,id(50),batch])).rows[0];
 const saved=await save();
 expect(saved).toMatchObject({quote_total:'657.00',new_revision:3,quote_status:'priced',priced_design_count:2,blocked_design_count:0});
 const after=(await db.query<any>('select * from sales_quote_designs where id=$1',[id(204)])).rows[0];
 expect(after).toEqual(before);
 expect(saved.manual_prices[id(204)]).toMatchObject({unitPrice:100,total:300});
 expect((await db.query<any>('select product_cost,total_amount from sales_quotes where id=$1',[id(4)])).rows[0]).toMatchObject({product_cost:'180.00',total_amount:'657.00'});
 expect((await save()).new_revision).toBe(3);
 await expect(save(2,'stale')).rejects.toThrow(/revision conflict/);
 const bad=[{...batch[0],lineItemId:id(101)},batch[1]];
 await expect(db.query('select * from save_quote_v2_pricing_batch($1,3,$2,$3,$4)',[id(4),'wrong-line',id(50),bad])).rejects.toThrow(/does not belong/);
 // Editing manual quantity follows ordinary repricing and reapplies its exact unit override.
 await db.query('update sales_quote_line_items set quantity=4 where id=$1',[id(104)]);
 const edited=batch.map((r,i)=>i===0?{...r,selection:{...selection,quantity:4},authoritativeSnapshot:{...r.authoritativeSnapshot,retail:{...r.authoritativeSnapshot.retail,quantity:4,total:556,customerCharges:{...customerCharges,quantity:4,eligibleUnitCount:4,installationTotal:100,shippingTotal:56,total:156}}}}:r);
 const repriced=(await db.query<any>('select * from save_quote_v2_pricing_batch($1,3,$2,$3,$4)',[id(4),'quantity-edit',id(50),edited])).rows[0];
 expect(repriced.manual_prices[id(204)]).toMatchObject({unitPrice:100,quantity:4,total:400});
 expect(repriced.quote_total).toBe('747.00');
});

const unresolvedCost = {quotePricingPolicy:'grid_options_quote_v1',status:'unresolved',costStatus:'incomplete',freightStatus:'unresolved',productCostUnit:null,productCostTotal:null,freightAllocated:null,oversizeAllocated:null,processingFeeAllocated:null,landedCostTotal:null};
function retailOnlyBatch(n:number, cost:object=unresolvedCost, asOf='2026-09-21') {
 return [{lineItemId:id(n+100),designId:id(n+200),selection,selectionFingerprint:fingerprint,catalogVersion:'catalog-test',priceStatus:'authoritative',selectDesign:true,
 authoritativeSnapshot:{quotePricingPolicy:'grid_options_quote_v1',priceStatus:'authoritative',selectionFingerprint:fingerprint,catalogVersion:'catalog-test',catalogAsOf:asOf,retail:{...price,ok:true,validationStatus:'valid',catalogVersion:'catalog-test'}},
 internalCostSnapshot:cost,validationSnapshot:[],provenanceSnapshot:{source:'test'}}];
}
async function saveRetailOnly(n:number,batch=retailOnlyBatch(n),key='retail-only') {
 return (await db.query<any>('select * from save_quote_v2_pricing_batch($1,1,$2,$3,$4)',[id(n),key,id(50),batch])).rows[0];
}
it('persists known retail with null unknown cost, reopens and prepares customer mirror without fabricating wholesale',async()=>{
 const original=await seed(20);
 const batch=retailOnlyBatch(20);
 const saved=await saveRetailOnly(20,batch);
 expect(saved).toMatchObject({quote_total:'387.00',quote_status:'priced',new_revision:2});
 expect(await saveRetailOnly(20,batch)).toEqual(saved);
 const stored=(await db.query<any>('select s.*,q.product_cost,q.manufacturer_cost,q.profit_amount,d.unit_price from sales_quotes q join sales_quote_line_items l on l.quote_id=q.id join sales_quote_designs d on d.id=l.selected_design_id join sales_quote_v2_price_snapshots s on s.id=d.current_v2_snapshot_id where q.id=$1',[id(20)])).rows[0];
 expect(stored).toMatchObject({retail_total:'417.00',unit_price:'139.00',internal_landed_cost_total:null,product_cost:null,manufacturer_cost:null,profit_amount:null,internal_cost_snapshot:unresolvedCost});
 expect((await db.query<any>('select retail_snapshot from sales_quote_v2_price_snapshots where id=$1',[id(320)])).rows[0].retail_snapshot).toEqual(original);
 const prepared=await prepare(20,payload(20),2,'retail-only-customer');
 expect(prepared.customer_payload).toEqual(payload(20));
 expect((await db.query<any>('select materials_cost from crm_quotes where id=$1',[prepared.crm_quote_id])).rows[0].materials_cost).toBeNull();
 expect((await db.query<any>('select wholesale_unit_price from crm_quote_designs where id=$1',[id(220)])).rows[0].wholesale_unit_price).toBeNull();
});
it('retains known dealer merchandise while unresolved freight keeps aggregate landed cost and profit null',async()=>{
 await seed(21);
 await saveRetailOnly(21,retailOnlyBatch(21,{...unresolvedCost,productCostUnit:30,productCostTotal:90}));
 const prepared=await prepare(21,payload(21),2,'known-merchandise');
 expect((await db.query<any>('select materials_cost from crm_quotes where id=$1',[prepared.crm_quote_id])).rows[0].materials_cost).toBeNull();
 expect((await db.query<any>('select wholesale_unit_price from crm_quote_designs where id=$1',[id(221)])).rows[0].wholesale_unit_price).toBe('30.00');
});
it('rejects old-date, missing policy, forged complete, negative and string cost snapshots atomically',async()=>{
 await seed(22);
 for(const batch of [retailOnlyBatch(22,unresolvedCost,'2026-09-20'),retailOnlyBatch(22,{...unresolvedCost,quotePricingPolicy:null}),retailOnlyBatch(22,{...unresolvedCost,status:'complete'}),retailOnlyBatch(22,{...unresolvedCost,productCostUnit:-1}),retailOnlyBatch(22,{...unresolvedCost,productCostTotal:'100'})]) {
  await expect(saveRetailOnly(22,batch)).rejects.toThrow(/protected-cost snapshot/);
 }
 expect((await db.query<any>('select quote_v2_revision from sales_quotes where id=$1',[id(22)])).rows[0].quote_v2_revision).toBe(1);
});
it('prevents unmarked null landed costs at the table boundary and preserves complete snapshot arithmetic validation',async()=>{
 await expect(db.query('insert into sales_quote_v2_price_snapshots(internal_landed_cost_total,retail_snapshot,internal_cost_snapshot) values(null,$1,$2)',[{},{}])).rejects.toThrow(/explicit_unknown_cost_check/);
 await seed(23);
 const bad={productCostUnit:30,productCostTotal:90,freightAllocated:0,oversizeAllocated:0,processingFeeAllocated:0,landedCostTotal:91};
 await expect(saveRetailOnly(23,retailOnlyBatch(23,bad))).rejects.toThrow(/Landed cost must equal/);
});

it('does not report partial known cost as full quote cost in a mixed known/unknown batch',async()=>{
 await seed(24); await seed(25);
 await db.query('update sales_quote_line_items set quote_id=$1 where id=$2',[id(24),id(125)]);
 const known=retailOnlyBatch(25,{productCostUnit:30,productCostTotal:90,freightAllocated:0,oversizeAllocated:0,processingFeeAllocated:0,landedCostTotal:90});
 await saveRetailOnly(24,[...retailOnlyBatch(24),...known]);
 expect((await db.query<any>('select product_cost,manufacturer_cost,profit_amount,total_amount from sales_quotes where id=$1',[id(24)])).rows[0]).toMatchObject({product_cost:null,manufacturer_cost:null,profit_amount:null,total_amount:'774.00'});
});
it('still rejects repricing sent and signed-status quotes',async()=>{
 await seed(26);
 await db.query("update sales_quotes set status='sent',quote_v2_status='sent' where id=$1",[id(26)]);
 await expect(saveRetailOnly(26)).rejects.toThrow(/non-draft/);
 await expect(db.query('insert into crm_quotes(materials_cost,meta) values(null,$1)',[{}])).rejects.toThrow(/explicit_unknown_cost_check/);
});
it('persists staff-only pricing failure across reopen and clears it when a later calculation succeeds',async()=>{
 await seed(27);
 const batch=retailOnlyBatch(27);
 const failed={...batch[0],priceStatus:'unpriceable',authoritativeSnapshot:null,internalCostSnapshot:null,staffPricingError:'No retail grid cell exists for this 91 × 48 configuration.'};
 await saveRetailOnly(27,[failed] as any,'grid-missing');
 const read=async()=> (await db.query<any>('select options_json,current_v2_snapshot_id from sales_quote_designs where id=$1',[id(227)])).rows[0];
 expect(await read()).toMatchObject({current_v2_snapshot_id:null,options_json:{authoritative_price_error:failed.staffPricingError}});
 await db.query('select * from save_quote_v2_pricing_batch($1,2,$2,$3,$4)',[id(27),'grid-resolved',id(50),batch]);
 expect((await read()).options_json).not.toHaveProperty('authoritative_price_error');
 const output=await prepare(27,payload(27),3,'grid-resolved-customer');
 expect(JSON.stringify(output.customer_payload)).not.toMatch(/staffPricingError|authoritative_price_error|No retail grid/);
});

async function reserve(n:number,p:object=payload(n),revision=1) {
 return (await db.query<any>('select reserve_native_quote_group_delivery($1,$2,$3,$4,$5,$6) as delivery',[
  id(n),id(50),revision,`delivery-test-${n}`,
  {email:['synthetic@example.invalid'],sms:[],note:null,measureDecision:null},
  [{quoteId:id(n),revision,payload:p}],
 ])).rows[0].delivery;
}
async function accept(delivery:any,selected:string[],total:number) {
 return (await db.query<any>('select * from accept_native_quote_delivery($1,$2,$3,$4,now(),$5,$6)',[
  delivery.crm_quote_id,delivery.share_token,selected,total,'LOCAL TEST SIGNATURE','Synthetic test',
 ])).rows[0];
}
it.each(['No','Yes'])('reserves customer delivery with saved split tilt %s without exposing private fields',async(splitTilt)=>{
 const n=splitTilt==='No'?40:41;
 await seed(n);
 const shutterSelection={...selection,configuration:{...selection.configuration,split_tilt:splitTilt,internal_landed_cost_total:90}};
 await db.query('update sales_quote_designs set quote_v2_selection=$1 where id=$2',[shutterSelection,id(n+200)]);
 const p=payload(n);
 const configuration=customerConfigurationFromSelection({...shutterSelection,programId:price.programId,catalogAsOf:'2026-09-23'});
 const delivery=await reserve(n,{...p,lines:p.lines.map(line=>({...line,configuration}))});
 expect(delivery.customer_payload.lines[0].configuration.selections).toEqual({...selection.configuration,split_tilt:splitTilt});
 expect(delivery.customer_payload.total).toBe(387);
 const attempt=(await db.query<any>('select state from sales_quote_v2_delivery_attempts where delivery_id=$1',[delivery.id])).rows[0];
 expect(attempt.state).toBe('pending');
});
it('reserves, deduplicates dispatch, and accepts current discounted retail with unresolved cost',async()=>{
 await seed(30);
 await saveRetailOnly(30);
 const delivery=await reserve(30,payload(30),2);
 expect(delivery.customer_payload.total).toBe(387);
 expect(delivery.internal_line_costs[id(130)]).toMatchObject({quantity:3,costStatus:'unresolved',productTotal:null,total:null});
 expect((await reserve(30,payload(30),2)).id).toBe(delivery.id);
 expect((await db.query<any>('select count(*)::int as n from sales_quote_v2_delivery_attempts where delivery_id=$1',[delivery.id])).rows[0].n).toBe(1);
 await expect(accept(delivery,[id(130)+'#1',id(130)+'#2',id(130)+'#3'],417)).rejects.toThrow(/exact selected contract total/);
 await accept(delivery,[id(130)+'#1',id(130)+'#2',id(130)+'#3'],387);
 const mirror=(await db.query<any>('select * from crm_quotes where id=$1',[delivery.crm_quote_id])).rows[0];
 expect(mirror).toMatchObject({status:'sold',quote_total:'387.00',materials_cost:null,discount:'30.00',deposit_required:'135.45',balance_due:'251.55'});
 expect((await db.query<any>('select total_amount,manufacturer_cost from sales_quotes where id=$1',[id(30)])).rows[0]).toMatchObject({total_amount:'387.00',manufacturer_cost:null});
 expect((await accept(delivery,[id(130)+'#1',id(130)+'#2',id(130)+'#3'],387)).already_signed).toBe(true);
});
it('partitions unresolved costs and fixed customer charges without changing saved snapshots',async()=>{
 const original=await seed(31);
 await saveRetailOnly(31);
 const delivery=await reserve(31,payload(31),2);
 const result=await accept(delivery,[id(131)+'#2'],129);
 expect(result.future_quote_id).toBeTruthy();
 const current=(await db.query<any>('select quote_total,materials_cost,deposit_required from crm_quotes where id=$1',[delivery.crm_quote_id])).rows[0];
 expect(current).toMatchObject({quote_total:'129.00',materials_cost:null,deposit_required:'45.15'});
 const future=(await db.query<any>('select * from sales_quote_v2_deliveries where crm_quote_id=$1',[result.future_quote_id])).rows[0];
 expect(future.customer_payload.total).toBe(258);
 expect(Object.values(future.internal_line_costs)[0]).toMatchObject({quantity:2,costStatus:'unresolved',total:null});
 const line=(await db.query<any>('select id from crm_quote_line_items where quote_id=$1',[result.future_quote_id])).rows[0];
 await accept(future,[line.id+'#1'],129);
 expect((await db.query<any>('select total_amount from sales_quotes where id=$1',[id(31)])).rows[0].total_amount).toBe('129.00');
 expect((await db.query<any>('select retail_snapshot from sales_quote_v2_price_snapshots where id=$1',[id(331)])).rows[0].retail_snapshot).toEqual(original);
});
it('freezes known cost and reserves only active lines',async()=>{
 await seed(32);
 await db.query('insert into sales_quote_line_items(id,quote_id,quantity,archived_at) values($1,$2,1,now())',[id(932),id(32)]);
 // Production preparation already uses the active view; reproduce that migration's read patch.
 const fn=(await db.query<any>("select pg_get_functiondef('prepare_native_quote_customer_snapshot(uuid,bigint,text,text,uuid,text,jsonb)'::regprocedure) as sql")).rows[0].sql;
 await db.exec(fn.replace(/(from|join)(\s+)public\.sales_quote_line_items\b/gi,'$1$2public.sales_quote_active_line_items'));
 const delivery=await reserve(32);
 expect(Object.keys(delivery.internal_line_costs)).toEqual([id(132)]);
 expect(delivery.internal_line_costs[id(132)]).toMatchObject({quantity:3,costStatus:'known',productTotal:90,total:90});
 await expect(db.query('update sales_quote_line_items set quantity=4 where id=$1',[id(132)])).rejects.toThrow(/frozen/);
 await accept(delivery,[id(132)+'#1',id(132)+'#2',id(132)+'#3'],387);
 expect((await db.query<any>('select manufacturer_cost from sales_quotes where id=$1',[id(32)])).rows[0].manufacturer_cost).toBe('90.0000000000000000');
});

it('keeps SQL acceptance money aligned with customer totals, fees, taxes and overrides',async()=>{
 for(const adjustments of [{},{discountPercent:10,depositPercent:35},{discountFlat:5000,depositPercent:50},{fees:[{name:'Fee',amount:12.34}],taxPercent:8.25,discountPercent:12.5,depositPercent:40},{totalOverride:3955.12,depositPercent:50},{balanceDueOverride:300,depositPercent:50}]) {
  const expected=computeQuoteMoney(417,parseAdjustments({adjustments}),117);
  const actual=(await db.query<any>('select native_quote_money(417,117,$1,null) as money',[adjustments])).rows[0].money;
  expect(actual).toMatchObject({total:expected.total,discount:expected.discountAmount,tax:expected.taxAmount,depositDue:expected.depositRequired,balanceDue:expected.balanceDue,materialsCost:null});
 }
});

it('reserves and accepts manual pricing with no original grid or supplier cost',async()=>{
 await seed(33);
 const f='a'.repeat(64);
 const retail={...price};
 const snapshot={priceStatus:'authoritative',selectionFingerprint:f,catalogVersion:'custom-override-v1',retail};
 await db.query("update sales_quotes set quote_v2_catalog_version='custom-override-v1' where id=$1",[id(33)]);
 await db.query("update sales_quote_designs set quote_v2_priced_catalog_version='custom-override-v1',quote_v2_selection_fingerprint=$2 where id=$1",[id(233),f]);
 await db.query("update sales_quote_v2_price_snapshots set catalog_version='custom-override-v1',selection_fingerprint=$2,retail_snapshot=$3,internal_cost_snapshot=$4,internal_landed_cost_total=0,provenance_snapshot=$5 where id=$1",[id(333),f,snapshot,{status:'unresolved',landedCostTotal:null},{mode:'custom_override',internalOnly:true,manualLinePrice:true,costResolution:'unresolved',originalSnapshotId:null}]);
 const delivery=await reserve(33,payload(33));
 expect(delivery.internal_line_costs[id(133)]).toMatchObject({costStatus:'unresolved',productTotal:null,total:null});
 await accept(delivery,[id(133)+'#1'],129);
 expect((await db.query<any>('select materials_cost from crm_quotes where id=$1',[delivery.crm_quote_id])).rows[0].materials_cost).toBeNull();
 expect((await db.query<any>('select retail_snapshot from sales_quote_v2_price_snapshots where id=$1',[id(333)])).rows[0].retail_snapshot).toEqual(snapshot);
});
