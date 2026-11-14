import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MULTI_ORDER_RECEIVED_AT, NORMAN_SHIP_DATE, SHIPPING_VENDOR_GMAIL_TERMS, SHIPPED_DATE_STATUS_POLICY, shippedDateWritesEnabled } from "./shipped-date-config";
import {
  appendManufacturerOrderRef,
  matchNoticeLine,
  normanShipDate,
  pacificCalendarDate,
  pacificNoonIso,
  quoteWritePlan,
  settleShippingNoticeDates,
  splitOrderRefs,
  type BookkeepingCandidate,
  type NoticeRow,
  type QuoteCandidate,
  type ReviewRow,
  type ShippedDateStore,
} from "./shipped-date-reader";
import { extractShippingNotice, shippingOrderReferences } from "./shipping-email";

const fixtures = join(process.cwd(), "src/lib/crm/fixtures/shipping-notices");
const quote470 = "cff60010-ab26-40d9-a7aa-c09f83a29834";

function loadFixture(name: string) {
  const raw = readFileSync(join(fixtures, name), "utf8");
  const headerBlock = raw.startsWith("<!--") ? raw.slice(4, raw.indexOf("-->")) : raw.split(/===== TEXT BODY/)[0];
  const headers = Object.fromEntries([...headerBlock.matchAll(/^(From|To|Subject|Date):\s*(.*)$/gm)].map(match => [match[1], match[2].trim()]));
  const body = raw.includes("===== TEXT BODY")
    ? raw.split(/===== TEXT BODY[^\n]*\n/).slice(1).join("\n")
    : raw.slice(raw.indexOf("-->") + 3);
  return { from: headers.From || "", to: headers.To || "", subject: headers.Subject || "", date: headers.Date || "", body };
}

function noticeFrom(name: string) {
  const fixture = loadFixture(name);
  const notice = extractShippingNotice(fixture.subject, fixture.body, fixture.from);
  if (!notice) throw new Error(`${name} was not recognized as a shipping notice`);
  return { fixture, notice };
}

class MemoryStore implements ShippedDateStore {
  quotes: QuoteCandidate[] = [];
  books: BookkeepingCandidate[] = [];
  notices: NoticeRow[] = [];
  reviews: ReviewRow[] = [];
  writes: Array<{ id: string; receivedAt: string; ref: string }> = [];
  corruptStatus = false;

  async findQuoteCandidates(orderRef: string, purchaseOrder: string | null) {
    return this.quotes.filter(quote => {
      const refHit = Boolean(orderRef) && (quote.manufacturerOrderRef || "").toLowerCase().includes(orderRef.toLowerCase());
      return refHit || quote.quoteNumber === (purchaseOrder?.trim() || "\u0000");
    });
  }

  async findBookkeeping(orderRef: string) {
    return this.books.filter(entry => (entry.manufacturerOrderRef || "").toLowerCase().includes(orderRef.toLowerCase()));
  }

  async upsertNotice(notice: NoticeRow) {
    const index = this.notices.findIndex(row => row.manufacturer === notice.manufacturer && row.orderRef.toLowerCase() === notice.orderRef.toLowerCase());
    if (index < 0) {
      this.notices.push(notice);
      return;
    }
    const existing = this.notices[index];
    if (existing.shipDate && existing.gmailMessageId !== notice.gmailMessageId && existing.shipDate >= notice.shipDate) return;
    this.notices[index] = notice;
  }

  async listNotices(orderRefs: string[]) {
    return this.notices
      .filter(row => orderRefs.some(ref => ref.toLowerCase() === row.orderRef.toLowerCase()))
      .map(row => ({ manufacturer: row.manufacturer, orderRef: row.orderRef, shipDate: row.shipDate, poNumber: row.poNumber }));
  }

  async upsertReview(row: ReviewRow) {
    const index = this.reviews.findIndex(item => item.dedupeKey === row.dedupeKey);
    if (index >= 0) this.reviews[index] = row;
    else this.reviews.push(row);
  }

  async resolveQuoteReviews(quoteId: string, options?: { proposals?: boolean }) {
    for (const row of this.reviews) {
      if (row.quoteId !== quoteId) continue;
      if (row.reason === "partial" && row.status === "open") row.status = "resolved";
      if (options?.proposals !== false && row.reason === "proposed_write" && row.status === "logged") row.status = "applied";
    }
  }

