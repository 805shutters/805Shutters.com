import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MULTI_ORDER_RECEIVED_AT,
  NORMAN_SHIP_DATE,
  SHIPPED_DATE_MAILBOXES,
  SHIPPED_DATE_STATUS_POLICY,
  shippedDateWritesEnabled,
  type MultiOrderReceivedAt,
  type NormanShipDate,
} from "./shipped-date-config";
import { shippingOrderReferences, type ShippingNotice } from "./shipping-notice";

export type ShippedDateManufacturer = ShippingNotice["manufacturer"];

export type QuoteCandidate = {
  id: string;
  quoteNumber: string | null;
  status: string | null;
  manufacturerOrderRef: string | null;
  receivedAt: string | null;
};

export type BookkeepingCandidate = {
  id: string;
  quoteId: string | null;
  manufacturerOrderRef: string | null;
};

export type StoredNotice = {
  manufacturer: ShippedDateManufacturer;
  orderRef: string;
  shipDate: string | null;
  poNumber: string | null;
};

export type ReviewReason =
  | "no_match"
  | "multiple"
  | "bookkeeping_only"
  | "lotus_not_shipped"
  | "partial"
  | "no_ship_date"
  | "proposed_write";

export type ReviewRow = {
  dedupeKey: string;
  manufacturer: ShippedDateManufacturer | null;
  orderRef: string | null;
  poNumber: string | null;
  mailboxEmail: string | null;
  gmailMessageId: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  reason: ReviewReason;
  detail: string;
  proposedReceivedAt: string | null;
  proposedManufacturerOrderRef: string | null;
  status: "open" | "logged" | "resolved" | "applied";
};

export type NoticeRow = {
  manufacturer: ShippedDateManufacturer;
  orderRef: string;
  poNumber: string | null;
  shipDate: string;
  shipDateSource: NormanShipDate | "notice";
  mailboxEmail: string;
  gmailMessageId: string;
  sentAt: string | null;
};

export type ShippedDateStore = {
  findQuoteCandidates(orderRef: string, purchaseOrder: string | null): Promise<QuoteCandidate[]>;
  findBookkeeping(orderRef: string): Promise<BookkeepingCandidate[]>;
  upsertNotice(notice: NoticeRow): Promise<void>;
  listNotices(orderRefs: string[]): Promise<StoredNotice[]>;
  upsertReview(row: ReviewRow): Promise<void>;
  resolveQuoteReviews(quoteId: string, options?: { proposals?: boolean }): Promise<void>;
  /** Sets only received_at and manufacturer_order_ref, then reads the row back. */
  writeQuote(quote: QuoteCandidate, receivedAt: string, manufacturerOrderRef: string): Promise<QuoteCandidate>;
};

export type ShippedDateLineOutcome = {
  reference: string;
  action: "wrote" | "unchanged" | "proposed" | "review";
  reason: ReviewReason | "wrote" | "unchanged";
  quoteId: string | null;
  proposedReceivedAt: string | null;
  proposedManufacturerOrderRef: string | null;
};

export type ShippedDateSettlement = {
  writesEnabled: boolean;
  outcomes: ShippedDateLineOutcome[];
};

type NoticeLine = {
  reference: string;
  purchaseOrder: string | null;
  shipDate: string | null;
  shipDateSource: NoticeRow["shipDateSource"];
};

export function splitOrderRefs(value: string | null | undefined) {
  if (!value) return [];
  return value.split(",").map(part => part.trim()).filter(Boolean);
}

export function refsEqual(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function appendManufacturerOrderRef(current: string | null | undefined, orderRef: string) {
  const tokens = splitOrderRefs(current);
  if (tokens.some(token => refsEqual(token, orderRef))) return current ?? orderRef;
  if (!current || !current.trim()) return orderRef;
  return `${current.trim().replace(/,\s*$/, "")}, ${orderRef}`;
}

export function pacificCalendarDate(instant: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!year || !month || !day) throw new Error("Pacific ship date could not be read.");
  return `${year}-${month}-${day}`;
}

/** Noon Pacific, so the calendar date is the same in Pacific time and in UTC. */
export function pacificNoonIso(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error("Ship date must be YYYY-MM-DD.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcNoon));
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  const wall = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0) - (wall - utcNoon)).toISOString();
}

