import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { applySalesQuoteV2CustomMode, parseCustomModeBody } from "@/lib/crm/sales-quote-v2-custom-mode";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    const body = parseCustomModeBody(await request.json());
    const { id } = await context.params;
    return NextResponse.json(await applySalesQuoteV2CustomMode(supabase, id, user.id, body));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
