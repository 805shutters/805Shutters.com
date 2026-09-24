import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { isPacificReminderHour, runDayBeforeAppointmentReminders } from "@/lib/crm/calendar-notifications";
import { inspectAppointmentReminders } from "@/lib/crm/appointment-reminder-health";
import { observeIntegration } from "@/lib/crm/integration-health";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 300;

function requireCronAccess(request: NextRequest) {
  // Vercel sends CRON_SECRET; the independent read-only watchdog uses its own secret.
  const secrets = [process.env.CRON_SECRET, process.env.APPOINTMENT_REMINDER_CRON_SECRET].filter(Boolean);
  if (!secrets.length) throw new CrmAuthError(503, "Appointment reminder cron is not configured.");
  const provided = Buffer.from(request.headers.get("authorization") || "");
  if (!secrets.some(secret => {
    const expected = Buffer.from(`Bearer ${secret}`);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  })) throw new CrmAuthError(401, "Appointment reminder cron is not authorized.");
}

async function run(request: NextRequest) {
  try {
    requireCronAccess(request);
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Database is not configured.");
    const now = new Date();
    const check = request.nextUrl.searchParams.get("check");
    if (check) {
      if (check !== "readiness" && check !== "delivery") throw new CrmAuthError(400, "Unknown reminder check.");
      const result = await inspectAppointmentReminders(supabase, now, check);
      return NextResponse.json(result, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
    }
    if (!isPacificReminderHour(now)) {
      return NextResponse.json({ sent: 0, skipped: 0, failed: 0, outsideReminderHour: true });
    }
    const result = await observeIntegration(supabase, "appointment-reminders",
      () => runDayBeforeAppointmentReminders(supabase, now), result => result.failed === 0);
    console.info("Appointment reminder run", result);
    return NextResponse.json(result, { status: result.failed ? 502 : 200 });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function GET(request: NextRequest) { return run(request); }
export async function POST(request: NextRequest) { return run(request); }