export function normanShipDate(sentAt: string, mode: NormanShipDate = NORMAN_SHIP_DATE) {
  const received = pacificCalendarDate(sentAt);
  if (mode === "email_received_america_los_angeles") return received;
  if (mode === "email_received_america_los_angeles_minus_one_day") {
    const [year, month, day] = received.split("-").map(Number);
    const prior = new Date(Date.UTC(year, month - 1, day));
    prior.setUTCDate(prior.getUTCDate() - 1);
    return prior.toISOString().slice(0, 10);
  }
  throw new Error(`Unknown NORMAN_SHIP_DATE: ${mode}`);
}

export type NoticeMatch =
  | { kind: "unique"; quote: QuoteCandidate; via: "order_ref" | "po" | "both" }
  | { kind: "none" }
  | { kind: "multiple"; quotes: QuoteCandidate[] }
  | { kind: "bookkeeping_only"; entries: BookkeepingCandidate[] };

/**
 * Match one notice line to crm_quotes by manufacturer order ref (comma-list token)
 * or by PO === quote_number, exact string. Names and addresses are not inputs.
 * A hit that exists only on a bookkeeping row is not a quote match.
 */
export function matchNoticeLine(
  orderRef: string,
  purchaseOrder: string | null,
  quotes: QuoteCandidate[],
  bookkeeping: BookkeepingCandidate[],
): NoticeMatch {
  const byRef = quotes.filter(quote => splitOrderRefs(quote.manufacturerOrderRef).some(token => refsEqual(token, orderRef)));
  const po = purchaseOrder?.trim() || "";
  const byPo = po ? quotes.filter(quote => quote.quoteNumber === po) : [];
  const seen = new Map<string, QuoteCandidate>();
  for (const quote of [...byRef, ...byPo]) seen.set(quote.id, quote);
  if (seen.size > 1) return { kind: "multiple", quotes: [...seen.values()] };
  if (seen.size === 1) {
    const quote = [...seen.values()][0];
    const via = byRef.some(item => item.id === quote.id) && byPo.some(item => item.id === quote.id)
      ? "both"
      : byRef.some(item => item.id === quote.id) ? "order_ref" : "po";
    return { kind: "unique", quote, via };
  }
  const entries = bookkeeping.filter(entry => splitOrderRefs(entry.manufacturerOrderRef).some(token => refsEqual(token, orderRef)));
  if (entries.length) return { kind: "bookkeeping_only", entries };
  return { kind: "none" };
}

export function quoteWritePlan(
  quote: QuoteCandidate,
  incoming: Array<{ reference: string; shipDate: string }>,
  notices: StoredNotice[],
  policy: MultiOrderReceivedAt = MULTI_ORDER_RECEIVED_AT,
) {
  if (policy !== "latest_when_all_shipped" && policy !== "first_shipment") {
    throw new Error(`Unknown MULTI_ORDER_RECEIVED_AT: ${policy}`);
  }
  const onQuote = splitOrderRefs(quote.manufacturerOrderRef);
  const dated = new Map<string, string>();
  for (const notice of notices) {
    if (!notice.shipDate) continue;
    const key = notice.orderRef.trim().toLowerCase();
    const prior = dated.get(key);
    if (!prior || notice.shipDate > prior) dated.set(key, notice.shipDate);
  }
  for (const line of incoming) {
    const key = line.reference.trim().toLowerCase();
    const prior = dated.get(key);
    if (!prior || line.shipDate > prior) dated.set(key, line.shipDate);
  }
  const missing = onQuote.filter(ref => !dated.has(ref.trim().toLowerCase()));
  if (policy === "latest_when_all_shipped" && missing.length) {
    return { action: "partial" as const, missing };
  }
  const dates = [...dated.values()];
  if (!dates.length) return { action: "partial" as const, missing: incoming.map(line => line.reference) };
  const receivedAt = dates.reduce((latest, date) => date > latest ? date : latest);
  let manufacturerOrderRef = quote.manufacturerOrderRef;
  for (const line of incoming) manufacturerOrderRef = appendManufacturerOrderRef(manufacturerOrderRef, line.reference);
  const refUnchanged = (manufacturerOrderRef ?? "") === (quote.manufacturerOrderRef ?? "");
  const dateUnchanged = Boolean(quote.receivedAt) && pacificCalendarDate(quote.receivedAt as string) === receivedAt;
  if (refUnchanged && dateUnchanged) {
    return { action: "unchanged" as const, receivedAt, manufacturerOrderRef: manufacturerOrderRef ?? "" };
  }
  return { action: "write" as const, receivedAt, manufacturerOrderRef: manufacturerOrderRef ?? incoming[0]?.reference ?? "" };
}

