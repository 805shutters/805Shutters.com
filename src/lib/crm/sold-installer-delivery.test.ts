import { describe, expect, it } from "vitest";
import { quoteRequiresInstallerDelivery } from "./sold-installer-delivery";

describe("sold quote installer-delivery invariant", () => {
  it("does not run for unsold pipeline states", () => {
    for (const status of ["draft", "sent", "lost", "archived"]) {
      expect(quoteRequiresInstallerDelivery({ id: "quote-1", status })).toBe(false);
    }
  });

  it("queues every recorded sale, including one marked sold without a stored signature", () => {
    for (const status of ["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"]) {
      expect(quoteRequiresInstallerDelivery({ id: "quote-1", status, signed_at: "2026-08-22T12:00:00.000Z" })).toBe(true);
      expect(quoteRequiresInstallerDelivery({ id: "quote-1", status, signed_at: null })).toBe(true);
    }
    expect(quoteRequiresInstallerDelivery({ id: "quote-1", status: "sent", signed_at: "2026-08-22T12:00:00.000Z" })).toBe(false);
    expect(quoteRequiresInstallerDelivery({ id: "quote-1", status: "archived", signed_at: "2026-08-22T12:00:00.000Z" })).toBe(false);
    expect(quoteRequiresInstallerDelivery({ id: "quote-1", status: "lost", signed_at: "2026-08-22T12:00:00.000Z" })).toBe(false);
  });

  it("defers partial sale candidates to durable DB eligibility", () => {
    expect(quoteRequiresInstallerDelivery({ id: "quote-1", status: "paid" })).toBe(true);
  });

  it("keeps historical and fixture records out while shop-notification flags do not suppress the packet", () => {
    const sold = { id: "quote-1", status: "sold", signed_at: "2026-08-22T12:00:00.000Z" };
    expect(quoteRequiresInstallerDelivery({ ...sold, archived_at: "2026-09-15T00:00:00Z" })).toBe(false);
    expect(quoteRequiresInstallerDelivery({ ...sold, meta: { historical_recordkeeping_only: true } })).toBe(false);
    expect(quoteRequiresInstallerDelivery({ ...sold, meta: { no_external_notification: true } })).toBe(true);
    expect(quoteRequiresInstallerDelivery({ ...sold, meta: { no_installer_form: true } })).toBe(true);
    expect(quoteRequiresInstallerDelivery({ ...sold, external_source: "mts_805_bookkeeping" })).toBe(true);
    expect(quoteRequiresInstallerDelivery({ ...sold, customer_name: "Test Customer" })).toBe(false);
  });
});
