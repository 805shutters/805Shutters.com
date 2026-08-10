import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { computeSelectionTotal, loadPublicQuoteByToken } from "@/lib/crm/public-quote";
import {
  createSquareWalletPayment,
  dollarsToCents,
  fetchSquarePaymentFacts,
  isSquareConfigured,
} from "@/lib/finance/square";
import { crmAuthErrorResponse, CrmAuthError } from "@/lib/crm/auth";
import { amountDueForPaymentType, type QuotePaymentType } from "@/lib/crm/quote-payment-state";
import { reconcileSquareApiPayment } from "@/lib/crm/square-api-reconciliation";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Public share-token-gated wallet payment endpoint. The browser supplies only
 * Square's one-time wallet token; amount, quote, job, and payment type are all
 * re-read and verified on the server before Square is called. */
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ message: "Service temporarily unavailable." }, { status: 503 });
    if (!isSquareConfigured()) throw new CrmAuthError(503, "Wallet payments are not enabled yet.");

    const { token } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      sourceId?: unknown;
      verificationToken?: unknown;
      walletType?: unknown;
      paymentType?: QuotePaymentType;
      idempotencyKey?: unknown;
      selectedLineIds?: unknown;
    };
    if (body.paymentType !== "deposit" && body.paymentType !== "balance") {
      throw new CrmAuthError(400, "Choose the payment shown on this contract.");
    }
    if (body.walletType !== "apple_pay" && body.walletType !== "google_pay") {
      throw new CrmAuthError(400, "Choose Apple Pay or Google Pay.");
    }
    if (typeof body.sourceId !== "string" || body.sourceId.length < 1 || body.sourceId.length > 1000) {
      throw new CrmAuthError(400, "The wallet authorization was invalid. Please try again.");
    }
    if (typeof body.idempotencyKey !== "string" || !UUID_PATTERN.test(body.idempotencyKey)) {
      throw new CrmAuthError(400, "The wallet payment request was invalid. Please try again.");
    }
    const verificationToken =
      typeof body.verificationToken === "string" && body.verificationToken.length <= 2000
        ? body.verificationToken
        : undefined;
    const selectedLineIds = Array.isArray(body.selectedLineIds)
      ? [...new Set(body.selectedLineIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0 && id.length <= 100,
        ))].slice(0, 200)
      : undefined;
    if (Array.isArray(body.selectedLineIds) && selectedLineIds?.length === 0) {
      throw new CrmAuthError(400, "Select at least one contract line before paying.");
    }

    const pub = await loadPublicQuoteByToken(supabase, token);
    if (!pub) throw new CrmAuthError(404, "This quote link is no longer valid.");
    const money = selectedLineIds?.length ? await computeSelectionTotal(supabase, token, selectedLineIds) : pub;
    const amount = amountDueForPaymentType(money.payment, body.paymentType);
    const amountCents = dollarsToCents(amount);

    const { data: quoteIdentity, error: quoteIdentityError } = await supabase
      .from("crm_quotes")
      .select("id,job_id")
      .eq("id", pub.id)
      .maybeSingle();
    if (quoteIdentityError || !quoteIdentity?.job_id) {
      throw new CrmAuthError(502, "The exact CRM job for this payment could not be verified.");
    }

    let payment;
    try {
      payment = await createSquareWalletPayment({
        sourceId: body.sourceId,
        verificationToken,
        amountCents,
        title: `${body.paymentType === "deposit" ? "Deposit" : "Order balance"} — 805 Shutters${pub.quoteNumber ? ` (${pub.quoteNumber})` : ""}`,
        quoteId: pub.id,
        jobId: quoteIdentity.job_id,
        paymentType: body.paymentType,
        walletType: body.walletType,
        idempotencyKey: body.idempotencyKey,
        selectedLineIds,
      });
    } catch (error) {
      console.error("Square wallet payment failed", {
        quoteId: pub.id,
        walletType: body.walletType,
        error: error instanceof Error ? error.message : "Unknown Square error",
      });
      throw new CrmAuthError(402, "Square could not complete this wallet payment. No payment was recorded. Please try another payment method.");
    }

    // Reconcile immediately so the contract ledger updates without depending
    // on webhook timing. The verified webhook remains the retry/fallback path.
    try {
      const facts = await fetchSquarePaymentFacts(payment.paymentId);
      await reconcileSquareApiPayment(supabase, facts);
    } catch (error) {
      console.error("Square wallet payment completed; immediate CRM reconciliation will retry by webhook", {
        squarePaymentId: payment.paymentId,
        error: error instanceof Error ? error.message : "Unknown reconciliation error",
      });
    }

    return NextResponse.json({
      ok: true,
      paymentId: payment.paymentId,
      status: payment.status,
      receiptUrl: payment.receiptUrl,
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