function noticeLines(notice: ShippingNotice, sentAt: string | null): NoticeLine[] {
  const purchaseOrder = notice.purchaseOrder?.trim() || null;
  if (notice.manufacturer === "Norman") {
    const shipDate = sentAt ? normanShipDate(sentAt) : null;
    return shippingOrderReferences(notice).map(reference => ({
      reference,
      purchaseOrder,
      shipDate,
      shipDateSource: NORMAN_SHIP_DATE,
    }));
  }
  return shippingOrderReferences(notice).map(reference => ({
    reference,
    purchaseOrder,
    shipDate: notice.shippedOn,
    shipDateSource: "notice" as const,
  }));
}

function logEvent(event: string, detail: Record<string, unknown>) {
  console.info(JSON.stringify({ source: "shipped-date-reader", event, ...detail }));
}

function allowedMailbox(mailbox: string) {
  return (SHIPPED_DATE_MAILBOXES as readonly string[]).includes(mailbox.trim().toLowerCase());
}

export async function settleShippingNoticeDates(
  db: SupabaseClient | ShippedDateStore,
  notice: ShippingNotice,
  source: { mailbox: string; messageId: string; sentAt: string | null },
  options: { writesEnabled?: boolean; store?: ShippedDateStore } = {},
): Promise<ShippedDateSettlement> {
  const writesEnabled = options.writesEnabled ?? shippedDateWritesEnabled();
  const store = options.store ?? ("findQuoteCandidates" in db ? db : createSupabaseShippedDateStore(db));
  if (SHIPPED_DATE_STATUS_POLICY !== "never") {
    throw new Error("SHIPPED_DATE_STATUS_POLICY is not \"never\"; the shipped-date reader will not change quote status.");
  }
  if (!allowedMailbox(source.mailbox)) {
    logEvent("mailbox-refused", { mailbox: source.mailbox, messageId: source.messageId });
    return { writesEnabled, outcomes: [] };
  }
  const outcomes: ShippedDateLineOutcome[] = [];
  if (notice.lotusUnshippedProducts) {
    for (const reference of shippingOrderReferences(notice)) {
      const row = reviewRow({
        reason: "lotus_not_shipped",
        manufacturer: notice.manufacturer,
        orderRef: reference,
        poNumber: notice.purchaseOrder ?? null,
        source,
        quote: null,
        detail: "Lotus listed product under \"not shipped yet\". Nothing was written.",
        proposedReceivedAt: null,
        proposedManufacturerOrderRef: null,
        status: "open",
      });
      await store.upsertReview(row);
      logEvent("review", { reason: row.reason, orderRef: reference, messageId: source.messageId });
      outcomes.push(outcomeFromReview(row));
    }
    return { writesEnabled, outcomes };
  }

  const lines = noticeLines(notice, source.sentAt);
  const ready: Array<{ line: NoticeLine; quote: QuoteCandidate }> = [];
  for (const line of lines) {
    if (!line.reference) continue;
    if (!line.shipDate) {
      const row = reviewRow({
        reason: "no_ship_date",
        manufacturer: notice.manufacturer,
        orderRef: line.reference,
        poNumber: line.purchaseOrder,
        source,
        quote: null,
        detail: "No ship date was available for this notice.",
        proposedReceivedAt: null,
        proposedManufacturerOrderRef: null,
        status: "open",
      });
      await store.upsertReview(row);
      outcomes.push(outcomeFromReview(row));
      continue;
    }
    await store.upsertNotice({
      manufacturer: notice.manufacturer,
      orderRef: line.reference,
      poNumber: line.purchaseOrder,
      shipDate: line.shipDate,
      shipDateSource: line.shipDateSource,
      mailboxEmail: source.mailbox,
      gmailMessageId: source.messageId,
      sentAt: source.sentAt,
    });
    const match = matchNoticeLine(
      line.reference,
      line.purchaseOrder,
      await store.findQuoteCandidates(line.reference, line.purchaseOrder),
      await store.findBookkeeping(line.reference),
    );
    if (match.kind === "unique") {
      ready.push({ line, quote: match.quote });
      continue;
    }
    const row = reviewForMatch(match, notice.manufacturer, line, source);
    await store.upsertReview(row);
    logEvent("review", { reason: row.reason, orderRef: line.reference, quoteIds: match.kind === "multiple" ? match.quotes.map(quote => quote.id) : undefined, messageId: source.messageId });
    outcomes.push(outcomeFromReview(row));
  }

  const byQuote = new Map<string, { quote: QuoteCandidate; lines: NoticeLine[] }>();
  for (const hit of ready) {
    const bucket = byQuote.get(hit.quote.id) ?? { quote: hit.quote, lines: [] };
    bucket.lines.push(hit.line);
    byQuote.set(hit.quote.id, bucket);
  }
  for (const { quote, lines: quoteLines } of byQuote.values()) {
    const refs = [...new Set([...splitOrderRefs(quote.manufacturerOrderRef), ...quoteLines.map(line => line.reference)])];
    const plan = quoteWritePlan(
      quote,
      quoteLines.flatMap(line => line.shipDate ? [{ reference: line.reference, shipDate: line.shipDate }] : []),
      await store.listNotices(refs),
    );
    if (plan.action === "partial") {
      const row = reviewRow({
        reason: "partial",
        manufacturer: notice.manufacturer,
        orderRef: quoteLines.map(line => line.reference).join(", "),
        poNumber: quoteLines[0]?.purchaseOrder ?? null,
        source,
        quote,
        detail: `Other order(s) on this quote have no shipping notice yet: ${plan.missing.join(", ")}. Nothing was written.`,
        proposedReceivedAt: null,
        proposedManufacturerOrderRef: null,
        status: "open",
      });
      await store.upsertReview(row);
      logEvent("review", { reason: "partial", quoteId: quote.id, quoteNumber: quote.quoteNumber, missing: plan.missing, messageId: source.messageId });
      for (const line of quoteLines) outcomes.push({ ...outcomeFromReview(row), reference: line.reference });
      continue;
    }
    const proposedRef = plan.manufacturerOrderRef;
    if (plan.action === "unchanged") {
      await store.resolveQuoteReviews(quote.id, { proposals: true });
      for (const line of quoteLines) {
        outcomes.push({
          reference: line.reference,
          action: "unchanged",
          reason: "unchanged",
          quoteId: quote.id,
          proposedReceivedAt: plan.receivedAt,
          proposedManufacturerOrderRef: proposedRef,
        });
      }
      continue;
    }
    if (!writesEnabled) {
      await store.resolveQuoteReviews(quote.id, { proposals: false });
      const row = reviewRow({
        reason: "proposed_write",
        manufacturer: notice.manufacturer,
        orderRef: quoteLines.map(line => line.reference).join(", "),
        poNumber: quoteLines[0]?.purchaseOrder ?? null,
        source,
        quote,
        detail: "SHIPPED_DATE_WRITES_ENABLED is off. The quote was not changed.",
        proposedReceivedAt: plan.receivedAt,
        proposedManufacturerOrderRef: proposedRef === (quote.manufacturerOrderRef ?? "") ? null : proposedRef,
        status: "logged",
      });
      await store.upsertReview(row);
      logEvent("proposed-write", {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        receivedAt: plan.receivedAt,
        manufacturerOrderRef: proposedRef,
        messageId: source.messageId,
      });
      for (const line of quoteLines) outcomes.push({ ...outcomeFromReview(row), reference: line.reference, action: "proposed" });
      continue;
    }
    const saved = await store.writeQuote(quote, pacificNoonIso(plan.receivedAt), proposedRef);
    if (pacificCalendarDate(saved.receivedAt || "") !== plan.receivedAt
      || (saved.manufacturerOrderRef ?? "") !== proposedRef
      || saved.status !== quote.status) {
      throw new Error("Shipped date read-back did not match the intended quote update.");
    }
    await store.resolveQuoteReviews(quote.id, { proposals: true });
    logEvent("wrote", { quoteId: quote.id, quoteNumber: quote.quoteNumber, receivedAt: plan.receivedAt, messageId: source.messageId });
    for (const line of quoteLines) {
      outcomes.push({
        reference: line.reference,
        action: "wrote",
        reason: "wrote",
        quoteId: quote.id,
        proposedReceivedAt: plan.receivedAt,
        proposedManufacturerOrderRef: proposedRef,
      });
    }
  }
  return { writesEnabled, outcomes };
}

