import { NextRequest, NextResponse } from "next/server";
import { cancelCrmCalendarEvent, createCrmCalendarEvent, rescheduleCrmCalendarEvent } from "@/lib/crm/backend";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { loadCalendarSnapshot } from "@/lib/crm/calendar-read";
import { parseMobileAppointmentRange } from "@/lib/crm/mobile-appointments";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const started = performance.now();
  try {
    const { supabase } = await requireCrmUser(request);
    const authenticated = performance.now();
    const range = parseMobileAppointmentRange(request.nextUrl.searchParams.get("start"), request.nextUrl.searchParams.get("end"));
    const snapshot = await loadCalendarSnapshot(supabase, range.startAt, range.endAt);
    return NextResponse.json(snapshot, { headers: {
      "Cache-Control": "private, no-store",
      "Server-Timing": `auth;dur=${(authenticated - started).toFixed(1)},data;dur=${(performance.now() - authenticated).toFixed(1)}`
    } });
  } catch (error) { return crmAuthErrorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = await request.json();
    const event = await createCrmCalendarEvent(supabase, payload, { email, userId: user.id });

    return NextResponse.json({ event });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = await request.json();
    const event =
      payload?.action === "cancel"
        ? await cancelCrmCalendarEvent(supabase, payload, { email, userId: user.id })
        : await rescheduleCrmCalendarEvent(supabase, payload, { email, userId: user.id });

    return NextResponse.json({ event });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
