// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TechnicalMeasureForm, TechnicalMeasureLineValues } from "@/lib/crm/technical-measures";
import { TechnicalMeasureEditor } from "./TechnicalMeasureEditor";

const mocks = vi.hoisted(() => ({
  client: { auth: {
    getSession: async () => ({ data: { session: { access_token: "test-only", user: { email: "test@example.invalid" } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } },
  cache: vi.fn(async () => undefined), queue: vi.fn(async () => undefined),
}));
vi.mock("@/lib/supabase-browser", () => ({ getSupabaseBrowserClient: () => mocks.client }));
vi.mock("@/lib/crm/technical-measure-offline", async importOriginal => ({
  ...await importOriginal<object>(),
  cacheTechnicalMeasureDraft: mocks.cache, cacheTechnicalMeasureForm: vi.fn(async () => undefined),
  readCachedTechnicalMeasureForm: vi.fn(async () => null), readCachedTechnicalMeasureDraft: vi.fn(async () => null),
  queueTechnicalMeasureOperation: mocks.queue, flushTechnicalMeasureQueue: vi.fn(async () => []),
  queuedTechnicalMeasureOperations: vi.fn(async () => []),
  removeQueuedTechnicalMeasureOperation: vi.fn(async () => undefined), removeCachedTechnicalMeasureDraft: vi.fn(async () => undefined),
  rememberOfflineMeasureOwner: () => "test@example.invalid", lastOfflineMeasureOwner: () => "test@example.invalid",
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let saved: TechnicalMeasureForm;
let requests: Array<{ lines: Array<{ id: string; currentValues: TechnicalMeasureLineValues }> }>;
let respond: ((response: Response) => void) | undefined;
let deferSave: boolean;
function fixture(): TechnicalMeasureForm {
  const values: TechnicalMeasureLineValues = { design_id: null, room: "Bathroom", opening_label: "A", width_in: 13, height_in: 60, quantity: 1, notes: "", product_id: "norman_shutters", program_id: null, fabric: null, details: {}, motorization: [], surcharges: [], discount_percent: 0 };
  return { id: "test-measure", created_at: "2026-09-23", updated_at: "2026-09-23", job_id: "test-job", quote_id: "test-quote", customer_id: null, contract_id: null, status: "draft", customer_snapshot: { name: "Test Customer", email: null, phone: null, address: null, city: null }, quote_snapshot: { quoteNumber: "TEST", signedAt: null, adjustments: {} }, baseline_total: 100, current_total: 100, technician_email: null, technician_name: null, submitted_at: null, meta: {}, lines: ["Bathroom", "Bedroom"].map((room, index) => ({ id: `line-${index}`, form_id: "test-measure", quote_line_item_id: `quote-line-${index}`, sort_order: index, baseline: { ...values, room }, current_values: { ...values, room }, baseline_unit_price: 50, current_unit_price: 50, price_status: "unchanged", changes: [] })), addendum: null, changes: [], contractChanges: [], requiresAddendum: false };
}
function button(label: string) {
  const node = [...(document.querySelector('[role="dialog"]') ?? document).querySelectorAll<HTMLButtonElement>("button")].filter(el => !el.closest(".technical-measure-line--inactive")).find(el => el.getAttribute("aria-label") === label || el.textContent?.trim() === label);
  if (!node) throw new Error(`Missing ${label}`);
  return node;
}
async function click(label: string) { await act(async () => button(label).click()); }
async function enter() { await act(async () => document.querySelector('[role="dialog"] input')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))); }
async function mount() { await act(async () => root.render(React.createElement(TechnicalMeasureEditor, { formId: saved.id }))); }
async function edit() {
  await click("Open field measure for Bathroom · A"); await click("Select width");
  await click("2"); await click("9"); await click("1/2"); await click("Next: height");
  await click("5"); await click("8"); await click("1/4");
}
beforeEach(() => {
  vi.clearAllMocks(); saved = fixture(); requests = []; deferSave = false; respond = undefined;
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  HTMLElement.prototype.scrollTo = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    if (options?.method === "PATCH") {
      const body = JSON.parse(options.body); requests.push(body);
      saved = { ...saved, lines: saved.lines.map(line => ({ ...line, current_values: body.lines.find((item: { id: string }) => item.id === line.id).currentValues })) };
      if (deferSave) return new Promise<Response>(resolve => { respond = resolve; });
    }
    return Response.json({ form: saved });
  }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("technical measurement save and close", () => {
  it("saves both dimensions before closing, then allows the next line and retains sizes after reload", async () => {
    await mount(); await edit(); deferSave = true;
    await click("Save size");
    expect(requests).toHaveLength(1);
    expect(requests[0].lines[0].currentValues).toMatchObject({ width_in: 29.5, height_in: 58.25, width_confirmed: true, height_confirmed: true });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await click("Save size"); expect(requests).toHaveLength(1);
    await act(async () => respond!(Response.json({ form: saved })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(button("Select width").textContent).toContain('29 1/2');
    deferSave = false; await click("Next line item"); expect(document.body.textContent).toContain("Bedroom"); expect(button("Select width").textContent).toContain('13');
    await act(async () => root.unmount()); root = createRoot(host); await mount();
    await click("Open field measure for Bathroom · A"); expect(button("Select height").textContent).toContain('58 1/4');
  });
  it("keeps failed measurements open for retry and closes only after the retry saves", async () => {
    await mount(); await edit(); deferSave = true;
    await click("Save size");
    await act(async () => respond!(Response.json({ message: "Session expired. Sign in and retry." }, { status: 401 })));
    expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain("Session expired");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("29 1/2");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("58 1/4");
    deferSave = false; await click("Save size");
    expect(requests).toHaveLength(2);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("saves offline on the device and closes with an honest upload-pending message", async () => {
    await mount(); await edit();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await click("Save size");
    expect(requests).toHaveLength(0);
    expect(mocks.cache).toHaveBeenCalled();
    expect(mocks.queue).toHaveBeenCalledWith("test@example.invalid", "test-measure", "draft", expect.objectContaining({ lines: expect.arrayContaining([expect.objectContaining({ id: "line-0", currentValues: expect.objectContaining({ width_in: 29.5, height_in: 58.25 }) })]) }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.textContent).toContain("waiting to upload");
  });
  it("queues the newest pair when an earlier in-flight save loses its connection", async () => {
    await mount(); deferSave = true; await click("Save Draft");
    expect(requests).toHaveLength(1);
    await edit(); await click("Save size");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await act(async () => respond!(Response.json({ message: "Connection interrupted" }, { status: 503 })));
    expect(mocks.queue).toHaveBeenLastCalledWith("test@example.invalid", "test-measure", "draft", expect.objectContaining({ lines: expect.arrayContaining([expect.objectContaining({ id: "line-0", currentValues: expect.objectContaining({ width_in: 29.5, height_in: 58.25 }) })]) }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(button("Select width").textContent).toContain("29 1/2");
  });
  it("confirms only height when opened from height, and cancel never saves", async () => {
    await mount(); await click("Open field measure for Bathroom · A"); await click("Select height");
    await click("7"); await click("2"); await click("Close");
    expect(requests).toHaveLength(0);
    await click("Select height"); await click("6"); await click("1"); await click("Save size");
    expect(saved.lines[0].current_values).toMatchObject({ width_in: 13, height_in: 61, height_confirmed: true });
    expect(saved.lines[0].current_values.width_confirmed).toBeUndefined();
  });
  it("uses keyboard Next then Done to save and leave the calculator", async () => {
    await mount(); await click("Open field measure for Bathroom · A"); await click("Select width");
    await click("2"); await click("9"); await enter();
    expect(document.querySelector('input[aria-label="height whole inches"]')).not.toBeNull();
    await click("5"); await click("8"); await enter();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(saved.lines[0].current_values).toMatchObject({ width_in: 29, height_in: 58 });
  });
});
