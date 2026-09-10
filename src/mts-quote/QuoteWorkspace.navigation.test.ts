// @vitest-environment happy-dom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuoteWorkspace } from "./QuoteWorkspace";
import { useQuoteBuilderStore } from "./stores/quoteBuilderStore";

vi.mock("@mts/components/crm/quote-builder/QuoteDashboard", () => ({ QuoteDashboard: () => null }));
vi.mock("@mts/components/crm/quote-builder/PricingGrids", () => ({ PricingGrids: () => null }));
vi.mock("@mts/components/crm/quote-builder/QuoteBuilder", () => ({ QuoteBuilder: () => {
  const [editing, setEditing] = useState(false);
  return React.createElement("button", { onClick: () => setEditing(true) }, editing ? "Editing this quote" : "Fresh builder");
} }));
vi.mock("@mts/components/crm/quote-builder/QuoteContract", () => ({ QuoteContract: () => {
  const [sending, setSending] = useState(false);
  return React.createElement("button", { onClick: () => setSending(true) }, sending ? "Send dialog open" : "Fresh contract");
} }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
afterEach(async () => { await act(() => root?.unmount()); container?.remove(); useQuoteBuilderStore.getState().resetBuilder(); });

describe("quote workspace identity", () => {
  it.each(["builder", "contract"] as const)("resets local %s controls when changing alternatives", async (tab) => {
    useQuoteBuilderStore.getState().setActiveQuote("C"); useQuoteBuilderStore.getState().setActiveTab(tab);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(() => root!.render(React.createElement(QuoteWorkspace)));
    const button = [...container.querySelectorAll("button")].find((node) => node.textContent === `Fresh ${tab}`)!;
    await act(() => button.click());
    await act(() => useQuoteBuilderStore.getState().setActiveQuote("D"));
    expect(container.textContent).toContain(`Fresh ${tab}`);
    expect(container.textContent).not.toContain(tab === "builder" ? "Editing this quote" : "Send dialog open");
  });
});
