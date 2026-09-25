import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TechnicalMeasureForm } from "./technical-measures";
const mocks = vi.hoisted(() => ({ load: vi.fn(), email: vi.fn(), activity: vi.fn() }));
vi.mock("./technical-measures", () => ({ loadTechnicalMeasureForm: mocks.load }));
vi.mock("./technical-measure-office-email", () => ({ deliverTechnicalMeasureOfficeEmail: mocks.email }));
vi.mock("./backend", () => ({ recordCrmActivity: mocks.activity }));
import { submitTechnicalMeasureProgress } from "./technical-measure-progress-submission";

beforeEach(() => vi.resetAllMocks());
describe("incomplete field measure submission", () => {
  function setup(error: unknown = null) {
    const form = { id: "form", job_id: "job", status: "draft", technician_name: "Mike", meta: { existing: true } } as unknown as TechnicalMeasureForm;
    const neq = vi.fn().mockResolvedValue({ error });
    const eq = vi.fn(() => ({ neq }));
    const update = vi.fn((_payload: Record<string, unknown>) => ({ eq }));
    const from = vi.fn(() => ({ update }));
    mocks.load.mockResolvedValue(form);
    mocks.email.mockResolvedValue({ sent: true, id: "office-receipt" });
    return { form, db: { from } as unknown as SupabaseClient, from, update };
  }
  it("records the missing information and office receipt while leaving completion and operational handoffs untouched", async () => {
    const { form, db, from, update } = setup();
    const result = await submitTechnicalMeasureProgress(db, form, { email: "805@805shutters.com" }, ["Installation duration"], null);
    expect(from.mock.calls).toEqual([["crm_technical_measure_forms"]]);
    expect(update.mock.calls[0][0]).toMatchObject({ meta: { existing: true, installation_duration_minutes: null, incomplete_submission: { missing_information: ["Installation duration"] } } });
    expect(update.mock.calls[0][0]).not.toHaveProperty("status");
    expect(update.mock.calls[0][0]).not.toHaveProperty("submitted_at");
    expect(mocks.email).toHaveBeenCalledWith(db, "form");
    expect(mocks.activity.mock.calls[0][2]).toMatchObject({ action: "technical_measure.submit_incomplete", metadata: { officeEmail: { sent: true, id: "office-receipt" } } });
    expect(result.status).toBe("draft");
  });
  it("preserves valid duration and exposes email failure for retry", async () => {
    const { form, db, update } = setup();
    mocks.email.mockResolvedValue({ sent: false, error: "mail unavailable" });
    const result = await submitTechnicalMeasureProgress(db, form, { email: "805@805shutters.com" }, ["Line 1: Width"], 90);
    expect(update.mock.calls[0][0]).toMatchObject({ meta: { installation_duration_minutes: 90 } });
    expect(result.officeEmail).toEqual({ sent: false, error: "mail unavailable" });
  });
  it("never sends or claims receipt if saving the submission fails", async () => {
    const { form, db } = setup({ message: "db unavailable" });
    await expect(submitTechnicalMeasureProgress(db, form, { email: "805@805shutters.com" }, ["Width"], null)).rejects.toThrow("could not be submitted for review");
    expect(mocks.email).not.toHaveBeenCalled();
    expect(mocks.activity).not.toHaveBeenCalled();
  });
});
