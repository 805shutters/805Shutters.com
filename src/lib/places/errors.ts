/** Keep provider diagnostics useful without logging keys, addresses, or response bodies. */
export async function placesRequestError(response: Response, operation: string) {
  let reason = "UNKNOWN";
  try {
    const body = await response.json();
    const candidate = body?.error?.details?.find(
      (detail: { "@type"?: string }) =>
        detail?.["@type"] === "type.googleapis.com/google.rpc.ErrorInfo",
    )?.reason;
    if (typeof candidate === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate)) {
      reason = candidate;
    }
  } catch {
    // An unreadable provider error is still a service failure, not an invalid address.
  }
  return new Error(`Google Places ${operation} failed (HTTP ${response.status}; ${reason})`);
}
