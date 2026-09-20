import { describe, expect, it } from "vitest";
import {
  LOTUS_FLX_PORTAL_AUDIT,
  LOTUS_CUSTOM_CART_AUDIT_20260920,
  lotusCustomerDeliveryBlock,
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

describe("September 20 Lotus custom cart conflicts", () => {
  it.each(LOTUS_CUSTOM_CART_AUDIT_20260920.rows)(
    "$programCode retains the guide price but cannot be treated as verified dealer authority",
    (row) => {
      const cost = requireCost(lookupWholesaleLedgerCost({
        productId: row.productId,
        programId: row.programId,
        widthInches: row.width,
        heightInches: row.height,
      }));
      expect(cost).toMatchObject({
        wholesaleBase: row.guideDealerNet,
        provenanceStatus: "source_conflict",
        customerPriceEligible: false,
        authorityFindings: [
          { code: "SOURCE_PRICE_CONFLICT", blocking: true },
          { code: "EFFECTIVE_DATE_MISSING", blocking: true },
        ],
      });
      expect(lotusCustomerDeliveryBlock(row.productId, row.programId, "Inside Mount"))
        .toContain(`Lotus ${row.programCode} dealer-guide and portal prices conflict`);
      expect(wholesaleAuthorityFindings("norman_faux_wood", row.programId)).toEqual([]);
    },
  );

  it("leaves unrelated FTX, aluminum and vinyl programs outside these cart conflicts", () => {
    for (const [productId, programId] of [
      ["lotus_faux_wood_blinds", "lotus_ftx_2in_snow_white_custom"],
      ["lotus_faux_wood_blinds", "lotus_ftxlg_2in_light_gray_custom"],
      ["lotus_mini_blinds", "lotus_amx_1in_aluminum_custom"],
      ["lotus_vinyl_blinds", "lotus_mlx_1in_vinyl_custom"],
    ]) {
      expect(wholesaleAuthorityFindings(productId, programId)).toEqual([]);
      expect(lotusCustomerDeliveryBlock(productId, programId, "Inside Mount")).toBeNull();
    }
    expect(lotusCustomerDeliveryBlock("lotus_faux_wood_blinds", "lotus_ftx_2in_snow_white_custom", "Side Mount"))
      .toContain("Side Mount");
  });
});
