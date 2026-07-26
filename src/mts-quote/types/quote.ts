export type QuoteStatus =
  | "draft"
  | "sent"
  | "sold"
  | "ordered"
  | "received"
  | "installed"
  | "archived";

export type QuoteSentVia = "email" | "sms" | "both";
export type QuoteSalesOwner = "mike" | "jessica";

/**
 * Lifecycle:
 *   draft → sent → sold → ordered → received → installed → archived
 *
 * Transitions are driven by events:
 *   sent       — customer email/SMS fires (sets sent_at, sent_via)
 *   sold       — customer signs contract (sets signed_at)
 *   ordered    — manufacturer confirmation email parsed (sets ordered_at, manufacturer_order_ref)
 *   received   — all product received (sets received_at)
 *   installed  — install complete + COD collected (sets installed_at)
 *   archived   — manually archived (sets archived_at)
 */
export interface SalesQuote {
  id: string;
  quote_number: string;
  account_id: string;
  status: QuoteStatus;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  appointment_date: string | null;
  installer_notes: string | null;
  product_cost: number;
  total_amount: number;
  profit_amount: number;
  deposit_paid: number;
  balance_paid: number;
  payment_method: string | null;
  customer_signature: string | null;
  customer_printed_name: string | null;
  signed_at: string | null;
  share_token: string;
  created_by: string | null;
  sales_owner: QuoteSalesOwner | null;
  sales_owner_auth_user_id: string | null;
  sales_owner_set_at: string | null;
  created_job_id: string | null;
  quote_group_id: string | null;
  quote_letter: string;
  // Lifecycle timestamps
  sent_at: string | null;
  ordered_at: string | null;
  received_at: string | null;
  installed_at: string | null;
  archived_at: string | null;
  // Integration fields
  sent_via: QuoteSentVia | null;
  manufacturer_order_ref: string | null;
  manufacturer_cost: number;
  manufacturer_name: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Authoritative V2 rows are server-owned. These fields are optional so
   * historical/legacy query fixtures remain backwards compatible.
   */
  quote_v2_backend?: boolean;
  quote_v2_status?: "legacy" | "draft" | "stale" | "priced" | "blocked" | "sent";
  quote_v2_catalog_version?: string | null;
  quote_v2_revision?: number;
  quote_v2_last_priced_at?: string | null;
}

export interface SalesQuoteLineItem {
  id: string;
  quote_id: string;
  room_name: string;
  product_type: string;
  width_whole: number;
  width_fraction: string;
  height_whole: number;
  height_fraction: string;
  quantity: number;
  sort_order: number;
  selected_design_id?: string | null;
  created_at: string;
}

export interface SalesQuoteDesign {
  id: string;
  line_item_id: string;
  variant: string;
  product_type: string | null;
  supplier: string | null;
  material: string | null;
  louver_size: string | null;
  tilt_type: string | null;
  hinge_color: string | null;
  panel_config: string | null;
  mount_type: string | null;
  shade_type: string | null;
  lift_system: string | null;
  valance: string | null;
  fabric: string | null;
  motor_type: string | null;
  remote_type: string | null;
  hard_surface_install: boolean;
  ladder_over_15ft: boolean;
  requires_takedown: boolean;
  unit_price: number;
  notes: string | null;
  options_json: Record<string, unknown>;
  quote_v2_selection?: Record<string, unknown>;
  quote_v2_price_status?: "legacy" | "stale" | "authoritative" | "blocked" | "unpriceable";
  quote_v2_selection_fingerprint?: string | null;
  quote_v2_priced_catalog_version?: string | null;
  quote_v2_priced_at?: string | null;
  current_v2_snapshot_id?: string | null;
  created_at: string;
}

export interface QuoteLineItemWithDesigns extends SalesQuoteLineItem {
  designs: SalesQuoteDesign[];
}

export interface SalesQuoteWithItems extends SalesQuote {
  line_items: QuoteLineItemWithDesigns[];
}

export function formatMeasurement(whole: number, fraction: string): string {
  if (fraction === "0" || !fraction) return `${whole}"`;
  return `${whole} ${fraction}"`;
}

export function formatDimensions(item: SalesQuoteLineItem): string {
  const w = formatMeasurement(item.width_whole, item.width_fraction);
  const h = formatMeasurement(item.height_whole, item.height_fraction);
  return `${w} × ${h}`;
}

function measurementToDecimal(whole: number, fraction: string): number {
  const wholeValue = Number(whole) || 0;
  if (!fraction || fraction === "0") return wholeValue;

  const [numerator, denominator] = fraction.split("/").map(Number);
  if (!numerator || !denominator) return wholeValue;

  return wholeValue + numerator / denominator;
}

export function hasValidDimensions(item: SalesQuoteLineItem): boolean {
  return (
    measurementToDecimal(item.width_whole, item.width_fraction) > 0 &&
    measurementToDecimal(item.height_whole, item.height_fraction) > 0
  );
}

export function formatDimensionsOrNull(item: SalesQuoteLineItem): string | null {
  if (!hasValidDimensions(item)) return null;
  return formatDimensions(item);
}