function reviewForMatch(
  match: Exclude<NoticeMatch, { kind: "unique" }>,
  manufacturer: ShippedDateManufacturer,
  line: NoticeLine,
  source: { mailbox: string; messageId: string },
): ReviewRow {
  if (match.kind === "multiple") {
    return reviewRow({
      reason: "multiple",
      manufacturer,
      orderRef: line.reference,
      poNumber: line.purchaseOrder,
      source,
      quote: null,
      detail: `More than one quote matched: ${match.quotes.map(quote => `${quote.quoteNumber || "(no number)"} ${quote.id}`).join("; ")}. Nothing was written.`,
      proposedReceivedAt: null,
      proposedManufacturerOrderRef: null,
      status: "open",
    });
  }
  if (match.kind === "bookkeeping_only") {
    return reviewRow({
      reason: "bookkeeping_only",
      manufacturer,
      orderRef: line.reference,
      poNumber: line.purchaseOrder,
      source,
      quote: null,
      detail: `Matched only through bookkeeping (${match.entries.map(entry => entry.id).join(", ")}). Nothing was written.`,
      proposedReceivedAt: null,
      proposedManufacturerOrderRef: null,
      status: "open",
    });
  }
  return reviewRow({
    reason: "no_match",
    manufacturer,
    orderRef: line.reference,
    poNumber: line.purchaseOrder,
    source,
    quote: null,
    detail: "No quote has this order number, and the PO is not an exact quote number. Nothing was written.",
    proposedReceivedAt: null,
    proposedManufacturerOrderRef: null,
    status: "open",
  });
}

