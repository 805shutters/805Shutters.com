import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { loadPublicQuoteById } from "@/lib/crm/public-quote";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { id } = await context.params;
    const quote = await loadPublicQuoteById(supabase, id);

    if (!quote) {
      return NextResponse.json({ message: "CRM quote not found." }, { status: 404 });
    }

    return NextResponse.json({ quote }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
