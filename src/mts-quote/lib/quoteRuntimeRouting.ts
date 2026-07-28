export type QuoteRuntimeMarker = {
  quote_v2_backend?: boolean | null;
};

export type QuoteRuntimeFlags = {
  authoritativeV2: boolean;
  serverOwnedV2: boolean;
};

/**
 * Existing quote records must use the backend they were saved with. Opening a
 * historical quote is not a conversion and must not opt it into V2 pricing or
 * server-owned mutations.
 */
export function resolveActiveQuoteRuntime(
  quote: QuoteRuntimeMarker | null | undefined,
): QuoteRuntimeFlags {
  const isV2 = quote?.quote_v2_backend === true;
  return {
    authoritativeV2: isV2,
    serverOwnedV2: isV2,
  };
}
