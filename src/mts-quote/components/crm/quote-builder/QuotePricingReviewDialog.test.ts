// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { QuotePricingReviewDialog } from "./QuotePricingReviewDialog";
import type { SalesQuoteLineItem, SalesQuoteDesign } from "@mts/types/quote";
import { QUOTE_V2_SELECTED_DESIGN_MARKER } from "@/lib/quote-v2/selected-design";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("keeps an unsuccessful price visible, saves the selected alternative, and reports completion after refresh", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const onSave = vi.fn().mockRejectedValueOnce(new Error("Save failed; try again.")).mockResolvedValue(undefined);
  const line = { id: "line", room_name: "Office", product_type: "Roller Shades", quantity: 3, width_whole: 36, height_whole: 60 } as SalesQuoteLineItem;
  const designs = ["A", "B"].map(variant => ({ id: variant, line_item_id: "line", variant,
    [QUOTE_V2_SELECTED_DESIGN_MARKER]: variant === "B", unit_price: 0,
    options_json: { authoritative_price_status: "blocked", authoritative_price_error: "Choose a power system" },
  })) as unknown as SalesQuoteDesign[];
  const props = { open: true, onClose: vi.fn(), onEdit: vi.fn(), lines: [line], designs, onSave };
  try {
    await act(() => root.render(React.createElement(QuotePricingReviewDialog, props)));
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Custom merchandise price each for Office"]')!;
    const save = document.querySelector<HTMLButtonElement>('button[aria-label="Save price for Office"]')!;
    expect(input.value).toBe("");
    await act(async () => save.click()); expect(onSave).not.toHaveBeenCalled();
    await act(() => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "900");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => save.click());
    expect(document.body.textContent).toContain("Save failed; try again.");
    expect(input.value).toBe("900.00");
    await act(async () => save.click());
    expect(onSave).toHaveBeenLastCalledWith("line", "B", 900);
    expect(document.body.textContent).toContain("Price saved");
    await act(() => root.render(React.createElement(QuotePricingReviewDialog, { ...props, designs: designs.map(d => d.variant === "B" ? { ...d, unit_price: 900, options_json: { manual_price_override: true } } : d) })));
    expect(document.body.textContent).toContain("Every line has a saved price");
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Custom merchandise price each for Office"]')!.value).toBe("900.00");
  } finally { await act(() => root.unmount()); host.remove(); }
});


it("holds delivery while a custom price is dirty, saving, or failed, and retains zero after saving", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  let finishSave!: () => void;
  const onSave = vi.fn().mockRejectedValueOnce(new Error("Connection interrupted"))
    .mockImplementationOnce(() => new Promise<void>(resolve => { finishSave = resolve; }));
  const onContinue = vi.fn();
  const line = { id: "line", room_name: "Office", product_type: "Roller Shades", quantity: 2, width_whole: 36, height_whole: 60 } as SalesQuoteLineItem;
  const design = { id: "design", line_item_id: "line", variant: "A", unit_price: 100,
    options_json: { manual_price_override: true } } as unknown as SalesQuoteDesign;
  const props = { open: true, onClose: vi.fn(), onEdit: vi.fn(), lines: [line], designs: [design], onSave, onContinue };
  const continueButton = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Continue to Send Quote")!;
  try {
    await act(() => root.render(React.createElement(QuotePricingReviewDialog, props)));
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Custom merchandise price each for Office"]')!;
    const save = document.querySelector<HTMLButtonElement>('button[aria-label="Save price for Office"]')!;
    expect(input.value).toBe("100.00");
    expect(continueButton().disabled).toBe(false);
    await act(() => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "0");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(continueButton().disabled).toBe(true);
    await act(async () => save.click());
    expect(document.body.textContent).toContain("Connection interrupted");
    expect(continueButton().disabled).toBe(true);
    await act(() => save.click());
    expect(save.disabled).toBe(true);
    expect(continueButton().disabled).toBe(true);
    await act(async () => finishSave());
    await act(() => root.render(React.createElement(QuotePricingReviewDialog, { ...props, designs: [{ ...design, unit_price: 0 }] })));
    expect(input.value).toBe("0.00");
    expect(continueButton().disabled).toBe(false);
    await act(() => continueButton().click());
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenLastCalledWith("line", "A", 0);
    await act(() => root.render(React.createElement(QuotePricingReviewDialog, { ...props, deliveryDisabled: true })));
    expect(continueButton().disabled).toBe(true);
  } finally { await act(() => root.unmount()); host.remove(); }
});
