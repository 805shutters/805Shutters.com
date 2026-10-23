import { randomBytes, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, CrmAuthError, requireCrmUser } from "@/lib/crm/auth";
import { isMikePaymentAdminEmail } from "@/lib/crm/allowed-users";
import { CONTACTS_ACCOUNT, CONTACTS_SCOPE, contactsOAuthConfig, encryptContactSecret, hashContactState } from "@/lib/crm/google-contacts-auth";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    if (!isMikePaymentAdminEmail(email)) throw new CrmAuthError(403, "Only Mike can connect the shared address book.");
    const config = contactsOAuthConfig();
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const { error } = await supabase.from("crm_google_contacts_oauth_states").insert({ state_hash: hashContactState(state), actor_id: user.id, encrypted_verifier: encryptContactSecret(verifier) });
    if (error) throw new CrmAuthError(503, "Google Contacts connection storage is not ready.");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: `openid email ${CONTACTS_SCOPE}`, access_type: "offline", prompt: "consent select_account", login_hint: CONTACTS_ACCOUNT, state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
    const response = NextResponse.json({ url: url.toString() }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set("805_contacts_oauth", hashContactState(state), { httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: "/api/crm/google-contacts/callback", maxAge: 600 });
    return response;
  } catch (error) { return crmAuthErrorResponse(error); }
}
