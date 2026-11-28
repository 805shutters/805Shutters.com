import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import {
  MERCURY_WEBHOOK_SECRET_ENV,
  readMercuryEvent,
  verifyMercurySignature,
} from "@/lib/finance/mercury";
import { applyMercuryDepositEvent } from "@/lib/crm/mercury-deposits";

export const runtime = "nodejs";
export const maxDuration = 30;

function logReceipt(eventType: string, transactionId: string | null) {
  // Never log the request, headers, signature, customer data or raw payload.
  const label = (value: string) => value.replace(/[\r\n\t]/g, " ").slice(0, 128);
  console.info({ eventType: label(eventType), transactionId: transactionId === null ? null : label(transactionId) });
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("mercury-signature") || "";
  if (!signature) return new NextResponse("Invalid signature", { status: 401 });
  const secret = process.env[MERCURY_WEBHOOK_SECRET_ENV]?.trim() || "";
  if (!secret) return new NextResponse("Webhook secret is not configured.", { status: 503 });
  // Read bytes for authentication only; do not parse or process before HMAC.
  const raw = Buffer.from(await request.arrayBuffer());
  if (!verifyMercurySignature(raw, signature, secret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  const read = readMercuryEvent(payload);
  if (read.kind === "invalid") return new NextResponse("Event identity is required", { status: 400 });
  if (read.kind === "ignore") {
    logReceipt(read.type, null);
    return NextResponse.json({ received: true, ignored: true });
  }
  const db = getSupabaseServiceClient();
  if (!db) return new NextResponse("Unavailable", { status: 503 });
  const result = await applyMercuryDepositEvent(db, read.event);
  if (!result.ok) return new NextResponse(result.message, { status: result.status });
  logReceipt(read.event.type, read.event.resourceId);
  return NextResponse.json({ received: true, duplicate: result.duplicate === true });
}
