"use client";

import { type ActiveJobsSnapshot } from "@/lib/crm/active-jobs";
import { shipmentDateLabel, type ShipmentEvidence } from "@/lib/crm/shipment-evidence";
import { installationCost } from "@/lib/crm/installation-estimate";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, CalendarDays, Check, Circle, FileClock, FileText, LoaderCircle, PackagePlus, Ruler, Search, Trash2 } from "lucide-react";
import { canDeleteCustomerFile } from "@/lib/crm/customer-file-deletion";
import { monthlyGrossSales, monthlySalesAverage } from "@/lib/crm/monthly-sales";
import { weeklySalesAverage } from "@/lib/crm/weekly-sales-average";
import type { CrmCalendarEvent, CrmCustomerFile, CrmDashboardData } from "@/lib/crm/types";
import { WEEKLY_GROSS_SALES_GOAL_CENTS, performancePeriods, type PerformancePeriod, attentionDetail, buildOperationsItems, buildPerformanceMetrics, currency, formatOperationsDate, stepComplete, workflowLabels, workflowSteps, workflowSummary, type OperationsItem, type ProductProgress, type WorkflowStep } from "@/lib/crm/operations-overview";
import type { JobTrackingViewItem } from "@/lib/crm/job-tracking-view";
import { jobContractPreviewUrl } from "@/lib/crm/job-contract-preview";
import { type SaveJobCost } from "./InlineJobCost";
import { CustomerEmailStatus } from "./CustomerEmailStatus";
import { InlineJobContract } from "./InlineJobContract";
import { ProductOrderEditor, orderCostParent, orderCostTotal, displayedOrderAmount } from "./ProductOrderEditor";
import { allocatedOrderCost, type ProductOrderInvoiceInput } from "@/lib/crm/product-order-cost";
import { jobStatusFilters, matchesJobStatusFilter, type JobStatusFilter } from "@/lib/crm/job-status-filters";
import { buildJobStatusQueues, isJobStatusQueue, jobStatusQueues, statusQueueJobKey, type JobStatusQueueId } from "@/lib/crm/job-status-queues";
import styles from "./OperationsOverview.module.css";
import { InHousePayments, inHouseRequest } from "./InHousePayments";
import type { PaymentPlan } from "@/lib/crm/in-house-plan-model";
import { jobPaymentColumns, type JobPaymentColumn, type JobPaymentColumns } from "@/lib/crm/job-payment-columns";

function displayDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }

