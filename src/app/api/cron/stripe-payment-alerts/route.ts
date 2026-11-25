import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { deliverStripePaymentAlerts } from "@/lib/crm/stripe-payment-alerts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const db = getSupabaseServiceClient();
  if (!db) return NextResponse.json({ message: "Payment alert database unavailable" }, { status: 503 });
  try {
    const result = await deliverStripePaymentAlerts(db);
    return NextResponse.json(result, { status: result.status === "invalid_recipient" ? 503 : 200 });
  } catch {
    return NextResponse.json({ message: "Payment alert worker requires review" }, { status: 503 });
  }
}
