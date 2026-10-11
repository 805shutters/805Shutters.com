import { describe,it,expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../../../supabase/migrations/20261011014441_voice_805_supabase_call_center.sql',import.meta.url),'utf8');
describe('805 phone PostgreSQL state and caller lookup',()=>{
 it('enforces roles, preserves compare-and-swap updates and never discloses finance to lookup',async()=>{
  const db=new PGlite();
  try {
   await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create table crm_customers(id uuid primary key,display_name text,phone text,meta jsonb default '{}');
   create table crm_jobs(id uuid primary key,phone text,status text,meta jsonb default '{}');
   create table crm_quotes(id uuid primary key,job_id uuid,status text,balance_due numeric);
   grant select on crm_customers,crm_jobs,crm_quotes to service_role;`);
   await db.exec(sql);
   await db.exec(`insert into crm_customers(id,display_name,phone) values ('00000000-0000-4000-8000-000000000001','Alex Test','(805) 555-0101');
   insert into crm_jobs values ('00000000-0000-4000-8000-000000000002','+18055550101','ordered','{}');
   insert into crm_quotes values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','received',12345);
   set role service_role;`);
   const query=async(s:string)=> (await db.query<{result:unknown}>(s)).rows[0]?.result;
   expect(await query(`select voice_805_commit('pilot',0,'{"entities":{},"events":{},"inbound":{}}') result`)).toBe(true);
   expect(await query(`select voice_805_commit('pilot',0,'{}') result`)).toBe(false);
   const found=await query(`select voice_805_caller_context('+18055550101') result`) as Record<string,unknown>;
   expect(found.match).toBe('matched');expect(found.first_name).toBe('Alex');expect(found.statuses).toEqual(['received']);expect(JSON.stringify(found)).not.toContain('12345');
   expect((await query(`select voice_805_caller_context('+18055550999') result`) as {match:string}).match).toBe('unmatched');
   await db.exec(`reset role; insert into crm_quotes values ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002','sent',0); set role service_role;`);
   expect((await query(`select voice_805_caller_context('+18055550101') result`) as {statuses:string[]}).statuses).toEqual(['ambiguous']);
   await db.exec(`reset role; insert into crm_customers(id,display_name,phone) values ('00000000-0000-4000-8000-000000000004','Shared Number','8055550101'); set role service_role;`);
   expect(await query(`select voice_805_caller_context('+18055550101') result`)).toEqual({match:'ambiguous'});
   await db.exec('reset role; set role anon');
   await expect(db.query('select * from voice_805_state')).rejects.toThrow(/permission denied/);
   await expect(db.query(`select voice_805_caller_context('+18055550101')`)).rejects.toThrow(/permission denied/);
   await db.exec('reset role; set role authenticated');
   await expect(db.query('select * from voice_805_state')).rejects.toThrow(/permission denied/);
   await expect(db.query(`select voice_805_commit('pilot',1,'{}')`)).rejects.toThrow(/permission denied/);
  }finally{await db.close();}
 },20000);
});
