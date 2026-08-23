import { describe, expect, it } from "vitest";
import { quoteRequiresInstallerDelivery } from "./sold-installer-delivery";

describe("sold quote installer-delivery invariant", () => {
  it("does not run for unsold pipeline states", () => {
    for (const status of ["draft", "sent", "lost", "archived"]) {
      expect(quoteRequiresInstallerDelivery({ id: "quote-1", status })).toBe(false);
    }
  });

  it("runs for every persisted sale lifecycle status", () => {
    for (const status of ["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"]) {
      expect(quoteRequiresInstallerDelivery({ id: "quote-1", status })).toBe(true);
    }
  });

  it("runs for signed or sold records even when a legacy status is stale", () => {
    expect(quoteRequiresInstallerDelivery({
      id: "quote-1",
      status: "sent",
      signed_at: "2026-08-22T12:00:00.000Z",
    })).toBe(true);
    expect(quoteRequiresInstallerDelivery({
      id: "quote-1",
      status: "draft",
      sold_at: "2026-08-22T12:00:00.000Z",
    })).toBe(true);
  });
});