  async writeQuote(quote: QuoteCandidate, receivedAt: string, manufacturerOrderRef: string) {
    this.writes.push({ id: quote.id, receivedAt, ref: manufacturerOrderRef });
    const stored = this.quotes.find(item => item.id === quote.id);
    if (!stored) throw new Error("missing quote");
    stored.receivedAt = receivedAt;
    stored.manufacturerOrderRef = manufacturerOrderRef;
    return { ...stored, status: this.corruptStatus ? "received" : stored.status };
  }
}

function quote(patch: Partial<QuoteCandidate> & Pick<QuoteCandidate, "id">): QuoteCandidate {
  return { quoteNumber: null, status: "paid", manufacturerOrderRef: null, receivedAt: null, ...patch };
}

describe("shipping notice parsers", () => {
  it("reads every Norman fixture without inventing a ship date, including the 805-0233 PO", () => {
    for (const name of ["norman-2026-10-13-PO-805-0233.txt", "norman-2026-10-20-WO8820009934.txt", "norman-2026-10-24-WO8880990296.txt"]) {
      const { fixture, notice } = noticeFrom(name);
      expect(notice.manufacturer).toBe("Norman");
      expect(notice.shippedOn).toBeNull();
      expect(notice.references).toHaveLength(1);
      expect(fixture.subject).toContain(notice.references[0]);
      expect(fixture.to).toContain("805shutters@gmail.com");
      expect(fixture.to).toContain("mtsinstallations@gmail.com");
    }
    const paul = noticeFrom("norman-2026-10-13-PO-805-0233.txt").notice;
    expect(paul).toMatchObject({ references: ["8880988962"], purchaseOrder: "805-0233", carrier: "FDX IPD" });
    expect(paul.trackingNumber?.startsWith("547464861339")).toBe(true);
    expect(normanShipDate("2026-10-13T08:31:12Z")).toBe("2026-10-13");
  });

  it("reads Onyx text and HTML, including several orders and X-prefix parts, without giving those parts to the milestone list", () => {
    const multi = noticeFrom("onyx-2026-11-10-multi-wcbot.txt");
    expect(multi.fixture.to).toContain("wcbot@mail.grokbot.com");
    expect(multi.notice).toMatchObject({ manufacturer: "Onyx", shippedOn: "2026-11-10", carrier: "UCFS", trackingNumber: "7VWQg25k" });
    expect(multi.notice.references).toEqual([
      "52608251244", "52609191394", "52609291445", "52609291448", "52609301460", "52609301462", "52610041480", "52610081490",
    ]);
    expect(multi.notice.references).not.toContain("X2610230155");
    expect(shippingOrderReferences(multi.notice)).toContain("X2610230155");
    const html = noticeFrom("onyx-2026-11-10-multi-wcbot.html").notice;
    expect(html.references).toEqual(multi.notice.references);
    expect(shippingOrderReferences(html)).toEqual(shippingOrderReferences(multi.notice));
    const single = noticeFrom("onyx-2026-11-12-single-wcbot.txt").notice;
    expect(single).toMatchObject({ references: ["52610301603"], shippedOn: "2026-11-12", trackingNumber: "714168" });
    expect(single.orderReferences).toBeUndefined();
    const parts = noticeFrom("onyx-2026-09-16-Xprefix.txt").notice;
    expect(parts.references).toEqual([]);
    expect(shippingOrderReferences(parts)).toEqual(["X2609030118", "X2609030119"]);
    expect(parts.shippedOn).toBe("2026-09-16");
  });

  it("reads the Lotus 805-0470 notice, including its HTML, and leaves a freight-only hold off the unshipped flag", () => {
    for (const name of ["lotus-2026-10-28-805-0470.txt", "lotus-2026-10-28-805-0470.html"]) {
      const { notice } = noticeFrom(name);
      expect(notice).toMatchObject({
        manufacturer: "Lotus",
        references: ["SO312356"],
        purchaseOrder: "805-0470",
        shippedOn: "2026-10-28",
        carrier: "Affordable Freight",
        trackingNumber: "712255",
      });
      expect(notice.lotusUnshippedProducts).toBeUndefined();
    }
    expect(noticeFrom("lotus-2026-07-31-18289.txt").notice).toMatchObject({
      references: ["SO287277"], purchaseOrder: "#18289", shippedOn: "2026-07-31",
    });
    expect(noticeFrom("lotus-2026-08-18-Lior.txt").notice).toMatchObject({
      references: ["SO292663"], purchaseOrder: "Lior", shippedOn: "2026-08-18",
    });
  });

  it("ignores order confirmations, forwards, wcbot, Sundance, and the alternate Norman subject", () => {
    expect(extractShippingNotice("Online Order Confirmation", "WO# 8880986311 has shipped", "NoReply@normanusa.com")).toBeNull();
    expect(extractShippingNotice("Your Order Has Shipped! - WO# 8800220730 | PO#: Meadow view 2", "WO# 8800220730", "NoReply@normanusa.com")).toBeNull();
    expect(extractShippingNotice("Fwd: Onyx Shipping Notice", "Order No. 52610301603 SHIP OUT AT 11/12/2026", "805 Shutters <805@805shutters.com>")).toBeNull();
    expect(extractShippingNotice("Onyx Shipping Notice", "Order No. 52610301603 SHIP OUT AT 11/12/2026", "wcbot@mail.grokbot.com")).toBeNull();
    expect(extractShippingNotice("Your order has shipped", "SO1", "orders@sundanceshutters.com")).toBeNull();
    expect(extractShippingNotice("Lotus Blind Order Fulfillment Notification – 805-0470", "On 10/28/2026, your Order # SO1, Your Purchase Order # 805-0470 was shipped.", "someone@example.com")).toBeNull();
  });

  it("sends a Lotus notice to review when a real product is still unshipped", () => {
    const notice = extractShippingNotice(
      "Lotus Blind Order Fulfillment Notification – 805-0470",
      "On 10/28/2026, your Order # SO312356, Your Purchase Order # 805-0470 was shipped. The following items have not shipped yet: CVS7884W Custom Vertical Blind 1 EA Thank you for your order!",
      "Orders Lotus <system@sent-via.netsuite.com>",
    );
    expect(notice?.lotusUnshippedProducts).toBe(true);
  });
});

