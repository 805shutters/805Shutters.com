import { QuoteChargeSettingsPanel } from "@/components/crm/quotes/QuoteChargeSettingsPanel";
import { privatePageMetadata } from "@/lib/private-page-metadata";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Install and shipping | 805 CRM");

export default async function QuoteChargeSettingsPage() {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return <QuoteChargeSettingsPanel settings={[]} />;
  }
  const { data, error } = await supabase.from("crm_quote_charge_settings").select("key,amount,applies_to,updated_by");
  if (error || !data) return <QuoteChargeSettingsPanel settings={[]} />;
  return <QuoteChargeSettingsPanel settings={data.map((row) => ({
    key: row.key,
    amount: Number(row.amount),
    appliesTo: row.applies_to,
    updatedBy: row.updated_by,
  }))} />;
}
