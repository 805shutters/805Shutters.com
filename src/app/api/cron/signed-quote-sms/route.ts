import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { processSignedSmsRetries, signedSmsRetryHealth } from "@/lib/crm/signed-sms-retry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const db = getSupabaseServiceClient();
  if (!db) return NextResponse.json({ message: "Staff SMS retry service unavailable" }, { status: 503 });
  try {
    const readOnly = request.nextUrl.searchParams.get("dryRun") === "1";
    const processed = readOnly ? null : await processSignedSmsRetries(db);
    const health = await signedSmsRetryHealth(db);
    return NextResponse.json({ ...health, processed }, { status: health.ok ? 200 : 503 });
  } catch (error) {
    console.error("[signed-sms-retry]", error instanceof Error ? error.message : "Worker failed");
    return NextResponse.json({ message: "Staff SMS retry worker failed" }, { status: 503 });
  }
}
