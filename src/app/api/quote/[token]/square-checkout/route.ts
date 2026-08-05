import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { computeSelectionTotal, loadPublicQuoteByToken } from "@/lib/crm/public-quote";
import { createSquarePaymentLink, dollarsToCents, isSquareConfigured } from "@/lib/finance/square";
import { crmAuthErrorResponse, CrmAuthError } from "@/lib/crm/auth";

export const runtime = "nodejs";

// Public (share-token gated): start a Square Online Checkout for the quote's
// deposit. Returns { url } — the hosted Square payment page.
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ message: "Service temporarily unavailable." }, { status: 503 });
    if (!isSquareConfigured()) throw new CrmAuthError(503, "Card payments are not enabled yet.");

    const { token } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      paymentType?: "deposit" | "balance";
      selectedLineIds?: unknown;
    };
    if (body.paymentType === "balance") {
      throw new CrmAuthError(400, "Only deposit card payments are available on quote links.");
    }
    const selectedLineIds = Array.isArray(body.selectedLineIds)
      ? body.selectedLineIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : undefined;

    const pub = await loadPublicQuoteByToken(supabase, token);
    if (!pub) throw new CrmAuthError(404, "This quote link is no longer valid.");

    const money = selectedLineIds?.length ? await computeSelectionTotal(supabase, token, selectedLineIds) : pub;
    const amount = money.depositDue;
    if (!(amount > 0)) throw new CrmAuthError(400, "No deposit is due on this quote.");
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
      title: `Deposit — 805 Shutters${pub.quoteNumber ? ` (${pub.quoteNumber})` : ""}`,
      quoteId: pub.id,
      jobId: quoteIdentity.job_id,
      paymentType: "deposit",
      selectedLineIds,
    });
    return NextResponse.json({ url: link.url });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
