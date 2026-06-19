// End-to-end integration test against a REAL Supabase/Postgres (local or a dev
// project) with migration 20260618000000 applied. It exercises the actual backend
// functions — no mocks — through the full lifecycle:
//   job -> quote -> windows -> A/B/C designs -> pick-one -> totals -> share -> sign -> sold
// and cleans up after itself.
//
// SAFETY: opt-in only. Set all three to run it:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, QUOTE_INTEGRATION_OK=1
// Otherwise it is skipped (so the normal `vitest run` never touches a database).
//   Run:  QUOTE_INTEGRATION_OK=1 npx vitest run src/lib/crm/quote-builder.integration.test.ts

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createCrmJob, createCrmQuote } from "./backend";
import {
  createLineItem,
  upsertDesign,
  selectDesign,
  updateLineItem,
  loadQuoteBuilder,
} from "./quote-builder";
import { acceptPublicQuote, ensureShareToken, loadPublicQuoteByToken } from "./public-quote";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && key && process.env.QUOTE_INTEGRATION_OK === "1");

const actor = { email: "__integration_test__@805shutters.com" };
const MARK = "__INTEGRATION_TEST__";

describe.skipIf(!enabled)("quote builder integration (real DB)", () => {
  let supabase: SupabaseClient;
  let jobId = "";
  let quoteId = "";

  beforeAll(async () => {
    supabase = createClient(url as string, key as string, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const job = await createCrmJob(
      supabase,
      { customer_name: MARK, phone: "8055550000", product_interest: "shutters" },
      actor,
    );
    jobId = job.id;
    const quote = await createCrmQuote(supabase, { job_id: jobId, customer_name: MARK, status: "draft" }, actor);
    quoteId = quote.id;
  });

  afterAll(async () => {
    if (jobId) await supabase.from("crm_jobs").delete().eq("id", jobId); // cascades quote/items/designs/bookkeeping
    await supabase.from("crm_customers").delete().ilike("display_name", MARK);
  });

  it("bills pick-one (selected design only), reacts to quantity, and signs to sold", async () => {
    // One window
    let built = await createLineItem(supabase, { quote_id: quoteId, room: "Living Room", width_in: 24, height_in: 36, quantity: 1 }, actor);
    const lineItemId = built.lineItems[0].id;

    // Two alternatives: A = honeycomb $212, B = a pricier roller option
    built = await upsertDesign(supabase, { line_item_id: lineItemId, label: "A", product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell" }, actor);
    built = await upsertDesign(supabase, { line_item_id: lineItemId, label: "B", product_id: "roller", fabric: "Callie" }, actor);

    const li = built.lineItems[0];
    const designA = li.designs.find((d) => d.label === "A")!;
    const designB = li.designs.find((d) => d.label === "B")!;
    expect(designA.price_status).toBe("ok");
    expect(designA.unit_price).toBe(212);
    expect(designB.price_status).toBe("ok");

    // Pick A — total must be A only, NOT A + B
    built = await selectDesign(supabase, lineItemId, designA.id, actor);
    expect(built.quote_total).toBe(212);
    expect(built.quote_total).not.toBe(212 + designB.unit_price);

    // Quantity 2 -> total doubles
    built = await updateLineItem(supabase, lineItemId, { quantity: 2 }, actor);
    expect(built.quote_total).toBe(424);

    // Bookkeeping entry stays in sync
    const { data: entry } = await supabase
      .from("crm_quote_bookkeeping_entries")
      .select("total_amount")
      .eq("quote_id", quoteId)
      .maybeSingle();
    expect(Number(entry?.total_amount)).toBe(424);

    // Share link + public projection
    const share = await ensureShareToken(supabase, quoteId, actor);
    expect(share.token.length).toBeGreaterThan(10);
    const publicQuote = await loadPublicQuoteByToken(supabase, share.token);
    expect(publicQuote?.total).toBe(424);
    expect(publicQuote?.lines[0].productName).toContain("Honeycomb");
    expect(publicQuote?.signed).toBe(false);

    // Customer signs -> sold
    const result = await acceptPublicQuote(supabase, share.token, { printedName: "Test Customer" });
    expect(result.ok).toBe(true);

    const after = await loadQuoteBuilder(supabase, quoteId);
    expect(after.status).toBe("sold");
    expect(after.signed_at).toBeTruthy();

    // Signing again is idempotent
    const again = await acceptPublicQuote(supabase, share.token, { printedName: "Test Customer" });
    expect(again.alreadySigned).toBe(true);
  });

  it("rejects an out-of-range design with an error status (no silent wrong price)", async () => {
    const built = await createLineItem(supabase, { quote_id: quoteId, room: "Huge Window", width_in: 200, height_in: 36, quantity: 1 }, actor);
    const li = built.lineItems.find((l) => l.room === "Huge Window")!;
    const out = await upsertDesign(supabase, { line_item_id: li.id, label: "A", product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell" }, actor);
    const design = out.lineItems.find((l) => l.id === li.id)!.designs[0];
    expect(design.price_status).toBe("WIDTH_EXCEEDS_MAX");
    expect(design.unit_price).toBe(0);
  });
});
