import { trackingJobClosed } from "./job-closure";
import { shipmentEvidence, type ShipmentEvidence } from "./shipment-evidence";
import { losAngelesDateString } from "@/lib/booking/availability";
import { buildJobTrackingView, type JobTrackingViewItem } from "./job-tracking-view";
import { objectMeta } from "./measure-needed-state";
import { quoteLineProductName, selectedQuoteLineQuantities } from "./quote-line-evidence";
import { wholeJobRecordId, wholeJobWorkflowChecks } from "./whole-job-workflow";
import type { CrmCustomerProduct, CrmDashboardData } from "./types";

export const workflowSteps = ["quote", "sold", "ordered", "shipped", "installed", "paid"] as const;
export type WorkflowStep = typeof workflowSteps[number];
export const workflowLabels: Record<WorkflowStep, string> = { quote: "Quote", sold: "Sold", ordered: "Ordered", shipped: "Shipped", installed: "Installed", paid: "Balance paid" };
export type ProductProgress = { shipments?: ShipmentEvidence[]; undatedShipments?: number; id: string; name: string; quantity?: number | null; ordered: boolean; shipped: boolean; installed: boolean; records: { id: string; updatedAt: string }[]; wholeJob?: boolean };
export type HeaderProduct = { id: string; name: string; quantity: number };
export type HeaderProductSource = "signed_snapshot" | "accepted_quote_lines";
export type OperationsItem = { source: JobTrackingViewItem; products: ProductProgress[]; headerProducts: HeaderProduct[]; headerProductSource: HeaderProductSource | null; wholeJob: ProductProgress; quote: boolean; sold: boolean; installed: boolean; paid: boolean; archived: boolean; complete: boolean; closed: boolean };

type EvidenceLine = { id: string; name: string; quantity: number };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const positiveQuantity = (value: unknown): number | null => Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;

function groupEvidenceLines(lines: EvidenceLine[]): HeaderProduct[] {
  const groups = new Map<string, HeaderProduct>();
  for (const line of lines) {
    const name = line.name.trim().replace(/\s+/g, " ");
    const id = name.toLocaleLowerCase();
    const existing = groups.get(id);
    groups.set(id, existing ? { ...existing, quantity: existing.quantity + line.quantity } : { id, name, quantity: line.quantity });
  }
  return [...groups.values()];
}

function snapshotHeaderProducts(source: JobTrackingViewItem): HeaderProduct[] | null {
  for (const contract of source.contracts) {
    if (objectMeta(contract.meta).deleted_at) continue;
    const snapshot = record(objectMeta(contract.meta).contract_snapshot);
    if (snapshot.schema !== "805_signed_quote_contract_v1") continue;
    const lines = snapshot.lines;
    if (!contract.signed_at && typeof snapshot.signedAt !== "string") return [];
    if (!Array.isArray(lines) || !lines.length) return [];
    const evidence: EvidenceLine[] = [];
    for (const value of lines) {
      const line = record(value);
      const id = typeof line.lineItemId === "string" ? line.lineItemId.trim() : "";
      const name = typeof line.productName === "string" ? line.productName.trim() : "";
      const quantity = positiveQuantity(line.quantity);
      if (!id || !name || quantity === null || objectMeta(line.meta).deleted_at) return [];
      evidence.push({ id, name, quantity });
    }
    return groupEvidenceLines(evidence);
  }
  return null;
}

