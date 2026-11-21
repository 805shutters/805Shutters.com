import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { validateQuoteButtonBatch } from "@/lib/crm/quote-front-door-batch";
import { quoteFrontDoorStore, type QuoteFrontDoorDb } from "@/lib/crm/quote-front-door-server";
import { customerField, idListField, lineListField, picksField, readFrontDoorBody, specField, textField } from "../body";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const body = await readFrontDoorBody(request);
    const result = await validateQuoteButtonBatch(
      quoteFrontDoorStore(supabase as unknown as QuoteFrontDoorDb),
      {
        manufacturer: textField(body.manufacturer),
        category: textField(body.category),
        spec: specField(body.spec),
        picks: picksField(body.picks),
        lines: lineListField(body.lines),
        applyToLineIds: idListField(body.applyToLineIds),
        customer: customerField(body.customer),
      },
      { email, userId: user.id },
    );
    const status = result.saved || result.reason === "needs_input" || result.reason === "no_picks" ? 200 : result.reason === "customer_name_required" ? 400 : 409;
    return NextResponse.json(result, { status, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
