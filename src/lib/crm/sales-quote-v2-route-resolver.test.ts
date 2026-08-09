import { describe, expect, it } from "vitest";
import {
  classifySalesQuoteV2Route,
  salesQuoteV2RouteCandidate,
} from "./sales-quote-v2-route-resolver";

const CRM_ID = "11111111-1111-4111-8111-111111111111";
const SALES_ID = "22222222-2222-4222-8222-222222222222";

describe("server-side historical quote V2 route resolver", () => {
  it("uses an explicit typed target without confusing it with source provenance", () => {
    expect(
      salesQuoteV2RouteCandidate({
        id: CRM_ID,
        external_id: `quote:33333333-3333-4333-8333-333333333333`,
        meta: {
          target_sales_quote_id: SALES_ID,
          mts_quote_id: "33333333-3333-4333-8333-333333333333",
        },
      }),
    ).toEqual({ status: "candidate", salesQuoteId: SALES_ID });
  });

  it("quarantines conflicting untyped metadata identities", () => {
    expect(
      salesQuoteV2RouteCandidate({
        id: CRM_ID,
        external_id: "quote:33333333-3333-4333-8333-333333333333",
        meta: { sales_quote_id: SALES_ID },
      }),
    ).toEqual({
      status: "malformed",
      salesQuoteId: null,
      reason: "conflicting_target_identity",
    });
  });

  it("requires a real local sales quote instead of trusting a foreign UUID", () => {
    expect(
      classifySalesQuoteV2Route({
        crmQuote: { id: CRM_ID, meta: { mts_quote_id: SALES_ID }, quote_total: 900 },
        salesQuote: null,
        lines: [],
        designs: [],
      }),
    ).toEqual({
      status: "legacy_import_required",
      crmQuoteId: CRM_ID,
      salesQuoteId: SALES_ID,
      reason: "target_not_found",
    });
  });

  it("does not treat a priced historical header with zero local lines as converted", () => {
    expect(
      classifySalesQuoteV2Route({
        crmQuote: { id: CRM_ID, meta: { sales_quote_id: SALES_ID }, quote_total: 900 },
        salesQuote: { id: SALES_ID, quote_v2_backend: false, status: "draft" },
        lines: [],
        designs: [],
      }),
    ).toMatchObject({
      status: "legacy_import_required",
      reason: "target_structure_empty",
    });
  });

  it("accepts a real zero-line draft only when the source total is also zero", () => {
    expect(
      classifySalesQuoteV2Route({
        crmQuote: { id: CRM_ID, meta: { sales_quote_id: SALES_ID }, quote_total: 0 },
        salesQuote: {
          id: SALES_ID,
          quote_v2_backend: false,
          quote_v2_status: "legacy",
          status: "draft",
        },
        lines: [],
        designs: [],
      }),
    ).toEqual({
      status: "ready",
      crmQuoteId: CRM_ID,
      salesQuoteId: SALES_ID,
      lineCount: 0,
      designCount: 0,
      quoteV2Backend: false,
      quoteV2Status: "legacy",
      quoteStatus: "draft",
      historicalPriceLock: null,
    });
  });

  it("carries the original total as a display-only lock for a converted quote", () => {
    expect(
      classifySalesQuoteV2Route({
        crmQuote: { id: CRM_ID, meta: { sales_quote_id: SALES_ID }, quote_total: 3499.1 },
        salesQuote: {
          id: SALES_ID,
          quote_v2_backend: true,
          quote_v2_status: "stale",
          status: "draft",
        },
        lines: [{ id: "line-a", quote_id: SALES_ID, selected_design_id: "design-a" }],
        designs: [{ id: "design-a", line_item_id: "line-a" }],
      }),
    ).toMatchObject({
      status: "ready",
      historicalPriceLock: { total: 3499.1, designUnitPrices: {} },
    });
  });

  it("rejects a selected design pointer that belongs to another line", () => {
    expect(
      classifySalesQuoteV2Route({
        crmQuote: { id: CRM_ID, meta: { sales_quote_id: SALES_ID }, quote_total: 100 },
        salesQuote: { id: SALES_ID, quote_v2_backend: true, status: "draft" },
        lines: [
          { id: "line-a", quote_id: SALES_ID, selected_design_id: "design-b" },
          { id: "line-b", quote_id: SALES_ID, selected_design_id: null },
        ],
        designs: [{ id: "design-b", line_item_id: "line-b" }],
      }),
    ).toMatchObject({
      status: "malformed",
      reason: "target_structure_invalid",
    });
  });

  it("enforces the 40-line structural ceiling", () => {
    expect(
      classifySalesQuoteV2Route({
        crmQuote: { id: CRM_ID, meta: { sales_quote_id: SALES_ID }, quote_total: 100 },
        salesQuote: { id: SALES_ID, quote_v2_backend: true, status: "draft" },
        lines: Array.from({ length: 41 }, (_, index) => ({
          id: `line-${index}`,
          quote_id: SALES_ID,
          selected_design_id: null,
        })),
        designs: [],
      }),
    ).toMatchObject({
      status: "malformed",
      reason: "target_line_limit_exceeded",
    });
  });
});
