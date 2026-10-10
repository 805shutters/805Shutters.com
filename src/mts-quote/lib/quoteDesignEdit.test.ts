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
  it("retains split tilt on reopen, independently of divider rails and another alternative", () => {
    const original = { line_item_id: "bedroom-c", variant: "A", options_json: {
      split_tilt: "No", divider_rail: "No", manual_price_override: 622.85,
    }};
    const alternative = { ...original, variant: "B", options_json: { ...original.options_json } };
    const splitEdit = captureQuoteDesignEdit({ ...original, options_json: { ...original.options_json, split_tilt: "Yes" } }, original);
    const railEdit = captureQuoteDesignEdit({ ...original, options_json: { ...original.options_json, divider_rail: "Yes" } }, original);
    const saved = applyQuoteDesignEdit(splitEdit, original);
    const reopened = JSON.parse(JSON.stringify(saved));
    expect(reopened.options_json).toEqual({ split_tilt: "Yes", divider_rail: "No", manual_price_override: 622.85 });
    const withRail = applyQuoteDesignEdit(railEdit, reopened);
    expect(withRail.options_json).toMatchObject({ split_tilt: "Yes", divider_rail: "Yes" });
    expect(alternative.options_json).toMatchObject({ split_tilt: "No", divider_rail: "No" });
    const unsplit = captureQuoteDesignEdit({ ...reopened, options_json: { ...reopened.options_json, split_tilt: "No" } }, reopened);
    expect(applyQuoteDesignEdit(unsplit, reopened).options_json).toEqual(original.options_json);
  });
});
