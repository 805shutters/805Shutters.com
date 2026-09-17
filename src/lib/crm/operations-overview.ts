import { losAngelesDateString } from "@/lib/booking/availability";
import { buildJobTrackingView, type JobTrackingViewItem } from "./job-tracking-view";
import { objectMeta } from "./measure-needed-state";
import type { CrmCustomerProduct, CrmDashboardData } from "./types";

export const workflowSteps = ["quote", "sold", "ordered", "shipped", "installed", "paid"] as const;
export type WorkflowStep = typeof workflowSteps[number];
export const workflowLabels: Record<WorkflowStep, string> = { quote: "Quote", sold: "Sold", ordered: "Ordered", shipped: "Shipped", installed: "Installed", paid: "Balance paid" };
export type ProductProgress = { id: string; name: string; ordered: boolean; shipped: boolean; installed: boolean };
export type OperationsItem = { source: JobTrackingViewItem; products: ProductProgress[]; quote: boolean; sold: boolean; installed: boolean; paid: boolean; archived: boolean; complete: boolean };

function productProgress(product: CrmCustomerProduct): ProductProgress {
  const meta = objectMeta(product.meta);
  const status = (product.status || "").toLowerCase();
  // Each milestone needs its own source evidence; payment or a later workflow
  // marker must never fabricate a manufacturer order or shipment.
  return {
    id: product.id, name: product.product_type.trim() || "Product type needed",
    ordered: Boolean(meta.ordered_at || status === "ordered"),
    shipped: Boolean(meta.shipped_at || meta.received_at || ["shipped", "received", "delivered"].includes(status)),
    installed: Boolean(meta.installed_at || status === "installed")
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
    const progress = [...grouped].map(([id, items]) => ({ id, name: items[0].name, ordered: items.every(item => item.ordered), shipped: items.every(item => item.shipped), installed: items.every(item => item.installed) }));
    return { source, products: progress, quote: Boolean(source.quote), sold: source.isSale,
      installed: source.progress.installation === "complete",
      paid: source.isSale && source.progress.payment === "settled",
      complete: source.progress.stage === "complete",
      archived: ["lost", "archived"].includes(source.stageId) };
  });
}

export function stepComplete(item: OperationsItem, step: WorkflowStep): boolean {
  return step === "ordered" || step === "shipped" ? item.products.length > 0 && item.products.every(product => product[step]) : item[step];
}
export function workflowSummary(items: OperationsItem[], step: WorkflowStep) {
  const eligible = items.filter(item => !item.archived && (["quote", "sold"].includes(step) || item.sold));
  if (step === "ordered" || step === "shipped") {
    const products = eligible.flatMap(item => item.products);
    return { done: products.filter(product => product[step]).length, total: products.length, unit: "product types", unknown: eligible.filter(item => !item.products.length).length };
  }
  return { done: eligible.filter(item => stepComplete(item, step)).length, total: eligible.length, unit: "jobs", unknown: 0 };
}
export function attentionDetail(item: OperationsItem, step: WorkflowStep) {
  if (step === "ordered" || step === "shipped") return item.products.length ? item.products.filter(product => !product[step]).map(product => product.name).join(", ") + (step === "ordered" ? " · Order not confirmed" : " · Shipment not confirmed") : "Product breakdown needs review";
  if (step === "quote") return "Quote not recorded";
  if (step === "sold") return "Sale not recorded · Review quote";
  if (step === "installed") return item.source.nextAction || "Installation not confirmed";
  return item.source.balanceOutstanding === null ? "Balance needs verification" : `${currency(item.source.balanceOutstanding)} remaining`;
}
export const currency = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);

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
