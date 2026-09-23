// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeasurementGridModal } from "./MeasurementGridModal";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
type Measurement = { whole: number; fraction: string };
let save: ReturnType<typeof vi.fn<(width: Measurement, height: Measurement, reviewedSides?: readonly ("width" | "height")[]) => void>>;
let close: ReturnType<typeof vi.fn<() => void>>;
let overrides: Partial<React.ComponentProps<typeof MeasurementGridModal>>;
async function render(patch: typeof overrides = {}) {
  overrides = { ...overrides, ...patch };
  await act(() => root.render(React.createElement(MeasurementGridModal, { open: true, showDirectEntry: true, step: "width_whole",
    pendingWidth: null, pendingHeight: null, onClose: close, onDirectMeasurements: save,
    onWidthWhole: vi.fn(), onWidthFraction: vi.fn(), onHeightWhole: vi.fn(), onHeightFraction: vi.fn(),
    ...overrides })));
}
function dialog() { return document.querySelector<HTMLElement>('[role="dialog"]')!; }
function button(label: string) {
  const found = [...dialog().querySelectorAll<HTMLButtonElement>("button")].find(node =>
    node.getAttribute("aria-label") === label || node.textContent?.trim() === label);
  if (!found) throw new Error(`Missing calculator button ${label}`);
  return found;
}
async function click(label: string) { await act(() => button(label).click()); }
async function typeWhole(value: string) {
  await act(() => {
    const input = dialog().querySelector("input")!;
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  save = vi.fn<(width: Measurement, height: Measurement, reviewedSides?: readonly ("width" | "height")[]) => void>(); close = vi.fn<() => void>(); overrides = {};
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); });