function reviewRow(input: {
  reason: ReviewReason;
  manufacturer: ShippedDateManufacturer | null;
  orderRef: string | null;
  poNumber: string | null;
  source: { mailbox: string; messageId: string };
  quote: QuoteCandidate | null;
  detail: string;
  proposedReceivedAt: string | null;
  proposedManufacturerOrderRef: string | null;
  status: ReviewRow["status"];
}): ReviewRow {
  const dedupeKey = input.reason === "partial" || input.reason === "proposed_write"
    ? `${input.reason}|${input.quote?.id || input.orderRef || ""}`
    : `${input.reason}|${input.manufacturer || ""}|${input.orderRef || ""}`;
  return {
    dedupeKey,
    manufacturer: input.manufacturer,
    orderRef: input.orderRef,
    poNumber: input.poNumber,
    mailboxEmail: input.source.mailbox,
    gmailMessageId: input.source.messageId,
    quoteId: input.quote?.id ?? null,
    quoteNumber: input.quote?.quoteNumber ?? null,
    reason: input.reason,
    detail: input.detail,
    proposedReceivedAt: input.proposedReceivedAt,
    proposedManufacturerOrderRef: input.proposedManufacturerOrderRef,
    status: input.status,
  };
}

function outcomeFromReview(row: ReviewRow): ShippedDateLineOutcome {
  return {
    reference: row.orderRef || "",
    action: row.reason === "proposed_write" ? "proposed" : "review",
    reason: row.reason,
    quoteId: row.quoteId,
    proposedReceivedAt: row.proposedReceivedAt,
    proposedManufacturerOrderRef: row.proposedManufacturerOrderRef,
  };
}

type QuoteRow = {
  id: string;
  quote_number: string | null;
  status: string | null;
  manufacturer_order_ref: string | null;
  received_at: string | null;
};

