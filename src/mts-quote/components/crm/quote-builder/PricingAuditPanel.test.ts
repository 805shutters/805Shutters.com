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
  it("shows the canonical ledger cell and provenance when no protected V2 snapshot exists", () => {
    const html = renderToStaticMarkup(createElement(PricingAuditPanel, {
      productType: "Honeycomb Shades",
      supplier: "Norman",
      programName: '9/16" Cordless Single Cell',
      widthIn: 25,
      heightIn: 37,
      rawSqft: null,
      billableSqft: null,
      quantity: 2,
      savedUnitPrice: 270,
      options: {
        base_price: 270,
        pricing_method: "grid",
      },
      currentRetailPerSqft: null,
      wholesaleRate: null,
      tariffPercent: 0,
      surcharges: [],
      authoritativeWholesaleCost: null,
      canonicalWholesaleCost: {
        ok: true,
        productId: "honeycomb",
        productName: "Portrait Honeycomb Shades",
        manufacturer: "Norman",
        programId: "honeycomb_9_16in_cordless_single_cell",
        programName: '9/16" Cordless Single Cell',
        basis: "dealer_factor",
        dealerFactor: 0.3,
        measuredWidth: 25,
        measuredHeight: 37,
        matchedWidth: 30,
        matchedHeight: 42,
        wholesaleBase: 81,
        quantity: 2,
        wholesaleUnitCost: 81,
        wholesaleTotal: 162,
        source: {
          sourceId: "norman-retail-guide-2026-07",
          manufacturer: "Norman",
          fileName: "2026Jul Retail Price Guide (1).pdf",
          title: "2026 Retail Guide",
          revision: "2026-07",
          effectiveDate: "2026-07-01",
          effectiveDateEvidence: "Cover: Effective July 1st, 2026",
          sha256: "ae102c19",
          pages: [10],
        },
        provenanceStatus: "complete",
        productStatus: "documented_limited",
        customerPriceEligible: true,
      },
    }));

    expect(html).toContain("Why this price?");
    expect(html).toContain('30&quot; W x 42&quot; H');
    expect(html).toContain("2026 Retail Guide · 2026-07");
    expect(html).toContain("2026-07-01");
    expect(html).toContain("Source pages");
    expect(html).toContain("Source hash");
    expect(html).toContain("$81");
    expect(html).toContain("$162");
    expect(html).toContain("Wholesale add-ons");
    expect(html).toContain("protected price snapshot required");
    expect(html).toContain("Known base cost per window");
    expect(html).toContain("Landed cost unresolved");
    expect(html).toContain("Gross margin");
    expect(html).toMatch(/Gross profit dollars[\s\S]*?—/);
    expect(html).not.toContain("70.0%");
  });

  it("itemizes the exact Norman Roller base, fabric, accessories, and AutoWand prices", () => {
    const retailComponents = [
      {
        id: "base-grid",
        category: "base_grid",
        label: "Cordless Fabric Price Group 1 base grid",
        status: "priced",
        basis: "grid_cell",
        catalogAmount: 298,
        customerAmount: 223.5,
      },
      {
        id: "fabric-upgrade",
        category: "fabric_upgrade",
        label: "Amelia Price Group 2 grid upgrade",
        status: "priced",
        basis: "grid_delta",
        catalogAmount: 30,
        customerAmount: 22.5,
      },
      {
        id: "top-treatment",
        category: "accessory",
        label: "No top treatment",
        status: "included",
        basis: "included",
        catalogAmount: 0,
        customerAmount: 0,
      },
      {
        id: "hem-bar",
        category: "accessory",
        label: "Fabric-covered hem bar",
        status: "included",
        basis: "included",
        catalogAmount: 0,
        customerAmount: 0,
      },
      {
        id: "tube",
        category: "accessory",
        label: '2" (52mm) tube',
        status: "included",
        basis: "included",
        catalogAmount: 0,
        customerAmount: 0,
      },
      {
        id: "autowand",
        category: "operating_system",
        label: "AutoWand operating system",
        status: "priced",
        basis: "flat",
        catalogAmount: 166,
        customerAmount: 124.5,
      },
    ];
    const wholesaleComponents: PricingAuditWholesaleCost["wholesaleComponents"] =
      retailComponents.map((component) => ({
        id: component.id,
        category: component.category as NonNullable<
          PricingAuditWholesaleCost["wholesaleComponents"]
        >[number]["category"],
        label: component.label,
        status: component.status,
        basis: component.basis,
        catalogAmount: component.catalogAmount,
        amount:
          component.category === "base_grid"
            ? 89.4
            : component.category === "fabric_upgrade"
              ? 9
              : component.category === "operating_system"
                ? 49.8
                : 0,
      }));

    const html = renderToStaticMarkup(createElement(PricingAuditPanel, {
      productType: "Roller Shades",
      supplier: "Norman",
      programName: "Cordless Fabric - Price Group 1",
      widthIn: 30,
      heightIn: 48,
      rawSqft: 10,
      billableSqft: 10,
      quantity: 1,
      savedUnitPrice: 370.5,
      options: {
        authoritative_price_breakdown: {
          ok: true,
          programName: "Cordless Fabric - Price Group 2",
          components: retailComponents,
          unitPrice: 370.5,
          discountPercent: 0,
          discountAmount: 0,
          onceTotal: 0,
          total: 370.5,
        },
      },
      currentRetailPerSqft: null,
      wholesaleRate: null,
      tariffPercent: 0,
      surcharges: [],
      authoritativeWholesaleCost: {
        ok: true,
        basis: "catalog_factor",
        effectiveDealerFactor: 0.33,
        matchedWidth: 30,
        matchedHeight: 48,
        wholesaleBase: 89.4,
        wholesaleAddOns: [],
        wholesaleComponents,
        wholesaleUnitCost: 148.2,
        quantity: 1,
        wholesaleTotal: 148.2,
        freightAllocated: 25,
        oversizeAllocated: 0,
        landedCostTotal: 173.2,
        freightStatus: "published",
      },
    }));

    expect(html).toContain("Base $223.50 · Fabric $22.50 · Accessories $0 · Operating $124.50");
    expect(html).toContain("Cordless Fabric - Price Group 2");
    expect(html).not.toContain("Program / material</span><span class=\"text-right text-slate-900\">Cordless Fabric - Price Group 1");
    expect(html).toContain("Actual selected grid");
    expect(html).toContain("$328");
    expect(html).toContain("Amelia Price Group 2 grid upgrade");
    expect(html).toContain("No top treatment");
    expect(html).toContain("Included");
    expect(html).toContain("AutoWand operating system");
    expect(html).toContain("Manufacturer suggested retail x 0.330");
    expect(highlightedWholesaleValues(html)).toContain("$89.40");
    expect(highlightedWholesaleValues(html)).toContain("$9");
    expect(highlightedWholesaleValues(html)).toContain("$49.80");
    expect(highlightedWholesaleValues(html)).not.toContain("$223.50");
    expect(highlightedWholesaleValues(html)).not.toContain("$22.50");
    expect(highlightedWholesaleValues(html)).not.toContain("$124.50");
    expect(html).not.toContain("Stored price mismatch");
  });

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

  it("shows the exact three-decimal slow-schedule portal factor", () => {
    const html = renderCost({
      ok: true,
      basis: "catalog_factor",
      effectiveDealerFactor: 0.297,
      dealerPolicyId: "norman-805-dealer-policy-2026-07-21",
      dealerPolicyFixtureId: "norman-805-live-portal-2026-07-21",
      matchedWidth: 24,
      matchedHeight: 36,
      wholesaleBase: 75.44,
      wholesaleAddOns: [],
      wholesaleUnitCost: 75.44,
      quantity: 1,
      wholesaleTotal: 75.44,
    }, 254, 254);

    expect(html).toContain("Manufacturer suggested retail x 0.297");
    expect(html).not.toContain("x 0.30");
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

  it("highlights quantity, freight, oversize, and processing cost without marking retail red", () => {
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
      processingFeeAllocated: 7.7,
      landedCostTotal: 472.7,
      freightStatus: "published",
    }, 600, 600);

    expect(highlightedWholesaleValues(html)).toEqual([
      "$180",
      "$0",
      "$180",
      "$360",
      "$25",
      "$80",
      "$7.70",
      "$472.70",
    ]);
    expect(html).toContain("Allocated processing fee");
    expect(highlightedWholesaleValues(html)).not.toContain("$1,200");
    expect(html).toContain("Retail line revenue");
    expect(html).toContain("Gross profit dollars");
  });
});