describe("quote size calculator", () => {
  it("enters width then height with digits and sixteenths and saves both exactly once", async () => {
    await render();
    await click("3"); await click("6"); await click("1/2");
    expect(save).not.toHaveBeenCalled();
    await click("Next: height");
    expect(dialog().querySelector("input")?.getAttribute("aria-label")).toBe("height whole inches");
    await click("6"); await click("0"); await click("All 16ths"); await click("3/16");
    await click("Save size");
    expect(save).toHaveBeenCalledExactlyOnceWith({ whole: 36, fraction: "1/2" }, { whole: 60, fraction: "3/16" }, ["width", "height"]);
    expect(close).not.toHaveBeenCalled();
  });

  it.each(["width", "height"] as const)("saves a %s-only component without requiring the other dimension", async measurementAxis => {
    await render({ measurementAxis, pendingWidth: { whole: 999, fraction: "0" }, pendingHeight: { whole: 999, fraction: "0" } });
    expect(dialog().querySelectorAll('[aria-label="Choose dimension"] button')).toHaveLength(1);
    expect(dialog().textContent).not.toContain("Next: height");
    await click("6"); await click("0"); await click("1/4"); await click("Save size");
    const entered = { whole: 60, fraction: "1/4" }, unused = { whole: 0, fraction: "0" };
    expect(save).toHaveBeenCalledExactlyOnceWith(measurementAxis === "width" ? entered : unused, measurementAxis === "height" ? entered : unused, [measurementAxis]);
  });

  it("rejects empty or out-of-range sizes and permits correction", async () => {
    await render(); await click("Next: height"); await click("Save size");
    expect(save).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("Enter a width");
    await render({ open: false });
    await render({ open: true, pendingWidth: { whole: 36, fraction: "0" }, pendingHeight: { whole: 60, fraction: "0" } });
    await typeWhole("251"); await click("Next: height"); await click("Save size");
    expect(save).not.toHaveBeenCalled();
    await act(() => dialog().querySelector<HTMLButtonElement>('[aria-label="Choose dimension"] button')!.click());
    await typeWhole("36"); await click("Next: height"); await click("Save size");
    expect(save).toHaveBeenCalledExactlyOnceWith({ whole: 36, fraction: "0" }, { whole: 60, fraction: "0" }, ["width", "height"]);
  });

  it("does not restore and save a previous whole value after its input is cleared", async () => {
    await render({ pendingWidth: { whole: 36, fraction: "0" }, pendingHeight: { whole: 60, fraction: "0" } });
    await typeWhole("");
    await act(() => dialog().querySelector<HTMLInputElement>("input")!.blur());
    await click("Next: height"); await click("Save size");
    expect(save).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="alert"]')).not.toBeNull();
  });

  it("retains the entered size during a save failure and retries without duplicate saves or closing", async () => {
    await render(); await click("4"); await click("8"); await click("1/2");
    await click("Next: height"); await click("7"); await click("2"); await click("Save size");
    await render({ saving: true });
    expect(dialog().querySelector("fieldset")?.disabled).toBe(true);
    expect(dialog().querySelector('[role="status"]')?.textContent).toContain("Saving measurements");
    await click("Save size"); await click("Close");
    expect(save).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
    await render({ saving: false, saveError: "Connection interrupted" });
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("Connection interrupted");
    expect(dialog().textContent).toContain("48 1/2″"); expect(dialog().textContent).toContain("72″");
    await click("Save size");
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ whole: 48, fraction: "1/2" }, { whole: 72, fraction: "0" }, ["width", "height"]);
  });

  it("cancels without saving the edited size and reopens the original saved values", async () => {
    await render({ pendingWidth: { whole: 36, fraction: "0" }, pendingHeight: { whole: 60, fraction: "0" } });
    await click("9"); await click("Close");
    expect(close).toHaveBeenCalledExactlyOnceWith(); expect(save).not.toHaveBeenCalled();
    await render({ open: false }); await render({ open: true });
    expect(dialog().textContent).toContain("36″"); expect(dialog().textContent).toContain("60″");
  });

  it("opens height first when the height control is selected", async () => {
    await render({ step: "height_whole", pendingWidth: { whole: 29, fraction: "0" }, pendingHeight: { whole: 58, fraction: "0" } });
    expect(dialog().querySelector("input")?.getAttribute("aria-label")).toBe("height whole inches");
    await click("6"); await click("2"); await click("Save size");
    expect(save).toHaveBeenCalledExactlyOnceWith({ whole: 29, fraction: "0" }, { whole: 62, fraction: "0" }, ["height"]);
  });

  it("supports the field-measure range and eighths without losing an existing sixteenth", async () => {
    await render({ wholeStart: 10, wholeEnd: 125, fractions: ["0", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"],
      pendingWidth: { whole: 29, fraction: "0" }, pendingHeight: { whole: 58, fraction: "3/16" } });
    expect(dialog().textContent).not.toContain("Select whole inches");
    await click("1"); await click("2"); await click("5"); await click("All 8ths"); await click("7/8");
    await click("Next: height"); await click("Save size");
    expect(save).toHaveBeenCalledExactlyOnceWith({ whole: 125, fraction: "7/8" }, { whole: 58, fraction: "3/16" }, ["width", "height"]);
  });

  it.each(["9", "126"])("rejects %s outside the technical measure range", async value => {
    await render({ wholeStart: 10, wholeEnd: 125, pendingWidth: { whole: 29, fraction: "0" }, pendingHeight: { whole: 58, fraction: "0" } });
    await typeWhole(value); await click("Next: height"); await click("Save size");
    expect(save).not.toHaveBeenCalled(); expect(dialog().querySelector('[role="alert"]')).not.toBeNull();
  });

  it("uses backspace and clear before saving a single labeled location measurement", async () => {
    await render({ measurementAxis: "width", singleDimensionLabel: "Divider rail location", wholeStart: 1, wholeEnd: 119 });
    expect(dialog().textContent).toContain("Divider rail location");
    await click("9"); await click("8"); await click("Backspace");
    expect(dialog().querySelector("input")?.value).toBe("9");
    await click("Clear whole inches"); await click("2"); await click("9"); await click("1/2"); await click("Save size");
    expect(save).toHaveBeenCalledExactlyOnceWith({ whole: 29, fraction: "1/2" }, { whole: 0, fraction: "0" }, ["width"]);
  });

});
