import { describe, expect, it } from "vitest";
import type { CrmCalendarEvent } from "@/lib/crm/types";
import { calendarEventSalePresentation } from "@/lib/crm/calendar-event-sales";

const now = new Date("2026-08-13T20:00:00.000Z");

function event(overrides: Partial<CrmCalendarEvent> = {}): CrmCalendarEvent {
  return {
    id: "event-1",
    created_at: "2026-08-12T20:00:00.000Z",
    updated_at: "2026-08-12T20:00:00.000Z",
    job_id: "job-1",
    title: "Sales consultation",
    event_type: "sales_consult",
    status: "scheduled",
    assigned_to: "Jessica",
    start_at: "2026-08-14T17:00:00.000Z",
    end_at: "2026-08-14T18:00:00.000Z",
    location: null,
    notes: null,
    ...overrides
  };
}

describe("calendarEventSalePresentation", () => {
  it("immediately marks a future appointment sold when its quote is signed", () => {
    expect(
      calendarEventSalePresentation(event({ quote_signed_at: "2026-08-13T19:00:00.000Z" }), now)
    ).toEqual({ tone: "sold", bannerLabel: "SOLD" });
  });

  it("marks a linked signed customer contract sold", () => {
    expect(
      calendarEventSalePresentation(event({ customer_contract_signed_at: "2026-08-13T19:00:00.000Z" }), now)
    ).toEqual({ tone: "sold", bannerLabel: "SOLD" });
  });

  it("keeps a future sent quote in its normal appointment state", () => {
    expect(
      calendarEventSalePresentation(event({ quote_sent_at: "2026-08-13T19:00:00.000Z" }), now)
    ).toEqual({ tone: null, bannerLabel: null });
  });

  it("retains the past unsold follow-up tone for a sent quote", () => {
    expect(
      calendarEventSalePresentation(
        event({
          start_at: "2026-08-12T17:00:00.000Z",
          end_at: "2026-08-12T18:00:00.000Z",
          quote_sent_at: "2026-08-12T19:00:00.000Z"
        }),
        now
      )
    ).toEqual({ tone: "unsold", bannerLabel: null });
  });

  it("does not label canceled appointments or calendar blocks sold", () => {
    const signedAt = "2026-08-13T19:00:00.000Z";
    expect(calendarEventSalePresentation(event({ status: "canceled", quote_signed_at: signedAt }), now)).toEqual({
      tone: null,
      bannerLabel: null
    });
    expect(
      calendarEventSalePresentation(event({ event_type: "block", customer_contract_signed_at: signedAt }), now)
    ).toEqual({ tone: null, bannerLabel: null });
  });
});
