import { NextRequest, NextResponse } from "next/server";
import { completeMeasureNeededForJob, markMeasureNotNeededForJob, requestMeasureNeededForJob } from "@/lib/crm/measure-needed";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { ensureTechnicalMeasureForm } from "@/lib/crm/technical-measures";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const actor = { email, userId: user.id };

    if (body.action === "measured") {
      return NextResponse.json(await completeMeasureNeededForJob(supabase, id, actor));
    }

    if (!body.action || body.action === "request") {
      const result = await requestMeasureNeededForJob(supabase, id, actor, "manual");
      const { data: quote } = await supabase
        .from("crm_quotes")
        .select("id")
        .eq("job_id", id)
        .in("status", ["sold", "approved"])
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const form = quote?.id
        ? await ensureTechnicalMeasureForm(supabase, { jobId: id, quoteId: quote.id }, actor)
        : null;
      return NextResponse.json({ ...result, form });
    }

    if (body.action === "not_needed") {
      return NextResponse.json(await markMeasureNotNeededForJob(supabase, id, actor, "manual"));
    }

    throw new CrmAuthError(400, "Unsupported measure-needed action.");
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
