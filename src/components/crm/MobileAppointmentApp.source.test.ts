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

  it("presents the branded technician workspace without the job-status view", () => {
    expect(source).toContain("/brand/805-shutters-logo-header.png");
    expect(source).toContain("Technician workspace");
    expect(source).toContain("Open Appointments");
    expect(source).not.toContain("/crm/mobile/job-status");
    expect(source).not.toContain("<strong>Job Status</strong>");
    expect(styles).toMatch(/\.mobile-crm-home-header img \{[\s\S]*?width: min\(78vw, 360px\);/);
  });
});
