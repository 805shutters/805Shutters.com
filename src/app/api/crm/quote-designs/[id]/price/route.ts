import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { setDesignManualPrice } from "@/lib/crm/quote-builder";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { unitPrice?: unknown };
    const quote = await setDesignManualPrice(
      supabase,
      id,
      body.unitPrice,
      { email, userId: user.id },
    );
    return NextResponse.json({ quote });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
