import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, CrmAuthError, requireCrmUser } from "@/lib/crm/auth";
import { sendSquareEntryPaymentLink } from "@/lib/crm/square-entry-payment-links";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new CrmAuthError(400, "A valid bookkeeping entry ID is required.");
    }
    const parsed: unknown = await request.json().catch(() => null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new CrmAuthError(400, "A valid payment request is required.");
    const body = parsed as Record<string, unknown>;
    if (body.paymentType !== "deposit" && body.paymentType !== "balance") {
      throw new CrmAuthError(400, "Choose either a deposit or balance payment link.");
    }
    if (typeof body.expectedAmount !== "number" || !Number.isFinite(body.expectedAmount) || typeof body.expectedRecipient !== "string") {
      throw new CrmAuthError(400, "Confirm the payment amount and recipient before sending.");
    }
    return NextResponse.json(await sendSquareEntryPaymentLink(supabase, id, body.paymentType, { email, userId: user.id }, {
      expectedAmount: body.expectedAmount, expectedRecipient: body.expectedRecipient,
    }));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
