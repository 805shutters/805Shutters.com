import { describe, expect, it } from "vitest";
import {
  NORMAN_805_DEALER_POLICY,
  normanDealerScheduleForSelection,
} from "./norman-dealer-policy";

describe("805 Norman dealer policy", () => {
  it("pins current 805 costs without trusting the quarantined other-account PDF", () => {
    expect(NORMAN_805_DEALER_POLICY).toMatchObject({
      id: "norman-805-dealer-policy-2026-07-21",
      verifiedOn: "2026-07-21",
      accountScope: "Current authenticated 805 Norman dealer account",
      runtimeVerification: {
        channel: "authenticated_live_dealer_portal",
        verifiedOn: "2026-07-21",
        fixtureId: "norman-805-live-portal-2026-07-21",
        accountVerified: true,
        verifiedFacts: [
          "roller_standard_factor",
          "roller_shutter_lead_time_factor",
          "continental_blinds_shades_freight",
          "processing_fee_on_merchandise_plus_freight",
          "portal_surcharge_group_rounding",
        ],
        notVerified: [
          "oversize_processing_fee_basis",
          "hi_ak_freight",
          "shutter_freight",
        ],
      },
      publishedFreightSource: {
        sourceId: "norman-retail-guide-2026-07",
        fileName: "2026Jul Retail Price Guide (1).pdf",
        revision: "2026-07",
        sha256:
          "ae102c19b833e5c20070c11ecaad61d68a79bf6b52b5402fad55415e2602d2f3",
        page: 4,
      },
      quarantinedEvidence: {
        sourceId: "norman-dealer-pricing-snapshot-2026-07-20",
        dealer: "redacted_non_805_account",
        runtimeAuthority: false,
      },
      schedules: {
        standard: {
          id: "standard",
          selectionPercent: 30,
          effectivePortalFactor: 0.33,
          fixtureId: "norman-805-live-portal-2026-07-21",
        },
        shutterLeadTime: {
          id: "shutter_lead_time",
          selectionPercent: 28.5,
          effectivePortalFactor: 0.297,
          fixtureId: "norman-805-live-portal-2026-07-21",
        },
      },
      dealerFactors: {
        standard: 0.33,
        shutterLeadTime: 0.297,
      },
      freight: {
        continentalUsBlindsAndShades: {
          firstUnit: 25,
          additionalUnit: 11,
        },
        hiAkBlindsAndShades: {
          firstUnit: 100,
          additionalUnit: 15,
        },
        continentalUsShutters: {
          firstUnit: 75,
          additionalUnit: 25,
        },
        oversize: {
          firstUnit: 80,
          additionalUnit: 50,
        },
      },
      processingFee: {
        rate: 0.02,
        basisPoints: 200,
        appliesTo: ["merchandise", "freight"],
        excludes: ["oversize"],
        oversizeScope: "unverified_excluded",
        rounding: "round_order_total_to_cent_then_allocate_cumulatively",
      },
    });
  });

  it("resolves the existing interface schedule labels through versioned policy", () => {
    expect(normanDealerScheduleForSelection(undefined)).toMatchObject({
      id: "standard",
      selectionPercent: 30,
      effectivePortalFactor: 0.33,
    });
    expect(normanDealerScheduleForSelection(28.5)).toMatchObject({
      id: "shutter_lead_time",
      selectionPercent: 28.5,
      effectivePortalFactor: 0.297,
    });
    expect(normanDealerScheduleForSelection(29)).toBeNull();
    expect(normanDealerScheduleForSelection(null)).toBeNull();
    expect(normanDealerScheduleForSelection("")).toBeNull();
    expect(normanDealerScheduleForSelection("not-a-schedule")).toBeNull();
  });
});
