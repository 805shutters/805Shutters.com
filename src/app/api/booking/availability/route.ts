import { NextRequest, NextResponse } from "next/server";
import { losAngelesDateString } from "@/lib/booking/availability";
import { BookingError, customerAvailability } from "@/lib/booking/scheduling";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase)
      throw new BookingError(
        503,
        "Scheduling is temporarily unavailable. Please call 805 Shutters.",
      );
    const q = request.nextUrl.searchParams;
    return NextResponse.json(
      await customerAvailability(
        supabase,
        q.get("month") || losAngelesDateString().slice(0, 7),
        q.get("address") || "",
        Number(q.get("windowCount")),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof BookingError
            ? error.message
            : "Availability could not be checked.",
      },
      {
        status: error instanceof BookingError ? error.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
