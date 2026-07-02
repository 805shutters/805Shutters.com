import { NextRequest, NextResponse } from "next/server";
import { deleteCrmBookkeepingCredit, updateCrmBookkeepingCredit } from "@/lib/crm/backend";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const payload = await request.json();
    const credit = await updateCrmBookkeepingCredit(supabase, id, payload, { email, userId: user.id });

    return NextResponse.json({ credit });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const result = await deleteCrmBookkeepingCredit(supabase, id, { email, userId: user.id });

    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
