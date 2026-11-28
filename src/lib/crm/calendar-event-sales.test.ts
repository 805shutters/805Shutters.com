import { describe, expect, it } from "vitest";
import type { CrmCalendarEvent } from "@/lib/crm/types";
import { calendarEventSalePresentation, calendarQuoteStatus, type CalendarQuoteRow } from "@/lib/crm/calendar-event-sales";

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

function quote(overrides: Partial<CalendarQuoteRow> = {}): CalendarQuoteRow {
  return { id: "quote-1", status: "draft", sent_at: null, signed_at: null, meta: {}, ...overrides };
}

describe("calendarQuoteStatus", () => {
  it("leaves an appointment unlabeled when the job has no live quote", () => {
    expect(calendarQuoteStatus({ jobStatus: "scheduled", quotes: [], sentDeliveryQuoteIds: [] })).toBeNull();
    expect(calendarQuoteStatus({
      jobStatus: "quoted",
      quotes: [quote({ meta: { deleted_at: "2026-08-01T00:00:00.000Z" } })],
      sentDeliveryQuoteIds: []
    })).toBeNull();
  });

  it("marks a live quote unsent when it has no sent_at and no sent delivery attempt", () => {
    expect(calendarQuoteStatus({
      jobStatus: "scheduled",
      quotes: [quote()],
      sentDeliveryQuoteIds: []
    })).toBe("unsent");
    expect(calendarQuoteStatus({
      quotes: [quote({ status: "sent", sent_at: null })],
      sentDeliveryQuoteIds: []
    })).toBe("unsent");
  });

  it("ignores deleted and bookkeeping-deleted quotes", () => {
    expect(calendarQuoteStatus({
      quotes: [
        quote({ id: "deleted", sent_at: "2026-08-01T00:00:00.000Z", meta: { deleted_at: "2026-08-02T00:00:00.000Z" } }),
        quote({ id: "ledger-deleted", sent_at: "2026-08-01T00:00:00.000Z", meta: { bookkeeping_deleted_at: "2026-08-02T00:00:00.000Z" } }),
        quote({ id: "projected", deleted_at: "2026-08-02T00:00:00.000Z", sent_at: "2026-08-01T00:00:00.000Z" }),
        quote({ id: "live" })
      ],
      sentDeliveryQuoteIds: ["deleted"]
    })).toBe("unsent");
  });

  it("marks a quote sent when sent_at is set", () => {
    expect(calendarQuoteStatus({
      quotes: [quote({ status: "draft", sent_at: "2026-08-13T19:00:00.000Z" })],
      sentDeliveryQuoteIds: []
    })).toBe("sent");
  });

  it("marks a quote sent from a delivery attempt without sent_at", () => {
    expect(calendarQuoteStatus({
      quotes: [quote({ id: "quote-sent-attempt", status: "draft", sent_at: null })],
      sentDeliveryQuoteIds: new Set(["quote-sent-attempt"])
    })).toBe("sent");
  });

  it("does not treat a pending delivery attempt as sent", () => {
    expect(calendarQuoteStatus({
      quotes: [quote({ id: "quote-pending" })],
      sentDeliveryQuoteIds: []
    })).toBe("unsent");
  });

  it("lets any sent live quote label the job sent", () => {
    expect(calendarQuoteStatus({
      quotes: [
        quote({ id: "draft" }),
        quote({ id: "sent-copy", sent_at: "2026-08-13T19:00:00.000Z" })
      ],
      sentDeliveryQuoteIds: []
    })).toBe("sent");
    expect(calendarQuoteStatus({
      quotes: [quote({ id: "draft" }), quote({ id: "attempt" })],
      sentDeliveryQuoteIds: ["attempt"]
    })).toBe("sent");
  });

  it("lets sold override a sent quote", () => {
    expect(calendarQuoteStatus({
      quotes: [quote({ status: "sold", sent_at: "2026-08-13T19:00:00.000Z", signed_at: "2026-08-13T20:00:00.000Z" })],
      sentDeliveryQuoteIds: new Set(["quote-1"])
    })).toBe("sold");
    expect(calendarQuoteStatus({
      quotes: [
        quote({ id: "still-draft" }),
        quote({ id: "won", status: "ordered", sent_at: "2026-08-13T19:00:00.000Z" })
      ],
      sentDeliveryQuoteIds: []
    })).toBe("sold");
  });

  it("keeps the existing sold signals ahead of send state", () => {
    expect(calendarQuoteStatus({
      quoteSignedAt: "2026-08-13T19:00:00.000Z",
      quotes: [quote({ sent_at: "2026-08-13T18:00:00.000Z" })],
      sentDeliveryQuoteIds: []
    })).toBe("sold");
    expect(calendarQuoteStatus({
      contractSignedAt: "2026-08-13T19:00:00.000Z",
      quotes: [quote()],
      sentDeliveryQuoteIds: []
    })).toBe("sold");
    expect(calendarQuoteStatus({
      jobStatus: "closed",
      quotes: [quote()],
      sentDeliveryQuoteIds: []
    })).toBe("sold");
    expect(calendarQuoteStatus({
      jobStatus: "quoted",
      quotes: [quote({ status: "approved" })],
      sentDeliveryQuoteIds: []
    })).toBe("sold");
  });

  it("does not label a block or a canceled appointment", () => {
    const soldQuote = quote({ status: "sold", signed_at: "2026-08-13T19:00:00.000Z" });
    expect(calendarQuoteStatus({ eventType: "block", quotes: [soldQuote], sentDeliveryQuoteIds: [] })).toBeNull();
    expect(calendarQuoteStatus({ eventStatus: "canceled", quotes: [soldQuote], contractSignedAt: "2026-08-13T19:00:00.000Z" })).toBeNull();
  });

  it("does not claim unsent when delivery evidence was not loaded", () => {
    expect(calendarQuoteStatus({ quotes: [quote()], sentDeliveryQuoteIds: null })).toBeNull();
    expect(calendarQuoteStatus({
      quotes: [quote({ sent_at: "2026-08-13T19:00:00.000Z" })],
      sentDeliveryQuoteIds: null
    })).toBe("sent");
  });
});

