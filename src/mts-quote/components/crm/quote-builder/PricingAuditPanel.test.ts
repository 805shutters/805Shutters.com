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
    quantity: cost.quantity,
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

function highlightedWholesaleValues(html: string): string[] {
  return Array.from(
    html.matchAll(/data-wholesale-cost-value="true"[^>]*>([^<]*)</g),
    (match) => match[1],
  );
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
    expect(highlightedWholesaleValues(html)).toEqual(["$89.40", "$0", "$89.40"]);
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
    expect(highlightedWholesaleValues(html)).toEqual(["$35.02", "$0", "$35.02"]);
    expect(html).toContain("Customer retail is blocked");
    expect(html).toContain("Incomplete - customer retail undefined");
    expect(html).not.toContain("Gross profit dollars");
    expect(html).not.toContain("Stored price mismatch");
    expect(html).not.toContain("No source-backed wholesale cost");
  });

  it("uses the authoritative motor surcharge and landed cost without a false mismatch", () => {
    const html = renderToStaticMarkup(createElement(PricingAuditPanel, {
      productType: "Roller Shades",
      supplier: "Norman",
      programName: "Cordless Fabric - Price Group 2",
      widthIn: 30,
      heightIn: 48,
      rawSqft: 10,
      billableSqft: 10,
      quantity: 1,
      savedUnitPrice: 757.5,
      options: {
        authoritative_price_breakdown: {
          ok: true,
          base: 246,
          surchargeLines: [{
            id: "motor:automate_home:motor_rechargeable_battery_pack",
            label: "Motor (Rechargeable Battery Pack)",
            amount: 511.5,
            kind: "flat",
          }],
          unitPrice: 757.5,
          discountPercent: 0,
          discountAmount: 0,
          onceTotal: 0,
          total: 757.5,
        },
      },
      currentRetailPerSqft: null,
      wholesaleRate: null,
      tariffPercent: 0,
      surcharges: [],
      authoritativeWholesaleCost: {
        ok: true,
        basis: "catalog_factor",
        matchedWidth: 30,
        matchedHeight: 48,
        wholesaleBase: 98.4,
        wholesaleAddOns: [{
          id: "motor:automate_home:motor_rechargeable_battery_pack",
          label: "Motor (Rechargeable Battery Pack)",
          amount: 204.6,
        }],
        wholesaleUnitCost: 303,
        quantity: 1,
        wholesaleTotal: 303,
        freightAllocated: 25,
        oversizeAllocated: 0,
        landedCostTotal: 328,
        freightStatus: "published",
      },
    }));

    expect(html).toContain("Motor (Rechargeable Battery Pack)");
    expect(html).toContain("$511.50");
    expect(html).toContain("$204.60");
    expect(html).toContain("Allocated freight");
    expect(html).toContain("Landed line cost");
    expect(highlightedWholesaleValues(html)).toEqual([
      "$98.40",
      "$204.60",
      "$204.60",
      "$303",
      "$25",
      "$328",
    ]);
    expect(html).not.toContain("Stored price mismatch");
    expect(html).not.toContain("Surcharge mismatch");
  });

  it("highlights quantity line cost and oversize allocation without marking retail red", () => {
    const html = renderCost({
      ok: true,
      basis: "catalog_factor",
      matchedWidth: 96,
      matchedHeight: 84,
      wholesaleBase: 180,
      wholesaleAddOns: [],
      wholesaleUnitCost: 180,
      quantity: 2,
      wholesaleTotal: 360,
      freightAllocated: 25,
      oversizeAllocated: 80,
      landedCostTotal: 465,
      freightStatus: "published",
    }, 600, 600);

    expect(highlightedWholesaleValues(html)).toEqual([
      "$180",
      "$0",
      "$180",
      "$360",
      "$25",
      "$80",
      "$465",
    ]);
    expect(highlightedWholesaleValues(html)).not.toContain("$1,200");
    expect(html).toContain("Retail line revenue");
    expect(html).toContain("Gross profit dollars");
  });
});
