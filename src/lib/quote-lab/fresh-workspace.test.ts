import { describe, expect, it } from "vitest";
import { createFreshQuoteLabWorkspace } from "./fresh-workspace";

const RUN_ID = "11111111-2222-4333-8444-555555555555";
const CREATED_AT = "2026-07-22T23:00:00.000Z";

describe("fresh Quote Lab workspace factory", () => {
  it("creates one complete empty quote with immutable run identity", () => {
    const fresh = createFreshQuoteLabWorkspace(RUN_ID, CREATED_AT);
    expect(fresh).toMatchObject({
      runId: RUN_ID,
      quoteNumber: `V2-${RUN_ID}`,
      createdAt: CREATED_AT,
      state: {
        lineItems: [],
        designs: [],
        selectedVariantByLine: {},
        quotes: [
          {
            id: "quote-lab-exact",
            quote_number: `V2-${RUN_ID}`,
            status: "draft",
            customer_name: "Fresh V2 Test Quote",
            customer_email: null,
            customer_phone: null,
            customer_address: null,
            total_amount: 0,
            product_cost: 0,
            manufacturer_cost: 0,
            share_token: `quote-lab-only-${RUN_ID}`,
            quote_group_id: `quote-lab-group-${RUN_ID}`,
            created_at: CREATED_AT,
            updated_at: CREATED_AT,
          },
        ],
      },
    });
    const quote = fresh.state.quotes[0] as { installer_notes: string };
    expect(JSON.parse(quote.installer_notes)).toEqual({
      __quoteBuilderNote: `Fresh isolated V2 test run ${RUN_ID} — production writes are disabled.`,
      __quoteLabRunId: RUN_ID,
    });
  });

  it("rejects client-shaped identifiers and invalid timestamps", () => {
    expect(() => createFreshQuoteLabWorkspace("client-selected-id", CREATED_AT)).toThrow(
      "server-generated UUID",
    );
    expect(() => createFreshQuoteLabWorkspace(RUN_ID, "not-a-date")).toThrow(
      "valid creation timestamp",
    );
  });
});
