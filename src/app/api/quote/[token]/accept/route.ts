import { after, NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { acceptPublicQuote, publicQuoteSigningStatus } from "@/lib/crm/public-quote";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Read-only recovery for a dropped response; never sends messages or signs.
export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ message: "Service temporarily unavailable." }, { status: 503 });
    const { token } = await context.params;
    return NextResponse.json(await publicQuoteSigningStatus(supabase, token), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

// Public (share-token gated) endpoint: the customer e-signs to accept the quote.
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ message: "Service temporarily unavailable." }, { status: 503 });
  const { token } = await context.params;
  let input: Parameters<typeof acceptPublicQuote>[2] | undefined;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.printedName !== "string" || !body.printedName.trim()
      || typeof body.signature !== "string" || !body.signature.trim()
      || typeof body.acknowledgedTotal !== "number" || !Number.isFinite(body.acknowledgedTotal) || body.acknowledgedTotal <= 0
      || (body.selectedLineIds !== undefined && (!Array.isArray(body.selectedLineIds)
        || !body.selectedLineIds.every((id: unknown) => typeof id === "string" && id.length > 0)))) {
      throw new CrmAuthError(400, "Please review the contract total and type your full name to sign.");
    }
    input = { printedName: body.printedName, signature: body.signature, acknowledgedTotal: body.acknowledgedTotal,
      selectedLineIds: body.selectedLineIds };
    return NextResponse.json(await acceptPublicQuote(supabase, token, input));
  } catch (error) {
    // Never tell a customer the signature failed solely because a later CRM,
    // document, or notification operation failed. Confirm durable evidence first.
    if (input && (!(error instanceof CrmAuthError) || error.status >= 500)) {
      try {
        const status = await publicQuoteSigningStatus(supabase, token);
        if (status.signed) {
          console.error("[contract-signing] follow-up incomplete after saved signature", error);
          const retryInput = input;
          after(async () => {
            try {
              await acceptPublicQuote(supabase, token, retryInput);
            } catch (retryError) {
              console.error("[contract-signing] saved signature follow-up retry failed", retryError);
            }
          });
          return NextResponse.json({ ok: true, alreadySigned: true, followUpPending: true }, { status: 202 });
        }
      } catch (confirmationError) {
        console.error("[contract-signing] signature confirmation unavailable", confirmationError);
      }
    }
    return crmAuthErrorResponse(error);
  }
}