describe("quote matching", () => {
  const paul = quote({ id: "paul", quoteNumber: "805-0233", manufacturerOrderRef: null });
  const padded = quote({ id: "padded", quoteNumber: "805-0257", manufacturerOrderRef: "52609031298" });
  const duplicateA = quote({ id: "dup-a", quoteNumber: "805-0078" });
  const duplicateB = quote({ id: "dup-b", quoteNumber: "805-0078" });

  it("matches an order-ref token or an exact quote number, and nothing else", () => {
    expect(matchNoticeLine("8880988962", "805-0233", [paul], []).kind).toBe("unique");
    expect(matchNoticeLine("8880988962", "Jason Chappelle", [quote({ id: "named", quoteNumber: "805-0119", manufacturerOrderRef: "8880988962" })], [])).toMatchObject({ kind: "unique", via: "order_ref" });
    expect(matchNoticeLine("52609031298", "805-0257", [padded], [])).toMatchObject({ kind: "unique", quote: padded });
    expect(matchNoticeLine("52609031298", "805-257", [padded], [])).toMatchObject({ kind: "unique", via: "order_ref" });
    expect(matchNoticeLine("SO999", "805-257", [padded], [])).toEqual({ kind: "none" });
    expect(matchNoticeLine("SO999", "805-0257", [padded], [])).toMatchObject({ kind: "unique", via: "po" });
    expect(matchNoticeLine("8880988962", "805 Shutters", [quote({ id: "longer", manufacturerOrderRef: "88809889620", quoteNumber: "805-0999" })], [])).toEqual({ kind: "none" });
  });

  it("treats duplicate quote numbers as multiple and bookkeeping-only hits as review", () => {
    expect(matchNoticeLine("SO1", "805-0078", [duplicateA, duplicateB], [])).toMatchObject({ kind: "multiple" });
    const entry = { id: "bk-1", quoteId: "installed-quote", manufacturerOrderRef: "8800221062" };
    expect(matchNoticeLine("8800221062", "Limon, Gladys", [quote({ id: "installed-quote", quoteNumber: "805-0028", status: "installed" })], [entry])).toEqual({
      kind: "bookkeeping_only",
      entries: [entry],
    });
    expect(matchNoticeLine("8800221062", "805-0028", [quote({ id: "installed-quote", quoteNumber: "805-0028" })], [entry])).toMatchObject({ kind: "unique", via: "po" });
  });

  it("appends a missing order number and keeps the existing list", () => {
    expect(appendManufacturerOrderRef(null, "SO312356")).toBe("SO312356");
    expect(appendManufacturerOrderRef("52609101336, 8880986504", "SO312356")).toBe("52609101336, 8880986504, SO312356");
    expect(appendManufacturerOrderRef("SO312356", "so312356")).toBe("SO312356");
    expect(splitOrderRefs("8880979010, 8880979012")).toEqual(["8880979010", "8880979012"]);
  });

  it("holds a quote until every order already on it has a notice, then uses the latest date", () => {
    const partial = quote({ id: "q", manufacturerOrderRef: "8880979010, 8880979012" });
    expect(quoteWritePlan(partial, [{ reference: "8880979012", shipDate: "2026-07-31" }], [])).toEqual({
      action: "partial",
      missing: ["8880979010"],
    });
    expect(quoteWritePlan(partial, [{ reference: "8880979012", shipDate: "2026-07-31" }], [
      { manufacturer: "Norman", orderRef: "8880979010", shipDate: "2026-08-02", poNumber: null },
    ])).toMatchObject({ action: "write", receivedAt: "2026-08-02", manufacturerOrderRef: "8880979010, 8880979012" });
    expect(quoteWritePlan(partial, [{ reference: "8880979012", shipDate: "2026-07-31" }], [
      { manufacturer: "Norman", orderRef: "8880979010", shipDate: "2026-08-02", poNumber: null },
    ], "first_shipment").action).toBe("write");
  });
});

