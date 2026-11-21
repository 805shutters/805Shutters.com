import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { __resetGoogleTokenCacheForTests } from "@/lib/google/calendar";
import {
  COMPANY_CALENDAR_ID,
  JESSICA_CALENDAR_ID,
  applyQueuedGoogleCalendarSync,
  googleCalendarsForAssignee,
} from "@/lib/google/calendar-sync";
import { processBookingOutbox } from "@/lib/booking/delivery";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const privateKeyEnv = privateKey.replace(/\r?\n/g, "\\n").trim();
const envSnapshot: Record<string, string | undefined> = {};

type SyncEvent = {
  id: string;
  title: string;
  event_type: string;
  status: string;
  assigned_to: string | null;
  start_at: string;
  end_at: string;
  location: string | null;
  notes: string | null;
  meta: Record<string, unknown>;
};

function calendarEvent(overrides: Partial<SyncEvent> = {}): SyncEvent {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Install at Oak Street",
    event_type: "install",
    status: "scheduled",
    assigned_to: "Jessica",
    start_at: "2035-10-01T17:00:00.000Z",
    end_at: "2035-10-01T19:00:00.000Z",
    location: "10 Oak Street",
    notes: "Customer: Jane Doe\nPhone: 805-555-0100",
    meta: {},
    ...overrides,
  };
}

function queuePayload(event: SyncEvent, overrides: Record<string, unknown> = {}) {
  return {
    sync: "reconcile",
    action: "upsert",
    calendarEventId: event.id,
    googleCalendarEventIds: {},
    enqueuedAt: "2035-09-01T00:00:00.000Z",
    syncToken: "token-1",
    email: "customer@example.com",
    ...overrides,
  };
}

function memoryClient(event: SyncEvent | null) {
  const rpc = vi.fn(async (_fn: string, _args?: Record<string, unknown>) => ({ error: null }));
  const supabase = {
    from(table: string) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        async maybeSingle() {
          return { data: table === "crm_calendar_events" ? event : null, error: null };
        },
      };
      return builder;
    },
    rpc,
  };
  return { supabase: supabase as unknown as SupabaseClient, rpc };
}

type RecordedCall = { url: string; init: RequestInit };

function installGoogle(options?: { patchStatus?: number }) {
  const calls: RecordedCall[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const recorded = { url: String(url), init };
    calls.push(recorded);
    if (recorded.url.includes("oauth2.googleapis.com")) {
      return { ok: true, status: 200, json: async () => ({ access_token: "tok", expires_in: 3600 }) };
    }
    if (init.method === "PATCH" && options?.patchStatus && options.patchStatus >= 400) {
      return { ok: false, status: options.patchStatus, json: async () => ({ error: { message: "patch rejected" } }) };
    }
    if (init.method === "DELETE") return { ok: true, status: 204, json: async () => ({}) };
    const calendar = decodeURIComponent(recorded.url.split("/calendars/")[1]?.split("/")[0] || "");
    const existingId = init.method === "PATCH"
      ? decodeURIComponent(recorded.url.split("/events/")[1]?.split("?")[0] || "")
      : `created-${calendar}`;
    return { ok: true, status: 200, json: async () => ({ id: existingId, htmlLink: `https://calendar.google.com/event?eid=${existingId}` }) };
  }));
  return calls;
}

function calendarWrites(calls: RecordedCall[]) {
  return calls.filter((call) => call.url.includes("/calendar/v3/"));
}

function calendars(calls: RecordedCall[], method: string) {
  return calendarWrites(calls)
    .filter((call) => call.init.method === method)
    .map((call) => decodeURIComponent(call.url.split("/calendars/")[1].split("/")[0]));
}

