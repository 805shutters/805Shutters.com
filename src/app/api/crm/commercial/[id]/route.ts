import { NextRequest, NextResponse } from "next/server";
import { updateCommercialAccount } from "@/lib/crm/commercial";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    const account = await updateCommercialAccount(supabase, id, payload, { email, userId: user.id });
    return NextResponse.json({ account });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
