import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { syncCommercialReplies } from "@/lib/crm/commercial-replies";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    return NextResponse.json(await syncCommercialReplies(supabase, email));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
