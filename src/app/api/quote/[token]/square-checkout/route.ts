import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { loadPublicQuoteByToken } from "@/lib/crm/public-quote";
import { createSquarePaymentLink, dollarsToCents, isSquareConfigured } from "@/lib/finance/square";
import { crmAuthErrorResponse, CrmAuthError } from "@/lib/crm/auth";

export const runtime = "nodejs";

// Public (share-token gated): start a Square Online Checkout for the quote's
// deposit or balance. Returns { url } — the hosted Square payment page.
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ message: "Service temporarily unavailable." }, { status: 503 });
    if (!isSquareConfigured()) throw new CrmAuthError(503, "Card payments are not enabled yet.");

    const { token } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { paymentType?: "deposit" | "balance" };
    const type: "deposit" | "balance" = body.paymentType === "balance" ? "balance" : "deposit";

    const pub = await loadPublicQuoteByToken(supabase, token);
    if (!pub) throw new CrmAuthError(404, "This quote link is no longer valid.");

    const amount = type === "deposit" ? pub.depositDue : pub.balanceDue;
    if (!(amount > 0)) throw new CrmAuthError(400, `No ${type} is due on this quote.`);

    const link = await createSquarePaymentLink({
      amountCents: dollarsToCents(amount),
      title: `${type === "deposit" ? "Deposit" : "Balance"} — 805 Shutters${pub.quoteNumber ? ` (${pub.quoteNumber})` : ""}`,
      quoteId: pub.id,
      paymentType: type,
    });
    return NextResponse.json({ url: link.url });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
