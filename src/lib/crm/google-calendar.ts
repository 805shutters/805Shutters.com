import { SupabaseClient } from "@supabase/supabase-js";
import { CrmCalendarEvent } from "@/lib/crm/types";

type GoogleCalendarConfig = {
  configured: boolean;
  calendarId: string;
  timeZone: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleCalendarEventResponse = {
  id?: string;
  htmlLink?: string;
  error?: {
    message?: string;
    status?: string;
  };
};

export type GoogleCalendarSyncResult = {
  configured: boolean;
  synced: boolean;
  skippedReason?: string;
  googleEventId?: string;
  googleEventLink?: string;
  error?: string;
  event: CrmCalendarEvent;
};

function googleCalendarConfig(): GoogleCalendarConfig {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

  return {
    configured: Boolean(clientId && clientSecret && refreshToken),
    clientId,
    clientSecret,
    refreshToken,
    calendarId: process.env.GOOGLE_CALENDAR_ID || "805@805shutters.com",
    timeZone: process.env.GOOGLE_CALENDAR_TIME_ZONE || "America/Los_Angeles"
  };
}

export function getGoogleCalendarStatus() {
  const config = googleCalendarConfig();

  return {
    configured: config.configured,
    calendarId: config.calendarId,
    timeZone: config.timeZone
  };
}

function metaText(event: CrmCalendarEvent, key: string) {
  const value = event.meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function googleSyncError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 240);
  if (typeof error === "string") return error.slice(0, 240);
  return "Google Calendar sync failed.";
}

async function getGoogleAccessToken(config: GoogleCalendarConfig) {
  const body = new URLSearchParams({
    client_id: config.clientId || "",
    client_secret: config.clientSecret || "",
    refresh_token: config.refreshToken || "",
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const token = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || "Google access token could not be refreshed.");
  }

  return token.access_token;
}

function buildGoogleCalendarDescription(event: CrmCalendarEvent) {
  const lines = [
    event.notes,
    metaText(event, "customer_name") ? `Customer: ${metaText(event, "customer_name")}` : null,
    metaText(event, "customer_phone") ? `Phone: ${metaText(event, "customer_phone")}` : null,
    metaText(event, "customer_email") ? `Email: ${metaText(event, "customer_email")}` : null,
    event.job_id ? `CRM job: ${event.job_id}` : null,
    `CRM calendar event: ${event.id}`
  ];

  return lines.filter(Boolean).join("\n");
}

async function createGoogleCalendarEvent(event: CrmCalendarEvent, config: GoogleCalendarConfig) {
  const accessToken = await getGoogleAccessToken(config);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        summary: event.title,
        location: event.location || undefined,
        description: buildGoogleCalendarDescription(event),
        start: {
          dateTime: event.start_at,
          timeZone: config.timeZone
        },
        end: {
          dateTime: event.end_at,
          timeZone: config.timeZone
        },
        extendedProperties: {
          private: {
            crmCalendarEventId: event.id,
            crmJobId: event.job_id || "",
            crmAssignedTo: event.assigned_to
          }
        }
      })
    }
  );
  const body = (await response.json()) as GoogleCalendarEventResponse;

  if (!response.ok || !body.id) {
    throw new Error(body.error?.message || body.error?.status || "Google Calendar event could not be created.");
  }

  return {
    id: body.id,
    htmlLink: body.htmlLink
  };
}

export async function syncCrmCalendarEventToGoogle(
  supabase: SupabaseClient,
  event: CrmCalendarEvent
): Promise<GoogleCalendarSyncResult> {
  const config = googleCalendarConfig();

  if (!config.configured) {
    return {
      configured: false,
      synced: false,
      skippedReason: "missing_google_calendar_oauth",
      event
    };
  }

  if (event.status === "canceled") {
    return {
      configured: true,
      synced: false,
      skippedReason: "canceled_event",
      event
    };
  }

  const existingGoogleEventId = metaText(event, "googleCalendarEventId");
  if (existingGoogleEventId) {
    return {
      configured: true,
      synced: false,
      skippedReason: "already_synced",
      googleEventId: existingGoogleEventId,
      googleEventLink: metaText(event, "googleCalendarHtmlLink") || undefined,
      event
    };
  }

  try {
    const googleEvent = await createGoogleCalendarEvent(event, config);
    const nextMeta = {
      ...(event.meta || {}),
      googleCalendarEventId: googleEvent.id,
      googleCalendarHtmlLink: googleEvent.htmlLink || null,
      googleCalendarId: config.calendarId,
      googleCalendarSyncedAt: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from("crm_calendar_events")
      .update({ meta: nextMeta })
      .eq("id", event.id)
      .select("*")
      .single();

    if (error || !data) {
      return {
        configured: true,
        synced: false,
        googleEventId: googleEvent.id,
        googleEventLink: googleEvent.htmlLink,
        error: error?.message || "CRM event could not store Google Calendar metadata.",
        event
      };
    }

    return {
      configured: true,
      synced: true,
      googleEventId: googleEvent.id,
      googleEventLink: googleEvent.htmlLink,
      event: data as CrmCalendarEvent
    };
  } catch (error) {
    return {
      configured: true,
      synced: false,
      error: googleSyncError(error),
      event
    };
  }
}