function quoteHeaderProducts(source: JobTrackingViewItem): HeaderProduct[] | null {
  const quote = source.quote as (typeof source.quote & { lineItems?: unknown; line_items?: unknown; source_sold_at?: string | null }) | undefined;
  const acceptedStatus = new Set(["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"]);
  const accepted = quote && Object.hasOwn(quote, "source_sold_at")
    ? Boolean(quote.source_sold_at)
    : Boolean(quote && (quote.signed_at || quote.sold_at || quote.approved_at || quote.customer_signature || acceptedStatus.has(quote.status)));
  if (!quote || !accepted || objectMeta(quote.meta).deleted_at) return null;
  const rawLines = Array.isArray(quote.lineItems) ? quote.lineItems : Array.isArray(quote.line_items) ? quote.line_items : null;
  if (!rawLines?.length) return null;
  const meta = objectMeta(quote.meta);
  const partial = objectMeta(meta.partial_acceptance);
  const materialized = partial.role === "current";
  const rawSelection = objectMeta(meta.signed_selection).lineItemIds;
  const selection = Array.isArray(rawSelection) && rawSelection.every(id => typeof id === "string") ? rawSelection as string[] : null;
  if (!materialized && Array.isArray(rawSelection) && !selection?.length) return [];
  const selectedQuantities = selection && !materialized ? selectedQuoteLineQuantities(rawLines, selection) : null;
  if (selection && !materialized && !selectedQuantities) return [];
  const legacyMts = meta.legacy_quote_system === "mts_sales_quote" || typeof meta.mts_quote_id === "string";
  const evidence: EvidenceLine[] = [];
  for (const value of rawLines) {
    const line = record(value);
    if (objectMeta(line.meta).deleted_at) continue;
    const id = typeof line.id === "string" ? line.id : "";
    const selectedQuantity = selectedQuantities?.get(id);
    if (selectedQuantities && selectedQuantity === undefined) continue;
    const storedQuantity = positiveQuantity(line.quantity);
    const name = quoteLineProductName(line, legacyMts);
    if (!id || storedQuantity === null || !name) return [];
    evidence.push({ id, name, quantity: selectedQuantity ?? storedQuantity });
  }
  return evidence.length ? groupEvidenceLines(evidence) : [];
}

export function contractHeaderProducts(source: JobTrackingViewItem): { products: HeaderProduct[]; source: HeaderProductSource | null } {
  const snapshot = snapshotHeaderProducts(source);
  if (snapshot !== null) return { products: snapshot, source: snapshot.length ? "signed_snapshot" : null };
  const quote = quoteHeaderProducts(source);
  return quote?.length ? { products: quote, source: "accepted_quote_lines" } : { products: [], source: null };
}

function productProgress(product: CrmCustomerProduct): ProductProgress {
  const meta = objectMeta(product.meta);
  const status = (product.status || "").toLowerCase();
  const quantity = product.quantity === 1 && (
    meta.source === "crm_job" ||
    (meta.source === "self_booking" && meta.windowCount == null)
  )
    ? null
    : Number.isInteger(product.quantity) && product.quantity > 0 ? product.quantity : null;
  // Each milestone needs its own source evidence; payment or a later workflow
  // marker must never fabricate a manufacturer order or shipment.
  return {
    id: product.id, name: product.product_type.trim() || "Product type needed", quantity, records: [{ id: product.id, updatedAt: product.updated_at }],
    shipments: shipmentEvidence(meta),
    undatedShipments: (meta.shipped_at || meta.received_at || ["shipped", "received", "delivered"].includes(status)) && !shipmentEvidence(meta).length ? 1 : 0,
    ordered: Boolean(meta.ordered_at || status === "ordered"),
    shipped: Boolean(meta.shipped_at || meta.received_at || ["shipped", "received", "delivered"].includes(status)),
    installed: Boolean(meta.installed_at || status === "installed")
  };
}

function wholeJobProgress(source: JobTrackingViewItem): ProductProgress {
  const standalone = Boolean(source.row && source.row.source !== "crm_quote");
  const rowQuoteId = source.row?.source === "crm_quote" ? source.row.quoteId || source.row.id : undefined;
  const quoteId = source.quote?.id || rowQuoteId;
  const kind = standalone ? "bookkeeping" : quoteId ? "quote" : "job";
  const id = standalone ? source.row!.id : quoteId || source.job?.id || source.row?.jobId || source.id;
  const updatedAt = standalone
    ? source.row!.sourceUpdatedAt || source.row!.costRecordUpdatedAt
    : quoteId
      ? source.quote?.updated_at || (source.row?.source === "crm_quote" ? source.row.sourceUpdatedAt || source.row.costRecordUpdatedAt : undefined)
      : source.job?.updated_at;
  const meta = standalone
    ? source.row!.meta
    : quoteId
      ? source.quote?.meta ?? (source.row?.source === "crm_quote" ? source.row.meta : undefined)
      : source.job?.meta;
  const checks = wholeJobWorkflowChecks(meta);
  return {
    id: wholeJobRecordId(kind, id),
    name: "Whole job",
    quantity: null,
    records: [{ id: wholeJobRecordId(kind, id), updatedAt: updatedAt || "" }],
    ordered: Boolean(source.orderedAt || objectMeta(checks.ordered).at),
    shipped: Boolean(objectMeta(checks.shipped).at),
    installed: false,
    wholeJob: true
  };
}

