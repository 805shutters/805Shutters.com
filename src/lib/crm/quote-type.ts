import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";

/** Attach presentation metadata without changing a frozen contract's financial fields. */
export async function preserveCommercialContractType(db: SupabaseClient, quoteId: string) {
  const { data, error } = await db.from("crm_quotes").select("meta").eq("id", quoteId).single();
  if (error || !data) throw new CrmAuthError(502, "The commercial contract type could not be verified.");
  const meta = data.meta ?? {};
  if (meta.quote_type === "commercial") return;
  const saved = await db.from("crm_quotes").update({ meta: { ...meta, quote_type: "commercial" } })
    .eq("id", quoteId).eq("meta", JSON.stringify(meta)).select("id").single();
  if (saved.error || !saved.data) throw new CrmAuthError(409, "The contract changed. Reload it before continuing.");
}
