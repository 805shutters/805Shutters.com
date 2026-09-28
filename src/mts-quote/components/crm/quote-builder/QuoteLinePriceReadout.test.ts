// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QuoteLinePriceReadout } from "./QuoteLinePriceReadout";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const props = { unitPrice: 0, lineTotal: 0, roomName: "Bedroom 1", manualPrice: null, onSave: async () => {} };
describe("quote line calculation and custom entry", () => {
  it.each(["blocked", "stale", "unpriceable"])("makes a %s calculation directly editable without manufacturing a zero", state => {
    const issue = state === "stale" ? "Requested catalog identity is not the server-selected catalog." : "Lakeside F0183: no price at 91 × 48.";
    const html = renderToStaticMarkup(React.createElement(QuoteLinePriceReadout, { ...props, issue }));
    expect(html).toContain(issue);
    expect(html).toContain("Your custom price can still be saved and sent.");
    expect(html).toContain('aria-label="Custom merchandise price each for Bedroom 1"');
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).not.toContain("$0.00");
    expect(html).not.toContain('value="0.00"');
    expect(html).not.toContain("Enter your price");
    expect(html).not.toContain("Set custom price");
  });
  it("shows calculated amounts and accepts a genuine authoritative zero", () => {
    const paid = renderToStaticMarkup(React.createElement(QuoteLinePriceReadout, { ...props, unitPrice: 623.45, lineTotal: 2493.8, issue: null }));
    expect(paid).toContain("$623.45 each");
    expect(paid).toContain("$2,493.80 line total");
    const free = renderToStaticMarkup(React.createElement(QuoteLinePriceReadout, { ...props, issue: null }));
    expect(free).toContain("$0.00 each");
    expect(free).not.toContain("Price unavailable");
  });
  it("keeps custom pricing available without saving a blank or manufacturing a zero", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); const save = vi.fn().mockResolvedValue(undefined);
    try {
      await act(() => root.render(React.createElement(QuoteLinePriceReadout, { ...props, issue: "Grid unavailable", onSave: save })));
      const input = host.querySelector("input")!;
      expect(input.value).toBe("");
      expect(input.getAttribute("aria-label")).toBe("Custom merchandise price each for Bedroom 1");
      await act(async () => host.querySelector("button")!.click());
      expect(save).not.toHaveBeenCalled();
      await act(() => {
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "900");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => host.querySelector("button")!.click());
      expect(save).toHaveBeenCalledExactlyOnceWith(900);
    } finally { await act(() => root.unmount()); host.remove(); }
  });
  it("lets Harwood's catalog-blocked line save zero and retry a failed custom-price write", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const save = vi.fn().mockRejectedValueOnce(new Error("Connection lost. Try again.")).mockResolvedValueOnce(undefined);
    try {
      await act(() => root.render(React.createElement(QuoteLinePriceReadout, {
        ...props, issue: "Application is required before this configuration can be priced or sent. The selected cell size is not offered for this Honeycomb operating system/application.", onSave: save,
      })));
      expect(host.querySelector("details")!.open).toBe(false);
      expect(host.querySelector("details")!.textContent).toContain("Application is required");
      expect(host.textContent).toContain("Your custom price can still be saved and sent.");
      const input = host.querySelector("input")!;
      expect(input.value).toBe("");
      await act(() => {
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "0");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Save price for Bedroom 1"]')!.click());
      expect(host.querySelector('[role="alert"]')!.textContent).toBe("Connection lost. Try again.");
      expect(input.value).toBe("0.00");
      await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Save price for Bedroom 1"]')!.click());
      expect(save).toHaveBeenNthCalledWith(1, 0);
      expect(save).toHaveBeenNthCalledWith(2, 0);
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(host.textContent).toContain("Price saved");
    } finally { await act(() => root.unmount()); host.remove(); }
  });
  it("shows an existing manual amount immediately and saves the edited merchandise amount", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); const save = vi.fn().mockResolvedValue(undefined);
    try {
      await act(() => root.render(React.createElement(QuoteLinePriceReadout, {
        ...props, unitPrice: 939, lineTotal: 2817, manualPrice: 900, issue: null, onSave: save,
      })));
      const input = host.querySelector("input")!;
      expect(input.value).toBe("900.00");
      expect(host.textContent).toContain("$939.00 each");
      expect(host.textContent).toContain("$2,817.00 line total");
      expect(host.querySelector("details")).toBeNull();
      await act(() => {
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "925.50");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Save price for Bedroom 1"]')!.click());
      expect(save).toHaveBeenCalledExactlyOnceWith(925.5);
      expect(host.textContent).toContain("Price saved");
    } finally { await act(() => root.unmount()); host.remove(); }
  });
  it("keeps an existing manual amount editable when grid pricing reports an issue", () => {
    const html = renderToStaticMarkup(React.createElement(QuoteLinePriceReadout, {
      ...props, manualPrice: 450, issue: "Selected fabric grid unavailable",
    }));
    expect(html).toContain("Selected fabric grid unavailable");
    expect(html).toContain('value="450.00"');
    expect(html).toContain("Save price for Bedroom 1");
    expect(html).not.toContain("$0.00 each");
  });
});
