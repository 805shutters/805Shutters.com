import { NextRequest, NextResponse } from "next/server";
import { createCrmJob, loadCrmDashboardData } from "@/lib/crm/backend";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    return NextResponse.json(await loadCrmDashboardData(supabase));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = await request.json();
    const job = await createCrmJob(supabase, payload, { email, userId: user.id });

    return NextResponse.json({ job });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
