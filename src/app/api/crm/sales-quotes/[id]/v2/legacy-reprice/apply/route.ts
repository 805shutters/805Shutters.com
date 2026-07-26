import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import {
  applyLegacySalesQuoteV2Reprice,
  assertLegacyV2RepriceRuntimeEnabled,
  parseLegacyV2RepriceApplyBody,
} from "@/lib/crm/sales-quote-v2-legacy-reprice";

export const runtime = "nodejs";

/**
 * Explicit conversion only. The atomic RPC independently verifies the saved
 * preview, unchanged legacy state, revision, selected designs, pricing batch,
 * actor, expiry, and idempotency key before any quote mutation can commit.
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
    const body = parseLegacyV2RepriceApplyBody(rawBody);
    const { id } = await context.params;
    const result = await applyLegacySalesQuoteV2Reprice(supabase, {
      quoteId: id,
      actorId: user.id,
      ...body,
    });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