type Props = { data: CrmDashboardData | null; busy: boolean; onOpen: (item: JobTrackingViewItem) => void; onStatus?: () => void; onSales?: (weekStart: string) => void; onPayments?: () => void };
export function CompletionMark({ done }: { done: boolean }) {
  return <span className={`${styles.mark} ${done ? styles.done : ""}`} role="img" aria-label={done ? "Complete" : "Not confirmed"}>{done ? <Check size={17} strokeWidth={3} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}</span>;
}
function Ring({ value }: { value: number | null }) {
  return <svg className={styles.ring} viewBox="0 0 48 48" role="img" aria-label={value === null ? "No quoted customers in this period" : `${value.toFixed(1)} percent closed`}><circle cx="24" cy="24" r="20" fill="none" stroke="var(--op-line)" strokeWidth="4" /><circle cx="24" cy="24" r="20" fill="none" stroke="var(--op-silver)" strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray={`${value || 0} 100`} transform="rotate(-90 24 24)" /></svg>;
}
export function OperationsDashboard({ data, busy, onOpen, onStatus, onSales, onPayments }: Props) {
  const [period, setPeriod] = useState<PerformancePeriod>("weekly");
  const [salesMonthStart, setSalesMonthStart] = useState<string | null>(null);
  const [salesWeekStart, setSalesWeekStart] = useState<string | null>(null);
  const [step, setStep] = useState<WorkflowStep>("ordered");
  const [metric, setMetric] = useState<"close" | "quoted" | "gross" | "cash" | null>(null);
  const items = useMemo(() => data ? buildOperationsItems(data) : [], [data]);
  const metrics = useMemo(() => data ? buildPerformanceMetrics(data) : null, [data]);
  if (!data || !metrics) return <section className={styles.workspace} role="status">{busy ? "Loading dashboard…" : "Dashboard records are unavailable. Refresh to try again."}</section>;
  const attention = items.filter(item => !item.archived && (["quote", "sold"].includes(step) || item.sold) && !stepComplete(item, step));
  const selected = metrics.periods[period];
  const salesWeekIndex = Math.max(0, metrics.grossWeeks.findIndex(week => week.start === (salesWeekStart || metrics.weekStart)));
  const salesWeek = metrics.grossWeeks[salesWeekIndex] || { start: metrics.weekStart, end: metrics.weekEnd, grossCents: null, status: "unavailable", sales: [], isCurrent: true };
  const hasEarlierWeek = salesWeekIndex + 1 < metrics.grossWeeks.length;
  const hasLaterWeek = salesWeekIndex > 0;
  const isMonthly = period === "monthly";
  const grossMonths = monthlyGrossSales(data.closedSales, metrics.today);
  const salesMonthIndex = Math.max(0, grossMonths.findIndex(month => month.start === (salesMonthStart || metrics.monthStart)));
  const salesMonth = grossMonths[salesMonthIndex] || { start: metrics.monthStart, end: metrics.today, grossCents: null, sales: [], isCurrent: true };
  const salesPeriod = isMonthly ? salesMonth : salesWeek;
  const hasEarlier = isMonthly ? Boolean(data.closedSales) && salesMonthIndex + 1 < grossMonths.length : hasEarlierWeek;
  const hasLater = isMonthly ? Boolean(data.closedSales) && salesMonthIndex > 0 : hasLaterWeek;
  const average = isMonthly ? monthlySalesAverage(data.closedSales, Number(salesMonth.start.slice(0, 4)), metrics.today) : weeklySalesAverage(data.closedSales, Number((salesWeek.isCurrent ? metrics.today : salesWeek.start).slice(0, 4)), metrics.weekStart);
  const dateRange = `${displayDate(selected.start)} – ${displayDate(selected.end)}`;
  const definitions = {
    close: "Customers first sent a quote in this period who have a dated sale, divided by all customers first sent a quote in this period. Each customer counts once; quote alternatives do not inflate the rate.",
    quoted: "Unique customers first sent a quote in this period. Repeat quotes and quote alternatives count once per customer.",
    gross: isMonthly ? "Signed contract value for the selected calendar month in Los Angeles time. Use the arrows to browse months; This month returns to the current month. Monthly average uses completed calendar months in the displayed year, including zero-sales months and excluding the current partial month. Tracking starts July 2026, the first full month after the June 29 reporting baseline. Later years start January 1. Deposits and balance receipts are reported separately." : "Signed contract value for the selected Monday–Sunday week in Los Angeles time. Use the arrows to browse weeks; This week returns to the current week. The weekly goal is $14,000: red below the goal and green at or above it. Deposits and balance receipts are reported separately. The average uses actual recorded signed gross sales in the displayed calendar year, starting with June 29–July 5 as Week 1 for 2026. Earlier weeks are excluded from goal tracking and the average. Later calendar years start January 1. Every completed week from that starting point is included, even with zero sales. The current year stops at the last completed Sunday. Weeks crossing January 1 count in each year using only that year’s sales.",
    cash: "Recorded customer payments received in the selected period, including deposits and balances, less recorded refunds. Credits and invoices are not cash receipts. This is not profit."
  };
  const cohort = metric === "close" || metric === "quoted" ? selected.cohort : null;
  return <section className={styles.workspace} aria-label="Dashboard" aria-busy={busy}>
    {data.loadWarnings?.map(warning => <p className={styles.warning} role="status" key={warning}>{warning}</p>)}
    <div className={styles.periodToolbar}>
      <div className={styles.periodTabs} role="tablist" aria-label="Dashboard time period">{performancePeriods.map((option, index) => <button type="button" role="tab" id={`period-${option.id}`} aria-controls="dashboard-period-metrics" aria-selected={period === option.id} tabIndex={period === option.id ? 0 : -1} key={option.id} onClick={() => setPeriod(option.id)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % performancePeriods.length : event.key === "ArrowLeft" ? (index + performancePeriods.length - 1) % performancePeriods.length : event.key === "Home" ? 0 : event.key === "End" ? performancePeriods.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); setPeriod(performancePeriods[next].id);
        document.getElementById(`period-${performancePeriods[next].id}`)?.focus();
      }}>{option.label}</button>)}</div>
      <span>{dateRange}</span>
    </div>
    <div id="dashboard-period-metrics" role="tabpanel" aria-labelledby={`period-${period}`} aria-live="polite">
    <div className={styles.metrics}>
      <button type="button" className={styles.metric} aria-expanded={metric === "close"} onClick={() => setMetric(metric === "close" ? null : "close")}><span>Close rate</span><div><strong>{selected.cohort.percent === null ? "—" : `${selected.cohort.percent.toFixed(1)}%`}</strong><Ring value={selected.cohort.percent} /></div><small>{selected.cohort.sold} sold / {selected.cohort.quoted} quoted customers</small><small>{dateRange}</small></button>
      <button type="button" className={styles.metric} aria-expanded={metric === "quoted"} onClick={() => setMetric(metric === "quoted" ? null : "quoted")}><span>Quoted customers</span><div><strong>{selected.cohort.quoted}</strong></div><small>Unique customers first quoted</small><small>{dateRange}</small></button>
      <div className={`${styles.metric} ${styles.salesMetric}`} data-sales-status={isMonthly ? undefined : salesWeek.status}>
        <button type="button" className={styles.salesMetricDetails} aria-expanded={onSales && !isMonthly ? undefined : metric === "gross"} onClick={() => onSales && !isMonthly ? onSales(salesWeek.start) : setMetric(metric === "gross" ? null : "gross")}>
          <span>{isMonthly ? "Monthly gross revenue" : "Weekly gross sales status"}</span>
          <div><strong>{salesPeriod.grossCents === null ? "Unavailable" : currency(salesPeriod.grossCents / 100)}</strong></div>
          {!isMonthly && <small>{salesWeek.status === "unavailable" ? "Status unavailable" : salesWeek.status === "met" ? "Goal met" : "Below goal"} · Goal {currency(WEEKLY_GROSS_SALES_GOAL_CENTS / 100)}</small>}
          <small>Signed contract value · {isMonthly ? salesMonth.isCurrent ? "Month to date" : "Completed month" : salesWeek.isCurrent ? "Week to date" : "Completed week"}</small>
          <small>{displayDate(salesPeriod.start)}{salesPeriod.start.slice(0, 4) !== salesPeriod.end.slice(0, 4) ? `, ${salesPeriod.start.slice(0, 4)}` : ""} – {displayDate(salesPeriod.end)}, {salesPeriod.end.slice(0, 4)}{isMonthly ? "" : " · Mon–Sun"}</small>
        </button>
        <nav className={styles.salesWeekNavigation} aria-label={isMonthly ? "Monthly gross revenue navigation" : "Weekly gross sales navigation"}>
          <button type="button" aria-label={isMonthly ? "Previous sales month" : "Previous sales week"} title={isMonthly ? "Previous month" : "Previous week"} disabled={!hasEarlier} onClick={() => isMonthly ? setSalesMonthStart(grossMonths[salesMonthIndex + 1].start) : setSalesWeekStart(metrics.grossWeeks[salesWeekIndex + 1].start)}><ArrowLeft size={18} aria-hidden="true" /></button>
          <button type="button" disabled={!hasLater} onClick={() => isMonthly ? setSalesMonthStart(null) : setSalesWeekStart(null)}>{isMonthly ? "This month" : "This week"}</button>
          <button type="button" aria-label={isMonthly ? "Next sales month" : "Next sales week"} title={isMonthly ? "Next month" : "Next week"} disabled={!hasLater} onClick={() => isMonthly ? setSalesMonthStart(salesMonthIndex === 1 ? null : grossMonths[salesMonthIndex - 1].start) : setSalesWeekStart(salesWeekIndex === 1 ? null : metrics.grossWeeks[salesWeekIndex - 1].start)}><ArrowRight size={18} aria-hidden="true" /></button>
        </nav>
        <section className={styles.salesAverage} aria-label={isMonthly ? "Average monthly gross revenue" : "Average weekly gross sales"} title={isMonthly ? "Completed calendar months in this year, starting July 2026; includes zero-sales months and excludes the current partial month." : undefined}>
          <span>{isMonthly ? "Monthly average" : "AVG"}</span>
          <strong>{average.averageCents === null ? "—" : currency(average.averageCents / 100)}</strong>
        </section>
      </div>
      <button type="button" className={styles.metric} aria-expanded={metric === "cash"} onClick={() => setMetric(metric === "cash" ? null : "cash")}><span>Payments collected</span><div><strong>{currency(selected.cashCents / 100)}</strong></div><small>Deposits + balances, less refunds</small><small>{dateRange}</small></button>
    </div>
    {metric && <section className={styles.explanation}><p>{definitions[metric]}</p>{cohort && <><p>{metrics.missingQuoteDates} quote records lack a valid sent date and cannot establish a cohort.</p>{cohort.customers.length ? <ul>{cohort.customers.map(person => <li key={person.id}>{person.name} · {person.sold ? "Sold" : "Sale pending"}</li>)}</ul> : <p>No dated quoted customers in this period.</p>}</>}{metric === "gross" && <>{salesPeriod.grossCents === null ? <p>Signed sales history is unavailable.</p> : salesPeriod.sales.length ? <ul>{salesPeriod.sales.map(sale => <li key={sale.id}>{sale.customerName} · {sale.reference} · {currency(sale.amountCents / 100)}</li>)}</ul> : <p>No signed sales in this {isMonthly ? "month" : "week"}.</p>}{!isMonthly && <button type="button" onClick={() => onSales?.(salesWeek.start)}>Open signed sales history <ArrowRight size={14} /></button>}</>}{metric === "cash" && <><p>{selected.receipts.length} dated receipts in this period · {metrics.missingPaymentDates} receipt records have missing, invalid, or future dates.</p><button type="button" onClick={onPayments}>Open payment records <ArrowRight size={14} /></button></>}</section>}
    </div>
    <div className={styles.sectionHeading}><h2>Workflow completion</h2><span>Select a step to see what needs attention</span></div>
    <div className={styles.stages}>{workflowSteps.map(id => { const value = workflowSummary(items, id); return <button key={id} type="button" aria-pressed={step === id} className={styles.stage} onClick={() => setStep(id)}><div><span>{workflowLabels[id]}</span><CompletionMark done={value.total > 0 && value.done === value.total && value.unknown === 0} /></div><strong>{value.done}<small> / {value.total}</small></strong><small>{value.unit}</small><span>{value.total ? `${Math.round(value.done / value.total * 100)}% complete` : "No records"}</span>{value.unknown > 0 && <small>{value.unknown} jobs need product details</small>}</button>; })}</div>
    <section className={styles.attention} aria-live="polite"><header><div><h2>Needs attention · {workflowLabels[step]}</h2><p>Review the customer record to complete the next step.</p></div><span>{attention.length} jobs</span></header>{attention.length ? attention.map(item => <div className={styles.attentionRow} key={item.source.id}><span className={styles.initials} aria-hidden="true">{item.source.customerName.split(" ").map(part => part[0]).slice(0, 2).join("")}</span><div><strong>{item.source.customerName}</strong><small>{attentionDetail(item, step)}</small></div><button type="button" onClick={() => onOpen(item.source)}>Review job <ArrowRight size={14} /></button></div>) : <p className={styles.empty}><CompletionMark done={true} /> No unfinished jobs in this step.</p>}</section>
    <footer className={styles.footer}><span>{items.filter(item => !item.archived && item.complete).length} jobs installed and paid</span><button type="button" onClick={onStatus}>Open job status <ArrowRight size={14} /></button></footer>
  </section>;
}

