import { lotusCustomerDeliveryBlock } from "@/lib/quote/lotus-authority";
import { CrmAuthError } from "./auth";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

/** Legacy delivery must not promote a newly routed catalog conflict to authority. */
export function lotusLegacyDeliveryBlock(designs: Row[]): string | null {
  for (const design of designs) {
    const options = design.options_json && typeof design.options_json === "object" && !Array.isArray(design.options_json)
      ? design.options_json as Row : {};
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
    .select("id").eq("quote_id", quote.id);
  if (lineError) throw new CrmAuthError(502, "Lotus delivery selections could not be verified.");
  const ids = (lines ?? []).map(line => line.id);
  if (!ids.length) return;
  const { data: designs, error } = await supabase.from("sales_quote_designs")
    .select("options_json,mount_type").in("line_item_id", ids);
  if (error) throw new CrmAuthError(502, "Lotus delivery selections could not be verified.");
  const block = lotusLegacyDeliveryBlock(designs ?? []);
  if (block) throw new CrmAuthError(409, block);
}
