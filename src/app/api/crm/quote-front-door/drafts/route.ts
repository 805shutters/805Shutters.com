import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { listQuoteFrontDoorDrafts, type QuoteFrontDoorDb } from "@/lib/crm/quote-front-door-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const drafts = await listQuoteFrontDoorDrafts(supabase as unknown as QuoteFrontDoorDb);
    return NextResponse.json({ drafts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
