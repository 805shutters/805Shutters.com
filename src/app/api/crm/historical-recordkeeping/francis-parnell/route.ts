import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser, CrmAuthError } from "@/lib/crm/auth";
import {
  backfillFrancisParnellHistoricalRecordkeeping,
  FRANCIS_PARNELL_BACKFILL,
} from "@/lib/crm/historical-francis-parnell-backfill";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const body = (await request.json().catch(() => ({}))) as { mode?: unknown };
    const { data, error } = await supabase
      .from("sales_quotes")
      .select("id")
      .eq("quote_number", FRANCIS_PARNELL_BACKFILL.quoteNumber)
      .limit(2);
    if (error) throw new CrmAuthError(502, "The historical source quote could not be located.");
    if ((data || []).length !== 1) {
      throw new CrmAuthError(409, `Historical backfill requires exactly one ${FRANCIS_PARNELL_BACKFILL.quoteNumber} source quote.`);
    }
    const result = await backfillFrancisParnellHistoricalRecordkeeping(
      supabase,
      String(data![0].id),
      { email, userId: user.id },
      body.mode,
    );
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
