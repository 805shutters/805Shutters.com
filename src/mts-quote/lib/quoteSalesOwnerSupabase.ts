import { supabase } from "@mts/integrations/supabase/client";
import {
  resolveSalesOwnerFromUser,
  type QuoteSalesOwner,
  type SalesOwnerUser,
} from "./quoteSalesOwner";

export interface QuoteSalesOwnerPatch {
  sales_owner: QuoteSalesOwner;
  sales_owner_auth_user_id: string;
  sales_owner_set_at: string;
}

export async function getCurrentQuoteSalesOwnerPatch(): Promise<QuoteSalesOwnerPatch | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const authUser = sessionData.session?.user;
  if (!authUser?.id) return null;

  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("id, auth_user_id, email, display_name, full_name")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  const owner = resolveSalesOwnerFromUser(
    (crmUser as SalesOwnerUser | null) || {
      auth_user_id: authUser.id,
      email: authUser.email || null,
    }
  );
  if (!owner) return null;

  return {
    sales_owner: owner,
    sales_owner_auth_user_id: authUser.id,
    sales_owner_set_at: new Date().toISOString(),
  };
}
