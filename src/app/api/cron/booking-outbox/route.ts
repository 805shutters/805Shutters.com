import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { processBookingOutbox } from "@/lib/booking/delivery";
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
  return NextResponse.json(await processBookingOutbox(supabase));
}
