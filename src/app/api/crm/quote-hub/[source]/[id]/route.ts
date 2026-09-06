import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import {
  addHubNote,
  loadHubConversation,
  prepareHubEmail,
  resolveHubQuote,
  saveHubDraft,
  sendHubEmail,
  syncHubReplies,
} from "@/lib/crm/quote-hub";
import type { HubSource } from "@/lib/crm/quote-hub-model";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ source: string; id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const { supabase } = await requireCrmUser(request);
    const { source, id } = await context.params;
    const quote = await resolveHubQuote(supabase, source as HubSource, id);
    return NextResponse.json(await loadHubConversation(supabase, quote));
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const { source, id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object")
      throw new CrmAuthError(400, "A conversation action is required.");
    const quote = await resolveHubQuote(
      supabase,
      source as HubSource,
      id,
      body.operation === "open",
    );
    let result: unknown;
    switch (body.operation) {
      case "open":
        result = await loadHubConversation(supabase, quote);
        break;
      case "draft":
        result = await saveHubDraft(supabase, quote, email, body.draft);
        break;
      case "note":
        result = await addHubNote(supabase, quote, email, body.body);
        break;
      case "prepare":
        result = await prepareHubEmail(supabase, quote, email, body.draft);
        break;
      case "send":
      case "reconcile":
        result = await sendHubEmail(supabase, quote, email, body.messageId);
        break;
      case "sync":
        result = await syncHubReplies(supabase, quote);
        break;
      default:
        throw new CrmAuthError(400, "Unknown conversation action.");
    }
    return NextResponse.json(result);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