function expectNoInvites(calls: RecordedCall[]) {
  for (const call of calendarWrites(calls)) {
    expect(call.url).toContain("sendUpdates=none");
    if (!call.init.body) continue;
    const body = JSON.parse(String(call.init.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("attendees");
    expect(JSON.stringify(body)).not.toContain("customer@example.com");
  }
}

beforeEach(() => {
  for (const key of ["GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "GOOGLE_CALENDAR_SYNC_TARGETS", "GOOGLE_CALENDAR_ID", "BOOKING_DELIVERY_ENABLED", "VERCEL_ENV"]) {
    envSnapshot[key] = process.env[key];
  }
  process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL = "805-calendar-sync@test-project.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKeyEnv;
  delete process.env.GOOGLE_CALENDAR_SYNC_TARGETS;
  delete process.env.GOOGLE_CALENDAR_ID;
  __resetGoogleTokenCacheForTests();
});

afterEach(() => {
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __resetGoogleTokenCacheForTests();
});

describe("googleCalendarsForAssignee", () => {
  it("keeps 805@ on every assignee and adds Jessica only for Jessica and unassigned", () => {
    for (const assignedTo of ["Jessica", "Mike", "Unassigned", "Eddie Hurtado", "", null]) {
      expect(googleCalendarsForAssignee(assignedTo)[0]).toBe(COMPANY_CALENDAR_ID);
    }
    expect(googleCalendarsForAssignee("Jessica")).toEqual([COMPANY_CALENDAR_ID, JESSICA_CALENDAR_ID]);
    expect(googleCalendarsForAssignee("Unassigned")).toEqual([COMPANY_CALENDAR_ID, JESSICA_CALENDAR_ID]);
    expect(googleCalendarsForAssignee("")).toEqual([COMPANY_CALENDAR_ID, JESSICA_CALENDAR_ID]);
    expect(googleCalendarsForAssignee("Mike")).toEqual([COMPANY_CALENDAR_ID]);
    expect(googleCalendarsForAssignee("Eddie Hurtado")).toEqual([COMPANY_CALENDAR_ID]);
  });
});

describe("applyQueuedGoogleCalendarSync", () => {
  it("puts a new block for an installer on the master calendar only", async () => {
    const event = calendarEvent({
      title: "Shop block",
      event_type: "block",
      assigned_to: "Eddie Hurtado",
      notes: "No customer on this block",
      location: null,
    });
    const calls = installGoogle();
    const { supabase } = memoryClient(event);
    const result = await applyQueuedGoogleCalendarSync(supabase, queuePayload(event));
    expect(result.status).toBe("sent");
    expect(calendars(calls, "POST")).toEqual([COMPANY_CALENDAR_ID]);
    expect(calendars(calls, "PATCH")).toEqual([]);
    expectNoInvites(calls);
    const body = JSON.parse(String(calendarWrites(calls)[0].init.body));
    expect(body.summary).toBe("Shop block");
    expect(body.description).toBe("No customer on this block");
  });

  it("puts a new install on 805@ and Jessica's calendar when Jessica is assigned", async () => {
    const event = calendarEvent({ event_type: "install", assigned_to: "Jessica" });
    const calls = installGoogle();
    const { supabase, rpc } = memoryClient(event);
    const result = await applyQueuedGoogleCalendarSync(supabase, queuePayload(event));
    expect(result.status).toBe("sent");
    expect(calendars(calls, "POST").sort()).toEqual([COMPANY_CALENDAR_ID, JESSICA_CALENDAR_ID].sort());
    expect(calendars(calls, "PATCH")).toEqual([]);
    expectNoInvites(calls);
    const saved = rpc.mock.calls.at(-1)?.[1] as { p_metadata: { googleCalendarEventIds: Record<string, string> } } | undefined;
    expect(Object.keys(saved?.p_metadata.googleCalendarEventIds ?? {}).sort()).toEqual([COMPANY_CALENDAR_ID, JESSICA_CALENDAR_ID].sort());
    expect(JSON.parse(String(calendarWrites(calls)[0].init.body)).description).toContain("Jane Doe");
  });

  it.each(["Jessica", "Mike", "Unassigned", "Eddie Hurtado"])(
    "lands a %s entry on 805@805shutters.com",
    async (assignedTo) => {
      const event = calendarEvent({
        event_type: assignedTo === "Eddie Hurtado" ? "block" : "install",
        assigned_to: assignedTo,
        title: `${assignedTo} visit`,
      });
      const calls = installGoogle();
      const { supabase } = memoryClient(event);
      const result = await applyQueuedGoogleCalendarSync(supabase, queuePayload(event));
      expect(result.status).toBe("sent");
      expect(calendars(calls, "POST")).toContain(COMPANY_CALENDAR_ID);
      expect(result.eventIds[COMPANY_CALENDAR_ID]).toBeTruthy();
      if (assignedTo === "Jessica" || assignedTo === "Unassigned") {
        expect(calendars(calls, "POST")).toContain(JESSICA_CALENDAR_ID);
      } else {
        expect(calendars(calls, "POST")).not.toContain(JESSICA_CALENDAR_ID);
      }
      expectNoInvites(calls);
    },
  );

  it("updates a reschedule in place and does not create a second Google event", async () => {
    const event = calendarEvent({
      assigned_to: "Mike",
      start_at: "2035-11-02T18:00:00.000Z",
      end_at: "2035-11-02T20:00:00.000Z",
      meta: { googleCalendarEventIds: { [COMPANY_CALENDAR_ID]: "existing-805" } },
    });
    const calls = installGoogle();
    const { supabase } = memoryClient(event);
    const result = await applyQueuedGoogleCalendarSync(supabase, queuePayload(event, {
      googleCalendarEventIds: { [COMPANY_CALENDAR_ID]: "existing-805" },
    }));
    expect(result.status).toBe("sent");
    expect(calendars(calls, "POST")).toEqual([]);
    expect(calendars(calls, "PATCH")).toEqual([COMPANY_CALENDAR_ID]);
    expect(calendarWrites(calls)[0].url).toContain("/events/existing-805?sendUpdates=none");
    expect(result.eventIds).toEqual({ [COMPANY_CALENDAR_ID]: "existing-805" });
    const body = JSON.parse(String(calendarWrites(calls)[0].init.body));
    expect(body.start.dateTime).toBe("2035-11-02T18:00:00.000Z");
    expect(body).not.toHaveProperty("attendees");
  });

  it("respects an id that is already stored and does not post beside it", async () => {
    const event = calendarEvent({
      assigned_to: "Jessica",
      meta: {
        googleCalendarEventIds: {
          [COMPANY_CALENDAR_ID]: "backfill-805",
          [JESSICA_CALENDAR_ID]: "backfill-jessica",
        },
      },
    });
    const calls = installGoogle();
    const { supabase } = memoryClient(event);
    await applyQueuedGoogleCalendarSync(supabase, queuePayload(event));
    expect(calendars(calls, "POST")).toEqual([]);
    expect(calendars(calls, "PATCH").sort()).toEqual([COMPANY_CALENDAR_ID, JESSICA_CALENDAR_ID].sort());
    const urls = calendarWrites(calls).map((call) => call.url);
    expect(urls.some((url) => url.includes("backfill-805"))).toBe(true);
    expect(urls.some((url) => url.includes("backfill-jessica"))).toBe(true);
  });

  it("does not create a replacement when an update fails", async () => {
    const event = calendarEvent({
      assigned_to: "Mike",
      meta: { googleCalendarEventIds: { [COMPANY_CALENDAR_ID]: "existing-805" } },
    });
    const calls = installGoogle({ patchStatus: 500 });
    const { supabase } = memoryClient(event);
    const result = await applyQueuedGoogleCalendarSync(supabase, queuePayload(event));
    expect(result.status).toBe("pending");
    expect(calendars(calls, "POST")).toEqual([]);
    expect(calendars(calls, "PATCH")).toEqual([COMPANY_CALENDAR_ID]);
    expect(result.eventIds[COMPANY_CALENDAR_ID]).toBe("existing-805");
  });

  it("removes the Google event when the CRM row is canceled", async () => {
    const event = calendarEvent({
      status: "canceled",
      assigned_to: "Jessica",
      meta: {
        googleCalendarEventIds: {
          [COMPANY_CALENDAR_ID]: "existing-805",
          [JESSICA_CALENDAR_ID]: "existing-jessica",
        },
      },
    });
    const calls = installGoogle();
    const { supabase } = memoryClient(event);
    const result = await applyQueuedGoogleCalendarSync(supabase, queuePayload(event, { action: "delete" }));
    expect(result.status).toBe("sent");
    expect(calendars(calls, "POST")).toEqual([]);
    expect(calendars(calls, "PATCH")).toEqual([]);
    expect(calendars(calls, "DELETE").sort()).toEqual([COMPANY_CALENDAR_ID, JESSICA_CALENDAR_ID].sort());
    expect(calendarWrites(calls).every((call) => call.url.includes("sendUpdates=none"))).toBe(true);
    expect(result.eventIds).toEqual({});
  });

  it("drops Jessica's calendar when the visit is reassigned to an installer and keeps 805@", async () => {
    const event = calendarEvent({
      assigned_to: "Eddie Hurtado",
      event_type: "install",
      meta: {
        googleCalendarEventIds: {
          [COMPANY_CALENDAR_ID]: "existing-805",
          [JESSICA_CALENDAR_ID]: "existing-jessica",
        },
      },
    });
    const calls = installGoogle();
    const { supabase } = memoryClient(event);
    const result = await applyQueuedGoogleCalendarSync(supabase, queuePayload(event));
    expect(result.status).toBe("sent");
    expect(calendars(calls, "DELETE")).toEqual([JESSICA_CALENDAR_ID]);
    expect(calendars(calls, "PATCH")).toEqual([COMPANY_CALENDAR_ID]);
    expect(calendars(calls, "POST")).toEqual([]);
    expect(result.eventIds).toEqual({ [COMPANY_CALENDAR_ID]: "existing-805" });
  });
});

it("the booking worker syncs a queued block without inviting anyone", async () => {
  process.env.BOOKING_DELIVERY_ENABLED = "true";
  const event = calendarEvent({ event_type: "block", assigned_to: "Mike", title: "Mike block" });
  const payload = queuePayload(event);
  const calls = installGoogle();
  const updates: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "lt", "order", "limit"]) chain[method] = vi.fn(() => chain);
    chain.update = vi.fn((value: Record<string, unknown>) => {
      updates.push(value);
      return chain;
    });
    chain.maybeSingle = vi.fn(async () => (
      table === "crm_calendar_events"
        ? { data: event, error: null }
        : { data: { payload }, error: null }
    ));
    chain.then = (resolve: (value: unknown) => void) => {
      resolve({ data: table === "booking_outbox" ? [{ id: "effect-1" }] : [], error: null });
    };
    return chain;
  });
  const rpc = vi.fn(async (fn: string) => (
    fn === "booking_claim_effect"
      ? { data: { kind: "google_calendar", payload }, error: null }
      : { error: null }
  ));
  await processBookingOutbox({ from, rpc } as unknown as SupabaseClient);
  expect(calendars(calls, "POST")).toEqual([COMPANY_CALENDAR_ID]);
  expectNoInvites(calls);
  expect(updates).toContainEqual(expect.objectContaining({ status: "sent" }));
  expect(rpc).toHaveBeenCalledWith("booking_merge_event_metadata", expect.objectContaining({
    p_id: event.id,
    p_metadata: expect.objectContaining({
      googleCalendarEventIds: expect.objectContaining({ [COMPANY_CALENDAR_ID]: expect.any(String) }),
    }),
  }));
});
