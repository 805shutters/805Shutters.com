import { describe, expect, it } from "vitest";
import {
  calendarAppointmentDurationChoices,
  calendarAppointmentDurationLabel,
  calendarAppointmentDurationMinutes
} from "./calendar-duration";

describe("calendar appointment duration", () => {
  it("accepts an adjusted duration submitted by the reschedule form", () => {
    expect(calendarAppointmentDurationMinutes("60", 120)).toBe(60);
    expect(calendarAppointmentDurationMinutes("90", 120)).toBe(90);
  });

  it("falls back when the submitted duration is invalid", () => {
    expect(calendarAppointmentDurationMinutes("invalid", 120)).toBe(120);
    expect(calendarAppointmentDurationMinutes("15", 120)).toBe(120);
  });

  it("keeps a custom existing duration available in the choices", () => {
    expect(calendarAppointmentDurationChoices(75)).toContain(75);
  });

  it("formats duration labels for the appointment editor", () => {
    expect(calendarAppointmentDurationLabel(30)).toBe("30 minutes");
    expect(calendarAppointmentDurationLabel(60)).toBe("1 hour");
    expect(calendarAppointmentDurationLabel(90)).toBe("1 hour 30 minutes");
    expect(calendarAppointmentDurationLabel(120)).toBe("2 hours");
  });
});
