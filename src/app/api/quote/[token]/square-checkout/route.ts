import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { computeSelectionTotal, loadPublicQuoteByToken } from "@/lib/crm/public-quote";
import { createSquarePaymentLink, dollarsToCents, isSquareConfigured } from "@/lib/finance/square";
import { crmAuthErrorResponse, CrmAuthError } from "@/lib/crm/auth";
import { amountDueForPaymentType, type QuotePaymentType } from "@/lib/crm/quote-payment-state";

export const runtime = "nodejs";

// Public (share-token gated): start a Square Online Checkout for the amount the
// current bookkeeping ledger says is due. Returns { url }.
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ message: "Service temporarily unavailable." }, { status: 503 });
    if (!isSquareConfigured()) throw new CrmAuthError(503, "Card payments are not enabled yet.");

    const { token } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      paymentType?: QuotePaymentType;
      selectedLineIds?: unknown;
    };
    if (body.paymentType !== "deposit" && body.paymentType !== "balance") {
      throw new CrmAuthError(400, "Choose the payment shown on this contract.");
    }
    const selectedLineIds = Array.isArray(body.selectedLineIds)
      ? body.selectedLineIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : undefined;

    const pub = await loadPublicQuoteByToken(supabase, token);
    if (!pub) throw new CrmAuthError(404, "This quote link is no longer valid.");

    const money = selectedLineIds?.length ? await computeSelectionTotal(supabase, token, selectedLineIds) : pub;
    const amount = amountDueForPaymentType(money.payment, body.paymentType);
    const { data: quoteIdentity, error: quoteIdentityError } = await supabase
      .from("crm_quotes")
      .select("id,job_id")
      .eq("id", pub.id)
      .maybeSingle();
    if (quoteIdentityError || !quoteIdentity?.job_id) {
      throw new CrmAuthError(502, "The exact CRM job for this payment could not be verified.");
    }

    const link = await createSquarePaymentLink({
      amountCents: dollarsToCents(amount),
      title: `${body.paymentType === "deposit" ? "Deposit" : "Order balance"} — 805 Shutters${pub.quoteNumber ? ` (${pub.quoteNumber})` : ""}`,
      quoteId: pub.id,
      jobId: quoteIdentity.job_id,
      paymentType: body.paymentType,
      selectedLineIds,
    });
    return NextResponse.json({ url: link.url });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