export function productCompletionSourceLinks(item: OperationsItem, product: ProductProgress) {
  const source = item.source;
  const standalone = Boolean(source.row && source.row.source !== "crm_quote");
  if (product.wholeJob && standalone) {
    return {
      ...(source.row!.quoteId ? { quoteId: source.row!.quoteId } : {}),
      ...(source.row!.jobId ? { jobId: source.row!.jobId } : {}),
      bookkeepingEntryId: source.row!.id
    };
  }
  const quoteId = source.quote?.id || source.row?.quoteId || (source.row?.source === "crm_quote" ? source.row.id : undefined);
  const jobId = source.job?.id || source.row?.jobId || source.quote?.job_id;
  return {
    ...(quoteId ? { quoteId } : {}),
    ...(jobId ? { jobId } : {}),
    ...(standalone ? { bookkeepingEntryId: source.row!.id } : {})
  };
}

export function buildOperationsItems(data: CrmDashboardData): OperationsItem[] {
  const sources = buildJobTrackingView({ jobs: data.jobs, quotes: data.quotes, rows: data.bookkeepingRows, files: data.customerFiles, orderCogsEmails: data.orderCogsEmails, installationInvoiceEmails: data.installationInvoiceEmails, fulfillment: data.fulfillment, ownedActions: data.ownedActions, installerOutcomes: data.installerOutcomes, sourceHealth: data.sourceHealth });
  const products = [...new Map([...data.customerFiles.flatMap(file => file.products), ...data.customerProducts].map(product => [product.id, product])).values()];
  return sources.map(source => {
    const quoteId = source.quote?.id || source.row?.quoteId;
    const jobId = source.job?.id || source.row?.jobId || source.quote?.job_id;
    const soleJob = Boolean(jobId && sources.filter(item => (item.job?.id || item.row?.jobId || item.quote?.job_id) === jobId).length === 1);
    const matched = products.filter(product => {
      if (objectMeta(product.meta).deleted_at) return false;
      if (product.bookkeeping_entry_id) return source.row?.source !== "crm_quote" && product.bookkeeping_entry_id === source.row?.id;
      if (product.quote_id) return product.quote_id === quoteId;
      return soleJob && Boolean(product.job_id && product.job_id === jobId);
    });
    const grouped = new Map<string, ProductProgress[]>();
    for (const product of matched) {
      const key = product.product_type.trim().toLowerCase() || "unknown";
      grouped.set(key, [...(grouped.get(key) || []), productProgress(product)]);
    }
    const progress = [...grouped].map(([id, items]) => ({
      id,
      name: items[0].name,
      quantity: items.every(item => typeof item.quantity === "number") ? items.reduce((total, item) => total + item.quantity!, 0) : null,
      records: items.flatMap(item => item.records),
      undatedShipments: items.reduce((count, item) => count + (item.undatedShipments || 0), 0),
      shipments: [...new Map(items.flatMap(item => item.shipments || []).map(shipment => [JSON.stringify(shipment), shipment])).values()],
      ordered: items.every(item => item.ordered),
      shipped: items.every(item => item.shipped),
      installed: items.every(item => item.installed)
    }));
    const header = contractHeaderProducts(source);
    return { source, products: progress, headerProducts: header.products, headerProductSource: header.source, wholeJob: wholeJobProgress(source), quote: Boolean(source.quote), sold: source.isSale,
      installed: source.progress.installation === "complete",
      paid: source.isSale && (source.total ?? 0) > 0 && ["settled", "overpaid"].includes(source.progress.payment),
      closed: trackingJobClosed(source),
      complete: source.progress.stage === "complete",
      archived: ["lost", "archived"].includes(source.stageId) };
  });
}