const statusColumns = ["Quote", "Sold", "Deposit", "Ordered", "Shipped", "Installed", "Balance paid"];
const threePaymentStatusColumns = ["Quote", "Sold", "Deposit", "Second payment", "Ordered", "Shipped", "Installed", "Balance"];

type WorkflowActionStep = WorkflowStep | "deposit";
export type WorkflowAction = (item: OperationsItem, step: WorkflowActionStep, product?: ProductProgress, invoice?: ProductOrderInvoiceInput, shipment?: ShipmentEvidence) => Promise<string | void>;
function CompletionButton({ done, label, disabled, saving, onClick }: { done: boolean; label: string; disabled: boolean; saving?: boolean; onClick: () => void }) {
  return <button type="button" className={styles.completionButton} aria-label={label} title={label} aria-pressed={done} aria-busy={saving || undefined} disabled={disabled} onClick={onClick}>{saving ? <LoaderCircle className={styles.savingMark} size={24} aria-hidden="true" /> : <CompletionMark done={done} />}</button>;
}
function OrderAmount({ item, product }: { item: OperationsItem; product: ProductProgress }) {
  const cost = displayedOrderAmount(item, product);
  return <small>{cost ? `${cost.source === "job" ? "Job cost: " : ""}${currency(cost.amount)}` : product.completionFromInstallation?.ordered ? "Completed from installation · Invoice unrecorded" : "Enter invoice"}</small>;
}

