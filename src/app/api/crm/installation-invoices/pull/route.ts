import { NextRequest, NextResponse } from "next/server";
import { processInstallationInvoiceInbox } from "@/lib/crm/installation-invoices";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const payload = await request.json().catch(() => ({}));
    const result = await processInstallationInvoiceInbox(supabase, {
      actorEmail: email,
      maxResults: typeof payload.maxResults === "number" ? payload.maxResults : undefined,
      query: typeof payload.query === "string" && payload.query.trim() ? payload.query.trim() : undefined,
      messageIds: Array.isArray(payload.messageIds)
        ? payload.messageIds.filter((id: unknown): id is string => typeof id === "string")
        : undefined
    });

    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
