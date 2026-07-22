import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import {
  parseSalesQuoteV2PriceSaveBody,
  saveSalesQuoteV2AuthoritativePrice,
} from "@/lib/crm/sales-quote-v2-price-save";

export const runtime = "nodejs";

/**
 * Reprice and atomically save the full exact-interface V2 quote after one
 * design-selection change. Quote-wide execution is required for first/add-on
 * freight, oversize, processing-fee, and cross-line restriction accuracy.
 *
 * The browser supplies only row identities, optimistic concurrency, and an
 * idempotency key. Selection, catalog, fingerprint, retail, and protected cost
 * are reconstructed from persisted rows by trusted server code.
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
    const body = parseSalesQuoteV2PriceSaveBody(rawBody);
    const { id } = await context.params;
    const result = await saveSalesQuoteV2AuthoritativePrice(supabase, {
      quoteId: id,
      ...body,
      actorId: user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
