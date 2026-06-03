import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const payload = await request.json();

    if (!payload.title?.trim() || !payload.start_at || !payload.end_at) {
      return NextResponse.json({ message: "Title, start, and end are required." }, { status: 400 });
    }

    const record = {
      job_id: payload.job_id || null,
      title: payload.title.trim(),
      event_type: payload.event_type || "sales_consult",
      assigned_to: payload.assigned_to || "Unassigned",
      start_at: payload.start_at,
      end_at: payload.end_at,
      location: payload.location?.trim() || null,
      notes: payload.notes?.trim() || null,
      meta: {
        createdBy: email
      }
    };

    const { data, error } = await supabase.from("crm_calendar_events").insert(record).select("*").single();

    if (error) {
      return NextResponse.json({ message: "Calendar event could not be saved." }, { status: 502 });
    }

    if (payload.job_id) {
      await supabase
        .from("crm_jobs")
        .update({
          status: "scheduled",
          appointment_start: payload.start_at,
          appointment_end: payload.end_at
        })
        .eq("id", payload.job_id);
    }

    return NextResponse.json({ event: data });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
