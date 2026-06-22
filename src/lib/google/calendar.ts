// Google Calendar sync for CRM appointments. Uses a Google Workspace service
// account with domain-wide delegation (DWD) to create events directly on each
// target calendar by impersonating its owner (JWT `sub` claim).
//
// Env-gated and NEVER throws: a missing credential or a Calendar API rejection
// returns a result object so it can never break a customer's booking flow.
//
// Env:
//   GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL  service account email (...iam.gserviceaccount.com)
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY   PEM private key (single line, \n-escaped)
//   GOOGLE_CALENDAR_SYNC_TARGETS         comma-separated calendar ids to write to
//                                        (defaults to GOOGLE_CALENDAR_ID)
//   GOOGLE_CALENDAR_TIME_ZONE            defaults to America/Los_Angeles

import { createSign } from "crypto";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export type GoogleCalendarEventInput = {
  summary: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  timeZone?: string;
};

export type GoogleCalendarSyncResult = {
  synced: boolean;
  results: Array<{
    calendar: string;
    eventId?: string;
    htmlLink?: string;
    error?: string;
  }>;
  skipped?: string;
};

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

function serviceAccountCredentials() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey };
}

export function isGoogleCalendarSyncConfigured(): boolean {
  return serviceAccountCredentials() !== null;
}

/** Target calendars: GOOGLE_CALENDAR_SYNC_TARGETS, falling back to GOOGLE_CALENDAR_ID. */
export function googleCalendarSyncTargets(): string[] {
  const raw = process.env.GOOGLE_CALENDAR_SYNC_TARGETS;
  const fromTargets = raw
    ? raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  if (fromTargets.length) return Array.from(new Set(fromTargets));
  const single = process.env.GOOGLE_CALENDAR_ID?.trim();
  return single ? [single] : [];
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function decodePrivateKey(rawKey: string): string {
  // Vercel stores the PEM as a single-line env value with literal "\n"; restore
  // real newlines so Node's signer accepts it.
  return rawKey.replace(/\\n/g, "\n").trim();
}

/** Build + sign the OAuth2 JWT-bearer assertion for a delegated subject. */
function buildAssertion(subject: string, clientEmail: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: clientEmail,
    scope: CALENDAR_SCOPE,
    aud: TOKEN_ENDPOINT,
    exp: now + 3600,
    iat: now,
    sub: subject
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign({ key: decodePrivateKey(privateKey) }, "base64url");
  return `${unsigned}.${signature}`;
}

/** Exchange a signed assertion for a short-lived access token, impersonating `subject`. Cached ~1h. */
export async function getDelegatedAccessToken(subject: string): Promise<string> {
  const cached = tokenCache.get(subject);
  // 5-minute safety buffer so a near-expiry token isn't handed out.
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }

  const creds = serviceAccountCredentials();
  if (!creds) throw new Error("Google service account credentials are not configured.");

  const assertion = buildAssertion(subject, creds.clientEmail, creds.privateKey);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Google token exchange failed: ${data.error_description || data.error || `HTTP ${res.status}`}`
    );
  }

  const expiresIn = Number(data.expires_in || 3600);
  tokenCache.set(subject, {
    token: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000
  });
  return data.access_token;
}

/** Test-only: clear the in-memory token cache. */
export function __resetGoogleTokenCacheForTests() {
  tokenCache.clear();
}

export type GoogleCalendarEvent = {
  id: string;
  htmlLink?: string;
};

/** Create an event on a calendar. Caller supplies a valid delegated access token. */
export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  input: GoogleCalendarEventInput
): Promise<GoogleCalendarEvent> {
  const timeZone = input.timeZone || process.env.GOOGLE_CALENDAR_TIME_ZONE || DEFAULT_TIME_ZONE;
  const payload = {
    summary: input.summary,
    description: input.description || undefined,
    location: input.location || undefined,
    start: { dateTime: input.startAt, timeZone },
    end: { dateTime: input.endAt, timeZone }
  };

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    htmlLink?: string;
    error?: { message?: string };
    message?: string;
  };
  if (!res.ok || !data.id) {
    const message = data.error?.message || data.message || `HTTP ${res.status}`;
    throw new Error(`Google Calendar create failed for ${calendarId}: ${message}`);
  }
  return { id: data.id, htmlLink: data.htmlLink };
}

/** Delete an event (used by cleanup / smoke tests). Best-effort. */
export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Create an appointment event on every target calendar (impersonating each owner).
 * NEVER throws: returns a per-calendar result so one failure can't block the booking.
 */
export async function syncAppointmentToGoogleCalendars(
  input: GoogleCalendarEventInput
): Promise<GoogleCalendarSyncResult> {
  if (!isGoogleCalendarSyncConfigured()) {
    return { synced: false, results: [], skipped: "not-configured" };
  }

  const calendars = googleCalendarSyncTargets();
  if (!calendars.length) {
    return { synced: false, results: [], skipped: "no-target-calendars" };
  }

  const results: GoogleCalendarSyncResult["results"] = [];
  for (const calendar of calendars) {
    try {
      const token = await getDelegatedAccessToken(calendar);
      const created = await createCalendarEvent(token, calendar, input);
      results.push({ calendar, eventId: created.id, htmlLink: created.htmlLink });
    } catch (error) {
      const message = error instanceof Error ? error.message : "sync failed";
      console.warn(`[google-calendar] sync to ${calendar} failed:`, message);
      results.push({ calendar, error: message });
    }
  }

  return { synced: results.some((result) => Boolean(result.eventId)), results };
}
