import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { processOrderCogsInbox } from "@/lib/crm/order-cogs";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const payload = await request.json().catch(() => ({}));
    const rawTarget = payload.target && typeof payload.target === "object" ? payload.target : null;
    const target = rawTarget && typeof rawTarget.customerName === "string" && rawTarget.customerName.trim()
      ? {
          customerName: rawTarget.customerName.trim(),
          jobId: typeof rawTarget.jobId === "string" ? rawTarget.jobId : null,
          quoteId: typeof rawTarget.quoteId === "string" ? rawTarget.quoteId : null,
          entryId: typeof rawTarget.entryId === "string" ? rawTarget.entryId : null
        }
      : undefined;
    const result = await processOrderCogsInbox(supabase, {
      actorEmail: email,
      mailbox: typeof payload.mailbox === "string" && payload.mailbox.trim() ? payload.mailbox.trim() : undefined,
      maxResults: typeof payload.maxResults === "number" ? payload.maxResults : undefined,
      query: typeof payload.query === "string" && payload.query.trim() ? payload.query.trim() : undefined,
      messageIds: Array.isArray(payload.messageIds)
        ? payload.messageIds.filter((id: unknown): id is string => typeof id === "string")
        : undefined,
      days: typeof payload.days === "number" ? payload.days : undefined,
      target,
      archive: typeof payload.archive === "boolean" ? payload.archive : undefined,
      autoApply: false
    });

    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
