// Portable handler shared by the Supabase Edge entry point and regression tests.
// This service belongs to 805 and can never select an MTS mailbox.
export const BROKER_MAILBOX = "805shutters@gmail.com";
export const BROKER_ACTION = "access-token";

type Dependencies = {
  env(name: string): string | undefined;
  fetch: typeof fetch;
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}

async function sameSecret(actual: string, expected: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([actual, expected].map(async (value) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))));
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function handle805GmailTokenRequest(request: Request, deps: Dependencies): Promise<Response> {
  const secret = deps.env("GMAIL_805_TOKEN_BROKER_SECRET")?.trim();
  if (!secret || secret.length < 32) return json({ error: "Broker authentication is unconfigured." }, 503);
  const authorization = request.headers.get("authorization") || "";
  if (!await sameSecret(authorization, `Bearer ${secret}`)) return json({ error: "Unauthorized." }, 401);
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const body = await request.json().catch(() => null);
  if (!body || body.action !== BROKER_ACTION) return json({ error: "Unsupported operation." }, 400);
  if (typeof body.emailAddress !== "string" || body.emailAddress.trim().toLowerCase() !== BROKER_MAILBOX) {
    return json({ error: "Mailbox is not permitted." }, 403);
  }

  // Use only 805 credentials. Never fall back to default/MTS/Calendar credentials.
  const clientId = deps.env("GMAIL_805_CLIENT_ID");
  const clientSecret = deps.env("GMAIL_805_CLIENT_SECRET");
  const databaseUrl = deps.env("PROD_SUPABASE_URL") || deps.env("SUPABASE_URL");
  const serviceKey = deps.env("PROD_SERVICE_ROLE_KEY") || deps.env("SUPABASE_SERVICE_ROLE_KEY");
  if (!clientId || !clientSecret || !databaseUrl || !serviceKey) {
    return json({ error: "805 OAuth configuration is incomplete." }, 503);
  }

  try {
    // Honor the existing mailbox-specific refresh-token override. A lookup failure
    // must not silently reuse an obsolete token from the environment.
    const url = new URL(`${databaseUrl.replace(/\/$/, "")}/rest/v1/gmail_mailbox_tokens`);
    url.searchParams.set("select", "refresh_token");
    url.searchParams.set("email_address", `eq.${BROKER_MAILBOX}`);
    url.searchParams.set("limit", "1");
    const stored = await deps.fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!stored.ok) return json({ error: "805 mailbox credential lookup failed." }, 502);
    const rows = await stored.json();
    if (!Array.isArray(rows)) return json({ error: "805 mailbox credential lookup failed." }, 502);
    const refreshToken = rows[0]?.refresh_token || deps.env("GMAIL_805_REFRESH_TOKEN");
    if (typeof refreshToken !== "string" || !refreshToken.trim()) {
      return json({ error: "805 Gmail reconnection is required." }, 503);
    }

    const refreshed = await deps.fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(5_000),
    });
    const token = await refreshed.json();
    if (!refreshed.ok || typeof token.access_token !== "string" || !token.access_token) {
      return json({ error: "805 Gmail token refresh failed; reconnection may be required." }, 502);
    }
    const scopes = typeof token.scope === "string" ? token.scope.split(/\s+/) : [];
    if (!scopes.includes("https://www.googleapis.com/auth/gmail.modify") && !scopes.includes("https://mail.google.com/")) {
      return json({ error: "805 Gmail token requires gmail.modify access." }, 403);
    }
    const profileResponse = await deps.fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(4_000),
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || profile.emailAddress?.toLowerCase() !== BROKER_MAILBOX) {
      return json({ error: "805 Gmail token mailbox verification failed." }, 403);
    }
    return json({ success: true, emailAddress: BROKER_MAILBOX, accessToken: token.access_token, expiresIn: token.expires_in });
  } catch {
    // Provider payloads, refresh tokens and secrets must never enter responses/logs.
    return json({ error: "805 Gmail authentication service is unavailable." }, 502);
  }
}