describe("shipped date settlement", () => {
  const source = { mailbox: "805@805shutters.com", messageId: "1a1838eae44cdf8e", sentAt: "2026-10-28T17:28:47Z" };

  it("proposes received_at 2026-10-28 and manufacturer_order_ref SO312356 for Lotus 805-0470", async () => {
    const { notice } = noticeFrom("lotus-2026-10-28-805-0470.txt");
    const store = new MemoryStore();
    store.quotes.push(quote({ id: quote470, quoteNumber: "805-0470", status: "paid" }));
    const logged = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const held = await settleShippingNoticeDates(store, notice, source, { writesEnabled: false });
    expect(held.writesEnabled).toBe(false);
    expect(store.writes).toHaveLength(0);
    expect(store.quotes[0]).toMatchObject({ receivedAt: null, manufacturerOrderRef: null, status: "paid" });
    expect(held.outcomes[0]).toMatchObject({
      action: "proposed",
      reference: "SO312356",
      proposedReceivedAt: "2026-10-28",
      proposedManufacturerOrderRef: "SO312356",
      quoteId: quote470,
    });
    expect(logged.mock.calls.some(call => String(call[0]).includes("proposed-write"))).toBe(true);
    logged.mockRestore();

    const applied = await settleShippingNoticeDates(store, notice, source, { writesEnabled: true });
    expect(applied.outcomes[0]).toMatchObject({ action: "wrote", proposedReceivedAt: "2026-10-28", proposedManufacturerOrderRef: "SO312356" });
    expect(store.quotes[0].status).toBe("paid");
    expect(store.quotes[0].manufacturerOrderRef).toBe("SO312356");
    expect(pacificCalendarDate(store.quotes[0].receivedAt || "")).toBe("2026-10-28");
    expect(store.writes).toHaveLength(1);

    const again = await settleShippingNoticeDates(store, notice, { ...source, messageId: "same-notice-other-mailbox", mailbox: "805shutters@gmail.com" }, { writesEnabled: true });
    expect(again.outcomes[0].action).toBe("unchanged");
    expect(store.writes).toHaveLength(1);
    expect(store.notices).toHaveLength(1);
    expect(store.quotes[0].manufacturerOrderRef).toBe("SO312356");
  });

  it("does not write while the flag is off, and the default flag is off", () => {
    const previous = process.env.SHIPPED_DATE_WRITES_ENABLED;
    try {
      delete process.env.SHIPPED_DATE_WRITES_ENABLED;
      expect(shippedDateWritesEnabled()).toBe(false);
      process.env.SHIPPED_DATE_WRITES_ENABLED = "false";
      expect(shippedDateWritesEnabled()).toBe(false);
      process.env.SHIPPED_DATE_WRITES_ENABLED = "true";
      expect(shippedDateWritesEnabled()).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.SHIPPED_DATE_WRITES_ENABLED;
      else process.env.SHIPPED_DATE_WRITES_ENABLED = previous;
    }
    expect(NORMAN_SHIP_DATE).toBe("email_received_america_los_angeles");
    expect(MULTI_ORDER_RECEIVED_AT).toBe("latest_when_all_shipped");
    expect(SHIPPED_DATE_STATUS_POLICY).toBe("never");
  });

  it("dedupes the wcbot co-recipient by order number across the two 805 mailboxes", async () => {
    const { notice } = noticeFrom("onyx-2026-11-12-single-wcbot.txt");
    const store = new MemoryStore();
    store.quotes.push(quote({ id: "wolfe", quoteNumber: "805-0309", manufacturerOrderRef: "52610301603" }));
    const first = { mailbox: "805shutters@gmail.com", messageId: "gmail-copy-a", sentAt: "2026-11-12T22:03:17Z" };
    const second = { mailbox: "805@805shutters.com", messageId: "gmail-copy-b", sentAt: "2026-11-12T22:03:17Z" };
    await settleShippingNoticeDates(store, notice, first, { writesEnabled: true });
    await settleShippingNoticeDates(store, notice, second, { writesEnabled: true });
    expect(store.writes).toHaveLength(1);
    expect(store.notices).toHaveLength(1);
    expect(pacificCalendarDate(store.quotes[0].receivedAt || "")).toBe("2026-11-12");
    expect(store.quotes[0].manufacturerOrderRef).toBe("52610301603");
  });

  it("reviews no match, multiple quotes, bookkeeping-only, partial, and unshipped Lotus without writing", async () => {
    const store = new MemoryStore();
    store.quotes.push(
      quote({ id: "dup-a", quoteNumber: "805-0078" }),
      quote({ id: "dup-b", quoteNumber: "805-0078" }),
      quote({ id: "partial", manufacturerOrderRef: "8880979010, 8880979012" }),
      quote({ id: "book-quote", quoteNumber: "805-0028", status: "installed" }),
    );
    store.books.push({ id: "bk-1", quoteId: "book-quote", manufacturerOrderRef: "8800221062" });
    const norman = extractShippingNotice(
      "Shipping Notification: WO#8880979012 has shipped! PO#: Kim Uebelhardt",
      "WO# : 8880979012\nPO# : Kim Uebelhardt\nCarrier: FDX IPD\nTracking Number: 1",
      "Norman <NoReply@normanusa.com>",
    );
    await settleShippingNoticeDates(store, norman!, { mailbox: "805shutters@gmail.com", messageId: "partial-1", sentAt: "2026-07-31T08:31:00Z" }, { writesEnabled: true });
    expect(store.writes).toHaveLength(0);
    expect(store.reviews.some(row => row.reason === "partial" && row.status === "open")).toBe(true);
    expect(store.quotes.find(row => row.id === "partial")?.manufacturerOrderRef).toBe("8880979010, 8880979012");

    const book = extractShippingNotice(
      "Shipping Notification: WO#8800221062 has shipped! PO#: Gladys",
      "WO# : 8800221062\nPO# : Gladys\nCarrier: FDX IPD\nTracking Number: 1",
      "NoReply@normanusa.com",
    );
    await settleShippingNoticeDates(store, book!, { mailbox: "805shutters@gmail.com", messageId: "book-1", sentAt: "2026-09-18T08:31:00Z" }, { writesEnabled: true });
    expect(store.reviews.some(row => row.reason === "bookkeeping_only")).toBe(true);
    expect(store.quotes.find(row => row.id === "book-quote")?.receivedAt).toBeNull();

    const missing = extractShippingNotice(
      "Shipping Notification: WO#8820000001 has shipped! PO#: 805-257",
      "WO# : 8820000001\nPO# : 805-257",
      "NoReply@normanusa.com",
    );
    store.quotes.push(quote({ id: "exact", quoteNumber: "805-0257" }));
    await settleShippingNoticeDates(store, missing!, { mailbox: "805shutters@gmail.com", messageId: "none-1", sentAt: "2026-10-01T08:31:00Z" }, { writesEnabled: true });
    expect(store.reviews.some(row => row.reason === "no_match" && row.orderRef === "8820000001")).toBe(true);
    expect(store.quotes.find(row => row.id === "exact")?.receivedAt).toBeNull();

    const duplicate = extractShippingNotice(
      "Lotus Blind Order Fulfillment Notification – 805-0078",
      "On 10/01/2026, your Order # SO1, Your Purchase Order # 805-0078 was shipped. The following items have not shipped yet: FREIGHT Freight - FREIGHT CHARGE 1 EA",
      "system@sent-via.netsuite.com",
    );
    await settleShippingNoticeDates(store, duplicate!, { mailbox: "805@805shutters.com", messageId: "dup-1", sentAt: "2026-10-01T15:00:00Z" }, { writesEnabled: true });
    expect(store.reviews.some(row => row.reason === "multiple" && row.orderRef === "SO1")).toBe(true);

    const unshipped = extractShippingNotice(
      "Lotus Blind Order Fulfillment Notification – 805-0470",
      "On 10/28/2026, your Order # SO312356, Your Purchase Order # 805-0470 was shipped. The following items have not shipped yet: CVS7884W Custom Vertical 1 EA",
      "system@sent-via.netsuite.com",
    );
    await settleShippingNoticeDates(store, unshipped!, { mailbox: "805@805shutters.com", messageId: "hold-1", sentAt: "2026-10-28T17:28:47Z" }, { writesEnabled: true });
    expect(store.reviews.some(row => row.reason === "lotus_not_shipped")).toBe(true);
    expect(store.notices.some(row => row.orderRef === "SO312356")).toBe(false);
    expect(store.writes).toHaveLength(0);
  });

  it("refuses an MTS mailbox and a changed status on read-back", async () => {
    const { notice } = noticeFrom("lotus-2026-10-28-805-0470.txt");
    const store = new MemoryStore();
    store.quotes.push(quote({ id: quote470, quoteNumber: "805-0470" }));
    await settleShippingNoticeDates(store, notice, { mailbox: "mtsinstallations@gmail.com", messageId: "mts", sentAt: source.sentAt }, { writesEnabled: true });
    expect(store.writes).toHaveLength(0);
    expect(store.reviews).toHaveLength(0);
    store.corruptStatus = true;
    await expect(settleShippingNoticeDates(store, notice, source, { writesEnabled: true })).rejects.toThrow(/read-back/);
  });

  it("keeps a Pacific calendar date at noon and can move Norman back one day from the config", () => {
    expect(pacificCalendarDate(pacificNoonIso("2026-10-28"))).toBe("2026-10-28");
    expect(pacificNoonIso("2026-10-28").slice(0, 10)).toBe("2026-10-28");
    expect(pacificCalendarDate(pacificNoonIso("2026-01-15"))).toBe("2026-01-15");
    expect(pacificCalendarDate(pacificNoonIso("2026-07-15"))).toBe("2026-07-15");
    expect(normanShipDate("2026-10-13T08:31:12Z", "email_received_america_los_angeles_minus_one_day")).toBe("2026-10-12");
    expect(SHIPPING_VENDOR_GMAIL_TERMS).toContain("Lotus Blind Order Fulfillment Notification");
    expect(SHIPPING_VENDOR_GMAIL_TERMS).not.toContain("sundance");
    expect(SHIPPING_VENDOR_GMAIL_TERMS).not.toContain("mtsinstallations");
    expect(SHIPPING_VENDOR_GMAIL_TERMS).not.toContain("wcbot");
  });

  it("limits the quote write function to received_at and manufacturer_order_ref", () => {
    const sql = readFileSync("supabase/migrations/20261114200000_shipped_date_reader.sql", "utf8");
    const fn = sql.slice(sql.indexOf("create function public.apply_crm_quote_shipped_date"), sql.indexOf("revoke all on function public.apply_crm_quote_shipped_date"));
    expect(fn).toContain("received_at = p_received_at");
    expect(fn).toContain("manufacturer_order_ref = p_manufacturer_order_ref");
    expect(fn).toContain("crm.shipped_date_write");
    expect(fn.toLowerCase()).not.toContain("status");
    expect(sql).toContain("current_setting('crm.shipped_date_write', true) = 'on'");
    expect(sql).toContain("crm_shipping_review");
  });
});
