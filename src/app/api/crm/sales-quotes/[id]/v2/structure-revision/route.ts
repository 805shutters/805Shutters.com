import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import {
  mutateSalesQuoteV2Structure,
  parseSalesQuoteV2StructureBody,
} from "@/lib/crm/sales-quote-v2-structure";

export const runtime = "nodejs";

/**
 * Applies one idempotent, optimistic-concurrency-protected structural batch to
 * a new revision of a finalized quote. The source is preserved atomically.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    const rawBody = await request.json().catch(() => {
      throw new CrmAuthError(400, "A valid JSON request object is required.");
    });
    const body = parseSalesQuoteV2StructureBody(rawBody);
    const { id } = await context.params;
    return NextResponse.json(
      await mutateSalesQuoteV2Structure(supabase, id, user.id, body, true),
    );
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
