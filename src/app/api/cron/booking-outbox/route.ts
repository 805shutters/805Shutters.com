import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { processBookingOutbox } from "@/lib/booking/delivery";
import { processAppointmentCustomerNotifications } from "@/lib/crm/appointment-customer-delivery";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const supabase = getSupabaseServiceClient();
  if (!supabase)
    return NextResponse.json({ message: "Unavailable" }, { status: 503 });
  // Public booking keeps its existing worker and gate. Manual confirmations
  // have a separate default-off approval gate.
  const booking = await processBookingOutbox(supabase);
  const customerConfirmations = await processAppointmentCustomerNotifications(supabase, "confirmation");
  return NextResponse.json({ ...booking, customerConfirmations }, { status: customerConfirmations.status === "failed" ? 503 : 200 });
}
