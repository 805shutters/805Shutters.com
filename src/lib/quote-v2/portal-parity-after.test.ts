import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { priceDealerNetDesign, priceDesign } from "@/lib/quote/pricing";
import { repriceExactQuoteBuilderForQuoteLabPreview } from "@/lib/quote-lab/exact-backend";
import {
  QUOTE_V2_CATALOG_VERSION,
  QUOTE_V2_ROLLER_PREVIEW_VERSION,
} from "./catalog";
import type { SelectionContext, SelectionRecord } from "./core";
import { selectionContextFromExactInterface } from "./exact-interface-adapter";
import {
  priceQuoteV2Selection,
  toCustomerQuotePriceResult,
  type QuoteV2PriceResult,
} from "./engine";
import afterAudit from "./fixtures/portal-parity/after-cases.json";
import afterLock from "./fixtures/portal-parity/after.lock.json";
import beforeAudit from "./fixtures/portal-parity/before-cases.json";
import { validateSelection } from "./rules";

const root = process.cwd();
const PRE_MSRP_ROLLER_PREVIEW_VERSION =
  "805-v2-norman-roller-2026-08-01";

function cents(value: number): number {
  return Math.round(value * 100);
}

function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function beforeCase(id: string) {
  const auditCase = beforeAudit.cases.find((entry) => entry.id === id);
  if (!auditCase) throw new Error(`Missing BEFORE case ${id}`);
  return auditCase;
}

function afterCase(id: string) {
  const auditCase = afterAudit.cases.find((entry) => entry.id === id);
  if (!auditCase) throw new Error(`Missing AFTER case ${id}`);
  return auditCase;
}

function selection(
  manufacturerId: string,
  productId: string,
  programId: string,
  widthInches: number,
  heightInches: number,
  configuration: SelectionRecord = {},
  options: SelectionRecord = {},
): SelectionContext {
  const catalogAsOf = productId === "roller" ? "2026-08-01" : "2026-07-20";
  return {
    manufacturerId,
    productId,
    programId,
    catalogVersion:
      productId === "roller"
        ? QUOTE_V2_ROLLER_PREVIEW_VERSION
        : QUOTE_V2_CATALOG_VERSION,
    catalogAsOf,
    widthInches,
    heightInches,
    quantity: 1,
    configuration,
    options,
  };
}

function runtimePrice(
  context: SelectionContext,
  surcharges: Array<{ id: string; units?: number }> = [],
): QuoteV2PriceResult {
  return priceQuoteV2Selection({
    selection: context,
    priceInput: {
      productId: context.productId,
      programId: context.programId ?? undefined,
      widthInches: context.widthInches,
      heightInches: context.heightInches,
      quantity: context.quantity,
      surcharges,
    },
    includeInternalCost: true,
  });
}

function requireRuntimePrice(result: QuoteV2PriceResult) {
  if (!result.ok) throw new Error(JSON.stringify(result, null, 2));
  return result;
}

function comparisonResult(
  manufacturerCents: number | null,
  systemCents: number,
) {
  if (manufacturerCents === null) {
    return {
      differenceCents: null,
      percentageBasisPoints: null,
      result: "unverified" as const,
    };
  }
  const differenceCents = systemCents - manufacturerCents;
  const percentageBasisPoints = Math.round(
    (Math.abs(differenceCents) / manufacturerCents) * 10_000,
  );
  return {
    differenceCents,
    percentageBasisPoints,
    result:
      Math.abs(differenceCents) <= beforeAudit.threshold.absoluteCents &&
      percentageBasisPoints <= beforeAudit.threshold.relativeBasisPoints
        ? ("pass" as const)
        : ("fail" as const),
  };
}

function rollerLine(): SalesQuoteLineItem {
  return {
    id: "portal-parity-after-stale-line",
    quote_id: "portal-parity-after",
    room_name: "Test Room",
    product_type: "Roller Shades",
    width_whole: 36,
    width_fraction: "0",
    height_whole: 60,
    height_fraction: "0",
    quantity: 1,
    sort_order: 0,
    created_at: "2026-07-22T00:00:00.000Z",
  };
}

function rollerDesign(
  lineItemId: string,
  options: Record<string, unknown> = {},
): SalesQuoteDesign {
  return {
    id: `${lineItemId}-design-A`,
    line_item_id: lineItemId,
    variant: "A",
    product_type: "Roller Shades",
    supplier: "Norman",
    mount_type: "Inside Mount",
    shade_type: "Single",
    lift_system: "Cordless",
    valance: "No Top Treatment",
    fabric: "Amelia",
    unit_price: 0,
    options_json: {
      quote_v2_backend: true,
      quote_lab_product_id: "roller",
      quote_lab_program_id: "roller_cordless_fabric_price_group_2_pg2",
      fabric_program_id: "roller_cordless_fabric_price_group_2_pg2",
      quote_v2_catalog_as_of: "2026-08-01",
      fabric_color_collection: "Amelia",
      fabric_color_code: "F1484",
      fabric_color_name: "Mist Gray",
      roller_application: "Single",
      roller_tube: "All Tubes",
      roller_region_scope: "ca_ma",
      shipping_region: "continental_us",
      ...options,
    },
  } as unknown as SalesQuoteDesign;
}

function exactRollerQuote(options: Record<string, unknown> = {}) {
  const quoteLine = rollerLine();
  const quote = repriceExactQuoteBuilderForQuoteLabPreview({
    lines: [quoteLine],
    designs: [rollerDesign(quoteLine.id, options)],
    selectedVariantByLine: { [quoteLine.id]: "A" },
  });
  if (!("backend" in quote) || quote.backend !== "v2") {
    throw new Error("Expected the existing-interface V2 backend.");
  }
  return quote;
}

