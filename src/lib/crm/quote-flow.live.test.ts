// LIVE front-to-back validation of the entire quote -> contract -> sign -> sold
// -> bookkeeping chain. Opt-in only:
//   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + E2E_LIVE_OK=1
// Otherwise skipped (normal `vitest run` never touches the database).
//
// SAFETY: point this at a STAGING/dev Supabase project, not production. It SENDS
// REAL email + SMS and creates a real (cleaned-up) job + bookkeeping entry, and
// flips a real job to "sold". Defaults to a clearly-test customer so an accidental
// run can't text/email a real person — override with real PII ONLY for a deliberate
// live validation against a non-production project.
//   E2E_LIVE_OK=1 npx vitest run src/lib/crm/quote-flow.live.test.ts
//   E2E_CUSTOMER_NAME / E2E_CUSTOMER_PHONE / E2E_CUSTOMER_EMAIL

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createCrmJob, createCrmQuote } from "./backend";
import {
  createLineItem,
  updateLineItem,
  upsertDesign,
  selectDesign,
  loadQuoteBuilder,
} from "./quote-builder";
import {
  ensureShareToken,
  sendQuoteToCustomer,
  acceptPublicQuote,
  loadPublicQuoteByToken,
} from "./public-quote";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const liveRequested = process.env.E2E_LIVE_OK === "1";
const missingRequiredEnv = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["SUPABASE_SERVICE_ROLE_KEY", key],
].flatMap(([name, value]) => (value ? [] : [name]));

const CUSTOMER = {
  name: process.env.E2E_CUSTOMER_NAME ?? "E2E Test Customer",
  phone: process.env.E2E_CUSTOMER_PHONE ?? "8055550000",
  email: process.env.E2E_CUSTOMER_EMAIL ?? "e2e-test@805shutters.com",
};
const actor = { email: "e2e@805shutters.com" };
const MARK = "__E2E_LIVE_TEST__";
const REQUIRED_TABLES = [
  "crm_jobs",
  "crm_quotes",
  "crm_quote_line_items",
  "crm_quote_designs",
  "crm_quote_bookkeeping_entries",
  "crm_customer_contracts",
  "crm_customers",
] as const;

describe.skipIf(!liveRequested)("quote flow (LIVE front-to-back)", () => {
  let supabase: SupabaseClient;
  let jobId = "";
  let quoteId = "";

  beforeAll(async () => {
    if (missingRequiredEnv.length) {
      throw new Error(`E2E_LIVE_OK=1 but required env is missing: ${missingRequiredEnv.join(", ")}`);
    }

    supabase = createClient(url as string, key as string, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    for (const table of REQUIRED_TABLES) {
      const { error } = await supabase.from(table).select("*").limit(1);
      if (error) {
        throw new Error(`E2E Supabase project is missing required table ${table}: ${error.message}`);
      }
    }

    const job = await createCrmJob(
      supabase,
      {
        customer_name: `${CUSTOMER.name} ${MARK}`,
        phone: CUSTOMER.phone,
        email: CUSTOMER.email,
        city: "Ventura",
        product_interest: "Shutters",
        sales_owner: "Mike",
        source: "e2e",
        notes: MARK,
      },
      actor,
    );
    jobId = job.id;
    const quote = await createCrmQuote(
      supabase,
      { job_id: jobId, customer_name: `${CUSTOMER.name} ${MARK}`, status: "draft" },
      actor,
    );
    quoteId = quote.id;
  });

  afterAll(async () => {
    if (jobId) await supabase.from("crm_jobs").delete().eq("id", jobId); // cascades quote/items/designs/bookkeeping
    if (supabase) await supabase.from("crm_customers").delete().ilike("display_name", `%${MARK}%`);
  });

  it(
    "builds (shutter A/B/C + discounted roller), sends, signs, and lands in bookkeeping",
    async () => {
      // 1. Shutter window -> auto A/B/C material-tier variants (all priced)
      let built = await createLineItem(
        supabase,
        { quote_id: quoteId, room: "Living Room", width_in: 36, height_in: 60, quantity: 1, seed_product_id: "norman_shutters" },
        actor,
      );
      const shutter = built.lineItems.find((l) => l.room === "Living Room")!;
      expect(shutter.designs.length).toBeGreaterThanOrEqual(3); // A Composite / B Hardwood / C Moisture-proof
      expect(shutter.designs.every((d) => d.price_status === "ok")).toBe(true);
      // Bill the Hardwood (B) tier
      const variantB = shutter.designs.find((d) => d.label === "B")!;
      built = await selectDesign(supabase, shutter.id, variantB.id, actor);

      // 2. Roller window with a 10% per-line discount
      built = await createLineItem(
        supabase,
        { quote_id: quoteId, room: "Bedroom", width_in: 30, height_in: 54, quantity: 2 },
        actor,
      );
      const roller = built.lineItems.find((l) => l.room === "Bedroom")!;
      await upsertDesign(
        supabase,
        { line_item_id: roller.id, label: "A", product_id: "roller", fabric: "Callie" },
        actor,
      );
      built = await updateLineItem(supabase, roller.id, { discount_percent: 10 }, actor);
      const discounted = built.lineItems.find((l) => l.room === "Bedroom")!.designs[0];
      expect(discounted.price_status).toBe("ok");

      // 3. Share + send the contract (REAL email + SMS to the customer)
      const share = await ensureShareToken(supabase, quoteId, actor);
      const sent = await sendQuoteToCustomer(supabase, quoteId, actor, { email: true, sms: true });
      expect(sent.url).toBeTruthy();

      // 4. Customer signs -> sold
      const result = await acceptPublicQuote(supabase, share.token, { printedName: CUSTOMER.name });
      expect(result.ok).toBe(true);

      // 5. Verify the full chain
      const after = await loadQuoteBuilder(supabase, quoteId);
      expect(after.status).toBe("sold");
      expect(after.signed_at).toBeTruthy();
      expect(after.quote_total).toBeGreaterThan(0);

      const { data: soldJob } = await supabase.from("crm_jobs").select("status").eq("id", jobId).maybeSingle();
      expect(soldJob?.status).toBe("sold");

      const { data: bk } = await supabase
        .from("crm_quote_bookkeeping_entries")
        .select("quote_id, job_id, sold_date, total_amount")
        .eq("quote_id", quoteId)
        .maybeSingle();
      expect(bk?.quote_id).toBe(quoteId);
      expect(bk?.job_id).toBe(jobId);
      expect(bk?.sold_date).toBeTruthy();
      expect(Number(bk?.total_amount)).toBe(after.quote_total);

      const { data: contract } = await supabase
        .from("crm_customer_contracts")
        .select("status, signed_at, total_amount")
        .eq("external_id", `contract:${quoteId}`)
        .maybeSingle();
      expect(contract?.status).toBe("sold");
      expect(contract?.signed_at).toBeTruthy();

      const pub = await loadPublicQuoteByToken(supabase, share.token);
      expect(pub?.signed).toBe(true);
      expect((pub?.lines.length ?? 0)).toBeGreaterThanOrEqual(2);

      // eslint-disable-next-line no-console
      console.log(
        `\n✅ Front-to-back PASS.\n` +
          `   Contract URL: ${sent.url}\n` +
          `   Send: email=${sent.email.sent ? "sent" : `skipped (${sent.email.skipped})`}, ` +
          `sms=${sent.sms.sent ? "sent" : `skipped (${sent.sms.skipped})`}\n` +
          `   Sold total: $${after.quote_total}\n`,
      );
    },
    60000,
  );
});
