import { expect, it } from "vitest";
import fixtures from "@/lib/crm/sales-quote-norman-price.fixtures.json";
import { prepareNormanLegacyPricing, type NormanQuotePricingState } from "@/lib/crm/sales-quote-norman-price";
import { priceDesign } from "@/lib/quote/pricing";
import { setRollerPowerConfiguration } from "./DesignCard";

it("prices a legacy roller motor selection through the unchanged server validator and restores cordless", () => {
  const selection = fixtures.find(row => row.selection.productId === "roller")!.selection;
  const configuration = selection.configuration;
  const state = {
    quote: { id: "quote", status: "draft", sent_at: null, quote_v2_backend: false },
    lines: [{ id: "line", quote_id: "quote", selected_design_id: "design", product_type: "Roller Shades",
      width_whole: 36, width_fraction: "1/2", height_whole: 60, height_fraction: "1/4", quantity: 3, sort_order: 1 }],
    designs: [{ id: "design", line_item_id: "line", variant: "A", supplier: "Norman", unit_price: 645,
      mount_type: "Inside Mount", lift_system: "Cordless", motor_type: null, valance: "Square Fascia*", fabric: "Amelia",
      options_json: { ...configuration, catalog_product_id: "roller", catalog_program_id: selection.programId,
        fabric_color_collection: "Amelia", top_treatment_class: "Square Fascia", roller_top_treatment: "Square Fascia", roller_tube: "All Tubes", tube_class: null },
    }],
  } as unknown as NormanQuotePricingState;
  const design = state.designs[0];
  const list = priceDesign({
    productId: "roller", programId: selection.programId, widthInches: 36.5, heightInches: 60.25,
  }, "2026-09-26");
  expect(list.ok, JSON.stringify(list)).toBe(true);
  if (list.ok) expect(list.base).toBe(467);
  const blockedQuote = () => {
    const priced = prepareNormanLegacyPricing(state, "2026-09-26")[0];
    expect(priced.priceStatus, JSON.stringify(priced)).toBe("blocked");
    expect(priced.customerPrice).toMatchObject({ ok: false, code: "NO_SITE_PRICE" });
    expect(priced.rpcResult.authoritativeSnapshot).toBeNull();
    expect(priced.rpcResult.validationSnapshot).toMatchObject({ pricingFailure: { code: "NO_SITE_PRICE" } });
  };
  blockedQuote();
  design.lift_system = "Motorized";
  design.motor_type = "Single Motor (Battery)";
  expect(prepareNormanLegacyPricing(state, "2026-09-26")[0].priceStatus).toBe("blocked");
  design.motor_type = setRollerPowerConfiguration(design.options_json!, "Norman Smart Rechargeable Battery with Charging Wand & AC Adapter Charger");
  expect(design.motor_type).toBeTruthy();
  expect(design.options_json!.power_configuration).toBe("Norman Smart Rechargeable Battery with Charging Wand & AC Adapter Charger");
  blockedQuote();
  design.lift_system = "Cordless";
  design.motor_type = setRollerPowerConfiguration(design.options_json!, null);
  design.options_json!.tube_class = "All Tubes";
  expect(design.motor_type).toBeNull();
  expect(design.options_json!.power_configuration).toBeNull();
  blockedQuote();
});
