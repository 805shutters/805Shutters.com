import type { SupabaseClient } from "@supabase/supabase-js";

export type SoldQuoteInstallerCandidate = {
  id: string;
  status?: string | null;
  signed_at?: string | null;
  sold_at?: string | null;
};

const SALE_RECORDED_QUOTE_STATUSES = new Set([
  "sold",
  "approved",
  "ordered",
  "received",
  "installed",
  "invoiced",
  "paid",
]);

/**
 * The installer packet belongs to the recorded sale, not to an optional
 * customer/shop notification. Later lifecycle statuses remain eligible so an
 * explicit retry can repair a handoff that was missed while entering `sold`.
 */
export function quoteRequiresInstallerDelivery(
  quote: SoldQuoteInstallerCandidate,
): boolean {
  return Boolean(
    quote.id &&
      (quote.signed_at ||
        quote.sold_at ||
        SALE_RECORDED_QUOTE_STATUSES.has(String(quote.status || ""))),
  );
}

/**
 * One shared sold-transition invariant. The underlying installer helper owns
 * the one-form-per-quote uniqueness, persisted provider result, stable Resend
 * idempotency key, no-resend-after-sent_at rule, and missing/failed retry.
 */
export async function ensureSoldQuoteInstallerDelivery(
  supabase: SupabaseClient,
  quote: SoldQuoteInstallerCandidate,
) {
  if (!quoteRequiresInstallerDelivery(quote)) return null;
  const { createAndSendInstallerForm } = await import("@/lib/crm/installer-forms");
  return createAndSendInstallerForm(supabase, quote.id);
}