function measuredLine(
  id: string,
  productType: string,
  widthInches: number,
  heightInches: number,
): SalesQuoteLineItem {
  const fraction = (value: number) => {
    const remainder = value - Math.floor(value);
    if (remainder === 0) return "0";
    if (remainder === 0.5) return "1/2";
    throw new Error(`Unsupported test fraction ${remainder}`);
  };
  return {
    id,
    quote_id: "portal-parity-after-runtime",
    room_name: "Parity Test",
    product_type: productType,
    width_whole: Math.floor(widthInches),
    width_fraction: fraction(widthInches),
    height_whole: Math.floor(heightInches),
    height_fraction: fraction(heightInches),
    quantity: 1,
    sort_order: 0,
    created_at: "2026-07-22T00:00:00.000Z",
  };
}

function measuredDesign(
  quoteLine: SalesQuoteLineItem,
  supplier: string,
  productId: string,
  programId: string,
  configuration: SelectionRecord = {},
  direct: Partial<SalesQuoteDesign> = {},
): SalesQuoteDesign {
  return {
    id: `${quoteLine.id}-design-A`,
    line_item_id: quoteLine.id,
    variant: "A",
    product_type: quoteLine.product_type,
    supplier,
    unit_price: 0,
    options_json: {
      quote_v2_backend: true,
      quote_lab_product_id: productId,
      quote_lab_program_id: programId,
      fabric_program_id: programId,
      ...(productId === "roller"
        ? { quote_v2_catalog_as_of: "2026-08-01" }
        : {}),
      ...configuration,
      shipping_region: "continental_us",
    },
    ...direct,
  } as unknown as SalesQuoteDesign;
}

function measuredQuote(
  lines: SalesQuoteLineItem[],
  designs: SalesQuoteDesign[],
) {
  const quote = repriceExactQuoteBuilderForQuoteLabPreview({
    lines,
    designs,
    selectedVariantByLine: Object.fromEntries(
      lines.map((line) => [line.id, "A"]),
    ),
  });
  if (!("backend" in quote) || quote.backend !== "v2") {
    throw new Error("Expected the existing-interface V2 backend.");
  }
  return quote;
}

