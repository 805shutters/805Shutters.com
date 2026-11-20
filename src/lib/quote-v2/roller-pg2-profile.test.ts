import { describe, expect, it } from "vitest";
import { getProduct } from "@/lib/quote/catalog";
import { NORMAN_ROLLER_FALL_2026 } from "@/lib/quote/norman-roller-fall-2026";
import { normanRollerFabricColors } from "@/lib/quote/norman-roller-fabrics";
import type { SelectionContext } from "./core";
import { quoteV2CatalogVersionFor } from "./catalog";
import { priceQuoteV2Selection } from "./engine";
import { normanRollerFall2026Source } from "./generated/norman-roller-fall-2026.generated";
import { normanRollerPg4Source } from "./generated/norman-roller-pg4-2026-09.generated";
import { normanRollerV2Source } from "./generated/norman-roller-v2.generated";
import { resolveRollerMatrixProfile, resolveRollerOffering } from "./roller-matrix";

const LEGACY_FABRIC_PG2 = "roller_cordless_fabric_price_group_2_pg2";
const FALL_FABRIC_PG2 = "roller_cordless_fabric_price_group_2_pg2_fall_2026";
const CURRENT_FABRIC_PG2 = new Set([LEGACY_FABRIC_PG2, FALL_FABRIC_PG2]);
const QUARANTINE =
  "More than one exact Roller profile matches this selection; the configuration is quarantined rather than guessed.";

/** Bali colors that share fabric code A90105 across two color-specific limit rows. */
const BALI_A90105 = [
  "F0668",
  "F1668",
  "F1669",
  "F1926",
  "F1927",
  "F2023",
  "F2024",
  "F2025",
  "F2026",
  "F2027",
] as const;

const ORIGINAL_BALI_ROW = "A90105 (F0668, F1668, F1669)";
const ADDED_BALI_ROW = "A90105 (F1926,F1927,F2023-F2027)";

function shade(
  color: { collection: string; colorCode: string; programId: string | null },
  widthInches: number,
  heightInches: number,
  configuration: SelectionContext["configuration"] = {},
): SelectionContext {
  return {
    manufacturerId: "norman",
    productId: "roller",
    programId: color.programId ?? "",
    catalogAsOf: "2026-09-20",
    catalogVersion: quoteV2CatalogVersionFor("roller", "2026-09-20"),
    widthInches,
    heightInches,
    quantity: 1,
    options: {},
    configuration: {
      mount_type: "Inside Mount",
      roller_application: "Single Shade",
      lift_system: "Cordless",
      fabric_collection: color.collection,
      fabric_color_code: color.colorCode,
      roller_top_treatment: "No Top Treatment",
      roller_tube: "All Tubes",
      ...configuration,
    },
  };
}

function baliColor(colorCode: string) {
  const color = normanRollerFabricColors.find(
    (row) => row.collection === "Bali" && row.colorCode === colorCode && row.available,
  );
  if (!color?.programId) throw new Error(`Missing Bali ${colorCode}`);
  return color;
}

