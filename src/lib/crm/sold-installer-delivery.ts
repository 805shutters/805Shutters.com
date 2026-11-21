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
 * The installer packet belongs to the recorded sale. A missing signature,
 * a shop-notification flag, or a later lifecycle status does not remove it.
 * The database trigger creates the single queue row; this helper only asks
 * the worker to send that row.
 */
export function quoteRequiresInstallerDelivery(
  quote: SoldQuoteInstallerCandidate,
): boolean {
  const meta = quote.meta || {};
  const status = String(quote.status || "").toLowerCase();
  const fixtureName = /(^|[^a-z])(test|fixture|sample|demo)([^a-z]|$)/i.test(quote.customer_name || "");
  const excluded = Boolean(
    quote.archived_at ||
    status === "archived" ||
    status === "lost" ||
    meta.historical_recordkeeping_only === true ||
    fixtureName,
  );
  return Boolean(!excluded && quote.id && SALE_RECORDED_QUOTE_STATUSES.has(status));
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
