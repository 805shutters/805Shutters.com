import { describe, expect, it } from "vitest";
import {
  crmQuoteSourceSalesQuoteId,
  resolveCrmQuoteBuilderRoute,
} from "./quoteImportRouting";

describe("historical quote V2 routing", () => {
  it("opens V2 only when the linked source quote exists in local sales_quotes", () => {
    expect(
      resolveCrmQuoteBuilderRoute(
        {
          id: "crm-quote",
          meta: { mts_quote_id: "local-sales-quote" },
        },
        new Set(["local-sales-quote"]),
      ),
    ).toEqual({
      kind: "v2",
      crmQuoteId: "crm-quote",
      salesQuoteId: "local-sales-quote",
    });
  });

  it("fails closed when an imported CRM quote points at a foreign source UUID", () => {
    expect(
      resolveCrmQuoteBuilderRoute(
        {
          id: "crm-quote",
          meta: { mts_quote_id: "foreign-mts-quote" },
        },
        new Set(["different-local-sales-quote"]),
      ),
    ).toEqual({
      kind: "legacy_unimported",
      crmQuoteId: "crm-quote",
      sourceSystemQuoteId: "foreign-mts-quote",
      reason: "dangling_link",
    });
  });

  it("fails closed when a CRM quote has no structural V2 link", () => {
    expect(
      resolveCrmQuoteBuilderRoute(
        {
          id: "crm-quote",
          meta: {},
        },
        new Set(),
      ),
    ).toEqual({
      kind: "legacy_unimported",
      crmQuoteId: "crm-quote",
      sourceSystemQuoteId: null,
      reason: "missing_link",
    });
  });

  it("normalizes source IDs and supports the explicit sales_quote_id key", () => {
    expect(
      crmQuoteSourceSalesQuoteId({
        id: "crm-quote",
        meta: { sales_quote_id: "  sales-quote  " },
      }),
    ).toBe("sales-quote");
  });

  it("uses the typed imported target without confusing it with source provenance", () => {
    const quote = {
      id: "crm-quote",
      meta: {
        target_sales_quote_id: " local-sales-quote ",
        mts_quote_id: "foreign-mts-quote",
      },
      external_id: "quote:foreign-mts-quote",
    };

    expect(crmQuoteSourceSalesQuoteId(quote)).toBe("local-sales-quote");
    expect(
      resolveCrmQuoteBuilderRoute(quote, new Set(["local-sales-quote"])),
    ).toEqual({
      kind: "v2",
      crmQuoteId: "crm-quote",
      salesQuoteId: "local-sales-quote",
    });
  });

  it("fails closed when two untyped metadata links disagree", () => {
    expect(
      resolveCrmQuoteBuilderRoute(
        {
          id: "crm-quote",
          meta: {
            mts_quote_id: "foreign-mts-quote",
            sales_quote_id: "local-sales-quote",
          },
        },
        new Set(["local-sales-quote"]),
      ),
    ).toEqual({
      kind: "legacy_unimported",
      crmQuoteId: "crm-quote",
      sourceSystemQuoteId: "local-sales-quote",
      reason: "conflicting_links",
    });
  });

  it("uses a matching external import identity only when it exists locally", () => {
    expect(
      resolveCrmQuoteBuilderRoute(
        {
          id: "crm-quote",
          meta: {},
          external_id: "quote:local-sales-quote",
        },
        new Set(["local-sales-quote"]),
      ),
    ).toEqual({
      kind: "v2",
      crmQuoteId: "crm-quote",
      salesQuoteId: "local-sales-quote",
    });
  });
});
