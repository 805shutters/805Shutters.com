/** Only profile maintenance is coalesced. Authentication and authorization must
 * still run for every request before calling this helper. Cold instances ensure
 * the profile exists before any business write can reference it. */
export function createProfileMaintenance(intervalMs = 300_000, capacity = 1024) {
  const refreshed = new Map<string, number>();
  const pending = new Map<string, Promise<void>>();
  return async (key: string, write: () => Promise<void>) => {
    const previous = refreshed.get(key);
    if (previous !== undefined && Date.now() - previous < intervalMs) return;
    const existing = pending.get(key);
    if (existing) return existing;
    const request = Promise.resolve().then(write).then(() => {
      refreshed.delete(key);
      refreshed.set(key, Date.now());
      while (refreshed.size > capacity) refreshed.delete(refreshed.keys().next().value!);
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}

export const maintainCrmProfile = createProfileMaintenance();
