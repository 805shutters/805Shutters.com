import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Refresh parents before children, even before React has rendered the new rows. */
export async function refreshQuoteV2Rows(
  client: QueryClient,
  quoteKey: QueryKey,
  lineKey: QueryKey,
  designKey: QueryKey,
): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: quoteKey, exact: true }, { throwOnError: true }),
    client.invalidateQueries({ queryKey: lineKey, exact: true }, { throwOnError: true }),
  ]);
  await client.invalidateQueries({ queryKey: designKey, exact: true }, { throwOnError: true });
}

/** A mutation's callback can still close over the pre-insert line array. */
export function currentQuoteLineIds(client: QueryClient, lineKey: QueryKey): string[] {
  return (client.getQueryData<Array<{ id: string }>>(lineKey) ?? []).map(row => row.id);
}
