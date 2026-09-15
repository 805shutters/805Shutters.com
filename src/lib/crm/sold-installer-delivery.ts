import type { SupabaseClient } from "@supabase/supabase-js";

export type SoldQuoteInstallerCandidate = {
  id: string;
  status?: string | null;
  signed_at?: string | null;
  sold_at?: string | null;
  archived_at?: string | null;
  external_source?: string | null;
  customer_name?: string | null;
  meta?: Record<string, unknown> | null;
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
  const meta = quote.meta || {};
  const fixtureName = /(^|[^a-z])(test|fixture|sample|demo)([^a-z]|$)/i.test(quote.customer_name || "");
  const excluded = Boolean(
    quote.archived_at ||
    String(quote.status || "").toLowerCase() === "archived" ||
    meta.historical_recordkeeping_only === true ||
    meta.no_external_notification === true ||
    meta.no_installer_form === true ||
    fixtureName,
  );
  const saleRecorded = SALE_RECORDED_QUOTE_STATUSES.has(String(quote.status || "").toLowerCase());
  // Some callers intentionally pass only {id,status}. Let the service-role RPC
  // establish signature truth from the durable quote instead of suppressing a
  // legitimate immediate repair because the projection was partial.
  const signatureKnownMissing = Object.prototype.hasOwnProperty.call(quote, "signed_at") && !quote.signed_at;
  return Boolean(!excluded && quote.id && saleRecorded && !signatureKnownMissing);
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
  const { enqueueAndProcessInstallerDelivery } = await import("@/lib/crm/installer-delivery-outbox");
  return enqueueAndProcessInstallerDelivery(supabase, quote.id);
}
