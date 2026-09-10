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

/**
 * The V2 marker also exists on restored historical quotes, so it cannot select
 * a customer workflow. Only the append-only draft-creation receipt proves a
 * quote was born in V2. Until delivery cutover is complete, such quotes must
 * never enter the historical all-design mirror, even through a legacy URL.
 * Historical rows without a native receipt retain their existing workflow.
 */
export async function isNativeV2SalesQuote(
  supabase: SupabaseClient,
  quote: AnyRow,
): Promise<boolean> {
  if (!isServerMarkedV2SalesQuote(quote)) return false;
  if (typeof quote.id !== "string" || !quote.id.trim()) {
    throw new CrmAuthError(409, "Quote origin could not be verified before preparing the customer contract.");
  }
  const { data, error } = await supabase
    .from("sales_quote_v2_draft_requests")
    .select("quote_id")
    .eq("quote_id", quote.id)
    .maybeSingle();
  if (error) {
    throw new CrmAuthError(
      502,
      "Quote origin could not be checked. Customer contract preparation was stopped before changing quote records.",
    );
  }
  return Boolean(data);
}

export async function assertHistoricalSalesQuoteMutationAllowed(db: SupabaseClient, quote: AnyRow): Promise<void> {
  if (await isNativeV2SalesQuote(db, quote)) {
    throw new CrmAuthError(
      409,
      "This quote was created in the authoritative quote builder. Customer delivery is not connected yet; it cannot be sent, marked sold, or rebuilt through the historical contract workflow.",
    );
  }
}
