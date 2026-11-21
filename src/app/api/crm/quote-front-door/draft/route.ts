import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { saveQuoteFrontDoorDraft } from "@/lib/crm/quote-front-door";
import { quoteFrontDoorStore, type QuoteFrontDoorDb } from "@/lib/crm/quote-front-door-server";
import { customerField, readFrontDoorBody, specField, textField } from "../body";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const body = await readFrontDoorBody(request);
    const result = await saveQuoteFrontDoorDraft(
      quoteFrontDoorStore(supabase as unknown as QuoteFrontDoorDb),
      {
        manufacturer: textField(body.manufacturer),
        category: textField(body.category),
        spec: specField(body.spec),
        customer: customerField(body.customer),
        idempotencyKey: textField(body.idempotencyKey),
      },
      { email, userId: user.id },
    );
    const status = result.saved ? 200 : result.reason === "customer_name_required" ? 400 : 409;
    return NextResponse.json(result, { status, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
