// @vitest-environment happy-dom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { NormanRollerAdditionalOptions } from "./NormanRollerAdditionalOptions";
import { ROLLER_ACCESSORY_KEY, emptyRollerAccessories } from "@/lib/quote/norman-roller-accessories";
import { ROLLER_HARDWARE_KEY, emptyRollerHardware } from "@/lib/quote/norman-roller-hardware";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(() => root.unmount()); host.remove(); });
const initial = { id: "sample", lift_system: "Cordless", mount_type: "Inside Mount", options_json: { historical_note: "keep" } } as unknown as SalesQuoteDesign;
function Fixture() {
  const [design, setDesign] = useState(initial);
  return React.createElement(NormanRollerAdditionalOptions, { design, onUpdateFields: fields => setDesign(old => ({ ...old, ...fields })) });
}
async function select(label: string, value: string) {
  await act(() => {
    const node = host.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
    node.value = value; node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function save(label: string) {
  await act(() => [...host.querySelectorAll("button")].find(b => b.textContent === label)!.click());
}

describe("compact Roller quote details", () => {
  it("starts collapsed without idle saves or status paragraphs; drafts survive closing and reopening", async () => {
    await act(() => root.render(React.createElement(Fixture)));
    const panel = host.querySelector("details")!;
    expect(panel.open).toBe(false);
    expect(host.textContent).not.toContain("No unsaved");
    expect(host.querySelectorAll("button")).toHaveLength(0);
    await act(() => { panel.open = true; });
    await select("Roller shim layers", "2");
    expect(host.querySelector('[aria-label="Roller hardware installation"]')).not.toBeNull();
    await act(() => { panel.open = false; panel.open = true; });
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Roller shim layers"]')!.value).toBe("2");
    await save("Save Roller hardware");
    expect(host.querySelector("summary")!.textContent).toContain("2 shim layers");
    expect(host.querySelector('[data-unsaved]')).toBeNull();
    await select("Roller hold-downs", "Magnetic");
    await select("Roller magnet catch color", "Black");
    await save("Save Roller accessories");
    expect(host.querySelector("summary")!.textContent).toContain("2 shim layers / Magnetic hold-downs · Black");
    await select("Roller hold-downs", "None");
    await save("Save Roller accessories");
    expect(host.querySelector("summary")!.textContent).not.toContain("Magnetic");
    expect(host.querySelector("summary")!.textContent).toContain("2 shim layers");
  });

  it("keeps saved add-ons visible in the closed summary and retains hidden installation evidence", async () => {
    const hardware = { ...emptyRollerHardware(), shimLayers: 1, raceway: true };
    const accessories = { ...emptyRollerAccessories(), holdDown: "Magnetic" as const, leftClearance: 1, rightClearance: 2, bottomClearance: 3 };
    let updated: Partial<SalesQuoteDesign> | undefined;
    await act(() => root.render(React.createElement(NormanRollerAdditionalOptions, {
      design: { ...initial, options_json: { ...initial.options_json, [ROLLER_HARDWARE_KEY]: hardware, [ROLLER_ACCESSORY_KEY]: accessories } },
      onUpdateFields: fields => { updated = fields; },
    })));
    expect(host.querySelector("summary")!.textContent).toContain("1 shim layer / Raceway / Magnetic hold-downs");
    await select("Roller magnet catch color", "Black");
    await save("Save Roller accessories");
    expect(updated?.options_json).toEqual({ historical_note: "keep", [ROLLER_HARDWARE_KEY]: hardware, [ROLLER_ACCESSORY_KEY]: { ...accessories, magnetColor: "Black" } });
  });
});
