import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { loadFollowUpEligibleQuoteIds } from "@/lib/crm/quote-hub-eligibility-server";
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const eligibleQuoteIds = await loadFollowUpEligibleQuoteIds(supabase);
    return NextResponse.json({ eligibleQuoteIds }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return crmAuthErrorResponse(error); }
}
