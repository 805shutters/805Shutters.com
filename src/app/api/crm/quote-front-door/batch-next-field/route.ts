import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireQuoteFrontDoorActor } from "@/lib/crm/auth";
import { nextQuoteButtonBatch } from "@/lib/crm/quote-front-door-batch";
import { quoteFrontDoorStore, type QuoteFrontDoorDb } from "@/lib/crm/quote-front-door-server";
import { readFrontDoorBody, specField, textField } from "../body";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireQuoteFrontDoorActor(request);
    const body = await readFrontDoorBody(request);
    const result = await nextQuoteButtonBatch(quoteFrontDoorStore(supabase as unknown as QuoteFrontDoorDb), {
      manufacturer: textField(body.manufacturer),
      category: textField(body.category),
      spec: specField(body.spec),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
