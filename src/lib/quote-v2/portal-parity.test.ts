import { describe, expect, it } from "vitest";
import type { SelectionContext } from "./core";
import { priceQuoteV2Selection } from "./engine";

/**
 * Read-only dealer-portal fixture captured 2026-07-20 from Norman draft TEST,
 * line RR002. The draft was not checked out or submitted.
 */
const NORMAN_PORTAL_RR002 = Object.freeze({
  product: "Roller Shades",
  application: "Single",
  mount: "Inside Mount",
  lift: "Continuous Cord Loop",
  collection: "Amelia RD",
  colorCode: "F1774",
  colorName: "Mist Gray",
  widthInches: 36,
  heightInches: 60,
  baseDealerNet: 115.2,
  racewayDealerNet: 20.1,
  subtotalDealerNet: 135.3,
});

describe("current Norman dealer-portal parity fixtures", () => {
  it("matches RR002 base and Raceway dealer net to the cent", () => {
    const selection: SelectionContext = {
      manufacturerId: "norman",
      productId: "roller",
      programId: "roller_cordless_fabric_price_group_2_pg2",
      catalogVersion: "805-v2-norman-roller-2026-08-01",
      // The source appendix activates 8/1. Preview parity is intentionally
      // date-injected and cannot activate the production catalog early.
      catalogAsOf: "2026-08-01",
      widthInches: NORMAN_PORTAL_RR002.widthInches,
      heightInches: NORMAN_PORTAL_RR002.heightInches,
      quantity: 1,
      configuration: {
        mount_type: NORMAN_PORTAL_RR002.mount,
        roller_region_scope: "ca_ma",
        roller_application: NORMAN_PORTAL_RR002.application,
        lift_system: NORMAN_PORTAL_RR002.lift,
        fabric_collection: NORMAN_PORTAL_RR002.collection,
        fabric_color_code: NORMAN_PORTAL_RR002.colorCode,
        roller_top_treatment: "No Top Treatment",
        roller_tube: '1 3/4" (43mm) Tube',
      },
      options: { schedule_discount_percent: 30 },
    };

    const result = priceQuoteV2Selection({
      selection,
      priceInput: {
        productId: selection.productId,
        programId: selection.programId ?? undefined,
        widthInches: selection.widthInches,
        heightInches: selection.heightInches,
        quantity: selection.quantity,
        surcharges: [{ id: "raceway" }],
      },
      includeInternalCost: true,
    });

    if (!result.ok) throw new Error(JSON.stringify(result, null, 2));
    expect(result.wholesaleBase).toBe(NORMAN_PORTAL_RR002.baseDealerNet);
    expect(result.surchargeLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "raceway",
          wholesaleAmount: NORMAN_PORTAL_RR002.racewayDealerNet,
        }),
      ]),
    );
    expect(result.wholesaleUnitPrice).toBe(
      NORMAN_PORTAL_RR002.subtotalDealerNet,
    );
    expect(result.internalCost?.productCostUnit).toBe(
      NORMAN_PORTAL_RR002.subtotalDealerNet,
    );

    // Customer retail follows the V2 2.5 policy and is deliberately not the
    // dealer portal's net subtotal.
    expect(result.base).toBe(288);
    expect(result.surchargeLines[0]?.amount).toBe(50.25);
    expect(result.total).toBe(338.25);
  });
});
