import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/MobileAppointmentApp.tsx", "utf8");
const styles = readFileSync("src/app/globals.css", "utf8");

describe("MobileAppointmentApp source contract", () => {
  it("keeps the mobile appointment app calendar views without a scope toggle", () => {
    expect(source).toContain('type CalendarView = "list" | "month" | "week" | "day"');
    expect(source).toContain('const calendarViews: CalendarView[] = ["list", "week", "day"]');
    expect(source).toContain('scope: "all"');
    expect(source).not.toContain("calendarScopes");
    expect(source).not.toContain('type CalendarScope = "my" | "all"');
  });

  it("keeps the mobile Google login, appointment creation, and detail ETA actions", () => {
    expect(source).toContain("/api/crm/oauth/google?redirectTo=");
    expect(source).toContain("Add Appointment");
    expect(source).toContain("/api/crm/jobs");
    expect(source).toContain("/api/crm/calendar");
    expect(source).toContain("assignedPerson(event)");
    expect(source).toContain("Text & Navigate");
    expect(source).toContain("Navigate Only");
    expect(source).toContain("navigator.geolocation.getCurrentPosition");
    expect(source).toContain("/api/crm/mobile/appointments/");
    expect(source).toContain("Close appointments and return to mobile app home");
    expect(source).toContain("setShowWorkspaceMenu(true)");
  });

  it("keeps the mobile home logo centered at one quarter of its former width", () => {
    expect(styles).toMatch(/\.mobile-crm-home-header img \{[\s\S]*?width: 44px;[\s\S]*?justify-self: center;/);
  });
});
