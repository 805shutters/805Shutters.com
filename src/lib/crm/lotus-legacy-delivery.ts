import { CUSTOMER_CHARGE_POLICY_VERSION, storedCustomerCharges } from "@/lib/quote/customer-charges";
import { lotusCustomerDeliveryBlock } from "@/lib/quote/lotus-authority";
import { CrmAuthError } from "./auth";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

/** Only the service-owned staff price record can authorize a legacy custom price. */
export function matchesSavedStaffPrice(design: Row, override: Row): boolean {
  const options = design.options_json as Row | null;
  if (!options || options.manual_price_override !== true || override.design_id !== design.id) return false;
  if (override.unit_price == null || design.unit_price == null) return false;
  const amount = Number(override.unit_price), actual = Number(design.unit_price);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(actual) || actual < 0) return false;
  let fixed = 0;
  if (override.customer_charge_policy === CUSTOMER_CHARGE_POLICY_VERSION) {
    if (options.manual_customer_charge_policy !== CUSTOMER_CHARGE_POLICY_VERSION ||
      options.manual_merchandise_unit_price == null || Number(options.manual_merchandise_unit_price) !== amount) return false;
    fixed = storedCustomerCharges(options)?.perWindowTotal ?? 0;
    if (options.customer_charges && !storedCustomerCharges(options)) return false;
  } else if (override.customer_charge_policy != null || options.manual_customer_charge_policy != null) return false;
  const percent = Number(options.discount_percent ?? 0);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return false;
  const source = amount + fixed;
  if (percent > 0 && Number(options.discount_source_price) !== source) return false;
  const expected = Math.round((amount - Math.round(amount * percent) / 100 + fixed) * 100);
  return Math.round(actual * 100) === expected;
}

/** Legacy delivery must not promote a newly routed catalog conflict to authority. */
export function lotusLegacyDeliveryBlock(designs: Row[]): string | null {
  for (const design of designs) {
    const options = design.options_json && typeof design.options_json === "object" && !Array.isArray(design.options_json)
      ? design.options_json as Row : {};
    if (options.lotus_vinyl_configuration_version || options.lotus_amx_configuration_version || options.lotus_roller_configuration_version || options.lotus_vertical_configuration_version) return "This current Lotus configuration requires the native quote workflow to validate its saved options, dimensions and price before customer delivery.";
    const productId = String(options.catalog_product_id ?? options.quote_lab_product_id ?? "");
    if (productId.startsWith("lotus_dealer_listed_") || options.lotus_observed_offering_id) return "This exact dealer-listed Lotus item requires verified configuration and price confirmation in the native quote workflow before delivery.";
    const programId = String(options.catalog_program_id ?? options.quote_lab_program_id ?? "");
    if (!productId.startsWith("lotus_") || !programId.startsWith("lotus_")) continue;
    const block = lotusCustomerDeliveryBlock(productId, programId, typeof design.mount_type === "string" ? design.mount_type : undefined);
    if (block) return `${block} Use the native quote workflow for an explicitly confirmed price on this exact configuration.`;
  }
  return null;
}

export async function assertLegacyLotusDeliveryAllowed(supabase: SupabaseClient, quote: Row): Promise<void> {
  // Accepted contracts retain their saved terms. This guard does not reprice history.
  if (quote.signed_at || quote.customer_signature) return;
  const { data: lines, error: lineError } = await supabase.from("sales_quote_line_items")
    .select("id,selected_design_id").is("archived_at", null).eq("quote_id", quote.id);
  if (lineError) throw new CrmAuthError(502, "Lotus delivery selections could not be verified.");
  const ids = (lines ?? []).map(line => line.id);
  if (!ids.length) return;
  const { data: designs, error } = await supabase.from("sales_quote_designs")
    .select("id,line_item_id,unit_price,options_json,mount_type").in("line_item_id", ids);
  if (error) throw new CrmAuthError(502, "Lotus delivery selections could not be verified.");
  const selectedIds = new Map((lines ?? []).map(line => [line.id, line.selected_design_id]));
  const billableDesigns = (designs ?? []).filter(design =>
    !selectedIds.get(design.line_item_id) || selectedIds.get(design.line_item_id) === design.id);
  const blockedDesigns = billableDesigns.filter(design => lotusLegacyDeliveryBlock([design]));
  if (!blockedDesigns.length) return;
  const manualIds = blockedDesigns.filter(design => design.options_json?.manual_price_override === true).map(design => design.id);
  let overrides: Row[] = [];
  if (manualIds.length) {
    const result = await supabase.from("sales_quote_line_price_overrides")
      .select("design_id,unit_price,customer_charge_policy").eq("quote_id", quote.id).in("design_id", manualIds);
    if (result.error) throw new CrmAuthError(502, "Saved staff prices could not be verified.");
    overrides = result.data ?? [];
  }
  const unconfirmed = blockedDesigns.filter(design => !overrides.some(override => matchesSavedStaffPrice(design, override)));
  const block = lotusLegacyDeliveryBlock(unconfirmed);
  if (block) throw new CrmAuthError(409, `${block} Or save an explicit custom price for this line before sending.`);
}
