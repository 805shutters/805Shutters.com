// @vitest-environment happy-dom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileMeasurementKeypad } from "./MobileMeasurementKeypad";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
function Harness() {
  const [whole, setWhole] = useState(48);
  return React.createElement(MobileMeasurementKeypad, { widthWhole: whole, heightWhole: 60, widthFraction: "0", heightFraction: "0", onWholeChange: (_, value) => setWhole(value), onFractionChange: () => undefined });
}
function key(digit: string) { return [...host.querySelectorAll<HTMLButtonElement>('[aria-label="width number keypad"] button')].find(button => button.textContent === digit)!; }
async function pointer(button: HTMLButtonElement, type: string, y = 200) {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "touch", pointerId: 1, isPrimary: true, clientX: 120, clientY: y });
  await act(async () => button.dispatchEvent(event));
  return event;
}
beforeEach(async () => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(React.createElement(Harness)));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("measurement keypad touch targeting", () => {
  it("keeps focus steady and enters exactly 8 once when the numeric input is focused", async () => {
    const input = host.querySelector<HTMLInputElement>('input')!;
    input.focus();
    const eight = key("8");
    eight.setPointerCapture = vi.fn();
    const down = await pointer(eight, "pointerdown");
    expect(down.defaultPrevented).toBe(true);
    expect(eight.setPointerCapture).toHaveBeenCalledWith(1);
    expect(document.activeElement).toBe(input);
    await pointer(eight, "pointerup");
    await act(async () => eight.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    expect(input.value).toBe("8");
    await pointer(key("5"), "pointerdown");
    await pointer(key("5"), "pointerup");
    expect(input.value).toBe("85");
  });
  it("does not enter a digit when the gesture scrolls or is canceled", async () => {
    await pointer(key("8"), "pointerdown");
    await pointer(key("8"), "pointermove", 140);
    await pointer(key("8"), "pointerup", 140);
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe("48");
    await pointer(key("8"), "pointerdown");
    await pointer(key("8"), "pointercancel");
    await pointer(key("8"), "pointerup");
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe("48");
  });
  it("preserves keyboard and assistive activation after touch", async () => {
    await pointer(key("8"), "pointerdown");
    await pointer(key("8"), "pointerup");
    await act(async () => key("8").click());
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe("88");
  });
});