export function stepComplete(item: OperationsItem, step: WorkflowStep): boolean {
  return step === "ordered" || step === "shipped" ? (item.products.length ? item.products.every(product => product[step]) : item.wholeJob[step]) : item[step];
}
export function workflowSummary(items: OperationsItem[], step: WorkflowStep) {
  const eligible = items.filter(item => !item.archived && (["quote", "sold"].includes(step) || item.sold));
  if (step === "ordered" || step === "shipped") {
    const checks = eligible.flatMap(item => item.products.length ? item.products : [item.wholeJob]);
    return { done: checks.filter(check => check[step]).length, total: checks.length, unit: "product groups / jobs", unknown: 0 };
  }
  return { done: eligible.filter(item => stepComplete(item, step)).length, total: eligible.length, unit: "jobs", unknown: 0 };
}
export function attentionDetail(item: OperationsItem, step: WorkflowStep) {
  if (step === "ordered" || step === "shipped") return item.products.length ? item.products.filter(product => !product[step]).map(product => product.name).join(", ") + (step === "ordered" ? " · Order not confirmed" : " · Shipment not confirmed") : step === "ordered" ? "Whole-job order not confirmed" : "Whole-job shipment not confirmed";
  if (step === "quote") return "Quote not recorded";
  if (step === "sold") return "Sale not recorded · Review quote";
  if (step === "installed") return item.source.nextAction || "Installation not confirmed";
  return item.source.balanceOutstanding === null ? "Balance needs verification" : `${currency(item.source.balanceOutstanding)} remaining`;
}
export const currency = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);

/** Date-only values are business dates; timestamps are displayed in Los Angeles. */
export function formatOperationsDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }).format(parsed);
}

/** Date-only values are LA business dates; never reinterpret them as UTC. */
function businessDate(value: string | null | undefined, now: Date): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value <= losAngelesDateString(now) ? value : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed <= now ? losAngelesDateString(parsed) : null;
}
export type CloseCohort = { quoted: number; sold: number; percent: number | null; customers: { id: string; name: string; sold: boolean }[] };

export function buildPerformanceMetrics(data: CrmDashboardData, now = new Date()) {
  const today = losAngelesDateString(now);
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const weekStart = date.toISOString().slice(0, 10), monthStart = today.slice(0, 7) + "-01";
  const identity = new Map<string, { id: string; name: string }>();
  for (const file of data.customerFiles) {
    const value = { id: file.customer?.id || file.id, name: file.customerName };
    for (const quote of file.quotes) identity.set(quote.id, value);
  }
  const people = new Map<string, { id: string; name: string; firstQuoted: string | null; sold: boolean }>();
  let missingQuoteDates = 0;
  for (const quote of data.quotes) {
    if (objectMeta(quote.meta).deleted_at) continue;
    const person = identity.get(quote.id) || { id: quote.job_id || quote.quote_group_id || quote.id, name: quote.customer_name || "Customer record" };
    const existing = people.get(person.id) || { ...person, firstQuoted: null, sold: false };
    const sent = businessDate(quote.sent_at, now);
    if (sent && (!existing.firstQuoted || sent < existing.firstQuoted)) existing.firstQuoted = sent;
    if (!sent && quote.status !== "draft") missingQuoteDates++;
    const accepted = businessDate(Object.hasOwn(quote, "source_sold_at") ? quote.source_sold_at : quote.sold_at || quote.signed_at || quote.approved_at, now);
    existing.sold ||= Boolean(accepted);
    people.set(person.id, existing);
  }
  const cohort = (start: string): CloseCohort => {
    const customers = [...people.values()].filter(person => person.firstQuoted && person.firstQuoted >= start && person.firstQuoted <= today);
    const sold = customers.filter(person => person.sold).length;
    return { quoted: customers.length, sold, percent: customers.length ? sold / customers.length * 100 : null, customers };
  };
  const week = data.closedSales?.weeks.find(item => item.startDate === weekStart);
  const payments = [...new Map(data.bookkeepingPayments.map(payment => [payment.id, payment])).values()];
  const receipts = payments.filter(payment => { const day = businessDate(payment.paid_at, now); return day && day >= weekStart && Number.isFinite(payment.amount); });
  return { today, weekStart, monthStart, weekly: cohort(weekStart), monthly: cohort(monthStart),
    grossCents: week?.totalCents ?? null, sales: week?.sales || [],
    cashCents: receipts.reduce((total, payment) => total + Math.round(payment.amount * 100), 0), receipts,
    missingQuoteDates, missingPaymentDates: payments.filter(payment => !businessDate(payment.paid_at, now)).length };
}
