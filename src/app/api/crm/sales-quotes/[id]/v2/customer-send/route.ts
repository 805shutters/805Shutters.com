import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import {
  assertV2CustomerSendPersistenceRuntimeEnabled,
  parseSalesQuoteV2CustomerSendBody,
  persistSalesQuoteV2CustomerSend,
} from "@/lib/crm/sales-quote-v2-send-persist";

export const runtime = "nodejs";

/**
 * Protected persistence-only cutover route. It does not deliver email or SMS.
 * Production remains disabled unless the dedicated migration has been applied
 * and the explicit cutover environment value is present.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    assertV2CustomerSendPersistenceRuntimeEnabled();
    const rawBody = await request.json().catch(() => {
      throw new CrmAuthError(400, "A valid JSON request object is required.");
    });
    const body = parseSalesQuoteV2CustomerSendBody(rawBody);
    const { id } = await context.params;
    const result = await persistSalesQuoteV2CustomerSend(supabase, {
      quoteId: id,
      ...body,
      actorId: user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
