import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { APPOINTMENT_SERVICE, processAppointmentCustomerNotifications } from "@/lib/crm/appointment-customer-delivery";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

function requireCronAccess(request: NextRequest) {
  const secrets = [process.env.APPOINTMENT_REMINDER_CRON_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (!secrets.some(secret => request.headers.get("authorization") === `Bearer ${secret}`)) {
    throw new CrmAuthError(401, "Appointment reminder cron is not authorized.");
  }
}

async function run(request: NextRequest) {
  try {
    requireCronAccess(request);
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Database is not configured.");
    const result = await processAppointmentCustomerNotifications(supabase, "reminder", { dryRun: request.nextUrl.searchParams.get("dry_run") === "true" });
    return NextResponse.json(result, { status: result.status === "failed" ? 503 : 200 });
  } catch (error) {
    const response = crmAuthErrorResponse(error);
    return NextResponse.json({ service: APPOINTMENT_SERVICE, status: "failed" }, { status: response.status });
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
