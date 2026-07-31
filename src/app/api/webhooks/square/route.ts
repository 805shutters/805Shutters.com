import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import {
  verifySquareWebhookSignature,
  extractSquarePaymentFacts,
  getSquareWebhookConfig,
  isSquarePaidPaymentEvent,
  isSquareWebhookTestPayment,
} from "@/lib/finance/square";
import { SquareReconcileResult } from "@/lib/crm/square-payments";
import { reconcileSquareApiPayment } from "@/lib/crm/square-api-reconciliation";

export const runtime = "nodejs";

// Square webhook: signature-verified + idempotent. When a customer pays a deposit
// or balance via Square, record a credit_card payment on the quote's bookkeeping
// entry (tagged with the Square payment id) so the ledger + alert boxes update.
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return new NextResponse("Service unavailable", { status: 503 });

  const raw = await request.text();
  const signature =
    request.headers.get("x-square-hmacsha256-signature") ??
    request.headers.get("x-square-hmac-signature");
  const { webhookUrl, signingKey } = getSquareWebhookConfig();
  if (!verifySquareWebhookSignature(webhookUrl, signingKey, raw, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const root = payload as { events?: unknown[] } | null;
  const events = Array.isArray(root?.events) ? (root!.events as unknown[]) : Array.isArray(payload) ? (payload as unknown[]) : [payload];
  const results: SquareReconcileResult[] = [];
  const errors: string[] = [];

  for (const event of events) {
    if (!isSquarePaidPaymentEvent(event)) continue;
    const facts = extractSquarePaymentFacts(event);
    if (!facts || facts.amountCents <= 0) continue;

    try {
      if (isSquareWebhookTestPayment(facts)) {
        results.push({
          status: "skipped",
          reason: "Authenticated Square provider test event; no CRM financial record was changed.",
          quoteId: null,
          squarePaymentId: facts.squarePaymentId,
          amount: facts.amountCents / 100,
        });
        continue;
      }
      // Never trust customer, order, quote, job, intent, status, or amount copied
      // into the event. Re-read the completed payment from Square's API before
      // matching and recording it.
      const result = await reconcileSquareApiPayment(supabase, facts);
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Square webhook processing error.";
      errors.push(message);
      console.error("square webhook processing failed", {
        squarePaymentId: facts.squarePaymentId,
        orderId: facts.orderId,
        error: message,
      });
    }
  }

  if (errors.length) {
    return NextResponse.json({ received: false, results, errors }, { status: 500 });
  }

  return NextResponse.json({ received: true, results });
}
