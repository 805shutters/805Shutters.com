import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { signTechnicalMeasureAddendum } from "@/lib/crm/technical-measures";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user, displayName } = await requireCrmUser(request);
    const { id } = await context.params;
    const result = await signTechnicalMeasureAddendum(supabase, id, await request.json(), { email, userId: user.id, displayName });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
