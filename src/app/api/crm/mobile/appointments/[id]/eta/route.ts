import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, CrmAuthError, requireCrmUser } from "@/lib/crm/auth";
import { enrichCalendarEventsWithJobDetails } from "@/lib/crm/backend";
import type { CrmCalendarEvent, CrmJob } from "@/lib/crm/types";
import {
  assertEtaCoordinates,
  mobileAppointmentDurationMinutes,
  mobileAppointmentWindowCount,
  sendMobileAppointmentEta
} from "@/lib/crm/mobile-appointments";

export const runtime = "nodejs";

function decorateMobileAppointment(event: CrmCalendarEvent) {
  return {
    ...event,
    window_count: mobileAppointmentWindowCount(event),
    appointment_duration_minutes: mobileAppointmentDurationMinutes(event)
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const { installerLat, installerLng } = assertEtaCoordinates(body);

    const eventResult = await supabase
      .from("crm_calendar_events")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (eventResult.error) {
      return NextResponse.json({ message: "Appointment could not be loaded." }, { status: 502 });
    }

    if (!eventResult.data) {
      throw new CrmAuthError(404, "Appointment was not found.");
    }

    const event = eventResult.data as CrmCalendarEvent;
    let jobs: CrmJob[] = [];
    if (event.job_id) {
      const jobResult = await supabase.from("crm_jobs").select("*").eq("id", event.job_id).maybeSingle();
      if (jobResult.error) {
        return NextResponse.json({ message: "Appointment job details could not be loaded." }, { status: 502 });
      }
      if (jobResult.data) jobs = [jobResult.data as CrmJob];
    }

    const enriched = enrichCalendarEventsWithJobDetails([event], jobs)[0];
    const eta = await sendMobileAppointmentEta({
      supabase,
      actor: { email, userId: user.id },
      event: enriched,
      installerLat,
      installerLng
    });

    return NextResponse.json({
      ...eta,
      appointment: decorateMobileAppointment(enriched)
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
