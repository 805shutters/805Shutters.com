import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { advanceQuoteStatus } from "@/lib/crm/quote-builder";
import { crmQuoteStatuses, type CrmQuoteStatus } from "@/lib/crm/types";

export const runtime = "nodejs";

// POST { status }: advance the quote to a lifecycle status (drives the job status).
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { status?: string };
    const status = String(body.status || "");
    if (!(crmQuoteStatuses as readonly string[]).includes(status)) {
      return NextResponse.json({ message: "Invalid quote status." }, { status: 400 });
    }
    const quote = await advanceQuoteStatus(supabase, id, status as CrmQuoteStatus, { email, userId: user.id });
    return NextResponse.json({ quote });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
