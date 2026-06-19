import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { priceDesign, type PriceInput } from "@/lib/quote/pricing";

export const runtime = "nodejs";

// POST: live price preview for the builder UI (before a design is saved).
// Body matches the pricing engine's PriceInput.
export async function POST(request: NextRequest) {
  try {
    await requireCrmUser(request);
    const body = (await request.json()) as Partial<PriceInput>;
    const result = priceDesign({
      productId: String(body.productId ?? ""),
      programId: body.programId ?? undefined,
      fabric: body.fabric ?? undefined,
      widthInches: Number(body.widthInches),
      heightInches: Number(body.heightInches),
      quantity: body.quantity,
      surcharges: Array.isArray(body.surcharges) ? body.surcharges : [],
      motorization: Array.isArray(body.motorization) ? body.motorization : [],
    });
    return NextResponse.json({ result });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
