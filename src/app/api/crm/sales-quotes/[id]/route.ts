import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { deleteSalesQuote } from "@/lib/crm/backend";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    return NextResponse.json(await deleteSalesQuote(supabase, id, { email, userId: user.id }));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