describe("calendarEventSalePresentation", () => {
  it("immediately marks a future appointment sold when its quote is signed", () => {
    expect(
      calendarEventSalePresentation(event({ quote_signed_at: "2026-08-13T19:00:00.000Z" }), now)
    ).toEqual({ tone: "sold", bannerLabel: "SOLD", quoteStatus: "sold" });
  });

  it("marks a linked signed customer contract sold", () => {
    expect(
      calendarEventSalePresentation(event({ customer_contract_signed_at: "2026-08-13T19:00:00.000Z" }), now)
    ).toEqual({ tone: "sold", bannerLabel: "SOLD", quoteStatus: "sold" });
  });

  it("keeps the sold banner after the linked job advances to ordered", () => {
    expect(calendarEventSalePresentation(event({ job_status: "ordered" }), now)).toEqual({
      tone: "sold",
      bannerLabel: "SOLD",
      quoteStatus: "sold"
    });
  });

  it("does not infer a sale from an open linked job", () => {
    expect(calendarEventSalePresentation(event({ job_status: "quoted" }), now)).toEqual({
      tone: null,
      bannerLabel: null,
      quoteStatus: null
    });
  });

  it("shows SENT on a future sent quote without the past follow-up color", () => {
    expect(
      calendarEventSalePresentation(event({ quote_sent_at: "2026-08-13T19:00:00.000Z" }), now)
    ).toEqual({ tone: null, bannerLabel: "SENT", quoteStatus: "sent" });
  });

  it("keeps the past follow-up color and shows SENT for a sent quote", () => {
    expect(
      calendarEventSalePresentation(
        event({
          start_at: "2026-08-12T17:00:00.000Z",
          end_at: "2026-08-12T18:00:00.000Z",
          quote_sent_at: "2026-08-12T19:00:00.000Z"
        }),
        now
      )
    ).toEqual({ tone: "unsold", bannerLabel: "SENT", quoteStatus: "sent" });
  });

  it("shows UNSENT from the enriched quote status", () => {
    expect(calendarEventSalePresentation(event({ quoteStatus: "unsent" }), now)).toEqual({
      tone: null,
      bannerLabel: "UNSENT",
      quoteStatus: "unsent"
    });
  });

  it("prefers the enriched quote status over the older sent timestamp", () => {
    expect(calendarEventSalePresentation(event({
      quoteStatus: "sold",
      quote_sent_at: "2026-08-13T19:00:00.000Z"
    }), now)).toEqual({ tone: "sold", bannerLabel: "SOLD", quoteStatus: "sold" });
  });

  it("does not label canceled appointments or calendar blocks sold", () => {
    const signedAt = "2026-08-13T19:00:00.000Z";
    expect(calendarEventSalePresentation(event({ status: "canceled", quote_signed_at: signedAt }), now)).toEqual({
      tone: null,
      bannerLabel: null,
      quoteStatus: null
    });
    expect(
      calendarEventSalePresentation(event({ event_type: "block", customer_contract_signed_at: signedAt }), now)
    ).toEqual({ tone: null, bannerLabel: null, quoteStatus: null });
  });
});
