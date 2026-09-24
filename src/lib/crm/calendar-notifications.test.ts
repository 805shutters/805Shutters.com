import { afterEach, describe, expect, it } from "vitest";
import {
  assignmentRecipientReps,
  buildAppointmentReplyForward,
  buildDayBeforeAppointmentReminder,
  buildCalendarAssignmentSms,
  formatCustomerReminderTime,
  formatCalendarSmsWindow,
  isPacificReminderHour,
  isTomorrowInPacific,
  salesRepSmsNumberForName,
  sendCalendarAssignmentSms
} from "./calendar-notifications";

describe("salesRepSmsNumberForName", () => {
  const env = {
    JESSICA_805_SALES_SMS_NUMBER: "8055551111",
    MIKE_805_SALES_SMS_NUMBER: "8055552222"
  };

  it("maps assigned CRM owners to their SMS numbers", () => {
    expect(salesRepSmsNumberForName("Jessica", env)).toBe("8055551111");
    expect(salesRepSmsNumberForName("Mike", env)).toBe("8055552222");
    expect(salesRepSmsNumberForName("Jessica S.", env)).toBe("8055551111");
  });

  it("skips unassigned or unknown owners", () => {
    expect(salesRepSmsNumberForName("Unassigned", env)).toBeNull();
    expect(salesRepSmsNumberForName("", env)).toBeNull();
    expect(salesRepSmsNumberForName("Installer", env)).toBeNull();
  });
});

describe("assignmentRecipientReps", () => {
  it("alerts both Jessica and Mike for Jessica's appointments", () => {
    expect(assignmentRecipientReps("Jessica")).toEqual(["Jessica", "Mike"]);
    expect(assignmentRecipientReps("Jessica S.")).toEqual(["Jessica", "Mike"]);
  });

  it("alerts only Mike for Mike's appointments", () => {
    expect(assignmentRecipientReps("Mike")).toEqual(["Mike"]);
  });

  it("alerts no one for unassigned or unknown owners", () => {
    expect(assignmentRecipientReps("Unassigned")).toEqual([]);
    expect(assignmentRecipientReps("")).toEqual([]);
    expect(assignmentRecipientReps("Installer")).toEqual([]);
  });
});

describe("sendCalendarAssignmentSms routing", () => {
  const baseInput = {
    title: "Susannah consultation",
    customerName: "Susannah",
    startAt: "2026-06-24T23:00:00.000Z",
    endAt: "2026-06-25T00:00:00.000Z",
    location: "340 Green Moor Place, Thousand Oaks",
    phone: "8043589594",
    productInterest: "Shutters"
  };

  afterEach(() => {
    delete process.env.JESSICA_805_SALES_SMS_NUMBER;
    delete process.env.MIKE_805_SALES_SMS_NUMBER;
  });

  it("fans out to both reps when Jessica is assigned", async () => {
    process.env.JESSICA_805_SALES_SMS_NUMBER = "8055551111";
    process.env.MIKE_805_SALES_SMS_NUMBER = "8055552222";

    const result = await sendCalendarAssignmentSms({ ...baseInput, assignedTo: "Jessica" });
    expect(result.deliveries.map((delivery) => delivery.rep)).toEqual(["Jessica", "Mike"]);
  });

  it("sends only to Mike when Mike is assigned", async () => {
    process.env.JESSICA_805_SALES_SMS_NUMBER = "8055551111";
    process.env.MIKE_805_SALES_SMS_NUMBER = "8055552222";

    const result = await sendCalendarAssignmentSms({ ...baseInput, assignedTo: "Mike" });
    expect(result.deliveries.map((delivery) => delivery.rep)).toEqual(["Mike"]);
  });

  it("drops a recipient whose number is not configured", async () => {
    process.env.JESSICA_805_SALES_SMS_NUMBER = "8055551111";
    // Mike's number intentionally unset.

    const result = await sendCalendarAssignmentSms({ ...baseInput, assignedTo: "Jessica" });
    expect(result.deliveries.map((delivery) => delivery.rep)).toEqual(["Jessica"]);
  });

  it("skips entirely when the assignee maps to no recipients", async () => {
    const result = await sendCalendarAssignmentSms({ ...baseInput, assignedTo: "Unassigned" });
    expect(result.sent).toBe(false);
    expect(result.deliveries).toEqual([]);
    expect(result.skipped).toBeTruthy();
  });
});

