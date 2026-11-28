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

export async function POST(request: NextRequest) {
  const secret = process.env[MERCURY_WEBHOOK_SECRET_ENV]?.trim() || "";
  if (!secret) return new NextResponse("Webhook secret is not configured.", { status: 503 });
  const raw = await request.text();
  if (!verifyMercurySignature(raw, request.headers.get("mercury-signature") || "", secret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  const read = readMercuryEvent(payload);
  if (read.kind === "invalid") return new NextResponse("Event identity is required", { status: 400 });
  if (read.kind === "ignore") return NextResponse.json({ received: true, ignored: true });
  const db = getSupabaseServiceClient();
  if (!db) return new NextResponse("Unavailable", { status: 503 });
  const result = await applyMercuryDepositEvent(db, read.event);
  if (!result.ok) return new NextResponse(result.message, { status: result.status });
  return NextResponse.json({ received: true, duplicate: result.duplicate === true });
}
