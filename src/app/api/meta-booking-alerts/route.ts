import { NextResponse } from "next/server";

// Retired: cached pages must never text the owner for a page view.
// Completed-booking alerts are delivered only through the booking outbox.
export async function POST() {
  return NextResponse.json({ sent: false, skipped: "booking_required" }, { status: 410 });
}
