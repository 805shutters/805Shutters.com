import { NextRequest, NextResponse } from "next/server";
import { requireCrmUser, crmAuthErrorResponse } from "@/lib/crm/auth";
import { loadCrmDashboardData } from "@/lib/crm/backend";
import { buildMobileJobStatus } from "@/lib/crm/mobile-job-status";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const results = buildMobileJobStatus(await loadCrmDashboardData(supabase));
    return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return crmAuthErrorResponse(error); }
}
