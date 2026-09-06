import { CrmAuthError } from "./auth";
import { getBrokeredGmailAccessToken } from "./installation-invoices";
import { HUB_FROM } from "./quote-hub-model";

export type HubGmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: {
    mimeType?: string;
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: HubGmailMessage["payload"][];
  };
};
export function hubGmailHeader(message: HubGmailMessage, name: string) {
  return (
    message.payload?.headers?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase(),
    )?.value || ""
  );
}
export function hubGmailText(part: HubGmailMessage["payload"]): string {
  if (part?.mimeType === "text/plain" && part.body?.data)
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  const alternatives =
    part?.mimeType === "multipart/alternative"
      ? part.parts?.filter((p) => p?.mimeType === "text/plain")
      : null;
  const plain = (alternatives?.length ? alternatives : part?.parts || [])
    .map(hubGmailText)
    .filter(Boolean)
    .join("\n");
  if (plain) return plain;
  if (part?.mimeType === "text/html" && part.body?.data)
    return Buffer.from(part.body.data, "base64url")
      .toString("utf8")
      .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  return "";
}
export async function hubGmailToken() {
  const {
    GMAIL_805_CLIENT_ID: clientId,
    GMAIL_805_CLIENT_SECRET: clientSecret,
    GMAIL_805_REFRESH_TOKEN: refreshToken,
  } = process.env;
  let token: string | null = null;
  if (clientId && clientSecret && refreshToken) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok || !data.access_token)
      throw new CrmAuthError(503, "Reconnect 805 Gmail to refresh replies.");
    token = data.access_token;
  } else token = await getBrokeredGmailAccessToken(HUB_FROM);
  if (!token)
    throw new CrmAuthError(
      503,
      "Connect 805@805shutters.com with Gmail read access to refresh replies.",
    );
  const profile = await hubGmail<{ emailAddress: string }>(token, "profile");
  if (profile.emailAddress.toLowerCase() !== HUB_FROM)
    throw new CrmAuthError(
      503,
      "The connected mailbox is not 805@805shutters.com. Connect the 805 sending account.",
    );
  return token;
}
export async function hubGmail<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new CrmAuthError(
      response.status === 401 || response.status === 403 ? 503 : 502,
      response.status === 401 || response.status === 403
        ? "805 email needs Gmail read access. Reconnect the mailbox."
        : "The email provider could not confirm the request. Check the conversation before trying again.",
    );
  return (await response.json()) as T;
}
export type HubAttachment = {
  content: Buffer;
  contentType: string;
  filename: string;
};
