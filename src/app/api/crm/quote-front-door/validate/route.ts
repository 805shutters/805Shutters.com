import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { validateQuoteFrontDoorTap } from "@/lib/crm/quote-front-door";
import { quoteFrontDoorStore, type QuoteFrontDoorDb } from "@/lib/crm/quote-front-door-server";
import { readFrontDoorBody, specField, textField } from "../body";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const body = await readFrontDoorBody(request);
    const result = await validateQuoteFrontDoorTap(quoteFrontDoorStore(supabase as unknown as QuoteFrontDoorDb), {
      manufacturer: textField(body.manufacturer),
      category: textField(body.category),
      fieldKey: textField(body.fieldKey),
      value: body.value,
      spec: specField(body.spec),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
