import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, CrmAuthError, requireCrmUser } from "@/lib/crm/auth";
import { sendSquareOrderPaymentLink, type SquareOrderPaymentType } from "@/lib/crm/square-payment-links";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      paymentType?: SquareOrderPaymentType;
      recipientEmail?: string;
      expectedAmount?: number;
      expectedRecipient?: string;
      customAmount?: number;
    };
    if (body.paymentType !== "deposit" && body.paymentType !== "balance") {
      throw new CrmAuthError(400, "Choose either a deposit or balance payment link.");
    }
    if (body.customAmount !== undefined && (typeof body.expectedAmount !== "number" || typeof body.expectedRecipient !== "string")) {
      throw new CrmAuthError(400, "Confirm the payment amount and recipient before sending.");
    }
    return NextResponse.json(
      await sendSquareOrderPaymentLink(supabase, id, body.paymentType, { email, userId: user.id }, body.recipientEmail, undefined,
        body.expectedAmount !== undefined || body.expectedRecipient !== undefined
          ? { expectedAmount: body.expectedAmount as number, expectedRecipient: body.expectedRecipient as string, customAmount: body.customAmount } : undefined),
    );
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
