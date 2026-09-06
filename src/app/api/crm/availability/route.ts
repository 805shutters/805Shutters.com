import { normalizeWorkingRanges } from "@/lib/booking/working-ranges";
import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import {
  BookingError,
  customerAvailability,
  readSchedule,
  scheduleError,
} from "@/lib/booking/scheduling";
import {
  losAngelesDateString,
  losAngelesTimeString,
} from "@/lib/booking/availability";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  return error instanceof BookingError
    ? NextResponse.json(
        { message: error.message },
        { status: error.status, headers },
      )
    : crmAuthErrorResponse(error);
}
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const q = request.nextUrl.searchParams,
      month = q.get("month") || "";
    if (q.get("preview") === "true")
      return NextResponse.json(
        await customerAvailability(
          supabase,
          month,
          q.get("address") || "",
          Number(q.get("windowCount")),
          true,
        ),
        { headers },
      );
    const snapshot = await readSchedule(supabase, month);
    return NextResponse.json(
      {
        revision: snapshot.revision,
        ranges: snapshot.slots.filter(
          (s) => s.owner.toLowerCase() === "jessica",
        ),
        slots: snapshot.slots
          .filter(
            (s) =>
              s.status === "available" &&
              s.source === "crm_working_ranges" &&
              s.owner.toLowerCase() === "jessica",
          )
          .map((s) => ({
            ...s,
            date: losAngelesDateString(new Date(s.start_at)),
            time: losAngelesTimeString(new Date(s.start_at)),
          })),
      },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const payload = await request.json();
    if (!Array.isArray(payload.ranges) || typeof payload.revision !== "string")
      throw new BookingError(
        400,
        "Working ranges and a calendar revision are required.",
      );
    let ranges;
    try {
      ranges = normalizeWorkingRanges(payload.month, payload.ranges);
    } catch (error) {
      throw new BookingError(400, (error as Error).message);
    }
    const { data, error } = await supabase.rpc("booking_publish_ranges", {
      p_month: payload.month,
      p_revision: payload.revision,
      p_ranges: ranges,
      p_actor: email,
    });
    if (error) scheduleError(error);
    return NextResponse.json(
      {
        revision: data.revision,
        ranges: data.slots.filter(
          (s: { owner: string }) => s.owner.toLowerCase() === "jessica",
        ),
      },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
// Old clients must not silently create ambiguous one-hour start buttons.
export async function POST() {
  return NextResponse.json(
    { message: "Reload the CRM and publish working ranges." },
    { status: 409 },
  );
}
export const DELETE = POST;
