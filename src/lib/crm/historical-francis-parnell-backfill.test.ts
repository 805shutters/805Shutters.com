import { describe, expect, it } from "vitest";
import { FRANCIS_PARNELL_BACKFILL } from "./historical-francis-parnell-backfill";

describe("Francis Parnell historical recordkeeping guard", () => {
  it("is pinned to the one authorized sold source and exact financial result", () => {
    expect(FRANCIS_PARNELL_BACKFILL).toEqual({
      mode: "historical_recordkeeping_only",
      quoteNumber: "805-0180",
      customerName: "Francis Parnell",
      customerPhone: "8054826677",
      customerAddress: "1422 Torero Drive, Oxnard",
      total: 814,
      deposit: 407,
      balance: 407,
      soldDate: "2026-04-28",
      completedDate: "2026-06-28",
    });
  });

  it("contains no operational or notification dependency", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./historical-francis-parnell-backfill.ts", import.meta.url), "utf8"),
    );
    expect(source).not.toContain("createAndSendInstallerForm");
    expect(source).not.toContain("sendSoldQuoteSmsNotifications");
    expect(source).not.toContain("crm_calendar_events");
    expect(source).not.toContain("sendQuoteToCustomer");
    expect(source).not.toContain("partner_payments");
    expect(source).toContain("ken_cut_override: null");
  });
});
