import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import {
  assertLegacyV2RepriceRuntimeEnabled,
  parseLegacyV2RepricePreviewBody,
  previewLegacySalesQuoteV2Reprice,
} from "@/lib/crm/sales-quote-v2-legacy-reprice";

export const runtime = "nodejs";

/**
 * Read/price first, then record only an append-only preview proof. This route
 * never changes quote totals, selections, lifecycle, or legacy/V2 ownership.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    assertLegacyV2RepriceRuntimeEnabled();
    const rawBody = await request.json().catch(() => {
      throw new CrmAuthError(400, "A valid JSON request object is required.");
    });
    const body = parseLegacyV2RepricePreviewBody(rawBody);
    const { id } = await context.params;
    const result = await previewLegacySalesQuoteV2Reprice(supabase, {
      quoteId: id,
      actorId: user.id,
      ...body,
    });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
