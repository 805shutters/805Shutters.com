import { describe, expect, it, vi } from "vitest";
import { createInFlightRequests } from "./in-flight-requests";

describe("in-flight CRM reads", () => {
  it("shares only pending requests and does not cache a successful result", async () => {
    const read = createInFlightRequests();
    let resolve!: (value: number) => void;
    const load = vi.fn(() => new Promise<number>(done => { resolve = done; }));
    const first = read("session/full/1", load);
    expect(read("session/full/1", load)).toBe(first);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    resolve(10);
    expect(await first).toBe(10);
    expect(await read("session/full/1", async () => 20)).toBe(20);
  });

  it("does not share different scopes, sessions, or post-save generations", async () => {
    const read = createInFlightRequests();
    const keys = ["a/active/1", "a/full/1", "b/full/1", "a/full/2"];
    const load = vi.fn(async () => 1);
    await Promise.all(keys.map(key => read(key, load)));
    expect(load).toHaveBeenCalledTimes(4);
  });

  it.each([false, true])("clears failed reads for retry (synchronous throw: %s)", async synchronous => {
    const read = createInFlightRequests();
    const load = vi.fn(() => {
      if (synchronous) throw new Error("Offline");
      return Promise.reject(new Error("Offline"));
    });
    const first = read("key", load);
    const second = read("key", load);
    expect(first).toBe(second);
    await expect(first).rejects.toThrow("Offline");
    expect(await read("key", async () => "recovered")).toBe("recovered");
  });
});
