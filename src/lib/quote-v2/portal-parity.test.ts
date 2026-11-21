import { describe, expect, it } from "vitest";
import { QUOTE_V2_ROLLER_PREVIEW_VERSION } from "./catalog";
import type { SelectionContext } from "./core";
import { priceDesign } from "@/lib/quote/pricing";
import { priceQuoteV2Selection } from "./engine";

/**
 * Historical read-only dealer-portal fixture captured 2026-07-20 from Norman
 * draft TEST, line RR002. Its list dollars remain a fixed input. Dealer cost
 * is list × the catalog factor 0.30.
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
  it("prices RR002 dealer cost at the catalog 0.30 factor", () => {
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

    expect(result).toMatchObject({ ok: false, code: "NO_SITE_PRICE", blocked: "no_site_price" });
    const catalog = priceDesign({
      productId: selection.productId,
      programId: selection.programId ?? undefined,
      widthInches: selection.widthInches,
      heightInches: selection.heightInches,
      quantity: selection.quantity,
      surcharges: [{ id: "raceway" }],
    }, selection.catalogAsOf);
    expect(catalog.ok, JSON.stringify(catalog)).toBe(true);
    if (!catalog.ok) return;
    expect(catalog.base).toBe(384);
    expect(catalog.surchargeLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "raceway", amount: 67 }),
    ]));
    expect(catalog.wholesaleBase).toBe(115.2);
    expect(catalog.wholesaleBase).toBe(NORMAN_PORTAL_RR002.baseDealerNet);
  });
});
