import { afterEach, describe, expect, it, vi } from "vitest";
import { submitSignature } from "./submit-signature";
const input = { printedName: "Synthetic Customer", signature: "Synthetic Customer", acknowledgedTotal: 450 };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("customer signature response verification", () => {
  it.each([false, true])("accepts explicit confirmed success, already signed=%s", async alreadySigned => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, alreadySigned }));
    vi.stubGlobal("fetch", fetcher);
    await submitSignature("test-token", input);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
  });
  it.each([{}, { ok: false }, { ok: true }, { signed: true }])("does not invent success from %j", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(body)).mockResolvedValueOnce(Response.json({ signed: false })));
    await expect(submitSignature("test-token", input)).rejects.toThrow("couldn't confirm");
  });
  it("recovers a dropped response only after confirming the persisted signature", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("connection lost"))
      .mockResolvedValueOnce(Response.json({ signed: true, signedAt: "2026-09-24T01:00:00Z" }));
    vi.stubGlobal("fetch", fetcher);
    await submitSignature("test-token", input);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "GET", cache: "no-store" });
  });
  it("does not mask a changed-contract conflict with an unrelated saved state", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ message: "Review the new total" }, { status: 409 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(submitSignature("test-token", input)).rejects.toMatchObject({ status: 409 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("ends a stalled request and preserves a clear retry path when confirmation also fails", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    vi.stubGlobal("fetch", fetcher);
    const outcome = expect(submitSignature("test-token", input)).rejects.toThrow("name and selections are still here");
    await vi.advanceTimersByTimeAsync(38_000);
    await outcome;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