describe("calendar assignment SMS formatting", () => {
  it("formats the appointment window in Los Angeles time", () => {
    expect(formatCalendarSmsWindow("2026-06-24T23:00:00.000Z", "2026-06-25T00:00:00.000Z")).toBe(
      "Wed, Jun 24, 4:00 PM - 5:00 PM"
    );
  });

  it("includes the assigned rep, customer, schedule, address, phone, and product", () => {
    const message = buildCalendarAssignmentSms({
      assignedTo: "Jessica",
      title: "Susannah consultation",
      customerName: "Susannah",
      startAt: "2026-06-24T23:00:00.000Z",
      endAt: "2026-06-25T00:00:00.000Z",
      location: "340 Green Moor Place, Thousand Oaks",
      phone: "8043589594",
      productInterest: "Shutters"
    });

    expect(message).toContain("assigned to Jessica");
    expect(message).toContain("Susannah, Wed, Jun 24, 4:00 PM - 5:00 PM");
    expect(message).toContain("Address: 340 Green Moor Place, Thousand Oaks.");
    expect(message).toContain("Phone: 8043589594.");
    expect(message).toContain("Product: Shutters.");
  });

  it("identifies a reschedule and includes both the new and previous appointment windows", () => {
    const message = buildCalendarAssignmentSms({
      action: "rescheduled",
      assignedTo: "Jessica",
      title: "Susannah consultation",
      customerName: "Susannah",
      startAt: "2026-06-25T23:00:00.000Z",
      endAt: "2026-06-26T00:00:00.000Z",
      previousStartAt: "2026-06-24T23:00:00.000Z",
      previousEndAt: "2026-06-25T00:00:00.000Z",
      location: "340 Green Moor Place, Thousand Oaks",
      phone: "8043589594",
      productInterest: "Shutters"
    });

    expect(message).toMatch(/^RESCHEDULED\n\n805 Shutters appointment for Jessica\./);
    expect(message).toContain("new time: Thu, Jun 25, 4:00 PM - 5:00 PM");
    expect(message).toContain("Previous time: Wed, Jun 24, 4:00 PM - 5:00 PM");
  });

  it("identifies a canceled appointment and retains its customer details", () => {
    const message = buildCalendarAssignmentSms({
      action: "canceled",
      assignedTo: "Jessica",
      title: "Susannah consultation",
      customerName: "Susannah",
      startAt: "2026-06-24T23:00:00.000Z",
      endAt: "2026-06-25T00:00:00.000Z",
      location: "340 Green Moor Place, Thousand Oaks",
      phone: "8043589594",
      productInterest: "Shutters"
    });

    expect(message).toMatch(/^CANCELLED\n\n805 Shutters appointment for Jessica\./);
    expect(message).toContain("Susannah, Wed, Jun 24, 4:00 PM - 5:00 PM");
    expect(message).toContain("Phone: 8043589594");
    expect(message).toContain("Product: Shutters");
  });
});

describe("day-before customer reminders", () => {
  it("formats an exact 30-minute Pacific arrival window", () => {
    expect(formatCustomerReminderTime("2026-07-12T17:00:00.000Z")).toBe("10:00 AM and 10:30 AM");
    expect(buildDayBeforeAppointmentReminder("2026-07-12T17:00:00.000Z")).toBe(
      "Hi, just a reminder that we have a window covering consultation scheduled for tomorrow between 10:00 AM and 10:30 AM. - 805 Shutters"
    );
  });

  it("recognizes 7 p.m. in Los Angeles across daylight-saving time", () => {
    expect(isPacificReminderHour(new Date("2026-07-12T02:00:00.000Z"))).toBe(true);
    expect(isPacificReminderHour(new Date("2026-01-12T03:00:00.000Z"))).toBe(true);
    expect(isPacificReminderHour(new Date("2026-07-12T03:00:00.000Z"))).toBe(false);
  });

  it("selects only appointments on the following Pacific calendar day", () => {
    const now = new Date("2026-07-12T02:00:00.000Z"); // July 11 at 7 p.m. PDT
    expect(isTomorrowInPacific("2026-07-12T17:00:00.000Z", now)).toBe(true);
    expect(isTomorrowInPacific("2026-07-13T17:00:00.000Z", now)).toBe(false);
    expect(isTomorrowInPacific("2026-07-12T06:30:00.000Z", now)).toBe(false); // still July 11 PDT
  });

  it("forwards a reply with all requested customer and appointment details", () => {
    expect(buildAppointmentReplyForward({
      customerName: "Jane Customer",
      customerPhone: "805-555-1212",
      address: "123 Main Street",
      city: "Camarillo",
      appointmentStart: "2026-07-12T17:00:00.000Z",
      response: "Please confirm that time still works."
    })).toBe([
      "805 Shutters appointment reply",
      "Name: Jane Customer",
      "Date/time: Sun, Jul 12, 2026, 10:00 AM",
      "Address: 123 Main Street, Camarillo",
      "Phone: 805-555-1212",
      "Response: Please confirm that time still works."
    ].join("\n"));
  });
});

