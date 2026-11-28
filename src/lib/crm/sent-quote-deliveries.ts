import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompleteCrmTable } from "./pagination";

/**
 * crm_quotes ids with a sales_quote_v2_delivery_attempts row in state 'sent'.
 * Attempts point at sales_quote_v2_deliveries, which stores crm_quote_id.
 * Read only. This does not write quote status or delivery state.
 */
export async function loadSentDeliveryQuoteIds(db: SupabaseClient): Promise<Set<string>> {
  const [attempts, deliveries] = await Promise.all([
    loadCompleteCrmTable(db, "sales_quote_v2_delivery_attempts", "id", "id,delivery_id,state", "id", [{ column: "state", value: "sent" }]),
    loadCompleteCrmTable(db, "sales_quote_v2_deliveries", "id", "id,crm_quote_id", "id")
  ]);
  if (attempts.error || deliveries.error) {
    throw new Error(attempts.error?.message || deliveries.error?.message || "Quote delivery evidence could not be loaded.");
  }

  const sentDeliveryIds = new Set(
    (attempts.data || [])
      .filter((row) => row.state === "sent" && typeof row.delivery_id === "string")
      .map((row) => row.delivery_id as string)
  );
  const quoteIds = new Set<string>();
  for (const delivery of deliveries.data || []) {
    if (typeof delivery.id !== "string" || typeof delivery.crm_quote_id !== "string") continue;
    if (sentDeliveryIds.has(delivery.id)) quoteIds.add(delivery.crm_quote_id);
  }
  return quoteIds;
}
