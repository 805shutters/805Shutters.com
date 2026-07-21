import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PricingAuditPanel,
  type PricingAuditWholesaleCost,
} from "./PricingAuditPanel";

function renderCost(cost: PricingAuditWholesaleCost, savedUnitPrice: number, basePrice: number) {
  return renderToStaticMarkup(createElement(PricingAuditPanel, {
    productType: "Roller Shades",
    supplier: cost.basis === "dealer_net" ? "Lotus" : "Norman",
    programName: "Source program",
    widthIn: 30,
    heightIn: 48,
    rawSqft: 10,
    billableSqft: 10,
    quantity: 1,
    savedUnitPrice,
    options: {
      base_price: basePrice,
      pricing_method: "grid",
      ...(cost.basis === "dealer_net"
        ? {
            authoritative_price_breakdown: {
              ok: false,
              code: "CUSTOMER_RETAIL_UNDEFINED",
              error: "Lotus provides dealer-net pricing, but no customer retail policy is defined.",
            },
          }
        : { authoritative_price_breakdown: { ok: true, base: basePrice } }),
    },
    currentRetailPerSqft: null,
    wholesaleRate: null,
    tariffPercent: 0,
    surcharges: [],
    authoritativeWholesaleCost: cost,
  }));
}

describe("PricingAuditPanel authoritative wholesale cost", () => {
  it("shows Norman retail-factor cost instead of the missing-cost warning", () => {
    const html = renderCost({
      ok: true,
      basis: "catalog_factor",
      matchedWidth: 30,
      matchedHeight: 48,
      wholesaleBase: 89.4,
      wholesaleAddOns: [],
      wholesaleUnitCost: 89.4,
      quantity: 1,
      wholesaleTotal: 89.4,
    }, 298, 298);

    expect(html).toContain("Retail x 0.30");
    expect(html).toContain("$89.40");
    expect(html).not.toContain("No source-backed wholesale cost");
  });

  it("shows Lotus dealer-net cost without inventing customer retail", () => {
    const html = renderCost({
      ok: true,
      basis: "dealer_net",
      matchedWidth: 30,
      matchedHeight: 48,
      wholesaleBase: 35.02,
      wholesaleAddOns: [],
      wholesaleUnitCost: 35.02,
      quantity: 1,
      wholesaleTotal: 35.02,
    }, 0, 0);

    expect(html).toContain("Dealer-net source grid");
    expect(html).toContain("$35.02");
    expect(html).toContain("Customer retail is blocked");
    expect(html).toContain("Incomplete - customer retail undefined");
    expect(html).not.toContain("Gross profit dollars");
    expect(html).not.toContain("Stored price mismatch");
    expect(html).not.toContain("No source-backed wholesale cost");
  });
});
