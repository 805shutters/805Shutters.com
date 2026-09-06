import { afterEach, describe, expect, it, vi } from "vitest";
import { checkVisitTravel, googleDriveEstimator } from "./travel";
import { candidateVisit } from "./scheduling";
const date = "2035-10-01",
  now = new Date("2035-09-30T12:00Z");
const visit = (time: string, address = "123 Main St", id = time) =>
  candidateVisit(date, time, address, 5, id);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Google route eligibility", () => {
  it("excludes first and last commutes", async () => {
    const drive = vi.fn();
    expect(
      (await checkVisitTravel(visit("10:00"), [], drive, now)).reason,
    ).toBeNull();
    expect(drive).not.toHaveBeenCalled();
  });
  it("checks both sides and reserves exactly 15 extra minutes", async () => {
    const drive = vi.fn(async () => 15 * 60);
    const result = await checkVisitTravel(
      visit("10:30", "B"),
      [visit("09:00", "A"), visit("12:00", "C")],
      drive,
      now,
    );
    expect(result.reason).toBeNull();
    expect(drive.mock.calls).toHaveLength(2);
    expect(result.proof?.previous?.seconds).toBe(900);
    expect(
      (
        await checkVisitTravel(
          visit("10:30", "B"),
          [visit("09:00", "A"), visit("12:00", "C")],
          async () => 901,
          now,
        )
      ).reason,
    ).toBe("driving_time");
  });
  it("rejects the zero-gap Moorpark/Camarillo pattern before calling Google", async () => {
    const drive = vi.fn();
    expect(
      (
        await checkVisitTravel(
          visit("13:30", "Camarillo"),
          [visit("14:30", "Moorpark")],
          drive,
          now,
        )
      ).reason,
    ).toBe("driving_time");
    expect(drive).not.toHaveBeenCalled();
  });
  it("uses the nearest visits, including unassigned, not every distant event", async () => {
    const drive = vi.fn(async () => 600);
    const old = visit("08:00", "distant"),
      near = visit("09:00", "near");
    near.assigned_to = "Unassigned";
    expect(
      (
        await checkVisitTravel(
          visit("11:00", "customer"),
          [old, near],
          drive,
          now,
        )
      ).reason,
    ).toBeNull();
    expect(drive.mock.calls).toHaveLength(1);
  });
  it("closes affected times on missing locations or failed routes", async () => {
    expect(
      (
        await checkVisitTravel(
          visit("11:00"),
          [visit("09:00", "")],
          async () => 0,
          now,
        )
      ).reason,
    ).toBe("missing_information");
    expect(
      (
        await checkVisitTravel(
          visit("11:00"),
          [visit("09:00")],
          async () => null,
          now,
        )
      ).reason,
    ).toBe("missing_information");
  });
  it("does not allow driving through a busy block", async () => {
    const block = visit("10:00");
    block.event_type = "block";
    block.end_at = visit("10:30").start_at;
    expect(
      (
        await checkVisitTravel(
          visit("11:00"),
          [visit("09:00"), block],
          async () => 900,
          now,
        )
      ).reason,
    ).toBe("driving_time");
  });
  it("calls traffic-aware Google road routing with departure time, and rejects fallback estimates", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "local-test-key");
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("searchText")
              ? {
                  places: [
                    {
                      formattedAddress: "123 Main St",
                      addressComponents: [
                        { types: ["street_number"] },
                        { types: ["route"] },
                      ],
                      location: { latitude: 34, longitude: -119 },
                    },
                  ],
                }
              : { routes: [{ duration: "1234s" }] },
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const drive = googleDriveEstimator(now);
    expect(await drive("A", "B", new Date("2035-10-01T17:00Z"))).toBe(1234);
    const route = fetcher.mock.calls.find((c) =>
      c[0].includes("computeRoutes"),
    );
    expect(route).toBeTruthy();
    const routeOptions = (
      fetcher.mock.calls as unknown as [string, RequestInit][]
    ).find((c) => c[0].includes("computeRoutes"))![1];
    expect(JSON.parse(String(routeOptions.body))).toMatchObject({
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      departureTime: "2035-10-01T17:00:00.000Z",
    });
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("searchText")
        ? fetcher(url)
        : new Response(
            JSON.stringify({ fallbackInfo: {}, routes: [{ duration: "1s" }] }),
          ),
    );
    expect(await googleDriveEstimator(now)("A", "B", now)).toBeNull();
  });
});
