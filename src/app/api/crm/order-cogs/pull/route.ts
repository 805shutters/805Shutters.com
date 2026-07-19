import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { processOrderCogsInbox } from "@/lib/crm/order-cogs";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireCrmUser(request);
    const supabase = getSupabaseServiceClient();
    if (!supabase) return NextResponse.json({ message: "Dedicated Supabase database is not configured." }, { status: 503 });
    return NextResponse.json(await processOrderCogsInbox(supabase, { actorEmail: actor.email }));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
