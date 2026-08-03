import { describe, expect, it } from "vitest";
import { catalog } from "./catalog";
import { buildPricingRestrictionReference } from "./restriction-reference";
import { normanRomanDealerFabricRows } from "./norman-roman-dealer-fabrics.generated";
import { normanRollerV2Source } from "@/lib/quote-v2/generated/norman-roller-v2.generated";

describe("pricing restriction reference", () => {
  const reference = buildPricingRestrictionReference();

  it("covers every independent manufacturer/product", () => {
    const covered = new Set(reference.rows.map((row) => row.productId));
    expect([...new Set(catalog.products.map((product) => product.id))].sort()).toEqual(
      [...covered].sort(),
    );
  });

  it("covers every catalog fabric routing entry", () => {
    for (const product of catalog.products) {
      const rows = reference.rows.filter((row) => row.productId === product.id);
      for (const [fabric, programId] of Object.entries(product.fabricRouting ?? {})) {
        const normalize = (value: string) =>
          value
            .toLowerCase()
            .replace(/[()]/g, " ")
            .replace(/[^a-z0-9]+/g, " ")
            .split(/\s+/)
            .filter((token) => !["screen", "natural"].includes(token))
            .join(" ")
            .trim();
        const normalizedFabric = normalize(fabric);
        expect(
          rows.some(
            (row) =>
              row.programId === programId &&
              (row.fabricId === fabric ||
                row.fabricCollection === fabric ||
                normalize(row.fabricCollection ?? "\u0000").startsWith(normalizedFabric) ||
                normalizedFabric.startsWith(normalize(row.fabricCollection ?? "\u0000"))),
          ),
          `${product.id} ${fabric} -> ${programId}`,
        ).toBe(true);
      }
    }
  });

  it("contains one exact summary row for every Norman Roller offering", () => {
    const rollerRows = reference.rows.filter(
      (row) => row.productId === "roller" && row.scope === "fabric",
    );
    expect(rollerRows).toHaveLength(normanRollerV2Source.offerings.length);
    expect(new Set(rollerRows.map((row) => row.fabricId))).toEqual(
      new Set(normanRollerV2Source.offerings.map((offering) => offering.fabricCode)),
    );
  });

  it("contains every Norman Roman dealer fabric and its usable width", () => {
    const romanRows = reference.rows.filter(
      (row) => row.productId === "roman" && row.scope === "fabric",
    );
    expect(romanRows).toHaveLength(normanRomanDealerFabricRows.length);
    expect(romanRows.every((row) => row.maxWidth != null)).toBe(true);
  });

  it("contains every Polar fabric with its roll and railroad restrictions", () => {
    for (const product of catalog.products.filter(
      (candidate) => candidate.fabricMetadata?.length,
    )) {
      const fabricRows = reference.rows.filter(
        (row) => row.productId === product.id && row.scope === "fabric",
      );
      expect(fabricRows).toHaveLength(product.fabricMetadata?.length ?? 0);
      for (const fabric of product.fabricMetadata ?? []) {
        const row = fabricRows.find((candidate) => candidate.fabricId === fabric.name);
        expect(row, `${product.id}: ${fabric.name}`).toMatchObject({
          fabricRollWidth: fabric.rollWidthInches,
          maxRailroadLength: fabric.maxRailroadLengthInches,
          railroadAllowed: fabric.railroadAllowed,
          authority: "source_backed",
        });
      }
    }
  });

  it("preserves quote-only and unavailable products as explicit rules", () => {
    expect(
      reference.rows.find((row) => row.productId === "polar_tension_shade")?.authority,
    ).toBe("manual_quote");
    expect(
      reference.rows.find(
        (row) => row.productId === "polar_exterior_clutch_unavailable",
      )?.authority,
    ).toBe("manual_quote");
  });

  it("projects the normalized Onyx frame, panel, overlap, and application rules", () => {
    const rows = reference.rows.filter(
      (row) => row.productId === "onyx_shutters" && row.scope === "configuration",
    );
    expect(rows.length).toBeGreaterThanOrEqual(40);
    expect(rows.some((row) => row.id === "onyx:configuration:panel:LLRR")).toBe(true);
    expect(rows.some((row) => row.id === "onyx:configuration:pricing:inside:Z Frame Crown")).toBe(true);
    expect(rows.some((row) => row.id === "onyx:configuration:double-hung")).toBe(true);
    expect(rows.some((row) => row.authority === "manual_quote")).toBe(true);
  });
});
