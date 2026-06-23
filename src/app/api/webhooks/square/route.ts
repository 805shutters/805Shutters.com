import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import {
  verifySquareWebhookSignature,
  extractSquarePaymentFacts,
  isSquarePaidPaymentEvent,
  retrieveSquareOrderPaymentFacts,
  SQUARE_WEBHOOK_SIGNING_KEY,
  SQUARE_WEBHOOK_URL,
} from "@/lib/finance/square";

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
  if (!verifySquareWebhookSignature(SQUARE_WEBHOOK_URL, SQUARE_WEBHOOK_SIGNING_KEY, raw, signature)) {
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

  for (const event of events) {
    if (!isSquarePaidPaymentEvent(event)) continue;
    const baseFacts = extractSquarePaymentFacts(event);
    const orderFacts =
      baseFacts?.orderId && (!baseFacts.quoteId || !baseFacts.paymentType || baseFacts.amountCents <= 0)
        ? await retrieveSquareOrderPaymentFacts(baseFacts.orderId)
        : null;
    const facts = baseFacts
      ? {
          ...baseFacts,
          quoteId: baseFacts.quoteId ?? orderFacts?.quoteId ?? null,
          paymentType: baseFacts.paymentType ?? orderFacts?.paymentType ?? null,
          amountCents: baseFacts.amountCents > 0 ? baseFacts.amountCents : (orderFacts?.amountCents ?? 0),
          orderId: baseFacts.orderId ?? orderFacts?.orderId ?? null,
        }
      : null;
    if (!facts || !facts.quoteId || facts.amountCents <= 0) continue;

    // Idempotency: skip if this Square payment is already recorded.
    const { data: dup } = await supabase
      .from("crm_quote_bookkeeping_payments")
      .select("id")
      .eq("quote_id", facts.quoteId)
      .contains("meta", { square_payment_id: facts.squarePaymentId })
      .maybeSingle();
    if (dup) continue;

    const { data: quote } = await supabase.from("crm_quotes").select("job_id").eq("id", facts.quoteId).maybeSingle();
    const jobId = (quote as { job_id?: string | null } | null)?.job_id ?? null;
    const label = facts.paymentType === "balance" ? "Balance payment" : "Deposit";

    const { error } = await supabase.from("crm_quote_bookkeeping_payments").insert({
      quote_id: facts.quoteId,
      job_id: jobId,
      payment_label: label,
      payment_type: "credit_card",
      amount: facts.amountCents / 100,
      paid_at: new Date().toISOString().slice(0, 10),
      source: "square",
      meta: { square_payment_id: facts.squarePaymentId, payment_type: facts.paymentType, createdBy: "square-webhook" },
    });
    if (error) {
      // Never fail the webhook over one row; Square would retry. Log + continue.
      console.error("square webhook insert failed", { quoteId: facts.quoteId, error: error.message });
    }
  }

  return NextResponse.json({ received: true });
}
