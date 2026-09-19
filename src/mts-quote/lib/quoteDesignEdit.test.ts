import { describe, expect, it } from "vitest";
import { applyQuoteDesignEdit, captureQuoteDesignEdit } from "./quoteDesignEdit";

const row = { line_item_id: "line", variant: "A", options_json: { catalog_product_id: "synchrony_vertical", draw_direction: "Left Draw" } };
describe("queued quote option intent", () => {
  it("keeps rapid stack, control and hardware selections from the same rendered row", () => {
    const edits = [
      { stack_option: "Stack Left" },
      { control_type: "Cordless Wand Operation" },
      { vertical_hardware_color: "Nature" },
    ].map(change => captureQuoteDesignEdit({ ...row, options_json: { ...row.options_json, ...change } }, row));
    let saved = row;
    for (const edit of edits) saved = { ...saved, ...applyQuoteDesignEdit(edit, saved) } as typeof row;
    expect(saved.options_json).toEqual({ ...row.options_json, stack_option: "Stack Left", control_type: "Cordless Wand Operation", vertical_hardware_color: "Nature" });
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });
  it("preserves explicit nulls, removals and clean catalog changes", () => {
    const before = { ...row, options_json: { ...row.options_json, fabric_color_code: "8078", motor_type: "old", remote_type: "old" } };
    const edit = captureQuoteDesignEdit({ ...row, options_json: { catalog_product_id: "roman", motor_type: null } }, before);
    expect(applyQuoteDesignEdit(edit, before).options_json).toEqual({ catalog_product_id: "roman", motor_type: null });
  });
  it("applies the last user choice after a preceding response refresh", () => {
    const first = captureQuoteDesignEdit({ ...row, options_json: { ...row.options_json, stack_option: "Stack Left" } }, row);
    const last = captureQuoteDesignEdit({ ...row, options_json: { ...row.options_json, stack_option: "Stack Right" } }, row);
    const saved = applyQuoteDesignEdit(first, row);
    expect(applyQuoteDesignEdit(last, saved).options_json).toMatchObject({ stack_option: "Stack Right" });
  });
  it("leaves ordinary fields and legacy replacement semantics unchanged", () => {
    expect(applyQuoteDesignEdit({design: {...row, mount_type: "Inside Mount", options_json: { catalog_product_id: "roman" }}}, row).options_json).toEqual({ catalog_product_id: "roman" });
    const edit = captureQuoteDesignEdit({line_item_id:"line",variant:"A",mount_type:"Outside Mount"}, row);
    expect(applyQuoteDesignEdit(edit, row)).not.toHaveProperty("options_json");
  });
});
