import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { it, expect } from 'vitest';
it('native destination migration preserves attempted payloads and only regenerates never-attempted packets',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create table crm_installer_delivery_outbox(id int,recipient text default 'mtsagent101@gmail.com' constraint crm_installer_delivery_outbox_recipient_check check(recipient='mtsagent101@gmail.com'),payload jsonb,idempotency_key text,status text,first_send_attempt_at timestamptz,provider_message_id text,lease_token uuid,updated_at timestamptz);
  insert into crm_installer_delivery_outbox values
  (1,'mtsagent101@gmail.com','{"to":"mtsagent101@gmail.com"}','never-attempted','pending',null,null,null,now()),
  (2,'mtsagent101@gmail.com','{"to":"mtsagent101@gmail.com"}','uncertain-key','uncertain',now(),null,null,now()),
  (3,'mtsagent101@gmail.com','{"to":"mtsagent101@gmail.com"}','accepted-key','sent',now(),'provider-proof',null,now());`);
  await db.exec(readFileSync('supabase/migrations/20261010160000_native_mts_installer_recipient.sql','utf8'));
  const rows=(await db.query<{id:number;recipient:string;idempotency_key:string|null;provider_message_id:string|null}>('select id,recipient,idempotency_key,provider_message_id from crm_installer_delivery_outbox order by id')).rows;
  expect(rows).toEqual([
   {id:1,recipient:'mtsinstallations@gmail.com',idempotency_key:null,provider_message_id:null},
   {id:2,recipient:'mtsagent101@gmail.com',idempotency_key:'uncertain-key',provider_message_id:null},
   {id:3,recipient:'mtsagent101@gmail.com',idempotency_key:'accepted-key',provider_message_id:'provider-proof'}]);
  await db.exec('insert into crm_installer_delivery_outbox(id) values(4)');
  expect((await db.query<{recipient:string}>('select recipient from crm_installer_delivery_outbox where id=4')).rows[0].recipient).toBe('mtsinstallations@gmail.com');
 }finally{await db.close();}
});