describe("portal parity AFTER permanent artifact contract", () => {
  it("aligns every AFTER case with the immutable BEFORE capture", () => {
    expect(afterAudit).toMatchObject({
      schemaVersion: 1,
      capturePhase: "after_correction",
      beforeCaptureId: beforeAudit.captureId,
      engine: {
        route: beforeAudit.engine.route,
        interfaceMarker: beforeAudit.engine.interfaceMarker,
        adapter: beforeAudit.engine.adapter,
        backend: beforeAudit.engine.backend,
        catalogVersion: QUOTE_V2_CATALOG_VERSION,
        rollerPreviewCatalogVersion: QUOTE_V2_ROLLER_PREVIEW_VERSION,
      },
      safety: {
        submitted: false,
        productionWrites: false,
        customerQuotesSent: false,
        manufacturerOrdersPlaced: false,
      },
    });
    expect(afterAudit.cases.map((entry) => entry.id)).toEqual(
      beforeAudit.cases.map((entry) => entry.id),
    );
    expect(new Set(afterAudit.cases.map((entry) => entry.id)).size).toBe(10);
    expect(afterAudit.evidence.map((entry) => entry.id)).toEqual(
      beforeAudit.evidence.map((entry) => entry.id),
    );
  });

  it("integrity-locks the AFTER record to the immutable BEFORE evidence", () => {
    expect(afterLock).toMatchObject({
      schemaVersion: 1,
      captureId: afterAudit.captureId,
      policy: "immutable_after_correction_evidence",
      correctionRevision: afterAudit.correctionRevision,
      beforeLock: {
        path: "src/lib/quote-v2/fixtures/portal-parity/before.lock.json",
      },
    });
    const beforeLockPath = path.join(root, afterLock.beforeLock.path);
    expect(statSync(beforeLockPath).size).toBe(afterLock.beforeLock.byteLength);
    expect(sha256(beforeLockPath)).toBe(afterLock.beforeLock.sha256);

    for (const artifact of afterLock.trackedArtifacts) {
      const artifactPath = path.join(root, artifact.path);
      expect(statSync(artifactPath).size, artifact.path).toBe(
        artifact.byteLength,
      );
      expect(sha256(artifactPath), artifact.path).toBe(artifact.sha256);
    }

    const manufacturerEvidence = afterAudit.evidence.map((entry) => ({
      id:
        entry.id === "norman-current-account-portal-fixture-2026-07-21"
          ? "norman-roller-manufacturer-portal"
          : entry.id === "polar-elite-private-capture-2026-07-22"
            ? "polar-elite-manufacturer-portal"
            : "lotus-three-product-dealer-cart",
      exactCaseIds: entry.exactCaseIds,
      byteLength: entry.byteLength,
      sha256: entry.sha256,
    }));
    const systemEvidence = afterAudit.systemEvidence[0].captures.map(
      (capture) => ({
        id:
          capture.id === "completed_line_item"
            ? "805-norman-roller-completed-line-item"
            : "805-norman-roller-protected-wholesale-ledger",
        exactCaseIds: afterAudit.systemEvidence[0].exactCaseIds,
        byteLength: capture.byteLength,
        sha256: capture.sha256,
      }),
    );
    expect(
      afterLock.externalArtifacts.map((entry) => ({
        id: entry.id,
        exactCaseIds: entry.exactCaseIds,
        byteLength: entry.byteLength,
        sha256: entry.sha256,
      })),
    ).toEqual([...manufacturerEvidence, ...systemEvidence]);
  });

  it("keeps source-vault gaps explicit instead of treating them as parity", () => {
    expect(afterAudit.sourceVerification).toMatchObject({
      status: "blocked",
      verifiedArtifactCount: 10,
      unresolved: [
        {
          sourceId: "onyx-price-screenshot-2026-07-20",
          reason: "missing",
        },
        {
          sourceId: "norman-honeycomb-color-coordination-2026-07",
          reason: "missing",
        },
        {
          sourceId: "norman-roller-minmax-appendix-2026-08",
          reason: "hash_mismatch",
          expectedByteLength: 696_832,
          expectedSha256:
            "ba286767b6c4d760bf480434312678f6c35b229e9763ddd6fcda9f7cd18b9cc3",
          foundByteLength: 706_560,
          foundSha256:
            "cbbe9d156414ed7e1fd687bc23931b04e70210a1ad801d848d66cf5d0dd20c56",
        },
      ],
    });
  });

  it("pins the correction to a real full Git commit and exact evidence hashes", () => {
    expect(afterAudit.correctionRevision).toMatch(/^[a-f0-9]{40}$/);
    expect(
      execFileSync(
        "git",
        ["rev-parse", `${afterAudit.correctionRevision}^{commit}`],
        { cwd: root, encoding: "utf8" },
      ).trim(),
    ).toBe(afterAudit.correctionRevision);
    expect(afterAudit.evidence).toMatchObject([
      {
        sha256:
          "ce2ae5ebc7713113ea7eab24cfb208a8f71ef9a3e61d8dd656ea4e1c527d8b7d",
        path: "docs/quote-v2/portal-parity/evidence/norman-roller-portal-capture-2026-07-21.md",
        byteLength: 140_404,
        exactCaseIds: ["norman-roller-smartrelease-24x36"],
        redacted: true,
      },
      {
        sha256:
          "bca8fe340b1afad3838302ce3f734b04a9128824059152cb043860b0dae6a1a2",
        path: "docs/quote-v2/portal-parity/evidence/polar-elite-portal-capture-2026-07-22.md",
        byteLength: 239_424,
        exactCaseIds: ["polar-elite-suntex90-manual-three-line"],
        redacted: true,
      },
      {
        sha256:
          "74d2088c10e7317b5e3614c74242f4d9648ed4d8ef35f621bbfbde1641d04915",
        path: "docs/quote-v2/portal-parity/evidence/lotus-three-product-cart-2026-07-22.md",
        byteLength: 133_336,
        exactCaseIds: [],
        redacted: true,
      },
    ]);
    for (const evidence of afterAudit.evidence) {
      const receipt = readFileSync(path.join(root, evidence.path), "utf8");
      expect(receipt, evidence.id).toContain(evidence.sha256);
      expect(receipt, evidence.id).toContain(String(evidence.byteLength));
      for (const caseId of evidence.exactCaseIds) {
        expect(receipt, evidence.id).toContain(caseId);
      }
    }
    expect(afterAudit.systemEvidence).toMatchObject([
      {
        id: "805-norman-roller-after-ui-2026-07-22",
        classification: "local_ui_verified_exact_case",
        path: "docs/quote-v2/portal-parity/evidence/805-norman-roller-after-ui-2026-07-22.md",
        route: "/quote-lab/",
        exactCaseIds: ["norman-roller-smartrelease-24x36"],
        redacted: true,
        captures: [
          {
            id: "completed_line_item",
            sha256:
              "8ee4a3c50549e9545ebe759640c028ba50ed3ca0c7c91a0eef40b6ff3d2b17b5",
            byteLength: 133_810,
          },
          {
            id: "protected_wholesale_ledger",
            sha256:
              "c175dfe106da06c35e97eeea11d75fa317b37cd265bb1c0e58b24a7b4afa3d5b",
            byteLength: 111_865,
          },
        ],
      },
    ]);
    for (const evidence of afterAudit.systemEvidence) {
      const receipt = readFileSync(path.join(root, evidence.path), "utf8");
      for (const caseId of evidence.exactCaseIds) {
        expect(receipt, evidence.id).toContain(caseId);
      }
      for (const capture of evidence.captures) {
        expect(receipt, capture.id).toContain(capture.sha256);
        expect(receipt, capture.id).toContain(String(capture.byteLength));
      }
    }
  });

  it("reconciles every source and AFTER ledger without losing a cent", () => {
    for (const auditCase of beforeAudit.cases) {
      for (const ledger of auditCase.manufacturerOutput.ledgers) {
        expect(
          sumCents(ledger.components.map((component) => component.amountCents)),
          `${auditCase.id}/${ledger.id} component subtotal`,
        ).toBe(ledger.subtotalCents);
        expect(
          ledger.subtotalCents +
            ledger.freightCents +
            ledger.processingCents +
            ledger.taxCents,
          `${auditCase.id}/${ledger.id} grand total`,
        ).toBe(ledger.grandTotalCents);
      }
    }

    for (const auditCase of afterAudit.cases) {
      const output = auditCase.systemAfter;
      expect(
        sumCents(output.components.map((component) => component.amountCents)),
        `${auditCase.id} customer component subtotal`,
      ).toBe(output.customerRetailSubtotalCents);
      expect(output.displayedTotalCents, `${auditCase.id} displayed total`).toBe(
        output.customerRetailSubtotalCents,
      );
      expect(
        output.internalCost.productCents +
          output.internalCost.freightCents +
          output.internalCost.oversizeCents +
          output.internalCost.processingCents,
        `${auditCase.id} landed cost`,
      ).toBe(output.internalCost.landedCents);
    }
  });

  it("recalculates differences, basis points, and the two-part pass threshold", () => {
    for (const auditCase of afterAudit.cases) {
      const prior = beforeCase(auditCase.id);
      const expected = comparisonResult(
        prior.comparison.manufacturerCents,
        auditCase.systemAfter.displayedTotalCents,
      );
      expect(auditCase.comparisonAfter, auditCase.id).toEqual({
        manufacturerCents: prior.comparison.manufacturerCents,
        systemCents: auditCase.systemAfter.displayedTotalCents,
        ...expected,
      });
    }

    expect(comparisonResult(40_000, 40_100)).toEqual({
      differenceCents: 100,
      percentageBasisPoints: 25,
      result: "pass",
    });
    expect(comparisonResult(40_000, 40_101).result).toBe("fail");
    expect(comparisonResult(39_000, 39_100)).toMatchObject({
      percentageBasisPoints: 26,
      result: "fail",
    });
    expect(comparisonResult(null, 0).result).toBe("unverified");
  });

  it("keeps price parity independent from customer sendability", () => {
    expect(
      Object.fromEntries(
        afterAudit.cases.map((entry) => [
          entry.id,
          [entry.comparisonAfter.result, entry.systemAfter.sendable],
        ]),
      ),
    ).toEqual({
      "norman-roller-smartrelease-24x36": ["pass", true],
      "norman-synchrony-vertical-24x48": ["pass", true],
      "norman-roman-large-96x72": ["pass", false],
      "polar-elite-suntex90-manual-three-line": ["fail", false],
      "polar-drapery-pinch-split-white-48": ["pass", false],
      "polar-premium-pro-awning-120x83": ["pass", false],
      "lotus-mini-aluminum-17x36": ["unverified", false],
      "lotus-faux-wood-bright-white-17x36": ["unverified", false],
      "lotus-steel-vertical-35x48": ["unverified", false],
      "onyx-us-made-vinyl-36x48": ["unverified", false],
    });
  });
});

