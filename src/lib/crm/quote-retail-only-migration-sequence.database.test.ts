import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
 await db.exec(migration('20260921120000_manual_customer_installation_policy'));
 await db.exec(migration('20260921121000_custom_mode_customer_installation_policy'));
 await db.exec(migration('20260921214000_allow_explicit_unknown_quote_cost'));
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
const unresolvedCost = {quotePricingPolicy:'grid_options_quote_v1',status:'unresolved',costStatus:'incomplete',freightStatus:'unresolved',productCostUnit:null,productCostTotal:null,freightAllocated:null,oversizeAllocated:null,processingFeeAllocated:null,landedCostTotal:null};
function retailOnlyBatch(n:number, cost:object=unresolvedCost, asOf='2026-09-21') {
 return [{lineItemId:id(n+100),designId:id(n+200),selection,selectionFingerprint:fingerprint,catalogVersion:'catalog-test',priceStatus:'authoritative',selectDesign:true,
 authoritativeSnapshot:{quotePricingPolicy:'grid_options_quote_v1',priceStatus:'authoritative',selectionFingerprint:fingerprint,catalogVersion:'catalog-test',catalogAsOf:asOf,retail:{...price,ok:true,validationStatus:'valid',catalogVersion:'catalog-test'}},
 internalCostSnapshot:cost,validationSnapshot:[],provenanceSnapshot:{source:'test'}}];
}
async function saveRetailOnly(n:number,batch=retailOnlyBatch(n),key='retail-only') {
 return (await db.query<any>('select * from save_quote_v2_pricing_batch($1,1,$2,$3,$4)',[id(n),key,id(50),batch])).rows[0];
}

it('applies the exact production predecessor/manual/unknown-cost sequence and preserves retail-only save plus merchandise charges',async()=>{
 await seed(40);
 expect(await saveRetailOnly(40)).toMatchObject({quote_total:'387.00',quote_status:'priced',new_revision:2});
 const prepared=await prepare(40,payload(40),2,'sequence-proof');
 expect(prepared.customer_payload).toEqual(payload(40));
 expect((await db.query<any>('select product_cost,profit_amount from sales_quotes where id=$1',[id(40)])).rows[0]).toEqual({product_cost:null,profit_amount:null});
 await seed(41);
 const manual=(await db.query<any>("select set_sales_quote_line_price($1,$2,'A',100,$3,1,$4) as result",[id(41),id(141),id(50),id(941)])).rows[0].result;
 expect(manual).toMatchObject({unitPrice:139,total:387});
});
