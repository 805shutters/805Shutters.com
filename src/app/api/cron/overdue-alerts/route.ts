import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { OverdueAlertsSendError, runOverdueAlerts } from "@/lib/crm/follow-ups";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function requireCronAccess(request: NextRequest) {
  const secrets = [process.env.FOLLOW_UP_CRON_SECRET, process.env.CRON_SECRET].filter((secret): secret is string => Boolean(secret));
  if (!secrets.length) throw new CrmAuthError(503, "Overdue-alerts cron secret is not configured.");
  const authorization = request.headers.get("authorization") || "";
  if (!secrets.some((secret) => authorization === `Bearer ${secret}`)) {
    throw new CrmAuthError(401, "Overdue-alerts cron is not authorized.");
  }
}

async function run(request: NextRequest) {
  try {
    requireCronAccess(request);
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Database is not configured.");
    const result = await runOverdueAlerts(supabase);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OverdueAlertsSendError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    return crmAuthErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
