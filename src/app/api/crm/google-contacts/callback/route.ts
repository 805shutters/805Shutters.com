import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { CONTACTS_ACCOUNT, CONTACTS_SCOPE, contactsOAuthConfig, decryptContactSecret, encryptContactSecret, googleContactToken, hashContactState, verifyContactIdentity } from "@/lib/crm/google-contacts-auth";
import { enqueueContactsBackfill } from "@/lib/crm/google-contacts-sync";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  // No OAuth codes/tokens or Google response bodies are logged or reflected.
  let result = "connection_failed";
  try {
    const config = contactsOAuthConfig();
    const state = request.nextUrl.searchParams.get("state");
    const code = request.nextUrl.searchParams.get("code");
    if (!state || !code || request.cookies.get("805_contacts_oauth")?.value !== hashContactState(state)) throw new Error("invalid_state");
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new Error("database_unavailable");
    const { data, error } = await supabase.from("crm_google_contacts_oauth_states").delete().eq("state_hash", hashContactState(state)).gt("expires_at", new Date().toISOString()).select("*").maybeSingle();
    if (error || !data) throw new Error("expired_state");
    const token = await googleContactToken(new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code", code, code_verifier: decryptContactSecret(data.encrypted_verifier) }));
    const identity = await verifyContactIdentity(token.access_token!);
    if (!token.refresh_token || !token.scope?.split(" ").includes(CONTACTS_SCOPE)) throw new Error("contacts_consent_required");
    const { error: saveError } = await supabase.from("crm_google_contacts_connection").upsert({ id: true, account_email: CONTACTS_ACCOUNT, google_subject: identity.sub, encrypted_refresh_token: encryptContactSecret(token.refresh_token), connected_by: data.actor_id, connected_at: new Date().toISOString(), enabled: true });
    if (saveError) throw new Error("storage_failed");
    await enqueueContactsBackfill(supabase);
    result = "connected";
  } catch { /* Deliberately generic. Never expose Google codes, tokens or upstream bodies. */ }
  const response = NextResponse.redirect(new URL(`/crm/google-contacts?connection=${result}`, process.env.GOOGLE_CONTACTS_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin));
  response.cookies.delete({ name: "805_contacts_oauth", path: "/api/crm/google-contacts/callback" });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
