import { describe, expect, it } from "vitest";
import {
  LOTUS_FLX_PORTAL_AUDIT,
  summarizeLotusFlxPortalAudit,
  wholesaleAuthorityFindings,
} from "./lotus-authority";
import { lookupWholesaleLedgerCost } from "./wholesale-ledger";

function requireCost(result: ReturnType<typeof lookupWholesaleLedgerCost>) {
  if (!result.ok) throw new Error(`${result.code}: ${result.error}`);
  return result;
}

describe("Lotus FLX authority reconciliation", () => {
  it("preserves every exact portal observation without promoting it to authority", () => {
    expect(summarizeLotusFlxPortalAudit()).toEqual({
      rowCount: 9,
      priceConflictCount: 9,
      metadataConflictSkus: ["CFLX3096BW", "CFLX4860BW"],
      guideDealerNetMin: 32.99,
      guideDealerNetMax: 180.02,
      portalUnitPrice: 105,
      customerPriceEligible: false,
    });
    expect(LOTUS_FLX_PORTAL_AUDIT.guideSourceId).toBe("lotus-west-a26-v1");
  });

  it.each([
    ["minimum observed cell", 30, 36, 32.99, 30, 36],
    ["middle observed cell", 59, 60, 53.81, 59, 60],
    ["maximum observed cell", 95, 72, 180.02, 95, 72],
  ])(
    "retains the pinned guide value for the %s and marks the conflict",
    (_label, width, height, cost, matchedWidth, matchedHeight) => {
      expect(
        requireCost(
          lookupWholesaleLedgerCost({
            productId: "lotus_faux_wood_blinds",
            programId: "lotus_flx_2in_bright_white_custom",
            widthInches: width,
            heightInches: height,
          }),
        ),
      ).toMatchObject({
        wholesaleBase: cost,
        matchedWidth,
        matchedHeight,
        provenanceStatus: "source_conflict",
        customerPriceEligible: false,
        authorityFindings: [
          { code: "SOURCE_PRICE_CONFLICT", blocking: true },
          { code: "PORTAL_METADATA_CONFLICT", blocking: true },
          { code: "EFFECTIVE_DATE_MISSING", blocking: true },
        ],
      });
    },
  );

  it("does not contaminate unrelated programs with the FLX conflict", () => {
    expect(
      wholesaleAuthorityFindings(
        "lotus_mini_blinds",
        "lotus_amx_1in_aluminum_custom",
      ),
    ).toEqual([]);
  });

  it("still fails closed for unavailable and out-of-range FLX requests", () => {
    expect(
      lookupWholesaleLedgerCost({
        productId: "lotus_faux_wood_blinds",
        programId: "lotus_flx_2in_bright_white_custom",
        widthInches: 95.01,
        heightInches: 72,
      }),
    ).toMatchObject({ ok: false, code: "WIDTH_EXCEEDS_MAX" });
    expect(
      lookupWholesaleLedgerCost({
        productId: "lotus_faux_wood_blinds",
        programId: "lotus_flx_2in_bright_white_custom",
        widthInches: 95,
        heightInches: 96,
      }),
    ).toMatchObject({ ok: false, code: "NA_CELL" });
  });
});
