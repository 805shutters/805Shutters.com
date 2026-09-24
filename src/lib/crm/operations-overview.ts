import { normalizedProductLabel, splitProductTypes, scopedProductMeta, productTargetIdentity, productManufacturerKey, type ProductTargetRecord } from './product-workflow-groups';
import { trackingJobClosed } from "./job-closure";
import { shipmentEvidence, type ShipmentEvidence } from "./shipment-evidence";
import { losAngelesDateString } from "@/lib/booking/availability";
import { buildJobTrackingView, type JobTrackingViewItem } from "./job-tracking-view";
import { objectMeta } from "./measure-needed-state";
import { contractHeaderProducts, type HeaderProduct, type HeaderProductSource } from "./contract-header-products";
export { contractHeaderProducts } from "./contract-header-products";
export type { HeaderProduct, HeaderProductSource } from "./contract-header-products";
import { wholeJobRecordId, wholeJobWorkflowChecks } from "./whole-job-workflow";
import type { CrmCustomerProduct, CrmDashboardData } from "./types";

export const workflowSteps = ["quote", "sold", "ordered", "shipped", "installed", "paid"] as const;
export type WorkflowStep = typeof workflowSteps[number];
export const workflowLabels: Record<WorkflowStep, string> = { quote: "Quote", sold: "Sold", ordered: "Ordered", shipped: "Shipped", installed: "Installed", paid: "Balance paid" };
export type ProductProgress = { reconciledAt?: string; completionFromInstallation?: Partial<Record<"ordered" | "shipped", true>>; shipments?: ShipmentEvidence[]; undatedShipments?: number; id: string; name: string; manufacturer?: string | null; quantity?: number | null; ordered: boolean; shipped: boolean; installed: boolean; records: ProductTargetRecord[]; wholeJob?: boolean };
export type OperationsItem = { source: JobTrackingViewItem; products: ProductProgress[]; headerProducts: HeaderProduct[]; headerProductSource: HeaderProductSource | null; wholeJob: ProductProgress; quote: boolean; sold: boolean; installed: boolean; paid: boolean; archived: boolean; complete: boolean; closed: boolean };

