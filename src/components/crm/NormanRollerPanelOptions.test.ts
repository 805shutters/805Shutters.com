import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,it,expect} from "vitest";
import type {SalesQuoteDesign} from "@mts/types/quote";
import {NormanRollerPanelOptions} from "./NormanRollerPanelOptions";
const render=(options:Record<string,unknown>)=>renderToStaticMarkup(createElement(NormanRollerPanelOptions,{design:{lift_system:"Motorized",options_json:options} as unknown as SalesQuoteDesign,onUpdateFields:()=>{}}));
describe("Roller panel control uses production picker fields",()=>{
 it.each(["power_configuration","roller_power_configuration"])("shows panel membership for %s",key=>{
  const html=render({[key]:"Automate Low Voltage DC Motor",dc_power_supply:"DC Distribution Panel",shared_power_panel_id:"Panel 2"});
  expect(html).toContain('aria-label="Roller Automate shared power panel"');expect(html).toMatch(/selected="">Panel 2/);
 });
 it("does not allow an incompatible current motor through a stale alias",()=>{
  const html=render({roller_power_configuration:"AutoWand",power_configuration:"Automate Low Voltage DC Motor",dc_power_supply:"DC Distribution Panel",shared_power_panel_id:"Panel 1"});expect(html).toContain("Clear Roller shared panel");expect(html).not.toContain('aria-label="Roller Automate shared power panel"');
 });
});
