import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";

export const CONTACTS_ACCOUNT = "805@805shutters.com";
export const CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts";
export const hashContactState = (value: string) => createHash("sha256").update(value).digest("hex");

export function contactsOAuthConfig() {
  const clientId = process.env.GOOGLE_CONTACTS_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CONTACTS_CLIENT_SECRET || process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const origin = process.env.GOOGLE_CONTACTS_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL;
  const encryptionKey = process.env.GOOGLE_CONTACTS_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !origin || !encryptionKey || !/^[a-f\d]{64}$/i.test(encryptionKey)) {
    throw new CrmAuthError(503, "Google Contacts needs an OAuth client, site origin, and a dedicated 32-byte encryption key.");
  }
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new CrmAuthError(503, "Google Contacts requires HTTPS.");
  return { clientId, clientSecret, encryptionKey: Buffer.from(encryptionKey, "hex"), redirectUri: `${url.origin}/api/crm/google-contacts/callback`, origin: url.origin };
}
export function encryptContactSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", contactsOAuthConfig().encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(b => b.toString("base64url")).join(".");
}
export function decryptContactSecret(value: string) {
  const [iv, tag, data] = value.split(".").map(s => Buffer.from(s, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", contactsOAuthConfig().encryptionKey, iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
export async function googleContactToken(body: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new CrmAuthError(503, "Google Contacts authorization failed. Reconnect the business account.");
  const result = await response.json() as { access_token?: string; refresh_token?: string; scope?: string };
  if (!result.access_token) throw new CrmAuthError(503, "Google Contacts access token is missing.");
  return result;
}
export async function verifyContactIdentity(accessToken: string, expectedSubject?: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new CrmAuthError(503, "Google Contacts account identity could not be verified.");
  const identity = await response.json() as { email?: string; email_verified?: boolean; sub?: string };
  if (identity.email?.toLowerCase() !== CONTACTS_ACCOUNT || !identity.email_verified || !identity.sub || (expectedSubject && identity.sub !== expectedSubject)) {
    throw new CrmAuthError(403, `Connect only ${CONTACTS_ACCOUNT} for the shared business address book.`);
  }
  return identity as { email: string; sub: string };
}
export async function getContactsAccess(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("crm_google_contacts_connection").select("*").eq("id", true).maybeSingle();
  if (error || !data?.enabled || data.account_email !== CONTACTS_ACCOUNT) throw new CrmAuthError(503, "Connect the 805 Google Contacts account first.");
  const config = contactsOAuthConfig();
  const token = await googleContactToken(new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: decryptContactSecret(data.encrypted_refresh_token), grant_type: "refresh_token" }));
  if (token.scope && !token.scope.split(" ").includes(CONTACTS_SCOPE)) throw new CrmAuthError(403, "Reconnect Google with Contacts permission.");
  await verifyContactIdentity(token.access_token!, data.google_subject);
  return token.access_token!;
}