function mapQuote(row: QuoteRow): QuoteCandidate {
  return {
    id: row.id,
    quoteNumber: row.quote_number,
    status: row.status,
    manufacturerOrderRef: row.manufacturer_order_ref,
    receivedAt: row.received_at,
  };
}

export function createSupabaseShippedDateStore(db: SupabaseClient): ShippedDateStore {
  return {
    async findQuoteCandidates(orderRef, purchaseOrder) {
      const rows: QuoteRow[] = [];
      if (orderRef && !/[%_,]/.test(orderRef)) {
        const { data, error } = await db.from("crm_quotes")
          .select("id,quote_number,status,manufacturer_order_ref,received_at")
          .ilike("manufacturer_order_ref", `%${orderRef}%`)
          .limit(50);
        if (error) throw new Error("Quote lookup for a shipping notice failed.");
        rows.push(...((data || []) as QuoteRow[]));
      }
      const po = purchaseOrder?.trim();
      if (po) {
        const { data, error } = await db.from("crm_quotes")
          .select("id,quote_number,status,manufacturer_order_ref,received_at")
          .eq("quote_number", po)
          .limit(20);
        if (error) throw new Error("Quote-number lookup for a shipping notice failed.");
        rows.push(...((data || []) as QuoteRow[]));
      }
      const seen = new Map<string, QuoteCandidate>();
      for (const row of rows) seen.set(row.id, mapQuote(row));
      return [...seen.values()];
    },
    async findBookkeeping(orderRef) {
      if (!orderRef || /[%_,]/.test(orderRef)) return [];
      const { data, error } = await db.from("crm_quote_bookkeeping_entries")
        .select("id,quote_id,manufacturer_order_ref")
        .ilike("manufacturer_order_ref", `%${orderRef}%`)
        .limit(50);
      if (error) throw new Error("Bookkeeping lookup for a shipping notice failed.");
      return ((data || []) as Array<{ id: string; quote_id: string | null; manufacturer_order_ref: string | null }>).map(row => ({
        id: row.id,
        quoteId: row.quote_id,
        manufacturerOrderRef: row.manufacturer_order_ref,
      }));
    },
    async upsertNotice(notice) {
      const { data: existing, error: readError } = await db.from("crm_shipping_notices")
        .select("ship_date,gmail_message_id")
        .eq("manufacturer", notice.manufacturer)
        .eq("order_ref", notice.orderRef)
        .maybeSingle();
      if (readError) throw new Error("Stored shipping notice could not be read.");
      const sameMessage = existing?.gmail_message_id === notice.gmailMessageId;
      if (existing?.ship_date && !sameMessage && existing.ship_date >= notice.shipDate) return;
      const { error } = await db.from("crm_shipping_notices").upsert({
        manufacturer: notice.manufacturer,
        order_ref: notice.orderRef,
        po_number: notice.poNumber,
        ship_date: notice.shipDate,
        ship_date_source: notice.shipDateSource,
        mailbox_email: notice.mailboxEmail,
        gmail_message_id: notice.gmailMessageId,
        sent_at: notice.sentAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "manufacturer,order_ref" });
      if (error) throw new Error("Shipping notice could not be recorded.");
    },
    async listNotices(orderRefs) {
      const refs = [...new Set(orderRefs.map(ref => ref.trim()).filter(Boolean))];
      if (!refs.length) return [];
      const { data, error } = await db.from("crm_shipping_notices")
        .select("manufacturer,order_ref,ship_date,po_number")
        .in("order_ref", refs);
      if (error) throw new Error("Stored shipping notices could not be listed.");
      return ((data || []) as Array<{ manufacturer: ShippedDateManufacturer; order_ref: string; ship_date: string | null; po_number: string | null }>).map(row => ({
        manufacturer: row.manufacturer,
        orderRef: row.order_ref,
        shipDate: row.ship_date,
        poNumber: row.po_number,
      }));
    },
    async upsertReview(row) {
      const { error } = await db.from("crm_shipping_review").upsert({
        dedupe_key: row.dedupeKey,
        manufacturer: row.manufacturer,
        order_ref: row.orderRef,
        po_number: row.poNumber,
        mailbox_email: row.mailboxEmail,
        gmail_message_id: row.gmailMessageId,
        quote_id: row.quoteId,
        quote_number: row.quoteNumber,
        reason: row.reason,
        detail: row.detail,
        proposed_received_at: row.proposedReceivedAt,
        proposed_manufacturer_order_ref: row.proposedManufacturerOrderRef,
        status: row.status,
        updated_at: new Date().toISOString(),
      }, { onConflict: "dedupe_key" });
      if (error) throw new Error("Shipping review row could not be saved.");
    },
    async resolveQuoteReviews(quoteId, options) {
      const resolved = await db.from("crm_shipping_review").update({ status: "resolved", updated_at: new Date().toISOString() })
        .eq("quote_id", quoteId).eq("reason", "partial").eq("status", "open");
      if (resolved.error) throw new Error("Shipping review row could not be resolved.");
      if (options?.proposals === false) return;
      const applied = await db.from("crm_shipping_review").update({ status: "applied", updated_at: new Date().toISOString() })
        .eq("quote_id", quoteId).eq("reason", "proposed_write").eq("status", "logged");
      if (applied.error) throw new Error("Logged shipped-date proposal could not be closed.");
    },
    async writeQuote(quote, receivedAt, manufacturerOrderRef) {
      const { error } = await db.rpc("apply_crm_quote_shipped_date", {
        p_quote_id: quote.id,
        p_received_at: receivedAt,
        p_manufacturer_order_ref: manufacturerOrderRef,
      });
      if (error) throw new Error("Shipped date was not saved on the quote.");
      const { data, error: readError } = await db.from("crm_quotes")
        .select("id,quote_number,status,manufacturer_order_ref,received_at")
        .eq("id", quote.id)
        .maybeSingle();
      if (readError || !data) throw new Error("Shipped date could not be read back from the quote.");
      return mapQuote(data as QuoteRow);
    },
  };
}

