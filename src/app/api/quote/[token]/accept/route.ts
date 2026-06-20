import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { acceptPublicQuote } from "@/lib/crm/public-quote";
import { crmAuthErrorResponse } from "@/lib/crm/auth";

export const runtime = "nodejs";

// Public (share-token gated) endpoint: the customer e-signs to accept the quote.
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ message: "Service temporarily unavailable." }, { status: 503 });
    const { token } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { printedName?: string; signature?: string; acknowledgedTotal?: number };
    const result = await acceptPublicQuote(supabase, token, {
      printedName: String(body.printedName || ""),
      signature: typeof body.signature === "string" ? body.signature : undefined,
      acknowledgedTotal: typeof body.acknowledgedTotal === "number" ? body.acknowledgedTotal : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
