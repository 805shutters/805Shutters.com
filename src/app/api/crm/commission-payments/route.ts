import { NextRequest, NextResponse } from "next/server";
import { createCommissionPayment } from "@/lib/crm/backend";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = await request.json();
    const payment = await createCommissionPayment(supabase, payload, { email, userId: user.id });

    return NextResponse.json({ payment });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