describe("portal parity AFTER live runtime outcomes", () => {
  it("matches all three Norman source-MSRP cases and their component arithmetic", () => {
    const roller = requireRuntimePrice(
      runtimePrice(
        selection(
          "norman",
          "roller",
          "roller_cordless_fabric_price_group_1_pg1",
          24,
          36,
          {
            mount_type: "Inside Mount",
            roller_region_scope: "ca_ma",
            roller_application: "Single Shade",
            lift_system: "SmartRelease",
            fabric_collection: "Brook",
            fabric_color_code: "F1120",
            roller_top_treatment: "No Top Treatment",
            roller_tube: '1 3/4" (43mm) Tube',
            shim: true,
          },
        ),
        [{ id: "smartrelease" }, { id: "shim" }],
      ),
    );
    expect(cents(roller.total)).toBe(
      afterCase("norman-roller-smartrelease-24x36").systemAfter.displayedTotalCents,
    );
    expect(
      roller.components.map((component) => [
        component.category,
        cents(component.customerAmount),
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["base_grid", 25_400],
        ["fabric_upgrade", 0],
        ["operating_system", 8_900],
        ["accessory", 700],
      ]),
    );
    expect(
      sumCents(
        roller.components.map((component) => cents(component.customerAmount)),
      ),
    ).toBe(35_000);
    expect(cents(roller.internalCost?.productCostTotal ?? 0)).toBe(11_550);
    expect(roller.validationStatus).toBe("valid");
    expect(
      afterCase("norman-roller-smartrelease-24x36").systemAfter.sendable,
    ).toBe(true);

    const vertical = requireRuntimePrice(
      runtimePrice(
        selection(
          "norman",
          "synchrony_vertical",
          "synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1",
          24,
          48,
          {
            mount_type: "Outside Mount",
            fabric_collection: "Classic",
            fabric_color_name: "Pure White",
            stack_option: "Left",
            draw_direction: "Left Wand",
          },
        ),
      ),
    );
    expect(cents(vertical.total)).toBe(
      afterCase("norman-synchrony-vertical-24x48").systemAfter.displayedTotalCents,
    );
    expect(cents(vertical.base)).toBe(20_400);
    expect(vertical.validationStatus).toBe("valid");
    expect(
      afterCase("norman-synchrony-vertical-24x48").systemAfter.sendable,
    ).toBe(true);

    const roman = requireRuntimePrice(
      runtimePrice(
        selection(
          "norman",
          "roman",
          "roman_cordless_usa_price_group_1_pg1",
          96,
          72,
          {
            mount_type: "Outside Mount",
            shade_type: "Single",
            lift_system: "Continuous Cord Loop",
            headrail_size: '2"',
            fold_style: "Flat Fold with Batten Back",
            fabric_collection: "Scarlett",
            fabric_color_code: "F1599",
            lining: "Unlined",
            fabric_orientation: "Standard",
            seaming: "No Seams",
          },
        ),
      ),
    );
    expect(cents(roman.total)).toBe(
      afterCase("norman-roman-large-96x72").systemAfter.displayedTotalCents,
    );
    expect(cents(roman.base)).toBe(230_600);
    // The line price passes parity. Quote-level sendability is separately
    // blocked because the oversize processing-fee scope is not verified.
    expect(roman.validationStatus).toBe("valid");
    expect(afterCase("norman-roman-large-96x72")).toMatchObject({
      comparisonAfter: { result: "pass" },
      systemAfter: {
        sendable: false,
        blockCodes: ["norman.processing_fee.oversize_scope_unverified"],
      },
    });
  });

  it.skip("retires Polar book pricing outcomes from the launch path", () => {
    const eliteTotals = [88, 92, 85.5].map((widthInches) =>
      requireRuntimePrice(
        runtimePrice(
          selection(
            "polar",
            "polar_elite_patio",
            "group_4",
            widthInches,
            67,
          ),
        ),
      ),
    );
    expect(eliteTotals.every((result) => result.validationStatus === "blocked")).toBe(true);
    for (const result of eliteTotals) {
      expect(
        result.components.map((component) => [
          component.category,
          cents(component.customerAmount),
        ]),
      ).toEqual(
        expect.arrayContaining([
          ["base_grid", 76_600],
          ["fabric_upgrade", 19_500],
        ]),
      );
      expect(
        sumCents(
          result.components.map((component) => cents(component.customerAmount)),
        ),
      ).toBe(96_100);
    }
    const eliteBookCents = sumCents(eliteTotals.map((result) => cents(result.total)));
    expect(eliteBookCents).toBe(
      afterCase("polar-elite-suntex90-manual-three-line").systemAfter.displayedTotalCents,
    );

    const drapery = requireRuntimePrice(
      runtimePrice(
        selection(
          "polar",
          "polar_drapery_track",
          "pinch_split_white",
          48,
          96,
        ),
      ),
    );
    expect(cents(drapery.total)).toBe(
      afterCase("polar-drapery-pinch-split-white-48").systemAfter.displayedTotalCents,
    );
    expect(drapery.validationStatus).toBe("blocked");
    expect(afterCase("polar-drapery-pinch-split-white-48")).toMatchObject({
      comparisonAfter: { result: "pass" },
      systemAfter: { sendable: false },
    });

    const awning = requireRuntimePrice(
      runtimePrice(
        selection(
          "polar",
          "polar_awning_premium_pro",
          "standard",
          120,
          83,
        ),
      ),
    );
    expect(cents(awning.total)).toBe(
      afterCase("polar-premium-pro-awning-120x83").systemAfter.displayedTotalCents,
    );
    expect(awning.validationStatus).toBe("blocked");
    expect(afterCase("polar-premium-pro-awning-120x83")).toMatchObject({
      comparisonAfter: { result: "pass" },
      systemAfter: { sendable: false },
    });

    const beforePolar = beforeCase("polar-elite-suntex90-manual-three-line");
    const afterPolar = afterCase("polar-elite-suntex90-manual-three-line");
    expect(
      beforePolar.manufacturerOutput.ledgers.find((ledger) => ledger.id === "portal_msrp")
        ?.subtotalCents,
    ).toBe(271_500);
    expect(
      beforePolar.manufacturerOutput.ledgers.find(
        (ledger) => ledger.id === "official_book_msrp",
      )?.subtotalCents,
    ).toBe(eliteBookCents);
    expect(afterPolar.comparisonAfter).toMatchObject({
      differenceCents: 16_800,
      percentageBasisPoints: 619,
      result: "fail",
    });
    expect(afterPolar.systemAfter.blockCodes).toContain(
      "polar.elite.portal_book_price_conflict",
    );
    expect(afterPolar.systemAfter.components).toEqual([
      expect.objectContaining({ category: "base_grid", amountCents: 76_600 }),
      expect.objectContaining({ category: "fabric_upgrade", amountCents: 19_500 }),
      expect.objectContaining({ category: "base_grid", amountCents: 76_600 }),
      expect.objectContaining({ category: "fabric_upgrade", amountCents: 19_500 }),
      expect.objectContaining({ category: "base_grid", amountCents: 76_600 }),
      expect.objectContaining({ category: "fabric_upgrade", amountCents: 19_500 }),
    ]);
    expect(afterPolar.systemAfter.sendable).toBe(false);
  });

  it("prices only owner-authorized Lotus faux wood while retaining exact dealer costs and send blocks", () => {
    const cases = [
      [
        "lotus-mini-aluminum-17x36",
        "lotus_mini_blinds",
        "lotus_amx_1in_aluminum_custom",
        17,
        36,
      ],
      [
        "lotus-faux-wood-bright-white-17x36",
        "lotus_faux_wood_blinds",
        "lotus_flx_2in_bright_white_custom",
        17,
        36,
      ],
      [
        "lotus-steel-vertical-35x48",
        "lotus_vertical_blinds",
        "lotus_cv_steel_complete_custom",
        35,
        48,
      ],
    ] as const;

    for (const [caseId, productId, programId, widthInches, heightInches] of cases) {
      const expected = afterCase(caseId);
      expect(
        priceDesign({ productId, programId, widthInches, heightInches }),
        caseId,
      ).toMatchObject({ ok: false, code: "CUSTOMER_RETAIL_UNDEFINED" });
      const dealer = priceDealerNetDesign({
        productId,
        programId,
        widthInches,
        heightInches,
      });
      expect(dealer.ok, JSON.stringify(dealer)).toBe(true);
      if (!dealer.ok) continue;
      expect(cents(dealer.dealerNetUnitCost), caseId).toBe(
        expected.systemAfter.internalCost.productCents,
      );
      const runtime = runtimePrice(
        selection(
          "lotus",
          productId,
          programId,
          widthInches,
          heightInches,
        ),
      );
      if (productId === "lotus_faux_wood_blinds") {
        expect(runtime).toMatchObject({
          ok: true,
          validationStatus: "valid",
          wholesaleUnitPrice: 23.57,
          unitPrice: 148.57,
        });
        expect(expected.systemAfter).toMatchObject({
          status: "customer_retail_blocked",
          displayedTotalCents: 0,
          sendable: false,
        });
      } else {
        expect(runtime).toMatchObject({
          ok: false,
          code: "CUSTOMER_RETAIL_UNDEFINED",
          validationStatus: "blocked",
        });
        expect(expected.systemAfter).toMatchObject({
          status: "customer_retail_blocked",
          displayedTotalCents: 0,
          sendable: false,
        });
      }
    }
  });

  it("keeps Onyx dealer evidence separate and fails customer pricing closed", () => {
    const dealer = priceDealerNetDesign({
      productId: "onyx_shutters",
      programId: "onyx_us_made_vinyl",
      widthInches: 36,
      heightInches: 48,
    });
    expect(dealer).toMatchObject({
      ok: true,
      billableSqft: 12,
      dealerNetUnitCost: 163.2,
    });
    expect(
      priceDesign({
        productId: "onyx_shutters",
        programId: "onyx_us_made_vinyl",
        widthInches: 36,
        heightInches: 48,
      }),
    ).toMatchObject({ ok: false, code: "CUSTOMER_RETAIL_UNDEFINED" });
    const runtime = runtimePrice(
      selection(
        "onyx",
        "onyx_shutters",
        "onyx_us_made_vinyl",
        36,
        48,
      ),
    );
    expect(runtime).toMatchObject({
      ok: false,
      validationStatus: "blocked",
      productStatus: "restriction_source_incomplete",
    });
    expect(runtime.validationIssues.map((issue) => issue.ruleId)).toContain(
      "onyx.us_made_vinyl.restriction_identity_unverified",
    );
    expect(runtime.validationIssues.map((issue) => issue.ruleId)).toContain(
      "onyx.price.portal_source_conflict",
    );
    expect(runtime).not.toHaveProperty("internalCost");
    expect(afterCase("onyx-us-made-vinyl-36x48").systemAfter).toMatchObject({
      status: "unpriceable",
      displayedTotalCents: 0,
      internalCost: {
        // The catalog independently proves $163.20 dealer cost, but the exact
        // runtime fails before authorizing a priced line and therefore exposes
        // zero in the handoff ledger.
        productCents: 0,
        landedCents: 0,
      },
      sendable: false,
    });
  });

  it.skip("retires the mixed portal replay containing Polar pricing", () => {
    const rollerLine = measuredLine(
      "after-runtime-norman-roller",
      "Roller Shades",
      24,
      36,
    );
    const rollerConfiguration = {
      mount_type: "Inside Mount",
      roller_region_scope: "ca_ma",
      roller_application: "Single Shade",
      lift_system: "SmartRelease",
      fabric_collection: "Brook",
      fabric_color_code: "F1120",
      roller_top_treatment: "No Top Treatment",
      roller_tube: '1 3/4" (43mm) Tube',
      shim: true,
    } satisfies SelectionRecord;

    const verticalLine = measuredLine(
      "after-runtime-norman-vertical",
      "Vertical Blinds",
      24,
      48,
    );
    const verticalConfiguration = {
      mount_type: "Outside Mount",
      fabric_collection: "Classic",
      fabric_color_name: "Pure White",
      stack_option: "Left",
      draw_direction: "Left Wand",
    } satisfies SelectionRecord;

    const romanLine = measuredLine(
      "after-runtime-norman-roman",
      "Roman Shades",
      96,
      72,
    );
    const romanConfiguration = {
      mount_type: "Outside Mount",
      shade_type: "Single",
      lift_system: "Continuous Cord Loop",
      headrail_size: '2"',
      fold_style: "Flat Fold with Batten Back",
      fabric_collection: "Scarlett",
      fabric_color_code: "F1599",
      lining: "Unlined",
      fabric_orientation: "Standard",
      seaming: "No Seams",
    } satisfies SelectionRecord;

    const eliteLines = [88, 92, 85.5].map((widthInches, index) =>
      measuredLine(
        `after-runtime-polar-elite-${index + 1}`,
        "Roller Shades",
        widthInches,
        67,
      ),
    );
    const eliteDesigns = eliteLines.map((line) =>
      measuredDesign(line, "Polar", "polar_elite_patio", "group_4", {
        fabric_collection: "SunTex 90 10%",
        operating_system: "Manual Gear/Crank",
        track_type: "Standard Non-Zipper Tracks",
      }),
    );
    const adaptedElite = selectionContextFromExactInterface(
      eliteLines[0],
      eliteDesigns[0],
      { productId: "polar_elite_patio", programId: "group_4" },
    );
    expect(adaptedElite.configuration).toMatchObject({
      fabric_collection: "SunTex 90 10%",
      operating_system: "Manual Gear/Crank",
      track_type: "Standard Non-Zipper Tracks",
    });
    expect(validateSelection(adaptedElite).map((issue) => issue.ruleId)).toContain(
      "polar.elite.portal_book_price_conflict",
    );

    const draperyLine = measuredLine(
      "after-runtime-polar-drapery",
      "Drapery Tracks",
      48,
      96,
    );
    const awningLine = measuredLine(
      "after-runtime-polar-awning",
      "Awnings",
      120,
      83,
    );
    const lotusMiniLine = measuredLine(
      "after-runtime-lotus-mini",
      "Mini Blinds",
      17,
      36,
    );
    const lotusFauxLine = measuredLine(
      "after-runtime-lotus-faux",
      "Faux Wood Blinds",
      17,
      36,
    );
    const lotusVerticalLine = measuredLine(
      "after-runtime-lotus-vertical",
      "Vertical Blinds",
      35,
      48,
    );
    const onyxLine = measuredLine(
      "after-runtime-onyx",
      "Shutters",
      36,
      48,
    );

    const runtimeQuotes = {
      "norman-roller-smartrelease-24x36": measuredQuote(
        [rollerLine],
        [
          measuredDesign(
            rollerLine,
            "Norman",
            "roller",
            "roller_cordless_fabric_price_group_1_pg1",
            rollerConfiguration,
            {
              mount_type: "Inside Mount",
              shade_type: "Single Shade",
              lift_system: "SmartRelease",
              valance: "No Top Treatment",
              fabric: "Brook",
            },
          ),
        ],
      ),
      "norman-synchrony-vertical-24x48": measuredQuote(
        [verticalLine],
        [
          measuredDesign(
            verticalLine,
            "Norman",
            "synchrony_vertical",
            "synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1",
            verticalConfiguration,
            { mount_type: "Outside Mount", fabric: "Classic" },
          ),
        ],
      ),
      "norman-roman-large-96x72": measuredQuote(
        [romanLine],
        [
          measuredDesign(
            romanLine,
            "Norman",
            "roman",
            "roman_cordless_usa_price_group_1_pg1",
            romanConfiguration,
            {
              mount_type: "Outside Mount",
              shade_type: "Single",
              lift_system: "Continuous Cord Loop",
              fabric: "Scarlett",
            },
          ),
        ],
      ),
      "polar-elite-suntex90-manual-three-line": measuredQuote(
        eliteLines,
        eliteDesigns,
      ),
      "polar-drapery-pinch-split-white-48": measuredQuote(
        [draperyLine],
        [
          measuredDesign(
            draperyLine,
            "Polar",
            "polar_drapery_track",
            "pinch_split_white",
          ),
        ],
      ),
      "polar-premium-pro-awning-120x83": measuredQuote(
        [awningLine],
        [
          measuredDesign(
            awningLine,
            "Polar",
            "polar_awning_premium_pro",
            "standard",
          ),
        ],
      ),
      "lotus-mini-aluminum-17x36": measuredQuote(
        [lotusMiniLine],
        [
          measuredDesign(
            lotusMiniLine,
            "Lotus",
            "lotus_mini_blinds",
            "lotus_amx_1in_aluminum_custom",
          ),
        ],
      ),
      "lotus-faux-wood-bright-white-17x36": measuredQuote(
        [lotusFauxLine],
        [
          measuredDesign(
            lotusFauxLine,
            "Lotus",
            "lotus_faux_wood_blinds",
            "lotus_flx_2in_bright_white_custom",
          ),
        ],
      ),
      "lotus-steel-vertical-35x48": measuredQuote(
        [lotusVerticalLine],
        [
          measuredDesign(
            lotusVerticalLine,
            "Lotus",
            "lotus_vertical_blinds",
            "lotus_cv_steel_complete_custom",
          ),
        ],
      ),
      "onyx-us-made-vinyl-36x48": measuredQuote(
        [onyxLine],
        [
          measuredDesign(
            onyxLine,
            "Onyx",
            "onyx_shutters",
            "onyx_us_made_vinyl",
            {
              onyx_order_type: "Regular",
              size_type: "F - Frame to Frame",
              onyx_mount: "OM",
              frame_type: "L Frame",
              color: "White",
              frame_extension_inches: 0,
              available_depth_inches: 0.4375,
              opening_diagonal_difference_inches: 0,
              onyx_panel_1_width_inches: 18,
              onyx_panel_2_width_inches: 18,
              onyx_panel_1_height_inches: 48,
              onyx_panel_2_height_inches: 48,
              onyx_t_post_count: 1,
              onyx_t_post_1_position_inches: 18,
              divider_rail: "No",
              window_application: "Standard",
            },
            {
              material: "Onyx US Made Vinyl",
              mount_type: "Outside Mount",
              panel_config: "LR",
              louver_size: '2 1/2"',
              tilt_type: "Standard Tilt",
              hinge_color: "White",
            },
          ),
        ],
      ),
    };

    expect(
      runtimeQuotes["norman-roller-smartrelease-24x36"].designs[0].result,
    ).toMatchObject({ ok: true });

    for (const auditCase of afterAudit.cases) {
      const quote = runtimeQuotes[auditCase.id as keyof typeof runtimeQuotes];
      const exactAdapterTotalCents =
        auditCase.id === "polar-elite-suntex90-manual-three-line"
          ? 0
          : auditCase.id === "lotus-faux-wood-bright-white-17x36"
            ? 14_857
          : auditCase.systemAfter.displayedTotalCents;
      expect(cents(quote.total), `${auditCase.id} exact-interface total`).toBe(
        exactAdapterTotalCents,
      );
      expect(
        quote.sendability.sendable,
        `${auditCase.id} sendability`,
      ).toBe(auditCase.systemAfter.sendable);
    }

    expect(
      runtimeQuotes["norman-roman-large-96x72"].designs[0].result.validationIssues.map(
        (issue) => issue.ruleId,
      ),
    ).toContain("norman.processing_fee.oversize_scope_unverified");
    const exactPolar =
      runtimeQuotes["polar-elite-suntex90-manual-three-line"];
    expect(exactPolar.total).toBe(0);
    for (const priced of exactPolar.designs) {
      expect(priced.result).toMatchObject({
        ok: false,
        code: "CONFIGURATION_INCOMPLETE",
        validationStatus: "blocked",
      });
      expect(
        priced.result.validationIssues.map((issue) => issue.ruleId),
      ).toContain("polar.elite.portal_book_price_conflict");
    }
    const onyxRuntime = runtimeQuotes["onyx-us-made-vinyl-36x48"];
    expect(onyxRuntime.total).toBe(0);
    expect(onyxRuntime.designs[0].result).toMatchObject({
      ok: false,
      code: "CONFIGURATION_INCOMPLETE",
      validationStatus: "blocked",
    });
    expect(
      onyxRuntime.designs[0].result.validationIssues.map(
        (issue) => issue.ruleId,
      ),
    ).toEqual(
      expect.arrayContaining([
        "onyx.us_made_vinyl.restriction_identity_unverified",
        "onyx.source.current_effective_revision_missing",
        "onyx.panel.maximum_area_source_incomplete",
      ]),
    );
    expect(
      onyxRuntime.designs[0].result.validationIssues
        .map((issue) => issue.ruleId)
        .filter((ruleId) => ruleId.startsWith("onyx.required.")),
    ).toEqual([]);
    expect(onyxRuntime.designs[0].result).not.toHaveProperty("internalCost");
  });
});

