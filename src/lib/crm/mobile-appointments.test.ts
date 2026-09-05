import { describe, expect, it } from "vitest";
import type { CrmCalendarEvent } from "@/lib/crm/types";
import {
  assertEtaCoordinates,
  buildMobileEtaSms,
  calculateMobileDriveEta,
  crmMobileOwnerForEmail,
  filterMobileAppointments,
  mobileAppointmentDurationMinutes,
  mobileAppointmentWindowCount,
  normalizeMobileAppointmentEventType,
  normalizeMobileAppointmentScope,
  parseMobileAppointmentRange
} from "./mobile-appointments";

function event(overrides: Partial<CrmCalendarEvent> = {}): CrmCalendarEvent {
  return {
    id: "event-1",
    created_at: "2026-06-28T00:00:00.000Z",
    updated_at: "2026-06-28T00:00:00.000Z",
    job_id: "job-1",
    title: "Test Appointment",
    event_type: "sales_consult",
    status: "scheduled",
    assigned_to: "Jessica",
    start_at: "2026-07-01T16:00:00.000Z",
    end_at: "2026-07-01T18:00:00.000Z",
    location: "123 Main St, Ventura, CA",
    notes: "Bring samples",
    meta: {
      windowCount: 12
    },
    customer_name: "Pat Smith",
    customer_phone: "8055551212",
    customer_address: "123 Main St, Ventura, CA",
    product_interest: "Shutters",
    ...overrides
  };
}

describe("805 mobile appointment helpers", () => {
  it("maps approved CRM emails to mobile appointment owners", () => {
    expect(crmMobileOwnerForEmail("jessica@805shutters.com")).toBe("Jessica");
    expect(crmMobileOwnerForEmail("805shutters@gmail.com")).toBe("Mike");
    expect(crmMobileOwnerForEmail("khill31@msn.com")).toBeNull();
  });

  it("defaults invalid scopes to all appointments", () => {
    expect(normalizeMobileAppointmentScope("all")).toBe("all");
    expect(normalizeMobileAppointmentScope("my")).toBe("my");
    expect(normalizeMobileAppointmentScope("anything-else")).toBe("all");
    expect(normalizeMobileAppointmentScope(null)).toBe("all");
  });

  it("only filters sales consults when explicitly requested", () => {
    expect(normalizeMobileAppointmentEventType(null)).toBeNull();
    expect(normalizeMobileAppointmentEventType("")).toBeNull();
    expect(normalizeMobileAppointmentEventType("sales_consult")).toBe("sales_consult");
    expect(() => normalizeMobileAppointmentEventType("measure")).toThrow("Unsupported appointment event type");
  });

  it("validates mobile appointment ranges", () => {
    const range = parseMobileAppointmentRange("2026-07-01", "2026-07-08");
    expect(range.startDate).toBe("2026-07-01");
    expect(range.endDate).toBe("2026-07-08");
    expect(range.startAt).toContain("T");
    expect(() => parseMobileAppointmentRange("2026-07-08", "2026-07-01")).toThrow("End date must be after start date.");
    expect(() => parseMobileAppointmentRange("07/01/2026", "2026-07-08")).toThrow("YYYY-MM-DD");
    expect(() => parseMobileAppointmentRange("2026-01-01", "2026-05-01")).toThrow("93 days");
  });

  it("filters my appointments by mapped owner and keeps all active appointments for all scope", () => {
    const jessica = event({ id: "jessica", assigned_to: "Jessica" });
    const mike = event({ id: "mike", assigned_to: "Mike" });
    const canceled = event({ id: "canceled", assigned_to: "Jessica", status: "canceled" });

    expect(filterMobileAppointments([jessica, mike, canceled], "jessica@805shutters.com", "my").map((row) => row.id)).toEqual([
      "jessica"
    ]);
    expect(filterMobileAppointments([jessica, mike, canceled], "khill31@msn.com", "my")).toEqual([]);
    expect(filterMobileAppointments([jessica, mike, canceled], "khill31@msn.com", "all").map((row) => row.id)).toEqual([
      "jessica",
      "mike"
    ]);
    expect(
      filterMobileAppointments(
        [jessica, event({ id: "measure", event_type: "measure" })],
        "jessica@805shutters.com",
        "all",
      ).map((row) => row.id),
    ).toEqual(["jessica", "measure"]);
  });

  it("extracts appointment window counts and durations", () => {
    expect(mobileAppointmentWindowCount(event())).toBe(12);
    expect(mobileAppointmentDurationMinutes(event())).toBe(120);
  });

  it("builds exact in-route SMS copy", () => {
    expect(buildMobileEtaSms({ customerName: "Pat Smith", etaMinutes: 24 })).toBe(
      "Hi Pat, we're in route for your window covering consultation. See you shortly!\n\n805 Shutters\nOfficial 805 Shutters contact: 805Shutters.com | 805-806-9344 | 805@805shutters.com"
    );
    expect(buildMobileEtaSms({ customerName: "Pat Smith", etaMinutes: null })).toBe(
      "Hi Pat, we're in route for your window covering consultation. See you shortly!\n\n805 Shutters\nOfficial 805 Shutters contact: 805Shutters.com | 805-806-9344 | 805@805shutters.com"
    );
  });

  it("guards ETA coordinates", () => {
    expect(assertEtaCoordinates({ installerLat: 34.2, installerLng: -119.1 })).toEqual({
      installerLat: 34.2,
      installerLng: -119.1
    });
    expect(() => assertEtaCoordinates({ installerLat: "bad", installerLng: -119.1 })).toThrow("Installer location is required.");
    expect(() => assertEtaCoordinates({ installerLat: 91, installerLng: -119.1 })).toThrow("Installer location is invalid.");
  });

  it("calculates Google drive ETA and falls back to null when unavailable", async () => {
    expect(
      await calculateMobileDriveEta({
        installerLat: 34.2,
        installerLng: -119.1,
        customerAddress: "123 Main St",
        mapsApiKey: null
      })
    ).toBeNull();

    const fetchImpl = async () =>
      ({
        json: async () => ({
          status: "OK",
          rows: [
            {
              elements: [
                {
                  status: "OK",
                  duration_in_traffic: { value: 1440, text: "24 mins" },
                  distance: { text: "12 mi" }
                }
              ]
            }
          ]
        })
      }) as Response;

    await expect(
      calculateMobileDriveEta({
        installerLat: 34.2,
        installerLng: -119.1,
        customerAddress: "123 Main St",
        mapsApiKey: "test-key",
        fetchImpl
      })
    ).resolves.toEqual({
      minutes: 24,
      text: "24 mins",
      distance: "12 mi"
    });
  });
});
