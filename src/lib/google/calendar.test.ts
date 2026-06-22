import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "crypto";

import {
  __resetGoogleTokenCacheForTests,
  createCalendarEvent,
  getDelegatedAccessToken,
  googleCalendarSyncTargets,
  isGoogleCalendarSyncConfigured,
  syncAppointmentToGoogleCalendars
} from "@/lib/google/calendar";

// Throwaway RSA key so JWT signing is real (lets us decode + assert claims).
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});
// Vercel stores the PEM single-line with literal \n — exercise the normalizer.
const privateKeyEnv = privateKey.replace(/\r?\n/g, "\\n").trim();

const CLIENT_EMAIL = "805-calendar-sync@test-project.iam.gserviceaccount.com";

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body
  } as Response);
}

const envSnapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  envSnapshot.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL;
  envSnapshot.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  envSnapshot.GOOGLE_CALENDAR_SYNC_TARGETS = process.env.GOOGLE_CALENDAR_SYNC_TARGETS;
  envSnapshot.GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

  process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL = CLIENT_EMAIL;
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

describe("isGoogleCalendarSyncConfigured", () => {
  it("is true when client email + private key are present", () => {
    expect(isGoogleCalendarSyncConfigured()).toBe(true);
  });

  it("is false when either credential is missing", () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    expect(isGoogleCalendarSyncConfigured()).toBe(false);
  });
});

describe("googleCalendarSyncTargets", () => {
  it("parses comma-separated targets", () => {
    process.env.GOOGLE_CALENDAR_SYNC_TARGETS =
      "805@805shutters.com, jessica@805shutters.com , 805@805shutters.com";
    expect(googleCalendarSyncTargets()).toEqual([
      "805@805shutters.com",
      "jessica@805shutters.com"
    ]);
  });

  it("falls back to GOOGLE_CALENDAR_ID when targets unset", () => {
    process.env.GOOGLE_CALENDAR_ID = "805@805shutters.com";
    expect(googleCalendarSyncTargets()).toEqual(["805@805shutters.com"]);
  });

  it("returns empty when nothing is configured", () => {
    expect(googleCalendarSyncTargets()).toEqual([]);
  });
});

describe("getDelegatedAccessToken", () => {
  it("exchanges a signed JWT for an access token, impersonating the subject", async () => {
    const fetchMock = mockFetchOk({ access_token: "tok-123", expires_in: 3600 });
    vi.stubGlobal("fetch", fetchMock);

    const token = await getDelegatedAccessToken("jessica@805shutters.com");
    expect(token).toBe("tok-123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");

    const assertion = body.get("assertion")!;
    const [, payloadB64] = assertion.split(".");
    const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    expect(claims.iss).toBe(CLIENT_EMAIL);
    expect(claims.sub).toBe("jessica@805shutters.com");
    expect(claims.scope).toBe("https://www.googleapis.com/auth/calendar");
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
  });

  it("caches the token across calls within its lifetime", async () => {
    const fetchMock = mockFetchOk({ access_token: "tok-123", expires_in: 3600 });
    vi.stubGlobal("fetch", fetchMock);

    await getDelegatedAccessToken("805@805shutters.com");
    await getDelegatedAccessToken("805@805shutters.com");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on a non-ok token response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_grant", error_description: "bad assertion" })
      } as Response)
    );

    await expect(getDelegatedAccessToken("805@805shutters.com")).rejects.toThrow(
      "Google token exchange failed"
    );
  });
});

describe("createCalendarEvent", () => {
  it("POSTs to the encoded calendar events URL with bearer token and sendUpdates=none", async () => {
    const fetchMock = mockFetchOk({ id: "evt-1", htmlLink: "https://calendar.google.com/x" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createCalendarEvent("bearer-token", "805@805shutters.com", {
      summary: "Jane Doe consultation",
      description: "Self-booked",
      location: "123 Main St",
      startAt: "2026-07-15T18:00:00.000Z",
      endAt: "2026-07-15T19:00:00.000Z",
      timeZone: "America/Los_Angeles"
    });

    expect(result).toEqual({ id: "evt-1", htmlLink: "https://calendar.google.com/x" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/805%40805shutters.com/events?sendUpdates=none"
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer bearer-token");

    const body = JSON.parse(init.body as string);
    expect(body.summary).toBe("Jane Doe consultation");
    expect(body.start).toEqual({ dateTime: "2026-07-15T18:00:00.000Z", timeZone: "America/Los_Angeles" });
    expect(body.end).toEqual({ dateTime: "2026-07-15T19:00:00.000Z", timeZone: "America/Los_Angeles" });
  });

  it("throws when the API rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: "unauthorized" } })
      } as Response)
    );

    await expect(
      createCalendarEvent("bearer-token", "805@805shutters.com", {
        summary: "x",
        startAt: "2026-07-15T18:00:00.000Z",
        endAt: "2026-07-15T19:00:00.000Z"
      })
    ).rejects.toThrow("Google Calendar create failed for 805@805shutters.com: unauthorized");
  });
});

describe("syncAppointmentToGoogleCalendars", () => {
  it("skips without throwing when unconfigured", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncAppointmentToGoogleCalendars({
      summary: "x",
      startAt: "2026-07-15T18:00:00.000Z",
      endAt: "2026-07-15T19:00:00.000Z"
    });

    expect(result.synced).toBe(false);
    expect(result.skipped).toBe("not-configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("syncs to every target calendar and stays green when one fails", async () => {
    process.env.GOOGLE_CALENDAR_SYNC_TARGETS =
      "805@805shutters.com,jessica@805shutters.com";

    let tokenCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("oauth2.googleapis.com/token")) {
          tokenCallCount += 1;
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: `tok-${tokenCallCount}`, expires_in: 3600 })
          } as Response;
        }
        const isCalendarCall = String(url).includes("/calendar/v3/calendars/");
        const calendar = decodeURIComponent(
          String(url).split("/calendars/")[1]?.split("/")[0] || ""
        );
        if (isCalendarCall && calendar === "jessica@805shutters.com") {
          return {
            ok: false,
            status: 403,
            json: async () => ({ error: { message: "forbidden for jessica" } })
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: `evt-${calendar}`, htmlLink: "https://calendar.google.com/x" })
        } as Response;
      })
    );

    const result = await syncAppointmentToGoogleCalendars({
      summary: "Jane Doe consultation",
      location: "123 Main St",
      startAt: "2026-07-15T18:00:00.000Z",
      endAt: "2026-07-15T19:00:00.000Z"
    });

    expect(result.synced).toBe(true);
    expect(result.results).toHaveLength(2);
    const byCalendar = Object.fromEntries(result.results.map((r) => [r.calendar, r]));
    expect(byCalendar["805@805shutters.com"].eventId).toBe("evt-805@805shutters.com");
    expect(byCalendar["jessica@805shutters.com"].eventId).toBeUndefined();
    expect(byCalendar["jessica@805shutters.com"].error).toContain("forbidden for jessica");
  });
});
