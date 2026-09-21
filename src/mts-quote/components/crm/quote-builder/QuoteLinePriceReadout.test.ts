// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QuoteLinePriceReadout } from "./QuoteLinePriceReadout";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const props = { unitPrice: 0, lineTotal: 0, roomName: "Bedroom 1", manualPrice: null, onSave: async () => {} };
describe("quote line calculation and custom entry", () => {
  it.each(["blocked", "stale", "unpriceable"])("does not turn a %s calculation into a zero price or custom-price instruction", state => {
    const issue = state === "stale" ? "Requested catalog identity is not the server-selected catalog." : "Lakeside F0183: no price at 91 × 48.";
    const html = renderToStaticMarkup(React.createElement(QuoteLinePriceReadout, { ...props, issue }));
    expect(html).toContain(issue);
    expect(html).toContain("Price unavailable");
    expect(html).not.toContain("$0.00");
    expect(html).not.toContain('value="0.00"');
    expect(html).not.toContain("Enter your price");
    expect(html).toContain("Set custom merchandise price");
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
      const details = host.querySelector("details")!; details.open = true;
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
});
