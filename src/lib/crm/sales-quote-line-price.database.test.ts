import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const id = (n:number) => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let request=100;
beforeAll(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table sales_quotes(id uuid primary key,quote_v2_backend boolean default false,quote_v2_revision bigint default 1,quote_v2_status text,quote_v2_catalog_version text,status text default 'draft',total_amount numeric default 0);
 create table sales_quote_line_items(id uuid primary key,quote_id uuid references sales_quotes,product_type text,quantity int default 1,selected_design_id uuid);
 create table sales_quote_designs(id uuid primary key default gen_random_uuid(),line_item_id uuid references sales_quote_line_items on delete cascade,variant text,product_type text,unit_price numeric default 0,options_json jsonb default '{}',quote_v2_price_status text,quote_v2_selection_fingerprint text,quote_v2_priced_catalog_version text,quote_v2_priced_at timestamptz,current_v2_snapshot_id uuid,unique(line_item_id,variant));
 create table sales_quote_v2_price_snapshots(id uuid primary key default gen_random_uuid(),quote_id uuid,line_item_id uuid,design_id uuid,quote_revision bigint,selection_fingerprint text,catalog_version text,retail_total numeric,internal_landed_cost_total numeric,retail_snapshot jsonb,internal_cost_snapshot jsonb,validation_snapshot jsonb,provenance_snapshot jsonb,created_by uuid);
 create function save_quote_v2_pricing_batch(uuid,bigint,text,uuid,jsonb) returns table(quote_id uuid,new_revision bigint,quote_status text,quote_total numeric,priced_design_count integer,blocked_design_count integer) language plpgsql as $$ begin
 update sales_quote_designs set unit_price=999,quote_v2_price_status='authoritative',quote_v2_priced_catalog_version='catalog',options_json='{}' where line_item_id in(select id from sales_quote_line_items where sales_quote_line_items.quote_id=$1);
 update sales_quotes set quote_v2_revision=quote_v2_revision+1 where id=$1;
 return query select $1,$2+1,'priced'::text,999::numeric,1,0;
 end $$;`);
 await db.exec(readFileSync('supabase/migrations/20260911173000_staff_line_price_overrides.sql','utf8'));
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
