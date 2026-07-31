import { NextRequest, NextResponse } from "next/server";
import { createPartnerPaymentBatch } from "@/lib/crm/backend";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { restrictDashboardPayablesForViewer } from "@/lib/crm/payables-visibility";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = await request.json();
    const result = await createPartnerPaymentBatch(supabase, payload, { email, userId: user.id });

    return NextResponse.json({ ...result, dashboard: restrictDashboardPayablesForViewer(result.dashboard, email) });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
