import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import {
  createSalesQuoteV2Draft,
  parseCreateSalesQuoteV2DraftBody,
} from "@/lib/crm/sales-quote-v2-structure";

export const runtime = "nodejs";

/**
 * Creates one server-numbered authoritative Quote V2 draft. The browser never
 * calls next_quote_number or inserts a V2 row directly.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    const rawBody = await request.json().catch(() => {
      throw new CrmAuthError(400, "A valid JSON request object is required.");
    });
    const body = parseCreateSalesQuoteV2DraftBody(rawBody);
    return NextResponse.json(
      await createSalesQuoteV2Draft(supabase, user.id, body),
      { status: 201 },
    );
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
