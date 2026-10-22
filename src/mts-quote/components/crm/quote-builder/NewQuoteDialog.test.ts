// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NewQuoteDialog } from "./NewQuoteDialog";

vi.mock("@/components/address/AddressAutocomplete", () => ({ AddressAutocomplete: () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const submit = vi.fn();
const close = vi.fn();
async function render(open = true, isPending = false) {
  await act(() => root.render(React.createElement(NewQuoteDialog, { open, onClose: close, onSubmit: submit, isPending })));
}
beforeEach(() => { vi.clearAllMocks(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(() => root.unmount()); container.remove(); });

it("defaults to Residential on first open and after a successful parent close", async () => {
  await render();
  expect(document.querySelector<HTMLInputElement>('[value="residential"]')?.checked).toBe(true);
  await act(() => document.querySelector<HTMLInputElement>('[value="commercial"]')!.click());
  expect(document.querySelector<HTMLInputElement>('[value="commercial"]')?.checked).toBe(true);
  await render(false); await render();
  expect(document.querySelector<HTMLInputElement>('[value="residential"]')?.checked).toBe(true);
});

it("submits the explicit commercial choice with the existing customer fields", async () => {
  await render();
  const name = document.querySelector<HTMLInputElement>('#new-quote-customer-name')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Sample commercial project");
    name.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector<HTMLInputElement>('[value="commercial"]')!.click();
  });
  const button = [...document.querySelectorAll("button")].find(button => button.textContent === "805 Shutters")!;
  await act(() => button.click());
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ customerName: "Sample commercial project", quoteType: "commercial" }));
});

it("disables the type control while creation is pending", async () => {
  await render(true, true);
  expect(document.querySelector<HTMLFieldSetElement>('.crm-new-quote-type')?.disabled).toBe(true);
});
