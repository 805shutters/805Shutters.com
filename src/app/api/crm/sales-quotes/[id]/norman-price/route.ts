import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { parseNormanPriceRequest, saveNormanLegacyPricing } from "@/lib/crm/sales-quote-norman-price";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    parseNormanPriceRequest(await request.json().catch(() => { throw new CrmAuthError(400, "A valid JSON request object is required."); }));
    const { id } = await context.params;
    return NextResponse.json(await saveNormanLegacyPricing(supabase, { quoteId: id, actorId: user.id }));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