export function ProductChecks({ item, step, disabled, pending, onAction }: { item: OperationsItem; step: "ordered" | "shipped"; disabled: boolean; pending: string | null; onAction: (item: OperationsItem, step: WorkflowActionStep, product?: ProductProgress) => void }) {
  const checks = item.products.length ? item.products : [item.wholeJob];
  return <div className={styles.productChecks}>{checks.map(product => <div className={styles.product} key={product.id} style={{minHeight: 140 + Math.max(0, new Set((product.shipments || []).map(shipment => shipment.shippedOn)).size - 1) * 36 + ((product.shipments?.length && (!product.shipped || product.undatedShipments)) ? 32 : 0)}}><CompletionButton done={product[step]} label={`${product[step] ? "Review" : "Mark"} ${product.wholeJob ? "whole job" : [product.name, product.manufacturer].filter(Boolean).join(" · ")} ${step} for ${item.source.customerName}`} disabled={disabled} saving={pending === `${item.source.id}:${step}:${product.id}`} onClick={() => onAction(item, step, product)} /><span title={product.name} className={product[step] ? styles.completeText : undefined}>{product.wholeJob ? "Whole job" : product.name}</span><small title={product.manufacturer || "Manufacturer not recorded"} className={styles.productManufacturer}>{product.wholeJob ? "" : product.manufacturer || "Manufacturer not recorded"}</small>{step === "ordered" ? <OrderAmount item={item} product={product} /> : <ShipmentDates product={product} />}</div>)}{item.products.length ? <small className={styles.productCount}>{`${checks.filter(product => product[step]).length} of ${checks.length} complete`}</small> : null}</div>;
}
export function ShipmentDates({ product }: { product: ProductProgress }) {
  const dates = [...new Set((product.shipments || []).map(shipment => shipment.shippedOn).filter((date): date is string => Boolean(date)))].sort();
  return <small className={styles.shipmentDates}>{product.completionFromInstallation?.shipped && <span>Completed from installation · </span>}{dates.map(date => <time key={date} dateTime={date}>Shipped {shipmentDateLabel(date)}</time>)}{dates.length > 0 && (product.undatedShipments || 0) > 0 ? "Some ship dates unconfirmed" : product.shipped && !dates.length ? "Ship date unconfirmed" : !product.shipped ? dates.length ? "Partially shipped" : "Awaiting shipment" : null}{[...new Map((product.shipments || []).filter(shipment => shipment.trackingNumber).map(shipment => [shipment.orderReference, shipment])).values()].map(shipment => <span key={shipment.orderReference}>{[shipment.carrier, shipment.trackingNumber].filter(Boolean).join(" · ")}</span>)}</small>;
}
export function JobStatusOverview({ data, activeSnapshot, onLoadAll, onDeleteFileId, busy, onOpen, onOpenAppointment, onAction, onDelete, onPaymentChanged }: Props & { activeSnapshot?: ActiveJobsSnapshot | null; onLoadAll?: () => Promise<unknown>; onDeleteFileId?: (id: string) => Promise<void>; onOpenAppointment?: (event: CrmCalendarEvent) => void; onAction: WorkflowAction; onSaveCost: SaveJobCost; onDelete?: (file: CrmCustomerFile) => Promise<void>; onPaymentChanged?: () => Promise<unknown> }) {
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>([]);
  const [plansAvailable, setPlansAvailable] = useState(false);
  const [planError, setPlanError] = useState("");
  const [planRefresh, setPlanRefresh] = useState(0);
  const [paymentSelection, setPaymentSelection] = useState<{ itemId: string; planId: string; number: number } | null>(null);
  const paymentTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!data && !activeSnapshot) return;
    let current = true;
    setPlansAvailable(false);
    void inHouseRequest("/api/crm/in-house-plans/")
      .then((result: { plans: PaymentPlan[] }) => {
        if (current) { setPaymentPlans(result.plans); setPlansAvailable(true); setPlanError(""); }
      })
      .catch(cause => { if (current) setPlanError(cause instanceof Error ? cause.message : "Payment tracking unavailable."); });
    return () => { current = false; };
  }, [data, activeSnapshot, planRefresh]);
  const paymentsFor = (item: OperationsItem) => jobPaymentColumns(item.source, paymentPlans, plansAvailable);
  function showPayment(item: OperationsItem, payments: JobPaymentColumns, number: number) {
    if (!payments.plan) { onOpen(item.source); return; }
    paymentTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPaymentSelection({ itemId: item.source.id, planId: payments.plan.id, number });
  }
  function closePayment() { setPaymentSelection(null); paymentTrigger.current?.focus(); }
  async function paymentChanged() { setPlanRefresh(value => value + 1); await onPaymentChanged?.(); }
  const paymentCell = (item: OperationsItem, payments: JobPaymentColumns, number: number) => {
    const payment = payments.payments[number - 1];
    return <div className={styles.paymentCell}>
      <CompletionButton done={payment.paid} label={`${payment.paid ? "Review" : "Record"} ${payment.label} for ${item.source.customerName}`} disabled={disabled || !plansAvailable} onClick={() => showPayment(item, payments, number)} />
      <small>{payment.amount === null ? "—" : currency(payment.amount)}</small>
      <small className={payment.paid ? styles.completeText : undefined}>{!payments.verified ? "Verify receipts" : payment.paid ? "Paid" : (payment.received || 0) > 0 ? "Partially paid" : "Unpaid"}</small>
      {payment.received !== null && payment.received > 0 && !payment.paid && <small>Received {currency(payment.received)} · Remaining {currency(payment.remaining!)}</small>}
      <small>{paymentDateNote(payment)}</small>
    </div>;
  };
  const [orderEditor, setOrderEditor] = useState<{item:OperationsItem;product:ProductProgress} | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const contractButtons = useRef(new Map<string, HTMLButtonElement>());
  function closeContract() {
    if (contractId) contractButtons.current.get(contractId)?.focus();
    setContractId(null);
  }
  function toggleContract(itemId: string, trigger?: HTMLButtonElement) {
    if (trigger) contractButtons.current.set(itemId, trigger);
    setContractId(current => current === itemId ? null : itemId);
  }
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const lock = useRef(false);
  async function act(item: OperationsItem, step: WorkflowActionStep, product?: ProductProgress) {
    if (lock.current || busy) return;
    if (step === "ordered" && product) { setOrderEditor({item,product}); return; }
    setFeedbackId(item.source.id);
    lock.current = true; setPending(`${item.source.id}:${step}:${product?.id || ""}`); setError(""); setNotice("");
    try { const message = await onAction(item, step, product); if (message) setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Update failed. Refresh and try again."); }
    finally { lock.current = false; setPending(null); }
  }
  const [loadingAll, setLoadingAll] = useState(false);
  const disabled = busy || pending !== null || loadingAll;
  const mark = (item: OperationsItem, step: WorkflowActionStep) => {
    const done = step === "deposit" ? (item.sold || (item.source.depositReceived ?? 0) > 0) && item.source.depositOutstanding !== null && item.source.depositOutstanding <= 0.005 : stepComplete(item, step);
    const label = step === "deposit" ? "Deposit" : workflowLabels[step];
    return <CompletionButton done={done} label={`${done ? "Review" : step === "quote" ? "Open" : ["sold", "paid", "deposit"].includes(step) ? "Record" : "Mark"} ${label} for ${item.source.customerName}`} disabled={disabled} saving={pending === `${item.source.id}:${step}:`} onClick={() => void act(item, step)} />;
  };
  const [condensed, setCondensed] = useState(false);
  function changeDensity(value: boolean) {
    setCondensed(value);
    setContractId(null);
  }
  const [filter, setFilter] = useState<JobStatusFilter | JobStatusQueueId>("active_jobs");
  const [search, setSearch] = useState("");
  const searchQuery = search.trim().toLowerCase();
  const searchLoadRequested = useRef(false);
  useEffect(() => {
    if (!searchQuery) { searchLoadRequested.current = false; return; }
    if (data || !onLoadAll || searchLoadRequested.current) return;
    searchLoadRequested.current = true;
    setLoadingAll(true); setError(""); setFeedbackId(null);
    void onLoadAll()
      .catch(cause => setError(`${cause instanceof Error ? cause.message : "Jobs could not be loaded."} Clear search and try again.`))
      .finally(() => setLoadingAll(false));
  }, [searchQuery, data, onLoadAll]);
  useEffect(() => { const jobId = new URLSearchParams(window.location.search).get("jobId"); if (jobId) { setSearch(jobId); setFilter("all"); } }, []);
  const items = useMemo(() => data ? buildOperationsItems(data) : activeSnapshot?.items || [], [data, activeSnapshot]);
  const queues = useMemo(() => data ? buildJobStatusQueues(data, items) : activeSnapshot?.queues, [data, items, activeSnapshot]);
  async function selectFilter(next: JobStatusFilter | JobStatusQueueId) {
    if (loadingAll) return;
    if (next !== "active" && !(isJobStatusQueue(next) && queues) && !data && onLoadAll) {
      setLoadingAll(true); setError(""); setFeedbackId(null);
      try { await onLoadAll(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Jobs could not be loaded. Try again."); return; }
      finally { setLoadingAll(false); }
    }
    if (isJobStatusQueue(next)) setSearch("");
    setFilter(next);
  }
  const appointmentQueue = !searchQuery && (filter === 'upcoming_quotes' || filter === 'pending_quotes');
  const appointments = appointmentQueue ? queues?.[filter as 'upcoming_quotes' | 'pending_quotes'] || [] : [];
  const visible = items.filter(item => {
    if (!searchQuery) {
      if (appointmentQueue) return false;
      if (isJobStatusQueue(filter)) return (queues?.[filter] as string[] | undefined)?.includes(statusQueueJobKey(item)) && item.sold && !item.closed && !item.archived;
      return matchesJobStatusFilter(item, filter);
    }
    // Search the complete workspace regardless of the selected workflow filter.
    if (!data) return false;
    return [item.source.id, item.source.job?.id, item.source.quote?.id, item.source.row?.jobId, item.source.customerName, item.source.project, item.source.phone, ...item.products.map(product => product.name)].join(" ").toLowerCase().includes(searchQuery);
  });
  const hasThreePayments = visible.some(item => paymentsFor(item));
  const paymentPanel = paymentSelection && <InHousePayments key={`${paymentSelection.planId}:${paymentSelection.number}`} planId={paymentSelection.planId} initialInstallmentNumber={paymentSelection.number} initiallyOpen onChanged={paymentChanged} />;
  return <section className={`${styles.workspace}${condensed ? ` ${styles.condensedWorkspace}` : ""}`} aria-label="Job status" aria-busy={busy}>
    <div className={styles.statusQueues} aria-label="Job status queues">
      {jobStatusQueues.map((queue, index) => { const Icon = [CalendarDays, FileClock, Ruler, PackagePlus, BriefcaseBusiness][index]; return <button type="button" className={styles.statusQueue} key={queue.id} disabled={loadingAll} aria-pressed={!searchQuery && filter === queue.id} onClick={() => void selectFilter(queue.id)}><span className={styles.statusQueueLabel}><Icon size={16} aria-hidden="true" />{queue.label}</span><strong>{queues ? queues[queue.id].length : "—"}</strong><small>{queue.context}</small></button>; })}
    </div>
    <CustomerEmailStatus compact />
    <div className={styles.toolbar}><nav aria-label="Job status filters">{jobStatusFilters.map(({id, label, description}) => <button type="button" key={id} title={description} disabled={loadingAll} aria-pressed={filter === id} onClick={() => void selectFilter(filter === id ? "active" : id)}>{label}</button>)}</nav><div className={styles.viewOptions} role="radiogroup" aria-label="Job view"><label className={styles.densityToggle}><input type="radio" name="job-view" checked={!condensed} onChange={() => changeDensity(false)} />Card view</label><label className={styles.densityToggle}><input type="radio" name="job-view" checked={condensed} onChange={() => changeDensity(true)} />List view</label></div><label><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search jobs" placeholder="Search all jobs" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    {loadingAll ? <p role="status">Loading all jobs…</p> : searchQuery && data ? <p role="status">Searching all job statuses</p> : null}
    {error && !feedbackId && <p role="alert" className={styles.warning}>{error}</p>}
    {planError && <p role="status" className={styles.warning}>In-house payment tracking: {planError} <button type="button" onClick={() => setPlanRefresh(value => value + 1)}>Retry payment tracking</button></p>}
    {(data?.loadWarnings || activeSnapshot?.loadWarnings)?.map(warning => <p className={styles.warning} key={warning}>{warning}</p>)}
    {condensed && feedbackId && (error || notice) && <p className={styles.rowFeedback} role={error ? "alert" : "status"}>{items.find(item => item.source.id === feedbackId)?.source.customerName}: {error || notice}</p>}
    {appointmentQueue && <div className={styles.appointmentQueue} aria-label={filter === 'upcoming_quotes' ? 'Upcoming quote appointments' : 'Pending quote appointments'}>{appointments.map(event => <article className={styles.appointmentCard} key={event.id}><div><strong>{event.customer_name || event.title}</strong><small>{new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(event.start_at))} · {event.assigned_to}</small><small>{event.customer_address || event.location || 'Address needed'}</small></div><div><span>{filter === 'pending_quotes' ? 'Quote not sent' : 'Consultation scheduled'}</span>{onOpenAppointment && <button type="button" onClick={() => onOpenAppointment(event)}>Open appointment <ArrowRight size={14} /></button>}</div></article>)}</div>}
    {appointmentQueue ? null : condensed ? <div className={styles.condensedScroll} role="region" aria-label="Condensed customer jobs" tabIndex={0}>
      <table className={styles.condensedTable}>
        <caption className={styles.srOnly}>One line per customer job. Product numbers correspond across Ordered, Shipped, and product details. Scroll horizontally for all fields.</caption>
        <thead><tr>{["Customer", "Date sold", ...(hasThreePayments ? threePaymentStatusColumns : statusColumns), "Contract total", hasThreePayments ? "Deposit amount" : "Deposit collected", ...(hasThreePayments ? ["Second payment amount"] : []), hasThreePayments ? "Balance amount" : "Balance due", ...(hasThreePayments ? ["Total still owed"] : []), "Cost of goods", "Installation cost", "Profit · Before buyout", "Margin · Contract less COGS", "10% buyout", "Product quantities", "Product / manufacturer", "Invoice cost by product", "Ship dates by product", "Address", "Phone", "Email", "Job state", "Actions"].map((label, index) => <th key={`${label}-${index}`} scope="col">{label}</th>)}</tr></thead>
        <tbody>{visible.map(item => {
          const products = item.products.length ? item.products : [item.wholeJob];
          const payments = paymentsFor(item);
          return <tr key={item.source.id} aria-label={`Job status for ${item.source.customerName}`}>
            <th scope="row"><button type="button" className={styles.customerLink} title={item.source.customerName} onClick={() => onOpen(item.source)}>{item.source.customerName}</button></th>
            <td>{formatOperationsDate(item.source.soldDate) || "Sale date needed"}</td>
            <td>{mark(item, "quote")}</td><td>{mark(item, "sold")}{!item.sold && !item.source.signatureRecorded && (item.source.depositReceived ?? 0) > 0 && <small>Payment received · Signature needed</small>}</td><td>{payments ? paymentCell(item, payments, 1) : mark(item, "deposit")}</td>
            {hasThreePayments && <td>{payments ? paymentCell(item, payments, 2) : <span aria-label="Second payment not applicable">—</span>}</td>}
            {(["ordered", "shipped"] as const).map(step => <td key={step}><div className={styles.condensedProducts}>{products.map((product, index) => <span key={product.id}><CompletionButton done={product[step]} label={`${product[step] ? "Review" : "Mark"} ${product.wholeJob ? "whole job" : [product.name, product.manufacturer].filter(Boolean).join(" · ")} ${step} for ${item.source.customerName}`} disabled={disabled} saving={pending === `${item.source.id}:${step}:${product.id}`} onClick={() => void act(item, step, product)} />{products.length > 1 && <span>P{index + 1}</span>}</span>)}</div></td>)}
            <td>{mark(item, "installed")}</td><td>{payments ? paymentCell(item, payments, 3) : mark(item, "paid")}</td>
            {jobFinancialValues(item, payments, hasThreePayments, hasThreePayments).map(([label, value, note]) => <td key={label} className={styles.condensedNumber}><span className={label === "Profit" ? styles.completeText : undefined}>{value}</span>{note && <span className={styles.condensedNote}> · {note}</span>}</td>)}
            <td><button type="button" className={styles.condensedLink} aria-label={`Open contract quantities for ${item.source.customerName}`} onClick={event => toggleContract(item.source.id, event.currentTarget)}>{item.headerProducts.length ? item.headerProducts.map(product => `${product.quantity} ${product.name}`).join(" · ") : "Review contract"}</button></td>
            <td>{products.map((product, index) => `P${index + 1}: ${product.wholeJob ? "Whole job" : `${product.name} / ${product.manufacturer || "Manufacturer not recorded"}`}`).join(" · ")}</td>
            <td>{products.map((product, index) => <span className={styles.condensedProductDetail} key={product.id}>P{index + 1}: <OrderAmount item={item} product={product} /></span>)}</td>
            <td>{products.map((product, index) => <span className={styles.condensedProductDetail} key={product.id}>P{index + 1}: <ShipmentDates product={product} /></span>)}</td>
            <td>{item.source.address || "Address needed"}</td><td>{item.source.phone || "Phone needed"}</td><td>{item.source.email || "Email needed"}</td>
            <td>{item.closed ? "Closed · Paid in full" : item.paid ? "Active · Paid in full" : item.sold ? "Active" : "Not sold"}{item.source.progress.stage === "attention" && ` · Needs review: ${item.source.progress.nextAction || "Next action needed"}`}</td>
            <td><div className={styles.condensedActions}><button type="button" className={styles.condensedLink} onClick={() => onOpen(item.source)}>Open job <ArrowRight size={13} /></button><button type="button" className={styles.condensedLink} aria-label={`Contract for ${item.source.customerName}`} aria-expanded={contractId === item.source.id} aria-controls={`job-contract-${item.source.id}`} onClick={event => toggleContract(item.source.id, event.currentTarget)}><FileText size={14} />Contract</button>
            {onDelete && item.source.file && !item.sold && canDeleteCustomerFile(item.source.file) && <button type="button" className={styles.condensedLink} aria-label={`Delete customer file for ${item.source.customerName}`} disabled={disabled} onClick={() => onDelete(item.source.file!)}><Trash2 size={15} /></button>}
            {!data && onDeleteFileId && activeSnapshot?.deletableFiles[item.source.id] && <button type="button" className={styles.condensedLink} aria-label={`Delete customer file for ${item.source.customerName}`} disabled={disabled} onClick={() => { void onDeleteFileId(activeSnapshot.deletableFiles[item.source.id]).catch(cause => { setFeedbackId(null); setError(cause instanceof Error ? cause.message : "Customer file could not be loaded."); }); }}><Trash2 size={15} /></button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <div className={styles.jobList}>{visible.map(item => {
      const saleDate = formatOperationsDate(item.source.soldDate);
      const payments = paymentsFor(item);
      const contactLine = `${item.source.phone || "Phone needed"} · ${item.source.email || "Email needed"}`;
      return <article className={styles.jobCard} key={item.source.id} aria-label={`Job status for ${item.source.customerName}`}>
      <header className={styles.jobHeader}>
        <div className={styles.jobHeaderContent}>
          <div className={styles.jobIdentity}>
            <button type="button" className={styles.customerLink} title={item.source.customerName} onClick={() => onOpen(item.source)}>{item.source.customerName}</button>
            <small title={item.source.project || "Project needed"}>{item.source.project || "Project needed"}</small>
            {payments && <small className={styles.paymentPlanBadge}>In-house payment plan · 3 payments</small>}
            {item.closed && <small className={styles.completeText}>Closed · Paid in full</small>}
            {!item.closed && item.paid && <small>Active · Paid in full</small>}
            {item.source.progress.stage === "attention" && <small className={styles.attentionLine} title={`Needs review · ${item.source.progress.nextAction || "Next action needed"}`}>Needs review · {item.source.progress.nextAction || "Next action needed"}</small>}
          </div>
          <div className={styles.headerContact}>
            <span title={item.source.address || "Address needed"}>{item.source.address || "Address needed"}</span>
            <span title={contactLine}>{contactLine}</span>
          </div>
          <div className={styles.headerDate}>
            <span className={styles.headerLabel}>Sale date</span>
            <strong title={saleDate || "Sale date needed"}>{saleDate || "Sale date needed"}</strong>
          </div>
          <div className={styles.headerProducts}>
            <span className={styles.headerLabel}>Product quantities</span>
            <div className={styles.productPills}>{item.headerProducts.length ? item.headerProducts.map(product => <button type="button" className={styles.productPill} key={product.id} title={`${product.quantity} · ${product.name} · Open contract`} aria-label={`Open contract for ${item.source.customerName}: ${product.quantity} ${product.name}`} aria-expanded={contractId === item.source.id} aria-controls={`job-contract-${item.source.id}`} onClick={event => toggleContract(item.source.id, event.currentTarget)}><b>{product.quantity}</b><span>{product.name}</span></button>) : <button type="button" className={`${styles.productPill} ${styles.unknownPill}`} aria-label={`Review contract quantities for ${item.source.customerName}`} aria-expanded={contractId === item.source.id} aria-controls={`job-contract-${item.source.id}`} onClick={event => toggleContract(item.source.id, event.currentTarget)}>Review contract</button>}</div>
          </div>
          <div className={styles.jobLinks}><button type="button" className={styles.openLink} onClick={() => onOpen(item.source)}>Open job <ArrowRight size={13} /></button><button type="button" className={styles.openLink} aria-label={`Contract for ${item.source.customerName}`} aria-expanded={contractId === item.source.id} aria-controls={`job-contract-${item.source.id}`} onClick={event => toggleContract(item.source.id, event.currentTarget)}><FileText size={14} aria-hidden="true" />Contract</button></div>
        </div>
      </header>
      {feedbackId === item.source.id && (error || notice) && <p className={styles.rowFeedback} role={error ? "alert" : "status"}>{error || notice}</p>}
      <JobFinancialStrip item={item} payments={payments} />
      <table className={`${styles.statusTable}${payments ? ` ${styles.threePaymentTable}` : ""}`}><caption className={styles.srOnly}>Job completion by product type for {item.source.customerName}.</caption><thead><tr>{(payments ? threePaymentStatusColumns : statusColumns).map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody><tr>
      <td data-label="Quote">{mark(item, "quote")}<small>{item.source.quote?.quote_number || (item.quote ? "Quote recorded" : "Not recorded")}</small></td>
      <td data-label="Sold">{mark(item, "sold")}{!item.sold && !item.source.signatureRecorded && (item.source.depositReceived ?? 0) > 0 && <small>Payment received · Signature needed</small>}</td>
      <td data-label="Deposit">{payments ? paymentCell(item, payments, 1) : <>{mark(item, "deposit")}<small>{item.source.depositRequired === null ? "—" : currency(item.source.depositRequired)}</small></>}</td>
      {payments && <td data-label="Second payment">{paymentCell(item, payments, 2)}</td>}
      <td data-label="Ordered"><ProductChecks item={item} step="ordered" disabled={disabled} pending={pending} onAction={act} /></td><td data-label="Shipped"><ProductChecks item={item} step="shipped" disabled={disabled} pending={pending} onAction={act} /></td>
      <td data-label="Installed">{mark(item, "installed")}<small>{item.installed ? "Complete" : "Not confirmed"}</small></td>
      <td data-label={payments ? "Balance" : "Balance paid"}>{payments ? paymentCell(item, payments, 3) : <>{mark(item, "paid")}<small>{item.source.progress.payment === "overpaid" ? `Overpaid ${currency(Math.abs(item.source.balanceOutstanding!))}` : item.paid ? "Paid in full" : item.source.balanceOutstanding === null ? "Verify balance" : currency(item.source.balanceOutstanding)}</small></>}</td>

      </tr></tbody></table>
      {payments && <div className={styles.paymentFooter}><span>{payments.verified ? `${payments.paidCount} of 3 payments paid` : "Payment receipts need verification"}{payments.notice && ` · ${payments.notice}`}</span><span>Total still owed <strong>{payments.outstanding === null ? "Verify balance" : currency(payments.outstanding)}</strong></span></div>}
      {paymentSelection?.itemId === item.source.id && <section className={styles.paymentPanel}><button type="button" className={styles.openLink} onClick={closePayment}>Close payment details</button>{paymentPanel}</section>}
      {contractId === item.source.id && <div className={styles.contractRow} id={`job-contract-${item.source.id}`}><InlineJobContract key={jobContractPreviewUrl(item.source)} url={jobContractPreviewUrl(item.source)} customerName={item.source.customerName} onClose={closeContract} /></div>}
      {onDelete && item.source.file && !item.sold && canDeleteCustomerFile(item.source.file) && <div className={styles.cardActions}><button type="button" className={styles.deleteFile} aria-label={`Delete customer file for ${item.source.customerName}`} title="Delete customer file" disabled={disabled} onClick={() => onDelete(item.source.file!)}><Trash2 size={17} strokeWidth={1.7} aria-hidden="true" /></button></div>}
      {!data && onDeleteFileId && activeSnapshot?.deletableFiles[item.source.id] && <div className={styles.cardActions}><button type="button" className={styles.deleteFile} aria-label={`Delete customer file for ${item.source.customerName}`} title="Delete customer file" disabled={disabled} onClick={() => { void onDeleteFileId(activeSnapshot.deletableFiles[item.source.id]).catch(cause => { setFeedbackId(null); setError(cause instanceof Error ? cause.message : "Customer file could not be loaded."); }); }}><Trash2 size={17} strokeWidth={1.7} aria-hidden="true" /></button></div>}
    </article>;
    })}</div>}
    {condensed && contractId && visible.some(item => item.source.id === contractId) && <CondensedContract item={visible.find(item => item.source.id === contractId)!} onClose={closeContract} />}
    {condensed && paymentSelection && <JobPaymentDialog onClose={closePayment}>{paymentPanel}</JobPaymentDialog>}
    {!visible.length && !appointments.length && !loadingAll && !(searchQuery && !data) && <p className={styles.empty} role="status">{busy ? "Loading jobs…" : !data && !activeSnapshot ? "Job records are unavailable. Refresh to try again." : appointmentQueue ? "No quote appointments match this view." : "No jobs match this view."}</p>}
    {orderEditor && <ProductOrderEditor orderEmails={data?.orderCogsEmails || orderEditor.item.source.orderEmails} item={orderEditor.item} product={orderEditor.product} onSave={onAction} onClose={()=>setOrderEditor(null)} />}
    <footer className={styles.footer}>{searchQuery && !data ? "All jobs must load before search results are available" : appointmentQueue ? `${appointments.length} quote appointments shown` : `${visible.length} job records shown · Checks reflect recorded evidence`}{condensed && !appointmentQueue && <span>One line per customer job · Scroll right for all details</span>}</footer>
  </section>;
}

export function BackToStatus({ onClick }: { onClick: () => void }) { return <button className={styles.back} type="button" onClick={onClick}><ArrowLeft size={16} /> Back to job status</button>; }

function paymentDateNote(payment: JobPaymentColumn) {
  if (payment.paid) return payment.paidAt ? formatOperationsDate(payment.paidAt) || "Receipt date unrecorded" : "Receipt date unrecorded";
  if (payment.dueDate) return `Due ${formatOperationsDate(payment.dueDate)}`;
  return payment.number === 1 ? "Upon acceptance" : `${payment.number - 1} month${payment.number === 3 ? "s" : ""} after full deposit`;
}
function paymentAmountNote(payment: JobPaymentColumn, verified: boolean) {
  return `${!verified ? "Verify receipts" : payment.paid ? "Paid" : (payment.received || 0) > 0 ? `Received ${currency(payment.received!)}` : "Unpaid"} · ${paymentDateNote(payment)}`;
}
function jobFinancialValues(item: OperationsItem, payments?: JobPaymentColumns | null, includeSecondPayment = Boolean(payments), includeOutstanding = false): [string, string, string?][] {
  const source=item.source;
  const cogs=orderCostTotal(item) ?? (source.row || source.quote ? null : allocatedOrderCost(orderCostParent(item)?.meta));const installation=installationCost(source.row, source.quote); const install=installation.amount;
  const profit=source.total!==null && cogs!==null && install!==null ? source.total-cogs-install : null;
  const margin=source.total!==null && source.total>0 && cogs!==null ? (source.total-cogs)/source.total*100 : null;
  const values:[string,string,string?][]=[['Contract total',source.total===null?'—':currency(source.total)],['Deposit collected',source.depositReceived===null?'—':currency(source.depositReceived)],['Balance due',source.balanceOutstanding===null?'—':currency(source.balanceOutstanding)],['Cost of goods',cogs===null?'—':currency(cogs)],['Installation cost',install===null?'—':currency(install),installation.source==='invoice'?'MTS invoice':install===null?'Estimate needs details':'Estimate'],['Profit',profit===null?'—':currency(profit),'Before buyout'],['Margin',margin===null?'—':`${margin.toFixed(1)}%`,'Contract less COGS'],['10% buyout',source.total===null?'—':currency(source.total*.1),'Of contract total']];
  if (payments) values.splice(1, 2, ...payments.payments.map((payment): [string, string, string] => [
    payment.label, payment.amount === null ? "—" : currency(payment.amount), paymentAmountNote(payment, payments.verified),
  ]));
  else if (includeSecondPayment) values.splice(2, 0, ["Second payment", "—", "Not applicable"]);
  if (includeOutstanding) {
    const outstanding = payments ? payments.outstanding : source.balanceOutstanding;
    values.splice(4, 0, ["Total still owed", outstanding === null ? "Verify balance" : currency(outstanding)]);
  }
  return values;
}

function CondensedContract({ item, onClose }: { item: OperationsItem; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function close() { dialog.current?.close(); onClose(); }
  return <dialog ref={dialog} className={styles.condensedContract} aria-label={`Contract for ${item.source.customerName}`} onCancel={event => { event.preventDefault(); close(); }}>
    <div id={`job-contract-${item.source.id}`}><InlineJobContract url={jobContractPreviewUrl(item.source)} customerName={item.source.customerName} onClose={close} /></div>
  </dialog>;
}

function JobPaymentDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function close() { dialog.current?.close(); onClose(); }
  return <dialog ref={dialog} className={styles.condensedContract} aria-label="In-house payment details" onCancel={event => { event.preventDefault(); close(); }}><button type="button" className={styles.openLink} onClick={close}>Close payment details</button>{children}</dialog>;
}
export function JobFinancialStrip({item, payments}:{item:OperationsItem; payments?: JobPaymentColumns | null}) {
  const values = jobFinancialValues(item, payments);
  const metric = ([label,value,note]: [string,string,string?]) => <div key={label}><span>{label}</span><strong className={label === 'Profit' || payments?.payments.find(p => p.label === label)?.paid ? styles.completeText : undefined}>{value}</strong>{note&&<small>{note}</small>}</div>;
  return <section aria-label={`Finances for ${item.source.customerName}`} className={styles.financialStrip}>{payments ? <><div className={`${styles.financialMetrics} ${styles.paymentMetrics}`}>{values.slice(0,4).map(metric)}</div><div className={`${styles.financialMetrics} ${styles.costMetrics}`}>{values.slice(4).map(metric)}</div></> : <div className={styles.financialMetrics}>{values.map(metric)}</div>}</section>;
}
