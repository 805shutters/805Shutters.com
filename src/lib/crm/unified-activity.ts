import { formatPaymentType } from "@/lib/crm/bookkeeping";
import type {
  CrmActivityEvent,
  CrmBookkeepingPayment,
  CrmBookkeepingRow,
  CrmCustomer,
  CrmJob,
  CrmQuote
} from "@/lib/crm/types";

export type UnifiedActivityCategory = "payment" | "update" | "note" | "follow_up" | "signed_contract";
export type UnifiedActivityFilter = "operations" | "all" | "payments" | "updates" | "notes" | "follow_ups" | "signed_contracts";

export type UnifiedActivityEvent = {
  id: string;
  sourceId: string;
  timestamp: string;
  category: UnifiedActivityCategory;
  source: string;
  customerName: string;
  displayCustomer: string;
  typeLabel: string;
  description: string;
  amount: number | null;
  actorEmail: string | null;
  entityType: string;
  entityId: string | null;
  sortAt: string;
  telemetry?: boolean; autosave?: boolean; correlationId?: string | null; sourceRevision?: string | null; groupedSourceIds?: string[];
};

type UnifiedActivityInput = {
  activityEvents: CrmActivityEvent[];
  payments: CrmBookkeepingPayment[];
  signedContracts: Array<Pick<CrmQuote, "id" | "job_id" | "signed_at" | "customer_printed_name" | "quote_number">>;
  rows: CrmBookkeepingRow[];
  jobs: CrmJob[];
  quotes: CrmQuote[];
  customers: CrmCustomer[];
};

