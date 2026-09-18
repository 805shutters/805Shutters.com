import { NextRequest, NextResponse } from "next/server";
import { checkAppointmentReminderService } from "../../../../../scripts/check-appointment-reminders.mjs";
import { appointmentCustomerSendsEnabled } from "@/lib/crm/appointment-customer-delivery";
import { isPacificReminderHour } from "@/lib/crm/calendar-notifications";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }
  if (!appointmentCustomerSendsEnabled()) return NextResponse.json({ status: "paused" });
  if (!isPacificReminderHour(new Date())) return NextResponse.json({ status: "outside_window" });
  try {
    // This caller verifies the actual service acknowledgement. 3xx, HTML,
    // login pages, and arbitrary 200 JSON all fail the invocation.
    const result = await checkAppointmentReminderService(process.env.CRON_SECRET, fetch, false);
    return NextResponse.json(result);
  } catch {
    console.error("805 appointment reminder service failed; inspect CRM operational timeline and provider receipts");
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase.from("crm_activity_events").insert({
        actor_email: "automation:805-appointment-notifications", entity_type: "system",
        action: "appointment_reminder.follow_up_required",
        metadata: { description: "Day-before appointment reminder service failed or returned an invalid response. Staff review required; do not retry uncertain provider calls." },
      });
      if (error) console.error("805 reminder failure could not be recorded in CRM");
    }
    return NextResponse.json({ status: "failed", message: "Reminder service acceptance was not verified" }, { status: 503 });
  }
}
