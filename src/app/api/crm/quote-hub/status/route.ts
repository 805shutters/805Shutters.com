import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

/** Allow the frontend and database to be released separately without hiding sent quotes. */
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const results = await Promise.all([
      supabase.from("crm_quote_hub_messages").select("id").limit(0),
      supabase.from("crm_quote_hub_photos").select("id").limit(0),
      supabase.rpc("quote_hub_fingerprint", { p_quote_id: "00000000-0000-0000-0000-000000000000" }),
    ]);
    const ready = results.every(result => !result.error);
    return NextResponse.json({ ready }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
