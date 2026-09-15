import { describe, expect, it } from "vitest";
import { quoteRequiresInstallerDelivery } from "./sold-installer-delivery";

describe("sold quote installer-delivery invariant", () => {
  it("does not run for unsold pipeline states", () => {
    for (const status of ["draft", "sent", "lost", "archived"]) {
      expect(quoteRequiresInstallerDelivery({ id: "quote-1", status })).toBe(false);
    }
  });

  it("requires both a recorded sale state and persisted signature proof", () => {
    for (const status of ["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"]) {
      expect(quoteRequiresInstallerDelivery({ id: "quote-1", status, signed_at: "2026-08-22T12:00:00.000Z" })).toBe(true);
      expect(quoteRequiresInstallerDelivery({ id: "quote-1", status, signed_at: null })).toBe(false);
    }
    expect(quoteRequiresInstallerDelivery({ id: "quote-1", status: "sent", signed_at: "2026-08-22T12:00:00.000Z" })).toBe(false);
    expect(quoteRequiresInstallerDelivery({ id: "quote-1", status: "archived", signed_at: "2026-08-22T12:00:00.000Z" })).toBe(false);
  });

  it("defers partial sale candidates to durable DB eligibility", () => {
    expect(quoteRequiresInstallerDelivery({ id: "quote-1", status: "paid" })).toBe(true);
  });

  it("allows native sales mirrors while excluding explicit suppression and fixtures", () => {
    const sold = { id: "quote-1", status: "sold", signed_at: "2026-08-22T12:00:00.000Z" };
    expect(quoteRequiresInstallerDelivery({ ...sold, archived_at: "2026-09-15T00:00:00Z" })).toBe(false);
    expect(quoteRequiresInstallerDelivery({ ...sold, meta: { historical_recordkeeping_only: true } })).toBe(false);
    expect(quoteRequiresInstallerDelivery({ ...sold, meta: { no_external_notification: true } })).toBe(false);
    expect(quoteRequiresInstallerDelivery({ ...sold, external_source: "mts_805_bookkeeping" })).toBe(true);
    expect(quoteRequiresInstallerDelivery({ ...sold, customer_name: "Test Customer" })).toBe(false);
  });
});
