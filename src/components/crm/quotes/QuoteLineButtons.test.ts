// @vitest-environment happy-dom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuoteButtonScreenField } from "@/lib/crm/quote-button-catalog";
import { QuoteLineButtons } from "./QuoteLineButtons";
import { QuoteLineEntry } from "./QuoteLineEntry";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@mts/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function field(partial: Partial<QuoteButtonScreenField> & Pick<QuoteButtonScreenField, "fieldKey" | "control">): QuoteButtonScreenField {
  return {
    label: partial.fieldKey,
    required: true,
    multi: false,
    choices: [],
    defaultValue: null,
    step: null,
    pending: false,
    askOrder: 1,
    recheckAgainst: [],
    valueKind: "string",
    extras: [],
    dependsOn: [],
    ...partial,
  };
}

const room = field({
  fieldKey: "room_location",
  label: "Room",
  control: "room",
  choices: ["Living", "Office"].map((value) => ({ value, label: value })),
});
const quantity = field({
  fieldKey: "quantity",
  label: "Quantity",
  control: "quantity",
  choices: ["1", "2"].map((value) => ({ value, label: value })),
  defaultValue: "1",
  valueKind: "number",
});
const mount = field({
  fieldKey: "mount_type",
  label: "Mount",
  control: "buttons",
  choices: ["Inside Mount", "Outside Mount"].map((value) => ({ value, label: value })),
});
const width = field({
  fieldKey: "ordered_width",
  label: "Width",
  control: "dimension",
  step: "1/8",
  valueKind: "number",
});
const notes = field({
  fieldKey: "item_note",
  label: "Note",
  control: "notes",
  multi: true,
  choices: ["None", "Obstruction"].map((value) => ({ value, label: value })),
  defaultValue: ["None"],
});

function Harness({ onSubmit, reask = [] }: { onSubmit: (picks: Record<string, unknown>) => void; reask?: Array<{ fieldKey: string; reason: string | null }> }) {
  const [selected, setSelected] = useState(["1"]);
  return React.createElement(QuoteLineButtons, {
    productLabel: "Norman Soluna Roller Shades",
    fields: [room, quantity, mount, width, notes],
    lines: [{ id: "1", label: "Line 1" }, { id: "2", label: "Line 2" }],
    selectedLineIds: selected,
    onToggleLine: (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]),
    onSubmit,
    reask,
  });
}

function click(selector: string) {
  const node = container.querySelector<HTMLElement>(selector);
  expect(node).not.toBeNull();
  node?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("quote line buttons", () => {
  it("submits the preselected defaults once when Enter is pressed", async () => {
    const onSubmit = vi.fn();
    await act(() => root.render(React.createElement(Harness, { onSubmit })));
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toContain("1");
    const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === label);
    await act(() => {
      button("Office")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button("Inside Mount")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button("Obstruction")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[data-field="item_note"] button[aria-pressed="true"]')?.textContent).toBe("Obstruction");
    await act(() => click('button[aria-label="Width digit 3"]'));
    await act(() => click('button[aria-label="Width plus 1/8"]'));
    await act(() => click('input[aria-label="Apply to Line 2"]'));
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Apply to Line 2"]')?.checked).toBe(true);
    const form = container.querySelector("form");
    await act(() => form?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      room_location: "Office",
      quantity: "1",
      mount_type: "Inside Mount",
      ordered_width: 3.125,
      item_note: ["Obstruction"],
    });
    expect([...container.querySelectorAll("button")].some((item) => /send/i.test(item.textContent ?? ""))).toBe(false);
  });

  it("shows only the conflicting field again", async () => {
    await act(() => root.render(React.createElement(Harness, {
      onSubmit: vi.fn(),
      reask: [{ fieldKey: "mount_type", reason: "value is not a catalog choice" }],
    })));
    expect([...container.querySelectorAll("[data-field]")].map((node) => node.getAttribute("data-field"))).toEqual(["mount_type"]);
    expect(container.textContent).toContain("value is not a catalog choice");
    expect(container.textContent).not.toContain("Send quote");
  });
});

describe("quote line entry", () => {
  it("loads the button screen and posts a draft without a send request", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(String(url));
      const body = init?.body ? JSON.parse(String(init.body)) as { picks?: Record<string, unknown>; applyToLineIds?: string[] } : {};
      if (String(url).endsWith("/batch-next-field")) {
        return { ok: true, json: async () => ({ phase: "line", reason: null, sent: false, fields: [room, quantity] }) };
      }
      expect(body.applyToLineIds).toEqual(["1"]);
      expect(body.picks).toMatchObject({ quantity: "1" });
      return {
        ok: true,
        json: async () => ({
          saved: true,
          sent: false,
          message: "Draft quote saved.",
          accepted: { quantity: 1 },
          reask: [],
          lines: [{ id: "1", label: "Line 1" }],
          next: { phase: "line", reason: null, sent: false, fields: [] },
          quote: { id: "44444444-4444-4444-8444-444444444444", status: "draft", sent: false },
        }),
      };
    }));
    await act(() => root.render(React.createElement(QuoteLineEntry)));
    const product = [...container.querySelectorAll("button")].find((item) => item.textContent === "Norman Soluna Roller Shades");
    await act(async () => product?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const name = container.querySelector<HTMLInputElement>('input[aria-label="Customer name"]');
    await act(() => {
      if (!name) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(name, "New Person");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const form = container.querySelector("form");
    await act(async () => form?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(urls).toEqual([
      "/api/crm/quote-front-door/batch-next-field",
      "/api/crm/quote-front-door/batch-validate",
    ]);
    expect(container.textContent).toContain("Draft quote saved.");
    expect([...container.querySelectorAll("button")].some((item) => /send/i.test(item.textContent ?? ""))).toBe(false);
  });
});