function productProgress(product: CrmCustomerProduct, name: string, mixed: boolean): ProductProgress {
  const target: ProductTargetRecord = { id: product.id, updatedAt: product.updated_at, ...(mixed ? { productType: normalizedProductLabel(name) } : {}) };
  const meta = scopedProductMeta(product.meta, target);
  const status = mixed ? "" : (product.status || "").toLowerCase();
  const quantity = mixed ? null : product.quantity === 1 && (
    meta.source === "crm_job" ||
    (meta.source === "self_booking" && meta.windowCount == null)
  )
    ? null
    : Number.isInteger(product.quantity) && product.quantity > 0 ? product.quantity : null;
  // Preserve direct evidence separately from installation-based completion below.
  return {
    id: productTargetIdentity(target), name, manufacturer: product.supplier?.trim() || null, quantity, records: [target],
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

/** Physical completion establishes prerequisites, never event dates or financial settlement.
 * Re-evaluate current exact-scope evidence so a reopened/partial job cannot retain a stale check.
 */
export function installationPrerequisitesConfirmed(source: JobTrackingViewItem): boolean {
  const progress = source.progress;
  const financialOnly = new Set(["Deposit prerequisite outstanding", "Payment evidence unavailable"]);
  return source.isSale && !["lost", "archived"].includes(source.stageId)
    && progress.installation === "complete" && progress.service === "none_known"
    && objectMeta(source.job?.meta?.job_closure_override).closed !== false
    && progress.conflicts.length === 0
    && progress.blockers.every(blocker => financialOnly.has(blocker))
    && progress.freshness.every(source => source.state === "complete")
    && progress.evidence.some(evidence => ["recorded_installation", "installer_report", "completed_service_report"].includes(evidence.source));
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
      const names = splitProductTypes(product.product_type);
      for (const name of names.length ? names : ["Product type needed"]) {
        const key = JSON.stringify([normalizedProductLabel(name), productManufacturerKey(product)]);
        grouped.set(key, [...(grouped.get(key) || []), productProgress(product, name, names.length > 1)]);
      }
    }
    const progress: ProductProgress[] = [...grouped].map(([id, items]) => ({
      id,
      name: items[0].name,
      manufacturer: items[0].manufacturer,
      quantity: items.every(item => typeof item.quantity === "number") ? items.reduce((total, item) => total + item.quantity!, 0) : null,
      records: items.flatMap(item => item.records),
      undatedShipments: items.reduce((count, item) => count + (item.undatedShipments || 0), 0),
      shipments: [...new Map(items.flatMap(item => item.shipments || []).map(shipment => [JSON.stringify(shipment), shipment])).values()],
      ordered: items.every(item => item.ordered),
      shipped: items.every(item => item.shipped),
      installed: items.every(item => item.installed)
    }));
    const header = contractHeaderProducts(source);
    const wholeJob = wholeJobProgress(source);
    // A signed product must remain visible even when its customer-product row
    // was never created (or belongs to another quote alternative on this job).
    const parentMeta = source.row && source.row.source !== "crm_quote" ? source.row.meta
      : source.quote?.meta ?? source.row?.meta ?? source.job?.meta;
    for (const expected of header.products) {
      if (progress.some(product => normalizedProductLabel(product.name) === normalizedProductLabel(expected.name))) continue;
      const target = { ...wholeJob.records[0], productType: normalizedProductLabel(expected.name) };
      const meta = scopedProductMeta(parentMeta, target);
      const shipments = shipmentEvidence(meta);
      progress.push({
        id: productTargetIdentity(target), name: expected.name, quantity: expected.quantity,
        manufacturer: null, records: [target], shipments,
        ordered: Boolean(meta.ordered_at), shipped: Boolean(meta.shipped_at), installed: Boolean(meta.installed_at),
        undatedShipments: meta.shipped_at && !shipments.length ? 1 : 0
      });
    }
    if (installationPrerequisitesConfirmed(source)) {
      for (const product of [...progress, wholeJob]) {
        const inferred: ProductProgress["completionFromInstallation"] = {};
        for (const step of ["ordered", "shipped"] as const) {
          if (!product[step]) { product[step] = true; inferred[step] = true; }
        }
        if (Object.keys(inferred).length) {
          product.completionFromInstallation = inferred;
          const reconciliation = objectMeta(objectMeta(source.job?.meta?.workflow_reconciliation)[source.id]);
          const entries = Array.isArray(reconciliation.products) ? reconciliation.products : [];
          if (reconciliation.rule === "installed-prerequisites-v1" && entries.some(entry => objectMeta(entry).id === product.id)
            && typeof reconciliation.recorded_at === "string") product.reconciledAt = reconciliation.recorded_at;
        }
      }
    }
    return { source, products: progress, headerProducts: header.products, headerProductSource: header.source, wholeJob, quote: Boolean(source.quote), sold: source.isSale,
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

export const performancePeriods = [
  { id: "weekly", label: "Weekly", description: "Week to date" },
  { id: "monthly", label: "Monthly", description: "Month to date" },
  { id: "threeMonths", label: "3 Months", description: "Current + previous 2 months" },
  { id: "sixMonths", label: "6 Months", description: "Current + previous 5 months" }
] as const;
export type PerformancePeriod = typeof performancePeriods[number]["id"];

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
  const payments = [...new Map(data.bookkeepingPayments.map(payment => [payment.id, payment])).values()];
  const allSales = [...new Map((data.closedSales?.weeks.flatMap(week => week.sales) || []).map(sale => [sale.id, sale])).values()];
  const monthOffset = (offset: number) => {
    const start = new Date(`${monthStart}T12:00:00Z`);
    start.setUTCMonth(start.getUTCMonth() - offset);
    return start.toISOString().slice(0, 10);
  };
  const range = (start: string) => {
    const receipts = payments.filter(payment => { const day = businessDate(payment.paid_at, now); return day && day >= start && Number.isFinite(payment.amount); });
    const sales = allSales.filter(sale => { const day = businessDate(sale.signedAt, now); return day && day >= start; });
    return { start, end: today, cohort: cohort(start), sales, receipts,
      grossCents: data.closedSales ? sales.reduce((total, sale) => total + sale.amountCents, 0) : null,
      cashCents: receipts.reduce((total, payment) => total + Math.round(payment.amount * 100), 0) };
  };
  const periods = { weekly: range(weekStart), monthly: range(monthStart), threeMonths: range(monthOffset(2)), sixMonths: range(monthOffset(5)) };
  return { today, weekStart, monthStart, periods, weekly: periods.weekly.cohort, monthly: periods.monthly.cohort,
    grossCents: periods.weekly.grossCents, sales: periods.weekly.sales,
    cashCents: periods.weekly.cashCents, receipts: periods.weekly.receipts,
    missingQuoteDates, missingPaymentDates: payments.filter(payment => !businessDate(payment.paid_at, now)).length };
}