/**
 * Replay notices already stored in crm_shipping_notices. Dry-run unless apply is true
 * AND SHIPPED_DATE_WRITES_ENABLED=true. Does not read Gmail and does not send mail.
 */
export async function backfillStoredShippingNotices(
  db: SupabaseClient,
  options: { apply?: boolean; writesEnabled?: boolean } = {},
) {
  const apply = options.apply === true;
  const writesEnabled = apply && (options.writesEnabled ?? shippedDateWritesEnabled());
  const live = createSupabaseShippedDateStore(db);
  const store: ShippedDateStore = writesEnabled ? live : {
    findQuoteCandidates: live.findQuoteCandidates,
    findBookkeeping: live.findBookkeeping,
    listNotices: live.listNotices,
    upsertNotice: async () => undefined,
    upsertReview: async () => undefined,
    resolveQuoteReviews: async () => undefined,
    writeQuote: async () => { throw new Error("Dry run cannot write a quote."); },
  };
  const { data, error } = await db.from("crm_shipping_notices")
    .select("manufacturer,order_ref,po_number,ship_date,gmail_message_id,mailbox_email,sent_at")
    .order("ship_date", { ascending: true })
    .limit(5000);
  if (error) throw new Error("Stored shipping notices could not be loaded for backfill.");
  const rows = (data || []) as Array<{
    manufacturer: ShippedDateManufacturer;
    order_ref: string;
    po_number: string | null;
    ship_date: string | null;
    gmail_message_id: string | null;
    mailbox_email: string | null;
    sent_at: string | null;
  }>;
  const results = [];
  for (const row of rows) {
    if (!row.ship_date || !row.mailbox_email) continue;
    const notice: ShippingNotice = {
      manufacturer: row.manufacturer,
      references: [row.order_ref],
      shippedOn: row.manufacturer === "Norman" ? null : row.ship_date,
      ...(row.po_number ? { purchaseOrder: row.po_number } : {}),
    };
    const settlement = await settleShippingNoticeDates(db, notice, {
      mailbox: row.mailbox_email,
      messageId: row.gmail_message_id || `backfill:${row.manufacturer}:${row.order_ref}`,
      sentAt: row.sent_at,
    }, { writesEnabled, store });
    results.push({ orderRef: row.order_ref, manufacturer: row.manufacturer, outcomes: settlement.outcomes });
  }
  return { apply, writesEnabled, count: results.length, results };
}
