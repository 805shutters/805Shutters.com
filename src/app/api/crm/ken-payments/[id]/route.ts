import { NextRequest, NextResponse } from "next/server";
import { deleteKenPayment, updateKenPayment } from "@/lib/crm/backend";
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
    const payment = await updateKenPayment(supabase, id, payload, { email, userId: user.id });

    return NextResponse.json({ payment });
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
    const result = await deleteKenPayment(supabase, id, { email, userId: user.id });

    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
