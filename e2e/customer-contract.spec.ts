// Browser E2E: the customer-facing contract flow.
// Seeds a realistic quote via the backend (against the project the service key
// points at), then drives the real contract page: view -> Purchase Some (pick a
// subset) -> sign -> confirmation, and verifies the sign -> sold -> bookkeeping
// chain in the DB. Cleans up the seeded job afterwards.
//
// SAFETY: run against a STAGING project + STAGING app. The seed uses a test
// customer; signing flips a real (staging) job to sold.
//   E2E_BASE_URL=https://staging.805shutters.com npx playwright test customer-contract

import { test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createCrmJob, createCrmQuote } from "@/lib/crm/backend";
import { createLineItem, upsertDesign } from "@/lib/crm/quote-builder";
import { ensureShareToken } from "@/lib/crm/public-quote";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && key);
const SKIP_REASON = "Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (point at a STAGING project)";
const actor = { email: "e2e@805shutters.com" };
const MARK = "__E2E_PLAYWRIGHT__";

test.describe.configure({ mode: "serial" });

test.describe("customer contract flow (browser)", () => {
  let supabase!: ReturnType<typeof createClient>;
  let jobId = "";
  let contractUrl = "";

  test.beforeAll(async () => {
    if (!enabled) return;
    supabase = createClient(url as string, key as string, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const job = await createCrmJob(
      supabase,
      {
        customer_name: `E2E Customer ${MARK}`,
        phone: "8055550000",
        email: "e2e-test@805shutters.com",
        product_interest: "Shutters",
        source: "e2e",
        notes: MARK,
      },
      actor,
    );
    jobId = job.id;
    const quote = await createCrmQuote(
      supabase,
      { job_id: jobId, customer_name: `E2E Customer ${MARK}`, status: "draft" },
      actor,
    );
    // Two priced windows so the "Purchase All / Some" toggle appears.
    await createLineItem(
      supabase,
      { quote_id: quote.id, room: "Living Room", width_in: 36, height_in: 60, quantity: 1, seed_product_id: "norman_shutters" },
      actor,
    );
    const built = await createLineItem(
      supabase,
      { quote_id: quote.id, room: "Bedroom", width_in: 30, height_in: 54, quantity: 1 },
      actor,
    );
    await upsertDesign(
      supabase,
      { line_item_id: built.lineItems[0].id, label: "A", product_id: "roller", fabric: "Callie" },
      actor,
    );
    const share = await ensureShareToken(supabase, quote.id, actor);
    contractUrl = `${process.env.E2E_BASE_URL ?? "http://localhost:3000"}/quote/${share.token}`;
  });

  test.afterAll(async () => {
    if (enabled && jobId) await supabase.from("crm_jobs").delete().eq("id", jobId); // cascades
  });

  test("customer views the contract, picks a subset, then signs", async ({ page }) => {
    test.skip(!enabled, SKIP_REASON);
    await page.goto(contractUrl);
    await test.expect(page.getByRole("heading", { name: "Your Quote" })).toBeVisible();
    await test.expect(page.getByText("Living Room").first()).toBeVisible();

    // Two lines => "Purchase: All / Some" toggle. Switch to Some -> checkboxes + prompt.
    await page.getByText("Some", { exact: true }).click();
    await test.expect(page.getByText(/please select the line items you wish to purchase/i)).toBeVisible();

    // Switch back to All and sign the full quote.
    await page.getByText("All", { exact: true }).click();

    await page.getByPlaceholder("Jane Smith").fill("E2E Tester");
    await page.getByRole("checkbox", { name: /I authorize 805 Shutters/i }).check();
    await page.getByRole("button", { name: /sign & approve/i }).click();

    await test.expect(page.getByText(/your order is confirmed/i)).toBeVisible();
  });

  test("signed quote is sold and lands in bookkeeping", async () => {
    test.skip(!enabled, SKIP_REASON);
    const quote = (
      await supabase.from("crm_quotes").select("status, signed_at").like("customer_name", `%${MARK}%`).maybeSingle()
    ).data as { status: string; signed_at: string | null } | null;
    test.expect(quote?.status).toBe("sold");
    test.expect(quote?.signed_at).toBeTruthy();

    const bk = (
      await supabase.from("crm_quote_bookkeeping_entries").select("total_amount").like("customer_name", `%${MARK}%`).maybeSingle()
    ).data as { total_amount: number | string } | null;
    test.expect(Number(bk?.total_amount)).toBeGreaterThan(0);
  });
});
