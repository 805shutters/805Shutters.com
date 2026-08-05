import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { repriceExactQuoteBuilderForQuoteLabPreview } from "@/lib/quote-lab/exact-backend";
import { priceDesign } from "@/lib/quote/pricing";
import { resolveManufacturerOptionsUiRoute } from "@mts/components/crm/quote-builder/DesignCard";

const products = [
  ["polar_tension_shade", "Tension Shades"],
] as const;

describe("reusable manual-quote-only product state", () => {
  it.each(products)(
    "retains %s but never calculates a price or customer-ready snapshot",
    (productId, productType) => {
      expect(
        resolveManufacturerOptionsUiRoute(
          { supplier: "Polar" } as SalesQuoteDesign,
          productType,
          { catalog_product_id: productId },
        ),
      ).toEqual({
        status: "manual_quote",
        productId,
        manufacturer: "Polar",
      });
      const direct = priceDesign({
        productId,
        widthInches: 48,
        heightInches: 96,
      });
      expect(direct).toMatchObject({
        ok: false,
        code: "MANUAL_PRICE_REQUIRED",
      });

      const line = {
        id: `${productId}-line`,
        quote_id: "manual-quote",
        room_name: "Manual review",
        product_type: productType,
        width_whole: 48,
        width_fraction: "0",
        height_whole: 96,
        height_fraction: "0",
        quantity: 3,
        sort_order: 0,
        created_at: "2026-07-28T00:00:00.000Z",
      } as SalesQuoteLineItem;
      const design = {
        id: `${productId}-design`,
        line_item_id: line.id,
        variant: "A",
        product_type: productType,
        supplier: "Polar",
        unit_price: 9999,
        options_json: {
          quote_v2_backend: true,
          catalog_product_id: productId,
          quote_lab_product_id: productId,
          manual_review_note: "Retain this exact staff selection",
        },
      } as unknown as SalesQuoteDesign;
      const quote = repriceExactQuoteBuilderForQuoteLabPreview({
        lines: [line],
        designs: [design],
        selectedVariantByLine: { [line.id]: "A" },
      });
      if (!("backend" in quote) || quote.backend !== "v2") {
        throw new Error("Expected authoritative V2 result.");
      }
      expect(quote.total).toBe(0);
      expect(quote.sendability.sendable).toBe(false);
      expect(quote.customerQuote).toMatchObject({
        total: 0,
        sendable: false,
      });
      expect(quote.designs[0]).toMatchObject({
        selection: {
          productId,
          quantity: 3,
          configuration: {
            manual_review_note: "Retain this exact staff selection",
          },
        },
        result: {
          ok: false,
          productStatus: "manual_quote_required",
        },
        snapshot: null,
      });
    },
  );
});
