import { sourceProvenance } from "./source-manifest";
import portalFixture from "./fixtures/norman-805-portal-2026-07-21.json";
import normanCatalog from "../quote/catalog/norman-2026.catalog.json";

/**
 * Non-shutter Norman dealer cost is list × the catalog `dealerFactor`.
 * Every Norman product in norman-2026.catalog.json carries the same factor.
 * The July 21 portal fixture still records an observed standard factor of
 * 0.33; that capture is not the runtime cost factor.
 */
function normanCatalogStandardDealerFactor(): number {
  const factors = [
    ...new Set(normanCatalog.products.map((product) => product.dealerFactor)),
  ];
  if (factors.length !== 1 || factors[0] !== 0.3) {
    throw new Error(
      `Norman catalog dealerFactor must be the single standard cost factor 0.30. Found: ${factors.join(", ")}.`,
    );
  }
  return factors[0];
}

const NORMAN_CATALOG_STANDARD_DEALER_FACTOR =
  normanCatalogStandardDealerFactor();

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
 * belongs to a different dealer account, not 805. Nothing in this runtime policy derives
 * from that artifact.
 *
 * The standard schedule is the catalog dealer factor (0.30 × list) for
 * non-shutter products, add-ons, and valances. The July fixture's observed
 * 0.33 standard factor is not applied. The shutter lead-time schedule stays
 * at the fixture's 0.297. Norman shutter product cost does not follow list ×
 * either factor; shutter programs price from their own square-foot cost.
 */
export const NORMAN_805_DEALER_POLICY = Object.freeze({
  id: "norman-805-dealer-policy-2026-07-21",
  verifiedOn: "2026-07-21",
  accountScope: "Current authenticated 805 Norman dealer account",
  runtimeVerification: Object.freeze({
    channel: "authenticated_live_dealer_portal",
    verifiedOn: "2026-07-21",
    fixtureId: portalFixture.id,
    accountVerified: portalFixture.accountIdRedacted,
    verifiedFacts: Object.freeze([...portalFixture.verifiedFacts]),
    notVerified: Object.freeze([...portalFixture.notVerified]),
  }),
  publishedFreightSource: sourceProvenance("norman-retail-guide-2026-07", {
    page: 4,
  }),
  quarantinedEvidence: Object.freeze({
    sourceId: "norman-dealer-pricing-snapshot-2026-07-20",
    dealer: "redacted_non_805_account",
    runtimeAuthority: false,
    reason:
      "This portal PDF belongs to a different dealer account and its $8 additional-unit freight rate is not valid for 805.",
  }),
  schedules: Object.freeze({
    standard: Object.freeze({
      id: "standard",
      selectionPercent: 30,
      effectivePortalFactor: NORMAN_CATALOG_STANDARD_DEALER_FACTOR,
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
    standard: NORMAN_CATALOG_STANDARD_DEALER_FACTOR,
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