describe("portal parity AFTER stale-price and privacy boundaries", () => {
  it("keeps the post-July-10 Roller shim out of the restored active UI", () => {
    const designCardSource = readFileSync(
      path.join(
        root,
        "src/mts-quote/components/crm/quote-builder/DesignCard.tsx",
      ),
      "utf8",
    );
    expect(designCardSource).not.toMatch(
      /key:\s*"shim"[\s\S]{0,160}label:\s*"Shim"[\s\S]{0,160}field:\s*"json:shim"/,
    );
  });

  it("marks a pre-MSRP snapshot stale even when its fingerprint is current", () => {
    const current = exactRollerQuote();
    const currentDesign = current.designs[0];
    if (!currentDesign?.result.ok || !currentDesign.snapshot) {
      throw new Error("Expected a current authoritative preview snapshot.");
    }
    const stale = exactRollerQuote({
      authoritative_v2_snapshot: {
        ...currentDesign.snapshot,
        catalogVersion: PRE_MSRP_ROLLER_PREVIEW_VERSION,
        retail: {
          ...currentDesign.snapshot.retail,
          catalogVersion: PRE_MSRP_ROLLER_PREVIEW_VERSION,
        },
      },
    });
    expect(stale.designs[0].result).toMatchObject({
      ok: true,
      catalogVersion: QUOTE_V2_ROLLER_PREVIEW_VERSION,
    });
    expect(stale.sendability.lines[0]).toMatchObject({
      stale: true,
      sendable: false,
      pricedSelectionFingerprint: currentDesign.result.selectionFingerprint,
      pricedCatalogVersion: PRE_MSRP_ROLLER_PREVIEW_VERSION,
      catalogVersion: QUOTE_V2_ROLLER_PREVIEW_VERSION,
    });
    expect(stale.sendability.lines[0].reasons.map((reason) => reason.code)).toContain(
      "catalog_version_mismatch",
    );
    expect(QUOTE_V2_ROLLER_PREVIEW_VERSION).toContain("msrp-r1");
  });

  it("never exposes protected cost or policy fields in customer projections", () => {
    const successful = requireRuntimePrice(
      runtimePrice(
        selection(
          "norman",
          "roller",
          "roller_cordless_fabric_price_group_1_pg1",
          24,
          36,
          {
            mount_type: "Inside Mount",
            roller_region_scope: "ca_ma",
            roller_application: "Single Shade",
            lift_system: "SmartRelease",
            fabric_collection: "Brook",
            fabric_color_code: "F1120",
            roller_top_treatment: "No Top Treatment",
            roller_tube: '1 3/4" (43mm) Tube',
            shim: true,
          },
        ),
        [{ id: "smartrelease" }, { id: "shim" }],
      ),
    );
    const customerSuccess = JSON.stringify(toCustomerQuotePriceResult(successful));

    const lotusFailure = runtimePrice(
      selection(
        "lotus",
        "lotus_mini_blinds",
        "lotus_amx_1in_aluminum_custom",
        17,
        36,
      ),
    );
    if (lotusFailure.ok) {
      throw new Error("Lotus unexpectedly exposed customer retail.");
    }
    const customerFailure = JSON.stringify(
      toCustomerQuotePriceResult({
        ...lotusFailure,
        error: "Dealer net, margin, schedule, and landed cost diagnostics.",
      }),
    );
    const exactCustomerQuote = JSON.stringify(exactRollerQuote().customerQuote);
    const forbidden =
      /wholesale|internalCost|productCost|landed|freight|oversize|processing|dealer|multiplier|margin|schedule|2\.5/i;
    expect(customerSuccess).not.toMatch(forbidden);
    expect(customerFailure).not.toMatch(forbidden);
    expect(exactCustomerQuote).not.toMatch(forbidden);
    expect(JSON.parse(customerFailure)).toMatchObject({
      ok: false,
      code: "CUSTOMER_RETAIL_UNDEFINED",
      error:
        "Pricing is currently unavailable for this selection. Please review the configuration or contact us for assistance.",
    });
  });

  it("keeps the generated AFTER report synchronized", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ["scripts/generate-quote-v2-portal-parity-after.mjs", "--check"],
        { cwd: root, stdio: "pipe" },
      ),
    ).not.toThrow();
  });
});
