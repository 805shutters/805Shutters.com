import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { prepareSalesQuoteInPerson } from "@/lib/crm/sales-quote-send";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await prepareSalesQuoteInPerson(supabase, id, { email, userId: user.id }, {
      expectedRevision: body?.expectedRevision, idempotencyKey: body?.idempotencyKey,
      measureDecision: body?.measureDecision,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return crmAuthErrorResponse(error); }
}
