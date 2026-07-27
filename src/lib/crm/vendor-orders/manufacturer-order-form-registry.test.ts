import { describe, expect, it } from "vitest";

import {
  buildAgenticOrderManifest,
  manufacturerOrderFormRegistry,
  resolveManufacturerOrderForm,
} from "./manufacturer-order-form-registry";

describe("manufacturer ordering-form registry", () => {
  it("contains every supported manufacturer product/program", () => {
    const registry = manufacturerOrderFormRegistry();
    expect(registry.manufacturers.onyx).toHaveLength(8);
    expect(registry.manufacturers.norman).toHaveLength(19);
    expect(registry.manufacturers.lotus).toHaveLength(5);
    expect(registry.manufacturers.polar).toHaveLength(11);
  });

  it.each([
    [{ manufacturer: "Onyx", product_id: "onyx_shutters", program_id: "secamore" }, "onyx:secamore"],
    [{ manufacturer: "Norman", product_id: "roller" }, "norman:roller"],
    [{ manufacturer: "Lotus", product_id: "lotus_vertical_blinds" }, "lotus:lotus_vertical_blinds"],
    [{ manufacturer: "Polar", product_id: "polar", program_id: "premium_pro_awning" }, "polar:premium_pro_awning"],
  ])("routes an exact product to its dedicated form", (values, routingKey) => {
    expect(resolveManufacturerOrderForm(values)?.routing_key).toBe(routingKey);
  });

  it("fans a mixed contract into one cover plus one dedicated page per line", () => {
    const manifest = buildAgenticOrderManifest({
      customerId: "customer-1",
      quoteId: "805-0001",
      measureStatus: "measure_required",
      technicalMeasureSubmitted: true,
      lines: [
        { id: "line-1", values: { manufacturer: "Onyx", product_id: "onyx_shutters", program_id: "vinyl" } },
        { id: "line-2", values: { manufacturer: "Norman", product_id: "honeycomb" } },
        { id: "line-3", values: { manufacturer: "Lotus", product_id: "lotus_roller_shades" } },
        { id: "line-4", values: { manufacturer: "Polar", product_id: "polar", program_id: "titan_patio" } },
      ],
    });

    expect(manifest.coverPage.authority).toBe("submitted_technical_measure_over_signed_contract");
    expect(manifest.lineItemPages.map((line) => line.routingKey)).toEqual([
      "onyx:vinyl",
      "norman:honeycomb",
      "lotus:lotus_roller_shades",
      "polar:titan_patio",
    ]);
    expect(manifest.lineItemPages).toHaveLength(4);
  });

  it("blocks a line rather than guessing when exact product routing is missing", () => {
    const manifest = buildAgenticOrderManifest({
      customerId: "customer-1",
      quoteId: "805-0002",
      measureStatus: "no_measure",
      technicalMeasureSubmitted: false,
      lines: [{ id: "line-1", values: { manufacturer: "Norman", product_id: "mystery product" } }],
    });
    expect(manifest.releaseStatus).toBe("order_review_required");
    expect(manifest.lineItemPages[0]).toMatchObject({
      routingKey: null,
      status: "order_review_required",
    });
  });
});
