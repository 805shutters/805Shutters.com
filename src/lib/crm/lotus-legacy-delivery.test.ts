import { calculateCustomerCharges, CUSTOMER_CHARGE_POLICY_VERSION } from "@/lib/quote/customer-charges";
import { describe, expect, it, vi } from "vitest";
import { assertLegacyLotusDeliveryAllowed, lotusLegacyDeliveryBlock } from "./lotus-legacy-delivery";

const mlx = { mount_type: "Inside Mount", options_json: {
  catalog_product_id: "lotus_vinyl_blinds", catalog_program_id: "lotus_mlx_1in_vinyl_custom",
  lotus_color_configuration_version: "lotus-color-v1", color: "White",
} };

describe("Lotus source authority at the legacy customer delivery boundary", () => {
  it("blocks a newly routed MLX conflict even with a browser manual-override flag", () => {
    expect(lotusLegacyDeliveryBlock([mlx])).toContain("Lotus MLX dealer-guide and portal prices conflict");
    expect(lotusLegacyDeliveryBlock([{ ...mlx, unit_price: 104.22, options_json: { ...mlx.options_json, manual_price_override: true } }])).toContain("exact configuration");
  });
  it("does not reinterpret old untyped history or unrelated verified program prices", () => {
    expect(lotusLegacyDeliveryBlock([{ supplier: "Lotus", material: "old blind", unit_price: 40 }])).toBeNull();
    expect(lotusLegacyDeliveryBlock([{ options_json: { catalog_product_id: "lotus_mini_blinds", catalog_program_id: "lotus_amx_1in_aluminum_custom" } }])).toBeNull();
  });
  it("requires new typed AMX and roller configurations to use native validation", () => {
    for (const version of [{lotus_vinyl_configuration_version:"lotus-vinyl-v1"},{lotus_amx_configuration_version:"lotus-amx-v1"},{lotus_roller_configuration_version:"lotus-roller-v1"},{lotus_vertical_configuration_version:"lotus-vertical-v1"}]) {
      expect(lotusLegacyDeliveryBlock([{unit_price:999,options_json:{...version,manual_price_override:true}}])).toContain("native quote workflow");
    }
  });
  it("preserves signed contract terms without looking up current catalog selections", async () => {
    const from = vi.fn();
    await assertLegacyLotusDeliveryAllowed({ from } as never, { signed_at: "2026-08-01" });
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects before customer mirror writes and fails closed when selection reads fail", async () => {
    const from = vi.fn((table: string) => table === "sales_quote_line_items"
      ? { select: () => ({ is() { return this; }, eq: async () => ({ data: [{ id: "line" }], error: null }) }) }
      : { select: () => ({ in: async () => ({ data: [mlx], error: null }) }) });
    await expect(assertLegacyLotusDeliveryAllowed({ from } as never, { id: "quote" })).rejects.toThrow("Lotus MLX");
    expect(from.mock.calls.map(call => call[0])).toEqual(["sales_quote_line_items", "sales_quote_designs"]);
    const broken = { from: () => ({ select: () => ({ is() { return this; }, eq: async () => ({ data: null, error: {} }) }) }) };
    await expect(assertLegacyLotusDeliveryAllowed(broken as never, { id: "quote" })).rejects.toThrow("could not be verified");
  });
});

describe("audited staff pricing for legacy catalog conflicts", () => {
  function client(designs: Record<string, unknown>[], overrides: Record<string, unknown>[], error: unknown = null) {
    return { from: (table: string) => ({ select() { return this; }, is() { return this; },
      eq: () => table === "sales_quote_line_items" ? Promise.resolve({ data: [{ id: "line", selected_design_id: "chosen" }], error: null })
        : { in: async () => ({ data: overrides, error }) },
      in: async () => ({ data: designs, error: null }),
    }) } as never;
  }
  const design = { ...mlx, id: "chosen", line_item_id: "line", unit_price: 500, options_json: { ...mlx.options_json, manual_price_override: true } };
  const override = { design_id: "chosen", unit_price: 500, customer_charge_policy: null };
  it("allows a saved audited staff price while rejecting missing or mismatched proof", async () => {
    await expect(assertLegacyLotusDeliveryAllowed(client([design], [override]), { id: "quote" })).resolves.toBeUndefined();
    for (const proof of [[], [{ ...override, unit_price: 499 }], [{ ...override, design_id: "other" }]]) {
      await expect(assertLegacyLotusDeliveryAllowed(client([design], proof), { id: "quote" })).rejects.toThrow("save an explicit custom price");
    }
  });
  it("allows merchandise plus fixed service charges and an explicit line discount", async () => {
    const charges = calculateCustomerCharges({ product: "blind", physicalUnitsPerWindow: 1, quantity: 2 });
    const priced = { ...design, unit_price: 439, options_json: { ...design.options_json,
      manual_customer_charge_policy: CUSTOMER_CHARGE_POLICY_VERSION, manual_merchandise_unit_price: 500,
      customer_charges: charges, discount_percent: 20, discount_source_price: 539,
    } };
    const proof = { ...override, customer_charge_policy: CUSTOMER_CHARGE_POLICY_VERSION };
    await expect(assertLegacyLotusDeliveryAllowed(client([priced], [proof]), { id: "quote" })).resolves.toBeUndefined();
    await expect(assertLegacyLotusDeliveryAllowed(client([{ ...priced, unit_price: 400 }], [proof]), { id: "quote" })).rejects.toThrow("custom price");
  });
  it("ignores an unselected alternative and fails closed on an audit read error", async () => {
    await expect(assertLegacyLotusDeliveryAllowed(client([{ ...mlx, id: "unused", line_item_id: "line" }], []), { id: "quote" })).resolves.toBeUndefined();
    await expect(assertLegacyLotusDeliveryAllowed(client([design], [], {}), { id: "quote" })).rejects.toThrow("Saved staff prices could not be verified");
  });
});
