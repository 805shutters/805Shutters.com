import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(50), account = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb';
beforeAll(async () => {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create function auth.role() returns text language sql as $$select coalesce(current_setting('test.auth_role',true),'service_role')$$;
 create table crm_profiles(id uuid primary key,email text,active boolean default true);
 create table sales_quotes(id uuid primary key default gen_random_uuid(),quote_number text,account_id uuid,status text default 'draft',customer_name text,customer_email text,customer_phone text,customer_address text,appointment_date date,installer_notes text,product_cost numeric default 0,total_amount numeric default 0,profit_amount numeric default 0,manufacturer_cost numeric default 0,created_by uuid,sales_owner text,sales_owner_auth_user_id uuid,sales_owner_set_at timestamptz,quote_group_id uuid,quote_letter text default 'A',quote_v2_backend boolean default false,quote_v2_revision bigint default 1,quote_v2_status text default 'legacy',quote_v2_catalog_version text,quote_v2_accepted_selection jsonb,quote_v2_last_priced_at timestamptz,signed_at timestamptz,customer_signature text,deposit_paid numeric default 0,balance_paid numeric default 0,share_token text default gen_random_uuid()::text,sent_at timestamptz,ordered_at timestamptz,created_job_id uuid);
 create table sales_quote_line_items(id uuid primary key default gen_random_uuid(),quote_id uuid references sales_quotes,room_name text,product_type text,width_whole int,width_fraction text,height_whole int,height_fraction text,quantity int default 1,sort_order int,selected_design_id uuid,archived_at timestamptz,order_status text default 'outstanding',ordered_at timestamptz);
 create table sales_quote_designs(id uuid primary key default gen_random_uuid(),line_item_id uuid references sales_quote_line_items on delete cascade,variant text,product_type text,unit_price numeric default 0,options_json jsonb default '{}',quote_v2_selection jsonb default '{}',quote_v2_price_status text,quote_v2_selection_fingerprint text,quote_v2_priced_catalog_version text,quote_v2_priced_at timestamptz,current_v2_snapshot_id uuid,created_at timestamptz default now(),unique(line_item_id,variant),unique(id,line_item_id));
 create table sales_quote_v2_price_snapshots(id uuid primary key default gen_random_uuid(),quote_id uuid,line_item_id uuid,design_id uuid,quote_revision bigint,selection_fingerprint text,catalog_version text,retail_total numeric,internal_landed_cost_total numeric not null,retail_snapshot jsonb,internal_cost_snapshot jsonb,validation_snapshot jsonb,provenance_snapshot jsonb,created_by uuid,created_at timestamptz default now(),unique(id,design_id));
 alter table sales_quote_line_items add foreign key(selected_design_id,id) references sales_quote_designs(id,line_item_id) deferrable initially deferred;
 alter table sales_quote_designs add foreign key(current_v2_snapshot_id,id) references sales_quote_v2_price_snapshots(id,design_id) deferrable initially deferred;
 create function save_quote_v2_pricing_batch(uuid,bigint,text,uuid,jsonb) returns table(quote_id uuid,new_revision bigint,quote_status text,quote_total numeric,priced_design_count integer,blocked_design_count integer) language plpgsql as $$begin return;end$$;
 create table sales_quote_v2_customer_send_preparations(id uuid);
 create table sales_quote_v2_draft_requests(idempotency_key text primary key,request_hash text,actor_id uuid,quote_id uuid unique,result jsonb);
 create table sales_quote_v2_events(id uuid primary key default gen_random_uuid(),quote_id uuid,event_type text,previous_revision bigint,new_revision bigint,actor_id uuid,idempotency_key text,event_payload jsonb,unique(quote_id,new_revision));
 create sequence quote_numbers;
 create function next_quote_number(text) returns text language sql as $$select $1||'-'||nextval('quote_numbers')::text$$;
 create function reject_v2_audit_mutation() returns trigger language plpgsql as $$begin raise exception 'Immutable history';end$$;`);
 for (const file of ['20260911173000_staff_line_price_overrides.sql','20260912002500_line_price_contract_totals.sql','20260914231500_customer_installation_shipping_snapshots.sql','20260921120000_manual_customer_installation_policy.sql','20260921204000_edit_finalized_quote_revision.sql','20260921230000_preserve_accepted_revision_scope.sql']) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
 // Mirror the already-deployed active-line read contract for the real manual RPC.
 await db.exec('create view sales_quote_active_line_items as select * from sales_quote_line_items where archived_at is null');
 const manualDefinition=(await db.query<{definition:string}>("select pg_get_functiondef('set_sales_quote_line_price(uuid,uuid,text,numeric,uuid,bigint,uuid,boolean)'::regprocedure) as definition")).rows[0].definition;
 await db.exec(manualDefinition.replace(/from public\.sales_quote_line_items/gi,'from public.sales_quote_active_line_items'));
 await db.query('insert into crm_profiles(id,email) values($1,$2)', [actor,'805shutters@gmail.com']);
}, 30000);
afterAll(() => db.close());
async function source(n: number, v2 = true) {
 const q=id(n), l=id(n+1000), d=id(n+2000), snapshot=id(n+3000);
 await db.query(`insert into sales_quotes(id,account_id,status,customer_name,total_amount,quote_v2_backend,quote_v2_revision,quote_v2_status,signed_at,customer_signature,deposit_paid,balance_paid,sent_at,ordered_at,created_job_id,installer_notes)
 values($1,$2,'sold','Revision test',278,$3,7,$4,now(),'signed original',50,20,now(),now(),$5,$6)`,[q,account,v2,v2?'sent':'legacy',id(90),JSON.stringify({__adminControls:{showDiscount:true,discountPercent:10}})]);
 await db.query(`insert into sales_quote_line_items(id,quote_id,room_name,product_type,width_whole,height_whole,quantity,sort_order,order_status,ordered_at) values($1,$2,'Bedroom','Roman Shades',36,60,2,0,'ordered',now())`,[l,q]);
 const options={manual_price_override:true,manual_merchandise_unit_price:100,manual_customer_charge_policy:'blind-shade-install-ship-v1',customer_charges:{version:'blind-shade-install-ship-v1',quantity:2,eligibleUnitsPerWindow:1,eligibleUnitCount:2,installationPerUnit:25,shippingPerUnit:14,installationTotal:50,shippingTotal:28,total:78,perWindowTotal:39},accompanying_line_id:l,roller_valance_v1:{version:1,associatedLineIds:[l]},authoritative_once_total:0};
 await db.query(`insert into sales_quote_designs(id,line_item_id,variant,product_type,unit_price,options_json,quote_v2_price_status,quote_v2_selection_fingerprint,quote_v2_priced_catalog_version) values($1,$2,'B','Roman Shades',139,$3,$4,'saved-fingerprint','saved-catalog')`,[d,l,options,v2?'authoritative':'legacy']);
 await db.query('update sales_quote_line_items set selected_design_id=$1 where id=$2',[d,l]);
 if(v2){
   await db.query(`insert into sales_quote_v2_price_snapshots(id,quote_id,line_item_id,design_id,quote_revision,selection_fingerprint,catalog_version,retail_total,internal_landed_cost_total,retail_snapshot,internal_cost_snapshot,validation_snapshot,provenance_snapshot,created_by) values($1,$2,$3,$4,7,'saved-fingerprint','saved-catalog',278,40,$5,$6,'{}','{}',$7)`,[snapshot,q,l,d,{retail:{unitPrice:139,total:278,quantity:2,customerCharges:options.customer_charges}},{landedCostTotal:40},actor]);
   await db.query('update sales_quote_designs set current_v2_snapshot_id=$1 where id=$2',[snapshot,d]);
 }
 await db.query('insert into sales_quote_line_price_overrides(design_id,quote_id,unit_price,updated_by,customer_charge_policy) values($1,$2,100,$3,$4)',[d,q,actor,'blind-shade-install-ship-v1']);
 return {q,l,d,snapshot,options};
}
async function revise(q:string,l:string,request:number,action='manual-price',price:number|null=0,revision:number|null=7,who=actor) {
 const {rows}=await db.query<any>('select create_sales_quote_revision($1,$2,$3,$4,$5,$6,$7,$8) as r',[q,who,id(request),revision,action,l,action==='manual-price'?'B':null,action==='manual-price'?price:null]);return rows[0].r;
}
async function row(table:string, identity:string) { return (await db.query<any>(`select to_jsonb(t) as r from ${table} t where id=$1`,[identity])).rows[0]?.r; }

it.each([true,false])('creates editable %s revision without changing signed source and keeps zero manual merchandise plus installation/shipping',async(v2)=>{
 const s=await source(v2?1:2,v2), original=await row('sales_quotes',s.q), oldDesign=await row('sales_quote_designs',s.d);
 const r=await revise(s.q,s.l,v2?100:101);
 expect(r.quoteId).not.toBe(s.q);expect(r.lineItemId).not.toBe(s.l);
 expect(r.quote).toMatchObject({status:'draft',signed_at:null,customer_signature:null,deposit_paid:0,balance_paid:0,sent_at:null,ordered_at:null,created_job_id:null,total_amount:78});
 expect(r.quote.share_token).not.toBe(original.share_token);
 expect(r.quote.quote_group_id).toBe(r.quoteId);expect(r.quote.quote_letter).toBe('A');
 const copiedLine=await row('sales_quote_line_items',r.lineItemId);
 expect(copiedLine).toMatchObject({quantity:2,order_status:'outstanding',ordered_at:null});
 const copiedDesign=await row('sales_quote_designs',copiedLine.selected_design_id);
 expect(copiedDesign.unit_price).toBe(39);expect(copiedDesign.options_json.manual_merchandise_unit_price).toBe(0);
 expect(copiedDesign.options_json.accompanying_line_id).toBe(r.lineItemId);
 expect(copiedDesign.options_json.roller_valance_v1.associatedLineIds).toEqual([r.lineItemId]);
 expect(await row('sales_quotes',s.q)).toEqual(original);expect(await row('sales_quote_designs',s.d)).toEqual(oldDesign);
 expect(await revise(s.q,s.l,v2?100:101)).toEqual(r);
 await expect(revise(s.q,s.l,v2?100:101,'manual-price',5)).rejects.toThrow(/different action/);
});

it('archives only the copied target and retains every other saved amount, manual override, and snapshot',async()=>{
 const s=await source(3),extra=id(10003),designId=id(20003),archived=id(10004);
 await db.query(`insert into sales_quote_line_items(id,quote_id,room_name,product_type,quantity,sort_order,archived_at) values($1,$2,'Keep','Shutters',3,1,null),($3,$2,'Old removed','Shutters',5,2,now())`,[extra,s.q,archived]);
 await db.query(`insert into sales_quote_designs(id,line_item_id,variant,unit_price,options_json,quote_v2_price_status) values($1,$2,'A',222,'{"manual_price_override":true}','authoritative')`,[designId,extra]);
 await db.query('update sales_quote_line_items set selected_design_id=$1 where id=$2',[designId,extra]);
 await db.query('insert into sales_quote_line_price_overrides(design_id,quote_id,unit_price,updated_by) values($1,$2,222,$3)',[designId,s.q,actor]);
 const originalSnapshot=await row('sales_quote_v2_price_snapshots',s.snapshot);
 const r=await revise(s.q,s.l,102,'delete');
 expect(r.total).toBe(599.4);
 expect((await row('sales_quote_line_items',r.lineItemId)).archived_at).not.toBeNull();
 const active=await db.query<any>('select li.*,d.unit_price,d.options_json,d.id as design_id from sales_quote_line_items li join sales_quote_designs d on d.id=li.selected_design_id where li.quote_id=$1 and li.archived_at is null',[r.quoteId]);
 expect(active.rows).toHaveLength(1);expect(active.rows[0].unit_price).toBe('222');expect(active.rows[0].room_name).toBe('Keep');
 const overrides=await db.query<any>('select unit_price,customer_charge_policy from sales_quote_line_price_overrides where design_id=$1',[active.rows[0].design_id]);
 expect(overrides.rows[0]).toMatchObject({unit_price:'222.00',customer_charge_policy:null});
 expect(await row('sales_quote_v2_price_snapshots',s.snapshot)).toEqual(originalSnapshot);
 const copies=await db.query<any>('select * from sales_quote_v2_price_snapshots where quote_id=$1',[r.quoteId]);
 expect(copies.rows).toHaveLength(1);expect(copies.rows[0].retail_snapshot).toEqual(originalSnapshot.retail_snapshot);
 expect(copies.rows[0].quote_revision).toBe(r.revision);expect(copies.rows[0].id).not.toBe(s.snapshot);expect(copies.rows[0].design_id).not.toBe(s.d);
});

it('rejects unauthorized actors, stale revisions, cross-account lines and drafts before creating anything',async()=>{
 const s=await source(4),before=(await db.query<any>('select count(*)::int n from sales_quotes')).rows[0].n;
 await expect(revise(s.q,s.l,103,'delete',null,6)).rejects.toThrow(/changed/);
 await expect(revise(s.q,id(999),104,'delete')).rejects.toThrow(/not active/);
 await expect(revise(s.q,s.l,105,'delete',null,7,id(51))).rejects.toThrow(/authorized/);
 await db.query("update sales_quotes set account_id=$1 where id=$2",[id(99),s.q]);
 await expect(revise(s.q,s.l,106,'delete')).rejects.toThrow(/not found/);
 await db.query("update sales_quotes set account_id=$1,status='draft',signed_at=null,sent_at=null,customer_signature=null,quote_v2_status='priced' where id=$2",[account,s.q]);
 await expect(revise(s.q,s.l,107,'delete')).rejects.toThrow(/already editable/);
 expect((await db.query<any>('select count(*)::int n from sales_quotes')).rows[0].n).toBe(before);
 await db.exec("set test.auth_role='authenticated'");
 await expect(revise(s.q,s.l,108,'delete')).rejects.toThrow(/authorized/);
 await db.exec("set test.auth_role='service_role'");
});

it('rolls back the entire copied quote when the requested price cannot be saved',async()=>{
 const s=await source(5),before=(await db.query<any>('select count(*)::int n from sales_quotes')).rows[0].n;
 await db.query('update sales_quote_designs set options_json=$1 where id=$2',[{catalog_product_id:'roller',roller_coupling_count:1.5},s.d]);
 await expect(revise(s.q,s.l,109)).rejects.toThrow();
 expect((await db.query<any>('select count(*)::int n from sales_quotes')).rows[0].n).toBe(before);
 expect((await db.query<any>('select count(*)::int n from sales_quote_revision_requests where request_id=$1',[id(109)])).rows[0].n).toBe(0);
});

it('allows manual zero price with missing grid, fabric and motor selections',async()=>{
 const s=await source(6);
 await db.query("update sales_quote_designs set options_json='{}',quote_v2_price_status='blocked',current_v2_snapshot_id=null where id=$1",[s.d]);
 const r=await revise(s.q,s.l,110);
 expect(r.total).toBe(78);
 const copiedLine=await row('sales_quote_line_items',r.lineItemId);
 const copiedDesign=await row('sales_quote_designs',copiedLine.selected_design_id);
 expect(copiedDesign.unit_price).toBe(39);
 expect(copiedDesign.options_json.manual_merchandise_unit_price).toBe(0);
 expect(r.quote.quote_v2_status).toBe('priced');
});

it('accepts a sent-at locked draft and preserves native V2 origin without copying its signed group',async()=>{
 const s=await source(7);
 await db.query("update sales_quotes set status='draft',signed_at=null,customer_signature=null,quote_v2_status='priced',quote_group_id=$1 where id=$2",[id(900),s.q]);
 await db.query("insert into sales_quote_v2_draft_requests values('original',repeat('0',64),$1,$2,'{}')",[actor,s.q]);
 const r=await revise(s.q,s.l,111);
 expect(r.quote.quote_group_id).toBe(r.quoteId);
 const receipt=await db.query<any>('select actor_id,result from sales_quote_v2_draft_requests where quote_id=$1',[r.quoteId]);
 expect(receipt.rows).toHaveLength(1);expect(receipt.rows[0].result.quoteId).toBe(r.quoteId);
 expect((await row('sales_quotes',s.q)).quote_group_id).toBe(id(900));
});

it('denies browser RPC execution and keeps revision receipts append-only',async()=>{
 await db.exec('set role authenticated');
 await expect(db.query("select create_sales_quote_revision($1,$2,$3,7,'delete',$4,null,null)",[id(1),actor,id(112),id(1001)])).rejects.toThrow(/permission denied/);
 await db.exec('reset role');
 await expect(db.query("update sales_quote_revision_requests set result='{}' where request_id=$1",[id(100)])).rejects.toThrow(/Immutable history/);
});

it.each(['panel','shelf'])('deletes the target but blocks a dependent %s automatic price with its exact reason',async(kind)=>{
 const n=kind==='panel'?8:9,s=await source(n),extra=id(10000+n),designId=id(20000+n);
 await db.query("insert into sales_quote_line_items(id,quote_id,room_name,product_type,quantity,sort_order) values($1,$2,'Dependent','Shades',1,1)",[extra,s.q]);
 const config=kind==='panel'?{norman_order_record_v1:{version:1,ownerLineId:s.l,chargePanel:false,connectedLineIds:[s.l,extra]}}:{accompanying_line_id:s.l,accompanying_product_id:'roman'};
 await db.query("insert into sales_quote_designs(id,line_item_id,variant,unit_price,options_json,quote_v2_selection,quote_v2_price_status,quote_v2_priced_catalog_version) values($1,$2,'A',300,$3,$4,'authoritative','dependent-catalog')",[designId,extra,{...config,authoritative_price_status:'authoritative'},{configuration:config}]);
 await db.query('update sales_quote_line_items set selected_design_id=$1 where id=$2',[designId,extra]);
 const r=await revise(s.q,s.l,120+n,'delete');
 expect(r.quote.quote_v2_status).toBe('blocked');expect(r.quote.quote_v2_catalog_version).toBe('dependent-catalog');
 const {rows}=await db.query<any>('select d.* from sales_quote_designs d join sales_quote_line_items li on li.id=d.line_item_id where li.quote_id=$1 and li.archived_at is null',[r.quoteId]);
 expect(rows).toHaveLength(1);expect(rows[0].unit_price).toBe('300');
 expect(rows[0].quote_v2_price_status).toBe('blocked');expect(rows[0].options_json.authoritative_price_status).toBe('blocked');
 expect(rows[0].options_json.authoritative_price_error).toMatch(kind==='panel'?/connected line was removed/i:/companion product was removed/i);
 expect(await row('sales_quote_designs',designId)).toMatchObject({unit_price:300,quote_v2_price_status:'authoritative'});
});

it('keeps an independent survivor authoritative with final-revision snapshot, surviving catalog identity, and correct known cost',async()=>{
 const s=await source(10),removed=id(10010),removedDesign=id(20010);
 await db.query("update sales_quotes set quote_v2_catalog_version='removed-catalog,saved-catalog',manufacturer_cost=999,product_cost=999,profit_amount=999 where id=$1",[s.q]);
 await db.query("insert into sales_quote_line_items(id,quote_id,room_name,product_type,quantity,sort_order) values($1,$2,'Remove','Shutters',1,1)",[removed,s.q]);
 await db.query("insert into sales_quote_designs(id,line_item_id,variant,unit_price,quote_v2_price_status,quote_v2_priced_catalog_version) values($1,$2,'A',222,'authoritative','removed-catalog')",[removedDesign,removed]);
 await db.query('update sales_quote_line_items set selected_design_id=$1 where id=$2',[removedDesign,removed]);
 const r=await revise(s.q,removed,130,'delete');
 expect(r.quote).toMatchObject({quote_v2_status:'priced',quote_v2_catalog_version:'saved-catalog',total_amount:258,product_cost:40,manufacturer_cost:null,profit_amount:218});
 const {rows}=await db.query<any>('select d.quote_v2_price_status,s.quote_revision,s.quote_id,s.line_item_id,s.design_id,li.id as line_id,d.id as selected_id from sales_quote_line_items li join sales_quote_designs d on d.id=li.selected_design_id join sales_quote_v2_price_snapshots s on s.id=d.current_v2_snapshot_id where li.quote_id=$1 and li.archived_at is null',[r.quoteId]);
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({quote_v2_price_status:'authoritative',quote_revision:r.revision,quote_id:r.quoteId});
 expect(rows[0].line_item_id).toBe(rows[0].line_id);expect(rows[0].design_id).toBe(rows[0].selected_id);
});

it('allows a staff custom price to resolve a blocked dependent after deletion without restoring the archived line',async()=>{
 const previous=(await db.query<any>('select result from sales_quote_revision_requests where request_id=$1',[id(128)])).rows[0].result;
 const active=(await db.query<any>('select li.id,d.variant from sales_quote_line_items li join sales_quote_designs d on d.id=li.selected_design_id where li.quote_id=$1 and li.archived_at is null',[previous.quoteId])).rows[0];
 const r=(await db.query<any>('select set_sales_quote_line_price($1,$2,$3,400,$4,2,$5) as r',[previous.quoteId,active.id,active.variant,actor,id(131)])).rows[0].r;
 expect(r.quoteStatus).toBe('priced');expect(r.unitPrice).toBe(439);expect(r.total).toBe(399);
 const saved=(await db.query<any>('select d.* from sales_quote_line_items li join sales_quote_designs d on d.id=li.selected_design_id where li.id=$1',[active.id])).rows[0];
 expect(saved.quote_v2_price_status).toBe('authoritative');expect(saved.options_json.authoritative_price_error).toBeUndefined();
 expect(saved.options_json.pricing_block_reason).toBeUndefined();expect(saved.options_json.manual_price_override).toBe(true);
 expect((await row('sales_quote_line_items',previous.lineItemId)).archived_at).not.toBeNull();
});

async function acceptedSource(n:number) {
 const s=await source(n), excluded=id(n+10000), included=id(n+11000), includedDesign=id(n+21000);
 await db.query("insert into sales_quote_line_items(id,quote_id,room_name,product_type,quantity,sort_order) values($1,$2,'Deferred','Roman Shades',1,1),($3,$2,'Accepted second','Roman Shades',1,2)",[excluded,s.q,included]);
 await db.query("insert into sales_quote_designs(id,line_item_id,variant,product_type,unit_price,quote_v2_price_status,quote_v2_priced_catalog_version) values($1,$2,'B','Roman Shades',100,'authoritative','second-catalog')",[includedDesign,included]);
 await db.query('update sales_quote_line_items set selected_design_id=$1 where id=$2',[includedDesign,included]);
 const selection={lineQuantities:[
  {lineItemId:s.l,selectedQuantity:1,remainingQuantity:1,originalTotal:278,acceptedTotal:139},
  {lineItemId:excluded,selectedQuantity:0,remainingQuantity:1,originalTotal:100,acceptedTotal:0},
  {lineItemId:included,selectedQuantity:1,remainingQuantity:0,originalTotal:100,acceptedTotal:100},
 ],selectedLineIds:[`${s.l}#2`,included],acceptedTotal:239,originalTotal:478,crmQuoteId:id(n+31000)};
 await db.query('update sales_quotes set quote_v2_accepted_selection=$1,total_amount=239 where id=$2',[selection,s.q]);
 return {...s,excluded,included,selection};
}

it('revises only accepted windows and their selected quantity; manual target saves fixed charges once per accepted shade',async()=>{
 const s=await acceptedSource(20), original=await row('sales_quotes',s.q), originalLine=await row('sales_quote_line_items',s.l);
 const r=await revise(s.q,s.l,140);
 const lines=(await db.query<any>('select * from sales_quote_line_items where quote_id=$1',[r.quoteId])).rows;
 expect(lines).toHaveLength(2);expect(lines.map(l=>l.room_name).sort()).toEqual(['Accepted second','Bedroom']);
 expect(lines.find(l=>l.id===r.lineItemId).quantity).toBe(1);
 const snapshot=(await db.query<any>('select s.* from sales_quote_designs d join sales_quote_v2_price_snapshots s on s.id=d.current_v2_snapshot_id where d.line_item_id=$1',[r.lineItemId])).rows[0];
 expect(snapshot.retail_snapshot.retail).toMatchObject({quantity:1,total:39,customerCharges:{quantity:1,installationTotal:25,shippingTotal:14}});
 expect(r.total).toBe(129);expect(r.quote.product_cost).toBeNull();expect(r.quote.quote_v2_accepted_selection).toBeNull();
 expect(await row('sales_quotes',s.q)).toEqual(original);expect(await row('sales_quote_line_items',s.l)).toEqual(originalLine);
});

it('rejects excluded and archived accepted targets without creating a draft',async()=>{
 const s=await acceptedSource(21),before=(await db.query<any>('select count(*) as count from sales_quotes')).rows[0].count;
 await expect(revise(s.q,s.excluded,141,'delete')).rejects.toThrow(/not part of the accepted quote/);
 await db.query('update sales_quote_line_items set archived_at=now() where id=$1',[s.included]);
 await expect(revise(s.q,s.included,142,'delete')).rejects.toThrow(/not active/);
 expect((await db.query<any>('select count(*) as count from sales_quotes')).rows[0].count).toBe(before);
});

it('delete preserves the accepted subset while invalidating changed-quantity snapshots and full-order costs',async()=>{
 const s=await acceptedSource(22),r=await revise(s.q,s.included,143,'delete');
 const lines=(await db.query<any>('select li.*,d.quote_v2_price_status,d.options_json from sales_quote_line_items li join sales_quote_designs d on d.id=li.selected_design_id where li.quote_id=$1 and li.archived_at is null',[r.quoteId])).rows;
 expect(lines).toHaveLength(1);expect(lines[0]).toMatchObject({room_name:'Bedroom',quantity:1,quote_v2_price_status:'blocked'});
 expect(lines[0].options_json.pricing_block_reason).toMatch(/accepted quantity changed/i);
 expect(r.quote.quote_v2_status).toBe('blocked');expect(r.quote.product_cost).toBeNull();
 expect(r.quote.manufacturer_cost).toBeNull();expect(r.quote.profit_amount).toBeNull();
});

it.each(['duplicate','physical-count','unknown','money'])('rejects malformed accepted projection (%s) before any copy',async(kind)=>{
 const n={duplicate:23,'physical-count':24,unknown:25,money:26}[kind]!,s=await acceptedSource(n);
 if(kind==='duplicate') s.selection.lineQuantities[1]={...s.selection.lineQuantities[0]};
 if(kind==='physical-count') s.selection.selectedLineIds.push(`${s.l}#1`);
 if(kind==='unknown') s.selection.selectedLineIds[0]=id(999999);
 if(kind==='money') s.selection.acceptedTotal+=1;
 await db.query('update sales_quotes set quote_v2_accepted_selection=$1 where id=$2',[s.selection,s.q]);
 const before=(await db.query<any>('select count(*) as count from sales_quotes')).rows[0].count;
 await expect(revise(s.q,s.l,150+n)).rejects.toThrow(/saved accepted window selection is invalid/);
 expect((await db.query<any>('select count(*) as count from sales_quotes')).rows[0].count).toBe(before);
});

it('marks an accepted companion-dependent price incomplete when its companion was deferred',async()=>{
 const s=await acceptedSource(27);
 await db.query("update sales_quote_designs set options_json=$1 where line_item_id=$2",[{accompanying_line_id:s.excluded,authoritative_price_status:'authoritative'},s.included]);
 const r=await revise(s.q,s.l,177);
 const dependent=(await db.query<any>("select d.* from sales_quote_line_items li join sales_quote_designs d on d.id=li.selected_design_id where li.quote_id=$1 and li.room_name='Accepted second'",[r.quoteId])).rows[0];
 expect(dependent.quote_v2_price_status).toBe('blocked');expect(dependent.options_json.authoritative_price_error).toMatch(/connected product was not accepted/i);
 expect(r.quote.quote_v2_status).toBe('blocked');
});