const customerKeys = ["customer_name", "customerName", "display_name", "payer_name", "square_customer_name"];
const followUpKeys = ["next_action", "next_action_due"];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textFrom(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function recordText(source: Record<string, unknown>, keys: string[]) {
  return textFrom(...keys.map((key) => source[key]));
}

function titleCase(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sentenceCase(value: string) {
  const normalized = value.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "CRM updated";
}

function actionDescription(value: string) {
  const words = value.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim().split(" ");
  const verb = words.at(-1)?.toLowerCase();
  const pastTense: Record<string, string> = { create: "created", update: "updated", delete: "deleted", send: "sent" };
  if (verb && pastTense[verb]) words[words.length - 1] = pastTense[verb];
  return sentenceCase(words.join(" "));
}

function dateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T12:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function eventSource(actorEmail: string | null) {
  const local = actorEmail?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!local || local === "system") return "CRM";
  return titleCase(local);
}

function paymentSource(payment: CrmBookkeepingPayment) {
  const external = payment.external_source?.toLowerCase() || "";
  if (external.includes("square")) return "Square";
  if (external.includes("venmo") || payment.payment_type === "venmo") return "Venmo";
  if (external.includes("zelle") || payment.payment_type === "zelle") return "Zelle";
  return formatPaymentType(payment.payment_type);
}

function paymentTimestamp(payment: CrmBookkeepingPayment) {
  return payment.paid_at || payment.created_at;
}

function paymentSortAt(payment: CrmBookkeepingPayment) {
  const paidAt = paymentTimestamp(payment);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return paidAt;
  // Date-only receipts are grouped by business date, without borrowing an entry time.
  return paidAt;
}

function sortTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function changed(before: Record<string, unknown>, after: Record<string, unknown>, key: string) {
  return Object.hasOwn(after, key) && before[key] !== after[key];
}

function classifyActivity(event: CrmActivityEvent) {
  const before = record(event.before_data);
  const after = record(event.after_data);
  const metadata = record(event.metadata);
  const action = event.action.toLowerCase();
  const hasFollowUpChange = followUpKeys.some((key) => changed(before, after, key));
  if (action.includes("follow_up") || action.includes("followup") || hasFollowUpChange) {
    return "follow_up" as const;
  }
  if (action.includes("note") || changed(before, after, "notes") || metadata.note || metadata.notes) {
    return "note" as const;
  }
  return "update" as const;
}

function activityDescription(event: CrmActivityEvent, category: UnifiedActivityCategory) {
  const before = record(event.before_data);
  const after = record(event.after_data);
  const metadata = record(event.metadata);

  if (metadata.business_event_id && metadata.description) return String(metadata.description);

  if (category === "follow_up") {
    const action = textFrom(after.next_action, metadata.next_action, metadata.follow_up, metadata.description);
    const due = dateLabel(textFrom(after.next_action_due, metadata.next_action_due, metadata.due_at));
    if (action && due) return `Follow-up set: ${action} · due ${due}`;
    if (action) return `Follow-up set: ${action}`;
    if (due) return `Follow-up due ${due}`;
    return "Follow-up updated";
  }

  if (category === "note") {
    return textFrom(after.notes, metadata.note, metadata.notes, metadata.description) || "Note updated";
  }

  if (changed(before, after, "status")) {
    return `Status changed from ${sentenceCase(String(before.status || "unknown"))} to ${sentenceCase(String(after.status || "unknown"))}`;
  }

  if (event.entity_type === "bookkeeping_payment") {
    if (event.action.toLowerCase().includes("delete")) return "Payment deleted";
    if (changed(before, after, "amount")) {
      const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
      return `Payment amount changed from ${money.format(Number(before.amount) || 0)} to ${money.format(Number(after.amount) || 0)}`;
    }
    return `Payment ${actionDescription(event.action).toLowerCase()}`;
  }

  return textFrom(metadata.description, metadata.message, after.description) || actionDescription(event.action);
}

function eventCustomer(
  event: CrmActivityEvent,
  maps: ReturnType<typeof buildCustomerMaps>
) {
  const metadata = record(event.metadata);
  const after = record(event.after_data);
  const before = record(event.before_data);
  const embedded = recordText(metadata, customerKeys) || recordText(after, customerKeys) || recordText(before, customerKeys);
  if (embedded) return embedded;

  const linkedSources = [metadata, after, before];
  const linkedId = (keys: string[]) => {
    for (const source of linkedSources) {
      const id = recordText(source, keys);
      if (id) return id;
    }
    return null;
  };
  const linkedJobId = linkedId(["job_id", "jobId", "crm_job_id", "crmJobId"]);
  if (linkedJobId && maps.jobs.has(linkedJobId)) return maps.jobs.get(linkedJobId)?.customer_name || "Unlinked customer";
  const linkedQuoteId = linkedId(["quote_id", "quoteId", "crm_quote_id", "crmQuoteId"]);
  if (linkedQuoteId && maps.quoteCustomers.has(linkedQuoteId)) return maps.quoteCustomers.get(linkedQuoteId) || "Unlinked customer";
  const linkedEntryId = linkedId(["bookkeeping_entry_id", "bookkeepingEntryId", "entry_id", "entryId"]);
  if (linkedEntryId && maps.rowCustomers.has(linkedEntryId)) return maps.rowCustomers.get(linkedEntryId) || "Unlinked customer";
  const linkedCustomerId = linkedId(["customer_id", "customerId"]);
  if (linkedCustomerId && maps.customers.has(linkedCustomerId)) return maps.customers.get(linkedCustomerId)?.display_name || "Unlinked customer";

  if (!event.entity_id) return "Unlinked customer";
  if (event.entity_type === "job") return maps.jobs.get(event.entity_id)?.customer_name || "Unlinked customer";
  if (event.entity_type === "quote") return maps.quoteCustomers.get(event.entity_id) || "Unlinked customer";
  if (event.entity_type === "bookkeeping_entry") return maps.rowCustomers.get(event.entity_id) || "Unlinked customer";
  if (event.entity_type === "customer") return maps.customers.get(event.entity_id)?.display_name || "Unlinked customer";
  if (event.entity_type === "bookkeeping_payment") return maps.paymentCustomers.get(event.entity_id) || "Unlinked customer";
  return "Unlinked customer";
}

function buildCustomerMaps(input: Pick<UnifiedActivityInput, "jobs" | "quotes" | "rows" | "customers">) {
  const jobs = new Map(input.jobs.map((job) => [job.id, job]));
  const customers = new Map(input.customers.map((customer) => [customer.id, customer]));
  const quoteCustomers = new Map<string, string>();
  for (const quote of input.quotes) {
    const name = quote.customer_name || jobs.get(quote.job_id)?.customer_name;
    if (name) quoteCustomers.set(quote.id, name);
  }
  const rowCustomers = new Map<string, string>();
  const paymentCustomers = new Map<string, string>();
  for (const row of input.rows) {
    rowCustomers.set(row.id, row.customerName);
    if (row.quoteId) quoteCustomers.set(row.quoteId, row.customerName);
    for (const alias of row.quoteIdAliases || []) quoteCustomers.set(alias, row.customerName);
    for (const payment of row.payments || []) paymentCustomers.set(payment.id, row.customerName);
  }
  return { jobs, customers, quoteCustomers, rowCustomers, paymentCustomers };
}

function paymentCustomer(payment: CrmBookkeepingPayment, maps: ReturnType<typeof buildCustomerMaps>) {
  const meta = record(payment.meta);
  const embedded = recordText(meta, customerKeys);
  const canonical = (payment.bookkeeping_entry_id ? maps.rowCustomers.get(payment.bookkeeping_entry_id) : null) ||
    (payment.job_id ? maps.jobs.get(payment.job_id)?.customer_name : null) ||
    (payment.quote_id ? maps.quoteCustomers.get(payment.quote_id) : null) ||
    embedded ||
    "Unlinked customer";
  return { canonical, display: embedded || canonical };
}

export function buildUnifiedActivityFeed(input: UnifiedActivityInput): UnifiedActivityEvent[] {
  const maps = buildCustomerMaps(input);
  const canonicalPaymentIds = new Set(input.payments.map((payment) => payment.id));
  const signedContractsInput = input.signedContracts || [];
  const signedQuoteIds = new Set(signedContractsInput.map((contract) => contract.id));
  const payments = input.payments.map((payment): UnifiedActivityEvent => {
    const source = paymentSource(payment);
    const customer = paymentCustomer(payment, maps);
    return {
      id: `payment:${payment.id}`,
      sourceId: payment.id,
      timestamp: paymentTimestamp(payment),
      category: "payment",
      source,
      customerName: customer.canonical,
      displayCustomer: customer.display,
      typeLabel: "Payment",
      description: `${payment.payment_label || "Payment"} received via ${source}`,
      amount: Number(payment.amount) || 0,
      actorEmail: null,
      entityType: "bookkeeping_payment",
      entityId: payment.id,
      sortAt: paymentSortAt(payment)
    };
  });

  const signedContracts = signedContractsInput.flatMap((contract): UnifiedActivityEvent[] => {
    if (!contract.signed_at) return [];
    const customerName = maps.quoteCustomers.get(contract.id) ||
      maps.jobs.get(contract.job_id)?.customer_name ||
      contract.customer_printed_name ||
      "Unlinked customer";
    return [{
      id: `signed-contract:${contract.id}`,
      sourceId: contract.id,
      timestamp: contract.signed_at,
      category: "signed_contract",
      source: "Contract",
      customerName,
      displayCustomer: customerName,
      typeLabel: "Signed contract",
      description: contract.quote_number ? `Contract ${contract.quote_number} signed` : "Contract signed",
      amount: null,
      actorEmail: null,
      entityType: "quote",
      entityId: contract.id,
      sortAt: contract.signed_at
    }];
  });

  const activity = input.activityEvents.flatMap((event): UnifiedActivityEvent[] => {
    if (event.entity_type === "quote" && event.entity_id && signedQuoteIds.has(event.entity_id) && event.action.toLowerCase() === "customer.sign") return [];
    if (
      event.entity_type === "bookkeeping_payment" &&
      event.entity_id &&
      canonicalPaymentIds.has(event.entity_id) &&
      ["create", "created", "reconcile", "reconciled"].includes(event.action.toLowerCase())
    ) return [];
    const category = classifyActivity(event);
    const metadata = record(event.metadata);
    const action = event.action.toLowerCase();
    return [{
      id: `crm:${event.id}`,
      sourceId: event.id,
      timestamp: event.created_at,
      category,
      source: eventSource(event.actor_email),
      customerName: eventCustomer(event, maps),
      displayCustomer: eventCustomer(event, maps),
      typeLabel: category === "follow_up" ? "Follow-up" : category === "note" ? "Note" : "Update",
      description: activityDescription(event, category),
      amount: null,
      actorEmail: event.actor_email,
      entityType: event.entity_type,
      entityId: event.entity_id,
      sortAt: event.created_at,
      telemetry: /visitor|telemetry|page_view/.test(action),
      autosave: /technical[._ ]measure[._ ]save|autosave/.test(action),
      sourceRevision: metadata.source_revision == null ? null : String(metadata.source_revision),
      correlationId: textFrom(metadata.correlation_id,metadata.provider_event_id)
    }];
  });

  return [...payments, ...signedContracts, ...activity].sort((left, right) =>
    sortTimestamp(right.sortAt) - sortTimestamp(left.sortAt) || right.id.localeCompare(left.id)
  );
}

export function filterUnifiedActivity(feed: UnifiedActivityEvent[], filter: UnifiedActivityFilter) {
  if (filter === "all") return feed;
  if (filter === "operations") return operationalTimeline(feed);
  const category: UnifiedActivityCategory =
    filter === "payments" ? "payment" :
    filter === "notes" ? "note" :
    filter === "follow_ups" ? "follow_up" : "update";
  if (filter === "signed_contracts") return feed.filter((event) => event.category === "signed_contract");
  return feed.filter((event) => event.category === category);
}

export function reconcileDisplayedActivity(
  displayed: UnifiedActivityEvent[],
  latest: UnifiedActivityEvent[],
  scrollTop: number
) {
  if (!displayed.length) return { feed: latest, pendingCount: 0 };
  const displayedIds = new Set(displayed.map((event) => event.id));
  const pendingCount = latest.reduce((count, event) => count + (displayedIds.has(event.id) ? 0 : 1), 0);
  if (pendingCount && scrollTop > 24) return { feed: displayed, pendingCount };
  return { feed: latest, pendingCount: 0 };
}

/** Keeps raw entries intact; groups only explicit correlations and exact-record editing sessions. */
export function operationalTimeline(feed: UnifiedActivityEvent[]) {
  const output: UnifiedActivityEvent[] = [];
  const correlations = new Map<string,UnifiedActivityEvent>();
  const edits = new Map<string,UnifiedActivityEvent>();
  for (const event of feed) {
    if (event.telemetry) continue;
    const correlation = event.correlationId ? `${event.correlationId}:${event.category}:${event.sourceRevision || "unknown"}` : null;
    const related = correlation ? correlations.get(correlation) : undefined;
    if (related) { related.groupedSourceIds = [...(related.groupedSourceIds || [related.sourceId]),event.sourceId]; continue; }
    const key = `${event.entityType}:${event.entityId}:${event.actorEmail}`;
    const session = event.autosave && event.entityId ? edits.get(key) : undefined;
    if (session && Math.abs(Date.parse(session.timestamp)-Date.parse(event.timestamp)) <= 30*60*1000) {
      session.groupedSourceIds = [...(session.groupedSourceIds || [session.sourceId]),event.sourceId];
      session.description = `Editing session · ${session.groupedSourceIds.length} saves (open customer timeline for raw entries)`;
      continue;
    }
    const copy = {...event}; output.push(copy);
    if (correlation) correlations.set(correlation,copy);
    if (event.autosave && event.entityId) edits.set(key,copy);
  }
  return output;
}
