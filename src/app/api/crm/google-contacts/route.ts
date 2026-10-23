import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { isMikePaymentAdminEmail } from "@/lib/crm/allowed-users";
import { CONTACTS_ACCOUNT, contactsOAuthConfig } from "@/lib/crm/google-contacts-auth";
import { contactsDryRun, enqueueContactsBackfill, processContactsQueue } from "@/lib/crm/google-contacts-sync";
export const runtime = "nodejs";
export const maxDuration = 300;
async function admin(request: NextRequest) {
  const context = await requireCrmUser(request);
  if (!isMikePaymentAdminEmail(context.email)) throw new CrmAuthError(403, "Only Mike can manage the shared business address book.");
  return context.supabase;
}
export async function GET(request: NextRequest) {
  try {
    const supabase = await admin(request);
    if (request.nextUrl.searchParams.get("dryRun") === "true") return NextResponse.json(await contactsDryRun(supabase, { crmOnly: request.nextUrl.searchParams.get("crmOnly") === "true" }), { headers: { "Cache-Control": "no-store" } });
    let configured = true;
    try { contactsOAuthConfig(); } catch { configured = false; }
    const { data, error } = await supabase.from("crm_google_contacts_connection").select("account_email,connected_at,enabled").eq("id",true).maybeSingle();
    const { data: rows } = await supabase.from("crm_google_contacts_sync").select("status,exception_code");
    const statuses: Record<string, number> = {};
    for (const row of rows || []) statuses[row.status] = (statuses[row.status] || 0)+1;
    return NextResponse.json({ account: CONTACTS_ACCOUNT, configured, storageReady: !error, connected: Boolean(data?.enabled), connectedAt: data?.connected_at, statuses }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return crmAuthErrorResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    const supabase = await admin(request);
    const { action } = await request.json();
    if (action === "backfill") return NextResponse.json(await enqueueContactsBackfill(supabase));
    if (action === "process") return NextResponse.json(await processContactsQueue(supabase));
    throw new CrmAuthError(400, "Choose backfill or process.");
  } catch (error) { return crmAuthErrorResponse(error); }
}
