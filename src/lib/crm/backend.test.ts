import { describe, expect, it } from "vitest";
import { enrichCalendarEventsWithJobDetails } from "./backend";
import { CrmCalendarEvent, CrmJob } from "./types";

describe("enrichCalendarEventsWithJobDetails", () => {
  it("adds linked job contact details to calendar events", () => {
    const events = [
      {
        id: "event-1",
        created_at: "2026-06-20T00:00:00.000Z",
        updated_at: "2026-06-20T00:00:00.000Z",
        job_id: "job-1",
        title: "Susannah consultation",
        event_type: "sales_consult",
        status: "scheduled",
        assigned_to: "Jessica",
        start_at: "2026-06-24T23:00:00.000Z",
        end_at: "2026-06-25T00:00:00.000Z",
        location: "340 Green Moor Place",
        notes: "4 shutters"
      } satisfies CrmCalendarEvent
    ];

    const jobs = [
      {
        id: "job-1",
        created_at: "2026-06-20T00:00:00.000Z",
        updated_at: "2026-06-20T00:00:00.000Z",
        source: "crm",
        lead_id: null,
        status: "scheduled",
        priority: "normal",
        customer_name: "Susannah",
        phone: "8043589594",
        email: "customer@email.com",
        address: "340 Green Moor Place",
        city: "Thousand Oaks",
        product_interest: "Shutters",
        sales_owner: "Jessica",
        next_action: null,
        next_action_due: null,
        appointment_start: "2026-06-24T23:00:00.000Z",
        appointment_end: "2026-06-25T00:00:00.000Z",
        estimated_total: 0,
        deposit_paid: 0,
        notes: "Bring white shutter samples"
      } satisfies CrmJob
    ];

    expect(enrichCalendarEventsWithJobDetails(events, jobs)[0]).toMatchObject({
      customer_name: "Susannah",
      customer_phone: "8043589594",
      customer_email: "customer@email.com",
      customer_address: "340 Green Moor Place",
      customer_city: "Thousand Oaks",
      product_interest: "Shutters",
      customer_notes: "4 shutters"
    });
  });
});
