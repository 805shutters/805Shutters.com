import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getProduct, getProgram } from "@/lib/quote/catalog";
import { priceDealerNetDesign, priceDesign } from "@/lib/quote/pricing";
import beforeLock from "./fixtures/portal-parity/before.lock.json";
import {
  assertPortalParityBeforeAudit,
  PORTAL_PARITY_BEFORE_AUDIT,
  portalParityBeforeCase,
} from "./portal-parity-before";

const root = process.cwd();

function cents(value: number): number {
  return Math.round(value * 100);
}

function retail(
  productId: string,
  programId: string,
  widthInches: number,
  heightInches: number,
  surcharges: Array<{ id: string; units?: number }> = [],
) {
  const result = priceDesign({
    productId,
    programId,
    widthInches,
    heightInches,
    quantity: 1,
    surcharges,
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}

function dealer(
  productId: string,
  programId: string,
  widthInches: number,
  heightInches: number,
) {
  const result = priceDealerNetDesign({
    productId,
    programId,
    widthInches,
    heightInches,
    quantity: 1,
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}

describe("portal parity BEFORE artifact contract", () => {
  it("loads ten BEFORE-only cases from the actual V2 Quote Lab route", () => {
    expect(() => assertPortalParityBeforeAudit(PORTAL_PARITY_BEFORE_AUDIT)).not.toThrow();
    expect(PORTAL_PARITY_BEFORE_AUDIT).toMatchObject({
      schemaVersion: 1,
      capturePhase: "before_correction",
      engine: {
        route: "/quote-lab/",
        interfaceMarker: "exact-existing-builder",
        adapter: "repriceExactQuoteBuilderForQuoteLabPreview",
        backend: "v2",
        revision: "0dd77d068746874ce8326a1350fe9eeb1947cf09",
      },
      safety: {
        submitted: false,
        productionWrites: false,
        customerQuotesSent: false,
        manufacturerOrdersPlaced: false,
      },
    });
    expect(PORTAL_PARITY_BEFORE_AUDIT.cases).toHaveLength(10);
    expect(JSON.stringify(PORTAL_PARITY_BEFORE_AUDIT)).not.toMatch(
      /systemAfter|afterCorrection|correctedTotal/i,
    );
  });

  it("captures 3/3/3/1 honest manufacturer coverage without inventing Onyx products", () => {
    expect(
      Object.fromEntries(
        PORTAL_PARITY_BEFORE_AUDIT.coverage.map((entry) => [
          entry.manufacturer,
          [entry.caseCount, entry.distinctProductCount, entry.status],
        ]),
      ),
    ).toEqual({
      Norman: [3, 3, "before_captured"],
      Polar: [3, 3, "before_captured"],
      Lotus: [3, 3, "msrp_unverified"],
      Onyx: [1, 1, "coverage_limited"],
    });
    const onyx = PORTAL_PARITY_BEFORE_AUDIT.coverage.find(
      (entry) => entry.manufacturer === "Onyx",
    );
    expect(onyx?.limitation).toMatch(/three genuinely different.*cannot/i);
    for (const manufacturer of ["Norman", "Polar", "Lotus"] as const) {
      const cases = PORTAL_PARITY_BEFORE_AUDIT.cases.filter(
        (entry) => entry.manufacturer === manufacturer,
      );
      expect(new Set(cases.map((entry) => entry.product.id))).toHaveLength(3);
    }
  });

  it("attaches exact evidence narrowly and preserves the unmatched Lotus cart separately", () => {
    const evidence = Object.fromEntries(
      PORTAL_PARITY_BEFORE_AUDIT.evidence.map((entry) => [entry.id, entry]),
    );
    expect(evidence["norman-current-account-portal-fixture-2026-07-21"].exactCaseIds)
      .toEqual(["norman-roller-smartrelease-24x36"]);
    expect(evidence["polar-elite-private-capture-2026-07-22"].exactCaseIds)
      .toEqual(["polar-elite-suntex90-manual-three-line"]);
    expect(evidence["lotus-three-product-cart-private-capture-2026-07-22"].exactCaseIds)
      .toEqual([]);
    expect(portalParityBeforeCase("polar-drapery-pinch-split-white-48").source.evidenceRefs)
      .toEqual([]);
    expect(portalParityBeforeCase("polar-premium-pro-awning-120x83").source.evidenceRefs)
      .toEqual([]);
  });

  it("never treats dealer-only Lotus or Onyx evidence as manufacturer MSRP", () => {
    for (const auditCase of PORTAL_PARITY_BEFORE_AUDIT.cases.filter(
      (entry) => entry.manufacturer === "Lotus" || entry.manufacturer === "Onyx",
    )) {
      expect(auditCase.manufacturerOutput.comparableLedgerId).toBeNull();
      expect(auditCase.comparison).toMatchObject({
        basis: "manufacturer_msrp_vs_805_customer_retail",
        manufacturerCents: null,
        differenceCents: null,
        percentageBasisPoints: null,
        result: "unverified",
      });
      expect(
        auditCase.manufacturerOutput.ledgers.every(
          (ledger) => ledger.audience === "dealer_cost",
        ),
      ).toBe(true);
    }
  });

  it("retains exact Polar portal list and dealer evidence alongside the conflicting book ledger", () => {
    const polar = portalParityBeforeCase(
      "polar-elite-suntex90-manual-three-line",
    );
    expect(polar.lines.map((line) => [line.widthInches, line.heightInches])).toEqual([
      [88, 67],
      [92, 67],
      [85.5, 67],
    ]);
    expect(
      polar.manufacturerOutput.ledgers.find((entry) => entry.id === "portal_msrp"),
    ).toMatchObject({ subtotalCents: 271500, audience: "customer_retail" });
    expect(
      polar.manufacturerOutput.ledgers.find((entry) => entry.id === "official_book_msrp"),
    ).toMatchObject({ subtotalCents: 288300, audience: "customer_retail" });
    expect(
      polar.manufacturerOutput.ledgers.find((entry) => entry.id === "portal_dealer"),
    ).toMatchObject({
      subtotalCents: 122175,
      taxCents: 9469,
      grandTotalCents: 131644,
      audience: "dealer_cost",
    });
    expect(polar.systemBefore).toMatchObject({
      customerRetailSubtotalCents: 324339,
      productStatus: "restriction_source_incomplete",
      validationStatus: "blocked",
      sendable: false,
    });
    expect(polar.comparison).toMatchObject({
      manufacturerCents: 271500,
      differenceCents: 52839,
      percentageBasisPoints: 1946,
      result: "fail",
    });
  });
});

describe("portal parity BEFORE source arithmetic", () => {
  it("reconciles every official MSRP fixture to the untouched source catalog", () => {
    const roller = retail(
      "roller",
      "roller_cordless_fabric_price_group_1_pg1",
      24,
      36,
      [{ id: "smartrelease" }, { id: "shim" }],
    );
    expect(cents(roller.total)).toBe(35000);

    expect(cents(retail(
      "synchrony_vertical",
      "synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1",
      24,
      48,
    ).total)).toBe(20400);
    expect(cents(retail(
      "roman",
      "roman_cordless_usa_price_group_1_pg1",
      96,
      72,
    ).total)).toBe(230600);

    const eliteTotal = [88, 92, 85.5].reduce(
      (total, width) =>
        total + cents(retail("polar_elite_patio", "group_4", width, 67).total),
      0,
    );
    expect(eliteTotal).toBe(288300);
    expect(cents(retail(
      "polar_drapery_track",
      "pinch_split_white",
      48,
      96,
    ).total)).toBe(47200);
    expect(cents(retail(
      "polar_awning_premium_pro",
      "standard",
      120,
      83,
    ).total)).toBe(490000);
  });

  it("reconciles every dealer-only source without inventing retail", () => {
    expect(cents(dealer(
      "lotus_mini_blinds",
      "lotus_amx_1in_aluminum_custom",
      17,
      36,
    ).dealerNetUnitCost)).toBe(2148);
    expect(cents(dealer(
      "lotus_faux_wood_blinds",
      "lotus_flx_2in_bright_white_custom",
      17,
      36,
    ).dealerNetUnitCost)).toBe(2357);
    expect(cents(dealer(
      "lotus_vertical_blinds",
      "lotus_cv_steel_complete_custom",
      35,
      48,
    ).dealerNetUnitCost)).toBe(3197);

    const onyx = getProduct("onyx_shutters");
    const program = onyx ? getProgram(onyx, "onyx_us_made_vinyl") : undefined;
    expect(program).toMatchObject({ costPerSqft: 13.6, pricePerSqft: 34, minSqft: 8 });
    expect(cents(retail(
      "onyx_shutters",
      "onyx_us_made_vinyl",
      36,
      48,
    ).wholesaleTotal!)).toBe(16320);
  });
});

describe("portal parity BEFORE immutability and privacy", () => {
  it("matches the SHA-256 and byte length lock for every immutable artifact", () => {
    expect(beforeLock).toMatchObject({
      schemaVersion: 1,
      captureId: PORTAL_PARITY_BEFORE_AUDIT.captureId,
      policy: "append_only_before_correction_evidence",
      engineRevision: PORTAL_PARITY_BEFORE_AUDIT.engine.revision,
    });
    for (const artifact of beforeLock.artifacts) {
      const artifactPath = path.join(root, artifact.path);
      const bytes = readFileSync(artifactPath);
      expect(statSync(artifactPath).size, artifact.path).toBe(artifact.byteLength);
      expect(
        createHash("sha256").update(bytes).digest("hex"),
        artifact.path,
      ).toBe(artifact.sha256);
    }
  });

  it("keeps the generated markdown report synchronized with the locked capture", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ["scripts/generate-quote-v2-portal-parity-before.mjs", "--check"],
        { cwd: root, stdio: "pipe" },
      ),
    ).not.toThrow();
  });

  it("contains no credentials, customer PII, account identifiers, or authenticated URLs", () => {
    const trackedText = beforeLock.artifacts
      .map((artifact) => readFileSync(path.join(root, artifact.path), "utf8"))
      .join("\n");
    expect(trackedText).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(trackedText).not.toMatch(/\b(?:bearer|password|access[_ -]?token|refresh[_ -]?token|session[_ -]?cookie)\b\s*[:=]/i);
    expect(trackedText).not.toMatch(/"(?:accountId|dealerId|customerName|phone|email|address)"\s*:/i);
    expect(trackedText).not.toMatch(/https?:\/\/[^\s)]+[?&](?:token|code|session|auth)=/i);
  });
});
