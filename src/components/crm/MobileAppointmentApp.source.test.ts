import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/MobileAppointmentApp.tsx", "utf8");

describe("MobileAppointmentApp source contract", () => {
  it("keeps the mobile appointment app calendar views and scope toggle", () => {
    expect(source).toContain('type CalendarView = "month" | "week" | "day"');
    expect(source).toContain('const calendarViews: CalendarView[] = ["month", "week", "day"]');
    expect(source).toContain('const calendarScopes: CalendarScope[] = ["my", "all"]');
  });

  it("keeps the mobile Google login and appointment detail ETA actions", () => {
    expect(source).toContain("/api/crm/oauth/google?redirectTo=");
    expect(source).toContain("Text & Navigate");
    expect(source).toContain("Navigate Only");
    expect(source).toContain("navigator.geolocation.getCurrentPosition");
    expect(source).toContain("/api/crm/mobile/appointments/");
  });
});
