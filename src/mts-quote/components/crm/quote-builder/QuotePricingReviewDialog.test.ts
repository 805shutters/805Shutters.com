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
    await act(() => save.click()); expect(onSave).not.toHaveBeenCalled();
    await act(() => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "900");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(() => save.click());
    expect(document.body.textContent).toContain("Save failed; try again.");
    expect(input.value).toBe("900.00");
    await act(() => save.click());
    expect(onSave).toHaveBeenLastCalledWith("line", "B", 900);
    expect(document.body.textContent).toContain("Price saved");
    await act(() => root.render(React.createElement(QuotePricingReviewDialog, { ...props, lines: [] })));
    expect(document.body.textContent).toContain("Every line has a price");
    expect(document.querySelector('input[aria-label="Custom merchandise price each for Office"]')).toBeNull();
  } finally { await act(() => root.unmount()); host.remove(); }
});
