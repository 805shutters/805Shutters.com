import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { enrichCalendarEventsWithJobDetails } from "@/lib/crm/backend";
import type { CrmCalendarEvent, CrmJob } from "@/lib/crm/types";
import {
  crmMobileOwnerForEmail,
  filterMobileAppointments,
  mobileAppointmentDurationMinutes,
  mobileAppointmentWindowCount,
  normalizeMobileAppointmentScope,
  parseMobileAppointmentRange
} from "@/lib/crm/mobile-appointments";

export const runtime = "nodejs";

function decorateMobileAppointment(event: CrmCalendarEvent) {
  return {
    ...event,
    window_count: mobileAppointmentWindowCount(event),
    appointment_duration_minutes: mobileAppointmentDurationMinutes(event)
  };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, email, displayName } = await requireCrmUser(request);
    const params = request.nextUrl.searchParams;
    const scope = normalizeMobileAppointmentScope(params.get("scope"));
    const owner = scope === "my" ? crmMobileOwnerForEmail(email) : null;
    const range = parseMobileAppointmentRange(params.get("start"), params.get("end"));

    const eventsResult = await supabase
      .from("crm_calendar_events")
      .select("*")
      .in("status", ["scheduled", "rescheduled"])
      .lt("start_at", range.endAt)
      .gt("end_at", range.startAt)
      .order("start_at", { ascending: true })
      .limit(500);

    if (eventsResult.error) {
      return NextResponse.json({ message: "Mobile appointments could not be loaded." }, { status: 502 });
    }

    const events = (eventsResult.data || []) as CrmCalendarEvent[];
    const jobIds = Array.from(new Set(events.map((event) => event.job_id).filter((id): id is string => Boolean(id))));
    let jobs: CrmJob[] = [];

    if (jobIds.length) {
      const jobsResult = await supabase.from("crm_jobs").select("*").in("id", jobIds).limit(500);
      if (jobsResult.error) {
        return NextResponse.json({ message: "Mobile appointment job details could not be loaded." }, { status: 502 });
      }
      jobs = (jobsResult.data || []) as CrmJob[];
    }

    const enriched = enrichCalendarEventsWithJobDetails(events, jobs);
    const scoped = filterMobileAppointments(enriched, email, scope).map(decorateMobileAppointment);

    return NextResponse.json({
      appointments: scoped,
      scope,
      owner,
      range,
      user: {
        email,
        displayName
      }
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
