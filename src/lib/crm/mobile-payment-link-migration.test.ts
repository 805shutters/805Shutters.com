import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

const sql=readFileSync(new URL("../../../supabase/migrations/20260731193000_add_mobile_payment_link_send_requests.sql",import.meta.url),"utf8");

describe("mobile payment-link request ledger migration",()=>{
  it("uses a unique request key and exact quote/job identity",()=>{
    expect(sql).toMatch(/idempotency_key uuid primary key/i);
    expect(sql).toMatch(/quote_id uuid not null references public\.crm_quotes/i);
    expect(sql).toMatch(/job_id uuid not null references public\.crm_jobs/i);
  });

  it("records truthful terminal and uncertain provider states without a send scheduler",()=>{
    expect(sql).toContain("'sending', 'accepted', 'failed', 'unknown'");
    expect(sql).toContain("provider_message_id text");
    expect(sql).not.toMatch(/pg_cron|net\.http|scheduled_for/i);
  });
});
