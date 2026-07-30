import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { backfillFrancisParnellHistoricalRecordkeeping } from "@/lib/crm/historical-francis-parnell-backfill";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { mode?: unknown };
    const result = await backfillFrancisParnellHistoricalRecordkeeping(
      supabase,
      id,
      { email, userId: user.id },
      body.mode,
    );
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
