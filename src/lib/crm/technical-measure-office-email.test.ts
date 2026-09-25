import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TechnicalMeasureForm } from "./technical-measures";
const mocks = vi.hoisted(() => ({ load: vi.fn(), send: vi.fn() }));
vi.mock("./technical-measures", () => ({ loadTechnicalMeasureForm: mocks.load }));
vi.mock("@/lib/notify/email", () => ({ sendEmail: mocks.send }));
import { buildTechnicalMeasureOfficeEmail, deliverTechnicalMeasureOfficeEmail } from "./technical-measure-office-email";
function fixture() {
  return { id: "form-1", status: "draft", customer_snapshot: { name: "QA <Test>" }, quote_snapshot: { quoteNumber: "QA-805" }, contractUrl: "/quote/qa-contract/", baseline_total: 439, meta: {}, lines: [{ baseline: { width_in: 36.5, height_in: 60.75 }, current_values: { room: "Office", opening_label: "A", width_in: 42.125, height_in: 106.875, quantity: 1, width_confirmed: true, height_confirmed: true, measure_complete: true, product_id: "roller", program_id: "soluna", fabric: "White", details: { divider_rail_height: "32.625" }, notes: "QA only <script>" } }] } as unknown as TechnicalMeasureForm;
}
beforeEach(() => vi.resetAllMocks());
describe("saved technical measure office report", () => {
  it("uses persisted eighth-inch values and an original contract link, with only the office recipient", () => {
    const message = buildTechnicalMeasureOfficeEmail(fixture());
    expect(message.to).toBe("805@805shutters.com");
    expect(message.from).toBe("805 Shutters <805@805shutters.com>");
    expect(message).not.toHaveProperty("cc");
    expect(message.text).toContain("Width: 42.125; Height: 106.875; Quantity: 1");
    expect(message.text).toContain("divider_rail_height: 32.625");
    expect(message.text).toContain("/quote/qa-contract/");
    expect(message.text).not.toContain("Width: 36.5");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).not.toContain("<script>");
  });
  it("labels an incomplete office submission and lists its missing information", () => {
    const form = fixture();
    form.meta.incomplete_submission = { received_at: "2026-09-25" };
    const message = buildTechnicalMeasureOfficeEmail(form);
    expect(message.subject).toContain("submitted for review — needs information");
    expect(message.text).toContain("Installation duration");
    expect(message.text).toContain("Not released to ordering or installation");
    expect(message.to).toBe("805@805shutters.com");
  });
  it("reloads the saved form and preserves delivery failure for an explicit retry", async () => {
    const form = fixture();
    mocks.load.mockResolvedValue(form);
    mocks.send.mockResolvedValueOnce({ sent: false, error: "provider unavailable" }).mockResolvedValueOnce({ sent: true, id: "receipt-1" });
    const db = {} as SupabaseClient;
    expect(await deliverTechnicalMeasureOfficeEmail(db, "form-1")).toEqual({ sent: false, error: "provider unavailable" });
    expect(await deliverTechnicalMeasureOfficeEmail(db, "form-1")).toEqual({ sent: true, id: "receipt-1" });
    expect(mocks.load).toHaveBeenNthCalledWith(2, db, "form-1");
    expect(mocks.send.mock.calls[0][0].idempotencyKey).toBe(mocks.send.mock.calls[1][0].idempotencyKey);
  });
  it("changes the delivery key when saved measurements change", () => {
    const form = fixture();
    const first = buildTechnicalMeasureOfficeEmail(form);
    form.lines[0].current_values.width_in = 42.875;
    expect(buildTechnicalMeasureOfficeEmail(form).idempotencyKey).not.toBe(first.idempotencyKey);
  });
  it("never sends when the persisted form cannot be loaded", async () => {
    mocks.load.mockRejectedValue(new Error("not found"));
    await expect(deliverTechnicalMeasureOfficeEmail({} as SupabaseClient, "missing")).rejects.toThrow("not found");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
