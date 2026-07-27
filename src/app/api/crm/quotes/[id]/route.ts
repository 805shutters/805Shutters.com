import { NextRequest, NextResponse } from "next/server";
import { deleteCrmQuote, updateCrmQuote } from "@/lib/crm/backend";
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
    const quote = await updateCrmQuote(supabase, id, payload, { email, userId: user.id });

    return NextResponse.json({ quote });
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
    return NextResponse.json(await deleteCrmQuote(supabase, id, { email, userId: user.id }));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
