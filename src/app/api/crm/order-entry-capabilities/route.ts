import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { MANUFACTURER_ORDER_CAPABILITY_MATRIX } from "@/lib/crm/vendor-orders/manufacturer-order-capability-matrix";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireCrmUser(request);
    return NextResponse.json({
      safetyBoundary: "review_only_never_submit_checkout_pay_or_email",
      routes: MANUFACTURER_ORDER_CAPABILITY_MATRIX,
      summary: MANUFACTURER_ORDER_CAPABILITY_MATRIX.reduce<Record<string, number>>((counts, route) => {
        counts[route.state] = (counts[route.state] || 0) + 1;
        return counts;
      }, {}),
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
