import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import {
  createSalesQuoteV2Draft,
  parseCreateSalesQuoteV2DraftBody,
} from "@/lib/crm/sales-quote-v2-structure";
import { ACCOUNT_IDS } from "@mts/lib/accounts";

export const runtime = "nodejs";

/**
 * Lists the active 805 Quote V2 records through the authenticated CRM server.
 * Browser-side table access is intentionally not relied on because production
 * RLS may return no rows even for an otherwise valid CRM session.
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { data, error } = await supabase
      .from("sales_quotes")
      .select("*")
      .eq("account_id", ACCOUNT_IDS.SHUTTERS_805)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ quotes: data || [] });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

/**
 * Creates one server-numbered authoritative Quote V2 draft. The browser never
 * calls next_quote_number or inserts a V2 row directly.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    const rawBody = await request.json().catch(() => {
      throw new CrmAuthError(400, "A valid JSON request object is required.");
    });
    const body = parseCreateSalesQuoteV2DraftBody(rawBody);
    return NextResponse.json(
      await createSalesQuoteV2Draft(supabase, user.id, body),
      { status: 201 },
    );
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
