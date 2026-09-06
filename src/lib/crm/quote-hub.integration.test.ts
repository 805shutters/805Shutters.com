import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { hubOffer } from "./quote-hub-model";
import { DEFAULT_ADJUSTMENTS } from "./quote-money";

const enabled = process.env.QUOTE_HUB_DB_TEST === "1";
const container = "805-quote-hub-test-db";
function sql(input: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const id = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const offer = hubOffer(
  {
    subtotal: 1000,
    total: 1100,
    allPriced: true,
    sourceAdjustment: 0,
    adjustments: { ...DEFAULT_ADJUSTMENTS, taxPercent: 10, depositPercent: 50 },
  },
  10,
);
function seed(n = 1) {
  return `insert into crm_jobs(id,customer_name,email) values('${id(n + 100)}','Sample Customer','sample@example.com');
insert into crm_quotes(id,job_id,quote_number,status,quote_total,discount,tax,deposit_required,balance_due,customer_email,share_token,external_source,external_id,meta)
values('${id(n)}','${id(n + 100)}','805-TEST-${n}','sent',1100,0,100,550,550,'sample@example.com','token-${n}','legacy','source-${n}','{"mts_quote_id":"${id(900)}","legacy_quote_system":"mts_sales_quote","adjustments":{"taxPercent":10,"depositPercent":50},"contract_snapshot":{"old":true}}');
insert into crm_quote_line_items(id,quote_id,room,quantity,sort_order)values('${id(n + 200)}','${id(n)}','Living room',1,0);
insert into crm_quote_designs(id,line_item_id,label,sort_order,product_id,unit_price,wholesale_unit_price,price_breakdown,price_status,surcharges)values('${id(n + 300)}','${id(n + 200)}','A',0,'shutters',1000,325,'{"source":"original-guide","onceTotal":0}','ok','[{"id":"unchanged"}]');
update crm_quote_line_items set selected_design_id='${id(n + 300)}' where id='${id(n + 200)}';
insert into crm_quote_hub_messages(id,quote_id,actor_email,action,status,recipient,body,payload) values('${id(n + 400)}','${id(n)}','805@805shutters.com','savings','prepared','sample@example.com','Reviewed message',jsonb_build_object('offer','${JSON.stringify(offer)}'::jsonb,'offerId','${id(n + 500)}','offerToken','offer-token-${n}','fingerprint',quote_hub_fingerprint('${id(n)}')));`;
}
describe.skipIf(!enabled)("quote hub isolated Postgres migration", () => {
  beforeAll(() => {
    const exists = sql(
      "select count(*) from information_schema.tables where table_schema='public' and table_name='crm_quote_hub_messages'",
    );
    if (exists === "0") {
      sql(readFileSync("e2e/fixtures/quote-hub-parent-schema.sql", "utf8"));
      sql(
        readFileSync(
          "supabase/migrations/20260906195837_quote_communication_hub.sql",
          "utf8",
        ),
      );
    }
  });
  it("copies a complete offer atomically without changing original price or snapshots", () => {
    const out = sql(
      `begin;${seed()}select claim_quote_hub_message('${id(401)}')->>'claimed';select quote_total from crm_quotes where id='${id(1)}';select quote_total from crm_quotes where id='${id(501)}';select d.unit_price||':'||d.wholesale_unit_price||':'||(d.price_breakdown->>'source') from crm_quote_designs d join crm_quote_line_items l on l.selected_design_id=d.id where l.quote_id='${id(501)}';select meta ? 'mts_quote_id' from crm_quotes where id='${id(501)}';select meta->>'communication_hub_managed' from crm_quotes where id='${id(1)}';rollback;`,
    );
    expect(out).toContain("true\n1100\n990");
    expect(out).toContain("1000:325:original-guide");
    expect(out).toContain("f\ntrue");
  });
  it("claims exactly once and confirms both message and offer as Sent", () => {
    const out = sql(
      `begin;${seed(2)}select claim_quote_hub_message('${id(402)}')->>'claimed';select claim_quote_hub_message('${id(402)}')->>'claimed';select finish_quote_hub_message('${id(402)}','provider-2');select status from crm_quote_hub_messages where id='${id(402)}';select status from crm_quotes where id='${id(502)}';rollback;`,
    );
    expect(out).toContain("true\nfalse");
    expect(out).toContain("sent\nsent");
  });
  it("rejects price edits after preview and rolls back the offer", () => {
    expect(() =>
      sql(
        `begin;${seed(3)}update crm_quote_designs set unit_price=900 where id='${id(303)}';select claim_quote_hub_message('${id(403)}');rollback;`,
      ),
    ).toThrow(/Quote changed after preview/);
    expect(sql(`select count(*) from crm_quotes where id='${id(503)}'`)).toBe(
      "0",
    );
  });
  it("rejects signed quotes", () => {
    expect(() =>
      sql(
        `begin;${seed(4)}update crm_quotes set signed_at=now() where id='${id(4)}';select claim_quote_hub_message('${id(404)}');rollback;`,
      ),
    ).toThrow(/Only unsigned/);
  });
  it("rejects a sold sibling before making an offer", () => {
    expect(() =>
      sql(
        `begin;${seed(6)}update crm_quotes set quote_group_id='${id(990)}' where id='${id(6)}';insert into crm_quotes(id,quote_group_id,status)values('${id(991)}','${id(990)}','sold');select claim_quote_hub_message('${id(406)}');rollback;`,
      ),
    ).toThrow(/already sold/);
  });
  it("blocks another message while delivery remains uncertain", () => {
    expect(() =>
      sql(
        `begin;${seed(7)}insert into crm_quote_hub_messages(quote_id,actor_email,action,status)values('${id(7)}','805@805shutters.com','personal','unknown');select claim_quote_hub_message('${id(407)}');rollback;`,
      ),
    ).toThrow(/awaiting delivery confirmation/);
  });
  it("denies public and authenticated clients table and RPC access", () => {
    expect(() =>
      sql("set role authenticated;select * from crm_quote_hub_messages;"),
    ).toThrow(/permission denied/);
    expect(() =>
      sql(`set role anon;select claim_quote_hub_message('${id(401)}');`),
    ).toThrow(/permission denied/);
    expect(
      sql(
        "select relrowsecurity from pg_class where relname='crm_quote_hub_messages'",
      ),
    ).toBe("t");
  });
  it("allows the backend role to run the exact guarded workflow", () => {
    const out = sql(
      `begin;${seed(5)}set local role service_role;select claim_quote_hub_message('${id(405)}')->>'claimed';rollback;`,
    );
    expect(out).toContain("true");
  });
});
