import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import {
  assertV2CustomerSendPreparationRuntimeEnabled,
  parseSalesQuoteV2CustomerSendBody,
  prepareSalesQuoteV2CustomerSend,
} from "@/lib/crm/sales-quote-v2-send-persist";

export const runtime = "nodejs";

/**
 * Protected preparation-only route. It writes a draft customer-safe mirror and
 * immutable intent, but never delivers email/SMS or marks either quote sent.
 * It remains disabled unless the dedicated migration and explicit preview gate
 * are present. Actual delivery is a separate, still-blocked cutover.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    assertV2CustomerSendPreparationRuntimeEnabled();
    const rawBody = await request.json().catch(() => {
      throw new CrmAuthError(400, "A valid JSON request object is required.");
    });
    const body = parseSalesQuoteV2CustomerSendBody(rawBody);
    const { id } = await context.params;
    const result = await prepareSalesQuoteV2CustomerSend(supabase, {
      quoteId: id,
      ...body,
      actorId: user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
