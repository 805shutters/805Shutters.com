import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { lookupQuoteFrontDoorCustomers } from "@/lib/crm/quote-front-door";
import { quoteFrontDoorStore, type QuoteFrontDoorDb } from "@/lib/crm/quote-front-door-server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const params = request.nextUrl.searchParams;
    const result = await lookupQuoteFrontDoorCustomers(quoteFrontDoorStore(supabase as unknown as QuoteFrontDoorDb), {
      name: clip(params.get("name")),
      phone: clip(params.get("phone")),
      address: clip(params.get("address")),
    });
    return NextResponse.json(result, { headers });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

function clip(value: string | null) {
  const text = value?.trim() ?? "";
  return text ? text.slice(0, 150) : null;
}
