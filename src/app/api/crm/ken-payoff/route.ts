import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { loadCrmDashboardData } from "@/lib/crm/backend";
import { kenPayoffResponse } from "@/lib/crm/ken-payoff";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const dashboard = await loadCrmDashboardData(supabase);
    if ((dashboard.sourceHealth || []).some(source => source.state !== "complete" && ["job expenses", "installation invoices", "order emails", "Ken payments", "Ken allocations", "commission payments", "commission allocations", "settings"].includes(source.source))) {
      return NextResponse.json({ message: "Payoff data is temporarily unavailable. Please retry." }, { status: 503 });
    }
    return NextResponse.json(kenPayoffResponse(dashboard));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
