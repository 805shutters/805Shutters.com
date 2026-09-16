import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import {
  getCustomerSignedContractEmailHealth,
  processCustomerSignedContractEmailOutbox,
} from "@/lib/crm/customer-signed-contract-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

function authorized(request: NextRequest) {
  return Boolean(
    process.env.CRON_SECRET &&
    request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`,
  );
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ message: "Customer contract email service unavailable" }, { status: 503 });

  try {
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
    const result = dryRun
      ? { processed: 0, ...await getCustomerSignedContractEmailHealth(supabase) }
      : await processCustomerSignedContractEmailOutbox(supabase, { limit: 20, deadlineMs: 220_000 });
    console.info("customer_signed_contract_email_health", {
      dryRun,
      processed: result.processed,
      pending: result.pending,
      processing: result.processing,
      retry: result.retry,
      uncertain: result.uncertain,
      accepted: result.accepted,
      blocked: result.blocked,
      total: result.total,
      errorCount: result.errors.length,
    });
    const { errors, ...health } = result;
    return NextResponse.json({ ...health, errorCount: errors.length });
  } catch (error) {
    console.error("customer_signed_contract_email_worker_failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ message: "Customer contract email worker failed" }, { status: 500 });
  }
}
