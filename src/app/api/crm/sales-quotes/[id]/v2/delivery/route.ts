import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { nativeQuoteDeliveryCapability } from "@/lib/crm/native-quote-delivery";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    const { id } = await context.params;
    return NextResponse.json(await nativeQuoteDeliveryCapability(supabase, id, user.id));
  } catch (error) { return crmAuthErrorResponse(error); }
}
