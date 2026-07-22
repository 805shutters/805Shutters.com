import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";

type AnyRow = Record<string, unknown>;

/**
 * Production persistence does not yet have the quote-level V2 marker or the
 * line-level selected_design_id required for an authoritative send. Keeping
 * this false documents the cutover dependency and prevents legacy mirroring.
 */
export const V2_PRODUCTION_SEND_PERSISTENCE_READY = false as const;

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
    "V2 send blocked: production quote persistence and the dedicated customer-safe V2 mirror are not enabled.",
  );
}
