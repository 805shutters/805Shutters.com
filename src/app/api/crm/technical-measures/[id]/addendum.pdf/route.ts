import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { technicalMeasureAddendumPdf } from "@/lib/crm/technical-measures";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { id } = await context.params;
    const pdf = await technicalMeasureAddendumPdf(supabase, id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="805-change-order-${id.slice(0, 8)}.pdf"` },
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
