import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import {
  createSalesQuoteAlternative,
  parseQuoteAlternativeBody,
} from "@/lib/crm/sales-quote-v2-alternatives";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    const body = parseQuoteAlternativeBody(
      await request.json().catch(() => {
        throw new CrmAuthError(400, "A valid JSON request is required.");
      }),
    );
    const { id } = await context.params;
    return NextResponse.json(
      await createSalesQuoteAlternative(supabase, user.id, id, body),
      { status: 201 },
    );
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
