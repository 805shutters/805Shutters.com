import { sourceProvenance } from "./source-manifest";
import portalFixture from "./fixtures/norman-805-portal-2026-07-21.json";

export type NormanDealerSchedule = Readonly<{
  id: "standard" | "shutter_lead_time";
  /** Stable value retained by the existing quote interface. */
  selectionPercent: 30 | 28.5;
  /** Current account-specific factor actually applied by the dealer portal. */
  effectivePortalFactor: number;
  fixtureId: string;
}>;

/**
 * Current 805 account-specific Norman dealer policy.
 *
 * The July retail guide documents the $25/$11 continental freight and $80/$50
 * oversize schedules. The $25/$11 blinds-and-shades freight was reverified in
 * the authenticated current 805 portal on 2026-07-21; the other published
 * schedules were not exercised by this fixture. The same live Roller draft
 * shows a 2% processing fee on merchandise plus freight. Oversize inclusion in
 * that fee remains unverified, so oversize configurations fail closed.
 *
 * `NORMAN PRICING.pdf` is retained only as quarantined evidence because it
 * belongs to dealer R00646, not 805. Nothing in this runtime policy derives
 * from that artifact.
 */
export const NORMAN_805_DEALER_POLICY = Object.freeze({
  id: "norman-805-dealer-policy-2026-07-21",
  verifiedOn: "2026-07-21",
  accountScope: "Current authenticated 805 Norman dealer account",
  runtimeVerification: Object.freeze({
    channel: "authenticated_live_dealer_portal",
    verifiedOn: "2026-07-21",
    fixtureId: portalFixture.id,
    accountId: portalFixture.accountId,
    verifiedFacts: Object.freeze([...portalFixture.verifiedFacts]),
    notVerified: Object.freeze([...portalFixture.notVerified]),
  }),
  publishedFreightSource: sourceProvenance("norman-retail-guide-2026-07", {
    page: 4,
  }),
  quarantinedEvidence: Object.freeze({
    sourceId: "norman-dealer-pricing-snapshot-2026-07-20",
    dealer: "R00646",
    runtimeAuthority: false,
    reason:
      "This portal PDF belongs to dealer R00646 and its $8 additional-unit freight rate is not valid for 805.",
  }),
  schedules: Object.freeze({
    standard: Object.freeze({
      id: "standard",
      selectionPercent: 30,
      effectivePortalFactor: portalFixture.standard.effectivePortalFactor,
      fixtureId: portalFixture.id,
    } satisfies NormanDealerSchedule),
    shutterLeadTime: Object.freeze({
      id: "shutter_lead_time",
      selectionPercent: 28.5,
      effectivePortalFactor:
        portalFixture.shutterLeadTime.effectivePortalFactor,
      fixtureId: portalFixture.id,
    } satisfies NormanDealerSchedule),
  }),
  dealerFactors: Object.freeze({
    standard: portalFixture.standard.effectivePortalFactor,
    shutterLeadTime: portalFixture.shutterLeadTime.effectivePortalFactor,
  }),
  freight: Object.freeze({
    continentalUsBlindsAndShades: Object.freeze({
      firstUnit: 25,
      additionalUnit: 11,
    }),
    hiAkBlindsAndShades: Object.freeze({
      firstUnit: 100,
      additionalUnit: 15,
    }),
    continentalUsShutters: Object.freeze({
      firstUnit: 75,
      additionalUnit: 25,
    }),
    oversize: Object.freeze({
      firstUnit: 80,
      additionalUnit: 50,
    }),
  }),
  processingFee: Object.freeze({
    rate: 0.02,
    basisPoints: 200,
    appliesTo: Object.freeze(["merchandise", "freight"] as const),
    excludes: Object.freeze(["oversize"] as const),
    oversizeScope: "unverified_excluded" as const,
    rounding: "round_order_total_to_cent_then_allocate_cumulatively" as const,
  }),
});

/** Resolve an existing UI schedule key to its versioned portal-effective factor. */
export function normanDealerScheduleForSelection(
  schedulePercent: unknown,
): NormanDealerSchedule | null {
  const schedules = NORMAN_805_DEALER_POLICY.schedules;
  if (schedulePercent === undefined) return schedules.standard;
  if (
    schedulePercent === null ||
    (typeof schedulePercent === "string" && !schedulePercent.trim())
  ) {
    return null;
  }
  const selected =
    typeof schedulePercent === "number" || typeof schedulePercent === "string"
      ? Number(schedulePercent)
      : Number.NaN;
  if (!Number.isFinite(selected)) return null;
  if (selected === schedules.standard.selectionPercent) {
    return schedules.standard;
  }
  if (selected === schedules.shutterLeadTime.selectionPercent) {
    return schedules.shutterLeadTime;
  }
  return null;
}
