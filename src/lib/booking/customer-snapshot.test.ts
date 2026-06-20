import { describe, expect, it } from "vitest";
import {
  buildSelfBookingCustomerSnapshot,
  buildSelfBookingProductRecord,
  type SelfBookingCustomerDetails
} from "./customer-snapshot";

const details: SelfBookingCustomerDetails = {
  leadId: "lead-1",
  jobId: "job-1",
  calendarEventId: "event-1",
  name: "Taylor Customer",
  phone: "805-555-0100",
  email: "taylor@example.com",
  address: "123 Main St, Ventura",
  windowCount: 7,
  productInterest: "Plantation Shutters, Roller Shades",
  productTypes: ["Plantation Shutters", "Roller Shades"],
  bookingNotes: "Self-booked appointment.\nWindows: 7\nProduct interest: Plantation Shutters, Roller Shades\nCustomer notes: Upstairs first",
  startAt: "2026-06-25T17:00:00.000Z",
  endAt: "2026-06-25T18:00:00.000Z"
};

describe("self-booking customer snapshot", () => {
  it("preserves booking contact, appointment, and product metadata for customer files", () => {
    const snapshot = buildSelfBookingCustomerSnapshot(details);

    expect(snapshot).toMatchObject({
      displayName: "Taylor Customer",
      phone: "805-555-0100",
      email: "taylor@example.com",
      address: "123 Main St, Ventura",
      latestStatus: "scheduled",
      source: "crm",
      notes: details.bookingNotes,
      meta: {
        lastLeadId: "lead-1",
        lastJobId: "job-1",
        lastCalendarEventId: "event-1",
        bookingSource: "website",
        appointmentStart: "2026-06-25T17:00:00.000Z",
        appointmentEnd: "2026-06-25T18:00:00.000Z",
        windowCount: 7,
        productTypes: ["Plantation Shutters", "Roller Shades"]
      }
    });
  });

  it("stores selected products and the window count instead of falling back to one generic item", () => {
    const product = buildSelfBookingProductRecord(details, "customer-1");

    expect(product).toMatchObject({
      customer_id: "customer-1",
      job_id: "job-1",
      product_type: "Plantation Shutters, Roller Shades",
      quantity: 7,
      status: "scheduled",
      meta: {
        source: "self_booking",
        leadId: "lead-1",
        calendarEventId: "event-1",
        productInterest: "Plantation Shutters, Roller Shades",
        productTypes: ["Plantation Shutters", "Roller Shades"],
        windowCount: 7
      }
    });
    expect(product.description).toContain("Approx. windows: 7");
    expect(product.description).toContain("Customer notes: Upstairs first");
  });

  it("uses a neutral product row when the customer did not pick products or window count", () => {
    const product = buildSelfBookingProductRecord(
      {
        ...details,
        windowCount: 0,
        productInterest: "consultation",
        productTypes: [],
        bookingNotes: ""
      },
      "customer-1"
    );

    expect(product.product_type).toBe("Window Treatments");
    expect(product.quantity).toBe(1);
    expect(product.description).toBe("Self-booked appointment.");
    expect(product.meta.windowCount).toBeNull();
  });
});