describe("day-before reminder processing", () => {
  function database(events: Record<string, unknown>[], jobs: unknown[]) {
    const updates: Record<string, unknown>[] = [];
    const filters: [string, unknown][] = [];
    return { updates, filters, client: { from: (table: string) => {
      const query: Record<string, unknown> = {};
      let update: unknown;
      for (const key of ["select", "in", "gte", "lt"]) query[key] = () => query;
      query.eq = (column: string, value: unknown) => { filters.push([column, value]); return query; };
      query.update = (value: Record<string, unknown>) => { update = value; updates.push(value); return query; };
      query.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null, data: update ? null : table === "crm_calendar_events" ? events : jobs }).then(resolve);
      return query;
    }} as never };
  }
  const event = { id: "event", job_id: "job", start_at: "2026-09-25T18:00:00Z", meta: {} };
  const now = new Date("2026-09-25T02:00:00Z");
  it("records Twilio message evidence for tomorrow's consultation", async () => {
    const { runDayBeforeAppointmentReminders } = await import("./calendar-notifications");
    const db = database([event], [{ id: "job", phone: "8055551212" }]);
    const result = await runDayBeforeAppointmentReminders(db.client, now, async () => ({ sent: true, sid: "SMtest", providerStatus: "queued" }));
    expect(result.sent).toBe(1);
    expect(db.filters).toContainEqual(["event_type", "sales_consult"]);
    expect(db.updates[0]).toMatchObject({ meta: { dayBeforeReminderMessageSid: "SMtest", dayBeforeReminderProviderStatus: "queued" } });
  });
  it("does not resend a reminder already recorded for the same appointment", async () => {
    const { runDayBeforeAppointmentReminders } = await import("./calendar-notifications");
    const db = database([{ ...event, meta: { dayBeforeReminderAppointmentStart: event.start_at, dayBeforeReminderSentAt: now.toISOString() } }], []);
    const result = await runDayBeforeAppointmentReminders(db.client, now, async () => { throw new Error("must not send"); });
    expect(result).toMatchObject({ sent: 0, skipped: 1, failed: 0 });
  });
  it("counts missing phones as failures instead of silently skipping customers", async () => {
    const { runDayBeforeAppointmentReminders } = await import("./calendar-notifications");
    const db = database([event], []);
    expect(await runDayBeforeAppointmentReminders(db.client, now)).toMatchObject({ sent: 0, failed: 1 });
  });
  it("retains uncertain sends and does not automatically retry them", async () => {
    const { runDayBeforeAppointmentReminders } = await import("./calendar-notifications");
    const db = database([event], [{ id: "job", phone: "8055551212" }]);
    expect(await runDayBeforeAppointmentReminders(db.client, now, async () => ({ sent: false, uncertain: true }))).toMatchObject({ failed: 1 });
    expect(db.updates[0]).toMatchObject({ meta: { dayBeforeReminderUncertainStart: event.start_at } });
    const retry = database([{ ...event, meta: { dayBeforeReminderUncertainStart: event.start_at } }], [{ id: "job", phone: "8055551212" }]);
    expect(await runDayBeforeAppointmentReminders(retry.client, now, async () => { throw new Error("must not send"); })).toMatchObject({ failed: 1 });
  });
});
