import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { parseLinePriceBody } from "@/lib/crm/sales-quote-line-price";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireCrmUser(request);
    const body = parseLinePriceBody(await request.json());
    const { id } = await context.params;
    const { data, error } = await supabase.rpc("set_sales_quote_line_price", {
      p_quote_id: id, p_line_item_id: body.lineItemId, p_variant: body.variant,
      p_unit_price: body.unitPrice, p_actor_id: user.id,
      p_expected_revision: body.expectedRevision, p_request_id: body.requestId,
    });
    if (error) throw new CrmAuthError(409, error.message);
    return NextResponse.json(data);
  } catch (error) { return crmAuthErrorResponse(error); }
}
