import { NextRequest, NextResponse } from "next/server";
import {
  requireCrmUser,
  crmAuthErrorResponse,
  CrmAuthError,
} from "@/lib/crm/auth";
import {
  loadPurchasedFulfillmentScope,
  saveFulfillment,
} from "@/lib/crm/fulfillment-server";
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const quoteId = request.nextUrl.searchParams.get("quoteId");
    if (!quoteId) throw new CrmAuthError(400, "Choose an exact quote.");
    return NextResponse.json({
      scope: await loadPurchasedFulfillmentScope(supabase, quoteId),
    });
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    return NextResponse.json({
      record: await saveFulfillment(supabase, await request.json(), email),
    });
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}
