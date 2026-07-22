import { describe, expect, it } from "vitest";
import { getProgram, listProducts } from "@/lib/quote/catalog";

describe("authoritative pricing-family metadata", () => {
  it("keeps every program-level family complete and anchored to one self-identifying baseline", () => {
    for (const product of listProducts()) {
      for (const program of product.programs) {
        const familyId = program.pricingFamilyId?.trim() || null;
        const baselineId = program.baselineProgramId?.trim() || null;
        expect(Boolean(familyId), `${product.id}/${program.id} family pair`).toBe(
          Boolean(baselineId),
        );
        if (!familyId || !baselineId) continue;

        const baseline = getProgram(product, baselineId);
        expect(baseline, `${product.id}/${program.id} baseline exists`).toBeDefined();
        expect(baseline?.pricingFamilyId).toBe(familyId);
        expect(baseline?.baselineProgramId).toBe(baseline?.id);
      }
    }
  });

  it("keeps product-level families explicit, non-overlapping, and internally complete", () => {
    for (const product of listProducts()) {
      const familyIds = new Set<string>();
      const memberIds = new Set<string>();
      for (const family of product.pricingFamilies ?? []) {
        expect(family.id.trim()).not.toBe("");
        expect(familyIds.has(family.id), `${product.id}/${family.id} unique`).toBe(false);
        familyIds.add(family.id);
        expect(family.memberProgramIds).toContain(family.baselineProgramId);
        expect(getProgram(product, family.baselineProgramId)).toBeDefined();

        for (const memberId of family.memberProgramIds) {
          expect(getProgram(product, memberId), `${product.id}/${memberId} exists`).toBeDefined();
          expect(memberIds.has(memberId), `${product.id}/${memberId} in one family`).toBe(false);
          memberIds.add(memberId);
        }
      }
    }
  });

  it("pins every known Polar shade price-group family to Group 1", () => {
    const expectedCounts: Record<string, number> = {
      polar_interior_roller: 14,
      polar_elite_patio: 10,
      polar_titan_patio: 10,
      polar_mega_exterior: 10,
    };

    for (const [productId, memberCount] of Object.entries(expectedCounts)) {
      const product = listProducts().find((entry) => entry.id === productId);
      expect(product?.pricingFamilies).toHaveLength(1);
      expect(product?.pricingFamilies?.[0]).toMatchObject({
        baselineProgramId: "group_1",
      });
      expect(product?.pricingFamilies?.[0].memberProgramIds).toHaveLength(
        memberCount,
      );
    }
  });

  it("marks Polar Drapery and every Awning source grid as standalone, not inferred families", () => {
    const drapery = listProducts().find(
      (entry) => entry.id === "polar_drapery_track",
    );
    const awnings = listProducts().filter(
      (entry) => entry.manufacturer === "Polar" && entry.productType === "Awnings",
    );

    expect(drapery?.programs).toHaveLength(28);
    expect(drapery?.programs.every((program) =>
      program.priceGroup === null &&
      !program.pricingFamilyId &&
      !program.baselineProgramId &&
      Boolean(program.sourcePages?.length)
    )).toBe(true);
    expect(awnings).toHaveLength(5);
    expect(awnings.every((product) =>
      product.programs.length === 1 &&
      product.programs[0].id === "standard" &&
      product.programs[0].priceGroup === null &&
      Boolean(product.programs[0].sourcePages?.length)
    )).toBe(true);

    expect(drapery?.freightStatus).toBe("unresolved");
    expect(awnings.every((product) => product.freightStatus === "unresolved")).toBe(true);
  });
});
