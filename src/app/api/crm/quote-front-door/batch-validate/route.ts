import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireQuoteFrontDoorActor } from "@/lib/crm/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { salesQuoteStructureWriter, validateQuoteButtonBatch } from "@/lib/crm/quote-front-door-batch";
import { quoteFrontDoorStore, type QuoteFrontDoorDb } from "@/lib/crm/quote-front-door-server";
import { idListField, lineListField, picksField, readFrontDoorBody, specField, textField } from "../body";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, userId } = await requireQuoteFrontDoorActor(request);
    const body = await readFrontDoorBody(request);
    const revision = typeof body.expectedRevision === "number" ? body.expectedRevision : Number(body.expectedRevision);
    const result = await validateQuoteButtonBatch(
      quoteFrontDoorStore(supabase as unknown as QuoteFrontDoorDb),
      {
        manufacturer: textField(body.manufacturer),
        category: textField(body.category),
        spec: specField(body.spec),
        picks: picksField(body.picks),
        lines: lineListField(body.lines),
        applyToLineIds: idListField(body.applyToLineIds),
        quote: textField(body.quoteId)
          ? { id: textField(body.quoteId), expectedRevision: revision, idempotencyKey: textField(body.idempotencyKey) }
          : null,
      },
      { email, userId },
      salesQuoteStructureWriter(supabase as unknown as SupabaseClient),
    );
    const status = result.saved || result.reason === "needs_input" || result.reason === "no_picks" || result.reason === "quote_required" ? 200 : 409;
    return NextResponse.json(result, { status, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
