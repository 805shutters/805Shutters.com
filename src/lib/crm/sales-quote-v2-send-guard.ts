import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";

type AnyRow = Record<string, unknown>;

/** The additive atomic preparation transaction exists in source and has focused tests. */
export const V2_CUSTOMER_SEND_PREPARATION_IMPLEMENTED = true as const;

/**
 * The dedicated V2 send route now validates immutable selected snapshots and
 * writes a customer-only mirror without passing V2 rows through the legacy
 * all-design pricing projection. This flag describes source capability; live
 * deployment is verified separately.
 */
export const V2_PRODUCTION_SEND_PERSISTENCE_READY = true as const;

/** Only a strict quote-row marker opts into V2; a marked alternative does not. */
export function isServerMarkedV2SalesQuote(quote: AnyRow): boolean {
  return quote.quote_v2_backend === true;
}

/**
 * Guard placed before every legacy write/mirror/notification path. The heavy
 * V2 catalog is loaded only for an explicitly marked V2 quote, so normal legacy
 * send behavior and startup remain unchanged.
 */
export async function guardV2SalesQuoteBeforeLegacySend(
  supabase: SupabaseClient,
  quote: AnyRow,
): Promise<null> {
  if (!isServerMarkedV2SalesQuote(quote)) return null;

  try {
    const { prepareV2CustomerSendPayloadFromDatabase } = await import(
      "./sales-quote-v2-send"
    );
    await prepareV2CustomerSendPayloadFromDatabase(supabase, quote);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "authoritative validation failed";
    throw new CrmAuthError(409, `V2 send blocked: ${reason}`);
  }

  throw new CrmAuthError(
    409,
    "This legacy quote mutation is not available for V2. Use the dedicated V2 customer-send path.",
  );
}
