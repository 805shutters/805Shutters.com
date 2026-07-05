import { NextRequest, NextResponse } from "next/server";
import { linkAutopayCard } from "@/lib/crm/payment-plans";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Card setup is temporarily unavailable." }, { status: 503 });
  }

  const payload = (await request.json().catch(() => ({}))) as { sourceId?: string; cardholderName?: string };
  const result = await linkAutopayCard(supabase, token, {
    sourceId: String(payload.sourceId || ""),
    cardholderName: typeof payload.cardholderName === "string" ? payload.cardholderName : null
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, cardBrand: result.cardBrand, cardLast4: result.cardLast4 });
}
