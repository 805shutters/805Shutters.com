import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { processOrderCogsInbox } from "@/lib/crm/order-cogs";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const payload = await request.json().catch(() => ({}));
    const result = await processOrderCogsInbox(supabase, {
      mailbox: payload.mailbox,
      query: payload.query,
      maxResults: payload.maxResults,
      messageIds: payload.messageIds,
      actorEmail: email
    });

    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
