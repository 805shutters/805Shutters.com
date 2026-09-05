import { NextRequest, NextResponse } from "next/server";
import {
  crmAuthErrorResponse,
  CrmAuthError,
  requireCrmUser,
} from "@/lib/crm/auth";
import { markMeasureProductOrdered } from "@/lib/crm/technical-measure-orders-server";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const { groupKey } = await request.json();
    if (typeof groupKey !== "string" || !groupKey.trim())
      throw new CrmAuthError(400, "Select a contract product.");
    const form = await markMeasureProductOrdered(supabase, id, groupKey, {
      email,
      userId: user.id,
    });
    return NextResponse.json({ form });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
