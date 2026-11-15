import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteCalendarEvent,
  getDelegatedAccessToken,
  isGoogleCalendarSyncConfigured,
  saveCalendarEvent,
  type GoogleCalendarEventInput,
} from "@/lib/google/calendar";

export const COMPANY_CALENDAR_ID = "805@805shutters.com";
export const JESSICA_CALENDAR_ID = "jessica@805shutters.com";

/**
 * Jessica and unassigned visits are also copied onto Jessica's calendar.
 * Every other assignee, including Mike, stays on the master calendar only.
 * The master calendar is not chosen here, so a branch cannot drop it.
 */
function extraCalendarsForAssignee(assignedTo: string | null | undefined): string[] {
  const name = (assignedTo ?? "").trim().toLowerCase();
  if (name === "jessica" || !name || name === "unassigned") return [JESSICA_CALENDAR_ID];
  return [];
}

/** 805@805shutters.com is the master calendar and is present for every assignee. */
export function googleCalendarsForAssignee(assignedTo: string | null | undefined): string[] {
  return [COMPANY_CALENDAR_ID, ...extraCalendarsForAssignee(assignedTo)];
}

export function googleCalendarIdMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const ids: Record<string, string> = {};
  for (const [calendar, eventId] of Object.entries(value as Record<string, unknown>)) {
    const key = calendar.trim();
    const id = String(eventId ?? "").trim();
    if (key && id) ids[key] = id;
  }
  return ids;
}

type CalendarSyncRow = {
  id: string;
  title: string;
  event_type: string;
  status: string;
  assigned_to: string | null;
  start_at: string;
  end_at: string;
  location: string | null;
  notes: string | null;
  meta: Record<string, unknown> | null;
};

export type QueuedGoogleCalendarSync = {
  status: "sent" | "pending" | "skipped";
  lastError: string | null;
  completed: boolean;
  eventIds: Record<string, string>;
  htmlLinks: Record<string, string>;
};

function canceled(status: string | null | undefined) {
  const value = (status ?? "").trim().toLowerCase();
  return value === "canceled" || value === "cancelled";
}

function queuedAfterStart(startAt: string, enqueuedAt: unknown) {
  const start = Date.parse(startAt);
  if (!Number.isFinite(start)) return false;
  const queued = Date.parse(String(enqueuedAt ?? ""));
  if (Number.isFinite(queued)) return start <= queued;
  return start <= Date.now();
}

function eventInput(event: CalendarSyncRow): GoogleCalendarEventInput {
  return {
    summary: event.title,
    description: event.notes?.trim() || undefined,
    location: event.location?.trim() || undefined,
    startAt: new Date(event.start_at).toISOString(),
    endAt: new Date(event.end_at).toISOString(),
    timeZone: "America/Los_Angeles",
  };
}

function failure(message: string, eventIds: Record<string, string>, htmlLinks: Record<string, string>): QueuedGoogleCalendarSync {
  return { status: "pending", lastError: message.slice(0, 500), completed: false, eventIds, htmlLinks };
}

/**
 * Make the Google calendars match one CRM row. Stored ids are updated in place.
 * Calendars that no longer apply are deleted. Nothing is added as an attendee.
 */
export async function applyQueuedGoogleCalendarSync(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<QueuedGoogleCalendarSync> {
  const eventId = String(payload.calendarEventId || "").trim();
  if (!eventId) return failure("Calendar sync is missing its event id", {}, {});

  const { data, error } = await supabase
    .from("crm_calendar_events")
    .select("id,title,event_type,status,assigned_to,start_at,end_at,location,notes,meta")
    .eq("id", eventId)
    .maybeSingle();
  if (error) return failure("Calendar row could not be read", googleCalendarIdMap(payload.googleCalendarEventIds), {});
  const event = (data || null) as CalendarSyncRow | null;
  const payloadIds = googleCalendarIdMap(payload.googleCalendarEventIds);
  const metaIds = googleCalendarIdMap(event?.meta?.googleCalendarEventIds);
  let eventIds = { ...payloadIds, ...metaIds };
  let htmlLinks = {
    ...googleCalendarIdMap(payload.googleCalendarHtmlLinks),
    ...googleCalendarIdMap(event?.meta?.googleCalendarHtmlLinks),
  };
  const remove = payload.action === "delete" || !event || canceled(event.status);

  if (!remove && event && !Object.keys(eventIds).length && queuedAfterStart(event.start_at, payload.enqueuedAt)) {
    return {
      status: "skipped",
      lastError: "Event was already in the past when it was queued",
      completed: true,
      eventIds,
      htmlLinks,
    };
  }
  if (!isGoogleCalendarSyncConfigured()) {
    return {
      status: "skipped",
      lastError: "Google Calendar sync is not configured",
      completed: true,
      eventIds,
      htmlLinks,
    };
  }

  const targets = remove || !event ? [] : googleCalendarsForAssignee(event.assigned_to);
  const input = event ? eventInput(event) : null;
  const errors: string[] = [];

  const remember = async () => {
    if (!event) return;
    const { error: saveError } = await supabase.rpc("booking_merge_event_metadata", {
      p_id: event.id,
      p_metadata: { googleCalendarEventIds: eventIds, googleCalendarHtmlLinks: htmlLinks },
    });
    if (saveError) throw new Error(saveError.message || "Could not save Google Calendar ids");
  };

  for (const calendar of Object.keys(eventIds)) {
    if (targets.includes(calendar)) continue;
    const storedId = eventIds[calendar];
    try {
      const token = await getDelegatedAccessToken(calendar);
      const deleted = await deleteCalendarEvent(token, calendar, storedId);
      if (!deleted) throw new Error("delete failed");
      delete eventIds[calendar];
      delete htmlLinks[calendar];
      await remember();
    } catch (error) {
      errors.push(`${calendar}: ${error instanceof Error ? error.message : "delete failed"}`);
    }
  }

  if (input) {
    for (const calendar of targets) {
      try {
        const token = await getDelegatedAccessToken(calendar);
        const saved = await saveCalendarEvent(token, calendar, input, eventIds[calendar]);
        eventIds = { ...eventIds, [calendar]: saved.id };
        if (saved.htmlLink) htmlLinks = { ...htmlLinks, [calendar]: saved.htmlLink };
        await remember();
      } catch (error) {
        errors.push(`${calendar}: ${error instanceof Error ? error.message : "sync failed"}`);
      }
    }
  }

  if (errors.length) return failure(errors.join("; "), eventIds, htmlLinks);
  return { status: "sent", lastError: null, completed: true, eventIds, htmlLinks };
}
