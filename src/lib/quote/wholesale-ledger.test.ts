import { describe, expect, it } from "vitest";
import {
  lookupWholesaleLedgerCost,
  wholesaleLedgerProgramStatus,
} from "./wholesale-ledger";
import { getProduct, getProgram } from "./catalog";
import { priceDesign } from "./pricing";

function requireCost(result: ReturnType<typeof lookupWholesaleLedgerCost>) {
  if (!result.ok) throw new Error(`${result.code}: ${result.error}`);
  return result;
}

describe("canonical wholesale cost ledger", () => {
  it.each([
    ["minimum", 24, 36, 63.6, 24, 36],
    ["middle", 60, 72, 177.6, 60, 72],
    ["maximum", 96, 144, 450, 96, 144],
  ])(
    "uses the same Norman dealer-factor grid at the %s size",
    (_label, width, height, cost, matchedWidth, matchedHeight) => {
      const result = requireCost(
        lookupWholesaleLedgerCost({
          productId: "honeycomb",
          programId: "honeycomb_9_16in_cordless_single_cell",
          widthInches: width,
          heightInches: height,
        }),
      );
      expect(result).toMatchObject({
        basis: "dealer_factor",
        dealerFactor: 0.3,
        wholesaleBase: cost,
        wholesaleUnitCost: cost,
        matchedWidth,
        matchedHeight,
        provenanceStatus: "complete",
        source: {
          sourceId: "norman-retail-guide-2026-07",
          revision: "2026-07",
          effectiveDate: "2026-07-01",
          pages: [10],
        },
      });
    },
  );

  it("rounds dimensions up to the next canonical source cell", () => {
    const result = requireCost(
      lookupWholesaleLedgerCost({
        productId: "honeycomb",
        programId: "honeycomb_9_16in_cordless_single_cell",
        widthInches: 25,
        heightInches: 37,
        quantity: 2,
      }),
    );
    expect(result.matchedWidth).toBe(30);
    expect(result.matchedHeight).toBe(42);
    expect(result.wholesaleBase).toBe(81);
    expect(result.wholesaleTotal).toBe(162);
  });

  it("is the wholesale source used by the actual canonical quote calculator", () => {
    const ledger = requireCost(
      lookupWholesaleLedgerCost({
        productId: "honeycomb",
        programId: "honeycomb_9_16in_cordless_single_cell",
        widthInches: 60,
        heightInches: 72,
        quantity: 3,
      }),
    );
    const priced = priceDesign({
      productId: "honeycomb",
      programId: "honeycomb_9_16in_cordless_single_cell",
      widthInches: 60,
      heightInches: 72,
      quantity: 3,
    });
    if (!priced.ok) throw new Error(`${priced.code}: ${priced.error}`);
    expect(priced.wholesaleBase).toBe(ledger.wholesaleBase);
    expect(priced.wholesaleUnitPrice).toBe(ledger.wholesaleUnitCost);
    expect(priced.wholesaleTotal).toBe(ledger.wholesaleTotal);
  });

  it("retains Lotus dealer-net cost while explicitly blocking customer retail", () => {
    const result = requireCost(
      lookupWholesaleLedgerCost({
        productId: "lotus_mini_blinds",
        programId: "lotus_amx_1in_aluminum_custom",
        widthInches: 17,
        heightInches: 36,
      }),
    );
    expect(result).toMatchObject({
      basis: "dealer_net_grid",
      wholesaleBase: 21.48,
      provenanceStatus: "effective_date_missing",
      productStatus: "restriction_source_incomplete",
      customerPriceEligible: false,
      source: {
        sourceId: "lotus-west-a26-v1",
        revision: "West A26.v1",
        effectiveDate: null,
      },
    });
  });

  it("fails closed for unavailable cells, out-of-range sizes, unsupported products, and unverified programs", () => {
    expect(
      lookupWholesaleLedgerCost({
        productId: "lotus_mini_blinds",
        programId: "lotus_amx_1in_aluminum_custom",
        widthInches: 95,
        heightInches: 108,
      }),
    ).toMatchObject({ ok: false, code: "NA_CELL" });
    expect(
      lookupWholesaleLedgerCost({
        productId: "honeycomb",
        programId: "honeycomb_9_16in_cordless_single_cell",
        widthInches: 97,
        heightInches: 144,
      }),
    ).toMatchObject({ ok: false, code: "WIDTH_EXCEEDS_MAX" });
    expect(
      lookupWholesaleLedgerCost({
        productId: "not-a-manufacturer",
        programId: "not-a-program",
        widthInches: 24,
        heightInches: 36,
      }),
    ).toMatchObject({ ok: false, code: "PRODUCT_NOT_FOUND" });
    expect(
      lookupWholesaleLedgerCost({
        productId: "onyx_shutters",
        programId: "poly_composite",
        widthInches: 24,
        heightInches: 36,
      }),
    ).toMatchObject({
      ok: true,
      basis: "dealer_net_sqft",
      billableSqft: 8,
      wholesaleBase: 96,
      wholesaleUnitCost: 96,
      wholesaleTotal: 96,
      provenanceStatus: "provisional",
    });
    expect(
      lookupWholesaleLedgerCost({
        productId: "honeycomb",
        programId: "honeycomb_9_16in_cordless_single_cell",
        widthInches: 24,
        heightInches: 36,
        quantity: 0,
      }),
    ).toMatchObject({ ok: false, code: "INVALID_QUANTITY" });
  });

  it("reports every program's cost coverage and provenance without fabricating missing cells", () => {
    const product = getProduct("lotus_mini_blinds");
    if (!product) throw new Error("Expected Lotus Mini Blinds.");
    const program = getProgram(product, "lotus_amx_1in_aluminum_custom");
    if (!program) throw new Error("Expected Lotus AMX program.");
    const status = wholesaleLedgerProgramStatus(product, program);
    expect(status.coverage).toBe("partial");
    expect(status.costCellCount).toBeGreaterThan(0);
    expect(status.unavailableCellCount).toBeGreaterThan(0);
    expect(status.provenanceStatus).toBe("effective_date_missing");
    expect(status.customerPriceEligible).toBe(false);
  });
});
