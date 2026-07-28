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
    const result = await acceptPublicQuote(supabase, share.token, { printedName: "Test Customer", notify: false });
    expect(result.ok).toBe(true);

    const after = await loadQuoteBuilder(supabase, quoteId);
    expect(after.status).toBe("sold");
    expect(after.signed_at).toBeTruthy();

    const { data: contract } = await supabase
      .from("crm_customer_contracts")
      .select("quote_id, job_id, share_token, status, signed_at, total_amount")
      .eq("external_source", "crm_quote")
      .eq("external_id", `contract:${quoteId}`)
      .maybeSingle();
    expect(contract?.quote_id).toBe(quoteId);
    expect(contract?.job_id).toBe(jobId);
    expect(contract?.share_token).toBe(share.token);
    expect(contract?.status).toBe("sold");
    expect(contract?.signed_at).toBeTruthy();
    expect(Number(contract?.total_amount)).toBe(424);

    // Signed quote reaches the bookkeeping ledger with the sold total + sold date
    const { data: bkEntry } = await supabase
      .from("crm_quote_bookkeeping_entries")
      .select("quote_id, job_id, sold_date, total_amount")
      .eq("quote_id", quoteId)
      .maybeSingle();
    expect(bkEntry?.quote_id).toBe(quoteId);
    expect(bkEntry?.job_id).toBe(jobId);
    expect(bkEntry?.sold_date).toBeTruthy();
    expect(Number(bkEntry?.total_amount)).toBe(424);

    // Parent job moved to "sold"
    const { data: soldJob } = await supabase.from("crm_jobs").select("status").eq("id", jobId).maybeSingle();
    expect(soldJob?.status).toBe("sold");

    // Signing again is idempotent
    const again = await acceptPublicQuote(supabase, share.token, { printedName: "Test Customer", notify: false });
    expect(again.alreadySigned).toBe(true);
  });

  it("atomically partitions a partial acceptance into current and future CRM contracts/jobs", async () => {
    const partialJob = await createCrmJob(
      supabase,
      { customer_name: `${MARK} PARTIAL`, phone: "8055550001", product_interest: "shutters" },
      actor,
    );
    try {
      const partialQuote = await createCrmQuote(
        supabase,
        { job_id: partialJob.id, customer_name: `${MARK} PARTIAL`, status: "draft" },
        actor,
      );
      let built = await createLineItem(
        supabase,
        { quote_id: partialQuote.id, room: "Accepted", width_in: 24, height_in: 36, quantity: 1 },
        actor,
      );
      const acceptedLineId = built.lineItems[0].id;
      built = await upsertDesign(
        supabase,
        { line_item_id: acceptedLineId, label: "A", product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell" },
        actor,
      );
      built = await createLineItem(
        supabase,
        { quote_id: partialQuote.id, room: "Future", width_in: 30, height_in: 48, quantity: 1 },
        actor,
      );
      const futureLineId = built.lineItems.find((line) => line.room === "Future")!.id;
      await upsertDesign(
        supabase,
        { line_item_id: futureLineId, label: "A", product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell" },
        actor,
      );
      const share = await ensureShareToken(supabase, partialQuote.id, actor);
      const result = await acceptPublicQuote(supabase, share.token, {
        printedName: "Partial Customer",
        selectedLineIds: [acceptedLineId],
        notify: false,
      });
      expect(result.alreadySigned).toBe(false);
      expect(result.futureQuoteId).toBeTruthy();
      expect(result.futureJobId).toBeTruthy();

      const [current, future] = await Promise.all([
        loadQuoteBuilder(supabase, partialQuote.id),
        loadQuoteBuilder(supabase, result.futureQuoteId!),
      ]);
      expect(current.lineItems.map((line) => line.id)).toEqual([acceptedLineId]);
      expect(future.lineItems.map((line) => line.id)).toEqual([futureLineId]);
      expect(current.quote_total).toBe(212);
      expect(future.quote_total).toBeGreaterThan(0);
      expect(current.deposit_required).toBe(0);
      expect(current.balance_due).toBe(212);
      expect(future.job_id).toBe(result.futureJobId);
      expect(future.meta).toMatchObject({
        partial_acceptance: { role: "future", source_signed_quote_id: partialQuote.id },
      });

      const { data: jobs } = await supabase
        .from("crm_jobs")
        .select("id,status,estimated_total")
        .in("id", [partialJob.id, result.futureJobId!]);
      expect(jobs?.find((job) => job.id === partialJob.id)).toMatchObject({ status: "sold", estimated_total: 212 });
      expect(Number(jobs?.find((job) => job.id === result.futureJobId!)?.estimated_total)).toBe(future.quote_total);

      const { data: contracts } = await supabase
        .from("crm_customer_contracts")
        .select("quote_id,job_id,status,total_amount,meta")
        .in("quote_id", [partialQuote.id, result.futureQuoteId!]);
      expect(contracts?.find((contract) => contract.quote_id === partialQuote.id)).toMatchObject({
        job_id: partialJob.id,
        status: "sold",
        total_amount: 212,
      });
      expect(contracts?.find((contract) => contract.quote_id === result.futureQuoteId)).toMatchObject({
        job_id: result.futureJobId,
        status: "future",
        total_amount: future.quote_total,
      });

      const { data: ledger } = await supabase
        .from("crm_quote_bookkeeping_entries")
        .select("total_amount")
        .eq("quote_id", partialQuote.id)
        .maybeSingle();
      expect(Number(ledger?.total_amount)).toBe(212);
    } finally {
      await supabase.from("crm_jobs").delete().eq("id", partialJob.id);
      await supabase.from("crm_jobs").delete().eq("source", "partial_acceptance_future").eq("customer_name", `${MARK} PARTIAL`);
      await supabase.from("crm_customers").delete().ilike("display_name", `${MARK} PARTIAL`);
    }
  });

  it("seeds design A from seed_product_id (room-button quick-add) and auto-selects it", async () => {
    const built = await createLineItem(
      supabase,
      { quote_id: quoteId, room: "Office", width_in: 24, height_in: 36, quantity: 1, seed_product_id: "honeycomb" },
      actor,
    );
    const li = built.lineItems.find((l) => l.room === "Office")!;
    expect(li.designs).toHaveLength(1);
    expect(li.designs[0].label).toBe("A");
    expect(li.designs[0].product_id).toBe("honeycomb");
    // The seeded design is auto-selected so the new window bills immediately.
    expect(li.selected_design_id).toBe(li.designs[0].id);
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
