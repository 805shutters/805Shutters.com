import { describe, expect, it } from "vitest";
import { lotusAmxDonorSkus, LOTUS_AMX_VERSION } from "@/lib/quote/lotus-amx";
import { validateLotusAmx } from "./lotus-amx";
import { productRuleStatusForSelection, validateSelection } from "./rules";
import type { SelectionContext } from "./core";

const selection = (width = 27, height = 72): SelectionContext => ({
  manufacturerId: "lotus", productId: "lotus_mini_blinds", programId: "lotus_amx_1in_aluminum_custom",
  catalogVersion: "test", catalogAsOf: "2026-09-20", widthInches: width, heightInches: height, quantity: 1,
  configuration: { lotus_amx_configuration_version: LOTUS_AMX_VERSION, lotus_color_configuration_version: "lotus-color-v1", color: "White", mount_type: "Inside Mount", lift_system: "Cordless", valance: "None", lotus_measurement_basis: "inside_opening" }, options: {},
});

describe("Lotus typed AMX physical restrictions", () => {
  it("resolves the documented inside cordless configuration and retains old status", () => {
    expect(validateLotusAmx(selection())).toEqual([]);
    expect(productRuleStatusForSelection(selection())).toBe("documented_limited");
    expect(productRuleStatusForSelection({...selection(), configuration:{}})).toBe("restriction_source_incomplete");
    expect(lotusAmxDonorSkus(27,72,"White")).toContain("AMX2772WH");
  });
  it("enforces cut increments, short-donor no-cut and conservative ten-inch height bound", () => {
    expect(lotusAmxDonorSkus(17,36,"White")).toContain("AMX1736WH");
    expect(lotusAmxDonorSkus(16.75,36,"White")).toEqual([]);
    expect(lotusAmxDonorSkus(23.0625,72,"White")).toEqual([]);
    expect(lotusAmxDonorSkus(27,72.5,"White")).toEqual([]);
    expect(lotusAmxDonorSkus(17,26,"White")).toContain("AMX1736WH");
    expect(lotusAmxDonorSkus(17,25,"White")).toEqual([]);
    expect(lotusAmxDonorSkus(96,72,"White")).toEqual([]);
    expect(lotusAmxDonorSkus(27,72,"Invented")).toEqual([]);
  });
  it("rejects unsupported mounting, operation, accessories and dimensions on the server", () => {
    for (const [key, value] of [["mount_type","Outside Mount"],["lift_system","Motorized"],["valance","Decorative"],["lotus_measurement_basis","finished_blind"],["motor_type","Battery"]]) {
      expect(validateLotusAmx({...selection(),configuration:{...selection().configuration,[key]:value}}).some(i=>i.severity==="hard_block")).toBe(true);
    }
    expect(validateSelection(selection(16.75,36)).some(i=>i.ruleId==="lotus.amx.donor_required")).toBe(true);
    expect(validateLotusAmx({...selection(),options:{motorization_selections:["Battery"]}}).some(i=>i.ruleId==="lotus.amx.unsupported_motorization")).toBe(true);
  });
});
