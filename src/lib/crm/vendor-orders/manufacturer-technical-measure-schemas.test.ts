import { describe, expect, it } from "vitest";
import { manufacturerOrderFormRegistry } from "@/lib/crm/vendor-orders/manufacturer-order-form-registry";
import { resolveManufacturerTechnicalMeasureSchema } from "@/lib/crm/vendor-orders/manufacturer-technical-measure-schemas";

describe("manufacturer technical measure schemas", () => {
  it("resolves one dedicated technical-measure schema for every registered order form", () => {
    const entries = Object.values(manufacturerOrderFormRegistry().manufacturers).flat();
    expect(entries).toHaveLength(43);
    for (const entry of entries) {
      const schema = resolveManufacturerTechnicalMeasureSchema({
        manufacturer: entry.manufacturer,
        product_id: entry.product_key,
        program_id: entry.product_key,
      });
      expect(schema?.routingKey).toBe(entry.routing_key);
      expect(schema?.productName).toBe(entry.product_name);
      expect(schema?.fields.length).toBeGreaterThan(0);
      expect(new Set(schema?.fields.map((field) => field.key)).size).toBe(schema?.fields.length);
      expect(schema?.technicalMeasureDocxUrl).toMatch(/^\/technical-measure-templates\/.+\.docx$/);
      expect(schema?.technicalMeasurePdfUrl).toMatch(/^\/technical-measure-templates\/.+\.pdf$/);
      expect(schema?.orderTemplateDocxUrl).toMatch(/^\/order-form-templates\/.+\.docx$/);
      expect(schema?.orderTemplatePdfUrl).toMatch(/^\/order-form-templates\/.+\.pdf$/);
    }
  });

  it("keeps Norman Roller and Onyx shutter measurement fields separate", () => {
    const roller = resolveManufacturerTechnicalMeasureSchema({
      manufacturer: "Norman",
      product_id: "roller",
      program_id: "roller",
    });
    const onyx = resolveManufacturerTechnicalMeasureSchema({
      manufacturer: "Onyx",
      product_id: "onyx_shutters",
      program_id: "poly_composite",
    });
    expect(roller?.fields.map((field) => field.key)).toContain("railroad_seam_placement");
    expect(roller?.fields.map((field) => field.key)).not.toContain("panel_config");
    expect(onyx?.fields.map((field) => field.key)).toContain("panel_config");
    expect(onyx?.fields.map((field) => field.key)).not.toContain("railroad_seam_placement");
    expect(roller?.technicalMeasureDocxUrl).not.toBe(onyx?.technicalMeasureDocxUrl);
    expect(roller?.orderTemplateDocxUrl).not.toBe(onyx?.orderTemplateDocxUrl);
  });

  it("fails closed when manufacturer or product identity is not exact", () => {
    expect(resolveManufacturerTechnicalMeasureSchema({
      manufacturer: "Norman",
      product_id: "roller",
    })?.routingKey).toBe("norman:roller");
    expect(resolveManufacturerTechnicalMeasureSchema({
      manufacturer: "Norman",
      product_id: "mystery_product",
    })).toBeNull();
  });
});