describe("Roller Price Group 2 profile resolution", () => {
  it("prices Bali Flax from the single original A90105 row", () => {
    const flax = baliColor("F1669");
    expect(flax).toMatchObject({
      collection: "Bali",
      colorCode: "F1669",
      colorName: "Flax",
      fabricType: "Light Filtering / Sheer & Natural",
      programId: LEGACY_FABRIC_PG2,
    });

    for (const [widthInches, heightInches, matchedWidth, matchedHeight] of [
      [47, 50, 48, 60],
      [40, 40, 42, 48],
    ] as const) {
      const selected = shade(flax, widthInches, heightInches);
      const profile = resolveRollerMatrixProfile(selected);
      expect(profile.ok, `${widthInches}x${heightInches}`).toBe(true);
      if (!profile.ok) continue;
      const row = normanRollerV2Source.limitRows.find((candidate) => candidate.id === profile.assignment.limitRowId);
      expect(row?.sourceFabricLabel).toBe(ORIGINAL_BALI_ROW);
      expect(row?.fabricCodes).toEqual(["A90105"]);
      expect(row?.sourceFabricTokens).toEqual(["A90105"]);
      expect(profile.profile.id).toBe("roller-profile-0115");
      expect(profile.definition.id).toBe("roller-definition-005");
      expect(profile.definition.operatingSystem).toBe("Cordless");
      expect(profile.profile.limits.maxWidth).toBe(78);

      const price = priceQuoteV2Selection({
        selection: selected,
        priceInput: {
          productId: "roller",
          programId: flax.programId!,
          fabric: flax.collection,
          widthInches,
          heightInches,
        },
      });
      const program = getProduct("roller")?.programs.find((candidate) => candidate.id === LEGACY_FABRIC_PG2);
      const widthIndex = program?.grid.widths.indexOf(matchedWidth) ?? -1;
      const heightIndex = program?.grid.heights.indexOf(matchedHeight) ?? -1;
      expect(price.ok, JSON.stringify(price)).toBe(true);
      if (!price.ok) continue;
      expect(price.programId).toBe(LEGACY_FABRIC_PG2);
      expect(price.matchedWidth).toBe(matchedWidth);
      expect(price.matchedHeight).toBe(matchedHeight);
      expect(price.base).toBe(program?.grid.prices[heightIndex]?.[widthIndex]);
      expect(price.unitPrice).toBeGreaterThan(0);
      expect(JSON.stringify(price)).not.toContain(QUARANTINE);
      expect(price.validationIssues.some((issue) => issue.ruleId === "roller.matrix.profile_ambiguous")).toBe(false);
    }
  });

  it("prices every other Bali color that shares fabric code A90105 from its own limit row", () => {
    for (const colorCode of BALI_A90105) {
      const color = baliColor(colorCode);
      expect(color.programId).toBe(LEGACY_FABRIC_PG2);
      const selected = shade(color, 40, 40);
      const profile = resolveRollerMatrixProfile(selected);
      expect(profile.ok, colorCode).toBe(true);
      if (!profile.ok) continue;
      const row = normanRollerV2Source.limitRows.find((candidate) => candidate.id === profile.assignment.limitRowId);
      const expectedLabel = ["F0668", "F1668", "F1669"].includes(colorCode) ? ORIGINAL_BALI_ROW : ADDED_BALI_ROW;
      expect(row?.sourceFabricLabel, colorCode).toBe(expectedLabel);
      expect(profile.profile.id, colorCode).toBe(expectedLabel === ORIGINAL_BALI_ROW ? "roller-profile-0115" : "roller-profile-0132");
      expect(profile.profile.limits.maxWidth, colorCode).toBe(expectedLabel === ORIGINAL_BALI_ROW ? 78 : 94.5);

      const price = priceQuoteV2Selection({
        selection: selected,
        priceInput: {
          productId: "roller",
          programId: color.programId!,
          fabric: color.collection,
          widthInches: 40,
          heightInches: 40,
        },
      });
      expect(price.ok, `${colorCode}: ${JSON.stringify(price)}`).toBe(true);
      if (!price.ok) continue;
      expect(price.programId).toBe(LEGACY_FABRIC_PG2);
      expect(JSON.stringify(price)).not.toContain(QUARANTINE);
    }
  });

  it("keeps the generated color lists on the A90105 labels and resolves F2025 inside the range", () => {
    const labels = [...new Set(
      normanRollerV2Source.limitRows
        .filter((row) => row.fabricCodes.includes("A90105"))
        .map((row) => row.sourceFabricLabel),
    )].sort();
    expect(labels).toEqual([ADDED_BALI_ROW, ORIGINAL_BALI_ROW].sort());
    const sandstone = resolveRollerMatrixProfile(shade(baliColor("F2025"), 40, 40));
    expect(sandstone.ok).toBe(true);
    if (!sandstone.ok) return;
    expect(sandstone.profile.id).toBe("roller-profile-0132");
    expect(sandstone.profile.limits.maxWidth).toBe(94.5);
    const row = normanRollerV2Source.limitRows.find((candidate) => candidate.id === sandstone.assignment.limitRowId);
    expect(row?.sourceFabricLabel).toBe(ADDED_BALI_ROW);
  });

  it("leaves every non-A90105 fabric on the single limit row the fabric-code match already selected", () => {
    const sources = [normanRollerV2Source, normanRollerPg4Source, normanRollerFall2026Source];
    let compared = 0;
    for (const source of sources) {
      for (const offering of source.offerings) {
        if (offering.fabricCode === "A90105") continue;
        const color = normanRollerFabricColors.find(
          (row) => row.collection === offering.collection && row.colorCode === offering.colorCode,
        );
        const configuration = offering.regionScope === "ca_ma" || offering.regionScope === "other_regions"
          ? { roller_region_scope: offering.regionScope }
          : undefined;
        const selected = shade(
          { collection: offering.collection, colorCode: offering.colorCode, programId: color?.programId ?? LEGACY_FABRIC_PG2 },
          36,
          60,
          configuration,
        );
        const profile = resolveRollerMatrixProfile(selected);
        const label = `${source === normanRollerV2Source ? "v2" : source === normanRollerPg4Source ? "pg4" : "fall"} ${offering.collection} ${offering.colorCode} ${offering.regionScope}`;
        if (!profile.ok) {
          expect(profile.code, label).not.toBe("PROFILE_AMBIGUOUS");
          continue;
        }
        const resolvedSource = sources.find((candidate) => candidate.limitRows.some((row) => row.id === profile.assignment.limitRowId));
        if (resolvedSource !== source) continue;
        const peers = source.limitRows.filter(
          (row) => row.sheet === profile.sheet && row.fabricCodes.includes(offering.fabricCode),
        );
        expect(peers, label).toHaveLength(1);
        expect(profile.assignment.limitRowId, label).toBe(peers[0]?.id);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(300);
  });

  it("keeps Ohara and Charlotte on the Fall 2026 Price Group 2 program", () => {
    for (const collection of ["Ohara", "Charlotte"]) {
      const colors = normanRollerFabricColors.filter((row) => row.collection === collection && row.available);
      expect(colors.length).toBeGreaterThan(0);
      for (const color of colors) {
        expect(color.programId, `${collection} ${color.colorCode}`).toBe(FALL_FABRIC_PG2);
        const profile = resolveRollerMatrixProfile(shade(color, 36, 60));
        expect(profile.ok, `${collection} ${color.colorCode}`).toBe(true);
      }
    }
  });

  it("does not leave any fabric Price Group 2 color on an id that quarantines a duplicate profile", () => {
    const fallPg2 = new Set(
      NORMAN_ROLLER_FALL_2026.colors.filter((row) => row.priceGroup === 2).map((row) => row.colorCode),
    );
    const fabricPg2 = normanRollerFabricColors.filter(
      (row) => row.available && row.programId?.includes("fabric_price_group_2"),
    );
    expect(fabricPg2.length).toBeGreaterThan(BALI_A90105.length);

    for (const color of fabricPg2) {
      expect(CURRENT_FABRIC_PG2.has(color.programId ?? ""), `${color.collection} ${color.colorCode} ${color.programId}`).toBe(true);
      expect(color.programId === FALL_FABRIC_PG2, color.colorCode).toBe(fallPg2.has(color.colorCode));

      const base = shade(color, 36, 60);
      const offering = resolveRollerOffering(base);
      const selections = offering.ok || offering.code !== "REGION_SCOPE_REQUIRED"
        ? [base]
        : (["ca_ma", "other_regions"] as const).map((roller_region_scope) => shade(color, 36, 60, { roller_region_scope }));

      for (const selected of selections) {
        const profile = resolveRollerMatrixProfile(selected);
        if (!profile.ok) {
          expect(profile.code, `${color.collection} ${color.colorCode}`).not.toBe("PROFILE_AMBIGUOUS");
          expect(profile.message).not.toContain(QUARANTINE);
          continue;
        }
        expect(profile.assignment.profileId, `${color.collection} ${color.colorCode}`).toBeTruthy();
        const price = priceQuoteV2Selection({
          selection: selected,
          priceInput: {
            productId: "roller",
            programId: color.programId!,
            fabric: color.collection,
            widthInches: 36,
            heightInches: 60,
          },
        });
        expect(JSON.stringify(price), `${color.collection} ${color.colorCode}`).not.toContain(QUARANTINE);
        if (price.ok) expect(price.programId).toBe(color.programId);
      }
    }
  });
});
