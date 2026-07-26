import { NextRequest, NextResponse } from "next/server";
import {
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import { resolveSalesQuoteV2Route } from "@/lib/crm/sales-quote-v2-route-resolver";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { id } = await context.params;
    return NextResponse.json(await resolveSalesQuoteV2Route(supabase, id));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
