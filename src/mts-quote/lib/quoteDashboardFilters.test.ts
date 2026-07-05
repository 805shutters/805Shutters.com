import { describe, expect, it } from "vitest";
import { filterQuotesForStatsTile, getQuoteStatsStatus } from "./quoteDashboardFilters";
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
    const today = new Date().toISOString().split("T")[0];
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
});
