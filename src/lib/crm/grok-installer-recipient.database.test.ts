import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("routes only unattempted, unleased packets to Grok and preserves delivery evidence", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table crm_installer_delivery_outbox (
        id int, recipient text default 'mtsinstallations@gmail.com'
          constraint crm_installer_delivery_outbox_recipient_check
          check (recipient in ('mtsagent101@gmail.com','mtsinstallations@gmail.com')),
        payload jsonb, idempotency_key text, status text,
        first_send_attempt_at timestamptz, provider_message_id text,
        lease_token uuid, updated_at timestamptz
      );
      insert into crm_installer_delivery_outbox values
        (1,'mtsinstallations@gmail.com','{"old":true}','pending-key','pending',null,null,null,now()),
        (2,'mtsagent101@gmail.com','{"old":true}','retry-key','retry',null,null,null,now()),
        (3,'mtsinstallations@gmail.com','{"old":true}','uncertain-key','uncertain',now(),null,null,now()),
        (4,'mtsinstallations@gmail.com','{"old":true}','sent-key','sent',now(),'receipt',null,now()),
        (5,'mtsinstallations@gmail.com','{"old":true}','leased-key','pending',null,null,'00000000-0000-4000-8000-000000000001',now()),
        (6,'mtsinstallations@gmail.com','{"old":true}','accepted-key','accepted',now(),'accepted-receipt',null,now());
    `);
    const before = (await db.query("select * from crm_installer_delivery_outbox where id >= 3 order by id")).rows;
    await db.exec(readFileSync("supabase/migrations/20261018190429_grok_installer_packet_recipient.sql", "utf8"));
    expect((await db.query("select id,recipient,payload,idempotency_key from crm_installer_delivery_outbox where id < 3 order by id")).rows).toEqual([
      { id: 1, recipient: "wcbot@mail.grokbot.com", payload: null, idempotency_key: null },
      { id: 2, recipient: "wcbot@mail.grokbot.com", payload: null, idempotency_key: null },
    ]);
    expect((await db.query("select * from crm_installer_delivery_outbox where id >= 3 order by id")).rows).toEqual(before);
    await db.exec("insert into crm_installer_delivery_outbox(id) values(7)");
    expect((await db.query("select recipient from crm_installer_delivery_outbox where id=7")).rows).toEqual([{ recipient: "wcbot@mail.grokbot.com" }]);
    await expect(db.exec("insert into crm_installer_delivery_outbox(id,recipient) values(8,'unknown@example.com')")).rejects.toThrow();
  } finally {
    await db.close();
  }
});
