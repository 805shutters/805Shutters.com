import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { processInstallerDeliveryOutbox } from "@/lib/crm/installer-delivery-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

export async function GET(request: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ message: "Installer delivery service unavailable" }, { status: 503 });
  }
  try {
    const { processed, pending, blocked, errors } = await processInstallerDeliveryOutbox(supabase, {
      limit: 20,
      deadlineMs: 220_000,
    });
    return NextResponse.json({ processed, pending, blocked, errors });
  } catch (error) {
    return NextResponse.json({
      message: "Installer delivery worker failed",
      pending: 0,
      blocked: 0,
      errors: [error instanceof Error ? error.message : "Unknown installer delivery error"],
    }, { status: 500 });
  }
}
