import { describe, expect, it } from "vitest";
import {
  dashboardTodayDate,
  excludeDeletedSalesQuotes,
  filterCalendarAppointmentsForStatsTile,
  filterOrderPanelQuotesForStatsTile,
  filterQuotesForStatsTile,
  getQuoteStatsStatus,
  type QuoteStatsSource,
} from "./quoteDashboardFilters";
import type { SalesQuote } from "@mts/types/quote";

function quote(overrides: Partial<SalesQuote>): SalesQuote {
  return {
    id: overrides.id || "quote-1",
    status: overrides.status || "sent",
    appointment_date: overrides.appointment_date ?? null,
    signed_at: overrides.signed_at ?? null,
    customer_signature: overrides.customer_signature ?? null,
    ...overrides,
  } as SalesQuote;
}

describe("quote dashboard stats filters", () => {
  it("hides soft-deleted sales quotes from the dashboard", () => {
    const active = quote({ id: "active", deleted_at: null });
    const deleted = quote({
      id: "deleted",
      deleted_at: "2026-08-09T22:00:00.000Z",
    });

    expect(excludeDeletedSalesQuotes([active, deleted]).map((item) => item.id)).toEqual([
      "active",
    ]);
  });

  it("treats signed draft or sent quotes as sold for stats", () => {
    expect(
      getQuoteStatsStatus(
        quote({ id: "signed-sent", status: "sent", signed_at: "2026-07-02T18:00:00.000Z" })
      )
    ).toBe("sold");
    expect(
      getQuoteStatsStatus(
        quote({ id: "signed-draft", status: "draft", customer_signature: "Customer" })
      )
    ).toBe("sold");
  });

  it("preserves quotes that have moved past sold or been archived", () => {
    expect(
      getQuoteStatsStatus(
        quote({ id: "ordered", status: "ordered", signed_at: "2026-07-02T18:00:00.000Z" })
      )
    ).toBe("ordered");
    expect(
      getQuoteStatsStatus(
        quote({ id: "archived", status: "archived", signed_at: "2026-07-02T18:00:00.000Z" })
      )
    ).toBe("archived");
  });

  it("uses lifecycle timestamps when the stored status is stale", () => {
    expect(
      getQuoteStatsStatus(
        quote({ id: "sent-at", status: "draft", sent_at: "2026-07-01T18:00:00.000Z" })
      )
    ).toBe("sent");
    expect(
      getQuoteStatsStatus(
        quote({ id: "ordered-at", status: "sent", ordered_at: "2026-07-03T18:00:00.000Z" })
      )
    ).toBe("ordered");
    expect(
      getQuoteStatsStatus(
        quote({
          id: "received-at",
          status: "sold",
          signed_at: "2026-07-02T18:00:00.000Z",
          received_at: "2026-07-04T18:00:00.000Z",
        })
      )
    ).toBe("received");
    expect(
      getQuoteStatsStatus(
        quote({
          id: "installed-at",
          status: "sold",
          signed_at: "2026-07-02T18:00:00.000Z",
          ordered_at: "2026-07-03T18:00:00.000Z",
          installed_at: "2026-07-05T18:00:00.000Z",
        })
      )
    ).toBe("installed");
  });

  it("includes signed sent quotes when the Sold tile is clicked", () => {
    const signedSent = quote({
      id: "signed-sent",
      status: "sent",
      signed_at: "2026-07-02T18:00:00.000Z",
    });
    const unsignedSent = quote({ id: "unsigned-sent", status: "sent" });

    expect(filterQuotesForStatsTile([signedSent, unsignedSent], "sold").map((item) => item.id)).toEqual([
      "signed-sent",
    ]);
    expect(filterQuotesForStatsTile([signedSent, unsignedSent], "sent").map((item) => item.id)).toEqual([
      "unsigned-sent",
    ]);
  });

  it("does not keep signed sent quotes in upcoming", () => {
    const signedFuture = quote({
      id: "signed-future",
      status: "sent",
      signed_at: "2026-07-02T18:00:00.000Z",
      appointment_date: "2099-01-01",
    });
    const unsignedFuture = quote({
      id: "unsigned-future",
      status: "sent",
      appointment_date: "2099-01-01",
    });

    expect(filterQuotesForStatsTile([signedFuture, unsignedFuture], "upcoming").map((item) => item.id)).toEqual([
      "unsigned-future",
    ]);
  });

  it("keeps timestamp-archived quotes out of date tiles", () => {
    const today = dashboardTodayDate();
    const archivedToday = quote({
      id: "archived-today",
      status: "sent",
      appointment_date: today,
      archived_at: "2026-07-05T18:00:00.000Z",
    });

    expect(filterQuotesForStatsTile([archivedToday], "today")).toEqual([]);
  });

  it("filters timestamp-derived lifecycle rows into the matching status tile", () => {
    const staleOrdered = quote({
      id: "stale-ordered",
      status: "sent",
      ordered_at: "2026-07-03T18:00:00.000Z",
    });
    const staleInstalled = quote({
      id: "stale-installed",
      status: "sold",
      installed_at: "2026-07-05T18:00:00.000Z",
    });

    expect(filterQuotesForStatsTile([staleOrdered, staleInstalled], "ordered").map((item) => item.id)).toEqual([
      "stale-ordered",
    ]);
    expect(filterQuotesForStatsTile([staleOrdered, staleInstalled], "installed").map((item) => item.id)).toEqual([
      "stale-installed",
    ]);
  });

  it("maps CRM quote statuses into quote builder lifecycle tiles", () => {
    expect(getQuoteStatsStatus({ id: "approved", status: "approved" })).toBe("sold");
    expect(getQuoteStatsStatus({ id: "ordered", live_status: "ordered" })).toBe("ordered");
    expect(getQuoteStatsStatus({ id: "invoiced", status: "invoiced" })).toBe("installed");
    expect(getQuoteStatsStatus({ id: "paid", status: "paid" })).toBe("installed");
    expect(getQuoteStatsStatus({ id: "closed", live_status: "closed" })).toBe("installed");
  });

  it("filters CRM-derived rows into their normalized lifecycle tiles", () => {
    const rows: QuoteStatsSource[] = [
      { id: "crm-approved", status: "approved" },
      { id: "crm-ordered", live_status: "ordered" },
      { id: "crm-paid", status: "paid" },
    ];

    expect(filterQuotesForStatsTile(rows, "sold").map((item) => item.id)).toEqual([
      "crm-approved",
    ]);
    expect(filterQuotesForStatsTile(rows, "ordered").map((item) => item.id)).toEqual([
      "crm-ordered",
    ]);
    expect(filterQuotesForStatsTile(rows, "installed").map((item) => item.id)).toEqual([
      "crm-paid",
    ]);
  });

  it("matches calendar appointments through source sales quote ids", () => {
    const today = dashboardTodayDate();
    const row: QuoteStatsSource = {
      id: "crm-row",
      sourceQuoteId: "sales-row",
      status: "sent",
    };

    expect(
      filterQuotesForStatsTile([row], "today", [
        { id: "appointment", quote_id: "sales-row", appointment_date: today, status: "scheduled" },
      ]).map((item) => item.id)
    ).toEqual(["crm-row"]);
  });

  it("keeps calendar-only appointments visible without double-counting quote-linked appointments", () => {
    const future = "2099-01-01";
    const linkedQuote = quote({ id: "quote-linked", status: "sent" });
    const appointments = [
      { id: "calendar-only", quote_id: null, appointment_date: future, status: "scheduled" },
      { id: "linked-calendar", quote_id: "quote-linked", appointment_date: future, status: "scheduled" },
      { id: "canceled-calendar", quote_id: null, appointment_date: future, status: "canceled" },
    ];

    expect(filterQuotesForStatsTile([linkedQuote], "upcoming", appointments).map((item) => item.id)).toEqual([
      "quote-linked",
    ]);
    expect(
      filterCalendarAppointmentsForStatsTile(appointments, "upcoming", new Set(["quote-linked"])).map(
        (item) => item.id
      )
    ).toEqual(["calendar-only"]);
  });

  it("applies the selected stats tile to the order-status panel", () => {
    const orderRows = [
      { id: "sold-visible", status: "sold" },
      { id: "ordered-hidden", status: "ordered" },
    ];

    expect(
      filterOrderPanelQuotesForStatsTile(orderRows, "sold", new Set(["sold-visible"]))
        .map((item) => item.id)
    ).toEqual(["sold-visible"]);
    expect(
      filterOrderPanelQuotesForStatsTile(orderRows, "draft", new Set())
    ).toEqual([]);
    expect(
      filterOrderPanelQuotesForStatsTile(orderRows, "installed", new Set(["sold-visible"]))
    ).toEqual([]);
    expect(
      filterOrderPanelQuotesForStatsTile(orderRows, "all", new Set())
    ).toEqual(orderRows);
  });
});
