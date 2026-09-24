import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { processCustomerSignedContractEmailOutbox } from "@/lib/crm/customer-signed-contract-email";
import { checkCustomerEmailDeliveries, customerEmailActivation, customerEmailReadiness, getCustomerEmailMonitor } from "@/lib/crm/customer-email-monitor";
import { observeIntegration } from "@/lib/crm/integration-health";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;
export async function GET(request: NextRequest) {
  const readOnly = request.nextUrl.searchParams.get("dryRun") === "1" || ["health", "readiness"].includes(request.nextUrl.searchParams.get("check") || "");
  const token = request.headers.get("authorization");
  const authorized = [process.env.CRON_SECRET, ...(readOnly ? [process.env.APPOINTMENT_REMINDER_CRON_SECRET] : [])]
    .some(secret => Boolean(secret) && token === `Bearer ${secret}`);
  if (!authorized) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const db = getSupabaseServiceClient();
  if (!db) return NextResponse.json({ message: "Customer email service unavailable" }, { status: 503 });
  try {
    if (request.nextUrl.searchParams.get("check") === "readiness") {
      const readiness = await customerEmailReadiness(db);
      return NextResponse.json(readiness, { status: readiness.ok ? 200 : 503 });
    }
    if (readOnly) {
      const health = await getCustomerEmailMonitor(db);
      return NextResponse.json(health, { status: health.ok ? 200 : 503 });
    }
    const activation = await customerEmailActivation(db);
    if (!activation) return NextResponse.json({ ok: false, activated: false }, { status: 503 });
    const result = await observeIntegration(db, "customer-email", async () => {
      const result = await processCustomerSignedContractEmailOutbox(db, { limit: 10, deadlineMs: 180_000 });
      await checkCustomerEmailDeliveries(db, activation);
      return result;
    }, result => result.errors.length === 0);
    const health = await getCustomerEmailMonitor(db);
    return NextResponse.json({ ...health, processed: result.processed, errorCount: result.errors.length },
      { status: health.ok && result.errors.length === 0 ? 200 : 503 });
  } catch {
    return NextResponse.json({ message: "Customer email worker or health check failed" }, { status: 503 });
  }
}
