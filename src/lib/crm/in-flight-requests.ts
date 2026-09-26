/** Share pending reads only. Settled values and failures are never cached. */
export function createInFlightRequests() {
  const pending = new Map<string, Promise<unknown>>();

  return function read<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = pending.get(key);
    if (existing) return existing as Promise<T>;

    const request = Promise.resolve().then(load).finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
    pending.set(key, request);
    return request;
  };
}
