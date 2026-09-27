// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ShadesAndBlindsOptions } from "./DesignCard";
import { SelectQuickButtonsProvider } from "@mts/components/ui/select";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const update = vi.fn();
beforeEach(() => { update.mockReset(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(() => root.unmount()); host.remove(); });
async function render(design: Partial<SalesQuoteDesign>, productType = "Roller Shades") {
  await act(() => root.render(React.createElement(SelectQuickButtonsProvider, {},
    React.createElement(ShadesAndBlindsOptions, {
      design: design as SalesQuoteDesign, productType, authoritativeV2: false,
      lineItem: { id: "line", quantity: 1, width_whole: 45, height_whole: 36, width_fraction: "0", height_fraction: "0" } as SalesQuoteLineItem,
      onUpdate: vi.fn(), onUpdateFields: update, sideBySideLineOptions: [], onSideBySidePairChange: vi.fn(), onClearSideBySidePartner: vi.fn(),
    }))));
}
it("saves a usable canonical motor from the actual older-quote control", async () => {
  const design = { supplier: "Norman", shade_type: "Single Shade", lift_system: "Motorized",
    valance: '4 1/2" Fabric Valance*', motor_type: "Single Motor (Battery)",
    options_json: { catalog_product_id: "roller", roller_tube: "All Tubes" } };
  await render(design as Partial<SalesQuoteDesign>);
  const power = host.querySelector('[data-option-field="json:power_configuration"]')!;
  const choice = [...power.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === "Norman Smart Rechargeable Battery with Charging Wand & AC Adapter Charger");
  expect(choice).toBeDefined();
  await act(() => choice!.click());
  expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ motor_type: "Motor", options_json: expect.objectContaining({
    roller_application: "Single Shade", top_treatment_class: "Fabric Valance", roller_tube: null,
    power_configuration: "Norman Smart Rechargeable Battery with Charging Wand & AC Adapter Charger",
    motorization_selections: [{ groupId: "smart_motorization", optionId: "motor", role: "base_motor", units: 1 }],
  }) }));
});
it("does not reoffer an incompatible saved honeycomb operating system", async () => {
  const design = { supplier: "Norman", lift_system: "SmartFit for Sloped Windows", options_json: { cell_size: '3/4" Single Cell' } };
  await render(design as Partial<SalesQuoteDesign>, "Honeycomb Shades");
  expect(update).not.toHaveBeenCalled();
  const summary = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes("Operating SystemSmartFit for Sloped Windows"));
  expect(summary).toBeDefined();
  await act(() => summary!.click());
  const controls = host.querySelector('[data-option-field="lift_system"]')!;
  expect(controls).not.toBeNull();
  expect([...controls.querySelectorAll('button')].some(button => button.textContent?.trim() === "SmartFit for Sloped Windows")).toBe(false);
  expect([...controls.querySelectorAll('button')].some(button => button.textContent?.trim() === "SmartRise Cordless")).toBe(true);
  expect(update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ lift_system: null }));
  expect(design.lift_system).toBe("SmartFit for Sloped Windows");
});
