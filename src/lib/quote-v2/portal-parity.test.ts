import { describe, expect, it } from "vitest";
import { QUOTE_V2_ROLLER_PREVIEW_VERSION } from "./catalog";
import type { SelectionContext } from "./core";
import { priceQuoteV2Selection } from "./engine";

/**
 * Historical read-only dealer-portal fixture captured 2026-07-20 from Norman
 * draft TEST, line RR002. The .30 account factor is superseded by the current
 * authenticated 805 policy; its list dollars remain useful as a fixed input.
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
  baseList: 384,
  racewayList: 67,
  baseDealerNet: 115.2,
  racewayDealerNet: 20.1,
  subtotalDealerNet: 135.3,
});

describe("Norman dealer-portal parity fixtures", () => {
  it("does not let the superseded RR002 .30 capture override current 805 policy", () => {
    const selection: SelectionContext = {
      manufacturerId: "norman",
      productId: "roller",
      programId: "roller_cordless_fabric_price_group_2_pg2",
      catalogVersion: QUOTE_V2_ROLLER_PREVIEW_VERSION,
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
        raceway: "Yes",
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
    expect(result.wholesaleBase).toBe(126.72); // $384 list x current .33
    expect(result.surchargeLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "raceway",
          wholesaleAmount: 22.11, // $67 list x current .33
        }),
      ]),
    );
    expect(result.wholesaleUnitPrice).toBe(148.83);
    expect(result.internalCost).toMatchObject({
      productCostUnit: 148.83,
      effectiveDealerFactor: 0.33,
    });
    expect(result.wholesaleBase).not.toBe(NORMAN_PORTAL_RR002.baseDealerNet);

    // Customer retail remains the source-book suggested retail. The current
    // account schedule changes protected dealer cost only.
    expect(result.base).toBe(384);
    expect(result.surchargeLines[0]?.amount).toBe(67);
    expect(result.total).toBe(451);
  });
});
