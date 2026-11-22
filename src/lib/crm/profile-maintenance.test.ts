import { afterEach, expect, it, vi } from "vitest";
import { createProfileMaintenance } from "./profile-maintenance";
afterEach(() => vi.useRealTimers());
it("coalesces profile writes, expires successes, and isolates identities", async () => {
  vi.useFakeTimers();
  const ensure = createProfileMaintenance(1000);
  const write = vi.fn(async () => {});
  await Promise.all([ensure("user-a", write), ensure("user-a", write)]);
  await ensure("user-a", write);
  expect(write).toHaveBeenCalledTimes(1);
  await ensure("user-b", write);
  await vi.advanceTimersByTimeAsync(1001);
  await ensure("user-a", write);
  expect(write).toHaveBeenCalledTimes(3);
});
it("never caches a failed first profile write", async () => {
  const ensure = createProfileMaintenance();
  const write = vi.fn().mockRejectedValueOnce(new Error("database unavailable")).mockResolvedValueOnce(undefined);
  await expect(ensure("user", write)).rejects.toThrow("database unavailable");
  await ensure("user", write);
  expect(write).toHaveBeenCalledTimes(2);
});
