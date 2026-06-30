import { NextRequest, NextResponse } from "next/server";
import { cancelCrmCalendarEvent, createCrmCalendarEvent, rescheduleCrmCalendarEvent } from "@/lib/crm/backend";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

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
