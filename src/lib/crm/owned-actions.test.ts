import { describe, it, expect, vi } from "vitest";
import {
  normalizeOwnedActionChange,
  saveOwnedAction,
  actionsForIdentity,
  type OwnedActionChange,
  type OwnedAction,
} from "./owned-actions";
const id = "11111111-1111-4111-8111-111111111111",
  requestId = "22222222-2222-4222-8222-222222222222";
const base: OwnedActionChange = {
  id,
  requestId,
  expectedRevision: 0,
  action: { job_id: id, title: "Arrange return", status: "open" },
};
describe("owned actions", () => {
  it("assigns new office work to Mike without assigning legacy records", () => {
    expect(normalizeOwnedActionChange(base).owner).toBe("Mike");
    expect(() =>
      normalizeOwnedActionChange({ ...base, expectedRevision: 1 }),
    ).toThrow("owner");
  });
  it("requires explicit reasons and valid dates", () => {
    expect(() =>
      normalizeOwnedActionChange({
        ...base,
        action: { ...base.action, due_on: "2026-02-31" },
      }),
    ).toThrow("date");
    expect(() =>
      normalizeOwnedActionChange({
        ...base,
        action: { ...base.action, due_on: "2026-13-01" },
      }),
    ).toThrow("date");
    expect(() =>
      normalizeOwnedActionChange({
        ...base,
        action: { ...base.action, status: "blocked" },
      }),
    ).toThrow("blocker");
    expect(() =>
      normalizeOwnedActionChange({
        ...base,
        action: { ...base.action, status: "done" },
      }),
    ).toThrow("resolution");
  });
  it("preserves idempotency and translates a conflicting edit into recoverable 409", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ error: { message: "ACTION_CONFLICT" } });
    await expect(
      saveOwnedAction({ rpc } as never, base, "owner@example.com"),
    ).rejects.toMatchObject({ status: 409 });
    expect(rpc).toHaveBeenCalledWith(
      "crm_save_owned_action",
      expect.objectContaining({
        p_request_id: requestId,
        p_expected_revision: 0,
        p_actor: "owner@example.com",
      }),
    );
  });
  it("never matches another quote from the same parent job", () => {
    expect(
      actionsForIdentity([{ quote_id: "other", job_id: id } as OwnedAction], {
        jobId: id,
        quoteId: "target",
        bookkeepingId: null,
      }),
    ).toEqual([]);
  });
});
