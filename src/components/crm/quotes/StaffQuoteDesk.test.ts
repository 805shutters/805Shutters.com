// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuoteTableRow } from "@mts/components/crm/quote-builder/QuotesTable";
import { StaffQuoteDesk } from "./StaffQuoteDesk";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const props = () => ({ isLoading: false, isError: false, isFetching: false,
  onRetry: vi.fn(), onOpen: vi.fn(), onDelete: vi.fn().mockResolvedValue(undefined),
  onNewQuote: vi.fn(), onOpenTools: vi.fn() });
const rows: QuoteTableRow[] = [
  { id: "c", source: "crm", quote_group_id: "group", quote_letter: "C", quote_number: "805-0434", customer_name: "Taylor Example", status: "draft", total_amount: 4010.58 },
  { id: "a", source: "crm", quote_group_id: "group", quote_letter: "A", quote_number: "805-0432", customer_name: "Taylor Example", status: "sold", total_amount: 3005.42 },
  { id: "b", source: "crm", quote_group_id: "group", quote_letter: "B", quote_number: "805-0433", customer_name: "Taylor Example", status: "draft", total_amount: 3627.23 },
];
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); Reflect.deleteProperty(window, "confirm"); });
async function click(label: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  await act(async () => { button!.click(); });
}
describe("staff customer quote UI", () => {
  it("renders one customer box with ordered letters, numbers, colors and individual actions", async () => {
    const handlers = props();
    await act(() => root.render(React.createElement(StaffQuoteDesk, { quotes: rows, ...handlers })));
    const customer = container.querySelector('article[aria-label="Quotes for Taylor Example"]')!;
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(customer.querySelectorAll("h3")).toHaveLength(1);
    expect([...customer.querySelectorAll("section")].map(tile => tile.getAttribute("aria-label"))).toEqual([
      "Quote A 805-0432", "Quote B 805-0433", "Quote C 805-0434",
    ]);
    expect(customer.querySelector('section[aria-label="Quote B 805-0433"]')?.getAttribute("style")).toContain("#2263aa");
    expect(customer.querySelector('section[aria-label="Quote C 805-0434"]')?.getAttribute("style")).toContain("#7b47a4");
    expect(customer.textContent).toContain("$3,627.23");
    expect(container.querySelector('button[aria-label="Delete draft quote A 805-0432"]')).toBeNull();
    await click("Open quote B 805-0433");
    expect(handlers.onOpen).toHaveBeenCalledWith(rows[2]);
  });
  it("shows all siblings after a quote-number search and after filtering to sold", async () => {
    await act(() => root.render(React.createElement(StaffQuoteDesk, { quotes: rows, ...props() })));
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "805-0433"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.querySelectorAll("article section")).toHaveLength(3);
    expect(container.textContent).toContain("1 quote matching");
    expect(container.querySelectorAll('[class*="otherLabel"]')).toHaveLength(2);
    await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, ""); input.dispatchEvent(new Event("input", { bubbles: true })); });
    const sold = [...container.querySelectorAll("button")].find(button => button.textContent === "Sold · 1")!;
    await act(() => sold.click());
    expect(container.querySelectorAll("article section")).toHaveLength(3);
    expect(container.textContent).toContain("1 quote matching");
  });
  it("deletes only the chosen draft inside the box and retains confirmation", async () => {
    const handlers = props(), confirm = vi.fn().mockReturnValue(true);
    Object.defineProperty(window, "confirm", { configurable: true, value: confirm });
    await act(() => root.render(React.createElement(StaffQuoteDesk, { quotes: rows, ...handlers })));
    await click("Delete draft quote C 805-0434");
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("C · 805-0434"));
    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    expect(handlers.onDelete).toHaveBeenCalledWith(rows[0]);
    expect(container.querySelectorAll("article section")).toHaveLength(3);
  });
  it("pages customer boxes without splitting their alternatives", async () => {
    const quotes = Array.from({ length: 26 }, (_, index) => ({ ...rows[0], id: `q-${index}`, quote_group_id: `group-${index}`, customer_name: `Customer ${index}` }));
    quotes.push({ ...quotes[24], id: "second-24", quote_letter: "D" });
    await act(() => root.render(React.createElement(StaffQuoteDesk, { quotes, ...props() })));
    expect(container.querySelectorAll("article")).toHaveLength(25);
    expect(container.querySelector('article[aria-label="Quotes for Customer 24"]')?.querySelectorAll("section")).toHaveLength(2);
    expect(container.textContent).toContain("1–25 of 26 customers");
    await act(() => [...container.querySelectorAll("button")].find(button => button.textContent === "Next")!.click());
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.textContent).toContain("Customer 25");
  });
});
