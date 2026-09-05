"use client";

import { OperationsReports } from "@/components/crm/OperationsReports";
import { JobTrackingWorkspace, type JobTrackingViewItem, type JobTrackingSavePatch, type JobTrackingStageId as WorkspaceStageId } from "@/components/crm/JobTrackingWorkspace";
import { DragEvent, FormEvent, Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ADVERTISING_RESERVE_EFFECTIVE_FROM,
  effectiveBookkeepingStatus,
  formatPaymentType,
  isPaidInFullBookkeepingRow,
  kenCutOverrideInputValue,
  normalizeKenCutOverrideInput
} from "@/lib/crm/bookkeeping";
import {
  calendarAppointmentDurationChoices,
  calendarAppointmentDurationLabel,
  calendarAppointmentDurationMinutes
} from "@/lib/crm/calendar-duration";
import { KEN_CRM_EMAIL, isAllowedCrmEmail, isCrmOwnerAdminEmail, isKenCrmEmail, isMikePaymentAdminEmail } from "@/lib/crm/allowed-users";
import {
  buildMikeSoldProfitAllocationSummary,
  buildUnpaidPartnerPaymentItemForRow,
  partnerPaymentItemKeyForRow
} from "@/lib/crm/partner-payments";
import { buildKenPaymentReview, kenPaymentDisabledReason, type KenPaymentReview } from "@/lib/crm/ken-payment-workflow";
import { productInterestOptions } from "@/lib/product-interest-options";
import { getLeadSourceFromRecord, leadSourceOptions } from "@/lib/lead-source";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { SalesQuoteV2RouteResolution } from "@/lib/crm/sales-quote-v2-route-resolver";
import {
  bookingSlotDurationMinutes,
  bookingSlotTimes,
  losAngelesDateString,
  losAngelesTimeString,
  zonedTimeToUtc
} from "@/lib/booking/availability";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import { QuoteBuilderPanel } from "@/components/crm/QuoteBuilderPanel";
import { QuoteBuilderPanel as OriginalV1QuoteBuilderPanel } from "@/components/crm/quote-v1/QuoteBuilderPanel";
import { QuotesWorkspace } from "@/components/crm/quotes/QuotesWorkspace";
import { CommercialWorkspace } from "@/components/crm/CommercialWorkspace";
import { SalesIntelligencePage } from "@/components/crm/SalesIntelligencePage";
import { JessicaFeedbackHub } from "@/components/crm/JessicaFeedbackHub";
import { OrderFormLibrary } from "@/components/crm/OrderFormLibrary";
import { DashboardRecordCard, dashboardRecordContactFromJob } from "@/components/crm/DashboardRecordCard";
import { CloseRateDrilldown } from "@/components/crm/CloseRateDrilldown";
import { UnifiedActivityFeed } from "@/components/crm/UnifiedActivityFeed";
import {
  awaitingProductRows,
  balanceDueCompletedRows,
  depositNeededRows,
  distinctRowsByJob,
  measureNeededJobs,
  missingCogsRows,
  needToOrderRows,
  openBalanceRows,
  openSoldRows,
  quotedPipelineQuotes,
  soldLifecycleJobs,
  trackingRowNeedsDeposit
} from "@/lib/crm/dashboard-metrics";
import { getMeasureNeededMeta, isMeasureNeededJob, measureNeededLabel } from "@/lib/crm/measure-needed-state";
import { withInstallationConfirmation } from "@/lib/crm/installation-confirmation";
import { buildCommandPerformanceMetrics, formatCloseRate } from "@/lib/crm/command-performance";
import { calendarTimelineRowRange } from "@/lib/crm/calendar-grid";
import { buildCalendarOverlapLayout } from "@/lib/crm/calendar-overlap";
import { calendarEventSalePresentation } from "@/lib/crm/calendar-event-sales";
import { manufacturerPortalCapability } from "@/lib/crm/vendor-orders/manufacturer-portal-capabilities";
import {
  customerBookableSlotKeys,
  type BookingAvailabilityResponse
} from "@/lib/crm/calendar-availability";
import {
  PAYMENT_PLAN_METHOD_LABELS,
  getPaymentPlanMeta,
  installmentChargeAmount,
  type CrmPaymentPlanMethod
} from "@/lib/crm/payment-plan-shared";
import { paymentControlAmounts } from "@/lib/crm/payment-control-amounts";
import {
  CrmAccountabilityItem,
  CrmActivitySnapshot,
  CrmAvailabilitySlot,
  CrmBookkeepingPaymentType,
  CrmBookkeepingRow,
  CrmCalendarEvent,
  CrmCommissionPayment,
  CrmCommissionSummary,
  CrmCustomer,
  CrmCustomerFile,
  CrmDashboardData,
  CrmInstallationInvoiceEmail,
  CrmJob,
  CrmJobStatus,
  CrmKenBuyoutLedger,
  CrmKenPayment,
  CrmKenPayoffSummary,
  CrmOrderCogsEmail,
  CrmPartnerPaymentHistoryBatch,
  CrmPartnerPaymentLedger,
  CrmPartnerPaymentLedgerItem,
  CrmPaymentPerson,
  CrmQuote,
  CrmQuoteStatus,
  CrmVendorOrderTask,
  crmJobStatuses,
  crmQuoteStatuses
} from "@/lib/crm/types";

type CrmTab = "reports" | "command" | "intelligence" | "tracking" | "quotes" | "commercial" | "customers" | "order-forms" | "jobs" | "bookkeeping" | "payments" | "installation" | "orders" | "calendar" | "payoff";
type CrmAppMode = "full" | "ken";
type JobStatusFilter = CrmJobStatus | null;
type CustomerFileFilter = "need_to_schedule" | "scheduled" | "quoted" | "sold" | "ordered" | "completed";
type PaymentLinkChannel = "email" | "sms";
type QuoteWorkspaceOpenTab = "builder" | "contract";
type QuoteWorkspaceOpenRequest = {
  quoteId: string;
  tab: QuoteWorkspaceOpenTab;
  requestId: number;
  historicalPriceLock: Extract<SalesQuoteV2RouteResolution, { status: "ready" }>["historicalPriceLock"];
};
type PartnerPaymentRequest = {
  person: CrmPaymentPerson;
  paid_on?: string | null;
  period_month?: string | null;
  note?: string | null;
  amount?: number;
  item_ids?: string[];
  advance?: boolean;
  payment_request_id?: string;
  payment_method?: string;
  payment_reference?: string;
};
type PartnerPaymentReceiptResponse = {
  sent: boolean;
  skipped?: string;
  error?: string;
  id?: string;
  to: string;
  filename: string;
};
const JESSICA_PAYMENT_NOTIFICATION_EMAIL = "Jessica@805shutters.com";
const JESSICA_WEEKLY_REVIEW_STORAGE_KEY = "crm:jessica-weekly-payment-review:v1";
type BookkeepingEditableField =
  | "customer"
  | "soldDate"
  | "total"
  | "payment"
  | "paymentType"
  | "balance"
  | "cogs"
  | "remake"
  | "installation"
  | "ken"
  | "notes";
type BookkeepingCellEdit = { rowKey: string; field: BookkeepingEditableField } | null;

type CrmUser = {
  email: string;
  displayName: string | null;
};
type CrmEmailOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

class CrmFetchError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const jobColumns: Array<{ status: CrmJobStatus; label: string }> = crmJobStatuses.map((status) => ({
  status,
  label: titleCase(status)
}));

const productOptions = [...productInterestOptions, "Mixed"];

function leadSourceSelectOptions(current?: string | null) {
  const options: string[] = [...leadSourceOptions];
  if (current && !options.includes(current)) options.unshift(current);
  return options;
}

function LeadSourceSelect({ defaultValue, disabled }: { defaultValue?: string | null; disabled?: boolean }) {
  return (
    <select name="lead_source" defaultValue={defaultValue || ""} disabled={disabled}>
      <option value="">Unknown</option>
      {leadSourceSelectOptions(defaultValue).map((item) => (
        <option value={item} key={item}>
          {item}
        </option>
      ))}
    </select>
  );
}

function summarizeLeadSources(jobs: CrmJob[]) {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const key = getLeadSourceFromRecord(job) || "Unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => {
    if (a[0] === "Unknown") return 1;
    if (b[0] === "Unknown") return -1;
    return b[1] - a[1] || a[0].localeCompare(b[0]);
  });
}
const ownerOptions = ["Mike", "Jessica", "Unassigned"];
const ownerSelectOptions = ownerOptions.map((owner) => ({
  value: owner,
  label: owner === "Unassigned" ? "Not assigned" : owner
}));
const paymentTypes: Array<{ value: CrmBookkeepingPaymentType; label: string }> = [
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit Card" },
  { value: "zelle", label: "Zelle" },
  { value: "venmo", label: "Venmo" },
  { value: "other", label: "Other" }
];
const quickPaymentTypes: Array<{ value: CrmBookkeepingPaymentType; label: string }> = paymentTypes.filter((item) => item.value !== "other");
const customerFileFilters: Array<{ value: CustomerFileFilter; label: string }> = [
  { value: "need_to_schedule", label: "Need to Schedule" },
  { value: "scheduled", label: "Scheduled" },
  { value: "quoted", label: "Quoted" },
  { value: "sold", label: "Sold" },
  { value: "ordered", label: "Ordered" },
  { value: "completed", label: "Completed" }
];
const calendarSlotTimes = bookingSlotTimes;
const calendarTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles"
});
const calendarDayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "America/Los_Angeles"
});
const calendarWeekdayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: "America/Los_Angeles"
});
const calendarDayNumberFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  timeZone: "America/Los_Angeles"
});
const calendarMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "America/Los_Angeles"
});
const calendarLongDayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Los_Angeles"
});

type CalendarSlotSelection = {
  date: string;
  time: string;
  startAt: string;
  endAt: string;
  availableOwners?: string[];
};
type CalendarView = "day" | "week" | "month";
type CalendarManagementMode = "appointments" | "availability";

const calendarViewOptions: Array<{ value: CalendarView; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" }
];
const calendarManagementOptions: Array<{ value: CalendarManagementMode; label: string }> = [
  { value: "appointments", label: "Appointments" },
  { value: "availability", label: "Open Times" }
];

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function lastDayOfMonthInputValue() {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const year = last.getFullYear();
  const month = String(last.getMonth() + 1).padStart(2, "0");
  const day = String(last.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toCurrency(value: number | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function toLedgerCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value || 0);
}

function paymentMethodSuffix(type: CrmBookkeepingPaymentType | null | undefined) {
  if (!type || type === "other") return "";
  return ` (${formatPaymentType(type)})`;
}

function ledgerCurrencyWithPaymentType(value: number | null | undefined, type: CrmBookkeepingPaymentType | null | undefined) {
  return `${toLedgerCurrency(value)}${paymentMethodSuffix(type)}`;
}

function paymentTypeDefault(type: CrmBookkeepingPaymentType | null | undefined, fallback?: CrmBookkeepingPaymentType | null): CrmBookkeepingPaymentType {
  if (type && type !== "other") return type;
  if (fallback && fallback !== "other") return fallback;
  return "check";
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "Open";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit"
  }).format(new Date(value));
}

function dateSortValue(value: string | null | undefined) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function calendarDateToUtcNoon(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function addCalendarDays(value: string, days: number) {
  const date = calendarDateToUtcNoon(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfCalendarWeek(value: string) {
  const date = calendarDateToUtcNoon(value);
  return addCalendarDays(value, -date.getUTCDay());
}

function calendarWeekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_item, index) => addCalendarDays(weekStart, index));
}

function startOfCalendarMonth(value: string) {
  const date = calendarDateToUtcNoon(value);
  date.setUTCDate(1);
  return date.toISOString().slice(0, 10);
}

function addCalendarMonths(value: string, months: number) {
  const date = calendarDateToUtcNoon(value);
  const targetYear = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() + months;
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0, 12)).getUTCDate();
  const safeDay = Math.min(date.getUTCDate(), lastTargetDay);
  return new Date(Date.UTC(targetYear, targetMonth, safeDay, 12)).toISOString().slice(0, 10);
}

function calendarMonthDays(value: string) {
  const monthStart = startOfCalendarMonth(value);
  const monthEnd = addCalendarDays(addCalendarMonths(monthStart, 1), -1);
  const gridStart = startOfCalendarWeek(monthStart);
  const gridEnd = addCalendarDays(startOfCalendarWeek(monthEnd), 6);
  const dayCount = Math.round((calendarDateToUtcNoon(gridEnd).getTime() - calendarDateToUtcNoon(gridStart).getTime()) / 86400000) + 1;

  return Array.from({ length: dayCount }, (_item, index) => addCalendarDays(gridStart, index));
}

function calendarSlotStart(date: string, time: string) {
  return zonedTimeToUtc(date, time);
}

function calendarSlotSelection(date: string, time: string, durationMinutes = bookingSlotDurationMinutes): CalendarSlotSelection {
  const start = calendarSlotStart(date, time);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  return {
    date,
    time,
    startAt: start.toISOString(),
    endAt: end.toISOString()
  };
}

function formatCalendarSlotTime(time: string) {
  return calendarTimeFormatter.format(calendarSlotStart("2026-01-05", time));
}

function formatCalendarSlotRange(slot: CalendarSlotSelection) {
  return `${calendarTimeFormatter.format(new Date(slot.startAt))} - ${calendarTimeFormatter.format(new Date(slot.endAt))}`;
}

function formatCalendarDay(value: string) {
  return calendarDayFormatter.format(zonedTimeToUtc(value, "12:00"));
}

function formatCalendarWeekday(value: string) {
  return calendarWeekdayFormatter.format(zonedTimeToUtc(value, "12:00")).toUpperCase();
}

function formatCalendarDayNumber(value: string) {
  return calendarDayNumberFormatter.format(zonedTimeToUtc(value, "12:00"));
}

function formatCalendarMonth(value: string) {
  return calendarMonthFormatter.format(zonedTimeToUtc(value, "12:00"));
}

function formatCalendarLongDay(value: string) {
  return calendarLongDayFormatter.format(zonedTimeToUtc(value, "12:00"));
}

function isActiveCalendarEvent(event: CrmCalendarEvent) {
  return event.status === "scheduled" || event.status === "rescheduled";
}

function findCalendarEventForSlot(events: CrmCalendarEvent[], date: string, time: string) {
  const selection = calendarSlotSelection(date, time);
  const slotStart = new Date(selection.startAt);
  const slotEnd = new Date(selection.endAt);

  return events.find((event) => {
    if (!isActiveCalendarEvent(event)) return false;
    const eventStart = new Date(event.start_at);
    const eventEnd = new Date(event.end_at);
    return slotStart < eventEnd && slotEnd > eventStart;
  });
}

function isPastCalendarSlot(date: string, time: string) {
  const selection = calendarSlotSelection(date, time);
  return new Date(selection.endAt) <= new Date();
}

function calendarEventPlacement(event: CrmCalendarEvent, days: string[]) {
  const eventStart = new Date(event.start_at);
  const eventEnd = new Date(event.end_at);
  const dayIndex = days.findIndex((day) => {
    const dayStart = zonedTimeToUtc(day, "00:00");
    const dayEnd = zonedTimeToUtc(addCalendarDays(day, 1), "00:00");
    return eventStart < dayEnd && eventEnd > dayStart;
  });

  if (dayIndex < 0) return null;

  const day = days[dayIndex];
  const rowRange = calendarTimelineRowRange(
    eventStart,
    eventEnd,
    calendarSlotTimes.map((time) => calendarSlotStart(day, time))
  );

  if (!rowRange) return null;

  return {
    column: dayIndex + 2,
    rowStart: rowRange.firstRow + 2,
    rowEnd: rowRange.lastRow + 3
  };
}

function calendarEventsForDay(events: CrmCalendarEvent[], day: string) {
  const dayStart = zonedTimeToUtc(day, "00:00");
  const dayEnd = zonedTimeToUtc(addCalendarDays(day, 1), "00:00");

  return events.filter((event) => {
    const eventStart = new Date(event.start_at);
    const eventEnd = new Date(event.end_at);
    return eventStart < dayEnd && eventEnd > dayStart;
  });
}

function calendarEventsForRange(events: CrmCalendarEvent[], startDay: string, endDay: string) {
  const rangeStart = zonedTimeToUtc(startDay, "00:00");
  const rangeEnd = zonedTimeToUtc(endDay, "00:00");

  return events.filter((event) => {
    if (!isActiveCalendarEvent(event)) return false;
    return new Date(event.start_at) < rangeEnd && new Date(event.end_at) > rangeStart;
  });
}

function calendarEventDurationLabel(event: CrmCalendarEvent) {
  const minutes = calendarEventDurationMinutes(event);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function calendarEventDurationMinutes(event: CrmCalendarEvent) {
  const minutes = Math.max(0, Math.round((new Date(event.end_at).getTime() - new Date(event.start_at).getTime()) / 60000));
  return minutes || bookingSlotDurationMinutes;
}

function calendarEventDateValue(event: CrmCalendarEvent) {
  return losAngelesDateString(new Date(event.start_at));
}

function calendarEventTimeValue(event: CrmCalendarEvent) {
  return losAngelesTimeString(new Date(event.start_at));
}

function calendarEventTimeOptions(event: CrmCalendarEvent) {
  const time = calendarEventTimeValue(event);
  if (calendarSlotTimes.includes(time)) return calendarSlotTimes;
  return [...calendarSlotTimes, time].sort();
}

function canRescheduleCalendarEvent(event: CrmCalendarEvent) {
  return isActiveCalendarEvent(event) && event.event_type !== "block";
}

function calendarEventCompletionToneClassName(event: CrmCalendarEvent) {
  const { tone } = calendarEventSalePresentation(event);
  if (tone === "sold") return " crm-calendar-event-block--post-sold";
  if (tone === "unsold") return " crm-calendar-event-block--post-unsold";
  return "";
}

function calendarEventToneClassName(event: CrmCalendarEvent) {
  const owner = (event.assigned_to || "").toLowerCase();
  const ownerClass = owner.includes("mike")
    ? "crm-calendar-event-block--mike"
    : owner.includes("jessica")
      ? "crm-calendar-event-block--jessica"
      : "crm-calendar-event-block--unassigned";
  const typeClass = event.event_type === "block"
    ? " crm-calendar-event-block--block"
    : event.event_type === "measure"
      ? " crm-calendar-event-block--measure"
      : "";
  const completionClass = calendarEventCompletionToneClassName(event);

  return `${ownerClass}${typeClass}${completionClass}`;
}

function calendarEventClassName(event: CrmCalendarEvent) {
  return `crm-calendar-event-block ${calendarEventToneClassName(event)}`;
}

function cleanCalendarText(value: string | null | undefined) {
  return String(value || "").trim();
}

function calendarEventCustomerLabel(event: CrmCalendarEvent) {
  return cleanCalendarText(event.customer_name) || cleanCalendarText(event.title) || "Appointment";
}

function calendarEventAssignmentLabel(event: CrmCalendarEvent) {
  return cleanCalendarText(event.assigned_to) || "Unassigned";
}

function customerPhoneLine(phone: string | null | undefined) {
  const cleanPhone = cleanCalendarText(phone);
  return cleanPhone ? `Phone: ${cleanPhone}` : null;
}

function calendarEventDescriptionLines(event: CrmCalendarEvent) {
  const address = cleanCalendarText(event.customer_address || event.location);
  const city = cleanCalendarText(event.customer_city);
  const notes = cleanCalendarText(event.customer_notes || event.notes);

  return [
    customerPhoneLine(event.customer_phone),
    address ? `Address: ${address}` : null,
    city ? `City: ${city}` : null,
    cleanCalendarText(event.product_interest) ? `Product: ${cleanCalendarText(event.product_interest)}` : null,
    notes ? `Notes: ${notes}` : null
  ].filter((line): line is string => Boolean(line));
}

function calendarEventSecondaryDescriptionLines(event: CrmCalendarEvent) {
  const phoneLine = customerPhoneLine(event.customer_phone);
  return calendarEventDescriptionLines(event).filter((line) => line !== phoneLine);
}

function calendarEventDescriptionLabel(event: CrmCalendarEvent) {
  const { bannerLabel } = calendarEventSalePresentation(event);
  return [
    bannerLabel,
    `${calendarTimeFormatter.format(new Date(event.start_at))} - ${calendarTimeFormatter.format(new Date(event.end_at))}`,
    calendarEventCustomerLabel(event),
    event.event_type === "block" ? null : `Scheduled for: ${calendarEventAssignmentLabel(event)}`,
    ...calendarEventDescriptionLines(event)
  ].filter((line): line is string => Boolean(line)).join(". ");
}

function formString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function balanceDueTargetPatch(formData: FormData, row: CrmBookkeepingRow) {
  const rawTarget = formString(formData, "balance_due_target");
  if (rawTarget === "") return {};
  const target = roundCurrency(Number(rawTarget));
  if (!Number.isFinite(target) || Math.abs(target - roundCurrency(row.balance)) < 0.01) return {};
  return {
    balance_due_target: target,
    balance_adjustment_note: formString(formData, "balance_adjustment_note")
  };
}

function moneyTargetPatch(
  formData: FormData,
  inputName: string,
  payloadKey: string,
  currentValue: number
) {
  const rawTarget = formString(formData, inputName);
  if (rawTarget === "") return {};
  const target = roundCurrency(Number(rawTarget));
  if (!Number.isFinite(target) || Math.abs(target - roundCurrency(currentValue)) < 0.01) return {};
  return { [payloadKey]: target };
}

function setPaymentLedgerUrl(person: CrmPaymentPerson) {
  if (typeof window === "undefined") return;
  window.history.pushState({}, "", `/crm/payables?person=${person}`);
}

function isPayablesRoutePath(pathname: string) {
  return pathname.startsWith("/crm/payables") || pathname.startsWith("/crm/payments");
}

function dateInputValue(value: string | null | undefined) {
  return value ? String(value).slice(0, 10) : "";
}

function buildBookkeepingRowPayload(row: CrmBookkeepingRow, patch: Record<string, unknown>) {
  return {
    customer_name: row.customerName,
    sold_date: dateInputValue(row.soldDate),
    total_amount: row.total,
    cogs_amount: row.cogs,
    sales_owner: row.salesOwner || "",
    payment_type: row.paymentType || "other",
    payment_amount: 0,
    payment_label: "Balance payment",
    paid_at: todayInputValue(),
    remake_amount: row.remakeTotal || 0,
    installation_invoice_amount: row.installationInvoiceAmount || 0,
    installation_invoice_paid_at: row.installationInvoicePaidAt || "",
    installation_invoice_paid_amount: row.installationInvoicePaidAmount || 0,
    installation_invoice_payment_method: row.installationInvoicePaymentMethod || "",
    installation_invoice_payment_notes: row.installationInvoicePaymentNotes || "",
    installation_complete: row.isInstallationComplete,
    ken_cut_override: row.kenCutOverride ?? null,
    manufacturer_name: row.manufacturerName || "",
    manufacturer_order_ref: row.manufacturerOrderRef || "",
    notes: row.notes || "",
    ...patch
  };
}

function dateTimeLocalValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Los_Angeles"
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function dateTimeLocalToIso(value: string) {
  if (!value) return null;
  const [date, time] = value.split("T");
  if (!date || !time) return null;
  return zonedTimeToUtc(date, time).toISOString();
}

function crmAuthErrorMessage(code: string | null) {
  if (code === "google-provider-disabled") {
    return "Google login is not enabled in the 805 Supabase project. Enable Google under Supabase Authentication providers, then add the Google OAuth client ID and secret.";
  }

  if (code === "supabase-auth-not-configured") {
    return "Supabase auth is not configured yet. Add the 805 Supabase URL and anon key before using CRM login.";
  }

  return null;
}

function crmRedirectUrl(path = "/crm/") {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const origin = configuredSiteUrl || window.location.origin;
  const redirectPath = path.startsWith("/") ? path : "/crm/";
  return `${origin}${redirectPath}`;
}

function crmApiPath(path: string) {
  if (!path.startsWith("/api/")) return path;

  const queryStart = path.indexOf("?");
  const pathname = queryStart === -1 ? path : path.slice(0, queryStart);
  const query = queryStart === -1 ? "" : path.slice(queryStart);

  return pathname.endsWith("/") ? path : `${pathname}/${query}`;
}

async function crmFetch<T>(session: Session, path: string, init: RequestInit = {}) {
  const response = await fetch(crmApiPath(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(init.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new CrmFetchError(body.message || "CRM request failed.", response.status);
  }

  return body as T;
}

type OrderCogsPullResult = {
  scanned: number;
  processed: number;
  matched: number;
  needsReview: number;
  unmatched: number;
  skipped: number;
  errors: number;
  applied?: number;
  addedCogs?: number;
  targetCogsTotal?: number | null;
  emails?: CrmOrderCogsEmail[];
};

function isCrmSessionFetchError(error: unknown) {
  return error instanceof CrmFetchError && error.status === 401;
}

function crmLoadErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "CRM failed to load.";
}

function normalizeEmailOtpType(value: string | null): CrmEmailOtpType {
  if (
    value === "signup" ||
    value === "invite" ||
    value === "magiclink" ||
    value === "recovery" ||
    value === "email_change" ||
    value === "email"
  ) {
    return value;
  }

  return "email";
}

function removeEmailOtpParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function CollapsiblePanel({
  title,
  addLabel,
  forceOpen = false,
  onClose,
  children
}: {
  title: string;
  addLabel?: string;
  forceOpen?: boolean;
  onClose?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = open || forceOpen;

  if (!isOpen) {
    return (
      <aside className="crm-panel crm-panel-collapsed">
        <button type="button" className="crm-panel-add" onClick={() => setOpen(true)}>
          <span className="crm-panel-add-icon" aria-hidden="true">
            +
          </span>
          {addLabel ?? title}
        </button>
      </aside>
    );
  }

  return (
    <aside className="crm-panel">
      <div className="crm-panel-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="crm-ghost-button crm-panel-collapse"
          aria-label="Collapse"
          title="Collapse"
          onClick={() => {
            setOpen(false);
            onClose?.();
          }}
        >
          ×
        </button>
      </div>
      {children}
    </aside>
  );
}

export function CrmApp({
  initialTab = "command",
  initialPaymentPerson = "ken",
  loginRedirectPath: loginRedirectPathOverride,
  mode = "full"
}: {
  initialTab?: CrmTab;
  initialPaymentPerson?: CrmPaymentPerson;
  loginRedirectPath?: string;
  mode?: CrmAppMode;
} = {}) {
  const supabase = getSupabaseBrowserClient();
  const isKenMode = mode === "ken";
  const loginRedirectPath = loginRedirectPathOverride || (isKenMode ? "/crm/ken" : "/crm/");
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CrmUser | null>(null);
  const [data, setData] = useState<CrmDashboardData | null>(null);
  const [activitySnapshot, setActivitySnapshot] = useState<CrmActivitySnapshot | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [dashboardRefreshError, setDashboardRefreshError] = useState<string | null>(null);
  const [activityRefreshError, setActivityRefreshError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CrmTab>(() => (isKenMode ? "bookkeeping" : initialTab));
  const [activePaymentPerson, setActivePaymentPerson] = useState<CrmPaymentPerson>(initialPaymentPerson);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [authSetupMessage, setAuthSetupMessage] = useState<string | null>(null);
  const [emailLoginMessage, setEmailLoginMessage] = useState<string | null>(null);
  const [emailLoginBusy, setEmailLoginBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const dashboardRequestVersion = useRef(0);
  const activityPollAbortRef = useRef<AbortController | null>(null);
  const sessionIdentityRef = useRef<{ userId: string; accessToken: string } | null>(null);
  const crmLoadedRef = useRef(false);
  const [calendarDate, setCalendarDate] = useState(() => losAngelesDateString());
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [calendarManagementMode, setCalendarManagementMode] = useState<CalendarManagementMode>("appointments");
  const [selectedCalendarSlot, setSelectedCalendarSlot] = useState<CalendarSlotSelection | null>(null);
  const [viewingCalendarEvent, setViewingCalendarEvent] = useState<CrmCalendarEvent | null>(null);
  const [reschedulingCalendarEvent, setReschedulingCalendarEvent] = useState<CrmCalendarEvent | null>(null);
  const [cancelingCalendarEvent, setCancelingCalendarEvent] = useState<CrmCalendarEvent | null>(null);
  const [builderQuoteId, setBuilderQuoteId] = useState<string | null>(null);
  const [builderVersion, setBuilderVersion] = useState<"current" | "original-v1">("current");
  const [quoteWorkspaceOpenRequest, setQuoteWorkspaceOpenRequest] = useState<QuoteWorkspaceOpenRequest | null>(null);
  const [drill, setDrill] = useState<DrillPayload | null>(null);
  const [closeRatePeriod, setCloseRatePeriod] = useState<30 | 60 | null>(null);
  const [focusCustomer, setFocusCustomer] = useState<string | null>(null);
  const [activeJobStatus, setActiveJobStatus] = useState<JobStatusFilter>(null);
  const [jobSearch, setJobSearch] = useState("");

  const configured = Boolean(supabase);
  const jobs = useMemo(() => data?.jobs || [], [data]);
  const quotes = useMemo(() => data?.quotes || [], [data]);
  const events = useMemo(() => data?.events || [], [data]);
  const customers = useMemo(() => data?.customers || [], [data]);
  const rows = useMemo(() => data?.bookkeepingRows || [], [data]);
  const customerFiles = useMemo(() => data?.customerFiles || [], [data]);
  const commandPerformance = useMemo(
    () => buildCommandPerformanceMetrics(jobs, rows, new Date(), customerFiles),
    [jobs, rows, customerFiles]
  );
  const installationInvoiceEmails = useMemo(() => data?.installationInvoiceEmails || [], [data]);
  const orderCogsEmails = useMemo(() => data?.orderCogsEmails || [], [data]);
  const vendorOrderTasks = useMemo(() => data?.vendorOrderTasks || [], [data]);
  const accountability = useMemo(() => data?.accountability || [], [data]);
  const kenPayments = useMemo(() => data?.kenPayments || [], [data]);
  const commissionPayments = useMemo(() => data?.commissionPayments || [], [data]);
  const statusFilteredJobs = useMemo(
    () => (activeJobStatus ? jobs.filter((job) => job.status === activeJobStatus) : jobs),
    [activeJobStatus, jobs]
  );
  const normalizedJobSearch = jobSearch.trim();
  const visibleJobs = useMemo(
    () =>
      normalizedJobSearch
        ? statusFilteredJobs.filter((job) => jobMatchesSearch(job, normalizedJobSearch))
        : statusFilteredJobs,
    [normalizedJobSearch, statusFilteredJobs]
  );

  function openCustomerFile(customerName: string) {
    setFocusCustomer(customerName);
    setActiveJobStatus(null);
    setActiveTab("customers");
    setDrill(null);
  }

  async function openQuoteWorkspaceQuote(quoteId: string, tab: QuoteWorkspaceOpenTab = "builder") {
    if (tab === "contract") {
      openQuoteContract(quoteId);
      return;
    }

    if (!session) return;

    setBusy(true);
    setMessage(null);
    try {
      let route = await crmFetch<SalesQuoteV2RouteResolution>(
        session,
        `/api/crm/quotes/${quoteId}/v2-route`
      );

      if (route.status === "legacy_import_required" || route.status === "crm_native_unsupported") {
        const imported = await crmFetch<{ route: SalesQuoteV2RouteResolution }>(
          session,
          `/api/crm/quotes/${quoteId}/v2-route`,
          {
            method: "POST",
            body: JSON.stringify({ idempotencyKey: `crm-quote-builder-open:${quoteId}` })
          }
        );
        route = imported.route;
      }

      if (route.status !== "ready") {
        throw new Error("This quote cannot be opened safely in the standard quote builder.");
      }

      setBuilderQuoteId(null);
      setActiveTab("quotes");
      setQuoteWorkspaceOpenRequest((request) => ({
        quoteId: route.salesQuoteId,
        tab,
        requestId: (request?.requestId || 0) + 1,
        historicalPriceLock: route.historicalPriceLock
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The quote builder could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  function openCustomerSearchPage(page: CustomerSearchPage, entry: DrillEntry) {
    const customerName = entry.customerName || entry.name;
    setDrill(null);
    setFocusCustomer(null);

    if (page.target === "customers") {
      openCustomerFile(customerName);
      return;
    }

    if (page.target === "jobs") {
      setActiveTab("jobs");
      setActiveJobStatus(null);
      setJobSearch(customerName);
      return;
    }

    if (page.target === "bookkeeping") {
      setActiveTab("bookkeeping");
      return;
    }

    if (page.target === "quotes") {
      if (page.quoteId) openQuoteWorkspaceQuote(page.quoteId, "builder");
      return;
    }

    if (page.target === "contract") {
      if (page.quoteId) openQuoteWorkspaceQuote(page.quoteId, "contract");
      else if (page.url) window.open(page.url, "_blank", "noopener,noreferrer");
      return;
    }

    if (page.target === "calendar") {
      setActiveTab("calendar");
      setCalendarManagementMode("appointments");
      const event = events.find((item) => item.id === page.eventId);
      if (event) {
        setCalendarDate(calendarEventDateValue(event));
        setViewingCalendarEvent(event);
      }
    }
  }

  async function sendSquarePaymentLink(quoteId: string, paymentType: SquareOrderPaymentType, recipientEmail?: string, confirmation?: { expectedAmount: number; expectedRecipient: string }) {
    if (!session) throw new Error("Sign in again before sending a payment link.");
    setBusy(true);
    setMessage(null);
    try {
      const result = await crmFetch<SquarePaymentLinkResult>(
        session,
        `/api/crm/quotes/${quoteId}/square-payment-link`,
        { method: "POST", body: JSON.stringify({ paymentType, recipientEmail: recipientEmail?.trim() || undefined, ...confirmation }) },
      );
      if (!result.email.sent) {
        throw new Error(result.email.error || result.email.skipped || "Square link was created, but the email was not sent.");
      }
      setMessage(`${paymentType === "deposit" ? "Deposit" : "Balance"} link for ${toCurrency(result.amount)} sent to ${result.recipient}.`);
      return result;
    } finally {
      setBusy(false);
    }
  }

  async function saveTrackingField(item: JobTrackingViewItem, patch: JobTrackingSavePatch) {
    if (!session) throw new Error("Sign in again before editing a job.");
    const quoteId = item.quote?.id || (item.row?.source === "crm_quote" ? item.row.quoteId : null);
    const jobId = item.job?.id || item.row?.jobId;
    if ((patch.quote && !quoteId) || (patch.job && !jobId) || (patch.row && !item.row)) {
      throw new Error("The original source record is missing. Refresh before editing.");
    }
    setBusy(true);
    setMessage(null);
    try {
      const quotePatch = { ...patch.quote };
      if (patch.row && item.row) {
        if (item.row.source === "crm_quote" && quoteId) {
          Object.assign(quotePatch, patch.row);
          if (Object.hasOwn(quotePatch, "sold_date")) {
            quotePatch.sold_at = `${quotePatch.sold_date}T12:00:00Z`;
            delete quotePatch.sold_date;
          }
        } else {
          await crmFetch(session, `/api/crm/bookkeeping/${item.row.id}`, { method: "PATCH", body: JSON.stringify(patch.row) });
        }
      }
      if (Object.keys(quotePatch).length && quoteId) {
        await crmFetch(session, `/api/crm/quotes/${quoteId}`, { method: "PATCH", body: JSON.stringify(quotePatch) });
      }
      if (patch.job && jobId) {
        await crmFetch(session, `/api/crm/jobs/${jobId}`, { method: "PATCH", body: JSON.stringify(patch.job) });
      }
      await refresh();
      setMessage(patch.message || `${item.customerName} updated.`);
      return true;
    } catch (error) {
      // Refresh even after a partial multi-record save. Never invite a blind
      // repeat of a successfully recorded payment after a later refresh failed.
      await refresh().catch(() => null);
      throw error;
    } finally { setBusy(false); }
  }

  async function saveTrackingStage(item: JobTrackingViewItem, stage: WorkspaceStageId, managerException?:string) {
    if (!session) throw new Error("Sign in again before editing a job.");
    setBusy(true);
    setMessage(null);
    try {
      const result = await crmFetch<{ warning?: string | null }>(session, "/api/crm/job-tracking/stage", {
        method: "POST", body: JSON.stringify({
          stage, managerException, jobId: item.job?.id || item.row?.jobId || undefined,
          quoteId: item.quote?.id || item.row?.quoteId || undefined,
          bookkeepingEntryId: item.row && item.row.source !== "crm_quote" ? item.row.id : undefined,
        }),
      });
      await refresh();
      setMessage(result.warning || `${item.customerName}'s stage was updated.`);
      return true;
    } finally { setBusy(false); }
  }

  async function sendTrackingSquare(item: JobTrackingViewItem, paymentType: SquareOrderPaymentType) {
    const standalone = item.row && item.row.source !== "crm_quote";
    if ((!item.quote && !standalone) || !item.email) {
      throw new Error("A sale record and verified customer email are required for a Square request.");
    }
    const deposit = Math.min(item.depositOutstanding || 0, item.balanceOutstanding || 0);
    const amount = paymentType === "deposit" ? deposit : Math.max((item.balanceOutstanding || 0) - deposit, 0);
    if (!(amount > 0)) throw new Error("No amount is currently due for this payment request.");
    const confirmation = { expectedAmount: amount, expectedRecipient: item.email };
    if (!standalone) return sendSquarePaymentLink(item.quote!.id, paymentType, undefined, confirmation);
    if (!session) throw new Error("Sign in again before sending a payment link.");
    setBusy(true);
    try {
      const result = await crmFetch<SquarePaymentLinkResult>(session, `/api/crm/bookkeeping/${item.row!.id}/square-payment-link`, {
        method: "POST", body: JSON.stringify({ paymentType, ...confirmation }),
      });
      if (!result.email.sent) throw new Error(result.email.error || result.email.skipped || "Square link was created, but the email was not sent.");
      setMessage(result.warning || `${paymentType === "deposit" ? "Deposit" : "Balance"} link for ${toCurrency(result.amount)} sent to ${result.recipient}.`);
      return result;
    } finally { setBusy(false); }
  }

  function openSummaryDrill(metric: string) {
    const payload = buildSummaryDrill(
      metric,
      jobs,
      quotes,
      rows,
      customerFiles,
      installationInvoiceEmails,
      orderCogsEmails,
      vendorOrderTasks
    );
    if (payload) {
      setCloseRatePeriod(null);
      setDrill(payload);
    }
  }

  function toggleCloseRateDrilldown(periodDays: 30 | 60) {
    setDrill(null);
    setCloseRatePeriod((current) => current === periodDays ? null : periodDays);
  }

  async function updateVendorOrderTask(
    task: CrmVendorOrderTask,
    action: "start" | "auto_order" | "review_ready" | "retry" | "confirm" | "cancel" | "bypass",
  ) {
    if (!session || !task.recordId) {
      if (action === "start") return;
      throw new Error("This legacy task must be backfilled before its lifecycle can be updated.");
    }
    const payload: Record<string, unknown> = { action };
    if (action === "confirm") {
      const manufacturerOrderRef = window.prompt(`Enter the ${task.manufacturer} order or confirmation number:`);
      if (manufacturerOrderRef === null) return;
      if (!manufacturerOrderRef.trim()) throw new Error("A manufacturer order or confirmation number is required.");
      payload.manufacturerOrderRef = manufacturerOrderRef.trim();
      const confirmationUrl = window.prompt("Optional manufacturer confirmation URL:", "");
      if (confirmationUrl?.trim()) payload.confirmationUrl = confirmationUrl.trim();
      const confirmationNotes = window.prompt("Optional confirmation notes:", "");
      if (confirmationNotes?.trim()) payload.confirmationNotes = confirmationNotes.trim();
    }
    setBusy(true);
    try {
      await crmFetch(session, `/api/crm/vendor-order-tasks/${task.recordId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (action === "auto_order") {
        const query = new URLSearchParams({ taskId: task.taskId, manufacturer: task.manufacturer });
        const runner = window.open(`http://127.0.0.1:47635/start?${query.toString()}`, "_blank", "noopener,noreferrer");
        if (!runner) throw new Error("Allow pop-ups for the CRM, then press Auto Order again.");
      }
      await refresh();
      setDrill(null);
      setMessage(
        action === "confirm"
          ? `${task.manufacturer} order confirmed and removed from Ready to Order.`
          : action === "auto_order"
            ? `${task.manufacturer} Auto Order started. The agent will prepare a saved draft only; it cannot submit the order.`
          : action === "bypass"
            ? `${task.manufacturer} packet workflow bypassed. The job remains marked ordered.`
            : `${task.manufacturer} order moved to ${action.replaceAll("_", " ")}.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function emailVendorOrderPacket(task: CrmVendorOrderTask) {
    if (!session || !task.recordId) {
      setMessage("This manufacturer order packet must be backfilled before it can be emailed.");
      return;
    }
    setBusy(true);
    try {
      const result = await crmFetch<{
        sent: boolean;
        recipient: string;
        attachments: string[];
      }>(session, `/api/crm/vendor-order-tasks/${task.recordId}/email`, {
        method: "POST",
      });
      setMessage(
        `${task.manufacturer} Codex order packet emailed to ${result.recipient} with ${result.attachments.length} attachments. The task remains Ready to Order.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Codex order packet could not be emailed.");
    } finally {
      setBusy(false);
    }
  }

  async function openVendorOrderPacket(task: CrmVendorOrderTask) {
    if (!session || !task.orderPacketUrl) {
      setMessage("This manufacturer order packet is not available.");
      return;
    }
    const opened = window.open("about:blank", "_blank");
    try {
      if (!opened) throw new Error("Allow pop-ups for the CRM, then press View Order Packet again.");
      opened.opener = null;
      const response = await fetch(task.orderPacketUrl, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.message === "string" ? body.message : "The manufacturer order packet could not be loaded.");
      }
      const packetUrl = URL.createObjectURL(await response.blob());
      opened.location.replace(packetUrl);
      window.setTimeout(() => URL.revokeObjectURL(packetUrl), 60_000);
    } catch (error) {
      opened?.close();
      setMessage(error instanceof Error ? error.message : "The manufacturer order packet could not be opened.");
    }
  }

  function openTab(tab: CrmTab) {
    if (isKenMode && tab !== "bookkeeping" && tab !== "payoff") {
      setActiveTab("bookkeeping");
      setDrill(null);
      setFocusCustomer(null);
      return;
    }

    setActiveTab(tab);
    setDrill(null);
    setFocusCustomer(null);
    if (tab === "payments") {
      setPaymentLedgerUrl(activePaymentPerson);
    } else if (typeof window !== "undefined" && isPayablesRoutePath(window.location.pathname)) {
      window.history.pushState({}, "", "/crm/");
    }
  }

  function openPaymentLedger(person: CrmPaymentPerson) {
    setActivePaymentPerson(person);
    setActiveTab("payments");
    setDrill(null);
    setFocusCustomer(null);
    setPaymentLedgerUrl(person);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    sessionIdentityRef.current = null;
    crmLoadedRef.current = false;
    setSession(null);
    setUser(null);
    setData(null);
    setActivitySnapshot(null);
    setActivityRefreshError(null);
  }

  async function loadCrm(activeSession: Session) {
    setMessage(null);
    const sessionResult = await crmFetch<CrmUser>(activeSession, "/api/crm/session");
    if (isKenMode && !isKenCrmEmail(sessionResult.email)) {
      throw new Error(`Ken's bookkeeping page is only available to ${KEN_CRM_EMAIL}.`);
    }
    if (!isKenMode && isKenCrmEmail(sessionResult.email)) {
      window.location.replace("/crm/ken");
      return;
    }
    setActivityLoading(true);
    const [dashboardResult, activityResult] = await Promise.all([
      crmFetch<CrmDashboardData>(activeSession, "/api/crm/jobs"),
      crmFetch<CrmActivitySnapshot>(activeSession, "/api/crm/activity")
        .then((snapshot) => ({ snapshot, error: null as string | null }))
        .catch((error: unknown) => ({ snapshot: null, error: crmLoadErrorMessage(error) }))
    ]);
    setUser(sessionResult);
    setData(dashboardResult);
    if (activityResult.snapshot) setActivitySnapshot(activityResult.snapshot);
    setActivityRefreshError(activityResult.error);
    setActivityLoading(false);
    crmLoadedRef.current = true;
  }

  async function refresh() {
    if (!session) return null;
    const requestVersion = ++dashboardRequestVersion.current;
    const dashboardResult = await crmFetch<CrmDashboardData>(session, "/api/crm/jobs");
    if (requestVersion === dashboardRequestVersion.current) { setData(dashboardResult); setDashboardRefreshError(null); }
    return dashboardResult;
  }

  async function pullInstallationInvoices() {
    if (!session) return;
    setBusy(true);
    setMessage(null);

    try {
      const result = await crmFetch<{
        matched: number;
        serviceReports?: number;
        needsReview: number;
        unmatched: number;
        skipped: number;
        errors: number;
      }>(session, "/api/crm/installation-invoices/pull", {
        method: "POST",
        body: JSON.stringify({})
      });
      await refresh();
      setMessage(
        `Install email pull: ${result.matched} matched, ${result.serviceReports || 0} completed reports, ${result.needsReview} review, ${result.unmatched} unmatched, ${result.skipped} skipped, ${result.errors} errors.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Install emails could not be pulled.");
    } finally {
      setBusy(false);
    }
  }

  function processEmailTargetForEntry(entry?: DrillEntry | null) {
    if (!entry) return null;

    const row = entry.row;
    return {
      customerName: entry.customerName || entry.name || row?.customerName || entry.job?.customer_name || null,
      jobId: row?.jobId || entry.job?.id || entry.jobId || null,
      quoteId: row?.quoteId || null,
      existingInstallationAmount: row?.installationInvoiceAmount ?? null
    };
  }

  async function processEmails(target?: DrillEntry | null) {
    if (!session) return;
    setBusy(true);
    setMessage(null);

    try {
      const installationTarget = processEmailTargetForEntry(target);
      const result = await crmFetch<{
        installationInvoices: {
          ok: boolean;
          result?: {
            matched: number;
            serviceReports?: number;
            needsReview: number;
            unmatched: number;
            skipped: number;
            errors: number;
          };
          error?: string;
        };
        commercialBids: {
          ok: boolean;
          result?: {
            leadsCreated: number;
            leadsUpdated: number;
            reviewsCreated: number;
            ignored: number;
            skipped: number;
            errors: number;
          };
          error?: string;
        };
      }>(session, "/api/crm/process-emails", {
        method: "POST",
        body: JSON.stringify(installationTarget ? { installationTarget } : {})
      });
      await refresh();

      const install = result.installationInvoices;
      const installMessage =
        install.ok && install.result
          ? `Install: ${install.result.matched} matched, ${install.result.serviceReports || 0} completed reports, ${install.result.needsReview} review, ${install.result.unmatched} unmatched, ${install.result.skipped} skipped, ${install.result.errors} errors.`
          : `Install failed: ${install.error || "unknown error"}.`;
      const bids = result.commercialBids;
      const bidMessage =
        bids.ok && bids.result
          ? `Commercial bids: ${bids.result.leadsCreated} new, ${bids.result.leadsUpdated} updated, ${bids.result.reviewsCreated} estimate reviews, ${bids.result.ignored} ignored, ${bids.result.skipped} duplicates, ${bids.result.errors} errors.`
          : `Commercial bid sync failed: ${bids.error || "unknown error"}.`;

      const targetMessage = installationTarget?.customerName ? ` for ${installationTarget.customerName}` : "";
      setMessage(`Email pull complete${targetMessage}. ${installMessage} ${bidMessage}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Emails could not be processed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    const form = event.currentTarget;
    const email = formString(new FormData(form), "email").toLowerCase();
    if (!email) {
      setEmailLoginMessage(isKenMode ? `Enter Ken's approved email: ${KEN_CRM_EMAIL}.` : "Enter an approved 805 Shutters email.");
      return;
    }

    if (isKenMode && !isKenCrmEmail(email)) {
      setEmailLoginMessage(`Use Ken's approved email: ${KEN_CRM_EMAIL}.`);
      return;
    }

    if (!isAllowedCrmEmail(email)) {
      setEmailLoginMessage("Use an approved 805 Shutters email.");
      return;
    }

    setEmailLoginBusy(true);
    setEmailLoginMessage(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: crmRedirectUrl(isKenCrmEmail(email) ? "/crm/ken" : loginRedirectPath),
          shouldCreateUser: true
        }
      });

      if (error) {
        throw error;
      }

      setEmailLoginMessage(`Login link sent to ${email}.`);
      form.reset();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      setEmailLoginMessage(
        errorMessage.toLowerCase().includes("rate limit")
          ? "A login email was already requested. Check Ken's inbox for the newest link, or wait a few minutes before requesting another."
          : errorMessage || "Email login link could not be sent."
      );
    } finally {
      setEmailLoginBusy(false);
    }
  }

  useEffect(() => {
    setAuthSetupMessage(crmAuthErrorMessage(new URLSearchParams(window.location.search).get("crmAuthError")));

    if (!supabase) {
      setLoading(false);
      return;
    }

    const activeSupabase = supabase;
    let mounted = true;

    const expiredMessage = isKenMode
      ? "Ken's login expired. Send a fresh login link to continue."
      : "Your CRM login expired. Sign in again.";

    async function clearCrmSession(notice?: string) {
      await activeSupabase.auth.signOut().catch(() => undefined);
      if (!mounted) return;
      sessionIdentityRef.current = null;
      crmLoadedRef.current = false;
      setSession(null);
      setUser(null);
      setData(null);
      setMessage(null);
      if (notice) setEmailLoginMessage(notice);
    }

    async function handleCrmLoadError(error: unknown) {
      if (isCrmSessionFetchError(error)) {
        await clearCrmSession(expiredMessage);
        return;
      }

      setMessage(crmLoadErrorMessage(error));
    }

    async function consumeEmailOtpCallback() {
      const url = new URL(window.location.href);
      const tokenHash = url.searchParams.get("token_hash");
      if (!tokenHash) return null;

      const { data, error } = await activeSupabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: normalizeEmailOtpType(url.searchParams.get("type"))
      });

      if (error) throw error;
      removeEmailOtpParams();
      return data.session ?? null;
    }

    async function initializeCrmSession() {
      try {
        const callbackSession = await consumeEmailOtpCallback();
        const activeSession = callbackSession ?? (await activeSupabase.auth.getSession()).data.session;
        if (!mounted) return;
        sessionIdentityRef.current = activeSession
          ? { userId: activeSession.user.id, accessToken: activeSession.access_token }
          : null;
        setSession(activeSession);

        if (activeSession) {
          await loadCrm(activeSession);
        }
      } catch (error) {
        if (!mounted) return;
        await handleCrmLoadError(error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initializeCrmSession();

    const { data: listener } = activeSupabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === "INITIAL_SESSION") return;

      const nextIdentity = nextSession
        ? { userId: nextSession.user.id, accessToken: nextSession.access_token }
        : null;
      const currentIdentity = sessionIdentityRef.current;
      const sameUser = Boolean(
        nextIdentity && currentIdentity && nextIdentity.userId === currentIdentity.userId
      );

      if (nextSession && sameUser && crmLoadedRef.current) {
        sessionIdentityRef.current = nextIdentity;
        setSession(nextSession);
        return;
      }

      sessionIdentityRef.current = nextIdentity;
      setSession(nextSession);
      if (nextSession) {
        setLoading(true);
        loadCrm(nextSession)
          .catch(async (error) => {
            if (!mounted) return;
            await handleCrmLoadError(error);
          })
          .finally(() => {
            if (mounted) setLoading(false);
          });
      } else {
        crmLoadedRef.current = false;
        setUser(null);
        setData(null);
        setActivitySnapshot(null);
        setActivityRefreshError(null);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  // Mirror `busy` into a ref so the polling loop can read the latest value
  // without re-subscribing the interval on every save.
  useEffect(() => {
    busyRef.current = busy;
    dashboardRequestVersion.current += 1;
  }, [busy]);

  // Keep the dashboard live: silently refetch on an interval, and immediately
  // when the tab regains focus. Skips while a save is in flight (so it can't
  // clobber an edit) or while the tab is hidden (so it doesn't poll in the
  // background). Preserve the snapshot and expose failed refreshes.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const sync = async () => {
      if (cancelled || busyRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const requestVersion = ++dashboardRequestVersion.current;
      try {
        const dashboardResult = await crmFetch<CrmDashboardData>(session, "/api/crm/jobs");
        if (cancelled || busyRef.current || requestVersion !== dashboardRequestVersion.current) return;
        setData(dashboardResult);
        setDashboardRefreshError(null);
      } catch {
        if (!cancelled && requestVersion === dashboardRequestVersion.current) setDashboardRefreshError("Refresh failed. Showing the last successful snapshot; figures may be stale.");
      }
    };

    const intervalId = window.setInterval(sync, 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session]);

  useEffect(() => {
    if (!session || isKenMode) return;
    let cancelled = false;

    const syncActivity = async () => {
      if (cancelled || busyRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      activityPollAbortRef.current?.abort();
      const controller = new AbortController();
      activityPollAbortRef.current = controller;
      try {
        const snapshot = await crmFetch<CrmActivitySnapshot>(session, "/api/crm/activity", { signal: controller.signal });
        if (cancelled) return;
        setActivitySnapshot(snapshot);
        setActivityRefreshError(null);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Preserve the last successful activity snapshot so a transient poll
        // failure never clears or reorders the list someone is reading.
        setActivityRefreshError(crmLoadErrorMessage(error));
      } finally {
        if (activityPollAbortRef.current === controller) activityPollAbortRef.current = null;
      }
    };

    const intervalId = window.setInterval(syncActivity, 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncActivity();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      activityPollAbortRef.current?.abort();
      activityPollAbortRef.current = null;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isKenMode, session]);

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ job: CrmJob }>(session, "/api/crm/jobs", {
        method: "POST",
        body: JSON.stringify({
          customer_name: formString(formData, "customer_name"),
          phone: formString(formData, "phone"),
          email: formString(formData, "email"),
          city: formString(formData, "city"),
          address: formString(formData, "address"),
          product_interest: formString(formData, "product_interest"),
          lead_source: formString(formData, "lead_source"),
          sales_owner: formString(formData, "sales_owner"),
          priority: formString(formData, "priority") || "normal",
          next_action: formString(formData, "next_action") || "Call customer",
          next_action_due: formString(formData, "next_action_due") || null,
          estimated_total: Number(formString(formData, "estimated_total") || 0),
          notes: formString(formData, "notes")
        })
      });
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CRM job could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function updateJobStatus(job: CrmJob, status: CrmJobStatus) {
    if (!session) return;

    const confirmed = withInstallationConfirmation(job.customer_name, [
      { currentStatus: job.status, patch: { status } }
    ]);
    if (!confirmed) return;
    const statusPatch = confirmed[0].patch;

    setData((current) =>
      current
        ? {
            ...current,
            jobs: current.jobs.map((item) => (item.id === job.id ? { ...item, status } : item))
          }
        : current
    );

    try {
      await crmFetch<{ job: CrmJob }>(session, `/api/crm/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify(statusPatch)
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CRM job could not be updated.");
      await refresh();
    }
  }

  async function saveCustomerRowField(row: CrmBookkeepingRow, patch: Record<string, unknown>, message?: string) {
    if (!session) return false;

    const confirmed = withInstallationConfirmation(row.customerName, [
      { currentStatus: row.status, installationComplete: row.isInstallationComplete, patch }
    ]);
    if (!confirmed) return false;
    patch = confirmed[0].patch;

    setBusy(true);
    setMessage(null);

    try {
      if (row.source === "crm_quote" && row.quoteId) {
        await crmFetch(session, `/api/crm/quotes/${row.quoteId}`, {
          method: "PATCH",
          body: JSON.stringify(patch)
        });
      } else {
        await crmFetch(session, `/api/crm/bookkeeping/${row.id}`, {
          method: "PATCH",
          body: JSON.stringify(patch)
        });
      }
      await refresh();
      setMessage(message || `${row.customerName} updated.`);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Field could not be updated.");
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveCustomerJobField(job: CrmJob, patch: Record<string, unknown>, message?: string) {
    if (!session) return false;

    const confirmed = withInstallationConfirmation(job.customer_name, [{ currentStatus: job.status, patch }]);
    if (!confirmed) return false;
    patch = confirmed[0].patch;

    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ job: CrmJob }>(session, `/api/crm/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      await refresh();
      setMessage(message || `${job.customer_name} updated.`);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Job could not be updated.");
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function reassignSale(entry: DrillEntry, owner: string) {
    if (!session || !entry.jobId) return;

    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ job: CrmJob }>(session, `/api/crm/jobs/${entry.jobId}`, {
        method: "PATCH",
        body: JSON.stringify({ sales_owner: owner })
      });
      const dashboardResult = await refresh();
      if (dashboardResult && drill?.metric) {
        const nextPayload = buildSummaryDrill(
          drill.metric,
          dashboardResult.jobs,
          dashboardResult.quotes,
          dashboardResult.bookkeepingRows,
          dashboardResult.customerFiles,
          dashboardResult.installationInvoiceEmails,
          dashboardResult.orderCogsEmails
        );
        if (nextPayload) setDrill(nextPayload);
      }
      setMessage(`Sale assigned to ${owner}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sale owner could not be updated.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateMeasureNeededForJob(jobId: string, customerName: string, action: MeasureNeededAction) {
    if (!session) return;

    setBusy(true);
    setMessage(null);

    try {
      const result = await crmFetch<MeasureNeededApiResult>(session, `/api/crm/jobs/${jobId}/measure-needed`, {
        method: "POST",
        body: JSON.stringify({ action })
      });
      const dashboardResult = await refresh();
      if (dashboardResult && drill) {
        setDrill(
          rebuildDrillPayload(
            drill,
            dashboardResult.jobs,
            dashboardResult.quotes,
            dashboardResult.bookkeepingRows,
            dashboardResult.customerFiles,
            dashboardResult.installationInvoiceEmails,
            dashboardResult.orderCogsEmails
          )
        );
      }
      setMessage(measureNeededStatusMessage(action, customerName, result.mts));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Measure-needed status could not be updated.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateMeasureNeededEntry(entry: DrillEntry, action: MeasureNeededAction) {
    const jobId = entry.job?.id || entry.jobId || entry.row?.jobId || null;
    if (!jobId) {
      setMessage("This card is not linked to a CRM job.");
      return;
    }

    await updateMeasureNeededForJob(jobId, entry.customerName || entry.name, action);
  }

  async function markOrderedFromDrill(entry: DrillEntry) {
    if (!session) return false;

    const row = entry.row;
    const jobId = entry.job?.id || entry.jobId || row?.jobId || null;
    const quoteId = row?.quoteId || null;
    const rowId = row?.id || null;
    if (!jobId && !quoteId && !rowId) {
      setMessage("This card is a customer snapshot. Open the file to edit the source record.");
      return false;
    }

    setBusy(true);
    setMessage("Processing recent order confirmation emails...");
    try {
      const result = await crmFetch<OrderCogsPullResult>(session, "/api/crm/order-cogs/pull", {
        method: "POST",
        body: JSON.stringify({ maxResults: 100 })
      });
      const dashboardResult = await refresh();
      if (dashboardResult && drill) {
        setDrill(
          rebuildDrillPayload(
            drill,
            dashboardResult.jobs,
            dashboardResult.quotes,
            dashboardResult.bookkeepingRows,
            dashboardResult.customerFiles,
            dashboardResult.installationInvoiceEmails,
            dashboardResult.orderCogsEmails
          )
        );
      }

      const targetEmails = (result.emails || []).filter((email) =>
        (jobId && email.matched_job_id === jobId) ||
        (quoteId && email.matched_quote_id === quoteId) ||
        (rowId && email.matched_bookkeeping_entry_id === rowId)
      );
      const appliedTarget = targetEmails.find((email) => email.applied_at || email.match_status === "matched");
      if (appliedTarget) {
        setMessage(
          `Order email matched. COGS workflow processed ${appliedTarget.extracted_order_number || "the confirmation"} for ${appliedTarget.extracted_customer_name || entry.customerName || entry.name}. Review the product-line order controls for any outstanding items.`
        );
        return true;
      }

      setMessage(
        targetEmails.length > 0
          ? `Order email found but needs review; no product line was marked ordered. ${targetEmails[0].match_reason || "Review COGS email."}`
          : `Order email pull scanned ${result.scanned} recent confirmations and found no match. No product line was marked ordered.`
      );
      return false;
    } catch (error) {
      setMessage(
        `Order email pull failed: ${error instanceof Error ? error.message : "unknown error"}. No product line was marked ordered.`
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function findCogsFromDrill(entry: DrillEntry) {
    if (!session) return false;

    const row = entry.row;
    const customerName = entry.job?.customer_name || row?.customerName || entry.customerName || entry.name;
    const target = {
      customerName,
      jobId: entry.job?.id || entry.jobId || row?.jobId || null,
      quoteId: row?.quoteId || null,
      entryId: row?.id || null
    };

    setBusy(true);
    setMessage(`Searching recent manufacturer orders for ${customerName}...`);
    try {
      const result = await crmFetch<OrderCogsPullResult>(session, "/api/crm/order-cogs/pull", {
        method: "POST",
        body: JSON.stringify({ mailbox: "805shutters@gmail.com", days: 14, maxResults: 100, target })
      });
      const dashboardResult = await refresh();
      if (dashboardResult && drill) {
        setDrill(
          rebuildDrillPayload(
            drill,
            dashboardResult.jobs,
            dashboardResult.quotes,
            dashboardResult.bookkeepingRows,
            dashboardResult.customerFiles,
            dashboardResult.installationInvoiceEmails,
            dashboardResult.orderCogsEmails
          )
        );
      }

      const appliedCount = result.applied || 0;
      const addedCogs = result.addedCogs || 0;
      const total = result.targetCogsTotal == null ? null : toLedgerCurrency(result.targetCogsTotal);
      if (appliedCount) {
        setMessage(
          `Found ${appliedCount} new manufacturer order${appliedCount === 1 ? "" : "s"} for ${customerName}. Added ${toLedgerCurrency(addedCogs)}; COGS total ${total || "updated"}.`
        );
        return true;
      }
      if (result.needsReview || result.unmatched) {
        setMessage(`Found manufacturer paperwork for ${customerName}, but ${result.needsReview + result.unmatched} email${result.needsReview + result.unmatched === 1 ? " needs" : "s need"} review before COGS can be recorded.`);
        return false;
      }
      if (result.skipped) {
        setMessage(`No new COGS for ${customerName}; ${result.skipped} recent order${result.skipped === 1 ? " was" : "s were"} already recorded. COGS total ${total || "unchanged"}.`);
        return true;
      }
      setMessage(`No manufacturer order paperwork was found for ${customerName} in the last 14 days.`);
      return false;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recent manufacturer orders could not be searched.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDrillField(entry: DrillEntry, patch: DrillFieldPatch) {
    if (!session) return false;

    const row = entry.row;
    const jobId = entry.job?.id || entry.jobId || row?.jobId || null;

    if ((patch.job && !jobId) || (patch.row && !row && !jobId)) {
      setMessage("This card is a customer snapshot. Open the file to edit the source record.");
      return false;
    }

    const targets = [
      ...(patch.job ? [{ currentStatus: entry.job?.status, patch: patch.job }] : []),
      ...(patch.row
        ? [{ currentStatus: row?.status, installationComplete: row?.isInstallationComplete, patch: patch.row }]
        : [])
    ];
    const confirmed = withInstallationConfirmation(entry.customerName || entry.name, targets);
    if (!confirmed) return false;
    let targetIndex = 0;
    patch = {
      ...patch,
      ...(patch.job ? { job: confirmed[targetIndex++].patch } : {}),
      ...(patch.row ? { row: confirmed[targetIndex].patch } : {})
    };

    setBusy(true);
    setMessage(null);

    try {
      if (patch.job && jobId) {
        await crmFetch<{ job: CrmJob }>(session, `/api/crm/jobs/${jobId}`, {
          method: "PATCH",
          body: JSON.stringify(patch.job)
        });
      }

      if (patch.row) {
        if (row?.source === "crm_quote" && row.quoteId) {
          await crmFetch(session, `/api/crm/quotes/${row.quoteId}`, {
            method: "PATCH",
            body: JSON.stringify(patch.row)
          });
        } else if (row) {
          await crmFetch(session, `/api/crm/bookkeeping/${row.id}`, {
            method: "PATCH",
            body: JSON.stringify(patch.row)
          });
        } else if (jobId) {
          const job = entry.job;
          const depositPaid = Number(patch.row.deposit_paid_target || 0);
          const balancePaid = Number(patch.row.balance_paid_target || 0);
          await crmFetch(session, "/api/crm/bookkeeping", {
            method: "POST",
            body: JSON.stringify({
              job_id: jobId,
              customer_name: job?.customer_name || entry.customerName || entry.name,
              sold_date: todayInputValue(),
              total_amount: Number(job?.quote_total || job?.estimated_total || 0),
              payment_type: patch.row.payment_type || "other",
              cogs_amount: Number(patch.row.cogs_amount || patch.row.materials_cost || 0),
              deposit_required: Number(patch.row.deposit_required || 0),
              deposit_paid: depositPaid,
              balance_paid: balancePaid,
              payment_amount: Number(patch.row.payment_amount || 0),
              payment_label: patch.row.payment_label,
              paid_at: patch.row.paid_at,
              sales_owner: job?.sales_owner
            })
          });
        }
      }

      const dashboardResult = await refresh();
      if (dashboardResult && drill) {
        setDrill(
          rebuildDrillPayload(
            drill,
            dashboardResult.jobs,
            dashboardResult.quotes,
            dashboardResult.bookkeepingRows,
            dashboardResult.customerFiles,
            dashboardResult.installationInvoiceEmails,
            dashboardResult.orderCogsEmails
          )
        );
      }
      setMessage(patch.message || `${entry.name} updated.`);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Field could not be updated.");
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function applyLedgerLineAction(action: LedgerLineAction) {
    if (!session) return false;

    const basePaths: Record<LedgerLineKind, string> = {
      payment: "/api/crm/bookkeeping/payments",
      credit: "/api/crm/bookkeeping/credits",
      expense: "/api/crm/expenses"
    };

    setBusy(true);
    setMessage(null);

    try {
      if (action.op === "create") {
        await crmFetch(session, basePaths[action.kind], {
          method: "POST",
          body: JSON.stringify(action.payload || {})
        });
      } else if (action.op === "update") {
        await crmFetch(session, `${basePaths[action.kind]}/${action.id}`, {
          method: "PATCH",
          body: JSON.stringify(action.payload || {})
        });
      } else {
        await crmFetch(session, `${basePaths[action.kind]}/${action.id}`, { method: "DELETE" });
      }

      const dashboardResult = await refresh();
      if (dashboardResult && drill) {
        setDrill(
          rebuildDrillPayload(
            drill,
            dashboardResult.jobs,
            dashboardResult.quotes,
            dashboardResult.bookkeepingRows,
            dashboardResult.customerFiles,
            dashboardResult.installationInvoiceEmails,
            dashboardResult.orderCogsEmails
          )
        );
      }
      setMessage(action.message || "Ledger updated.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ledger line could not be updated.");
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function applyPaymentPlanAction(jobId: string, action: PaymentPlanUiAction) {
    if (!session) return false;

    setBusy(true);
    setMessage(null);

    try {
      if (action.op === "create") {
        await crmFetch(session, `/api/crm/jobs/${jobId}/payment-plan`, {
          method: "POST",
          body: JSON.stringify(action.payload)
        });
      } else if (action.op === "mark_paid") {
        await crmFetch(session, `/api/crm/jobs/${jobId}/payment-plan`, {
          method: "PATCH",
          body: JSON.stringify({ action: "mark_paid", seq: action.seq, payment_type: action.payment_type })
        });
      } else {
        await crmFetch(session, `/api/crm/jobs/${jobId}/payment-plan`, {
          method: "PATCH",
          body: JSON.stringify({ action: "cancel", reason: action.reason })
        });
      }

      const dashboardResult = await refresh();
      if (dashboardResult && drill) {
        setDrill(
          rebuildDrillPayload(
            drill,
            dashboardResult.jobs,
            dashboardResult.quotes,
            dashboardResult.bookkeepingRows,
            dashboardResult.customerFiles,
            dashboardResult.installationInvoiceEmails,
            dashboardResult.orderCogsEmails
          )
        );
      }
      setMessage(
        action.op === "create"
          ? "Payment plan created."
          : action.op === "mark_paid"
            ? "Installment marked paid. Balances recalculated."
            : "Payment plan canceled."
      );
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment plan action failed.");
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    const job = jobs.find((item) => item.id === formString(formData, "job_id"));
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ quote: CrmQuote }>(session, "/api/crm/quotes", {
        method: "POST",
        body: JSON.stringify({
          job_id: formString(formData, "job_id"),
          customer_name: job?.customer_name,
          status: formString(formData, "status") || "sold",
          quote_number: formString(formData, "quote_number"),
          quote_total: Number(formString(formData, "quote_total") || 0),
          deposit_paid: Number(formString(formData, "deposit_paid") || 0),
          balance_paid: Number(formString(formData, "balance_paid") || 0),
          materials_cost: Number(formString(formData, "materials_cost") || 0),
          labor_cost: Number(formString(formData, "labor_cost") || 0),
          payment_type: formString(formData, "payment_type"),
          sold_by: formString(formData, "sold_by"),
          manufacturer_name: formString(formData, "manufacturer_name"),
          manufacturer_order_ref: formString(formData, "manufacturer_order_ref"),
          manufacturer_order_url: formString(formData, "manufacturer_order_url"),
          notes: formString(formData, "notes")
        })
      });
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Quote could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function openQuoteContract(quoteId: string) {
    window.open(`/crm/quote/${quoteId}/contract-preview`, "_blank", "noopener,noreferrer");
  }

  async function sendCustomerFilePaymentLink(quote: CrmQuote, channel: PaymentLinkChannel) {
    if (!session) return;
    const label = quote.quote_number || quote.customer_name || "quote";
    setBusy(true);
    setMessage(null);

    try {
      const result = await crmFetch<{
        url: string;
        sms: { sent: boolean; skipped?: string; error?: string };
        email: { sent: boolean; skipped?: string; error?: string };
      }>(session, `/api/crm/quotes/${quote.id}/payment-link`, {
        method: "POST",
        body: JSON.stringify({
          channels: {
            email: channel === "email",
            sms: channel === "sms"
          }
        })
      });
      if (channel === "email") {
        setMessage(result.email.sent ? `Payment link emailed for ${label}.` : `Payment email skipped for ${label}: ${result.email.error || result.email.skipped || "not sent"}.`);
      } else {
        setMessage(result.sms.sent ? `Payment link texted for ${label}.` : `Payment text skipped for ${label}: ${result.sms.error || result.sms.skipped || "not sent"}.`);
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment link could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCustomerFilePaymentLink(quote: CrmQuote) {
    if (!session) return;
    const label = quote.quote_number || quote.customer_name || "quote";
    setBusy(true);
    setMessage(null);

    try {
      const result = await crmFetch<{ url: string }>(session, `/api/crm/quotes/${quote.id}/share`, {
        method: "POST"
      });
      const paymentUrl = `${result.url.split("#")[0]}#payment`;
      try {
        await navigator.clipboard.writeText(paymentUrl);
        setMessage(`Payment link copied for ${label}.`);
      } catch {
        setMessage(`Payment link ready for ${label}: ${paymentUrl}`);
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment link could not be copied.");
    } finally {
      setBusy(false);
    }
  }

  async function updateQuote(event: FormEvent<HTMLFormElement>, quote: CrmQuote) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    const customerName = quote.customer_name || jobs.find((job) => job.id === quote.job_id)?.customer_name || "this customer";
    const confirmed = withInstallationConfirmation(customerName, [
      { currentStatus: quote.status, patch: { status: formString(formData, "status") } }
    ]);
    if (!confirmed) return;
    const statusPatch = confirmed[0].patch;

    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ quote: CrmQuote }>(session, `/api/crm/quotes/${quote.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...statusPatch,
          quote_total: Number(formString(formData, "quote_total") || 0),
          materials_cost: Number(formString(formData, "materials_cost") || 0),
          sold_by: formString(formData, "sold_by"),
          payment_amount: Number(formString(formData, "payment_amount") || 0),
          payment_label: formString(formData, "payment_label") || "Balance payment",
          payment_type: formString(formData, "payment_type") || "other",
          manufacturer_name: formString(formData, "manufacturer_name"),
          manufacturer_order_ref: formString(formData, "manufacturer_order_ref"),
          manufacturer_order_url: formString(formData, "manufacturer_order_url"),
          manufacturer_document_url: formString(formData, "manufacturer_document_url"),
          notes: formString(formData, "notes")
        })
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Quote could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function createAppointmentFromSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !selectedCalendarSlot) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const customerName = formString(formData, "customer_name");
    const phone = formString(formData, "phone");
    const email = formString(formData, "email");
    const city = formString(formData, "city");
    const address = formString(formData, "address");
    const productInterest = formString(formData, "product_interest") || "Shutters";
    const assignedTo = formString(formData, "assigned_to") || "Unassigned";
    const notes = formString(formData, "notes");

    setBusy(true);
    setMessage(null);

    try {
      const { job } = await crmFetch<{ job: CrmJob }>(session, "/api/crm/jobs", {
        method: "POST",
        body: JSON.stringify({
          customer_name: customerName,
          phone,
          email,
          city,
          address,
          product_interest: productInterest,
          lead_source: formString(formData, "lead_source"),
          sales_owner: assignedTo,
          priority: "normal",
          next_action: "Prepare for appointment",
          next_action_due: selectedCalendarSlot.date,
          estimated_total: 0,
          notes
        })
      });

      await crmFetch<{ event: CrmCalendarEvent }>(session, "/api/crm/calendar", {
        method: "POST",
        body: JSON.stringify({
          job_id: job.id,
          title: `${customerName} consultation`,
          event_type: "sales_consult",
          assigned_to: assignedTo,
          start_at: selectedCalendarSlot.startAt,
          end_at: selectedCalendarSlot.endAt,
          location: address,
          notes
        })
      });

      form.reset();
      setSelectedCalendarSlot(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Appointment could not be saved.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function rescheduleCalendarEvent(calendarEvent: CrmCalendarEvent, slot: CalendarSlotSelection) {
    if (!session) return;

    if (isPastCalendarSlot(slot.date, slot.time)) {
      setMessage("Choose an upcoming appointment time.");
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ event: CrmCalendarEvent }>(session, "/api/crm/calendar", {
        method: "PATCH",
        body: JSON.stringify({
          id: calendarEvent.id,
          start_at: slot.startAt,
          end_at: slot.endAt
        })
      });
      setReschedulingCalendarEvent(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Appointment could not be rescheduled.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function rescheduleCalendarEventFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reschedulingCalendarEvent) return;

    const formData = new FormData(event.currentTarget);
    const date = formString(formData, "date");
    const time = formString(formData, "time");
    const currentDurationMinutes = calendarEventDurationMinutes(reschedulingCalendarEvent);
    const durationMinutes = calendarAppointmentDurationMinutes(formData.get("duration"), currentDurationMinutes);
    const slot = calendarSlotSelection(date, time, durationMinutes);
    await rescheduleCalendarEvent(reschedulingCalendarEvent, slot);
  }

  async function cancelCalendarEvent(calendarEvent: CrmCalendarEvent) {
    if (!session) return;

    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ event: CrmCalendarEvent }>(session, "/api/crm/calendar", {
        method: "PATCH",
        body: JSON.stringify({
          action: "cancel",
          id: calendarEvent.id
        })
      });
      setCancelingCalendarEvent(null);
      setViewingCalendarEvent(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Appointment could not be canceled.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function recordKenPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch(session, "/api/crm/ken-payments", {
        method: "POST",
        body: JSON.stringify({
          amount: Number(formString(formData, "amount") || 0),
          paid_on: formString(formData, "paid_on") || null,
          period_month: formString(formData, "period_month") || null,
          note: formString(formData, "note")
        })
      });

      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ken payment could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteKenPaymentRow(id: string) {
    if (!session) return;
    if (!window.confirm("Delete this Ken payment? It changes the payoff total.")) return;

    setBusy(true);
    setMessage(null);

    try {
      await crmFetch(session, `/api/crm/ken-payments/${id}`, { method: "DELETE" });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ken payment could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function recordCommissionPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch(session, "/api/crm/commission-payments", {
        method: "POST",
        body: JSON.stringify({
          recipient: formString(formData, "recipient"),
          amount: Number(formString(formData, "amount") || 0),
          paid_on: formString(formData, "paid_on") || null,
          period_month: formString(formData, "period_month") || null,
          note: formString(formData, "note")
        })
      });

      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Commission payment could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function recordPartnerPaymentBatch(payload: PartnerPaymentRequest) {
    if (!session) return;

    setBusy(true);
    setMessage(null);

    try {
      const result = await crmFetch<{ dashboard: CrmDashboardData; receiptEmail?: PartnerPaymentReceiptResponse }>(session, "/api/crm/payments/batch", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setData(result.dashboard);
      const receiptMessage = result.receiptEmail?.sent
        ? ` Receipt PDF emailed to ${result.receiptEmail.to}.`
        : result.receiptEmail
          ? ` Receipt email not sent: ${result.receiptEmail.skipped || result.receiptEmail.error || "unknown error"}.`
          : "";
      setMessage(
        `${paymentPersonDisplayName(payload.person)} ${payload.advance ? "advance" : "grouped payment"} recorded.${receiptMessage}`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment could not be recorded.");
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function markPartnerPaymentPaid(
    person: CrmPaymentPerson,
    item: CrmPartnerPaymentLedgerItem,
    row: CrmBookkeepingRow
  ) {
    if (!session) return;
    if (!isMikePaymentAdminEmail(user?.email)) {
      setMessage("Only Mike can mark partner payments paid.");
      return;
    }
    if (item.paymentState === "paid" || item.remainingAmount <= 0) return;

    const paidOn = item.closedAt ? item.closedAt.slice(0, 10) : row.soldDate?.slice(0, 10) || null;
    const personName = paymentPersonDisplayName(person);
    const confirmed = window.confirm(
      `Mark ${personName} paid ${toLedgerCurrency(item.remainingAmount)} for ${row.customerName}? This records the payment on ${formatShortDate(paidOn)}.`
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);

    try {
      const result = await crmFetch<{ dashboard: CrmDashboardData; receiptEmail?: PartnerPaymentReceiptResponse }>(session, "/api/crm/payments/batch", {
        method: "POST",
        body: JSON.stringify({
          person,
          paid_on: paidOn,
          period_month: item.periodMonth || (paidOn ? `${paidOn.slice(0, 7)}-01` : null),
          note: `Manual paid checkbox reconciliation for ${row.customerName}`,
          item_ids: [item.itemKey]
        } satisfies PartnerPaymentRequest)
      });
      setData(result.dashboard);
      const receiptMessage = result.receiptEmail?.sent
        ? ` Receipt PDF emailed to ${result.receiptEmail.to}.`
        : result.receiptEmail
          ? ` Receipt email not sent: ${result.receiptEmail.skipped || result.receiptEmail.error || "unknown error"}.`
          : "";
      setMessage(`${personName} marked paid for ${row.customerName}.${receiptMessage}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${personName} payment could not be marked paid.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateCommissionPaymentRow(event: FormEvent<HTMLFormElement>, payment: CrmCommissionPayment) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch(session, `/api/crm/commission-payments/${payment.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          recipient: formString(formData, "recipient"),
          amount: Number(formString(formData, "amount") || 0),
          paid_on: formString(formData, "paid_on") || null,
          period_month: formString(formData, "period_month") || null,
          note: formString(formData, "note")
        })
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Commission payment could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCommissionPaymentRow(id: string) {
    if (!session) return;
    if (!window.confirm("Delete this commission payment? It changes Mike/Jessica running balances.")) return;

    setBusy(true);
    setMessage(null);

    try {
      await crmFetch(session, `/api/crm/commission-payments/${id}`, { method: "DELETE" });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Commission payment could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch(session, "/api/crm/settings", {
        method: "PATCH",
        body: JSON.stringify({
          ken_opening_balance: Number(formString(formData, "ken_opening_balance") || 0)
        })
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function persistBookkeepingRowPatch(row: CrmBookkeepingRow, patch: Record<string, unknown>) {
    if (!session) return;

    const confirmed = withInstallationConfirmation(row.customerName, [
      { currentStatus: row.status, installationComplete: row.isInstallationComplete, patch }
    ]);
    if (!confirmed) return;
    patch = confirmed[0].patch;

    const payload = buildBookkeepingRowPayload(row, patch);
    const customerName = String(payload.customer_name || "").trim();
    const soldDate = String(payload.sold_date || "").trim();
    const customerNameChanged =
      Object.prototype.hasOwnProperty.call(patch, "customer_name") && customerName && customerName !== row.customerName;

    if (row.source === "crm_quote" && row.quoteId) {
      if (row.jobId && customerNameChanged) {
        await crmFetch(session, `/api/crm/jobs/${row.jobId}`, {
          method: "PATCH",
          body: JSON.stringify({ customer_name: customerName })
        });
      }
      const quotePayload: Record<string, unknown> = {
        ...payload,
        ...(soldDate ? { sold_at: soldDate } : {}),
        quote_total: Number(payload.total_amount || 0),
        materials_cost: Number(payload.cogs_amount || 0),
        sold_by: String(payload.sales_owner || "")
      };
      delete quotePayload.notes;
      if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
        quotePayload.bookkeeping_notes = payload.notes;
      }
      await crmFetch(session, `/api/crm/quotes/${row.quoteId}`, {
        method: "PATCH",
        body: JSON.stringify(quotePayload)
      });
    } else {
      await crmFetch(session, `/api/crm/bookkeeping/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    }
  }

  async function saveBookkeepingCell(row: CrmBookkeepingRow, patch: Record<string, unknown>) {
    if (!session) return;

    const confirmed = withInstallationConfirmation(row.customerName, [
      { currentStatus: row.status, installationComplete: row.isInstallationComplete, patch }
    ]);
    if (!confirmed) return;
    patch = confirmed[0].patch;

    setBusy(true);
    setMessage(null);

    try {
      await persistBookkeepingRowPatch(row, patch);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cell could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function saveInstallationInvoiceLedgerItem(item: InstallationInvoiceLedgerItem, patch: Record<string, unknown>) {
    if (!session) return;

    setBusy(true);
    setMessage(null);

    try {
      if (item.invoice) {
        await crmFetch(session, `/api/crm/installation-invoices/${item.invoice.id}`, {
          method: "PATCH",
          body: JSON.stringify(patch)
        });
      }
      if (item.row) {
        await persistBookkeepingRowPatch(item.row, patch);
      }
      await refresh();
      setMessage(
        patch.installation_invoice_paid_at
          ? `${item.customerName} install invoice marked paid.`
          : `${item.customerName} install invoice reopened.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Installation invoice could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function markBookkeepingBalancePaid(row: CrmBookkeepingRow) {
    if (!session) return;

    const balance = roundCurrency(row.balance);
    if (row.isPaidInFull || balance <= 0) return;

    const paidAt = todayInputValue();
    const confirmed = window.confirm(
      `Mark ${toLedgerCurrency(balance)} paid for ${row.customerName}? This records a balance payment today and closes the job as paid.`
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);

    try {
      await persistBookkeepingRowPatch(row, {
        payment_amount: balance,
        payment_label: "Balance payment",
        paid_at: paidAt,
        mark_balance_paid: true,
        ...(row.source === "crm_quote" ? { status: "paid" } : {})
      });
      await refresh();
      setMessage(`${row.customerName} balance marked paid.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Balance could not be marked paid.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteBookkeepingRow(row: CrmBookkeepingRow) {
    if (!session) return;
    if (
      !window.confirm(
        `Hide this bookkeeping row for "${row.customerName}"?\n\nThis removes only this row from the bookkeeping ledger. It does NOT delete the customer's job or quote.`
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await crmFetch(session, `/api/crm/bookkeeping/${row.id}`, { method: "DELETE" });
      await refresh();
      setMessage(`Hidden the bookkeeping row for "${row.customerName}".`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Row could not be hidden.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCustomerFile(file: CrmCustomerFile) {
    if (!session) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Delete the customer file for "${file.customerName}"?\n\nThis hides the customer, related jobs, quotes, and bookkeeping rows from the CRM. The records are kept in history.`
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await crmFetch(session, `/api/crm/customers/${encodeURIComponent(file.customer?.id || file.id)}`, {
        method: "DELETE",
        body: JSON.stringify(customerFileDeletePayload(file))
      });
      await refresh();
      setMessage(`Deleted the customer file for "${file.customerName}".`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Customer file could not be deleted.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateJob(event: FormEvent<HTMLFormElement>, job: CrmJob) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ job: CrmJob }>(session, `/api/crm/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          customer_name: formString(formData, "customer_name"),
          phone: formString(formData, "phone"),
          email: formString(formData, "email"),
          city: formString(formData, "city"),
          address: formString(formData, "address"),
          sales_owner: formString(formData, "sales_owner"),
          product_interest: formString(formData, "product_interest"),
          lead_source: formString(formData, "lead_source"),
          next_action: formString(formData, "next_action"),
          next_action_due: formString(formData, "next_action_due") || null,
          estimated_total: Number(formString(formData, "estimated_total") || 0),
          notes: formString(formData, "notes")
        })
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Job could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteJob(job: CrmJob) {
    if (!session) return;
    if (typeof window !== "undefined" && !window.confirm(`Delete "${job.customer_name}"? This removes the job from your list.`)) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      await crmFetch(session, `/api/crm/jobs/${job.id}`, { method: "DELETE" });
      await refresh();
      setMessage(`Deleted "${job.customer_name}".`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Job could not be deleted.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateKenPaymentRow(event: FormEvent<HTMLFormElement>, payment: CrmKenPayment) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch(session, `/api/crm/ken-payments/${payment.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          amount: Number(formString(formData, "amount") || 0),
          paid_on: formString(formData, "paid_on") || null,
          period_month: formString(formData, "period_month") || null,
          note: formString(formData, "note")
        })
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ken payment could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="crm-app-shell">
        <section className="crm-login-panel">
          <p className="eyebrow">Dedicated Supabase required</p>
          <h1>805 CRM is ready for its own Supabase project.</h1>
          <p>Add the 805 project URL, anon key, and service-role key to `.env.local`, then enable Google auth.</p>
        </section>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="crm-app-shell">
        <section className="crm-login-panel">
          <p className="eyebrow">805 CRM</p>
          <h1>Loading CRM.</h1>
        </section>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="crm-app-shell">
        <section className="crm-login-panel">
          <p className="eyebrow">{isKenMode ? "Ken Portal" : "Private CRM"}</p>
          <h1>{isKenMode ? "Ken bookkeeping login." : "CRM login."}</h1>
          <p>
            {isKenMode
              ? "Use Ken's approved email to open the read-only bookkeeping and payoff ledger."
              : "Use an approved 805 Shutters email to access sales jobs, quotes, bookkeeping, and calendar."}
          </p>
          {authSetupMessage ? <p className="crm-alert">{authSetupMessage}</p> : null}
          {emailLoginMessage ? <p className="crm-alert">{emailLoginMessage}</p> : null}
          <form className="crm-email-login" onSubmit={sendEmailLogin}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder={isKenMode ? KEN_CRM_EMAIL : "jessica@805shutters.com"}
                defaultValue={isKenMode ? KEN_CRM_EMAIL : ""}
                required
              />
            </label>
            <button type="submit" className="button primary" disabled={emailLoginBusy}>
              {emailLoginBusy ? "Sending link..." : "Email Login Link"}
            </button>
          </form>
          {isKenMode ? null : (
            <a
              className="button secondary"
              href={`/api/crm/oauth/google?redirectTo=${encodeURIComponent(loginRedirectPath)}`}
            >
              Continue with Google
            </a>
          )}
        </section>
      </div>
    );
  }

  if (message && !data) {
    return (
      <div className="crm-app-shell">
        <section className="crm-login-panel">
          <p className="eyebrow">{isKenMode ? "Ken Portal" : "805 CRM"}</p>
          <h1>CRM access is blocked.</h1>
          <p>{message}</p>
          <button type="button" onClick={signOut}>
            Sign Out
          </button>
        </section>
      </div>
    );
  }

  const financialUnavailable=(data?.sourceHealth||[]).some(s=>s.state!=="complete"&&["job expenses","installation invoices","order emails","Ken payments","Ken allocations","commission payments","commission allocations","settings"].includes(s.source));
  if (isKenMode && financialUnavailable) return <div className="crm-app-shell"><p role="alert">Payables are unavailable because cost or allocation sources failed to load. {data?.loadWarnings?.join(" ")}</p><button onClick={()=>void refresh()}>Retry refresh</button></div>;
  if (isKenMode) {
    const activeKenTab = activeTab === "payoff" ? "payoff" : "bookkeeping";
    return (
      <KenPortalView
        activeTab={activeKenTab}
        rows={rows}
        data={data}
        payments={kenPayments}
        busy={busy}
        onTabChange={openTab}
      />
    );
  }

  const summary = data?.summary;
  const needsOrderCount = summary?.needsOrder || 0;
  const depositNeededCount = summary?.depositNeeded || 0;
  const balanceDueCompletedCount = summary?.balanceDueCompleted || 0;
  const missingCogsCount = summary?.missingCogs || 0;
  const measureNeededCount = summary?.measureNeeded || 0;
  const measureScheduledCount = summary?.measureScheduled || 0;
  const readyToOrderCount = vendorOrderTasks.length;

  const financialViewBlocked=financialUnavailable&&["command","bookkeeping","payments","payoff","customers","jobs","installation"].includes(activeTab);
  const globalDrill = drill && (activeTab !== "command" || drill.placement === "summary") ? drill : null;
  const commandDrill = activeTab === "command" && drill?.placement !== "summary" ? drill : null;

  return (
    <div className="crm-app-shell">
      {builderQuoteId && session ? (
        builderVersion === "original-v1" ? (
          <OriginalV1QuoteBuilderPanel
            session={session}
            quoteId={builderQuoteId}
            onClose={() => setBuilderQuoteId(null)}
            onChanged={refresh}
            onSwitch={setBuilderQuoteId}
          />
        ) : (
          <QuoteBuilderPanel
            session={session}
            quoteId={builderQuoteId}
            onClose={() => setBuilderQuoteId(null)}
            onChanged={refresh}
            onSwitch={setBuilderQuoteId}
          />
        )
      ) : null}
      {data?.integrationHealth?.filter((source) => source.state !== "succeeded").map((source) => <p role="status" className="crm-feedback-banner" key={source.processor}>{source.processor.replaceAll("-", " ")}: {source.state === "unknown" ? "No processing history recorded" : source.state}. Last successful processing: {source.lastSuccessAt ? new Date(source.lastSuccessAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "Unknown"}. Refreshing the dashboard does not rerun this integration.</p>)}
      {dashboardRefreshError && <p role="alert" className="crm-feedback-banner">{dashboardRefreshError}</p>}
      {data?.loadWarnings?.map((warning) => <p role="status" className="crm-feedback-banner" key={warning}>{warning}</p>)}
      <header className="crm-topbar">
        <div className="crm-logo-lockup">
          <img src="/brand/805-shutters-logo-header.png" alt="805 Shutters" width={227} height={148} />
          <h1 className="crm-visually-hidden">CRM Command</h1>
          <span aria-hidden="true">CRM</span>
        </div>
        <section className="crm-metrics" aria-label="CRM summary">
          <Metric
            label="30-Day Customer Conversion"
            value={formatCloseRate(commandPerformance.closeRate30Days)}
            variant="performance"
            onClick={() => toggleCloseRateDrilldown(30)}
            ariaExpanded={closeRatePeriod === 30}
            ariaControls="crm-close-rate-drilldown"
          />
          <Metric
            label="60-Day Customer Conversion"
            value={formatCloseRate(commandPerformance.closeRate60Days)}
            variant="performance"
            onClick={() => toggleCloseRateDrilldown(60)}
            ariaExpanded={closeRatePeriod === 60}
            ariaControls="crm-close-rate-drilldown"
          />
          <Metric
            label="Current CRM Customer Conversion"
            value={formatCloseRate(commandPerformance.currentCrmSalesRate)}
            variant="performance"
          />
          <Metric label="30-Day Booked Sales" value={toCurrency(commandPerformance.revenue30Days)} variant="performance" />
          <Metric label="60-Day Booked Sales" value={toCurrency(commandPerformance.revenue60Days)} variant="performance" />
          <Metric label={`${new Date().getFullYear()} Booked-Sales Run Rate`} value={toCurrency(commandPerformance.currentYearForecast)} detail="YTD booked sales ÷ elapsed days × days in year" variant="performance" />
          <Metric label="Open Jobs" value={data?.summary.openJobs || 0} onClick={() => openSummaryDrill("openJobs")} />
          <Metric label="Sold Jobs" value={data?.summary.soldJobs || 0} onClick={() => openSummaryDrill("soldJobs")} />
          <Metric label="60-Day Quoted Pipeline" value={toCurrency(data?.summary.quotedPipeline)} onClick={() => openSummaryDrill("quotedPipeline")} />
          <Metric label="Sold Pipeline" value={toCurrency(data?.summary.soldPipeline)} onClick={() => openSummaryDrill("soldPipeline")} />
          <Metric label="Open Balance" value={toCurrency(data?.summary.openBalance)} onClick={() => openSummaryDrill("openBalance")} />
          <Metric label="Need To Order" value={needsOrderCount} tone={needsOrderCount > 0 ? "warning" : undefined} onClick={() => openSummaryDrill("needsOrder")} />
          <Metric label="Deposit Needed" value={depositNeededCount} tone={depositNeededCount > 0 ? "danger" : undefined} onClick={() => openSummaryDrill("depositNeeded")} />
          {readyToOrderCount > 0 ? (
            <Metric label="Ready to Order" value={readyToOrderCount} tone="warning" onClick={() => openSummaryDrill("readyToOrder")} />
          ) : null}
          <Metric label="Completed / Balance Open" value={balanceDueCompletedCount} tone={balanceDueCompletedCount > 0 ? "danger" : undefined} onClick={() => openSummaryDrill("balanceDueCompleted")} />
          <Metric label="Missing COGS" value={financialUnavailable ? "Unavailable" : missingCogsCount} tone={missingCogsCount > 0 ? "warning" : undefined} onClick={() => openSummaryDrill("missingCogs")} />
          <Metric label="Awaiting Product" value={data?.summary.awaitingProduct || 0} onClick={() => openSummaryDrill("awaitingProduct")} />
          <MeasureMetric
            needed={measureNeededCount}
            scheduled={measureScheduledCount}
            onClick={() => openSummaryDrill("measureNeeded")}
          />
        </section>
      </header>

      {closeRatePeriod ? (
        <CloseRateDrilldown
          periodDays={closeRatePeriod}
          customers={closeRatePeriod === 30
            ? commandPerformance.closeRate30DaysCustomers
            : commandPerformance.closeRate60DaysCustomers}
          onClose={() => setCloseRatePeriod(null)}
        />
      ) : null}

      {message ? (
        <p className="crm-alert" role="status" aria-live="polite" aria-atomic="true">
          {message}
        </p>
      ) : null}

      <nav className="crm-tabs" aria-label="CRM sections">
        {[
          ["command", "Command Center"],
          ["intelligence", "Sales Intelligence"],
          ["tracking", "Job Tracking"],
          ["reports", "Operations Reports"],
          ["quotes", "Quotes"],
          ["commercial", "Commercial Leads & Estimates"],
          ["customers", "Customer Files"],
          ["order-forms", "Order Forms"],
          ["bookkeeping", "Bookkeeping"],
          ["payments", "Payables"],
          ["calendar", "Calendar"]
        ].map(([tab, label]) => (
          <button
            type="button"
            key={tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => openTab(tab as CrmTab)}
          >
            {label}
          </button>
        ))}
      </nav>

      {globalDrill ? (
        <div className="crm-inline-drill-shell">
          <DrillSearchResultsPanel
            payload={globalDrill}
            quotes={quotes}
            events={events}
            busy={busy}
            onClose={() => setDrill(null)}
            onOpenPage={openCustomerSearchPage}
            onOpenCustomer={openCustomerFile}
            onReassignSale={reassignSale}
            onMeasureNeededAction={updateMeasureNeededEntry}
            onMarkOrdered={markOrderedFromDrill}
            onFindCogs={findCogsFromDrill}
            onSaveField={saveDrillField}
            onLedgerLineAction={applyLedgerLineAction}
            onPaymentPlanAction={applyPaymentPlanAction}
            onVendorOrderPacket={openVendorOrderPacket}
            onVendorOrderEmail={emailVendorOrderPacket}
            onVendorOrderAction={updateVendorOrderTask}
          />
        </div>
      ) : null}

      {activeTab === "quotes" && session ? (
        <QuotesWorkspace
          session={session}
          jobs={jobs}
          quotes={quotes}
          bookkeepingRows={rows}
          events={events}
          onChanged={refresh}
          onOpenCalendarDate={(date) => {
            setCalendarDate(date);
            setCalendarView("week");
            setCalendarManagementMode("appointments");
            setActiveTab("calendar");
          }}
          openRequest={quoteWorkspaceOpenRequest}
          onOpenCrmQuote={openQuoteWorkspaceQuote}
        />
      ) : null}

      {activeTab === "commercial" && session ? <CommercialWorkspace session={session} /> : null}

      {activeTab === "order-forms" && session ? <OrderFormLibrary session={session} /> : null}

      {activeTab === "intelligence" ? (
        <SalesIntelligencePage
          jobs={jobs}
          quotes={quotes}
          events={events}
          rows={rows}
          onOpenCustomer={(job) => openCustomerFile(job.customer_name)}
        />
      ) : null}

      {financialViewBlocked ? <p role="alert" className="crm-alert">Cost or allocation sources are unavailable. Financial summaries are withheld; the complete-record reports and Job Tracking remain available. {data?.loadWarnings?.join(" ")}</p> : null}
      {data && (activeTab === "reports" || financialViewBlocked) ? <OperationsReports data={data} activity={activitySnapshot} /> : null}
      {activeTab === "tracking" ? (
        <JobTrackingWorkspace
          ownedActions={data?.ownedActions}
          fulfillment={data?.fulfillment} events={events}
          onLoadFulfillmentScope={async quoteId => { if(!session) throw new Error("CRM session required."); const result=await crmFetch<{scope:import("@/lib/crm/fulfillment").FulfillmentScope}>(session,`/api/crm/operations/fulfillment?quoteId=${encodeURIComponent(quoteId)}`);return result.scope; }}
          onSaveFulfillment={async change => { if(!session)throw new Error("CRM session required.");setBusy(true);try{await crmFetch(session,"/api/crm/operations/fulfillment",{method:"POST",body:JSON.stringify(change)});await refresh();}finally{setBusy(false);} }}
          onSaveOwnedAction={async change => { if (!session) throw new Error("CRM session required."); setBusy(true); try { await crmFetch(session,"/api/crm/operations/tasks",{method:"POST",body:JSON.stringify(change)}); await refresh(); } finally { setBusy(false); } }}
          warnings={data?.loadWarnings}
          integrationHealth={data?.integrationHealth}
          installerOutcomes={data?.installerOutcomes}
          sourceHealth={data?.sourceHealth}
          asOf={data?.asOf}
          jobs={jobs}
          quotes={quotes}
          rows={rows}
          files={customerFiles}
          orderCogsEmails={orderCogsEmails}
          installationInvoiceEmails={installationInvoiceEmails}
          busy={busy}
          onPullInstallInvoices={pullInstallationInvoices}
          onSave={saveTrackingField}
          onStage={saveTrackingStage}
          onSendSquare={sendTrackingSquare}
          onOpenCustomer={openCustomerFile}
        />
      ) : null}

      {activeTab === "command" && !financialViewBlocked ? (
        <>
          <CommandDashboard
            jobs={jobs}
            quotes={quotes}
            rows={rows}
            files={customerFiles}
            customers={customers}
            events={events}
            activitySnapshot={activitySnapshot}
            activityLoading={activityLoading}
            activityRefreshError={activityRefreshError}
            installationInvoiceEmails={installationInvoiceEmails}
            partnerPaymentLedger={data?.partnerPaymentLedger}
            activeDrill={commandDrill}
            busy={busy}
            onProcessEmails={(target) => processEmails(target)}
            onSendSquarePaymentLink={sendSquarePaymentLink}
            onOpenPage={openCustomerSearchPage}
            onDrill={setDrill}
            onCloseDrill={() => setDrill(null)}
            onOpenCustomer={openCustomerFile}
            onReassignSale={reassignSale}
            onMeasureNeededAction={updateMeasureNeededEntry}
            onMarkOrdered={markOrderedFromDrill}
            onFindCogs={findCogsFromDrill}
            onSaveField={saveDrillField}
            onLedgerLineAction={applyLedgerLineAction}
            onPaymentPlanAction={applyPaymentPlanAction}
          />
          <section className="crm-command-grid">
            <AccountabilityBoard items={accountability} />
            <BookkeepingSnapshot rows={rows} />
          </section>
          {session ? <JessicaFeedbackHub session={session} userEmail={user?.email} /> : null}
        </>
      ) : null}

      {activeTab === "customers" && !financialViewBlocked ? (
        <CustomerFilesView
          files={customerFiles}
          focusCustomer={focusCustomer}
          onFocusHandled={() => setFocusCustomer(null)}
          onDelete={deleteCustomerFile}
          onSendPaymentLink={sendCustomerFilePaymentLink}
          onCopyPaymentLink={copyCustomerFilePaymentLink}
          onStatusChange={updateJobStatus}
          onSaveRow={saveCustomerRowField}
          onSaveJob={saveCustomerJobField}
          busy={busy}
        />
      ) : null}

      {activeTab === "jobs" && !financialViewBlocked ? (
        <section className="crm-workspace crm-jobs-workspace">
          <div className="crm-job-board">
            <div className="crm-job-toolbar">
              <div className="crm-job-search-control" role="search" aria-label="Search jobs">
                <label htmlFor="crm-job-search">Search jobs</label>
                <div className="crm-job-search-row">
                  <input
                    id="crm-job-search"
                    type="search"
                    value={jobSearch}
                    onChange={(event) => setJobSearch(event.target.value)}
                    placeholder="Customer, phone, city, owner..."
                  />
                  {normalizedJobSearch ? (
                    <button type="button" className="crm-ghost-button" onClick={() => setJobSearch("")}>
                      Clear
                    </button>
                  ) : null}
                </div>
                <span>
                  {normalizedJobSearch
                    ? `${visibleJobs.length} of ${statusFilteredJobs.length} ${statusLabel(activeJobStatus).toLowerCase()} jobs`
                    : "Search all loaded job details"}
                </span>
              </div>
              <JobStatusTabs jobs={jobs} activeStatus={activeJobStatus} onChange={setActiveJobStatus} />
              <p className="crm-lead-source-summary">
                {summarizeLeadSources(jobs)
                  .map(([label, count]) => `${label} ${count}`)
                  .join(" · ")}
              </p>
              <CollapsiblePanel title="New Sales Job">
                <form className="crm-form" onSubmit={createJob}>
                  <label>
                    Customer
                    <input name="customer_name" required placeholder="Customer name" />
                  </label>
                  <label>
                    Phone
                    <input name="phone" required placeholder="805-000-0000" />
                  </label>
                  <label>
                    Email
                    <input name="email" type="email" placeholder="customer@email.com" />
                  </label>
                  <label>
                    City
                    <input name="city" placeholder="Ventura" />
                  </label>
                  <label>
                    Address
                    <AddressAutocomplete name="address" cityFieldName="city" placeholder="Project address" />
                  </label>
                  <div className="crm-field-row">
                    <label>
                      Product
                      <select name="product_interest" defaultValue="Shutters">
                        {productOptions.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Owner
                      <select name="sales_owner" defaultValue="Unassigned">
                        {ownerOptions.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="crm-field-row">
                    <label>
                      Priority
                      <select name="priority" defaultValue="normal">
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                        <option value="low">Low</option>
                      </select>
                    </label>
                    <label>
                      Due
                      <input name="next_action_due" type="date" defaultValue={todayInputValue()} />
                    </label>
                  </div>
                  <label>
                    Lead Source
                    <LeadSourceSelect />
                  </label>
                  <label>
                    Next Action
                    <input name="next_action" defaultValue="Call customer" />
                  </label>
                  <label>
                    Estimate
                    <input name="estimated_total" type="number" min="0" step="50" placeholder="0" />
                  </label>
                  <label>
                    Notes
                    <textarea name="notes" rows={4} placeholder="Rooms, products, source, timing..." />
                  </label>
                  <button type="submit" disabled={busy}>
                    Add Job
                  </button>
                </form>
              </CollapsiblePanel>
            </div>
            <div className="crm-job-list" aria-label={`${statusLabel(activeJobStatus)} jobs`}>
              {visibleJobs.map((job) => (
                <JobCard
                  job={job}
                  key={job.id}
                  onStatusChange={updateJobStatus}
                  onMeasureNeededAction={(targetJob, action) => updateMeasureNeededForJob(targetJob.id, targetJob.customer_name, action)}
                  onSave={updateJob}
                  onDelete={deleteJob}
                  busy={busy}
                />
              ))}
              {!visibleJobs.length ? (
                <p className="crm-empty">
                  {normalizedJobSearch
                    ? `No ${statusLabel(activeJobStatus).toLowerCase()} jobs match "${normalizedJobSearch}".`
                    : `No ${statusLabel(activeJobStatus).toLowerCase()} jobs.`}
                </p>
              ) : null}
            </div>
            <CustomerFilesView
              files={customerFiles}
              activeStatus={activeJobStatus}
              focusCustomer={focusCustomer}
              onFocusHandled={() => setFocusCustomer(null)}
              onDelete={deleteCustomerFile}
              onSendPaymentLink={sendCustomerFilePaymentLink}
              onCopyPaymentLink={copyCustomerFilePaymentLink}
              onStatusChange={updateJobStatus}
              onSaveRow={saveCustomerRowField}
              onSaveJob={saveCustomerJobField}
              busy={busy}
            />
          </div>
        </section>
      ) : null}

      {activeTab === "bookkeeping" && !financialViewBlocked ? (
        <section className="crm-workspace crm-bookkeeping-workspace crm-bookkeeping-workspace--full">
          <div className="crm-bookkeeping-main">
            <BookkeepingSpreadsheet
              rows={rows}
              totals={data?.bookkeepingTotals}
              payoff={data?.kenPayoff}
              commissionSummary={data?.commissionSummary}
              partnerPaymentLedger={data?.partnerPaymentLedger}
              busy={busy}
              canMarkPartnerPaid={isMikePaymentAdminEmail(user?.email)}
              onOpenPayments={openPaymentLedger}
              onSave={saveBookkeepingCell}
              onMarkBalancePaid={markBookkeepingBalancePaid}
              onMarkPartnerPaid={markPartnerPaymentPaid}
              onDelete={deleteBookkeepingRow}
              onOpenPayoff={() => openTab("payoff")}
            />
            <OrderCogsInbox
              emails={orderCogsEmails}
              rows={rows}
              jobs={jobs}
              files={customerFiles}
              onDrill={setDrill}
            />
            <InstallationInvoiceInbox
              invoices={installationInvoiceEmails}
              rows={rows}
              onPull={pullInstallationInvoices}
              onSaveInvoice={saveInstallationInvoiceLedgerItem}
              busy={busy}
            />
          </div>
        </section>
      ) : null}

      {activeTab === "payments" && !financialViewBlocked ? (
        <PartnerPaymentsView
          ledger={data?.partnerPaymentLedger}
          activePerson={activePaymentPerson}
          onPersonChange={openPaymentLedger}
          busy={busy}
          onPay={recordPartnerPaymentBatch}
        />
      ) : null}

      {activeTab === "installation" && !financialViewBlocked ? (
        <section className="crm-workspace crm-workspace-wide crm-installation-payables-workspace">
          <InstallationInvoiceInbox
            invoices={installationInvoiceEmails}
            rows={rows}
            onPull={pullInstallationInvoices}
            onSaveInvoice={saveInstallationInvoiceLedgerItem}
            busy={busy}
          />
        </section>
      ) : null}

      {activeTab === "orders" ? (
        <section className="crm-workspace crm-workspace-wide">
          <CollapsiblePanel title="New Quote / Sold Job">
            <form className="crm-form" onSubmit={createQuote}>
              <label>
                Job
                <select name="job_id" required>
                  <option value="">Choose job</option>
                  {jobs.map((job) => (
                    <option value={job.id} key={job.id}>
                      {job.customer_name} - {job.product_interest}
                    </option>
                  ))}
                </select>
              </label>
              <div className="crm-field-row">
                <label>
                  Status
                  <select className="crm-status-select" data-status="sold" name="status" defaultValue="sold">
                    {crmQuoteStatuses.map((status) => (
                      <option value={status} key={status}>
                        {status.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sold By
                  <select name="sold_by" defaultValue="Mike">
                    {ownerOptions.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Quote Number
                <input name="quote_number" placeholder="805-1001" />
              </label>
              <div className="crm-field-row">
                <label>
                  Quote Total
                  <input name="quote_total" type="number" min="0" step="0.01" required />
                </label>
                <label>
                  COGS
                  <input name="materials_cost" type="number" min="0" step="0.01" />
                </label>
              </div>
              <div className="crm-field-row">
                <label>
                  Deposit Paid
                  <input name="deposit_paid" type="number" min="0" step="0.01" />
                </label>
                <label>
                  Balance Paid
                  <input name="balance_paid" type="number" min="0" step="0.01" />
                </label>
              </div>
              <label>
                Payment Type
                <select name="payment_type" defaultValue="other">
                  {paymentTypes.map((item) => (
                    <option value={item.value} key={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="crm-field-row">
                <label>
                  Manufacturer
                  <input name="manufacturer_name" placeholder="Norman, Alta, Horizon..." />
                </label>
                <label>
                  Order #
                  <input name="manufacturer_order_ref" placeholder="Manufacturer order" />
                </label>
              </div>
              <label>
                Order Link
                <input name="manufacturer_order_url" placeholder="https://..." />
              </label>
              <label>
                Notes
                <textarea name="notes" rows={4} placeholder="Fabric, vendor, payment notes, commission notes..." />
              </label>
              <button type="submit" disabled={busy}>
                Save Quote
              </button>
            </form>
          </CollapsiblePanel>

          <OrderBoard
            quotes={quotes}
            onUpdate={updateQuote}
            busy={busy}
            onOpenBuilder={(quoteId) => {
              setBuilderVersion("current");
              setBuilderQuoteId(quoteId);
            }}
            onOpenContract={openQuoteContract}
          />
        </section>
      ) : null}

      {activeTab === "calendar" && session ? (
        <>
          <CalendarManagementToggle mode={calendarManagementMode} onModeChange={setCalendarManagementMode} />
          {calendarManagementMode === "availability" ? (
            <AvailabilityBoard session={session} events={events} embedded />
          ) : (
            <>
              <CalendarPlanner
                session={session}
                events={events}
                anchorDate={calendarDate}
                view={calendarView}
                canOverrideAvailability={isCrmOwnerAdminEmail(user?.email)}
                onDateChange={setCalendarDate}
                onViewChange={setCalendarView}
                onSelectSlot={setSelectedCalendarSlot}
                onRescheduleEvent={rescheduleCalendarEvent}
                onOpenEvent={setViewingCalendarEvent}
              />
              {selectedCalendarSlot ? (
                <CalendarAppointmentModal
                  busy={busy}
                  selectedSlot={selectedCalendarSlot}
                  onClose={() => setSelectedCalendarSlot(null)}
                  onSubmit={createAppointmentFromSlot}
                />
              ) : null}
              {reschedulingCalendarEvent ? (
                <CalendarRescheduleModal
                  busy={busy}
                  event={reschedulingCalendarEvent}
                  onClose={() => setReschedulingCalendarEvent(null)}
                  onSubmit={rescheduleCalendarEventFromForm}
                />
              ) : null}
              {viewingCalendarEvent ? (
                <CalendarAppointmentDetailModal
                  event={viewingCalendarEvent}
                  onClose={() => setViewingCalendarEvent(null)}
                  onReschedule={(event) => {
                    setViewingCalendarEvent(null);
                    setReschedulingCalendarEvent(event);
                  }}
                  onCancel={(event) => {
                    setViewingCalendarEvent(null);
                    setCancelingCalendarEvent(event);
                  }}
                />
              ) : null}
              {cancelingCalendarEvent ? (
                <CalendarCancelModal
                  busy={busy}
                  event={cancelingCalendarEvent}
                  onClose={() => setCancelingCalendarEvent(null)}
                  onConfirm={cancelCalendarEvent}
                />
              ) : null}
            </>
          )}
        </>
      ) : null}

      {activeTab === "payoff" && !financialViewBlocked ? (
        <KenPayoffView
          payoff={data?.kenPayoff}
          buyoutLedger={data?.partnerPaymentLedger?.kenBuyout}
          payments={kenPayments}
          onRecord={recordKenPayment}
          onEdit={updateKenPaymentRow}
          onDelete={deleteKenPaymentRow}
          onSaveSettings={saveSettings}
          busy={busy}
        />
      ) : null}

    </div>
  );
}

function CalendarManagementToggle({
  mode,
  onModeChange
}: {
  mode: CalendarManagementMode;
  onModeChange: (mode: CalendarManagementMode) => void;
}) {
  return (
    <div className="crm-calendar-management-bar">
      <div className="crm-calendar-management-switch" aria-label="Calendar management mode">
        {calendarManagementOptions.map((option) => (
          <button
            type="button"
            aria-pressed={mode === option.value}
            className={mode === option.value ? "active" : ""}
            key={option.value}
            onClick={() => onModeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function KenPortalView({
  activeTab,
  rows,
  data,
  payments,
  busy,
  onTabChange
}: {
  activeTab: "bookkeeping" | "payoff";
  rows: CrmBookkeepingRow[];
  data: CrmDashboardData | null;
  payments: CrmKenPayment[];
  busy: boolean;
  onTabChange: (tab: CrmTab) => void;
}) {
  const monthlyCut = data?.partnerPaymentLedger?.people.ken.owed ?? data?.bookkeepingTotals?.kenMonthlyDue ?? 0;

  return (
    <div className="crm-app-shell crm-ken-app-shell">
      <header className="crm-topbar crm-ken-topbar">
        <div className="crm-logo-lockup">
          <img src="/brand/805-shutters-logo-header.png" alt="805 Shutters" width={227} height={148} />
          <h1 className="crm-visually-hidden">Ken Portal</h1>
          <span aria-hidden="true">Ken Portal</span>
        </div>
      </header>

      <section className="crm-ken-monthly-cut" aria-label="Ken monthly cut">
        <span>Ken's Monthly Cut</span>
        <strong>{toLedgerCurrency(monthlyCut)}</strong>
      </section>

      <nav className="crm-tabs" aria-label="Ken CRM sections">
        <button
          type="button"
          className={activeTab === "bookkeeping" ? "active" : ""}
          onClick={() => onTabChange("bookkeeping")}
        >
          Bookkeeping Spreadsheet
        </button>
        <button
          type="button"
          className={activeTab === "payoff" ? "active" : ""}
          onClick={() => onTabChange("payoff")}
        >
          Monthly Payments / Payoff Ledger
        </button>
      </nav>

      {activeTab === "bookkeeping" ? (
        <section className="crm-workspace crm-bookkeeping-workspace crm-bookkeeping-workspace--full">
          <div className="crm-bookkeeping-main">
            <ReadOnlyBookkeepingSpreadsheet
              rows={rows}
              totals={data?.bookkeepingTotals}
              payoff={data?.kenPayoff}
              partnerPaymentLedger={data?.partnerPaymentLedger}
              busy={busy}
              onOpenPayoff={() => onTabChange("payoff")}
            />
          </div>
        </section>
      ) : null}

      {activeTab === "payoff" ? (
        <KenPayoffView payoff={data?.kenPayoff} buyoutLedger={data?.partnerPaymentLedger?.kenBuyout} payments={payments} busy={busy} readOnly />
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  tone,
  variant,
  onClick,
  ariaExpanded,
  ariaControls
}: {
  label: string;
  value: number | string;
  detail?: string;
  tone?: "warning" | "danger";
  variant?: "performance";
  onClick?: () => void;
  ariaExpanded?: boolean;
  ariaControls?: string;
}) {
  const className = ["crm-metric", variant ? `crm-metric--${variant}` : "", tone ? `crm-metric--${tone}` : "", onClick ? "crm-metric-button" : ""].filter(Boolean).join(" ");

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        aria-expanded={ariaExpanded}
        aria-controls={ariaControls}
      >
        <span>{label}</span>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </button>
    );
  }
  return (
    <div className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function MeasureMetric({
  needed,
  scheduled,
  onClick
}: {
  needed: number;
  scheduled: number;
  onClick: () => void;
}) {
  const hasOutstandingMeasures = needed + scheduled > 0;
  const className = [
    "crm-metric",
    "crm-metric-button",
    "crm-measure-metric",
    hasOutstandingMeasures ? "crm-metric--warning" : ""
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-label={`Measures: ${needed} needed, ${scheduled} scheduled`}
    >
      <span className="crm-measure-metric-title">Measure</span>
      <span className="crm-measure-metric-value">
        <small>Needed</small>
        <strong>{needed}</strong>
      </span>
      <span className="crm-measure-metric-value">
        <small>Scheduled</small>
        <strong>{scheduled}</strong>
      </span>
    </button>
  );
}

function AccountabilityBoard({ items }: { items: CrmAccountabilityItem[] }) {
  const featured = items.slice(0, 18);

  return (
    <section className="crm-ledger">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Accountability</p>
          <h2>What Needs Attention</h2>
        </div>
        <strong>{items.length} open</strong>
      </div>
      <div className="crm-accountability-list">
        {featured.map((item) => (
          <article className={`crm-accountability-card ${item.urgency}`} key={item.id}>
            <div>
              <span>{item.label}</span>
              <h3>{item.detail}</h3>
            </div>
            <strong>{item.owner}</strong>
          </article>
        ))}
        {!featured.length ? <p className="crm-empty">No accountability items. The board is clean.</p> : null}
      </div>
    </section>
  );
}

function BookkeepingSnapshot({ rows }: { rows: CrmBookkeepingRow[] }) {
  const needsOrder = needToOrderRows(rows);
  const awaitingProduct = awaitingProductRows(rows);
  const openBalances = openBalanceRows(rows).slice(0, 8);

  return (
    <section className="crm-ledger">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Sales Organizer</p>
          <h2>Job Movement</h2>
        </div>
      </div>
      <div className="crm-snapshot-grid">
        <SnapshotColumn title="Need To Order" rows={needsOrder} empty="No sold jobs waiting on orders." />
        <SnapshotColumn title="Awaiting Product" rows={awaitingProduct} empty="No ordered jobs are waiting on product." />
        <SnapshotColumn title="Payment Follow-Up" rows={openBalances} empty="No open balances in the active ledger." />
      </div>
    </section>
  );
}

// ---- Command Center analytics dashboard ----

const DONUT_COLORS = [
  "#0b0b0b",
  "#3a3a36",
  "#7d7a72",
  "#b8b6ae",
  "#e5e4e2",
  "#5b5b58",
  "#9a9890",
  "#d8d8d2",
  "#2b2b28"
];
const WON_JOB_STATUSES: CrmJobStatus[] = ["sold", "ordered", "installed", "invoiced", "closed"];
const OPEN_JOB_STATUSES: CrmJobStatus[] = ["new", "follow_up", "scheduled", "quoted"];
function uniqueOpenSoldRows(rows: CrmBookkeepingRow[]) {
  return distinctRowsByJob(openSoldRows(rows));
}

type DrillPlacement = "summary" | "numbers" | "product" | "closing" | "response" | "tracking";
type DrillDocument = {
  id: string;
  title: string;
  url: string;
  quoteId?: string | null;
  status?: string | null;
  kind: string;
};
type DrillEntry = {
  id: string;
  name: string;
  customerName: string;
  meta: string;
  value?: string;
  address?: string | null;
  phone?: string | null;
  tone?: "warn";
  jobId?: string | null;
  salesOwner?: string | null;
  canReassignSale?: boolean;
  row?: CrmBookkeepingRow;
  job?: CrmJob;
  file?: CrmCustomerFile;
  documents?: DrillDocument[];
  products?: CrmCustomerFile["products"];
  notes?: string[];
  vendorOrderTask?: CrmVendorOrderTask;
};
type InstallationInvoiceLedgerStatus = "open" | "paid" | "partial" | "review";
type InstallationInvoiceLedgerItem = {
  id: string;
  source: "email" | "bookkeeping";
  companyName: string;
  customerName: string;
  invoiceNumber: string | null;
  invoiceUrl: string | null;
  receivedAt: string | null;
  amount: number;
  paidAmount: number;
  openAmount: number;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentNotes: string | null;
  status: InstallationInvoiceLedgerStatus;
  matchStatus: string | null;
  reason: string | null;
  row?: CrmBookkeepingRow;
  invoice?: CrmInstallationInvoiceEmail;
};
type InstallationInvoiceLedger = {
  items: InstallationInvoiceLedgerItem[];
  openItems: InstallationInvoiceLedgerItem[];
  paidItems: InstallationInvoiceLedgerItem[];
  reviewItems: InstallationInvoiceLedgerItem[];
  totalBilled: number;
  totalPaid: number;
  totalOpen: number;
};
type DrillPayload = {
  title: string;
  subtitle: string;
  entries: DrillEntry[];
  metric?: string;
  allowSaleReassignment?: boolean;
  placement?: DrillPlacement;
};
type DrillFieldPatch = {
  job?: Record<string, unknown>;
  row?: Record<string, unknown>;
  message?: string;
};
type LedgerLineKind = "payment" | "credit" | "expense";
type LedgerLineAction = {
  kind: LedgerLineKind;
  op: "create" | "update" | "delete";
  id?: string;
  payload?: Record<string, unknown>;
  message?: string;
};
type PaymentPlanUiAction =
  | {
      op: "create";
      payload: {
        financed_total: number;
        installment_count: number;
        method: string;
        card_fee_percent?: number;
        notes?: string | null;
      };
    }
  | { op: "mark_paid"; seq: number; payment_type?: string }
  | { op: "cancel"; reason?: string };
type CustomerSearchPageTarget = "customers" | "jobs" | "bookkeeping" | "quotes" | "contract" | "calendar";
type CustomerSearchPage = {
  target: CustomerSearchPageTarget;
  label: string;
  detail?: string;
  quoteId?: string | null;
  eventId?: string | null;
  url?: string | null;
};
type CustomerSearchResult = {
  id: string;
  entry: DrillEntry;
  pages: CustomerSearchPage[];
  score: number;
};
type MeasureNeededAction = "request" | "measured";
type SquareOrderPaymentType = "deposit" | "balance";
type SquarePaymentLinkResult = {
  warning?: string | null;
  paymentType: SquareOrderPaymentType;
  amount: number;
  recipient: string;
  url: string;
  email: { sent: boolean; skipped?: string; error?: string };
};
type MeasureNeededApiResult = {
  job: CrmJob;
  mts?: {
    status: "created" | "existing" | "skipped" | "error";
    jobNumber?: string | null;
    message?: string | null;
  };
};
type DrillEntryContext = {
  jobs?: CrmJob[];
  files?: CrmCustomerFile[];
};

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function measureNeededStatusMessage(action: MeasureNeededAction, customerName: string, mts?: MeasureNeededApiResult["mts"]) {
  if (action === "measured") return `${customerName} marked measured.`;
  if (mts?.status === "created" || mts?.status === "existing") {
    return mts.jobNumber
      ? `${customerName} added to Measure Needed and synced to MTS job ${mts.jobNumber}.`
      : `${customerName} added to Measure Needed and synced to MTS.`;
  }
  if (mts?.status === "skipped") {
    return `${customerName} added to Measure Needed. MTS sync skipped: ${mts.message || "credentials missing"}.`;
  }
  if (mts?.status === "error") {
    return `${customerName} added to Measure Needed. MTS sync error: ${mts.message || "check MTS CRM"}.`;
  }
  return `${customerName} added to Measure Needed.`;
}

function productMixKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\//g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const productMixLabelMap = new Map<string, string>(
  [
    ["shutter", "Shutters"],
    ["shutters", "Shutters"],
    ["plantation shutter", "Shutters"],
    ["plantation shutters", "Shutters"],
    ["roller shade", "Roller Shades"],
    ["roller shades", "Roller Shades"],
    ["commercial roller shade", "Commercial Roller Shades"],
    ["commercial roller shades", "Commercial Roller Shades"],
    ["solar shade", "Solar Shades"],
    ["solar shades", "Solar Shades"],
    ["blackout shade", "Blackout Shades"],
    ["blackout shades", "Blackout Shades"],
    ["honeycomb", "Honeycomb Shades"],
    ["honeycomb shade", "Honeycomb Shades"],
    ["honeycomb shades", "Honeycomb Shades"],
    ["roman shade", "Roman Shades"],
    ["roman shades", "Roman Shades"],
    ["woven wood shade", "Woven Wood Shades"],
    ["woven wood shades", "Woven Wood Shades"],
    ["layered shade", "Layered Shades"],
    ["layered shades", "Layered Shades"],
    ["sheer shade", "Sheer Shades"],
    ["sheer shades", "Sheer Shades"],
    ["sliding panel shade", "Sliding Panel Shades"],
    ["sliding panel shades", "Sliding Panel Shades"],
    ["exterior shade", "Exterior Shades"],
    ["exterior shades", "Exterior Shades"],
    ["motorized shade", "Motorized Shades"],
    ["motorized shades", "Motorized Shades"],
    ["motorized roller shade", "Motorized Shades"],
    ["motorized roller shades", "Motorized Shades"],
    ["drapery", "Drapery"],
    ["draperies", "Drapery"],
    ["drape", "Drapery"],
    ["drapes", "Drapery"],
    ["vertical blind", "Vertical Blinds"],
    ["vertical blinds", "Vertical Blinds"],
    ["mini blind", "Mini Blinds"],
    ["mini blinds", "Mini Blinds"],
    ["faux wood blind", "Wood and Faux Wood Blinds"],
    ["faux wood blinds", "Wood and Faux Wood Blinds"],
    ["wood blind", "Wood and Faux Wood Blinds"],
    ["wood blinds", "Wood and Faux Wood Blinds"],
    ["faux wood wood blinds", "Wood and Faux Wood Blinds"],
    ["faux wood and wood blinds", "Wood and Faux Wood Blinds"],
    ["aluminum blind", "Aluminum Blinds"],
    ["aluminum blinds", "Aluminum Blinds"],
    ["softwood blind", "Softwood Blinds"],
    ["softwood blinds", "Softwood Blinds"],
    ["vertical honeycomb", "Vertical Honeycomb Shades"],
    ["vertical honeycomb shade", "Vertical Honeycomb Shades"],
    ["vertical honeycomb shades", "Vertical Honeycomb Shades"],
    ["skylight", "Skylight Shades"],
    ["skylights", "Skylight Shades"],
    ["skylight shade", "Skylight Shades"],
    ["skylight shades", "Skylight Shades"]
  ].map(([alias, label]) => [productMixKey(alias), label])
);

function normalizeProductMixLabel(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  const key = productMixKey(raw);
  return productMixLabelMap.get(key) || null;
}

function splitProductInterest(value: string | null | undefined) {
  return (value || "")
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function productLabelsFromInterest(value: string | null | undefined) {
  const labels = splitProductInterest(value)
    .map(normalizeProductMixLabel)
    .filter((label): label is string => Boolean(label));
  return Array.from(new Set(labels));
}

function buildJobProductLabelMap(files: CrmCustomerFile[]) {
  const quoteToJob = new Map<string, string>();
  const entryToJob = new Map<string, string>();
  const labelsByJob = new Map<string, Set<string>>();

  for (const file of files) {
    for (const quote of file.quotes) {
      quoteToJob.set(quote.id, quote.job_id);
    }
    for (const row of file.bookkeepingRows) {
      if (row.jobId) entryToJob.set(row.id, row.jobId);
    }
  }

  for (const file of files) {
    for (const product of file.products) {
      if (product.id.startsWith("job-product-") || product.meta?.source === "crm_job") continue;
      const label = normalizeProductMixLabel(product.product_type);
      if (!label) continue;
      const jobId =
        product.job_id ||
        (product.quote_id ? quoteToJob.get(product.quote_id) : null) ||
        (product.bookkeeping_entry_id ? entryToJob.get(product.bookkeeping_entry_id) : null);
      if (!jobId) continue;
      const labels = labelsByJob.get(jobId) || new Set<string>();
      labels.add(label);
      labelsByJob.set(jobId, labels);
    }
  }

  return labelsByJob;
}

function addJobToProductBucket(map: Map<string, CrmJob[]>, label: string, job: CrmJob) {
  const list = map.get(label) || [];
  list.push(job);
  map.set(label, list);
}

function normalizeCustomerName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function customerCardDomId(name: string) {
  return `crm-cust-${normalizeCustomerName(name).replace(/[^a-z0-9]+/g, "-") || "unknown"}`;
}

function jobValue(job: CrmJob) {
  return job.quote_total || job.estimated_total || 0;
}

function saleOwnerDisplayName(value: string | null | undefined) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("jessica")) return "Jessica";
  if (lower.includes("mike")) return "Mike";
  return "Unassigned";
}

function saleOwnerDetailLabel(value: string | null | undefined) {
  const owner = saleOwnerDisplayName(value);
  return owner === "Unassigned" ? "Not assigned" : owner;
}

function customerFileForName(files: CrmCustomerFile[] = [], name: string) {
  const normalized = normalizeCustomerName(name);
  return files.find((file) => normalizeCustomerName(file.customerName) === normalized);
}

function relatedJobForRow(row: CrmBookkeepingRow, jobs: CrmJob[] = []) {
  return row.jobId ? jobs.find((job) => job.id === row.jobId) : undefined;
}

function contractUrl(contract: CrmCustomerFile["contracts"][number]) {
  if (contract.share_token) return `/quote/${contract.share_token}`;
  if (contract.contract_url) return contract.contract_url;
  return null;
}

function salesQuoteIdForCrmQuote(quote: CrmQuote | null | undefined) {
  const value = quote?.meta?.mts_quote_id || quote?.meta?.sales_quote_id;
  return typeof value === "string" && value.trim() ? value : null;
}

function mtsContractQuoteId(contract: CrmCustomerFile["contracts"][number], file?: CrmCustomerFile) {
  const contractValue = contract.meta?.mts_quote_id;
  if (typeof contractValue === "string" && contractValue.trim()) return contractValue;

  const relatedQuote = file?.quotes.find(
    (quote) =>
      (contract.quote_id && quote.id === contract.quote_id) ||
      (contract.share_token && quote.share_token === contract.share_token)
  );
  const quoteValue = relatedQuote?.meta?.mts_quote_id;
  return typeof quoteValue === "string" && quoteValue.trim() ? quoteValue : null;
}

function crmContractPreviewUrl(url: string) {
  const hashIndex = url.indexOf("#");
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  if (/[?&]crmContract=/.test(base)) return url;
  return `${base}${base.includes("?") ? "&" : "?"}crmContract=1${hash}`;
}

function documentPreviewUrl(document: DrillDocument) {
  // The search pane must show the literal customer-facing contract that was
  // emailed (share-token page); the builder view is only a fallback for quotes
  // that never had a shared contract copy.
  if (document.url) return crmContractPreviewUrl(document.url);
  if (document.quoteId) return `/crm/quote/${document.quoteId}/contract-preview`;
  return document.url;
}

function relatedContracts(file: CrmCustomerFile | undefined, row?: CrmBookkeepingRow, job?: CrmJob) {
  if (!file) return [];
  const matches = file.contracts.filter(
    (contract) =>
      (row?.jobId && contract.job_id === row.jobId) ||
      (row?.quoteId && contract.quote_id === row.quoteId) ||
      (row && contract.bookkeeping_entry_id === row.id) ||
      (job?.id && contract.job_id === job.id)
  );
  return matches.length ? matches : file.contracts;
}

function uniqueDocuments(documents: DrillDocument[]) {
  const seen = new Set<string>();
  return documents.filter((document) => {
    const key = document.url || document.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function documentsForDetail(row?: CrmBookkeepingRow, job?: CrmJob, file?: CrmCustomerFile): DrillDocument[] {
  const documents: DrillDocument[] = [];

  for (const contract of relatedContracts(file, row, job)) {
    const previewQuoteId = mtsContractQuoteId(contract, file);
    const url = contractUrl(contract) || (previewQuoteId ? `/crm/quote/${previewQuoteId}/contract-preview` : null);
    if (!url) continue;
    documents.push({
      id: `contract-${contract.id}`,
      title: contract.title || "Contract copy",
      url,
      quoteId: previewQuoteId,
      status: contract.status,
      kind: "Contract copy"
    });
  }

  if (row?.manufacturerDocumentUrl) {
    documents.push({
      id: `manufacturer-document-${row.id}`,
      title: row.manufacturerOrderRef || row.manufacturerName || "Manufacturer document",
      url: row.manufacturerDocumentUrl,
      status: effectiveBookkeepingStatus(row),
      kind: "Manufacturer document"
    });
  }

  if (row?.manufacturerOrderUrl) {
    documents.push({
      id: `manufacturer-order-${row.id}`,
      title: row.manufacturerOrderRef || "Manufacturer order",
      url: row.manufacturerOrderUrl,
      status: effectiveBookkeepingStatus(row),
      kind: "Manufacturer order"
    });
  }

  if (row?.installationInvoiceUrl) {
    documents.push({
      id: `install-invoice-${row.id}`,
      title: row.installationInvoiceNumber || "Installation invoice",
      url: row.installationInvoiceUrl,
      status: row.isInstallationComplete ? "Complete" : row.installationMatchStatus,
      kind: "Install invoice"
    });
  }

  return uniqueDocuments(documents);
}

function productsForDetail(file?: CrmCustomerFile, row?: CrmBookkeepingRow, job?: CrmJob) {
  if (!file) return [];
  const matches = file.products.filter(
    (product) =>
      (row?.jobId && product.job_id === row.jobId) ||
      (row?.quoteId && product.quote_id === row.quoteId) ||
      (row && product.bookkeeping_entry_id === row.id) ||
      (job?.id && product.job_id === job.id)
  );
  return matches.length ? matches : file.products;
}

function detailNotes(row?: CrmBookkeepingRow, job?: CrmJob, file?: CrmCustomerFile) {
  return Array.from(new Set([row?.notes, job?.notes, ...(file?.notes || [])].filter(Boolean) as string[]));
}

function jobToEntry(job: CrmJob, row?: CrmBookkeepingRow, files: CrmCustomerFile[] = []): DrillEntry {
  const value = jobValue(job);
  const file = customerFileForName(files, job.customer_name);
  const contact = dashboardRecordContactFromJob(job);
  return {
    id: job.id,
    name: job.customer_name,
    customerName: job.customer_name,
    meta: [job.product_interest, job.city, titleCase(job.status)].filter(Boolean).join(" · "),
    value: value ? toCurrency(value) : undefined,
    address: contact.address,
    phone: contact.phone,
    jobId: job.id,
    salesOwner: saleOwnerDisplayName(row?.salesOwner || job.sales_owner),
    canReassignSale: WON_JOB_STATUSES.includes(job.status),
    row,
    job,
    file,
    documents: documentsForDetail(row, job, file),
    products: productsForDetail(file, row, job),
    notes: detailNotes(row, job, file)
  };
}

function rowsByJobId(rows: CrmBookkeepingRow[]) {
  return rows.reduce<Map<string, CrmBookkeepingRow>>((map, row) => {
    if (!row.jobId || map.has(row.jobId)) return map;
    map.set(row.jobId, row);
    return map;
  }, new Map());
}

function jobsToEntries(list: CrmJob[], rows: CrmBookkeepingRow[] = [], context: DrillEntryContext = {}): DrillEntry[] {
  const rowMap = rowsByJobId(rows);
  return [...list]
    .sort((a, b) => jobValue(b) - jobValue(a))
    .map((job) => jobToEntry(job, rowMap.get(job.id), context.files));
}

function rowsToEntries(
  list: CrmBookkeepingRow[],
  valueOf: (row: CrmBookkeepingRow) => number = (row) => row.total,
  context: DrillEntryContext = {}
): DrillEntry[] {
  return [...list]
    .sort((a, b) => valueOf(b) - valueOf(a))
    .map((row) => {
      const job = relatedJobForRow(row, context.jobs);
      const file = customerFileForName(context.files, row.customerName);
      const status = effectiveBookkeepingStatus(row);
      const contact = dashboardRecordContactFromJob(job);
      return {
        id: row.id,
        name: row.customerName,
        customerName: row.customerName,
        meta: [titleCase(status), formatShortDate(row.soldDate)].filter(Boolean).join(" · "),
        value: toCurrency(valueOf(row)),
        address: contact.address,
        phone: contact.phone,
        tone: row.balance > 0 ? ("warn" as const) : undefined,
        jobId: row.jobId,
        salesOwner: saleOwnerDisplayName(row.salesOwner || job?.sales_owner),
        canReassignSale: Boolean(row.jobId && ["sold", "approved", "ordered", "received", "installed", "invoiced", "paid", "closed"].includes(status)),
        row,
        job,
        file,
        documents: documentsForDetail(row, job, file),
        products: productsForDetail(file, row, job),
        notes: detailNotes(row, job, file)
      };
    });
}

function installationInvoiceEmailKind(invoice: CrmInstallationInvoiceEmail) {
  const kind = invoice.raw?.emailKind;
  return typeof kind === "string" ? kind : null;
}

function isInstallationInvoiceLedgerEmail(invoice: CrmInstallationInvoiceEmail) {
  if (installationInvoiceEmailKind(invoice) === "completed_service_report") return false;
  return Boolean(
    Number(invoice.extracted_invoice_amount) > 0 ||
      invoice.extracted_invoice_number ||
      invoice.match_status === "matched" ||
      invoice.match_status === "needs_review" ||
      invoice.match_status === "error"
  );
}

function installationInvoiceMatchesRow(invoice: CrmInstallationInvoiceEmail, row: CrmBookkeepingRow) {
  if (invoice.matched_bookkeeping_entry_id && invoice.matched_bookkeeping_entry_id === row.id) return true;
  if (invoice.matched_quote_id && invoice.matched_quote_id === row.quoteId) return true;
  if (invoice.matched_job_id && invoice.matched_job_id === row.jobId) return true;
  if (invoice.gmail_message_id && invoice.gmail_message_id === row.installationInvoiceDocumentId) return true;
  return Boolean(
    invoice.extracted_invoice_number &&
      row.installationInvoiceNumber &&
      invoice.extracted_invoice_number === row.installationInvoiceNumber
  );
}

function rowForInstallationInvoice(invoice: CrmInstallationInvoiceEmail, rows: CrmBookkeepingRow[]) {
  return rows.find((row) => installationInvoiceMatchesRow(invoice, row));
}

const CURRENT_INSTALLATION_COMPANY = "MTS Installations";

function installationInvoicePaymentState(amount: number, paidAt: string | null | undefined, rawPaidAmount: unknown) {
  const parsedPaidAmount = Number(rawPaidAmount);
  const paidAmount = roundCurrency(
    Number.isFinite(parsedPaidAmount) && parsedPaidAmount > 0 ? parsedPaidAmount : paidAt ? amount : 0
  );
  const openAmount = roundCurrency(Math.max(amount - paidAmount, 0));
  const isPaid = amount > 0 && openAmount <= 0.009 && Boolean(paidAt || paidAmount > 0);
  return { paidAmount, openAmount, isPaid };
}

function installationInvoiceLedgerStatus(
  matchStatus: string | null,
  amount: number,
  paidAt: string | null,
  paidAmount: number,
  openAmount: number
): InstallationInvoiceLedgerStatus {
  if (amount > 0 && openAmount <= 0.009 && Boolean(paidAt || paidAmount > 0)) return "paid";
  if (paidAmount > 0) return "partial";
  if (matchStatus === "needs_review" || matchStatus === "error" || matchStatus === "unmatched") return "review";
  return "open";
}

function buildInstallationInvoiceLedger(rows: CrmBookkeepingRow[], invoices: CrmInstallationInvoiceEmail[]): InstallationInvoiceLedger {
  const items: InstallationInvoiceLedgerItem[] = [];
  const ledgerEmails = invoices.filter(isInstallationInvoiceLedgerEmail);

  for (const invoice of ledgerEmails) {
    const row = rowForInstallationInvoice(invoice, rows);
    const amount = roundCurrency(Number(invoice.extracted_invoice_amount ?? row?.installationInvoiceAmount ?? 0));
    const paidAt = invoice.installation_invoice_paid_at || row?.installationInvoicePaidAt || null;
    const invoicePaidAmount = Number(invoice.installation_invoice_paid_amount);
    const rowPaidAmount = Number(row?.installationInvoicePaidAmount);
    const rawPaidAmount = invoicePaidAmount > 0 ? invoicePaidAmount : rowPaidAmount > 0 ? rowPaidAmount : invoice.installation_invoice_paid_amount;
    const payment = installationInvoicePaymentState(amount, paidAt, rawPaidAmount);
    const customerName = invoice.extracted_customer_name || row?.customerName || "Install invoice review";
    const status = installationInvoiceLedgerStatus(
      invoice.match_status,
      amount,
      paidAt,
      payment.paidAmount,
      payment.openAmount
    );

    items.push({
      id: `email-${invoice.id}`,
      source: "email",
      companyName: CURRENT_INSTALLATION_COMPANY,
      customerName,
      invoiceNumber: invoice.extracted_invoice_number || row?.installationInvoiceNumber || null,
      invoiceUrl: invoice.email_url || row?.installationInvoiceUrl || null,
      receivedAt: invoice.sent_at || invoice.processed_at || invoice.created_at,
      amount,
      paidAmount: payment.paidAmount,
      openAmount: payment.openAmount,
      paidAt,
      paymentMethod: invoice.installation_invoice_payment_method || row?.installationInvoicePaymentMethod || null,
      paymentNotes: invoice.installation_invoice_payment_notes || row?.installationInvoicePaymentNotes || null,
      status,
      matchStatus: invoice.match_status,
      reason: invoice.match_reason || invoice.error_message || null,
      row,
      invoice
    });
  }

  for (const row of rows) {
    const hasManualInvoice = Boolean(
      row.installationInvoiceAmount > 0 ||
        row.installationInvoiceDocumentId ||
        row.installationInvoiceNumber ||
        row.installationInvoiceUrl
    );
    if (!hasManualInvoice) continue;
    if (ledgerEmails.some((invoice) => installationInvoiceMatchesRow(invoice, row))) continue;

    const amount = roundCurrency(row.installationInvoiceAmount);
    const payment = installationInvoicePaymentState(amount, row.installationInvoicePaidAt, row.installationInvoicePaidAmount);
    const status = installationInvoiceLedgerStatus(
      row.installationMatchStatus,
      amount,
      row.installationInvoicePaidAt,
      payment.paidAmount,
      payment.openAmount
    );

    items.push({
      id: `bookkeeping-${bookkeepingRowKey(row)}`,
      source: "bookkeeping",
      companyName: CURRENT_INSTALLATION_COMPANY,
      customerName: row.customerName,
      invoiceNumber: row.installationInvoiceNumber,
      invoiceUrl: row.installationInvoiceUrl,
      receivedAt: row.installationMatchedAt || row.soldDate,
      amount,
      paidAmount: payment.paidAmount,
      openAmount: payment.openAmount,
      paidAt: row.installationInvoicePaidAt,
      paymentMethod: row.installationInvoicePaymentMethod,
      paymentNotes: row.installationInvoicePaymentNotes,
      status,
      matchStatus: row.installationMatchStatus,
      reason: row.isInstallationComplete ? "Recorded on customer file" : "Manual install invoice",
      row
    });
  }

  const sortedItems = items.sort((a, b) => dateSortValue(b.receivedAt) - dateSortValue(a.receivedAt));
  const openItems = sortedItems.filter((item) => item.openAmount > 0);
  const paidItems = sortedItems.filter((item) => item.status === "paid");
  const reviewItems = sortedItems.filter((item) => item.status === "review");

  return {
    items: sortedItems,
    openItems,
    paidItems,
    reviewItems,
    totalBilled: roundCurrency(sortedItems.reduce((sum, item) => sum + item.amount, 0)),
    totalPaid: roundCurrency(sortedItems.reduce((sum, item) => sum + item.paidAmount, 0)),
    totalOpen: roundCurrency(sortedItems.reduce((sum, item) => sum + item.openAmount, 0))
  };
}

function installationLedgerItemsToDrillEntries(
  items: InstallationInvoiceLedgerItem[],
  jobs: CrmJob[],
  files: CrmCustomerFile[]
): DrillEntry[] {
  return items.map((item) => {
    const rowEntry = item.row ? rowsToEntries([item.row], () => item.openAmount || item.amount, { jobs, files })[0] : null;
    const job = rowEntry?.job || (item.invoice?.matched_job_id ? jobs.find((entry) => entry.id === item.invoice?.matched_job_id) : undefined);
    const file = rowEntry?.file || customerFileForName(files, item.customerName);
    const baseDocuments = rowEntry?.documents || documentsForDetail(undefined, job, file);
    const invoiceDocument =
      item.invoiceUrl
        ? [{ id: `install-ledger-document-${item.id}`, title: item.invoiceNumber || "Install invoice", url: item.invoiceUrl, status: item.status, kind: item.source === "email" ? "Gmail" : "Install invoice" }]
        : [];

    return {
      ...(rowEntry || {
        id: item.id,
        name: item.customerName,
        customerName: item.customerName,
        meta: "Install invoice",
        jobId: job?.id || item.invoice?.matched_job_id || null,
        job,
        file,
        documents: baseDocuments,
        products: productsForDetail(file, undefined, job),
        notes: detailNotes(undefined, job, file)
      }),
      id: item.id,
      name: item.customerName,
      customerName: item.customerName,
      meta: ["Install invoice", titleCase(item.status), formatShortDate(item.receivedAt), item.reason].filter(Boolean).join(" · "),
      value: toCurrency(item.openAmount || item.amount),
      tone: item.openAmount > 0 ? ("warn" as const) : undefined,
      documents: uniqueDocuments([...baseDocuments, ...invoiceDocument]),
      notes: Array.from(new Set([...(rowEntry?.notes || []), item.paymentNotes, item.reason].filter(Boolean) as string[]))
    };
  });
}

function filesToEntries(list: CrmCustomerFile[]): DrillEntry[] {
  return [...list]
    .sort((a, b) => b.lifetimeValue - a.lifetimeValue)
    .map((file) => ({
      id: file.id,
      name: file.customerName,
      customerName: file.customerName,
      meta: [file.city, file.latestStatus ? titleCase(file.latestStatus) : null].filter(Boolean).join(" · "),
      value: file.lifetimeValue ? toCurrency(file.lifetimeValue) : undefined,
      tone: file.openBalance > 0 ? ("warn" as const) : undefined,
      file,
      documents: documentsForDetail(undefined, undefined, file),
      products: productsForDetail(file),
      notes: detailNotes(undefined, undefined, file)
    }));
}

function quotesToEntries(
  list: CrmQuote[],
  jobs: CrmJob[],
  rows: CrmBookkeepingRow[],
  files: CrmCustomerFile[]
): DrillEntry[] {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const rowMap = rowsByJobId(rows);
  return [...list]
    .sort((a, b) => (Number(b.quote_total) || 0) - (Number(a.quote_total) || 0))
    .map((quote) => {
      const job = jobsById.get(quote.job_id);
      if (job) {
        return {
          ...jobToEntry(job, rowMap.get(job.id), files),
          id: quote.id,
          meta: ["Sent quote", formatShortDate(quote.sent_at), quote.quote_number].filter(Boolean).join(" · "),
          value: toCurrency(quote.quote_total)
        };
      }
      return {
        id: quote.id,
        name: quote.customer_name || quote.quote_number || "Sent quote",
        customerName: quote.customer_name || "Linked customer",
        meta: ["Sent quote", formatShortDate(quote.sent_at), quote.quote_number].filter(Boolean).join(" · "),
        value: toCurrency(quote.quote_total)
      };
    });
}

function searchValuesMatch(values: unknown[], query: string) {
  const terms = normalizeJobSearchText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return false;
  const haystack = normalizeJobSearchText(values.join(" "));
  const digitHaystack = compactJobSearchDigits(values.join(" "));

  return terms.every((term) => {
    if (haystack.includes(term)) return true;
    const digits = compactJobSearchDigits(term);
    return Boolean(digits && digitHaystack.includes(digits));
  });
}

function jobSearchValues(job: CrmJob) {
  return [
    job.customer_name,
    job.phone,
    job.email,
    job.address,
    job.city,
    job.product_interest,
    job.sales_owner,
    job.status,
    job.priority,
    job.next_action,
    job.next_action_due,
    job.notes,
    job.quote_total,
    job.estimated_total
  ];
}

function rowSearchValues(row: CrmBookkeepingRow) {
  return [
    row.customerName,
    row.customerPhone,
    row.quoteNumber,
    row.source,
    row.soldDate,
    row.total,
    row.depositDue,
    row.depositPaid,
    row.balancePaid,
    row.paidTotal,
    row.paymentType,
    row.cogs,
    row.balance,
    row.salesOwner,
    row.manufacturerName,
    row.manufacturerOrderRef,
    row.installationInvoiceNumber,
    row.notes,
    row.status,
    effectiveBookkeepingStatus(row)
  ];
}

function quoteSearchValues(quote: CrmQuote) {
  return [
    quote.customer_name,
    quote.quote_number,
    quote.quote_label,
    quote.status,
    quote.live_status,
    quote.quote_total,
    quote.materials_cost,
    quote.deposit_required,
    quote.balance_due,
    quote.sold_by,
    quote.customer_email,
    quote.customer_phone,
    quote.customer_address,
    quote.manufacturer_name,
    quote.manufacturer_order_ref,
    quote.notes
  ];
}

function eventSearchValues(event: CrmCalendarEvent) {
  return [
    event.title,
    event.customer_name,
    event.customer_phone,
    event.customer_email,
    event.customer_address,
    event.customer_city,
    event.product_interest,
    event.job_status,
    event.assigned_to,
    event.event_type,
    event.status,
    event.notes,
    event.customer_notes,
    event.start_at
  ];
}

function fileSearchValues(file: CrmCustomerFile) {
  return [
    file.customerName,
    file.phone,
    file.email,
    file.address,
    file.city,
    file.latestStatus,
    file.latestSoldDate,
    file.lifetimeValue,
    file.openBalance,
    ...file.jobs.flatMap(jobSearchValues),
    ...file.bookkeepingRows.flatMap(rowSearchValues),
    ...file.quotes.flatMap(quoteSearchValues),
    ...file.products.flatMap((product) => [
      product.room,
      product.product_type,
      product.description,
      product.width,
      product.height,
      product.quantity,
      product.supplier,
      product.material,
      product.fabric,
      product.color,
      product.control_type,
      product.mount_type,
      product.status
    ]),
    ...file.contracts.flatMap((contract) => [
      contract.title,
      contract.status,
      contract.total_amount,
      contract.signed_at,
      contract.contract_url,
      contract.share_token
    ]),
    ...file.notes
  ];
}

function customerSearchResultKey(entry: DrillEntry) {
  if (entry.row) return `row:${entry.row.id}`;
  if (entry.job) return `job:${entry.job.id}`;
  if (entry.file) return `file:${entry.file.id}`;
  return `entry:${entry.id}`;
}

function customerSearchResultDate(entry: DrillEntry) {
  return dateSortValue(
    entry.row?.soldDate ||
      entry.job?.appointment_start ||
      entry.job?.updated_at ||
      entry.file?.latestSoldDate ||
      entry.file?.customer?.updated_at ||
      null
  );
}

function customerSearchScore(entry: DrillEntry, query: string, sourceRank: number) {
  const normalizedQuery = normalizeJobSearchText(query);
  const customerName = normalizeJobSearchText(entry.customerName || entry.name);
  let score = sourceRank;

  if (customerName === normalizedQuery) score -= 100;
  else if (customerName.startsWith(normalizedQuery)) score -= 65;
  else if (customerName.includes(normalizedQuery)) score -= 35;

  if (entry.row?.balance && entry.row.balance > 0) score -= 4;
  if (entry.job && WON_JOB_STATUSES.includes(entry.job.status)) score -= 2;
  return score;
}

function primaryQuoteForEntry(entry: DrillEntry, quotes: CrmQuote[]) {
  // The quote the selected record itself points at wins outright — never show a
  // sibling quote's contract for a sale that has its own.
  const directQuote = entry.row?.quoteId ? quotes.find((quote) => quote.id === entry.row?.quoteId) : null;
  if (directQuote) return directQuote;

  const jobId = entry.job?.id || entry.jobId || entry.row?.jobId || null;
  const quoteIds = uniqueCustomerFileIds([
    entry.row?.quoteId,
    ...(entry.file?.quotes.map((quote) => quote.id) || [])
  ]);
  const candidates = quotes.filter(
    (quote) =>
      quoteIds.includes(quote.id) ||
      (jobId && quote.job_id === jobId) ||
      normalizeCustomerName(quote.customer_name || "") === normalizeCustomerName(entry.customerName)
  );

  // Quotes on the entry's own job beat sibling jobs' quotes that merely share
  // the customer.
  const jobMatches = jobId ? candidates.filter((quote) => quote.job_id === jobId) : [];
  const pool = jobMatches.length ? jobMatches : candidates;

  return [...pool].sort((a, b) => {
    // A signed/sold quote is the contract the customer was actually emailed;
    // prefer it over more recently touched drafts.
    const signedDiff = Number(Boolean(b.signed_at || b.sold_at)) - Number(Boolean(a.signed_at || a.sold_at));
    if (signedDiff) return signedDiff;
    return (
      dateSortValue(b.sold_at || b.approved_at || b.ordered_at || b.received_at || b.installed_at || b.created_at) -
      dateSortValue(a.sold_at || a.approved_at || a.ordered_at || a.received_at || a.installed_at || a.created_at)
    );
  })[0];
}

function calendarEventForEntry(entry: DrillEntry, events: CrmCalendarEvent[]) {
  const jobId = entry.job?.id || entry.jobId || entry.row?.jobId || null;
  const customerName = normalizeCustomerName(entry.customerName);
  return [...events]
    .filter(
      (event) =>
        (jobId && event.job_id === jobId) ||
        normalizeCustomerName(event.customer_name || event.title || "") === customerName
    )
    .sort((a, b) => dateSortValue(b.start_at) - dateSortValue(a.start_at))[0];
}

function rowNeedsOrder(row: CrmBookkeepingRow | null | undefined) {
  if (!row) return false;
  const status = effectiveBookkeepingStatus(row);
  return row.total > 0 && !isPaidInFullBookkeepingRow(row) && (status === "sold" || status === "approved");
}

function rowDepositShortfall(row: CrmBookkeepingRow | null | undefined) {
  if (!row) return 0;
  const status = effectiveBookkeepingStatus(row);
  const due = Number(row.depositDue) || 0;
  const paid = Number(row.depositPaid) || 0;
  return status === "sold" || status === "approved" ? roundCurrency(Math.max(due - paid, 0)) : 0;
}

function rowBalanceShortfall(row: CrmBookkeepingRow | null | undefined) {
  if (!row) return 0;
  const status = effectiveBookkeepingStatus(row);
  const completed = status === "installed" || status === "invoiced" || status === "closed";
  return !isPaidInFullBookkeepingRow(row) && completed ? roundCurrency(Math.max(Number(row.balance) || 0, 0)) : 0;
}

function rowMissingCogs(row: CrmBookkeepingRow | null | undefined) {
  return Boolean(row && row.total > 0 && row.cogs <= 0);
}

function rowMissingManufacturer(row: CrmBookkeepingRow | null | undefined) {
  return Boolean(rowNeedsOrder(row) && !row?.manufacturerName?.trim());
}

function rowMissingOrderRef(row: CrmBookkeepingRow | null | undefined) {
  return Boolean(rowNeedsOrder(row) && !row?.manufacturerOrderRef?.trim());
}

function rowMissingInstallInvoice(row: CrmBookkeepingRow | null | undefined) {
  return Boolean(row?.isMissingInstallerInvoice || (row && effectiveBookkeepingStatus(row) === "installed" && row.installationInvoiceAmount <= 0));
}

function customerContractPageForEntry(entry: DrillEntry, quote?: CrmQuote): CustomerSearchPage | null {
  const contractDocument =
    entry.documents?.find(
      (document) => document.kind === "Contract copy" && Boolean(document.url) && !String(document.url).startsWith("/crm/quote/")
    ) || null;
  if (!quote && !contractDocument?.url) return null;

  return {
    target: "contract",
    label: quote?.signed_at || quote?.share_token ? "Customer Contract" : "Quote Document",
    detail: contractDocument?.title || quote?.quote_number || quote?.quote_label || undefined,
    quoteId: quote?.id || null,
    url: contractDocument?.url || null
  };
}

function futureContractPagesForEntry(entry: DrillEntry, quotes: CrmQuote[]): CustomerSearchPage[] {
  const contracts = entry.file?.contracts || [];
  const futureQuoteIds = new Set(
    contracts
      .filter((contract) => {
        const partial = contract.meta?.partial_acceptance as Record<string, unknown> | undefined;
        return contract.status === "future" || partial?.role === "future";
      })
      .map((contract) => contract.quote_id)
      .filter((id): id is string => Boolean(id))
  );

  return quotes
    .filter((quote) => futureQuoteIds.has(quote.id))
    .map((quote) => ({
      target: "contract" as const,
      label: "Future Contract",
      quoteId: quote.id,
      detail: quote.quote_number || quote.quote_label || undefined
    }));
}

function customerSearchPagesForEntry(entry: DrillEntry, quotes: CrmQuote[], events: CrmCalendarEvent[]): CustomerSearchPage[] {
  const pages: CustomerSearchPage[] = [{ target: "customers", label: "Customer File" }];
  const jobId = entry.job?.id || entry.jobId || entry.row?.jobId || null;
  if (jobId || entry.job) pages.push({ target: "jobs", label: "Jobs" });
  if (entry.row) pages.push({ target: "bookkeeping", label: "Bookkeeping" });

  const quote = primaryQuoteForEntry(entry, quotes);
  if (quote) {
    const customerContractPage = customerContractPageForEntry(entry, quote);
    if (customerContractPage) pages.push(customerContractPage);
    pages.push({
      target: "quotes",
      label: "Edit Quote",
      quoteId: quote.id,
      detail: quote.quote_number || quote.quote_label || undefined
    });
  }

  pages.push(...futureContractPagesForEntry(entry, quotes));

  const event = calendarEventForEntry(entry, events);
  if (event) {
    pages.push({
      target: "calendar",
      label: "Calendar",
      eventId: event.id,
      detail: formatShortDate(event.start_at)
    });
  }

  return pages;
}

function addCustomerSearchResult(
  results: Map<string, CustomerSearchResult>,
  entry: DrillEntry | undefined,
  quotes: CrmQuote[],
  events: CrmCalendarEvent[],
  query: string,
  sourceRank: number
) {
  if (!entry) return;
  const pages = customerSearchPagesForEntry(entry, quotes, events);
  const id = customerSearchResultKey(entry);
  const score = customerSearchScore(entry, query, sourceRank);
  const existing = results.get(id);
  if (!existing || score < existing.score) {
    results.set(id, { id, entry, pages, score });
  }
}

function buildCustomerSearchResults({
  query,
  jobs,
  quotes,
  rows,
  files,
  events
}: {
  query: string;
  jobs: CrmJob[];
  quotes: CrmQuote[];
  rows: CrmBookkeepingRow[];
  files: CrmCustomerFile[];
  events: CrmCalendarEvent[];
}) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const results = new Map<string, CustomerSearchResult>();
  const rowMap = rowsByJobId(rows);
  const jobsById = new Map(jobs.map((job) => [job.id, job]));

  for (const file of files) {
    if (!searchValuesMatch(fileSearchValues(file), trimmed)) continue;

    for (const row of file.bookkeepingRows) {
      addCustomerSearchResult(results, rowsToEntries([row], (item) => item.total, { jobs, files })[0], quotes, events, trimmed, 10);
    }
    for (const job of file.jobs) {
      addCustomerSearchResult(results, jobToEntry(job, rowMap.get(job.id), files), quotes, events, trimmed, 12);
    }
    if (!file.bookkeepingRows.length && !file.jobs.length) {
      addCustomerSearchResult(results, filesToEntries([file])[0], quotes, events, trimmed, 18);
    }
  }

  for (const job of jobs) {
    if (!searchValuesMatch(jobSearchValues(job), trimmed)) continue;
    addCustomerSearchResult(results, jobToEntry(job, rowMap.get(job.id), files), quotes, events, trimmed, 0);
  }

  for (const row of rows) {
    if (!searchValuesMatch(rowSearchValues(row), trimmed)) continue;
    addCustomerSearchResult(results, rowsToEntries([row], (item) => item.total, { jobs, files })[0], quotes, events, trimmed, 2);
  }

  for (const quote of quotes) {
    if (!searchValuesMatch(quoteSearchValues(quote), trimmed)) continue;
    const job = jobsById.get(quote.job_id);
    const entry = job
      ? jobToEntry(job, rowMap.get(job.id), files)
      : quotesToEntries([quote], jobs, rows, files)[0];
    addCustomerSearchResult(results, entry, quotes, events, trimmed, 4);
  }

  for (const event of events) {
    if (!searchValuesMatch(eventSearchValues(event), trimmed)) continue;
    const job = event.job_id ? jobsById.get(event.job_id) : undefined;
    const file = customerFileForName(files, event.customer_name || event.title || "");
    const entry = job
      ? jobToEntry(job, rowMap.get(job.id), files)
      : file
        ? filesToEntries([file])[0]
        : undefined;
    addCustomerSearchResult(results, entry, quotes, events, trimmed, 8);
  }

  return [...results.values()]
    .sort((a, b) => a.score - b.score || customerSearchResultDate(b.entry) - customerSearchResultDate(a.entry))
    .slice(0, 12);
}

function reviewEmailsToEntries({
  installationInvoices,
  orderCogsEmails,
  jobs,
  rows,
  files
}: {
  installationInvoices: CrmInstallationInvoiceEmail[];
  orderCogsEmails: CrmOrderCogsEmail[];
  jobs: CrmJob[];
  rows: CrmBookkeepingRow[];
  files: CrmCustomerFile[];
}): DrillEntry[] {
  const reviewInstall = installationInvoices.filter((invoice) => invoice.match_status === "needs_review" || invoice.match_status === "error");
  const reviewCogs = orderCogsEmails.filter((email) => email.match_status === "needs_review" || email.match_status === "error");
  const entries: DrillEntry[] = [];

  for (const invoice of reviewInstall) {
    const row = rows.find((item) => item.id === invoice.matched_bookkeeping_entry_id);
    const job = jobs.find((item) => item.id === invoice.matched_job_id || item.id === row?.jobId);
    const customerName = invoice.extracted_customer_name || row?.customerName || job?.customer_name || "Install invoice review";
    const file = customerFileForName(files, customerName);
    entries.push({
      id: `install-review-${invoice.id}`,
      name: customerName,
      customerName,
      meta: ["Install invoice", titleCase(invoice.match_status), invoice.match_reason].filter(Boolean).join(" · "),
      value: invoice.extracted_invoice_amount ? toCurrency(invoice.extracted_invoice_amount) : undefined,
      tone: "warn",
      jobId: invoice.matched_job_id || row?.jobId || null,
      row,
      job,
      file,
      documents: invoice.email_url
        ? [{ id: `install-email-${invoice.id}`, title: invoice.subject || "Install invoice email", url: invoice.email_url, status: invoice.match_status, kind: "Gmail" }]
        : undefined,
      notes: [invoice.match_reason || invoice.error_message || ""].filter(Boolean)
    });
  }

  for (const email of reviewCogs) {
    const row = rows.find((item) => item.id === email.matched_bookkeeping_entry_id);
    const job = jobs.find((item) => item.id === email.matched_job_id || item.id === row?.jobId);
    const customerName = email.extracted_customer_name || row?.customerName || job?.customer_name || "Order COGS review";
    const file = customerFileForName(files, customerName);
    entries.push({
      id: `cogs-review-${email.id}`,
      name: customerName,
      customerName,
      meta: ["Order COGS", titleCase(email.match_status), email.match_reason].filter(Boolean).join(" · "),
      value: email.extracted_order_amount ? toCurrency(email.extracted_order_amount) : undefined,
      tone: "warn",
      jobId: email.matched_job_id || row?.jobId || null,
      row,
      job,
      file,
      documents: email.email_url
        ? [{ id: `cogs-email-${email.id}`, title: email.subject || "Order COGS email", url: email.email_url, status: email.match_status, kind: "Gmail" }]
        : undefined,
      notes: [email.match_reason || email.error_message || ""].filter(Boolean)
    });
  }

  return entries;
}

function hasJessicaNet(row: CrmBookkeepingRow) {
  return (row.jessicaCommission || 0) > 0;
}

function jessicaNetReviewReasons(row: CrmBookkeepingRow) {
  const reasons: string[] = [];
  if ((row.cogs || 0) <= 0) reasons.push("COGS missing");
  if (!row.isPaidInFull || row.balance > 0) reasons.push("balance open");
  if (!row.isInstallationComplete) reasons.push("install cost not finalized");
  return reasons;
}

function isFinalJessicaNetRow(row: CrmBookkeepingRow) {
  return hasJessicaNet(row) && jessicaNetReviewReasons(row).length === 0;
}

function jessicaNetDrillEntries(rows: CrmBookkeepingRow[], jobs: CrmJob[], files: CrmCustomerFile[]) {
  const reviewEntries = rowsToEntries(
    rows.filter((row) => hasJessicaNet(row) && !isFinalJessicaNetRow(row)),
    (row) => row.jessicaCommission,
    { jobs, files }
  ).map((entry) => {
    const reasons = entry.row ? jessicaNetReviewReasons(entry.row) : [];
    return {
      ...entry,
      tone: "warn" as const,
      meta: [entry.meta, reasons.join(", ")].filter(Boolean).join(" · "),
      notes: Array.from(new Set([...(entry.notes || []), `Jessica estimate is not final: ${reasons.join(", ")}`].filter(Boolean)))
    };
  });
  const finalEntries = rowsToEntries(
    rows.filter(isFinalJessicaNetRow),
    (row) => row.jessicaCommission,
    { jobs, files }
  );
  return [...reviewEntries, ...finalEntries];
}

function partnerRemainingForRows(
  rows: CrmBookkeepingRow[],
  person: CrmPaymentPerson,
  ledger: CrmPartnerPaymentLedger | undefined
) {
  if (!ledger) return null;
  const itemKeys = new Set(rows.map((row) => partnerPaymentItemKeyForRow(person, row)));
  return ledger.people[person].activeItems
    .filter((item) => itemKeys.has(item.itemKey))
    .reduce((sum, item) => sum + item.remainingAmount, 0);
}

// Builds the drill payloads for the global summary band, mirroring backend.ts summary logic.
function buildSummaryDrill(
  metric: string,
  jobs: CrmJob[],
  quotes: CrmQuote[],
  rows: CrmBookkeepingRow[],
  files: CrmCustomerFile[],
  installationInvoiceEmails: CrmInstallationInvoiceEmail[] = [],
  orderCogsEmails: CrmOrderCogsEmail[] = [],
  vendorOrderTasks?: CrmVendorOrderTask[]
): DrillPayload | null {
  switch (metric) {
    case "openJobs":
      return {
        title: "Open Jobs",
        subtitle: "Distinct jobs with unfinished work or obligations; includes prepaid work",
        metric,
        placement: "summary",
        entries: rowsToEntries(uniqueOpenSoldRows(rows), (row) => row.balance, { jobs, files })
      };
    case "soldJobs":
      return {
        title: "Sold Jobs",
        subtitle: "CRM jobs from sold through closed",
        metric,
        allowSaleReassignment: true,
        placement: "summary",
        entries: jobsToEntries(soldLifecycleJobs(jobs), rows, { files }).map((entry) => ({ ...entry, canReassignSale: true }))
      };
    case "quotedPipeline":
      return {
        title: "Quoted Pipeline",
        subtitle: "Sent quotes still active for 60 days",
        metric,
        placement: "summary",
        entries: quotesToEntries(quotedPipelineQuotes(quotes), jobs, rows, files)
      };
    case "soldPipeline":
      return {
        title: "Sold Pipeline",
        subtitle: "Open sold jobs by full sale total",
        metric,
        placement: "summary",
        entries: rowsToEntries(openSoldRows(rows), (row) => row.total, { jobs, files })
      };
    case "openBalance":
      return {
        title: "Open Balance",
        subtitle: "Jobs with money still owed",
        metric,
        placement: "summary",
        entries: rowsToEntries(openBalanceRows(rows), (row) => row.balance, { jobs, files })
      };
    case "needsOrder":
      return {
        title: "Need To Order",
        subtitle: "Accepted orders ready for order review; one row per order",
        metric,
        placement: "summary",
        entries: rowsToEntries(needToOrderRows(rows), (row) => row.total, { jobs, files })
      };
    case "depositNeeded":
      return {
        title: "Deposit Needed",
        subtitle: "Sold jobs where the deposit hasn't been collected",
        metric,
        placement: "summary",
        entries: rowsToEntries(
          depositNeededRows(rows),
          (row) => {
            const configuredShortfall = Math.max((Number(row.depositDue) || 0) - (Number(row.depositPaid) || 0), 0);
            return configuredShortfall > 0 ? configuredShortfall : Math.max(Number(row.balance) || 0, 0);
          },
          { jobs, files }
        )
      };
    case "readyToOrder":
      if (!vendorOrderTasks) return null;
      return {
        title: "Ready to Order",
        subtitle: "Submitted technical measures separated into review-only manufacturer orders",
        metric,
        placement: "summary",
        entries: vendorOrderTasks.map((task) => {
          const job = jobs.find((item) => item.id === task.jobId);
          const file = files.find((item) => normalizeCustomerName(item.customerName) === normalizeCustomerName(task.customerName));
          return {
            id: `vendor-order-${task.taskId}`,
            name: task.customerName,
            customerName: task.customerName,
            meta: [
              task.quoteNumber,
              `${task.manufacturer} · ${task.lineCount} line${task.lineCount === 1 ? "" : "s"}`,
              task.productNames.join(", "),
              formatShortDate(task.submittedAt),
            ].filter(Boolean).join(" · "),
            value: task.status.replaceAll("_", " "),
            jobId: task.jobId,
            job,
            file,
            vendorOrderTask: task,
            notes: [
              task.message,
              task.sourceKind === "signed_contract"
                ? "Ordering authority: signed contract; no technical measure was required."
                : "Ordering authority: submitted technical measure overriding the signed contract.",
              "This packet contains only this manufacturer's lines and repeats the same customer and job identity used by the other manufacturer packets.",
              "Review the packet against the submitted technical measure before placing, submitting, checking out, confirming, or finalizing the order.",
            ],
          };
        }),
      };
    case "balanceDueCompleted":
      return {
        title: "Completed / Balance Open",
        subtitle: "Recorded completed orders with an open balance; due dates require contract review",
        metric,
        placement: "summary",
        entries: rowsToEntries(balanceDueCompletedRows(rows, jobs, quotes), (row) => row.balance, { jobs, files })
      };
    case "missingCogs":
      return {
        title: "Missing COGS",
        subtitle: "Cost of goods not yet entered",
        metric,
        placement: "summary",
        entries: rowsToEntries(missingCogsRows(rows), (row) => row.total, { jobs, files })
      };
    case "awaitingProduct":
      return {
        title: "Awaiting Product",
        subtitle: "Ordered jobs waiting on product",
        metric,
        placement: "summary",
        entries: rowsToEntries(awaitingProductRows(rows), (row) => row.total, { jobs, files })
      };
    case "measureNeeded":
      return {
        title: "Measure Needed",
        subtitle: "Sold jobs waiting on a technical measure",
        metric,
        placement: "summary",
        entries: jobsToEntries(measureNeededJobs(jobs), rows, { files })
      };
    case "jessicaNet":
      const finalRows = rows.filter(isFinalJessicaNetRow);
      const reviewRows = rows.filter((row) => hasJessicaNet(row) && !isFinalJessicaNetRow(row));
      return {
        title: "Jessica Net Review",
        subtitle: `${finalRows.length} final / ${reviewRows.length} need review`,
        metric,
        placement: "numbers",
        entries: jessicaNetDrillEntries(rows, jobs, files)
      };
    default:
      return null;
  }
}

function rowValueForDrill(payload: DrillPayload) {
  const label = `${payload.title} ${payload.subtitle}`.toLowerCase();
  if (label.includes("collected") || label.includes("paying")) return (row: CrmBookkeepingRow) => row.paidTotal;
  if (label.includes("outstanding") || label.includes("open balance") || label.includes("money still owed")) {
    return (row: CrmBookkeepingRow) => row.balance;
  }
  if (label.includes("jessica net")) return (row: CrmBookkeepingRow) => row.jessicaCommission;
  if (label.includes("profit")) return (row: CrmBookkeepingRow) => row.mikeProfit;
  return (row: CrmBookkeepingRow) => row.total;
}

function rebuildDrillPayload(
  payload: DrillPayload,
  jobs: CrmJob[],
  quotes: CrmQuote[],
  rows: CrmBookkeepingRow[],
  files: CrmCustomerFile[],
  installationInvoiceEmails: CrmInstallationInvoiceEmail[] = [],
  orderCogsEmails: CrmOrderCogsEmail[] = []
) {
  if (payload.metric) {
    return buildSummaryDrill(payload.metric, jobs, quotes, rows, files, installationInvoiceEmails, orderCogsEmails) || payload;
  }

  const rowValue = rowValueForDrill(payload);
  const updatedEntries = payload.entries.map((entry) => {
    if (entry.row) {
      const row = rows.find((item) => item.id === entry.row?.id || (entry.row?.quoteId && item.quoteId === entry.row.quoteId));
      if (row) return rowsToEntries([row], rowValue, { jobs, files })[0] || entry;
    }

    const jobId = entry.job?.id || entry.jobId;
    if (jobId) {
      const job = jobs.find((item) => item.id === jobId);
      if (job) return jobsToEntries([job], rows, { files })[0] || entry;
    }

    if (entry.file) {
      const file = files.find((item) => item.id === entry.file?.id) || customerFileForName(files, entry.customerName);
      if (file) return filesToEntries([file])[0] || entry;
    }

    return entry;
  });

  return { ...payload, entries: updatedEntries };
}

type JobTrackingStageId =
  | "scheduled"
  | "need_follow_up"
  | "sold_need_deposit"
  | "need_measure"
  | "need_to_order"
  | "ordered"
  | "shipped"
  | "balance_needed"
  | "complete";

type JobTrackingStage = {
  id: JobTrackingStageId;
  label: string;
  detail: string;
  color: string;
  angle: number;
};

type JobTrackingItem = {
  id: string;
  stageId: JobTrackingStageId;
  customerName: string;
  meta: string;
  value: number;
  sortTime: number;
  emailSignals: string[];
  entry: DrillEntry;
};

type JobTrackingBucket = JobTrackingStage & {
  items: JobTrackingItem[];
  totalValue: number;
  emailCount: number;
};

const JOB_TRACKING_STAGES: JobTrackingStage[] = [
  { id: "scheduled", label: "Scheduled", detail: "Booked consultations", color: "#256f78", angle: -90 },
  { id: "need_follow_up", label: "Need Follow Up (not sold)", detail: "Open leads and unsold quotes", color: "#8a6f28", angle: -130 },
  { id: "sold_need_deposit", label: "Sold/Need deposit(customer signed email)", detail: "Signed and waiting on deposit", color: "#ad4f2f", angle: -170 },
  { id: "need_measure", label: "Need Measure (after deposit)", detail: "Deposit in, measure pending", color: "#6f4fa1", angle: -210 },
  { id: "need_to_order", label: "Need to order", detail: "Ready for vendor order", color: "#2e7d45", angle: -250 },
  { id: "ordered", label: "Ordered", detail: "Order email or ordered status", color: "#1f5f9a", angle: -290 },
  { id: "shipped", label: "Shipped", detail: "Shipping/received signal", color: "#008178", angle: -330 },
  { id: "balance_needed", label: "Balance Needed", detail: "Installed or invoiced with balance", color: "#9a3d57", angle: -370 },
  { id: "complete", label: "Complete", detail: "Paid or closed", color: "#2b2b28", angle: -410 }
];

const JOB_TRACKING_COMPLETE_STAGE: JobTrackingStage = JOB_TRACKING_STAGES.find((stage) => stage.id === "complete") || {
  id: "complete",
  label: "Complete",
  detail: "Paid or closed",
  color: "#2b2b28",
  angle: -410
};
const JOB_TRACKING_ORBIT_STAGES = JOB_TRACKING_STAGES.filter((stage) => stage.id !== "complete");

const JOB_TRACKING_WHEEL_BACKGROUND = `conic-gradient(${JOB_TRACKING_ORBIT_STAGES.map((stage, index) => {
  const start = (index / JOB_TRACKING_ORBIT_STAGES.length) * 360;
  const end = ((index + 1) / JOB_TRACKING_ORBIT_STAGES.length) * 360;
  return `${stage.color} ${start}deg ${end}deg`;
}).join(", ")})`;
const JOB_TRACKING_WHEEL_STYLE = { background: JOB_TRACKING_WHEEL_BACKGROUND } as CSSProperties;

function emptyJobTrackingBuckets() {
  return new Map<JobTrackingStageId, JobTrackingBucket>(
    JOB_TRACKING_STAGES.map((stage) => [
      stage.id,
      {
        ...stage,
        items: [],
        totalValue: 0,
        emailCount: 0
      }
    ])
  );
}

function latestQuoteByJob(quotes: CrmQuote[]) {
  const map = new Map<string, CrmQuote>();
  for (const quote of quotes) {
    const existing = map.get(quote.job_id);
    if (!existing || dateSortValue(quote.updated_at || quote.created_at) > dateSortValue(existing.updated_at || existing.created_at)) {
      map.set(quote.job_id, quote);
    }
  }
  return map;
}

function isAppliedOrderEmail(email: CrmOrderCogsEmail) {
  return email.match_status === "matched" || Boolean(email.applied_at);
}

function isAppliedInstallEmail(email: CrmInstallationInvoiceEmail) {
  return email.match_status === "matched" || Boolean(email.applied_at);
}

function emailLooksLikeShipping(email: CrmOrderCogsEmail) {
  const text = [email.subject, email.snippet, email.match_reason, email.extracted_order_number]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\b(ship|shipped|shipment|shipping|tracking|carrier|delivered|delivery|in transit|eta)\b/.test(text);
}

function matchedOrderEmailsForTarget(
  orderCogsEmails: CrmOrderCogsEmail[],
  row?: CrmBookkeepingRow,
  job?: CrmJob,
  quote?: CrmQuote
) {
  return orderCogsEmails.filter((email) => {
    if (row?.id && email.matched_bookkeeping_entry_id === row.id) return true;
    if (row?.jobId && email.matched_job_id === row.jobId) return true;
    if (row?.quoteId && email.matched_quote_id === row.quoteId) return true;
    if (job?.id && email.matched_job_id === job.id) return true;
    if (quote?.id && email.matched_quote_id === quote.id) return true;
    return false;
  });
}

function matchedInstallEmailsForTarget(
  installationInvoiceEmails: CrmInstallationInvoiceEmail[],
  row?: CrmBookkeepingRow,
  job?: CrmJob,
  quote?: CrmQuote
) {
  return installationInvoiceEmails.filter((email) => {
    if (row?.id && email.matched_bookkeeping_entry_id === row.id) return true;
    if (row?.jobId && email.matched_job_id === row.jobId) return true;
    if (row?.quoteId && email.matched_quote_id === row.quoteId) return true;
    if (job?.id && email.matched_job_id === job.id) return true;
    if (quote?.id && email.matched_quote_id === quote.id) return true;
    return false;
  });
}

function quoteStatusForTracking(quote?: CrmQuote) {
  return quote?.live_status || quote?.status || null;
}

function isCompleteTrackingRow(row: CrmBookkeepingRow, status: string) {
  return row.isPaidInFull || status === "paid" || status === "closed" || (row.balance <= 0 && ["installed", "invoiced"].includes(status));
}

function isBalanceNeededTrackingRow(row: CrmBookkeepingRow, status: string, hasInstallEmail: boolean) {
  return row.balance > 0 && (["installed", "invoiced", "paid", "closed"].includes(status) || hasInstallEmail);
}

function classifyTrackingRow(
  row: CrmBookkeepingRow,
  job: CrmJob | undefined,
  quote: CrmQuote | undefined,
  orderEmails: CrmOrderCogsEmail[],
  installEmails: CrmInstallationInvoiceEmail[]
): JobTrackingStageId | null {
  const status = effectiveBookkeepingStatus(row);
  if (status === "lost" || status === "archived") return null;

  const appliedOrderEmails = orderEmails.filter(isAppliedOrderEmail);
  const hasOrderEmail = appliedOrderEmails.length > 0;
  const hasShippingSignal = appliedOrderEmails.some(emailLooksLikeShipping);
  const hasInstallEmail = installEmails.some(isAppliedInstallEmail);
  const quoteStatus = quoteStatusForTracking(quote);

  if (isCompleteTrackingRow(row, status)) return "complete";
  if (isBalanceNeededTrackingRow(row, status, hasInstallEmail)) return "balance_needed";
  if (status === "received" || quoteStatus === "received" || hasShippingSignal) return "shipped";
  if (status === "ordered" || quoteStatus === "ordered" || hasOrderEmail) return "ordered";

  const depositNeeded = trackingRowNeedsDeposit(row);
  if (depositNeeded) return "sold_need_deposit";
  if (job && isMeasureNeededJob(job) && !depositNeeded) return "need_measure";
  if (status === "sold" || status === "approved" || status === "legacy" || status === "manual") return "need_to_order";
  if (status === "draft" || status === "sent") return "need_follow_up";
  return null;
}

function classifyTrackingJob(job: CrmJob, quote: CrmQuote | undefined, orderEmails: CrmOrderCogsEmail[]): JobTrackingStageId | null {
  if (job.status === "lost") return null;

  const appliedOrderEmails = orderEmails.filter(isAppliedOrderEmail);
  const hasOrderEmail = appliedOrderEmails.length > 0;
  const hasShippingSignal = appliedOrderEmails.some(emailLooksLikeShipping);
  const quoteStatus = quoteStatusForTracking(quote);
  const jobOpenBalance = Math.max((Number(job.estimated_total) || 0) - (Number(job.deposit_paid) || 0), 0);

  if (job.status === "closed" || (["installed", "invoiced"].includes(job.status) && jobOpenBalance <= 0)) return "complete";
  if (["installed", "invoiced"].includes(job.status) && jobOpenBalance > 0) return "balance_needed";
  if (quoteStatus === "received" || hasShippingSignal) return "shipped";
  if (job.status === "ordered" || quoteStatus === "ordered" || hasOrderEmail) return "ordered";

  if (job.status === "sold") {
    if ((Number(job.deposit_paid) || 0) <= 0) return "sold_need_deposit";
    if (isMeasureNeededJob(job)) return "need_measure";
    return "need_to_order";
  }

  if (job.status === "scheduled" || job.appointment_start) return "scheduled";
  if (job.status === "new" || job.status === "follow_up" || job.status === "quoted" || quoteStatus === "draft" || quoteStatus === "sent") {
    return "need_follow_up";
  }

  return null;
}

function trackingEmailSignals(orderEmails: CrmOrderCogsEmail[], installEmails: CrmInstallationInvoiceEmail[]) {
  const signals: string[] = [];
  const appliedOrders = orderEmails.filter(isAppliedOrderEmail);
  const shipping = appliedOrders.filter(emailLooksLikeShipping);
  const reviewOrders = orderEmails.filter((email) => email.match_status === "needs_review" || email.match_status === "error");
  const appliedInstall = installEmails.filter(isAppliedInstallEmail);
  const reviewInstall = installEmails.filter((email) => email.match_status === "needs_review" || email.match_status === "error");

  if (shipping.length) signals.push(`${shipping.length} shipping`);
  if (appliedOrders.length) signals.push(`${appliedOrders.length} order`);
  if (appliedInstall.length) signals.push(`${appliedInstall.length} install`);
  if (reviewOrders.length + reviewInstall.length) signals.push(`${reviewOrders.length + reviewInstall.length} review`);
  return signals;
}

function trackingRowSortTime(row: CrmBookkeepingRow, job?: CrmJob, quote?: CrmQuote) {
  return Math.max(
    dateSortValue(quote?.installed_at),
    dateSortValue(quote?.received_at),
    dateSortValue(quote?.ordered_at),
    dateSortValue(row.soldDate),
    dateSortValue(job?.appointment_start),
    dateSortValue(job?.created_at)
  );
}

function trackingItemMeta(statusLabelText: string, parts: Array<string | null | undefined>) {
  return [statusLabelText, ...parts].filter(Boolean).join(" / ");
}

function addTrackingItem(bucketMap: Map<JobTrackingStageId, JobTrackingBucket>, item: JobTrackingItem) {
  const bucket = bucketMap.get(item.stageId);
  if (!bucket) return;
  bucket.items.push(item);
  bucket.totalValue += item.value;
  if (item.emailSignals.length) bucket.emailCount += 1;
}

function buildJobTrackingBuckets({
  jobs,
  quotes,
  rows,
  files,
  orderCogsEmails,
  installationInvoiceEmails
}: {
  jobs: CrmJob[];
  quotes: CrmQuote[];
  rows: CrmBookkeepingRow[];
  files: CrmCustomerFile[];
  orderCogsEmails: CrmOrderCogsEmail[];
  installationInvoiceEmails: CrmInstallationInvoiceEmail[];
}) {
  const bucketMap = emptyJobTrackingBuckets();
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const quotesById = new Map(quotes.map((quote) => [quote.id, quote]));
  const quoteByJobId = latestQuoteByJob(quotes);
  const includedJobIds = new Set<string>();
  const includedQuoteIds = new Set<string>();

  for (const row of rows) {
    const job = row.jobId ? jobsById.get(row.jobId) : undefined;
    const quote = row.quoteId ? quotesById.get(row.quoteId) || undefined : undefined;
    const orderEmails = matchedOrderEmailsForTarget(orderCogsEmails, row, job, quote);
    const installEmails = matchedInstallEmailsForTarget(installationInvoiceEmails, row, job, quote);
    const stageId = classifyTrackingRow(row, job, quote, orderEmails, installEmails);
    if (!stageId) continue;

    if (row.jobId) includedJobIds.add(row.jobId);
    if (row.quoteId) includedQuoteIds.add(row.quoteId);

    const entry =
      rowsToEntries([row], (item) => item.total, { jobs, files })[0] || {
        id: row.id,
        name: row.customerName,
        customerName: row.customerName,
        meta: titleCase(effectiveBookkeepingStatus(row)),
        value: toCurrency(row.total),
        row,
        job,
        file: customerFileForName(files, row.customerName)
      };
    const emailSignals = trackingEmailSignals(orderEmails, installEmails);
    addTrackingItem(bucketMap, {
      id: `row-${row.id}`,
      stageId,
      customerName: row.customerName,
      meta: trackingItemMeta(titleCase(effectiveBookkeepingStatus(row)), [
        row.manufacturerName,
        row.manufacturerOrderRef,
        formatShortDate(row.soldDate)
      ]),
      value: Number(row.total) || 0,
      sortTime: trackingRowSortTime(row, job, quote),
      emailSignals,
      entry: {
        ...entry,
        meta: [entry.meta, emailSignals.join(" / ")].filter(Boolean).join(" / ")
      }
    });
  }

  for (const job of jobs) {
    if (includedJobIds.has(job.id)) continue;
    const quote = quoteByJobId.get(job.id);
    const orderEmails = matchedOrderEmailsForTarget(orderCogsEmails, undefined, job, quote);
    const stageId = classifyTrackingJob(job, quote, orderEmails);
    if (!stageId) continue;

    includedJobIds.add(job.id);
    if (quote?.id) includedQuoteIds.add(quote.id);

    const entry =
      jobsToEntries([job], rows, { files })[0] || {
        id: job.id,
        name: job.customer_name,
        customerName: job.customer_name,
        meta: titleCase(job.status),
        value: toCurrency(jobValue(job)),
        jobId: job.id,
        job,
        file: customerFileForName(files, job.customer_name)
      };
    const emailSignals = trackingEmailSignals(orderEmails, []);
    addTrackingItem(bucketMap, {
      id: `job-${job.id}`,
      stageId,
      customerName: job.customer_name,
      meta: trackingItemMeta(titleCase(job.status), [job.product_interest, job.city, formatShortDate(job.appointment_start)]),
      value: jobValue(job),
      sortTime: Math.max(dateSortValue(job.appointment_start), dateSortValue(job.created_at)),
      emailSignals,
      entry: {
        ...entry,
        meta: [entry.meta, emailSignals.join(" / ")].filter(Boolean).join(" / ")
      }
    });
  }

  for (const quote of quotes) {
    if (includedQuoteIds.has(quote.id) || (quote.job_id && includedJobIds.has(quote.job_id))) continue;
    const status = quoteStatusForTracking(quote);
    if (status !== "draft" && status !== "sent") continue;
    const entry =
      quotesToEntries([quote], jobs, rows, files)[0] || {
        id: quote.id,
        name: quote.customer_name || quote.quote_number || "Linked quote",
        customerName: quote.customer_name || "Linked customer",
        meta: titleCase(status),
        value: toCurrency(quote.quote_total)
      };
    addTrackingItem(bucketMap, {
      id: `quote-${quote.id}`,
      stageId: "need_follow_up",
      customerName: quote.customer_name || entry?.customerName || "Linked customer",
      meta: trackingItemMeta(titleCase(status), [quote.quote_number, formatShortDate(quote.sent_at || quote.created_at)]),
      value: Number(quote.quote_total) || 0,
      sortTime: dateSortValue(quote.sent_at || quote.created_at),
      emailSignals: [],
      entry
    });
  }

  return JOB_TRACKING_STAGES.map((stage) => {
    const bucket = bucketMap.get(stage.id);
    const items = [...(bucket?.items || [])].sort((a, b) => b.sortTime - a.sortTime || b.value - a.value);
    return {
      ...stage,
      items,
      totalValue: bucket?.totalValue || 0,
      emailCount: bucket?.emailCount || 0
    };
  });
}

function jobTrackingBucketEntries(bucket: JobTrackingBucket) {
  return bucket.items.map((item) => item.entry).filter(Boolean);
}

function jobTrackingNodeStyle(bucket: JobTrackingBucket, maxCount: number) {
  const pct = maxCount ? Math.max(8, Math.round((bucket.items.length / maxCount) * 100)) : 8;
  return {
    "--tracking-angle": `${bucket.angle}deg`,
    "--tracking-counter-angle": `${-bucket.angle}deg`,
    "--tracking-color": bucket.color,
    "--tracking-fill": `${pct}%`
  } as CSSProperties;
}

function JobTrackingView({
  jobs,
  quotes,
  rows,
  files,
  orderCogsEmails,
  installationInvoiceEmails,
  busy,
  onPullInstallInvoices,
  onDrill
}: {
  jobs: CrmJob[];
  quotes: CrmQuote[];
  rows: CrmBookkeepingRow[];
  files: CrmCustomerFile[];
  orderCogsEmails: CrmOrderCogsEmail[];
  installationInvoiceEmails: CrmInstallationInvoiceEmail[];
  busy: boolean;
  onPullInstallInvoices: () => void;
  onDrill: (payload: DrillPayload) => void;
}) {
  const buckets = useMemo(
    () => buildJobTrackingBuckets({ jobs, quotes, rows, files, orderCogsEmails, installationInvoiceEmails }),
    [jobs, quotes, rows, files, orderCogsEmails, installationInvoiceEmails]
  );
  const orbitBuckets = buckets.filter((bucket) => bucket.id !== "complete");
  const completeBucket =
    buckets.find((bucket) => bucket.id === "complete") || {
      ...JOB_TRACKING_COMPLETE_STAGE,
      items: [],
      totalValue: 0,
      emailCount: 0
    };
  const totalJobs = buckets.reduce((sum, bucket) => sum + bucket.items.length, 0);
  const activeJobs = orbitBuckets.reduce((sum, bucket) => sum + bucket.items.length, 0);
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.items.length));
  const orbitMaxCount = Math.max(1, ...orbitBuckets.map((bucket) => bucket.items.length));
  const shownCompleteItems = completeBucket.items.slice(0, completeBucket.items.length > 7 ? 6 : 7);
  const hiddenCompleteCount = Math.max(completeBucket.items.length - shownCompleteItems.length, 0);
  const inboxStats = useMemo(
    () => ({
      order: orderCogsEmails.filter(isAppliedOrderEmail).length,
      shipping: orderCogsEmails.filter((email) => isAppliedOrderEmail(email) && emailLooksLikeShipping(email)).length,
      install: installationInvoiceEmails.filter(isAppliedInstallEmail).length,
      review:
        orderCogsEmails.filter((email) => email.match_status === "needs_review" || email.match_status === "error").length +
        installationInvoiceEmails.filter((email) => email.match_status === "needs_review" || email.match_status === "error").length
    }),
    [orderCogsEmails, installationInvoiceEmails]
  );

  function openBucket(bucket: JobTrackingBucket) {
    onDrill({
      title: bucket.label,
      subtitle: `${bucket.items.length} ${bucket.items.length === 1 ? "job" : "jobs"} / ${bucket.detail}`,
      placement: "tracking",
      entries: jobTrackingBucketEntries(bucket)
    });
  }

  return (
    <section className="crm-job-tracking">
      <div className="crm-section-head crm-job-tracking-head">
        <div>
          <p className="eyebrow">Job Tracking</p>
          <h2>Workflow By Status</h2>
        </div>
        <div className="crm-job-tracking-actions">
          <button type="button" className="crm-ghost-button" onClick={onPullInstallInvoices} disabled={busy}>
            Pull Install Emails
          </button>
        </div>
      </div>

      <div className="crm-job-tracking-inbox" aria-label="Inbox signals included in job tracking">
        <span>
          <strong>{inboxStats.order}</strong> order emails
        </span>
        <span>
          <strong>{inboxStats.shipping}</strong> shipping signals
        </span>
        <span>
          <strong>{inboxStats.install}</strong> install emails
        </span>
        <span className={inboxStats.review ? "warn" : ""}>
          <strong>{inboxStats.review}</strong> review
        </span>
      </div>

      <div className="crm-job-tracking-workspace">
        <div className="crm-job-tracking-orbit" aria-label="Job tracking circular workflow">
          <div className="crm-job-tracking-core" style={JOB_TRACKING_WHEEL_STYLE}>
            <div>
              <span>Active</span>
              <strong>{activeJobs}</strong>
              <em>{totalJobs} total</em>
            </div>
          </div>
          {orbitBuckets.map((bucket) => {
            const shownItems = bucket.items.slice(0, bucket.items.length > 4 ? 3 : 4);
            const hiddenCount = Math.max(bucket.items.length - shownItems.length, 0);
            return (
              <button
                type="button"
                className={`crm-job-tracking-node ${bucket.items.length ? "" : "empty"}`}
                style={jobTrackingNodeStyle(bucket, orbitMaxCount)}
                onClick={() => openBucket(bucket)}
                key={bucket.id}
              >
                <span className="crm-job-tracking-stage">{bucket.label}</span>
                <strong>{bucket.items.length}</strong>
                <span className="crm-job-tracking-fill" aria-hidden="true" />
                <span className="crm-job-tracking-value">{toCurrency(bucket.totalValue)}</span>
                <ul>
                  {shownItems.map((item) => (
                    <li key={item.id}>{item.customerName}</li>
                  ))}
                  {hiddenCount ? <li>+{hiddenCount} more</li> : null}
                  {!bucket.items.length ? <li>No jobs</li> : null}
                </ul>
                {bucket.emailCount ? <small>{bucket.emailCount} inbox-backed</small> : null}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={`crm-job-tracking-complete ${completeBucket.items.length ? "" : "empty"}`}
          style={jobTrackingNodeStyle(completeBucket, maxCount)}
          onClick={() => openBucket(completeBucket)}
        >
          <span className="crm-job-tracking-stage">Complete</span>
          <strong>{completeBucket.items.length}</strong>
          <span className="crm-job-tracking-fill" aria-hidden="true" />
          <span className="crm-job-tracking-value">{toCurrency(completeBucket.totalValue)}</span>
          <ul>
            {shownCompleteItems.map((item) => (
              <li key={item.id}>{item.customerName}</li>
            ))}
            {hiddenCompleteCount ? <li>+{hiddenCompleteCount} more</li> : null}
            {!completeBucket.items.length ? <li>No completed orders</li> : null}
          </ul>
          {completeBucket.emailCount ? <small>{completeBucket.emailCount} inbox-backed</small> : null}
        </button>
      </div>
    </section>
  );
}

function CommandDashboard({
  jobs,
  quotes,
  rows,
  files,
  customers,
  events,
  activitySnapshot,
  activityLoading,
  activityRefreshError,
  installationInvoiceEmails,
  partnerPaymentLedger,
  activeDrill,
  busy,
  onProcessEmails,
  onSendSquarePaymentLink,
  onOpenPage,
  onDrill,
  onCloseDrill,
  onOpenCustomer,
  onReassignSale,
  onMeasureNeededAction,
  onMarkOrdered,
  onFindCogs,
  onSaveField,
  onLedgerLineAction,
  onPaymentPlanAction
}: {
  jobs: CrmJob[];
  quotes: CrmQuote[];
  rows: CrmBookkeepingRow[];
  files: CrmCustomerFile[];
  customers: CrmCustomer[];
  events: CrmCalendarEvent[];
  activitySnapshot: CrmActivitySnapshot | null;
  activityLoading: boolean;
  activityRefreshError: string | null;
  installationInvoiceEmails: CrmInstallationInvoiceEmail[];
  partnerPaymentLedger?: CrmPartnerPaymentLedger;
  activeDrill: DrillPayload | null;
  busy: boolean;
  onProcessEmails: (target?: DrillEntry | null) => void;
  onSendSquarePaymentLink: (quoteId: string, paymentType: SquareOrderPaymentType, recipientEmail?: string) => Promise<SquarePaymentLinkResult>;
  onOpenPage: (page: CustomerSearchPage, entry: DrillEntry) => void;
  onDrill: (payload: DrillPayload) => void;
  onCloseDrill: () => void;
  onOpenCustomer: (customerName: string) => void;
  onReassignSale?: (entry: DrillEntry, owner: string) => void;
  onMeasureNeededAction?: (entry: DrillEntry, action: MeasureNeededAction) => void;
  onMarkOrdered?: (entry: DrillEntry) => Promise<boolean>;
  onFindCogs?: (entry: DrillEntry) => Promise<boolean>;
  onSaveField: (entry: DrillEntry, patch: DrillFieldPatch) => Promise<boolean>;
  onLedgerLineAction?: (action: LedgerLineAction) => Promise<boolean>;
  onPaymentPlanAction?: (jobId: string, action: PaymentPlanUiAction) => Promise<boolean>;
}) {
  const canViewMikeFinancials = rows.some((row) => Object.hasOwn(row, "mikeProfit"));
  const mikeSoldProfitAllocation = useMemo(() => buildMikeSoldProfitAllocationSummary(rows), [rows]);
  const numbers = useMemo(() => {
    const bookedRevenue = rows.reduce((sum, row) => sum + (row.total || 0), 0);
    const collected = rows.reduce((sum, row) => sum + (row.paidTotal || 0), 0);
    const collectedRows = rows.filter((row) => (row.paidTotal || 0) > 0);
    const outstandingRows = rows.filter((row) => row.balance > 0);
    const outstanding = outstandingRows.reduce((sum, row) => sum + row.balance, 0);
    const jessicaNetRows = rows.filter(hasJessicaNet);
    const jessicaFinalRows = jessicaNetRows.filter(isFinalJessicaNetRow);
    const jessicaReviewRows = jessicaNetRows.filter((row) => !isFinalJessicaNetRow(row));
    const jessicaDueFromLedger = partnerRemainingForRows(jessicaFinalRows, "jessica", partnerPaymentLedger);
    const jessicaDue = jessicaDueFromLedger ?? jessicaFinalRows.reduce((sum, row) => sum + (row.jessicaCommissionOwed || 0), 0);
    const installationLedger = buildInstallationInvoiceLedger(rows, installationInvoiceEmails);
    return {
      bookedRevenue,
      collected,
      collectedRows,
      outstanding,
      outstandingRows,
      jessicaNetRows,
      jessicaFinalRows,
      jessicaReviewRows,
      jessicaDue,
      installationLedger
    };
  }, [rows, installationInvoiceEmails, partnerPaymentLedger]);

  const productMixReport = useMemo(() => {
    const map = new Map<string, CrmJob[]>();
    const needsDetails: CrmJob[] = [];
    const savedProductLabels = buildJobProductLabelMap(files);

    for (const job of jobs) {
      const productLabels = savedProductLabels.get(job.id);
      let labels = productLabels ? Array.from(productLabels) : [];

      if (!labels.length) {
        labels = productLabelsFromInterest(job.product_interest);
      }

      if (!labels.length) {
        needsDetails.push(job);
        continue;
      }

      for (const label of labels) {
        addJobToProductBucket(map, label, job);
      }
    }

    const slices = [...map.entries()]
      .map(([label, list]) => ({
        label,
        list,
        count: list.length,
        value: list.reduce((sum, job) => sum + jobValue(job), 0)
      }))
      .sort((a, b) => b.count - a.count);
    return { slices, needsDetails };
  }, [jobs, files]);

  const response = useMemo(() => {
    const measured = jobs
      .filter((job) => job.appointment_start)
      .map((job) => {
        const start = job.appointment_start as string;
        return {
          job,
          days: (new Date(start).getTime() - new Date(job.created_at).getTime()) / 86_400_000
        };
      })
      .filter((item) => item.days >= 0 && item.days < 120);
    const buckets: Array<{ label: string; test: (days: number) => boolean; list: CrmJob[] }> = [
      { label: "Same day", test: (days) => days < 1, list: [] },
      { label: "1–2 days", test: (days) => days >= 1 && days < 3, list: [] },
      { label: "3–5 days", test: (days) => days >= 3 && days < 6, list: [] },
      { label: "6+ days", test: (days) => days >= 6, list: [] }
    ];
    for (const item of measured) {
      const bucket = buckets.find((entry) => entry.test(item.days));
      if (bucket) bucket.list.push(item.job);
    }
    const avg = measured.length
      ? measured.reduce((sum, item) => sum + item.days, 0) / measured.length
      : 0;
    return { buckets, avg, count: measured.length };
  }, [jobs]);

  const productMix = productMixReport.slices;
  const productsNeedingDetails = productMixReport.needsDetails;
  const productTotal = productMix.reduce((sum, slice) => sum + slice.count, 0);
  const responseMax = Math.max(1, ...response.buckets.map((bucket) => bucket.list.length));
  const activePlacement = activeDrill?.placement || "summary";
  const openNeedsProductDetails = () =>
    onDrill({
      title: "Needs Product Details",
      subtitle: `${productsNeedingDetails.length} jobs have no recognized sold product category`,
      placement: "product",
      entries: jobsToEntries(productsNeedingDetails, rows, { files })
    });
  const drillPanel = (placements: DrillPlacement[]) =>
    activeDrill && placements.includes(activePlacement) ? (
      <DrillDetailPanel
        payload={activeDrill}
        busy={busy}
        onClose={onCloseDrill}
        onOpenCustomer={onOpenCustomer}
        onReassignSale={onReassignSale}
        onMeasureNeededAction={onMeasureNeededAction}
        onMarkOrdered={onMarkOrdered}
        onFindCogs={onFindCogs}
        onSaveField={onSaveField}
        onLedgerLineAction={onLedgerLineAction}
        onPaymentPlanAction={onPaymentPlanAction}
      />
    ) : null;

  return (
    <section className="crm-dashboard">
      <div className="crm-section-head crm-dashboard-head">
        <div>
          <p className="eyebrow">Our Numbers</p>
          <h2>Business At A Glance</h2>
        </div>
        <GlobalCustomerSearchPanel
          jobs={jobs}
          quotes={quotes}
          rows={rows}
          files={files}
          events={events}
          busy={busy}
          onProcessEmails={onProcessEmails}
          onSendSquarePaymentLink={onSendSquarePaymentLink}
          onOpenPage={onOpenPage}
          onOpenCustomer={onOpenCustomer}
          onReassignSale={onReassignSale}
          onMeasureNeededAction={onMeasureNeededAction}
          onMarkOrdered={onMarkOrdered}
          onFindCogs={onFindCogs}
          onSaveField={onSaveField}
          onLedgerLineAction={onLedgerLineAction}
        onPaymentPlanAction={onPaymentPlanAction}
        />
        <strong>{jobs.length} jobs</strong>
      </div>

      <div className="crm-stat-band">
        <StatTile
          label="Booked Revenue"
          value={toCurrency(numbers.bookedRevenue)}
          sub={`${rows.length} jobs`}
          onClick={() =>
            onDrill({
              title: "Booked Revenue",
              subtitle: "All booked jobs",
              placement: "numbers",
              entries: rowsToEntries(rows, (row) => row.total, { jobs, files })
            })
          }
        />
        <StatTile
          label="Collected"
          value={toCurrency(numbers.collected)}
          sub={`${numbers.collectedRows.length} paying`}
          onClick={() =>
            onDrill({
              title: "Collected",
              subtitle: "Jobs with payments in",
              placement: "numbers",
              entries: rowsToEntries(numbers.collectedRows, (row) => row.paidTotal, { jobs, files })
            })
          }
        />
        <StatTile
          label="Outstanding"
          value={toCurrency(numbers.outstanding)}
          sub={`${numbers.outstandingRows.length} open`}
          tone={numbers.outstanding > 0 ? "warn" : undefined}
          onClick={() =>
            onDrill({
              title: "Outstanding Balances",
              subtitle: "Jobs with money still owed",
              placement: "numbers",
              entries: rowsToEntries(numbers.outstandingRows, (row) => row.balance, { jobs, files })
            })
          }
        />
        <StatTile
          label="Install Fees"
          value={toCurrency(numbers.installationLedger.totalOpen)}
          sub={`${numbers.installationLedger.openItems.length} open / ${toCurrency(numbers.installationLedger.totalPaid)} paid`}
          tone={numbers.installationLedger.totalOpen > 0 ? "warn" : undefined}
          onClick={() =>
            onDrill({
              title: "Open Install Fees",
              subtitle: "Installer invoices received and not fully paid",
              placement: "numbers",
              entries: installationLedgerItemsToDrillEntries(numbers.installationLedger.openItems, jobs, files)
            })
          }
        />
        {canViewMikeFinancials ? (
          <StatTile
            label="Sold-Order Profit Allocation"
            value={toCurrency(mikeSoldProfitAllocation.sold.total)}
            sub={`${mikeSoldProfitAllocation.sold.count} sold · all-time · Mike 100% / Jessica sales 50%`}
            onClick={() =>
              onDrill({
                title: "Sold-Order Profit Allocation",
                subtitle: "Deduplicated sold orders · Mike 100% / Jessica sales 50% · projected, not cash earnings",
                placement: "numbers",
                entries: rowsToEntries(mikeSoldProfitAllocation.rows, (row) => row.mikeProfit, { jobs, files })
              })
            }
          />
        ) : null}
        <StatTile
          label="Jessica Due"
          value={toCurrency(numbers.jessicaDue)}
          sub={
            numbers.jessicaReviewRows.length
              ? `${numbers.jessicaReviewRows.length} need review`
              : `${numbers.jessicaFinalRows.length} final`
          }
          tone={numbers.jessicaReviewRows.length ? "warn" : undefined}
          onClick={() =>
            onDrill(
              buildSummaryDrill("jessicaNet", jobs, quotes, rows, files, installationInvoiceEmails) || {
                title: "Jessica Net Review",
                subtitle: `${numbers.jessicaFinalRows.length} final / ${numbers.jessicaReviewRows.length} need review`,
                metric: "jessicaNet",
                placement: "numbers",
                entries: jessicaNetDrillEntries(numbers.jessicaNetRows, jobs, files)
              }
            )
          }
        />
      </div>

      {canViewMikeFinancials ? (
        <p className="crm-payables-summary-definition">
          All-time sold-order allocation: {toCurrency(mikeSoldProfitAllocation.active.total)} across {mikeSoldProfitAllocation.active.count} active sold orders + {toCurrency(mikeSoldProfitAllocation.closed.total)} across {mikeSoldProfitAllocation.closed.count} closed sold orders. This is projected profit allocation, not cash earnings.
        </p>
      ) : null}

      {canViewMikeFinancials &&
      (mikeSoldProfitAllocation.missingCogsCount || mikeSoldProfitAllocation.missingInstallerInvoiceCount) ? (
        <p className="crm-bookkeeping-alert">
          Sold-order allocation is projected, not cash earnings: {mikeSoldProfitAllocation.missingCogsCount} sold order
          {mikeSoldProfitAllocation.missingCogsCount === 1 ? " is" : "s are"} missing COGS and {mikeSoldProfitAllocation.missingInstallerInvoiceCount} have incomplete installer costs.
        </p>
      ) : null}

      {drillPanel(["summary", "numbers"])}

      <div className="crm-dashboard-grid">
        <section className="crm-ledger crm-chart-card">
          <div className="crm-section-head">
            <div>
              <p className="eyebrow">Product Mix</p>
              <h2>Products By Category</h2>
            </div>
            <strong>{productTotal}</strong>
          </div>
          {productTotal ? (
            <div className="crm-donut-row">
              <Donut slices={productMix} total={productTotal} />
              <div className="crm-product-mix-details">
                <ul className="crm-legend">
                  {productMix.map((slice, index) => (
                    <li key={slice.label}>
                      <button
                        type="button"
                        className="crm-legend-item"
                        onClick={() =>
                          onDrill({
                            title: slice.label,
                            subtitle: `${slice.count} jobs · ${toCurrency(slice.value)} pipeline`,
                            placement: "product",
                            entries: jobsToEntries(slice.list, rows, { files })
                          })
                        }
                      >
                        <span className="crm-swatch" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                        <span className="crm-legend-label">{slice.label}</span>
                        <span className="crm-legend-count">{slice.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {productsNeedingDetails.length ? (
                  <button
                    type="button"
                    className="crm-legend-item crm-product-review-button"
                    onClick={openNeedsProductDetails}
                  >
                    <span className="crm-swatch" style={{ background: "transparent", border: "1px dashed var(--muted)" }} />
                    <span className="crm-legend-label">Needs product details</span>
                    <span className="crm-legend-count">{productsNeedingDetails.length}</span>
                  </button>
                ) : null}
              </div>
            </div>
          ) : productsNeedingDetails.length ? (
            <button
              type="button"
              className="crm-legend-item crm-product-review-button"
              onClick={openNeedsProductDetails}
            >
              <span className="crm-swatch" style={{ background: "transparent", border: "1px dashed var(--muted)" }} />
              <span className="crm-legend-label">Needs product details</span>
              <span className="crm-legend-count">{productsNeedingDetails.length}</span>
            </button>
          ) : (
            <p className="crm-empty">No jobs to chart yet.</p>
          )}
        </section>

        <section className="crm-ledger crm-chart-card crm-chart-card--response">
          <div className="crm-section-head">
            <div>
              <p className="eyebrow">Response Time</p>
              <h2>Lead → Appointment</h2>
            </div>
            <strong>{response.count ? `${response.avg.toFixed(1)} days avg` : "—"}</strong>
          </div>
          {response.count ? (
            <div className="crm-bars">
              {response.buckets.map((bucket) => {
                const count = bucket.list.length;
                return (
                  <button
                    type="button"
                    key={bucket.label}
                    className="crm-bar-row"
                    disabled={!count}
                    onClick={() =>
                      count &&
                      onDrill({
                        title: `Response: ${bucket.label}`,
                        subtitle: "Lead to booked appointment",
                        placement: "response",
                        entries: jobsToEntries(bucket.list, rows, { files })
                      })
                    }
                  >
                    <span className="crm-bar-label">{bucket.label}</span>
                    <span className="crm-bar-track">
                      <span className="crm-bar-fill" style={{ width: `${(count / responseMax) * 100}%` }} />
                    </span>
                    <span className="crm-bar-count">{count}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="crm-empty">No appointments booked yet to measure response time.</p>
          )}
        </section>
        <UnifiedActivityFeed
          events={events}
          snapshot={activitySnapshot}
          jobs={jobs}
          quotes={quotes}
          rows={rows}
          customers={customers}
          customerFiles={files}
          loading={activityLoading}
          error={activityRefreshError}
          onOpenCustomer={onOpenCustomer}
        />
      </div>

      {drillPanel(["product", "closing", "response"])}
    </section>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
  onClick
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
  onClick: () => void;
}) {
  return (
    <button type="button" className={`crm-stat-tile ${tone === "warn" ? "warn" : ""}`} onClick={onClick}>
      <span className="crm-stat-label">{label}</span>
      <strong className="crm-stat-value">{value}</strong>
      {sub ? <span className="crm-stat-sub">{sub}</span> : null}
    </button>
  );
}

function Donut({
  slices,
  total
}: {
  slices: Array<{ label: string; count: number }>;
  total: number;
}) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let acc = 0;
  return (
    <svg viewBox="0 0 200 200" className="crm-donut" role="img" aria-label="Product mix">
      <circle cx={100} cy={100} r={radius} fill="none" stroke="var(--soft)" strokeWidth={30} />
      {slices.map((slice, index) => {
        const fraction = slice.count / total;
        const segment = fraction * circumference;
        const offset = -acc * circumference;
        acc += fraction;
        return (
          <circle
            key={slice.label}
            cx={100}
            cy={100}
            r={radius}
            fill="none"
            stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
            strokeWidth={30}
            strokeDasharray={`${segment} ${circumference - segment}`}
            strokeDashoffset={offset}
            transform="rotate(-90 100 100)"
          />
        );
      })}
      <text x={100} y={94} textAnchor="middle" className="crm-donut-total">
        {total}
      </text>
      <text x={100} y={116} textAnchor="middle" className="crm-donut-caption">
        PRODUCTS
      </text>
    </svg>
  );
}

function CloseoutList({
  recentlyClosed,
  readySoon,
  rows,
  files,
  onDrill,
  onOpenCustomer
}: {
  recentlyClosed: CrmJob[];
  readySoon: CrmJob[];
  rows: CrmBookkeepingRow[];
  files: CrmCustomerFile[];
  onDrill: (payload: DrillPayload) => void;
  onOpenCustomer: (customerName: string) => void;
}) {
  const groups = [
    { key: "closed", label: "Latest closed", jobs: recentlyClosed, empty: "No closed jobs yet." },
    { key: "soon", label: "Oldest to close soon", jobs: readySoon, empty: "No installed or invoiced jobs waiting." }
  ];
  return (
    <div className="crm-closeout-groups">
      {groups.map((group) => (
        <section className="crm-closeout-group" key={group.key}>
          <div className="crm-closeout-heading">
            <span>{group.label}</span>
            <button type="button" disabled={!group.jobs.length} onClick={() => onDrill({
              title: group.label,
              subtitle: `${group.jobs.length} jobs`,
              placement: "closing",
              entries: jobsToEntries(group.jobs, rows, { files })
            })}>
              {group.jobs.length} total
            </button>
          </div>
          {group.jobs.length ? (
            <div className="crm-closeout-list">
              {group.jobs.slice(0, 5).map((job) => (
                <button type="button" className="crm-closeout-item" key={job.id} onClick={() => onOpenCustomer(job.customer_name)}>
                  <span className="crm-closeout-customer">{job.customer_name}</span>
                  <span className="crm-closeout-meta">
                    {job.sales_owner || "Unassigned"} · {group.key === "closed" ? formatShortDate(job.updated_at) : formatShortDate(job.created_at)}
                  </span>
                  <span className={`crm-closeout-status ${group.key}`}>{group.key === "closed" ? "Closed" : job.status}</span>
                </button>
              ))}
            </div>
          ) : <p className="crm-empty">{group.empty}</p>}
        </section>
      ))}
    </div>
  );
}

type DrillPanelProps = {
  payload: DrillPayload;
  busy: boolean;
  onClose: () => void;
  onOpenCustomer: (customerName: string) => void;
  onReassignSale?: (entry: DrillEntry, owner: string) => void;
  onMeasureNeededAction?: (entry: DrillEntry, action: MeasureNeededAction) => void;
  onMarkOrdered?: (entry: DrillEntry) => Promise<boolean>;
  onFindCogs?: (entry: DrillEntry) => Promise<boolean>;
  onSaveField: (entry: DrillEntry, patch: DrillFieldPatch) => Promise<boolean>;
  onLedgerLineAction?: (action: LedgerLineAction) => Promise<boolean>;
  onPaymentPlanAction?: (jobId: string, action: PaymentPlanUiAction) => Promise<boolean>;
  onVendorOrderPacket?: (task: CrmVendorOrderTask) => void;
  onVendorOrderEmail?: (task: CrmVendorOrderTask) => void;
  onVendorOrderAction?: (
    task: CrmVendorOrderTask,
    action: "start" | "auto_order" | "review_ready" | "retry" | "confirm" | "cancel" | "bypass",
  ) => void;
};

function DrillSearchResultsPanel({
  payload,
  quotes,
  events,
  busy,
  onClose,
  onOpenPage,
  onOpenCustomer,
  onReassignSale,
  onMeasureNeededAction,
  onMarkOrdered,
  onFindCogs,
  onSaveField,
  onLedgerLineAction,
  onPaymentPlanAction,
  onVendorOrderPacket,
  onVendorOrderEmail,
  onVendorOrderAction
}: DrillPanelProps & {
  quotes: CrmQuote[];
  events: CrmCalendarEvent[];
  onOpenPage: (page: CustomerSearchPage, entry: DrillEntry) => void;
}) {
  const results = useMemo(
    () =>
      payload.entries.map((entry, index) => ({
        id: `${customerSearchResultKey(entry)}:${index}`,
        entry,
        pages: customerSearchPagesForEntry(entry, quotes, events)
      })),
    [events, payload.entries, quotes]
  );
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  useEffect(() => {
    if (!results.length) {
      if (selectedResultId) setSelectedResultId(null);
      return;
    }

    if (!selectedResultId || !results.some((result) => result.id === selectedResultId)) {
      setSelectedResultId(results[0].id);
    }
  }, [results, selectedResultId]);

  const selectedResult = results.find((result) => result.id === selectedResultId) || results[0] || null;
  const selectedMeasureUrl = payload.metric === "readyToOrder" && selectedResult?.entry.vendorOrderTask?.formId
    ? `/crm/measure/${selectedResult.entry.vendorOrderTask.formId}`
    : null;
  const selectedPayload: DrillPayload | null = selectedResult
    ? {
        ...payload,
        subtitle: selectedResult.entry.meta || payload.subtitle,
        entries: [selectedResult.entry]
      }
    : null;

  return (
    <section className="crm-global-search crm-global-search--drill" aria-label={payload.title}>
      <div className="crm-global-search-bar">
        <label>{payload.title}</label>
        <div className="crm-global-search-drill-title">
          <strong>{payload.subtitle}</strong>
        </div>
        <span>
          {payload.entries.length} {payload.entries.length === 1 ? "record" : "records"}
        </span>
        <button type="button" className="crm-ghost-button" onClick={onClose}>
          Close
        </button>
      </div>

      {results.length ? (
        <div className={`crm-global-search-body${selectedMeasureUrl ? " crm-global-search-body--contract" : ""}`}>
          <div className="crm-global-search-results" role="listbox" aria-label={`${payload.title} records`}>
            {results.map((result) => (
              <DashboardRecordCard
                key={result.id}
                customerName={result.entry.customerName || result.entry.name}
                meta={result.entry.meta}
                value={result.entry.value}
                address={result.entry.address}
                phone={result.entry.phone}
                active={result.id === selectedResult?.id}
                onSelect={() => setSelectedResultId(result.id)}
              />
            ))}
          </div>

          {selectedResult && selectedMeasureUrl ? (
            <TechnicalMeasurePreviewPane
              customerName={selectedResult.entry.customerName || selectedResult.entry.name}
              url={selectedMeasureUrl}
            />
          ) : null}

          {selectedResult && selectedPayload ? (
            <div className="crm-global-search-detail">
              <div className="crm-global-search-route-panel" aria-label={`Pages for ${selectedResult.entry.customerName}`}>
                <span>Routes</span>
                <div className="crm-global-search-links">
                  {selectedResult.pages.map((page) => (
                    <button
                      type="button"
                      className="crm-ghost-button"
                      key={`${page.target}-${page.url || page.quoteId || page.eventId || page.label}`}
                      onClick={() => onOpenPage(page, selectedResult.entry)}
                    >
                      {page.label}
                      {page.detail ? <span>{page.detail}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
              <DrillDetailCard
                entry={selectedResult.entry}
                payload={selectedPayload}
                busy={busy}
                onOpenCustomer={onOpenCustomer}
                onReassignSale={onReassignSale}
                onMeasureNeededAction={onMeasureNeededAction}
                onMarkOrdered={onMarkOrdered}
                onFindCogs={onFindCogs}
                onSaveField={onSaveField}
                onLedgerLineAction={onLedgerLineAction}
                onPaymentPlanAction={onPaymentPlanAction}
                onVendorOrderPacket={onVendorOrderPacket}
                onVendorOrderAction={onVendorOrderAction}
                onVendorOrderEmail={onVendorOrderEmail}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="crm-empty">No customers in this segment.</p>
      )}
    </section>
  );
}

function TechnicalMeasurePreviewPane({ customerName, url }: { customerName: string; url: string }) {
  return (
    <aside className="crm-global-contract-pane" aria-label={`Saved Technical Measure for ${customerName}`}>
      <div className="crm-global-contract-pane-head">
        <span>Saved Technical Measure</span>
        <div className="crm-global-contract-pane-actions">
          <a href={url} target="_blank" rel="noreferrer">Open full page</a>
        </div>
      </div>
      <iframe title={`${customerName} saved Technical Measure`} src={url} />
    </aside>
  );
}

type DrillInlineOption = {
  value: string;
  label: string;
};

type DrillInlineEditor = {
  type?: "text" | "number" | "date" | "datetime-local" | "select" | "email";
  value: string;
  options?: DrillInlineOption[];
  disabled?: boolean;
  ariaLabel: string;
  /** When "address", the text field uses Google Places autocomplete. */
  autocomplete?: "address";
  onSave: (value: string) => Promise<boolean>;
};

type DrillCommandButton = {
  key: string;
  label: string;
  detail?: string;
  tone?: "missing" | "warning";
  paymentTypePicker?: {
    defaultValue: CrmBookkeepingPaymentType;
    onSelect: (paymentType: CrmBookkeepingPaymentType) => void | Promise<boolean>;
  };
  disabled?: boolean;
  onClick: () => void | Promise<boolean>;
};

type DrillAmountCommand = {
  key: string;
  label: string;
  detail: string;
  defaultValue: number;
  tone?: "missing" | "warning";
  paymentType?: CrmBookkeepingPaymentType | null;
  requirePaymentType?: boolean;
  disabled?: boolean;
  onSave: (amount: number, paymentType?: CrmBookkeepingPaymentType) => Promise<boolean>;
};

type DrillTextCommand = {
  key: string;
  label: string;
  detail: string;
  defaultValue: string;
  placeholder?: string;
  tone?: "missing" | "warning";
  disabled?: boolean;
  onSave: (value: string) => Promise<boolean>;
};

function InlineEditableValue({
  value,
  editor,
  className = ""
}: {
  value: string;
  editor?: DrillInlineEditor;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editor?.value ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(editor?.value ?? "");
  }, [editor?.value, editing]);

  if (!editor) return <span className={className}>{value}</span>;

  const submit = async (nextValue = draft) => {
    const normalized = editor.type === "number" || editor.type === "date" || editor.type === "datetime-local" ? nextValue : nextValue.trim();
    if (normalized === editor.value) {
      setDraft(editor.value);
      setEditing(false);
      return;
    }

    setSaving(true);
    const saved = await editor.onSave(normalized);
    setSaving(false);
    if (saved) {
      setEditing(false);
    } else {
      setDraft(editor.value);
    }
  };

  const cancel = () => {
    setDraft(editor.value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={`crm-inline-edit-value ${className}`}
        onClick={() => {
          setDraft(editor.value);
          setEditing(true);
        }}
        disabled={editor.disabled || saving}
        aria-label={`${editor.ariaLabel}: ${value}`}
      >
        <span>{value || "Add value"}</span>
      </button>
    );
  }

  if (editor.type === "select") {
    return (
      <select
        className="crm-inline-edit-control"
        aria-label={editor.ariaLabel}
        autoFocus
        value={draft}
        disabled={editor.disabled || saving}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraft(nextValue);
          void submit(nextValue);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
      >
        {(editor.options || []).map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  const handleControlKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  if (editor.autocomplete === "address") {
    return (
      <AddressAutocomplete
        className="crm-inline-edit-control"
        aria-label={editor.ariaLabel}
        autoFocus
        value={draft}
        disabled={editor.disabled || saving}
        onBlur={() => {
          void submit();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onResolved={(address) => {
          setDraft(address.fullAddress);
          void submit(address.fullAddress);
        }}
        onKeyDown={handleControlKeyDown}
      />
    );
  }

  return (
    <input
      className="crm-inline-edit-control"
      aria-label={editor.ariaLabel}
      autoFocus
      type={editor.type || "text"}
      min={editor.type === "number" ? "0" : undefined}
      step={editor.type === "number" ? "0.01" : undefined}
      value={draft}
      disabled={editor.disabled || saving}
      onBlur={() => {
        void submit();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleControlKeyDown}
    />
  );
}

type DrillDepositEditor = {
  depositPaidValue: string;
  depositDueValue: string;
  disabled?: boolean;
  onSave: (values: { depositPaid: string; depositDue: string }) => Promise<boolean>;
};

function InlineDepositValue({
  value,
  editor
}: {
  value: string;
  editor?: DrillDepositEditor;
}) {
  const [editing, setEditing] = useState(false);
  const [depositPaid, setDepositPaid] = useState(editor?.depositPaidValue ?? "");
  const [depositDue, setDepositDue] = useState(editor?.depositDueValue ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDepositPaid(editor?.depositPaidValue ?? "");
      setDepositDue(editor?.depositDueValue ?? "");
    }
  }, [editor?.depositPaidValue, editor?.depositDueValue, editing]);

  if (!editor) return <span>{value}</span>;

  const cancel = () => {
    setDepositPaid(editor.depositPaidValue);
    setDepositDue(editor.depositDueValue);
    setEditing(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (depositPaid === editor.depositPaidValue && depositDue === editor.depositDueValue) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const saved = await editor.onSave({ depositPaid, depositDue });
    setSaving(false);
    if (saved) setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="crm-inline-edit-value"
        onClick={() => {
          setDepositPaid(editor.depositPaidValue);
          setDepositDue(editor.depositDueValue);
          setEditing(true);
        }}
        disabled={editor.disabled || saving}
        aria-label={`Edit deposit paid and due: ${value}`}
      >
        <span>{value}</span>
      </button>
    );
  }

  return (
    <form className="crm-inline-edit-composite" onSubmit={submit}>
      <label>
        <span>Paid</span>
        <input
          autoFocus
          type="number"
          min="0"
          step="0.01"
          value={depositPaid}
          disabled={editor.disabled || saving}
          onChange={(event) => setDepositPaid(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
        />
      </label>
      <label>
        <span>Due</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={depositDue}
          disabled={editor.disabled || saving}
          onChange={(event) => setDepositDue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
        />
      </label>
      <button type="submit" disabled={editor.disabled || saving}>
        Save
      </button>
      <button type="button" disabled={editor.disabled || saving} onClick={cancel}>
        Cancel
      </button>
    </form>
  );
}

function SquarePaymentLinkPanel({
  entry,
  quote,
  busy,
  onSend,
}: {
  entry: DrillEntry;
  quote?: CrmQuote | null;
  busy: boolean;
  onSend: (quoteId: string, paymentType: SquareOrderPaymentType, recipientEmail?: string) => Promise<SquarePaymentLinkResult>;
}) {
  const [sending, setSending] = useState<SquareOrderPaymentType | null>(null);
  const [confirming, setConfirming] = useState<SquareOrderPaymentType | null>(null);
  const [alternateEmail, setAlternateEmail] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const row = entry.row;
  const configuredDeposit = Math.max(Number(row?.depositDue ?? quote?.deposit_required) || 0, 0);
  const depositRemaining = Math.max(configuredDeposit - (Number(row?.depositPaid) || 0), 0);
  const outstanding = Math.max(Number(row?.balance ?? quote?.quote_total) || 0, 0);
  const balanceRemaining = Math.max(outstanding - depositRemaining, 0);
  const savedEmail = quote?.customer_email?.trim() || "";
  const recipientEmail = alternateEmail.trim() || savedEmail;

  useEffect(() => {
    setConfirming(null);
    setAlternateEmail("");
    setResult(null);
  }, [quote?.id]);

  function confirm(paymentType: SquareOrderPaymentType) {
    setConfirming(paymentType);
    setAlternateEmail("");
    setResult(null);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const paymentType = confirming;
    if (!paymentType) return;
    if (!quote?.id) return;
    setSending(paymentType);
    setResult(null);
    try {
      const sent = await onSend(quote.id, paymentType, alternateEmail.trim() || undefined);
      setResult(`${paymentType === "deposit" ? "Deposit" : "Balance"} link sent to ${sent.recipient}.`);
      setConfirming(null);
      setAlternateEmail("");
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Payment link could not be sent.");
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="crm-square-payment-panel" aria-label="Square customer payment links">
      <div>
        <strong>Send a Square payment link</strong>
        <span>The customer receives an automated email with a secure, order-specific checkout link.</span>
      </div>
      <div className="crm-square-payment-actions">
        <button type="button" disabled={busy || sending !== null || !quote?.id || depositRemaining <= 0} onClick={() => confirm("deposit")}>
          <span>Send Deposit Link</span>
          <strong>{toCurrency(depositRemaining)}</strong>
        </button>
        <button type="button" disabled={busy || sending !== null || !quote?.id || balanceRemaining <= 0} onClick={() => confirm("balance")}>
          <span>Send Balance Link</span>
          <strong>{toCurrency(balanceRemaining)}</strong>
        </button>
      </div>
      {confirming ? (
        <form className="crm-square-payment-recipient" onSubmit={send}>
          <div>
            <strong>Confirm {confirming} link recipient</strong>
            <span>
              Customer email: <b>{savedEmail || "No customer email saved"}</b>
            </span>
          </div>
          <label>
            Different email address <span>(optional)</span>
            <input
              type="email"
              value={alternateEmail}
              onChange={(event) => setAlternateEmail(event.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
            />
          </label>
          <p>
            This {confirming} link will be sent to <strong>{recipientEmail || "an email address entered above"}</strong>.
          </p>
          <div className="crm-square-payment-confirm-actions">
            <button type="submit" disabled={busy || sending !== null || !recipientEmail}>
              Send {confirming === "deposit" ? "Deposit" : "Balance"} Link
            </button>
            <button
              type="button"
              disabled={busy || sending !== null}
              onClick={() => {
                setConfirming(null);
                setAlternateEmail("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {sending ? <p>Creating and emailing the {sending} link…</p> : null}
      {result ? <p role="status">{result}</p> : null}
    </div>
  );
}

function GlobalCustomerSearchPanel({
  jobs,
  quotes,
  rows,
  files,
  events,
  busy,
  onProcessEmails,
  onSendSquarePaymentLink,
  onOpenPage,
  onOpenCustomer,
  onReassignSale,
  onMeasureNeededAction,
  onMarkOrdered,
  onFindCogs,
  onSaveField,
  onLedgerLineAction,
  onPaymentPlanAction
}: {
  jobs: CrmJob[];
  quotes: CrmQuote[];
  rows: CrmBookkeepingRow[];
  files: CrmCustomerFile[];
  events: CrmCalendarEvent[];
  busy: boolean;
  onProcessEmails: (target?: DrillEntry | null) => void;
  onSendSquarePaymentLink: (quoteId: string, paymentType: SquareOrderPaymentType, recipientEmail?: string) => Promise<SquarePaymentLinkResult>;
  onOpenPage: (page: CustomerSearchPage, entry: DrillEntry) => void;
  onOpenCustomer: (customerName: string) => void;
  onReassignSale?: (entry: DrillEntry, owner: string) => void;
  onMeasureNeededAction?: (entry: DrillEntry, action: MeasureNeededAction) => void;
  onMarkOrdered?: (entry: DrillEntry) => Promise<boolean>;
  onFindCogs?: (entry: DrillEntry) => Promise<boolean>;
  onSaveField: (entry: DrillEntry, patch: DrillFieldPatch) => Promise<boolean>;
  onLedgerLineAction?: (action: LedgerLineAction) => Promise<boolean>;
  onPaymentPlanAction?: (jobId: string, action: PaymentPlanUiAction) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [paymentPanelResultId, setPaymentPanelResultId] = useState<string | null>(null);
  const normalizedQuery = query.trim();
  const results = useMemo(
    () => buildCustomerSearchResults({ query: normalizedQuery, jobs, quotes, rows, files, events }),
    [events, files, jobs, normalizedQuery, quotes, rows]
  );

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      if (selectedResultId) setSelectedResultId(null);
      return;
    }

    if (selectedResultId && !results.some((result) => result.id === selectedResultId)) {
      if (selectedResultId) setSelectedResultId(null);
    }
  }, [normalizedQuery, results, selectedResultId]);

  const selectedResult = results.find((result) => result.id === selectedResultId) || null;
  const selectedContractDocument =
    selectedResult?.entry.documents?.find((document) => document.kind === "Contract copy" && Boolean(document.url)) || null;
  const selectedQuotePage = selectedResult?.pages.find((page) => page.target === "quotes" && Boolean(page.quoteId)) || null;
  const selectedQuote = selectedQuotePage?.quoteId
    ? quotes.find((quote) => quote.id === selectedQuotePage.quoteId) || null
    : null;
  const selectedQuoteSalesId = salesQuoteIdForCrmQuote(selectedQuote);
  const selectedQuoteDocument =
    selectedQuotePage && selectedQuote && (selectedQuoteSalesId || selectedQuote.share_token)
      ? {
          id: `quote-preview-${selectedQuote.id}`,
          title: selectedQuotePage.detail ? `Quote ${selectedQuotePage.detail}` : "Quote contract preview",
          // Show the actual customer-facing contract that was emailed (the
          // share-token page); the builder view only covers quotes that never
          // had a shared contract copy.
          url: selectedQuote.share_token
            ? `/quote/${selectedQuote.share_token}`
            : `/crm/quote/${selectedQuoteSalesId}/contract-preview`,
          quoteId: selectedQuote.share_token ? null : selectedQuoteSalesId,
          kind: "Contract copy" as const
        }
      : null;
  const selectedPreviewDocument = selectedQuoteDocument || selectedContractDocument;
  const payload: DrillPayload | null = selectedResult
    ? {
        title: "Customer Search",
        subtitle: selectedResult.entry.meta || "Matching CRM record",
        entries: [selectedResult.entry],
        placement: "summary"
      }
    : null;

  return (
    <section className="crm-global-search" aria-label="Customer search">
      <div className="crm-global-search-bar">
        <label htmlFor="crm-global-customer-search">Customer Search</label>
        <div className="crm-global-search-input-row">
          <input
            id="crm-global-customer-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedResultId(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder="Name, phone, address, job, quote..."
          />
          {query ? (
            <button
              type="button"
              className="crm-ghost-button"
              onClick={() => {
                setQuery("");
                setSelectedResultId(null);
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        <span>
          {normalizedQuery.length >= 2
            ? results.length
              ? `${results.length} match${results.length === 1 ? "" : "es"}`
              : "No matches"
            : `${files.length} customer files`}
        </span>
      </div>

      {normalizedQuery.length >= 2 && results.length ? (
        <div
          className={[
            "crm-global-search-body",
            selectedResult ? "crm-global-search-body--selected" : "crm-global-search-body--results-only",
            selectedPreviewDocument ? "crm-global-search-body--contract" : ""
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="crm-global-search-results" role="listbox" aria-label="Customer search results">
            {results.map((result) => (
              <button
                type="button"
                role="option"
                aria-selected={result.id === selectedResult?.id}
                className={result.id === selectedResult?.id ? "active" : ""}
                key={result.id}
                onClick={() => {
                  setSelectedResultId(result.id);
                }}
              >
                <strong>{result.entry.customerName || result.entry.name}</strong>
                <span>{result.entry.meta || "Customer record"}</span>
                <em>{result.entry.value || "Open"}</em>
              </button>
            ))}
          </div>

          {selectedResult && selectedPreviewDocument ? (
            <ContractPreviewPane
              document={selectedPreviewDocument}
              customerName={selectedResult?.entry.customerName || selectedResult?.entry.name || "Customer"}
              onClose={() => setSelectedResultId(null)}
            />
          ) : null}

          {selectedResult && payload ? (
            <div className="crm-global-search-detail">
              <div className="crm-global-search-route-panel" aria-label={`Pages for ${selectedResult.entry.customerName}`}>
                <span>Routes</span>
                <div className="crm-global-search-links">
                  <button
                    type="button"
                    className="crm-global-search-process-button"
                    onClick={() => onProcessEmails(selectedResult.entry)}
                    disabled={busy}
                  >
                    Pull Install Emails
                  </button>
                  {selectedResult.pages.map((page) => (
                    <button
                      type="button"
                      className="crm-ghost-button"
                      key={`${page.target}-${page.url || page.quoteId || page.eventId || page.label}`}
                      onClick={() => onOpenPage(page, selectedResult.entry)}
                    >
                      {page.label}
                      {page.detail ? <span>{page.detail}</span> : null}
                    </button>
                  ))}
                  {selectedQuote ? (
                    <button
                      type="button"
                      className="crm-ghost-button crm-square-payment-route"
                      aria-expanded={paymentPanelResultId === selectedResult.id}
                      onClick={() => setPaymentPanelResultId((current) => current === selectedResult.id ? null : selectedResult.id)}
                    >
                      Square Payments
                      <span>Deposit + Balance</span>
                    </button>
                  ) : null}
                </div>
                {paymentPanelResultId === selectedResult.id ? (
                  <SquarePaymentLinkPanel
                    entry={selectedResult.entry}
                    quote={selectedQuote}
                    busy={busy}
                    onSend={onSendSquarePaymentLink}
                  />
                ) : null}
              </div>
              <DrillDetailCard
                entry={selectedResult.entry}
                payload={payload}
                busy={busy}
                onOpenCustomer={onOpenCustomer}
                onReassignSale={onReassignSale}
                onMeasureNeededAction={onMeasureNeededAction}
                onMarkOrdered={onMarkOrdered}
                onFindCogs={onFindCogs}
                onSaveField={onSaveField}
                onLedgerLineAction={onLedgerLineAction}
                onPaymentPlanAction={onPaymentPlanAction}
              />
            </div>
          ) : null}
        </div>
      ) : normalizedQuery.length >= 2 ? (
        <p className="crm-empty">No customer, job, quote, or bookkeeping row matches "{normalizedQuery}".</p>
      ) : null}
    </section>
  );
}

function ContractPreviewPane({
  document,
  customerName,
  onClose
}: {
  document: DrillDocument;
  customerName: string;
  onClose: () => void;
}) {
  const previewUrl = documentPreviewUrl(document);

  return (
    <aside className="crm-global-contract-pane" aria-label={`Contract for ${customerName}`}>
      <div className="crm-global-contract-pane-head">
        <span>Contract</span>
        <div className="crm-global-contract-pane-actions">
          <a href={previewUrl} target="_blank" rel="noreferrer">
            Open
          </a>
          <button type="button" aria-label="Close customer contract" title="Close contract" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      <iframe title={`${customerName} contract`} src={previewUrl} />
    </aside>
  );
}

function DrillDetailPanel({
  payload,
  busy,
  onClose,
  onOpenCustomer,
  onReassignSale,
  onMeasureNeededAction,
  onMarkOrdered,
  onFindCogs,
  onSaveField,
  onLedgerLineAction,
  onPaymentPlanAction,
  onVendorOrderPacket,
  onVendorOrderEmail,
  onVendorOrderAction
}: DrillPanelProps) {
  return (
    <section className="crm-drill-inline" aria-label={payload.title}>
      <div className="crm-drill-inline-head">
        <div>
          <p className="eyebrow">{payload.subtitle}</p>
          <h2>{payload.title}</h2>
        </div>
        <div className="crm-drill-inline-actions">
          <p className="crm-drill-count">
            {payload.entries.length} {payload.entries.length === 1 ? "record" : "records"}
          </p>
          <button type="button" className="crm-ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="crm-drill-detail-list">
        {payload.entries.map((entry) => (
          <DrillDetailCard
            entry={entry}
            payload={payload}
            busy={busy}
            key={entry.id}
            onOpenCustomer={onOpenCustomer}
            onReassignSale={onReassignSale}
            onMeasureNeededAction={onMeasureNeededAction}
            onMarkOrdered={onMarkOrdered}
            onFindCogs={onFindCogs}
            onSaveField={onSaveField}
            onLedgerLineAction={onLedgerLineAction}
            onPaymentPlanAction={onPaymentPlanAction}
            onVendorOrderPacket={onVendorOrderPacket}
            onVendorOrderEmail={onVendorOrderEmail}
            onVendorOrderAction={onVendorOrderAction}
          />
        ))}
        {!payload.entries.length ? <p className="crm-empty">No customers in this segment.</p> : null}
      </div>
    </section>
  );
}

function DrillDetailCard({
  entry,
  payload,
  busy,
  onOpenCustomer,
  onReassignSale,
  onMeasureNeededAction,
  onMarkOrdered,
  onFindCogs,
  onSaveField,
  onLedgerLineAction,
  onPaymentPlanAction,
  onVendorOrderPacket,
  onVendorOrderEmail,
  onVendorOrderAction
}: {
  entry: DrillEntry;
  payload: DrillPayload;
  busy: boolean;
  onOpenCustomer: (customerName: string) => void;
  onReassignSale?: (entry: DrillEntry, owner: string) => void;
  onMeasureNeededAction?: (entry: DrillEntry, action: MeasureNeededAction) => void;
  onMarkOrdered?: (entry: DrillEntry) => Promise<boolean>;
  onFindCogs?: (entry: DrillEntry) => Promise<boolean>;
  onSaveField: (entry: DrillEntry, patch: DrillFieldPatch) => Promise<boolean>;
  onLedgerLineAction?: (action: LedgerLineAction) => Promise<boolean>;
  onPaymentPlanAction?: (jobId: string, action: PaymentPlanUiAction) => Promise<boolean>;
  onVendorOrderPacket?: (task: CrmVendorOrderTask) => void;
  onVendorOrderEmail?: (task: CrmVendorOrderTask) => void;
  onVendorOrderAction?: DrillPanelProps["onVendorOrderAction"];
}) {
  const row = entry.row;
  const job = entry.job;
  const file = entry.file;
  const documents = entry.documents || [];
  const products = entry.products || [];
  const notes = entry.notes || [];
  const canReassignSale = payload.allowSaleReassignment && entry.canReassignSale && entry.jobId;
  const canEditJob = Boolean(job?.id || entry.jobId || row?.jobId);
  const canEditQuoteRow = row?.source === "crm_quote" && Boolean(row.quoteId);
  const hasActivity = Boolean(
    row && (row.payments.length || row.creditsIn.length || row.creditsOut.length || row.expenses.length || row.remakeTotal > 0)
  );
  const hasDocumentsOrNotes = Boolean(documents.length || notes.length);
  const activityItemCount =
    (row?.payments.length || 0) +
    (row?.creditsIn.length || 0) +
    (row?.creditsOut.length || 0) +
    (row?.expenses.length || 0) +
    (row && row.remakeTotal > 0 ? 1 : 0);
  const documentsAndNotesCount = documents.length + notes.length;
  const lineItemLabel = (count: number) => `${count} line item${count === 1 ? "" : "s"}`;
  const customerName = job?.customer_name || row?.customerName || file?.customerName || entry.customerName;
  const fallbackTotal = Number(job?.quote_total || job?.estimated_total || 0);
  const fallbackDepositDue = roundCurrency(fallbackTotal / 2);
  const saveJob = (patch: Record<string, unknown>, message: string) => onSaveField(entry, { job: patch, message });
  const saveRow = (patch: Record<string, unknown>, message: string) => {
    if (!row && !canEditJob) return Promise.resolve(false);
    const rowPatch = row?.source === "crm_quote" && row.quoteId
      ? { quote_total: row.total, ...patch }
      : row
        ? patch
        : { deposit_required: fallbackDepositDue, ...patch };
    return onSaveField(entry, { row: rowPatch, message });
  };
  const moneyEditorValue = (value: number | null | undefined) => (value ? String(value) : "");
  const moneyPatch = (value: string) => Number(value || 0);
  const customerNameEditor: DrillInlineEditor | undefined =
    canEditJob || row
      ? {
          value: customerName,
          disabled: busy,
          ariaLabel: "Edit customer name",
          onSave: (value) => {
            const name = value.trim();
            if (!name) return Promise.resolve(false);
            if (canEditJob && row) {
              const rowPatch = row.source === "crm_quote" && row.quoteId ? { quote_total: row.total, customer_name: name } : { customer_name: name };
              return onSaveField(entry, { job: { customer_name: name }, row: rowPatch, message: "Customer name updated." });
            }
            return canEditJob ? saveJob({ customer_name: name }, "Customer name updated.") : saveRow({ customer_name: name }, "Customer name updated.");
          }
        }
      : undefined;
  const contactItems: Array<{ key: string; value: string; fallback: string; editor?: DrillInlineEditor }> = [
    {
      key: "phone",
      value: file?.phone || job?.phone || row?.customerPhone || "",
      fallback: "Phone pending",
      editor: canEditJob
        ? {
            value: file?.phone || job?.phone || row?.customerPhone || "",
            disabled: busy,
            ariaLabel: "Edit phone",
            onSave: (value) => saveJob({ phone: value.trim() }, "Phone updated.")
          }
        : undefined
    },
    {
      key: "email",
      value: file?.email || job?.email || "",
      fallback: "Email pending",
      editor: canEditJob
        ? {
            type: "email",
            value: file?.email || job?.email || "",
            disabled: busy,
            ariaLabel: "Edit email",
            onSave: (value) => saveJob({ email: value.trim() }, "Email updated.")
          }
        : undefined
    },
    {
      key: "city",
      value: file?.city || job?.city || "",
      fallback: "City pending",
      editor: canEditJob
        ? {
            value: file?.city || job?.city || "",
            disabled: busy,
            ariaLabel: "Edit city",
            onSave: (value) => saveJob({ city: value.trim() }, "City updated.")
          }
        : undefined
    }
  ];
  const visibleContactItems = canEditJob ? contactItems : contactItems.filter((item) => item.value);
  const liveRowStatus = row ? effectiveBookkeepingStatus(row) : null;
  const wonJobHasNoLedgerRow = Boolean(job && !row && WON_JOB_STATUSES.includes(job.status));
  const soldByOwner = saleOwnerDisplayName(row?.salesOwner || (wonJobHasNoLedgerRow ? job?.sales_owner : null));
  const belongsToOwner = saleOwnerDisplayName(job?.sales_owner);
  const saveSaleOwner = (owner: string) => {
    const nextOwner = saleOwnerDisplayName(owner);
    if (canEditJob) {
      return saveJob({ sales_owner: nextOwner }, "Sale owner updated. Profit split recalculated.");
    }
    if (row) {
      return saveRow(
        row.source === "crm_quote" ? { sold_by: nextOwner } : { sales_owner: nextOwner },
        "Sale owner updated. Profit split recalculated."
      );
    }
    return Promise.resolve(false);
  };
  const soldByEditor: DrillInlineEditor | undefined =
    row || canEditJob
      ? {
          type: "select",
          value: soldByOwner,
          options: ownerSelectOptions,
          disabled: busy,
          ariaLabel: "Edit sold by",
          onSave: saveSaleOwner
        }
      : undefined;
  const belongsToEditor: DrillInlineEditor | undefined = canEditJob
    ? {
        type: "select",
        value: belongsToOwner,
        options: ownerSelectOptions,
        disabled: busy,
        ariaLabel: "Edit job owner",
        onSave: saveSaleOwner
      }
    : undefined;
  const measureNeededActive = Boolean(job && isMeasureNeededJob(job));
  const measureWorkflow = job ? (getMeasureNeededMeta(job.meta) as Record<string, unknown>) : null;
  const measureFormId = typeof measureWorkflow?.form_id === "string" ? measureWorkflow.form_id : null;
  const measureFormComplete = measureWorkflow?.form_status === "submitted";
  const canRequestMeasure =
    Boolean(onMeasureNeededAction && job && !measureNeededActive) &&
    (liveRowStatus === "sold" || liveRowStatus === "approved" || job?.status === "sold");
  const canMarkOrdered =
    (liveRowStatus === "sold" || liveRowStatus === "approved" || (!row && job?.status === "sold")) &&
    (canEditQuoteRow || canEditJob) &&
    (!measureNeededActive || measureFormComplete);
  const isAlreadyOrdered = liveRowStatus === "ordered" || job?.status === "ordered";
  const canFindOrderEmail =
    !canMarkOrdered &&
    isAlreadyOrdered &&
    (canEditQuoteRow || canEditJob) &&
    (!row || row.cogs <= 0 || !row.manufacturerOrderRef);
  const canMarkComplete =
    canEditJob ||
    Boolean(row && (canEditQuoteRow || row.source !== "crm_quote"));
  const checkOrderConfirmations = () => {
    if (onMarkOrdered) return onMarkOrdered(entry);
    return Promise.resolve(false);
  };
  const markComplete = () => {
    const patch: DrillFieldPatch = { message: "Marked complete." };
    if (canEditJob) patch.job = { status: "installed" };
    if (row) {
      // Quote-backed jobs only advance to installed here; the installer invoice
      // match stays open so the job carries a "missing installer invoice" hold
      // until the MTS invoice email lands (or the checkbox waives it). Manual
      // rows have no status, so the checkbox-style waive is all they get.
      patch.row =
        row.source === "crm_quote" && row.quoteId
          ? { quote_total: row.total, status: "installed" }
          : { installation_complete: true };
    }
    return onSaveField(entry, patch);
  };
  const statusEditor: DrillInlineEditor | undefined =
    canEditQuoteRow && row
      ? {
          type: "select",
          value: String(row.status || "sold"),
          options: crmQuoteStatuses.map((status) => ({ value: status, label: titleCase(status) })),
          disabled: busy,
          ariaLabel: "Edit status",
          onSave: (value) => saveRow({ status: value }, "Status updated.")
        }
      : canEditJob && job
        ? {
            type: "select",
            value: job.status,
            options: crmJobStatuses.map((status) => ({ value: status, label: titleCase(status) })),
            disabled: busy,
            ariaLabel: "Edit status",
            onSave: (value) => saveJob({ status: value }, "Status updated.")
          }
        : undefined;
  const soldDateEditor: DrillInlineEditor | undefined = row
    ? {
        type: "date",
        value: dateInputValue(row.soldDate || file?.latestSoldDate || null),
        disabled: busy,
        ariaLabel: "Edit sold date",
        onSave: (value) => saveRow(row.source === "crm_quote" ? { sold_at: value || null } : { sold_date: value || null }, "Sold date updated.")
      }
    : undefined;
  const quoteNumberEditor: DrillInlineEditor | undefined =
    canEditQuoteRow && row
      ? {
          value: row.quoteNumber || "",
          disabled: busy,
          ariaLabel: "Edit quote number",
          onSave: (value) => saveRow({ quote_number: value.trim() }, "Quote number updated.")
        }
      : undefined;
  const leadSourceEditor: DrillInlineEditor | undefined =
    canEditJob && job
      ? {
          type: "select",
          value: job.lead_source || "",
          options: [
            { value: "", label: "Unknown" },
            ...leadSourceSelectOptions(job.lead_source).map((item) => ({ value: item, label: item }))
          ],
          disabled: busy,
          ariaLabel: "Edit lead source",
          onSave: (value) => saveJob({ lead_source: value || null }, "Lead source updated.")
        }
      : undefined;
  const totalEditor: DrillInlineEditor | undefined = row
    ? {
        type: "number",
        value: moneyEditorValue(row.total),
        disabled: busy,
        ariaLabel: "Edit total",
        onSave: (value) =>
          saveRow(
            row.source === "crm_quote"
              ? { quote_total: moneyPatch(value), manual_total_override: true }
              : { total_amount: moneyPatch(value) },
            "Total updated."
          )
      }
    : canEditJob && job
      ? {
          type: "number",
          value: moneyEditorValue(job.estimated_total),
          disabled: busy,
          ariaLabel: "Edit estimated total",
          onSave: (value) => saveJob({ estimated_total: moneyPatch(value) }, "Total updated.")
        }
      : undefined;
  const paymentEditor: DrillInlineEditor | undefined = row || canEditJob
    ? {
        type: "select",
        value: row?.paymentType || "other",
        options: paymentTypes.map((item) => ({ value: item.value, label: item.label })),
        disabled: busy,
        ariaLabel: "Edit payment type",
        onSave: (value) => saveRow({ payment_type: value }, "Payment type updated.")
      }
    : undefined;
  const balanceEditor: DrillInlineEditor | undefined = row || canEditJob
    ? {
        type: "number",
        value: moneyEditorValue(row?.balance ?? fallbackTotal),
        disabled: busy,
        ariaLabel: "Edit balance due",
        onSave: (value) => saveRow({ balance_due_target: moneyPatch(value) }, "Balance updated.")
      }
    : undefined;
  const depositEditor: DrillDepositEditor | undefined = row || canEditJob
    ? {
        depositPaidValue: moneyEditorValue(row?.depositPaid ?? 0),
        depositDueValue: moneyEditorValue(row?.depositDue ?? fallbackDepositDue),
        disabled: busy,
        onSave: ({ depositPaid, depositDue }) =>
          saveRow(
            {
              deposit_paid_target: moneyPatch(depositPaid),
              deposit_required: moneyPatch(depositDue)
            },
            "Deposit updated."
          )
      }
    : undefined;
  const balancePaidEditor: DrillInlineEditor | undefined = row || canEditJob
    ? {
        type: "number",
        value: moneyEditorValue(row?.balancePaid ?? 0),
        disabled: busy,
        ariaLabel: "Edit balance paid",
        onSave: (value) => saveRow({ balance_paid_target: moneyPatch(value) }, "Balance paid updated.")
      }
    : undefined;
  const cogsEditor: DrillInlineEditor | undefined = row || canEditJob
    ? {
        type: "number",
        value: moneyEditorValue(row?.cogs ?? 0),
        disabled: busy,
        ariaLabel: "Edit COGS",
        onSave: (value) => saveRow(row?.source === "crm_quote" ? { materials_cost: moneyPatch(value) } : { cogs_amount: moneyPatch(value) }, "COGS updated.")
      }
    : undefined;
  const manufacturerEditor: DrillInlineEditor | undefined = row
    ? {
        value: row.manufacturerName || "",
        disabled: busy,
        ariaLabel: "Edit manufacturer",
        onSave: (value) => saveRow({ manufacturer_name: value.trim() }, "Manufacturer updated.")
      }
    : undefined;
  const orderRefEditor: DrillInlineEditor | undefined = row
    ? {
        value: row.manufacturerOrderRef || "",
        disabled: busy,
        ariaLabel: "Edit order number",
        onSave: (value) => saveRow({ manufacturer_order_ref: value.trim() }, "Order number updated.")
      }
    : undefined;
  const installAmountEditor: DrillInlineEditor | undefined = row
    ? {
        type: "number",
        value: moneyEditorValue(row.installationInvoiceAmount),
        disabled: busy,
        ariaLabel: "Edit installation amount",
        onSave: (value) => saveRow({ installation_invoice_amount: moneyPatch(value) }, "Installation amount updated.")
      }
    : undefined;
  const installStatusEditor: DrillInlineEditor | undefined = row
    ? {
        type: "select",
        value: row.isInstallationComplete ? "complete" : "unmatched",
        options: [
          { value: "unmatched", label: "Unmatched" },
          { value: "complete", label: "Complete" }
        ],
        disabled: busy,
        ariaLabel: "Edit installation status",
        onSave: (value) => saveRow({ installation_complete: value === "complete" }, "Installation status updated.")
      }
    : undefined;
  const dueEditor: DrillInlineEditor | undefined = canEditJob
    ? {
        type: "date",
        value: dateInputValue(job?.next_action_due),
        disabled: busy,
        ariaLabel: "Edit due date",
        onSave: (value) => saveJob({ next_action_due: value || null }, "Due date updated.")
      }
    : undefined;
  const appointmentEditor: DrillInlineEditor | undefined = canEditJob
    ? {
        type: "datetime-local",
        value: dateTimeLocalValue(job?.appointment_start),
        disabled: busy,
        ariaLabel: "Edit appointment",
        onSave: (value) => saveJob({ appointment_start: dateTimeLocalToIso(value) }, "Appointment updated.")
      }
    : undefined;
  const addressEditor: DrillInlineEditor | undefined = canEditJob
    ? {
        value: file?.address || job?.address || "",
        disabled: busy,
        ariaLabel: "Edit address",
        autocomplete: "address",
        onSave: (value) => saveJob({ address: value.trim() }, "Address updated.")
      }
    : undefined;
  const nextActionEditor: DrillInlineEditor | undefined = canEditJob
    ? {
        value: job?.next_action || "",
        disabled: busy,
        ariaLabel: "Edit next action",
        onSave: (value) => saveJob({ next_action: value.trim() }, "Next action updated.")
      }
    : undefined;
  const {
    depositShortfall,
    configuredBalanceDue,
    balanceShortfall: balancePaymentShortfall,
    balancePaidTarget,
    openBalance: openJobBalance
  } = paymentControlAmounts({
    total: row?.total ?? fallbackTotal,
    depositDue: row?.depositDue ?? fallbackDepositDue,
    depositPaid: row?.depositPaid || 0,
    balancePaid: row?.balancePaid || 0,
    openBalance: row?.balance ?? fallbackTotal
  });
  const needsOrderHighlight = rowNeedsOrder(row);
  const depositMissingHighlight = rowDepositShortfall(row) > 0;
  const balanceMissingHighlight = rowBalanceShortfall(row) > 0;
  const cogsMissingHighlight = rowMissingCogs(row);
  const manufacturerMissingHighlight = rowMissingManufacturer(row);
  const orderRefMissingHighlight = rowMissingOrderRef(row);
  const installMissingHighlight = rowMissingInstallInvoice(row);
  const rowPaymentType = row?.paymentType || "other";
  const depositPaymentType = paymentTypeDefault(row?.depositPaymentType, rowPaymentType);
  const balancePaymentType = paymentTypeDefault(row?.balancePaymentType, rowPaymentType);
  const paidAt = todayInputValue();
  const statusControl =
    statusEditor && statusEditor.type === "select"
      ? {
          value: statusEditor.value,
          options: statusEditor.options || [],
          onSave: statusEditor.onSave
        }
      : null;
  const payJobPatch = row || canEditJob
    ? {
        payment_type: rowPaymentType,
        paid_at: paidAt,
        ...(depositShortfall > 0 ? { deposit_paid_target: row?.depositDue ?? fallbackDepositDue } : {}),
        ...(balancePaymentShortfall > 0 ? { balance_paid_target: balancePaidTarget } : {}),
        mark_balance_paid: true,
        ...(row?.source === "crm_quote" ? { status: "paid" } : {})
      }
    : null;
  const portalCapability = entry.vendorOrderTask
    ? manufacturerPortalCapability({
        manufacturer: entry.vendorOrderTask.manufacturer,
        routingKeys: entry.vendorOrderTask.routingKeys,
        sourceKind: entry.vendorOrderTask.sourceKind
      })
    : null;
  const workflowCommandOptions: Array<DrillCommandButton | null> = [
    entry.vendorOrderTask && portalCapability?.automaticEntry && ["needs_input", "queued", "failed"].includes(entry.vendorOrderTask.status) && onVendorOrderAction
      ? {
          key: "vendor-order-auto-order",
          label: "Auto Order",
          detail: "Validate and enter a saved portal draft — never submits",
          tone: "warning",
          disabled: busy,
          onClick: () => onVendorOrderAction(entry.vendorOrderTask as CrmVendorOrderTask, "auto_order")
        }
      : null,
    entry.vendorOrderTask && portalCapability?.documentPreparation && entry.vendorOrderTask.orderPacketUrl && onVendorOrderPacket
      ? {
          key: "vendor-order-prepare-document",
          label: "Enter Order Packet",
          detail: "Prepare the exact manufacturer form for review — never emails or submits",
          tone: "warning",
          disabled: busy,
          onClick: () => onVendorOrderPacket(entry.vendorOrderTask as CrmVendorOrderTask)
        }
      : null,
    entry.vendorOrderTask && !portalCapability?.automaticEntry && !portalCapability?.documentPreparation
      ? {
          key: "vendor-order-adapter-blocked",
          label: "Portal Adapter Blocked",
          detail: portalCapability?.reason || "Exact portal mapping is not verified.",
          tone: "warning",
          disabled: true,
          onClick: () => undefined
        }
      : null,
    entry.vendorOrderTask?.orderPacketUrl && onVendorOrderPacket && !portalCapability?.documentPreparation
      ? {
          key: "view-vendor-order-packet",
          label: "View Order Packet",
          detail: `${entry.vendorOrderTask.manufacturer} lines only`,
          disabled: busy,
          onClick: () => onVendorOrderPacket(entry.vendorOrderTask as CrmVendorOrderTask)
        }
      : null,
    entry.vendorOrderTask && ["queued", "processing"].includes(entry.vendorOrderTask.status) && onVendorOrderEmail
      ? {
          key: "email-codex-order-packet",
          label: "Email Codex Order Packet",
          detail: `${entry.vendorOrderTask.manufacturer} · ${entry.vendorOrderTask.lineCount} ${entry.vendorOrderTask.sourceKind === "signed_contract" ? "contract" : "submitted-measure"} line${entry.vendorOrderTask.lineCount === 1 ? "" : "s"} · sends to 805@805shutters.com`,
          tone: "warning",
          disabled: busy,
          onClick: () => onVendorOrderEmail(entry.vendorOrderTask as CrmVendorOrderTask)
        }
      : null,
    entry.vendorOrderTask?.status === "processing" && onVendorOrderAction
      ? {
          key: "vendor-order-review-ready",
          label: "Mark Review Ready",
          detail: "Portal entry complete · final submission still requires review",
          disabled: busy,
          onClick: () => onVendorOrderAction(entry.vendorOrderTask as CrmVendorOrderTask, "review_ready")
        }
      : null,
    entry.vendorOrderTask?.status === "review_ready" && onVendorOrderAction
      ? {
          key: "vendor-order-confirm",
          label: "Confirm Manufacturer Order",
          detail: "Record the manufacturer confirmation number",
          tone: "warning",
          disabled: busy,
          onClick: () => onVendorOrderAction(entry.vendorOrderTask as CrmVendorOrderTask, "confirm")
        }
      : null,
    (entry.vendorOrderTask?.status === "needs_input" || entry.vendorOrderTask?.status === "failed") && onVendorOrderAction
      ? {
          key: "vendor-order-retry",
          label: "Return to Ready Queue",
          detail: "Use after correcting the missing product details",
          disabled: busy,
          onClick: () => onVendorOrderAction(entry.vendorOrderTask as CrmVendorOrderTask, "retry")
        }
      : null,
    entry.vendorOrderTask && isAlreadyOrdered && onVendorOrderAction
      ? {
          key: "vendor-order-bypass",
          label: "Mark Ordered",
          detail: "Bypass Codex packet",
          disabled: busy,
          onClick: () => onVendorOrderAction(entry.vendorOrderTask as CrmVendorOrderTask, "bypass")
        }
      : null,
    measureFormId
      ? {
          key: "technical-measure-form",
          label: measureFormComplete ? "View Measure" : "Open Measure",
          detail: measureFormComplete ? "Submitted measure sheet" : "Required before ordering",
          disabled: busy,
          onClick: () => window.open(`/crm/measure/${measureFormId}`, "_blank", "noopener,noreferrer")
        }
      : null,
    measureNeededActive
      ? {
          key: "measured",
          label: "Measured",
          detail: "Measure complete",
          disabled: busy,
          onClick: () => void onMeasureNeededAction?.(entry, "measured")
        }
      : canRequestMeasure
        ? {
            key: "measure-needed",
            label: "Measure Needed",
            detail: "Create measure task",
            disabled: busy,
            onClick: () => void onMeasureNeededAction?.(entry, "request")
          }
        : null,
    canMarkOrdered
      ? {
          key: "check-order-confirmations",
          label: "Check Order Confirmations",
          detail: "Then order each room and product in Quotes",
          tone: needsOrderHighlight ? "warning" : undefined,
          disabled: busy,
          onClick: () => checkOrderConfirmations()
        }
      : canFindOrderEmail
        ? {
            key: "find-order-email",
            label: "Find Order Email",
            detail: "Start COGS",
            tone: needsOrderHighlight ? "warning" : undefined,
            disabled: busy,
            onClick: () => checkOrderConfirmations()
          }
      : null,
    canMarkComplete
      ? {
          key: "mark-complete",
          label: "Mark Complete",
          detail: "Install complete",
          disabled: busy,
          onClick: () => markComplete()
        }
      : null,
    {
      key: "open-file",
      label: "Open File",
      detail: "Customer file",
      onClick: () => onOpenCustomer(entry.customerName)
    }
  ];
  const workflowCommands = workflowCommandOptions.filter((command): command is DrillCommandButton => Boolean(command));
  const moneyCommandOptions: Array<DrillCommandButton | null> = [
    payJobPatch && (depositShortfall > 0 || balancePaymentShortfall > 0 || openJobBalance > 0)
      ? {
          key: "pay-job",
          label: "Pay Job",
          detail: toLedgerCurrency(openJobBalance || depositShortfall + balancePaymentShortfall),
          tone: depositMissingHighlight || balanceMissingHighlight ? "missing" : undefined,
          disabled: busy,
          onClick: () => saveRow(payJobPatch, "Job marked paid.")
        }
      : null,
    (row || canEditJob) && depositShortfall > 0
      ? {
          key: "pay-deposit",
          label: "Pay Deposit",
          detail: toLedgerCurrency(depositShortfall),
          tone: "missing",
          disabled: busy,
          paymentTypePicker: {
            defaultValue: depositPaymentType,
            onSelect: (paymentType) =>
              saveRow(
                {
                  deposit_paid_target: row?.depositDue ?? fallbackDepositDue,
                  payment_type: paymentType,
                  paid_at: paidAt
                },
                "Deposit paid."
              )
          },
          onClick: () =>
            saveRow(
              {
                deposit_paid_target: row?.depositDue ?? fallbackDepositDue,
                payment_type: depositPaymentType,
                paid_at: paidAt
              },
              "Deposit paid."
            )
        }
      : null,
    (row || canEditJob) && balancePaymentShortfall > 0
      ? {
          key: "pay-balance",
          label: "Pay Balance",
          detail: toLedgerCurrency(balancePaymentShortfall),
          tone: balanceMissingHighlight ? "missing" : undefined,
          disabled: busy,
          paymentTypePicker: {
            defaultValue: balancePaymentType,
            onSelect: (paymentType) =>
              saveRow(
                {
                  balance_paid_target: balancePaidTarget,
                  payment_type: paymentType,
                  paid_at: paidAt,
                  ...(depositShortfall <= 0 ? { mark_balance_paid: true } : {}),
                  ...(depositShortfall <= 0 && row?.source === "crm_quote" ? { status: "paid" } : {})
                },
                "Balance paid."
              )
          },
          onClick: () =>
            saveRow(
              {
                balance_paid_target: balancePaidTarget,
                payment_type: balancePaymentType,
                paid_at: paidAt,
                ...(depositShortfall <= 0 ? { mark_balance_paid: true } : {}),
                ...(depositShortfall <= 0 && row?.source === "crm_quote" ? { status: "paid" } : {})
              },
              "Balance paid."
            )
        }
      : null
  ];
  const moneyCommands = moneyCommandOptions.filter((command): command is DrillCommandButton => Boolean(command));
  const amountCommands: DrillAmountCommand[] = row || canEditJob
    ? [
        {
          key: "set-total",
          label: "Sold Total",
          detail: toLedgerCurrency(row?.total ?? fallbackTotal),
          defaultValue: row?.total || fallbackTotal,
          disabled: busy,
          onSave: (amount) =>
            saveRow(
              row?.source === "crm_quote" ? { quote_total: amount, manual_total_override: true } : { total_amount: amount },
              "Total updated."
            )
        },
        {
          key: "set-deposit",
          label: "Deposit Due",
          detail: toLedgerCurrency(row?.depositDue ?? fallbackDepositDue),
          defaultValue: row?.depositDue || fallbackDepositDue,
          tone: depositMissingHighlight ? "missing" : undefined,
          disabled: busy,
          onSave: (amount) => saveRow({ deposit_required: amount }, "Deposit due updated.")
        },
        {
          key: "set-deposit-paid",
          label: "Deposit Paid",
          detail: ledgerCurrencyWithPaymentType(row?.depositPaid || 0, row?.depositPaymentType),
          defaultValue: row?.depositPaid || 0,
          paymentType: depositPaymentType,
          requirePaymentType: true,
          tone: depositMissingHighlight ? "missing" : undefined,
          disabled: busy,
          onSave: (amount, paymentType) =>
            saveRow(
              {
                deposit_paid_target: amount,
                payment_type: paymentType || depositPaymentType,
                paid_at: paidAt
              },
              "Deposit paid updated."
            )
        },
        {
          key: "set-balance",
          label: "Balance Due",
          detail: toLedgerCurrency(row?.balance ?? configuredBalanceDue),
          defaultValue: row?.balance || configuredBalanceDue,
          tone: balanceMissingHighlight ? "missing" : undefined,
          disabled: busy,
          onSave: (amount) => saveRow({ balance_due_target: amount }, "Balance updated.")
        },
        {
          key: "set-balance-paid",
          label: "Balance Paid",
          detail: ledgerCurrencyWithPaymentType(row?.balancePaid || 0, row?.balancePaymentType),
          defaultValue: row?.balancePaid || 0,
          paymentType: balancePaymentType,
          requirePaymentType: true,
          tone: balanceMissingHighlight ? "missing" : undefined,
          disabled: busy,
          onSave: (amount, paymentType) =>
            saveRow(
              {
                balance_paid_target: amount,
                payment_type: paymentType || balancePaymentType,
                paid_at: paidAt
              },
              "Balance paid updated."
            )
        },
        {
          key: "write-cogs",
          label: "Write COGS",
          detail: (row?.cogs || 0) > 0 ? toLedgerCurrency(row?.cogs || 0) : "Missing",
          defaultValue: row?.cogs || 0,
          tone: cogsMissingHighlight ? "missing" : undefined,
          disabled: busy,
          onSave: (amount) =>
            saveRow(row?.source === "crm_quote" ? { materials_cost: amount } : { cogs_amount: amount }, "COGS updated.")
        },
        {
          key: "set-install",
          label: "Install $",
          detail: toLedgerCurrency(row?.installationInvoiceAmount || 0),
          defaultValue: row?.installationInvoiceAmount || 0,
          tone: installMissingHighlight ? "warning" : undefined,
          disabled: busy,
          onSave: (amount) => saveRow({ installation_invoice_amount: amount }, "Installation amount updated.")
        },
        {
          key: "add-payment",
          label: "Add Payment",
          detail: formatPaymentType(row?.paymentType || "other"),
          defaultValue: 0,
          disabled: busy,
          onSave: (amount) =>
            saveRow(
              {
                payment_amount: amount,
                payment_label: "Balance payment",
                payment_type: rowPaymentType,
                paid_at: paidAt
              },
              "Payment recorded."
            )
        }
      ]
    : [];
  const findCogsCommand: DrillCommandButton | null = onFindCogs && (row || canEditJob)
    ? {
        key: "find-cogs",
        label: "Find COGS",
        detail: "Search recent orders",
        tone: cogsMissingHighlight ? "missing" : undefined,
        disabled: busy,
        onClick: () => void onFindCogs(entry)
      }
    : null;
  const orderCommands: DrillTextCommand[] = row
    ? [
        {
          key: "manufacturer",
          label: "Manufacturer",
          detail: row.manufacturerName || "Needs order details",
          defaultValue: row.manufacturerName || "",
          placeholder: "Manufacturer",
          tone: manufacturerMissingHighlight ? "missing" : undefined,
          disabled: busy,
          onSave: (value) => saveRow({ manufacturer_name: value.trim() }, "Manufacturer updated.")
        },
        {
          key: "order-ref",
          label: "Order #",
          detail: row.manufacturerOrderRef || "No order number",
          defaultValue: row.manufacturerOrderRef || "",
          placeholder: "Order number",
          tone: orderRefMissingHighlight ? "missing" : undefined,
          disabled: busy,
          onSave: (value) => saveRow({ manufacturer_order_ref: value.trim() }, "Order number updated.")
        }
      ]
    : [];

  return (
    <article className="crm-drill-detail-card">
      <div className="crm-drill-action-board" aria-label={`Process controls for ${customerName}`}>
        <section className="crm-drill-action-section crm-drill-action-section--status">
          <span>Status</span>
          {statusControl ? (
            <div className="crm-drill-status-grid" role="group" aria-label={`Status for ${customerName}`}>
              {statusControl.options.map((option) => (
                <button
                  type="button"
                  className={option.value === statusControl.value ? "active" : ""}
                  aria-pressed={option.value === statusControl.value}
                  disabled={busy}
                  key={option.value}
                  onClick={() => {
                    if (option.value !== statusControl.value) void statusControl.onSave(option.value);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <strong>{titleCase(String(liveRowStatus || job?.status || file?.latestStatus || "open"))}</strong>
          )}
        </section>

        {workflowCommands.length ? (
          <section className="crm-drill-action-section">
            <span>Process Buttons</span>
            <div className="crm-drill-command-grid">
              {workflowCommands.map((command) => (
                <DrillCommandButtonControl command={command} key={command.key} />
              ))}
            </div>
          </section>
        ) : null}

        {moneyCommands.length ? (
          <section className="crm-drill-action-section crm-drill-action-section--payment">
            <span>Payment Buttons</span>
            <div className="crm-drill-command-grid">
              {moneyCommands.map((command) => (
                <DrillCommandButtonControl command={command} key={command.key} />
              ))}
            </div>
          </section>
        ) : null}

        {amountCommands.length ? (
          <section className="crm-drill-action-section crm-drill-action-section--editable">
            <span>Editable Amounts</span>
            <div className="crm-drill-command-grid crm-drill-command-grid--editable">
              {amountCommands.map((command) => (
                command.key === "write-cogs" && findCogsCommand ? (
                  <div className="crm-drill-cogs-command-stack" key={command.key}>
                    <DrillAmountCommandControl command={command} />
                    <DrillCommandButtonControl command={findCogsCommand} />
                  </div>
                ) : <DrillAmountCommandControl command={command} key={command.key} />
              ))}
            </div>
          </section>
        ) : null}

        {orderCommands.length ? (
          <section className="crm-drill-action-section crm-drill-action-section--order">
            <span>Order Details</span>
            <div className="crm-drill-command-grid">
              {orderCommands.map((command) => (
                <DrillTextCommandControl command={command} key={command.key} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <header className="crm-drill-detail-card-head">
        <div>
          <p className="eyebrow">{entry.meta || payload.subtitle}</p>
          <h3>
            <InlineEditableValue value={customerName} editor={customerNameEditor} className="crm-inline-edit-heading" />
          </h3>
          <p className="crm-drill-contact-line">
            {visibleContactItems.length
              ? visibleContactItems.map((item, index) => (
                  <Fragment key={item.key}>
                    {index ? <span className="crm-contact-divider">/</span> : null}
                    <InlineEditableValue value={item.value || item.fallback} editor={item.editor} className="crm-inline-edit-contact" />
                  </Fragment>
                ))
              : "Contact details pending"}
          </p>
        </div>
        {entry.value ? (
          <div className="crm-drill-detail-value">
            <strong className={entry.tone === "warn" ? "warn" : ""}>{entry.value}</strong>
          </div>
        ) : null}
      </header>

      {canReassignSale ? (
        <label className="crm-sale-owner-control crm-sale-owner-control--inline">
          <span>Sale owner</span>
          <select
            aria-label={`Sale owner for ${entry.name}`}
            value={saleOwnerDisplayName(entry.salesOwner)}
            disabled={busy}
            onChange={(event) => onReassignSale?.(entry, event.target.value)}
          >
            {ownerOptions.map((owner) => (
              <option key={owner}>{owner}</option>
            ))}
          </select>
        </label>
      ) : null}

      <>
        <div className="crm-drill-compact-grid">
          <section className="crm-drill-fact-column">
            <h4>Customer Info</h4>
            <div className="crm-drill-fact-column-list">
              <DrillFact label="Sold" value={formatShortDate(row?.soldDate || file?.latestSoldDate || job?.appointment_start)} editor={soldDateEditor} />
              <DrillFact label="Quote / Job" value={row?.quoteNumber || row?.source?.replace("_", " ") || job?.id || "Not linked"} editor={quoteNumberEditor} />
              <DrillFact label="Lead Source" value={job?.lead_source || "Unknown"} editor={leadSourceEditor} />
              <DrillFact label="Sold By" value={saleOwnerDetailLabel(soldByOwner)} editor={soldByEditor} />
              <DrillFact label="Belongs To" value={saleOwnerDetailLabel(belongsToOwner)} editor={belongsToEditor} />
              <DrillFact label="Due" value={formatShortDate(job?.next_action_due)} editor={dueEditor} />
              <DrillFact
                label="Appointment"
                value={job?.appointment_start ? `${formatShortDate(job.appointment_start)}${job.appointment_end ? ` - ${formatShortDate(job.appointment_end)}` : ""}` : "Not scheduled"}
                editor={appointmentEditor}
              />
              <DrillFact label="Address" value={file?.address || job?.address || "No address saved"} editor={addressEditor} />
              <DrillFact label="Next Action" value={job?.next_action || "No next action"} editor={nextActionEditor} />
            </div>
          </section>

          <section className="crm-drill-fact-column">
            <h4>Financial</h4>
            <div className="crm-drill-fact-column-list">
              <DrillFact label="Total" value={toLedgerCurrency(row?.total ?? job?.quote_total ?? job?.estimated_total ?? file?.lifetimeValue)} editor={totalEditor} />
              <DrillFact label="Paid" value={toLedgerCurrency(row?.paidTotal ?? job?.deposit_paid)} />
              <DrillFact label="Balance" value={toLedgerCurrency(row?.balance ?? file?.openBalance)} tone={(row?.balance ?? file?.openBalance ?? 0) > 0 ? "warn" : "good"} editor={balanceEditor} />
              <DrillFact
                label="Deposit"
                value={
                  row
                    ? `${ledgerCurrencyWithPaymentType(row.depositPaid, row.depositPaymentType)} / ${toLedgerCurrency(row.depositDue)}`
                    : `${toLedgerCurrency(0)} / ${toLedgerCurrency(fallbackDepositDue)}`
                }
                tone={depositMissingHighlight ? "warn" : undefined}
                depositEditor={depositEditor}
              />
              <DrillFact label="Balance Paid" value={row ? ledgerCurrencyWithPaymentType(row.balancePaid, row.balancePaymentType) : toLedgerCurrency(0)} tone={balanceMissingHighlight ? "warn" : undefined} editor={balancePaidEditor} />
              <DrillFact label="Payment" value={row?.paymentType ? formatPaymentType(row.paymentType) : "Not recorded"} editor={paymentEditor} />
              <DrillFact
                label="COGS"
                value={row ? (row.cogs > 0 ? toLedgerCurrency(row.cogs) : "Missing") : "Missing"}
                tone={cogsMissingHighlight ? "warn" : undefined}
                editor={cogsEditor}
              />
              <DrillFact label="Ken" value={row ? toLedgerCurrency(row.kenCut) : "No ledger row"} />
              <DrillFact label="Advertising 7%" value={row ? toLedgerCurrency(row.advertisingReserve) : "No ledger row"} />
              {row && Object.hasOwn(row, "mikeProfit") ? (
                <DrillFact label="Mike Profit" value={toLedgerCurrency(row.mikeProfit)} tone={row.mikeProfit >= 0 ? "good" : undefined} />
              ) : null}
              {row && (row.salesOwner === "jessica" || row.jessicaCommission > 0) ? (
                <DrillFact label="Jessica Profit" value={toLedgerCurrency(row.jessicaCommission)} tone="good" />
              ) : null}
              <DrillFact label="Install $" value={row ? toLedgerCurrency(row.installationInvoiceAmount) : "No install row"} tone={installMissingHighlight ? "warn" : undefined} editor={installAmountEditor} />
              {row && row.installationInvoiceAmount > 0 ? (
                <DrillFact
                  label="Install Payable"
                  value={
                    row.isInstallationInvoicePaid
                      ? `${toLedgerCurrency(row.installationInvoicePaidAmount)} paid`
                      : `${toLedgerCurrency(row.installationInvoiceOpenAmount)} open`
                  }
                  tone={row.installationInvoiceOpenAmount > 0 ? "warn" : "good"}
                />
              ) : null}
            </div>
          </section>

          <section className="crm-drill-fact-column">
            <h4>Status + Product</h4>
            <div className="crm-drill-fact-column-list">
              <DrillFact label="Status" value={titleCase(String(liveRowStatus || job?.status || file?.latestStatus || "open"))} tone={needsOrderHighlight ? "warn" : undefined} editor={statusEditor} />
              {job ? <DrillFact label="Measure" value={measureNeededLabel(job)} tone={measureNeededActive ? "warn" : undefined} /> : null}
              <DrillFact label="Manufacturer" value={row?.manufacturerName || "Needs order details"} tone={manufacturerMissingHighlight ? "warn" : undefined} editor={manufacturerEditor} />
              <DrillFact label="Order #" value={row?.manufacturerOrderRef || "No order number"} tone={orderRefMissingHighlight ? "warn" : undefined} editor={orderRefEditor} />
              <DrillFact
                label="Install Status"
                value={
                  row
                    ? row.isInstallationComplete
                      ? "Complete"
                      : row.isMissingInstallerInvoice
                        ? "Missing installer invoice"
                        : titleCase(row.installationMatchStatus)
                    : "No install row"
                }
                tone={row?.isMissingInstallerInvoice ? "warn" : undefined}
                editor={installStatusEditor}
              />
            </div>
          </section>
        </div>

        {products.length || hasActivity || hasDocumentsOrNotes || job ? (
          <div className="crm-drill-detail-strip">
            {job ? (
              <PaymentPlanSection
                job={job}
                suggestedTotal={row ? Number(row.balance) || 0 : 0}
                busy={busy}
                onPaymentPlanAction={onPaymentPlanAction}
              />
            ) : null}
            {products.length ? (
              <details className="crm-drill-line-section">
                <summary>
                  <span>Products</span>
                  <em>{lineItemLabel(products.length)}</em>
                </summary>
                <div className="crm-drill-line-list">
                  {products.map((product) => (
                    <div className="crm-drill-line-item" key={product.id}>
                      <strong>{[product.room, product.product_type].filter(Boolean).join(" / ") || "Product"}</strong>
                      <span>
                        {[product.description, product.fabric, product.material, product.control_type, product.mount_type]
                          .filter(Boolean)
                          .join(" / ") || "Product details pending"}
                      </span>
                      <em>
                        {product.quantity} item{product.quantity === 1 ? "" : "s"}
                        {product.total_price ? ` / ${toLedgerCurrency(product.total_price)}` : ""}
                      </em>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            {hasActivity || (row && onLedgerLineAction) ? (
              <details className="crm-drill-line-section">
                <summary>
                  <span>Payments + Activity</span>
                  <em>{lineItemLabel(activityItemCount)}</em>
                </summary>
                <div className="crm-drill-line-list">
                  {row?.payments.map((payment) => (
                    <DrillLedgerLine
                      key={payment.id}
                      title={payment.payment_label || formatPaymentType(payment.payment_type)}
                      subtitle={[
                        formatPaymentType(payment.payment_type),
                        formatShortDate(payment.paid_at),
                        payment.source,
                        payment.external_source && payment.external_id
                          ? `${payment.external_source}: ${payment.external_id}`
                          : payment.external_id || payment.external_source
                      ].filter(Boolean).join(" / ")}
                      amount={toLedgerCurrency(payment.amount)}
                      busy={busy}
                      fields={[
                        { name: "payment_label", label: "Label", type: "text", value: payment.payment_label || "" },
                        { name: "amount", label: "Amount", type: "number", value: String(payment.amount ?? "") },
                        { name: "paid_at", label: "Paid on", type: "date", value: (payment.paid_at || "").slice(0, 10) },
                        {
                          name: "payment_type",
                          label: "Type",
                          type: "select",
                          value: payment.payment_type || "other",
                          options: LEDGER_PAYMENT_TYPE_OPTIONS
                        }
                      ]}
                      onSave={
                        onLedgerLineAction
                          ? (values) =>
                              onLedgerLineAction({
                                kind: "payment",
                                op: "update",
                                id: payment.id,
                                payload: {
                                  payment_label: values.payment_label,
                                  amount: Number(values.amount || 0),
                                  paid_at: values.paid_at || null,
                                  payment_type: values.payment_type
                                },
                                message: "Payment updated. Balances recalculated."
                              })
                          : undefined
                      }
                      onDelete={
                        onLedgerLineAction
                          ? () =>
                              onLedgerLineAction({
                                kind: "payment",
                                op: "delete",
                                id: payment.id,
                                message: "Payment deleted. Balances recalculated."
                              })
                          : undefined
                      }
                      deleteConfirm={`Delete this ${toLedgerCurrency(payment.amount)} payment?\n\nThe customer's balance and all profit numbers will recalculate.`}
                    />
                  ))}
                  {row?.creditsIn.map((credit) => (
                    <DrillLedgerLine
                      key={`credit-in-${credit.id}`}
                      title="Credit In"
                      subtitle={[formatShortDate(credit.credit_date), credit.note].filter(Boolean).join(" / ")}
                      amount={toLedgerCurrency(credit.amount)}
                      busy={busy}
                      fields={[
                        { name: "amount", label: "Amount", type: "number", value: String(credit.amount ?? "") },
                        { name: "credit_date", label: "Date", type: "date", value: (credit.credit_date || "").slice(0, 10) },
                        { name: "note", label: "Note", type: "text", value: credit.note || "" }
                      ]}
                      onSave={
                        onLedgerLineAction
                          ? (values) =>
                              onLedgerLineAction({
                                kind: "credit",
                                op: "update",
                                id: credit.id,
                                payload: {
                                  amount: Number(values.amount || 0),
                                  credit_date: values.credit_date || null,
                                  note: values.note
                                },
                                message: "Credit updated. Balances recalculated."
                              })
                          : undefined
                      }
                      onDelete={
                        onLedgerLineAction
                          ? () =>
                              onLedgerLineAction({
                                kind: "credit",
                                op: "delete",
                                id: credit.id,
                                message: "Credit deleted. Balances recalculated."
                              })
                          : undefined
                      }
                      deleteConfirm={`Delete this ${toLedgerCurrency(credit.amount)} credit?\n\nThe customer's balance and all profit numbers will recalculate.`}
                    />
                  ))}
                  {row?.creditsOut.map((credit) => (
                    <DrillLedgerLine
                      key={`credit-out-${credit.id}`}
                      title="Credit Out"
                      subtitle={[formatShortDate(credit.credit_date), credit.note].filter(Boolean).join(" / ")}
                      amount={toLedgerCurrency(credit.amount)}
                      busy={busy}
                      fields={[
                        { name: "amount", label: "Amount", type: "number", value: String(credit.amount ?? "") },
                        { name: "credit_date", label: "Date", type: "date", value: (credit.credit_date || "").slice(0, 10) },
                        { name: "note", label: "Note", type: "text", value: credit.note || "" }
                      ]}
                      onSave={
                        onLedgerLineAction
                          ? (values) =>
                              onLedgerLineAction({
                                kind: "credit",
                                op: "update",
                                id: credit.id,
                                payload: {
                                  amount: Number(values.amount || 0),
                                  credit_date: values.credit_date || null,
                                  note: values.note
                                },
                                message: "Credit updated. Balances recalculated."
                              })
                          : undefined
                      }
                      onDelete={
                        onLedgerLineAction
                          ? () =>
                              onLedgerLineAction({
                                kind: "credit",
                                op: "delete",
                                id: credit.id,
                                message: "Credit deleted. Balances recalculated."
                              })
                          : undefined
                      }
                      deleteConfirm={`Delete this ${toLedgerCurrency(credit.amount)} credit?\n\nThe customer's balance and all profit numbers will recalculate.`}
                    />
                  ))}
                  {row?.expenses.map((expense) => (
                    <DrillLedgerLine
                      key={`expense-${expense.id}`}
                      title={expense.label}
                      subtitle={[titleCase(expense.category), formatShortDate(expense.incurred_on), expense.notes].filter(Boolean).join(" / ")}
                      amount={toLedgerCurrency(expense.amount)}
                      busy={busy}
                      fields={[
                        { name: "label", label: "Label", type: "text", value: expense.label || "" },
                        { name: "amount", label: "Amount", type: "number", value: String(expense.amount ?? "") },
                        { name: "incurred_on", label: "Date", type: "date", value: (expense.incurred_on || "").slice(0, 10) },
                        {
                          name: "category",
                          label: "Category",
                          type: "select",
                          value: expense.category || "other",
                          options: LEDGER_EXPENSE_CATEGORY_OPTIONS
                        }
                      ]}
                      onSave={
                        onLedgerLineAction
                          ? (values) =>
                              onLedgerLineAction({
                                kind: "expense",
                                op: "update",
                                id: expense.id,
                                payload: {
                                  label: values.label,
                                  amount: Number(values.amount || 0),
                                  incurred_on: values.incurred_on || null,
                                  category: values.category
                                },
                                message: "Expense updated. Profit recalculated."
                              })
                          : undefined
                      }
                      onDelete={
                        onLedgerLineAction
                          ? () =>
                              onLedgerLineAction({
                                kind: "expense",
                                op: "delete",
                                id: expense.id,
                                message: "Expense deleted. Profit recalculated."
                              })
                          : undefined
                      }
                      deleteConfirm={`Delete the "${expense.label}" expense of ${toLedgerCurrency(expense.amount)}?\n\nProfit numbers will recalculate.`}
                    />
                  ))}
                  {row && row.remakeTotal > 0 ? (
                    <div className="crm-drill-line-item" key={`remake-${row.id}`}>
                      <strong>Remake</strong>
                      <span>Mistake / reorder cost (edit via the Remake field)</span>
                      <em>{toLedgerCurrency(-row.remakeTotal)}</em>
                    </div>
                  ) : null}
                  {row && onLedgerLineAction ? (
                    <DrillAddExpenseForm
                      busy={busy}
                      onAdd={(payload) =>
                        onLedgerLineAction({
                          kind: "expense",
                          op: "create",
                          payload: {
                            ...payload,
                            ...(row.source === "crm_quote" && row.quoteId
                              ? { quote_id: row.quoteId }
                              : { bookkeeping_entry_id: row.id }),
                            job_id: row.jobId
                          },
                          message: "Expense added. Profit recalculated."
                        })
                      }
                    />
                  ) : null}
                </div>
              </details>
            ) : null}

            {hasDocumentsOrNotes ? (
              <details className="crm-drill-line-section">
                <summary>
                  <span>Documents + Notes</span>
                  <em>{lineItemLabel(documentsAndNotesCount)}</em>
                </summary>
                <div className="crm-drill-line-list">
                  {documents.map((document) => (
                    <a className="crm-drill-line-item" href={document.url} target="_blank" rel="noreferrer" key={document.id}>
                      <strong>{document.kind}</strong>
                      <span>{document.title}</span>
                      <em>{document.status || "Open copy"}</em>
                    </a>
                  ))}
                  {notes.map((note, index) => (
                    <div className="crm-drill-line-item crm-drill-line-item--note" key={`note-${index}-${note}`}>
                      <strong>Note</strong>
                      <span>{note}</span>
                      <em>Saved note</em>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
        </>
    </article>
  );
}

function DrillCommandButtonControl({ command }: { command: DrillCommandButton }) {
  const [choosingPaymentType, setChoosingPaymentType] = useState(false);
  const [saving, setSaving] = useState(false);

  const runAction = async (action: () => void | Promise<boolean>) => {
    setSaving(true);
    try {
      return await action();
    } finally {
      setSaving(false);
    }
  };

  if (command.paymentTypePicker && choosingPaymentType) {
    return (
      <div className={`crm-drill-command-button crm-drill-command-button--picker ${command.tone ? `crm-drill-command-button--${command.tone}` : ""}`}>
        <strong>{saving ? "Saving…" : command.label}</strong>
        {command.detail ? <span>{saving ? "Please wait" : command.detail}</span> : null}
        <div className="crm-payment-type-picker" role="group" aria-label={`Payment type for ${command.label}`}>
          {quickPaymentTypes.map((item) => (
            <button
              type="button"
              className={item.value === command.paymentTypePicker?.defaultValue ? "active" : ""}
              key={item.value}
              disabled={command.disabled || saving}
              onClick={async () => {
                const result = await runAction(() => command.paymentTypePicker?.onSelect(item.value));
                if (result !== false) setChoosingPaymentType(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className="crm-payment-type-cancel" disabled={command.disabled || saving} onClick={() => setChoosingPaymentType(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`crm-drill-command-button ${command.tone ? `crm-drill-command-button--${command.tone}` : ""}`}
      disabled={command.disabled || saving}
      aria-busy={saving}
      onClick={async () => {
        if (command.paymentTypePicker) {
          setChoosingPaymentType(true);
          return;
        }
        await runAction(command.onClick);
      }}
    >
      <strong>{saving ? "Saving…" : command.label}</strong>
      {command.detail ? <span>{saving ? "Please wait" : command.detail}</span> : null}
    </button>
  );
}

function DrillAmountCommandControl({ command }: { command: DrillAmountCommand }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(command.defaultValue ? String(command.defaultValue) : "");
  const [paymentType, setPaymentType] = useState<CrmBookkeepingPaymentType>(command.paymentType || "check");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setValue(command.defaultValue ? String(command.defaultValue) : "");
  }, [command.defaultValue, editing]);

  useEffect(() => {
    if (!editing) setPaymentType(command.paymentType || "check");
  }, [command.paymentType, editing]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = roundCurrency(Number(value || 0));
    if (!Number.isFinite(amount) || amount < 0) return;

    setSaving(true);
    const saved = await command.onSave(amount, command.requirePaymentType ? paymentType : undefined);
    setSaving(false);
    if (saved) setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={`crm-drill-command-button ${command.tone ? `crm-drill-command-button--${command.tone}` : ""}`}
        disabled={command.disabled}
        onClick={() => setEditing(true)}
      >
        <strong>{command.label}</strong>
        <span>{command.detail}</span>
      </button>
    );
  }

  return (
    <form className={`crm-drill-amount-command ${command.tone ? `crm-drill-command-button--${command.tone}` : ""}`} onSubmit={submit}>
      <label>
        <span>{command.label}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          autoFocus
          disabled={command.disabled || saving}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      {command.requirePaymentType ? (
        <div className="crm-payment-type-picker" role="group" aria-label={`Payment type for ${command.label}`}>
          {quickPaymentTypes.map((item) => (
            <button
              type="button"
              className={paymentType === item.value ? "active" : ""}
              key={item.value}
              disabled={command.disabled || saving}
              onClick={() => setPaymentType(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      <div>
        <button type="submit" disabled={command.disabled || saving}>
          Save
        </button>
        <button type="button" disabled={saving} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CustomerFilePaymentMethodAction({
  label,
  amountLabel,
  defaultValue,
  disabled,
  onSelect
}: {
  label: string;
  amountLabel: string;
  defaultValue: CrmBookkeepingPaymentType;
  disabled?: boolean;
  onSelect: (paymentType: CrmBookkeepingPaymentType) => void;
}) {
  const [choosingPaymentType, setChoosingPaymentType] = useState(false);

  if (!choosingPaymentType) {
    return (
      <button type="button" className="crm-customer-action-link" disabled={disabled} onClick={() => setChoosingPaymentType(true)}>
        {label} {amountLabel}
      </button>
    );
  }

  return (
    <span className="crm-customer-payment-method-action">
      <span>
        {label} {amountLabel}
      </span>
      <span className="crm-payment-type-picker crm-payment-type-picker--compact" role="group" aria-label={`Payment type for ${label}`}>
        {quickPaymentTypes.map((item) => (
          <button
            type="button"
            className={item.value === defaultValue ? "active" : ""}
            key={item.value}
            disabled={disabled}
            onClick={() => {
              onSelect(item.value);
              setChoosingPaymentType(false);
            }}
          >
            {item.label}
          </button>
        ))}
      </span>
      <button type="button" className="crm-payment-type-cancel" disabled={disabled} onClick={() => setChoosingPaymentType(false)}>
        Cancel
      </button>
    </span>
  );
}

function DrillTextCommandControl({ command }: { command: DrillTextCommand }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(command.defaultValue);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setValue(command.defaultValue);
  }, [command.defaultValue, editing]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextValue = value.trim();
    if (nextValue === command.defaultValue) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const saved = await command.onSave(nextValue);
    setSaving(false);
    if (saved) setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={`crm-drill-command-button ${command.tone ? `crm-drill-command-button--${command.tone}` : ""}`}
        disabled={command.disabled}
        onClick={() => setEditing(true)}
      >
        <strong>{command.label}</strong>
        <span>{command.detail}</span>
      </button>
    );
  }

  return (
    <form className={`crm-drill-amount-command crm-drill-text-command ${command.tone ? `crm-drill-command-button--${command.tone}` : ""}`} onSubmit={submit}>
      <label>
        <span>{command.label}</span>
        <input
          type="text"
          value={value}
          placeholder={command.placeholder}
          autoFocus
          disabled={command.disabled || saving}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <div>
        <button type="submit" disabled={command.disabled || saving}>
          Save
        </button>
        <button type="button" disabled={saving} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function buildDrillFieldPatch(event: FormEvent<HTMLFormElement>, entry: DrillEntry): DrillFieldPatch {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const row = entry.row;
  const jobId = entry.job?.id || entry.jobId || row?.jobId || null;
  const customerName = formString(formData, "customer_name") || entry.customerName;
  const belongsToOwner = formString(formData, "belongs_to_owner");
  const soldByOwner = formString(formData, "sold_by_owner");
  const patch: DrillFieldPatch = {};

  if (jobId) {
    const jobPatch: Record<string, unknown> = {
      customer_name: customerName,
      phone: formString(formData, "phone"),
      email: formString(formData, "email"),
      city: formString(formData, "city"),
      address: formString(formData, "address"),
      product_interest: formString(formData, "product_interest"),
      lead_source: formString(formData, "lead_source"),
      next_action: formString(formData, "next_action"),
      next_action_due: formString(formData, "next_action_due") || null,
      estimated_total: Number(formString(formData, "estimated_total") || 0),
      appointment_start: dateTimeLocalToIso(formString(formData, "appointment_start")),
      appointment_end: dateTimeLocalToIso(formString(formData, "appointment_end")),
      notes: formString(formData, "job_notes")
    };
    const jobStatus = formString(formData, "job_status");
    if (jobStatus) jobPatch.status = jobStatus;
    if (belongsToOwner) jobPatch.sales_owner = belongsToOwner;
    patch.job = jobPatch;
  }

  if (row) {
    const soldDate = formString(formData, "sold_date");
    const total = Number(formString(formData, "total_amount") || 0);
    const cogs = Number(formString(formData, "cogs_amount") || 0);
    const paymentAmount = Number(formString(formData, "payment_amount") || 0);
    const kenCutOverride = formString(formData, "ken_cut_override");
    const sharedRowPatch: Record<string, unknown> = {
      customer_name: customerName,
      payment_type: formString(formData, "payment_type") || "other",
      payment_amount: paymentAmount,
      payment_label: formString(formData, "payment_label") || "Balance payment",
      paid_at: formString(formData, "paid_at") || null,
      ...balanceDueTargetPatch(formData, row),
      ...moneyTargetPatch(formData, "deposit_paid_target", "deposit_paid_target", row.depositPaid),
      ...moneyTargetPatch(formData, "deposit_required", "deposit_required", row.depositDue),
      ...moneyTargetPatch(formData, "balance_paid_target", "balance_paid_target", row.balancePaid),
      remake_amount: formString(formData, "remake_amount"),
      installation_invoice_amount: Number(formString(formData, "installation_invoice_amount") || 0),
      installation_invoice_number: formString(formData, "installation_invoice_number"),
      installation_invoice_url: formString(formData, "installation_invoice_url"),
      installation_invoice_paid_at: formString(formData, "installation_invoice_paid_at") || null,
      installation_invoice_paid_amount: Number(formString(formData, "installation_invoice_paid_amount") || 0),
      installation_invoice_payment_method: formString(formData, "installation_invoice_payment_method"),
      installation_invoice_payment_notes: formString(formData, "installation_invoice_payment_notes"),
      installation_complete: formData.get("installation_complete") === "on",
      ken_cut_override: kenCutOverride === "" ? null : Number(kenCutOverride),
      manufacturer_name: formString(formData, "manufacturer_name"),
      manufacturer_order_ref: formString(formData, "manufacturer_order_ref"),
      manufacturer_order_url: formString(formData, "manufacturer_order_url"),
      manufacturer_document_url: formString(formData, "manufacturer_document_url"),
      notes: formString(formData, "row_notes")
    };
    if (soldByOwner) sharedRowPatch.sales_owner = soldByOwner;

    patch.row =
      row.source === "crm_quote" && row.quoteId
        ? {
            ...sharedRowPatch,
            status: formString(formData, "quote_status") || row.status,
            sold_by: soldByOwner || undefined,
            quote_number: formString(formData, "quote_number"),
            quote_total: total,
            materials_cost: cogs,
            sold_at: soldDate || null
          }
        : {
            ...sharedRowPatch,
            sold_date: soldDate || null,
            total_amount: total,
            cogs_amount: cogs
          };
  }

  return patch;
}

function DrillDetailEditForm({
  entry,
  busy,
  onCancel,
  onSubmit
}: {
  entry: DrillEntry;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const row = entry.row;
  const job = entry.job;
  const file = entry.file;
  const isQuoteRow = row?.source === "crm_quote" && Boolean(row.quoteId);
  const canEditJobStatus = Boolean(job && !isQuoteRow);
  const canEditQuoteStatus = Boolean(isQuoteRow);
  const customerName = job?.customer_name || row?.customerName || file?.customerName || entry.customerName;
  const statusValue = String(row?.status || job?.status || file?.latestStatus || "");
  const soldDate = dateInputValue(row?.soldDate || file?.latestSoldDate || null);
  const total = row?.total ?? job?.quote_total ?? job?.estimated_total ?? file?.lifetimeValue ?? 0;
  const cogs = row?.cogs ?? 0;
  const remakeAmount = row?.remakeTotal ?? 0;
  const installationAmount = row?.installationInvoiceAmount ?? 0;
  const installationPaidAmount = row?.installationInvoicePaidAmount ?? 0;
  const paymentType = row?.paymentType || "other";
  const soldByOwner = saleOwnerDisplayName(row?.salesOwner || (job && WON_JOB_STATUSES.includes(job.status) ? job.sales_owner : null));
  const belongsToOwner = saleOwnerDisplayName(job?.sales_owner);

  return (
    <form className="crm-drill-edit-form" onSubmit={onSubmit}>
      <div className="crm-drill-edit-grid">
        <section className="crm-drill-info-column">
          <h4>Status</h4>
          <div className="crm-field-row">
            <label>
              Customer
              <input name="customer_name" required defaultValue={customerName} />
            </label>
            <label>
              Phone
              <input name="phone" defaultValue={file?.phone || job?.phone || ""} />
            </label>
          </div>
          <div className="crm-field-row">
            <label>
              Email
              <input name="email" type="email" defaultValue={file?.email || job?.email || ""} />
            </label>
            <label>
              City
              <input name="city" defaultValue={file?.city || job?.city || ""} />
            </label>
          </div>
          <label>
            Address
            <AddressAutocomplete name="address" cityFieldName="city" defaultValue={file?.address || job?.address || ""} />
          </label>
          <div className="crm-field-row">
            <label>
              Status
              {canEditQuoteStatus ? (
                <select className="crm-status-select" data-status={statusValue || undefined} name="quote_status" defaultValue={statusValue}>
                  {crmQuoteStatuses.map((status) => (
                    <option value={status} key={status}>
                      {titleCase(status)}
                    </option>
                  ))}
                </select>
              ) : canEditJobStatus ? (
                <select className="crm-status-select" data-status={statusValue || undefined} name="job_status" defaultValue={statusValue}>
                  {crmJobStatuses.map((status) => (
                    <option value={status} key={status}>
                      {titleCase(status)}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={statusValue ? titleCase(statusValue) : "Not linked"} readOnly />
              )}
            </label>
            <label>
              Sold Date
              <input name="sold_date" type="date" defaultValue={soldDate} disabled={!row} />
            </label>
          </div>
          <div className="crm-field-row">
            <label>
              Quote / Job
              <input name="quote_number" defaultValue={row?.quoteNumber || ""} disabled={!isQuoteRow} />
            </label>
            <label>
              Product
              <select name="product_interest" defaultValue={job?.product_interest || "Shutters"} disabled={!job}>
                {productOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Lead Source
            <LeadSourceSelect defaultValue={job?.lead_source} disabled={!job} />
          </label>
          <div className="crm-field-row">
            <label>
              Sold By
              <select name="sold_by_owner" defaultValue={soldByOwner} disabled={!row && !job}>
                {ownerSelectOptions.map((item) => (
                  <option value={item.value} key={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Belongs To
              <select name="belongs_to_owner" defaultValue={belongsToOwner} disabled={!job}>
                {ownerSelectOptions.map((item) => (
                  <option value={item.value} key={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Next Action
            <input name="next_action" defaultValue={job?.next_action || ""} disabled={!job} />
          </label>
          <div className="crm-field-row">
            <label>
              Due
              <input name="next_action_due" type="date" defaultValue={dateInputValue(job?.next_action_due)} disabled={!job} />
            </label>
            <label>
              Estimate
              <input name="estimated_total" type="number" min="0" step="0.01" defaultValue={job?.estimated_total || ""} disabled={!job} />
            </label>
          </div>
          <div className="crm-field-row">
            <label>
              Appointment Start
              <input name="appointment_start" type="datetime-local" defaultValue={dateTimeLocalValue(job?.appointment_start)} disabled={!job} />
            </label>
            <label>
              Appointment End
              <input name="appointment_end" type="datetime-local" defaultValue={dateTimeLocalValue(job?.appointment_end)} disabled={!job} />
            </label>
          </div>
        </section>

        <section className="crm-drill-info-column">
          <h4>Payment</h4>
          <div className="crm-field-row">
            <label>
              Total
              <input name="total_amount" type="number" min="0" step="0.01" defaultValue={total || ""} disabled={!row} />
            </label>
            <label>
              COGS
              <input name="cogs_amount" type="number" min="0" step="0.01" defaultValue={cogs || ""} disabled={!row} />
            </label>
            <label>
              Remake
              <input name="remake_amount" type="number" step="0.01" defaultValue={remakeAmount ? -remakeAmount : ""} disabled={!row} />
            </label>
          </div>
          <div className="crm-field-row">
            <label>
              Payment Type
              <select name="payment_type" defaultValue={paymentType} disabled={!row}>
                {paymentTypes.map((item) => (
                  <option value={item.value} key={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Add Payment
              <input name="payment_amount" type="number" min="0" step="0.01" placeholder="0.00" disabled={!row} />
            </label>
            <label>
              Balance Due
              <input name="balance_due_target" type="number" step="0.01" defaultValue={row?.balance ?? ""} disabled={!row} />
            </label>
          </div>
          <div className="crm-field-row">
            <label>
              Deposit Paid
              <input name="deposit_paid_target" type="number" min="0" step="0.01" defaultValue={row?.depositPaid ?? ""} disabled={!row} />
            </label>
            <label>
              Deposit Due
              <input name="deposit_required" type="number" min="0" step="0.01" defaultValue={row?.depositDue ?? ""} disabled={!row} />
            </label>
            <label>
              Balance Paid
              <input name="balance_paid_target" type="number" min="0" step="0.01" defaultValue={row?.balancePaid ?? ""} disabled={!row} />
            </label>
          </div>
          <div className="crm-field-row">
            <label>
              Payment Label
              <input name="payment_label" placeholder="Balance payment" disabled={!row} />
            </label>
            <label>
              Paid Date
              <input name="paid_at" type="date" defaultValue={todayInputValue()} disabled={!row} />
            </label>
            <label>
              Adjustment Note
              <input name="balance_adjustment_note" placeholder="Discount / correction" disabled={!row} />
            </label>
          </div>
          <label>
            Ken Cut Override
            <input
              name="ken_cut_override"
              type="number"
              min="0"
              step="0.01"
              placeholder="Auto"
              defaultValue={row?.kenCutOverride ?? ""}
              disabled={!row}
            />
          </label>
          <div className="crm-drill-calculated-grid" aria-label="Calculated payment values">
            <span>
              Paid <strong>{row ? toLedgerCurrency(row.paidTotal) : "No ledger row"}</strong>
            </span>
            <span>
              Balance <strong>{toLedgerCurrency(row?.balance ?? file?.openBalance)}</strong>
            </span>
            <span>
              Ken <strong>{row ? toLedgerCurrency(row.kenCut) : "No ledger row"}</strong>
            </span>
          <span>
            Advertising 7% <strong>{row ? toLedgerCurrency(row.advertisingReserve) : "No ledger row"}</strong>
          </span>
          {row && Object.hasOwn(row, "mikeProfit") ? (
            <span>
              Mike Profit <strong>{toLedgerCurrency(row.mikeProfit)}</strong>
            </span>
          ) : null}
          {row && (row.salesOwner === "jessica" || row.jessicaCommission > 0) ? (
            <span>
              Jessica Profit <strong>{toLedgerCurrency(row.jessicaCommission)}</strong>
            </span>
          ) : null}
          <span>
            Remake <strong>{row ? toLedgerCurrency(-row.remakeTotal) : "No ledger row"}</strong>
          </span>
        </div>
        </section>

        <section className="crm-drill-info-column">
          <h4>Product + Order</h4>
          <div className="crm-field-row">
            <label>
              Manufacturer
              <input name="manufacturer_name" defaultValue={row?.manufacturerName || ""} disabled={!row} />
            </label>
            <label>
              Order #
              <input name="manufacturer_order_ref" defaultValue={row?.manufacturerOrderRef || ""} disabled={!row} />
            </label>
          </div>
          <label>
            Order URL
            <input name="manufacturer_order_url" type="url" defaultValue={row?.manufacturerOrderUrl || ""} disabled={!row} />
          </label>
          <label>
            Manufacturer Document URL
            <input name="manufacturer_document_url" type="url" defaultValue={row?.manufacturerDocumentUrl || ""} disabled={!row} />
          </label>
          <div className="crm-field-row">
            <label>
              Install Invoice
              <input name="installation_invoice_amount" type="number" min="0" step="0.01" defaultValue={installationAmount || ""} disabled={!row} />
            </label>
            <label>
              Invoice #
              <input name="installation_invoice_number" defaultValue={row?.installationInvoiceNumber || ""} disabled={!row} />
            </label>
          </div>
          <label>
            Install Invoice URL
            <input name="installation_invoice_url" type="url" defaultValue={row?.installationInvoiceUrl || ""} disabled={!row} />
          </label>
          <div className="crm-field-row">
            <label>
              Install Paid Date
              <input name="installation_invoice_paid_at" type="date" defaultValue={dateInputValue(row?.installationInvoicePaidAt)} disabled={!row} />
            </label>
            <label>
              Install Paid Amount
              <input
                name="installation_invoice_paid_amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={installationPaidAmount || ""}
                disabled={!row}
              />
            </label>
          </div>
          <div className="crm-field-row">
            <label>
              Install Payment Method
              <input name="installation_invoice_payment_method" defaultValue={row?.installationInvoicePaymentMethod || ""} disabled={!row} />
            </label>
            <label>
              Install Payment Notes
              <input name="installation_invoice_payment_notes" defaultValue={row?.installationInvoicePaymentNotes || ""} disabled={!row} />
            </label>
          </div>
          <label className="crm-checkbox">
            <input name="installation_complete" type="checkbox" defaultChecked={Boolean(row?.isInstallationComplete)} disabled={!row} />
            Installation complete
          </label>
        </section>

        <section className="crm-drill-info-column crm-drill-info-column--notes">
          <h4>Notes</h4>
          <label>
            Job Notes
            <textarea name="job_notes" rows={4} defaultValue={job?.notes || ""} disabled={!job} />
          </label>
          <label>
            Ledger / Quote Notes
            <textarea name="row_notes" rows={4} defaultValue={row?.notes || ""} disabled={!row} />
          </label>
        </section>
      </div>
      <div className="crm-drill-edit-actions">
        <button type="button" className="crm-ghost-button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save Card"}
        </button>
      </div>
    </form>
  );
}

const LEDGER_PAYMENT_TYPE_OPTIONS: DrillInlineOption[] = [
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit Card" },
  { value: "zelle", label: "Zelle" },
  { value: "venmo", label: "Venmo" },
  { value: "other", label: "Other" }
];

const LEDGER_EXPENSE_CATEGORY_OPTIONS: DrillInlineOption[] = [
  { value: "materials", label: "Materials" },
  { value: "installation_extra", label: "Installation Extra" },
  { value: "processing_fee", label: "Processing Fee" },
  { value: "permit", label: "Permit" },
  { value: "repair", label: "Repair" },
  { value: "remake", label: "Remake" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" }
];

type DrillLedgerLineField = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  value: string;
  options?: DrillInlineOption[];
};

function DrillLedgerLine({
  title,
  subtitle,
  amount,
  busy,
  fields,
  onSave,
  onDelete,
  deleteConfirm
}: {
  title: string;
  subtitle: string;
  amount: string;
  busy: boolean;
  fields: DrillLedgerLineField[];
  onSave?: (values: Record<string, string>) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  deleteConfirm?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const canEdit = Boolean(fields.length && onSave);

  const startEdit = () => {
    setDraft(Object.fromEntries(fields.map((field) => [field.name, field.value])));
    setEditing(true);
  };

  const save = async () => {
    if (!onSave) return;
    const saved = await onSave(draft);
    if (saved) setEditing(false);
  };

  const remove = () => {
    if (!onDelete) return;
    if (deleteConfirm && typeof window !== "undefined" && !window.confirm(deleteConfirm)) return;
    void onDelete();
  };

  const setDraftField = (name: string, value: string) => setDraft((prev) => ({ ...prev, [name]: value }));

  if (editing) {
    return (
      <div className="crm-drill-line-item crm-drill-line-editing">
        <strong>{title}</strong>
        <div className="crm-drill-line-edit-fields">
          {fields.map((field) => (
            <label key={field.name}>
              <span>{field.label}</span>
              {field.type === "select" ? (
                <select
                  className="crm-inline-edit-control"
                  value={draft[field.name] ?? ""}
                  disabled={busy}
                  onChange={(event) => setDraftField(field.name, event.target.value)}
                >
                  {(field.options || []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="crm-inline-edit-control"
                  type={field.type}
                  step={field.type === "number" ? "0.01" : undefined}
                  value={draft[field.name] ?? ""}
                  disabled={busy}
                  onChange={(event) => setDraftField(field.name, event.target.value)}
                />
              )}
            </label>
          ))}
        </div>
        <div className="crm-drill-line-actions">
          <button type="button" className="crm-ghost-button" disabled={busy} onClick={() => void save()}>
            Save
          </button>
          <button type="button" className="crm-ghost-button" disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`crm-drill-line-item${canEdit || onDelete ? " crm-drill-line-item--actions" : ""}`}>
      <strong>{title}</strong>
      <span>{subtitle}</span>
      <em>{amount}</em>
      {canEdit || onDelete ? (
        <div className="crm-drill-line-actions">
          {canEdit ? (
            <button type="button" className="crm-ghost-button" disabled={busy} onClick={startEdit}>
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" className="crm-ghost-button crm-delete-button" disabled={busy} onClick={remove}>
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DrillAddExpenseForm({
  busy,
  onAdd
}: {
  busy: boolean;
  onAdd: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("other");
  const [amount, setAmount] = useState("");
  const [incurredOn, setIncurredOn] = useState("");

  const reset = () => {
    setLabel("");
    setCategory("other");
    setAmount("");
    setIncurredOn("");
  };

  const submit = async () => {
    const added = await onAdd({
      label: label.trim(),
      category,
      amount: Number(amount || 0),
      incurred_on: incurredOn || null
    });
    if (added) {
      reset();
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <div className="crm-drill-line-item crm-drill-line-add">
        <button type="button" className="crm-ghost-button" disabled={busy} onClick={() => setOpen(true)}>
          + Add expense
        </button>
      </div>
    );
  }

  return (
    <div className="crm-drill-line-item crm-drill-line-editing">
      <strong>New expense</strong>
      <div className="crm-drill-line-edit-fields">
        <label>
          <span>Label</span>
          <input className="crm-inline-edit-control" value={label} disabled={busy} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          <span>Amount</span>
          <input
            className="crm-inline-edit-control"
            type="number"
            step="0.01"
            value={amount}
            disabled={busy}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label>
          <span>Date</span>
          <input className="crm-inline-edit-control" type="date" value={incurredOn} disabled={busy} onChange={(event) => setIncurredOn(event.target.value)} />
        </label>
        <label>
          <span>Category</span>
          <select className="crm-inline-edit-control" value={category} disabled={busy} onChange={(event) => setCategory(event.target.value)}>
            {LEDGER_EXPENSE_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="crm-drill-line-actions">
        <button type="button" className="crm-ghost-button" disabled={busy || !label.trim() || !(Number(amount) > 0)} onClick={() => void submit()}>
          Save expense
        </button>
        <button
          type="button"
          className="crm-ghost-button"
          disabled={busy}
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function DrillFact({
  label,
  value,
  tone,
  wide,
  editor,
  depositEditor
}: {
  label: string;
  value: string;
  tone?: "warn" | "good";
  wide?: boolean;
  editor?: DrillInlineEditor;
  depositEditor?: DrillDepositEditor;
}) {
  return (
    <div className={`crm-drill-fact ${tone || ""} ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <strong>
        {depositEditor ? (
          <InlineDepositValue value={value} editor={depositEditor} />
        ) : (
          <InlineEditableValue value={value} editor={editor} />
        )}
      </strong>
    </div>
  );
}

function JobStatusTabs({
  jobs,
  activeStatus,
  onChange
}: {
  jobs: CrmJob[];
  activeStatus: JobStatusFilter;
  onChange: (status: JobStatusFilter) => void;
}) {
  const counts = useMemo(
    () => new Map<CrmJobStatus, number>(crmJobStatuses.map((status) => [status, jobs.filter((job) => job.status === status).length])),
    [jobs]
  );

  return (
    <div className="crm-customer-filter-bar" aria-label="Job status filters">
      <button type="button" className={!activeStatus ? "active" : ""} aria-pressed={!activeStatus} onClick={() => onChange(null)}>
        All
        <span>{jobs.length}</span>
      </button>
      {jobColumns.map((column) => (
        <button
          type="button"
          className={activeStatus === column.status ? "active" : ""}
          aria-pressed={activeStatus === column.status}
          onClick={() => onChange(column.status)}
          key={column.status}
        >
          {column.label}
          <span>{counts.get(column.status) || 0}</span>
        </button>
      ))}
    </div>
  );
}

function customerFileStatusTokens(file: CrmCustomerFile) {
  const statuses = new Set<string>();
  if (file.latestStatus) {
    statuses.add(file.latestStatus);
    return statuses;
  }
  for (const row of file.bookkeepingRows) statuses.add(effectiveBookkeepingStatus(row));
  if (statuses.size) return statuses;
  for (const job of file.jobs) statuses.add(job.status);
  if (statuses.size) return statuses;
  for (const quote of file.quotes) statuses.add(quote.live_status || quote.status);
  return statuses;
}

function customerFileMatchesStatus(file: CrmCustomerFile, status: JobStatusFilter) {
  if (!status) return true;
  const statuses = customerFileStatusTokens(file);
  if (!statuses.size) return status === "new" || status === "follow_up";

  switch (status) {
    case "new":
    case "follow_up":
    case "scheduled":
    case "lost":
      return statuses.has(status);
    case "closed":
      return statuses.has("closed") || statuses.has("paid");
    case "quoted":
      return statuses.has("quoted") || statuses.has("draft") || statuses.has("sent");
    case "sold":
      return statuses.has("sold") || statuses.has("approved");
    case "ordered":
      return statuses.has("ordered") || statuses.has("received");
    case "installed":
      return statuses.has("installed");
    case "invoiced":
      return statuses.has("invoiced") || statuses.has("paid");
  }
  return false;
}

function customerFileMatchesFilter(file: CrmCustomerFile, filter: CustomerFileFilter) {
  const statuses = customerFileStatusTokens(file);
  if (!statuses.size) return filter === "need_to_schedule";

  switch (filter) {
    case "need_to_schedule":
      return statuses.has("new") || statuses.has("follow_up");
    case "scheduled":
      return statuses.has("scheduled");
    case "quoted":
      return statuses.has("quoted") || statuses.has("draft") || statuses.has("sent");
    case "sold":
      return statuses.has("sold") || statuses.has("approved");
    case "ordered":
      return statuses.has("ordered") || statuses.has("received");
    case "completed":
      return statuses.has("installed") || statuses.has("invoiced") || statuses.has("paid") || statuses.has("closed");
  }
  return false;
}

function statusLabel(status: JobStatusFilter) {
  return status ? titleCase(status) : "All";
}

function normalizeJobSearchText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactJobSearchDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function jobMatchesSearch(job: CrmJob, query: string) {
  const terms = normalizeJobSearchText(query).split(/\s+/).filter(Boolean);
  const haystackValues = [
    job.customer_name,
    job.phone,
    job.email,
    job.address,
    job.city,
    job.product_interest,
    job.sales_owner,
    job.status,
    job.priority,
    job.next_action,
    job.next_action_due,
    job.notes,
    job.quote_total,
    job.estimated_total
  ];
  const haystack = normalizeJobSearchText(haystackValues.join(" "));
  const digitHaystack = compactJobSearchDigits(haystackValues.join(" "));

  return terms.every((term) => {
    if (haystack.includes(term)) return true;
    const digits = compactJobSearchDigits(term);
    return Boolean(digits && digitHaystack.includes(digits));
  });
}

function uniqueCustomerFileIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function customerFileDeletePayload(file: CrmCustomerFile) {
  const rowQuoteIds = file.bookkeepingRows.map((row) => row.quoteId || (row.source === "crm_quote" ? row.id : null));
  return {
    customerName: file.customerName,
    customerId: file.customer?.id || null,
    jobIds: uniqueCustomerFileIds([...file.jobs.map((job) => job.id), ...file.bookkeepingRows.map((row) => row.jobId)]),
    quoteIds: uniqueCustomerFileIds([...file.quotes.map((quote) => quote.id), ...rowQuoteIds]),
    bookkeepingEntryIds: uniqueCustomerFileIds(
      file.bookkeepingRows.map((row) => (row.source === "crm_quote" ? null : row.id))
    ),
    productIds: uniqueCustomerFileIds(file.products.map((product) => product.id)),
    contractIds: uniqueCustomerFileIds(file.contracts.map((contract) => contract.id))
  };
}

function customerFileDetailLine(parts: Array<string | number | null | undefined | false>) {
  return parts.filter(Boolean).join(" / ");
}

function customerFilePhoneHref(phone: string | null | undefined) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

function customerFileQuoteUrl(quote: CrmQuote) {
  return quote.share_token ? `/quote/${quote.share_token}` : null;
}

function customerFilePaymentUrl(quote: CrmQuote) {
  const quoteUrl = customerFileQuoteUrl(quote);
  return quoteUrl ? `${quoteUrl}#payment` : null;
}

function customerFileSearchText(file: CrmCustomerFile) {
  return [
    file.customerName,
    file.phone,
    file.email,
    file.city,
    file.address,
    file.latestStatus,
    ...file.notes,
    ...file.products.map((product) => [product.product_type, product.room, product.description].filter(Boolean).join(" ")),
    ...file.jobs.map((job) =>
      [job.product_interest, job.sales_owner, job.status, job.city, job.address, job.phone, job.email, job.notes].filter(Boolean).join(" ")
    ),
    ...file.quotes.map((quote) => [quote.quote_number, quote.manufacturer_name, quote.status].filter(Boolean).join(" ")),
    ...file.bookkeepingRows.map((row) => [row.quoteNumber, row.manufacturerName, row.manufacturerOrderRef].filter(Boolean).join(" "))
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function nextJobStatus(status: CrmJobStatus) {
  if (status === "closed" || status === "lost") return null;
  const index = crmJobStatuses.indexOf(status);
  return index >= 0 ? crmJobStatuses[index + 1] ?? null : null;
}

function CustomerFilePaymentActions({
  quote,
  busy,
  onSendPaymentLink,
  onCopyPaymentLink
}: {
  quote: CrmQuote;
  busy: boolean;
  onSendPaymentLink?: (quote: CrmQuote, channel: PaymentLinkChannel) => void;
  onCopyPaymentLink?: (quote: CrmQuote) => void;
}) {
  if (!onSendPaymentLink && !onCopyPaymentLink) return null;
  const label = quote.quote_number || "quote";
  const paymentUrl = customerFilePaymentUrl(quote);
  return (
    <div className="crm-customer-pay-actions" role="group" aria-label={`Payment link actions for ${label}`}>
      {paymentUrl ? (
        <a className="crm-customer-action-link crm-customer-payment-link" href={paymentUrl} target="_blank" rel="noreferrer">
          Payment link
        </a>
      ) : null}
      {onSendPaymentLink ? (
        <>
          <button
            type="button"
            className="crm-customer-action-link"
            disabled={busy}
            onClick={() => onSendPaymentLink(quote, "email")}
          >
            Email pay link
          </button>
          <button
            type="button"
            className="crm-customer-action-link"
            disabled={busy}
            onClick={() => onSendPaymentLink(quote, "sms")}
          >
            Text pay link
          </button>
        </>
      ) : null}
      {onCopyPaymentLink ? (
        <button
          type="button"
          className="crm-customer-action-link"
          disabled={busy}
          onClick={() => onCopyPaymentLink(quote)}
        >
          Copy pay link
        </button>
      ) : null}
    </div>
  );
}

function CustomerFilesView({
  files,
  activeStatus,
  focusCustomer,
  onFocusHandled,
  onDelete,
  onSendPaymentLink,
  onCopyPaymentLink,
  onStatusChange,
  onSaveRow,
  onSaveJob,
  busy = false
}: {
  files: CrmCustomerFile[];
  activeStatus?: JobStatusFilter;
  focusCustomer?: string | null;
  onFocusHandled?: () => void;
  onDelete?: (file: CrmCustomerFile) => void;
  onSendPaymentLink?: (quote: CrmQuote, channel: PaymentLinkChannel) => void;
  onCopyPaymentLink?: (quote: CrmQuote) => void;
  onStatusChange?: (job: CrmJob, status: CrmJobStatus) => void;
  onSaveRow?: (row: CrmBookkeepingRow, patch: Record<string, unknown>, message?: string) => Promise<boolean>;
  onSaveJob?: (job: CrmJob, patch: Record<string, unknown>, message?: string) => Promise<boolean>;
  busy?: boolean;
}) {
  const canViewMikeFinancials = files.some((file) => file.bookkeepingRows.some((row) => Object.hasOwn(row, "mikeProfit")));
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<CustomerFileFilter | null>(null);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const rowMoneyEditor = (
    row: CrmBookkeepingRow,
    label: string,
    value: number | null | undefined,
    patch: (amount: number) => Record<string, unknown>,
    message: string
  ): DrillInlineEditor | undefined =>
    onSaveRow
      ? {
          type: "number",
          value: value ? String(value) : "",
          disabled: busy,
          ariaLabel: label,
          onSave: (next) => onSaveRow(row, patch(roundCurrency(Number(next || 0))), message)
        }
      : undefined;
  const rowTextEditor = (
    row: CrmBookkeepingRow,
    label: string,
    value: string | null | undefined,
    patch: (next: string) => Record<string, unknown>,
    message: string
  ): DrillInlineEditor | undefined =>
    onSaveRow
      ? {
          value: value || "",
          disabled: busy,
          ariaLabel: label,
          onSave: (next) => onSaveRow(row, patch(next.trim()), message)
        }
      : undefined;
  const jobFieldEditor = (
    job: CrmJob,
    label: string,
    value: string | null | undefined,
    key: keyof CrmJob & string,
    message: string,
    options: { type?: "text" | "email"; autocomplete?: "address" } = {}
  ): DrillInlineEditor | undefined =>
    onSaveJob
      ? {
          type: options.type,
          autocomplete: options.autocomplete,
          value: value || "",
          disabled: busy,
          ariaLabel: label,
          onSave: (next) => onSaveJob(job, { [key]: next.trim() || null }, message)
        }
      : undefined;
  const rowCogsPatch = (row: CrmBookkeepingRow) => (amount: number) =>
    row.source === "crm_quote" ? { materials_cost: amount } : { cogs_amount: amount };
  const rowTotalPatch = (row: CrmBookkeepingRow) => (amount: number) =>
    row.source === "crm_quote"
      ? { quote_total: amount, manual_total_override: true }
      : { total_amount: amount };
  const sortedFiles = useMemo(
    () =>
      [...files].sort((a, b) => {
        const dateDelta = dateSortValue(b.latestSoldDate) - dateSortValue(a.latestSoldDate);
        return dateDelta || a.customerName.localeCompare(b.customerName);
      }),
    [files]
  );
  const statusFilteredFiles = useMemo(
    () => sortedFiles.filter((file) => customerFileMatchesStatus(file, activeStatus ?? null)),
    [activeStatus, sortedFiles]
  );
  const searchedFiles = useMemo(
    () =>
      normalizedSearch
        ? statusFilteredFiles.filter((file) => customerFileSearchText(file).includes(normalizedSearch))
        : statusFilteredFiles,
    [normalizedSearch, statusFilteredFiles]
  );
  const visibleFiles = useMemo(
    () => (activeFilter ? searchedFiles.filter((file) => customerFileMatchesFilter(file, activeFilter)) : searchedFiles),
    [activeFilter, searchedFiles]
  );
  const filterCounts = useMemo(
    () =>
      new Map<CustomerFileFilter, number>(
        customerFileFilters.map((filter) => [
          filter.value,
          searchedFiles.filter((file) => customerFileMatchesFilter(file, filter.value)).length
        ])
      ),
    [searchedFiles]
  );

  useEffect(() => {
    if (!focusCustomer) return;
    const normalized = normalizeCustomerName(focusCustomer);
    const target = files.find((file) => normalizeCustomerName(file.customerName) === normalized);
    setHighlighted(normalized);
    if (target) {
      const node = document.getElementById(customerCardDomId(target.customerName));
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    onFocusHandled?.();
    const timer = window.setTimeout(() => setHighlighted(null), 2400);
    return () => window.clearTimeout(timer);
  }, [focusCustomer, files, onFocusHandled]);

  return (
    <section className="crm-customer-files">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Customer Files</p>
          <h2>{statusLabel(activeStatus ?? null)} Customer Files</h2>
        </div>
        <strong>{visibleFiles.length}</strong>
      </div>
      <div className="crm-customer-search" role="search" aria-label="Search customer files">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search customers: name, phone, address, city, product, quote #..."
          aria-label="Search customer files"
        />
        {search ? (
          <button type="button" className="crm-ghost-button" onClick={() => setSearch("")}>
            Clear
          </button>
        ) : null}
        <span>
          {normalizedSearch
            ? `${searchedFiles.length} of ${statusFilteredFiles.length} customers`
            : `${statusFilteredFiles.length} customers`}
        </span>
      </div>
      <div className="crm-customer-filter-bar" aria-label="Customer lifecycle filters">
        <button type="button" className={!activeFilter ? "active" : ""} aria-pressed={!activeFilter} onClick={() => setActiveFilter(null)}>
          All
          <span>{searchedFiles.length}</span>
        </button>
        {customerFileFilters.map((filter) => (
          <button
            type="button"
            className={activeFilter === filter.value ? "active" : ""}
            aria-pressed={activeFilter === filter.value}
            onClick={() => setActiveFilter(filter.value)}
            key={filter.value}
          >
            {filter.label}
            <span>{filterCounts.get(filter.value) || 0}</span>
          </button>
        ))}
      </div>
      <div className="crm-customer-table-wrap" role="region" aria-label="Customer file rows" tabIndex={0}>
        <table className="crm-customer-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Sale</th>
              <th>Deposit</th>
              <th>Balance</th>
              <th>COGS</th>
              <th>Paid</th>
              <th>Expenses</th>
              <th>Install</th>
              <th>Ken</th>
              <th>Jessica</th>
              {canViewMikeFinancials ? <th>Mike</th> : null}
              <th>Email</th>
              <th>City</th>
              <th>Product</th>
              <th>Sold</th>
              <th>Docs</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
        {visibleFiles.map((file) => {
          const sortedBookkeepingRows = [...file.bookkeepingRows].sort((a, b) => {
            const dateDelta = dateSortValue(b.soldDate) - dateSortValue(a.soldDate);
            return dateDelta || (a.quoteNumber || a.source).localeCompare(b.quoteNumber || b.source);
          });
          const sortedJobs = [...file.jobs].sort((a, b) => {
            const dateDelta = dateSortValue(b.appointment_start || b.created_at) - dateSortValue(a.appointment_start || a.created_at);
            return dateDelta || a.customer_name.localeCompare(b.customer_name);
          });
          const sortedQuotes = [...file.quotes].sort((a, b) => {
            const dateDelta =
              dateSortValue(b.sold_at || b.approved_at || b.ordered_at || b.received_at || b.installed_at || b.created_at) -
              dateSortValue(a.sold_at || a.approved_at || a.ordered_at || a.received_at || a.installed_at || a.created_at);
            return dateDelta || (a.quote_number || a.id).localeCompare(b.quote_number || b.id);
          });
          const totals = sortedBookkeepingRows.reduce(
            (sum, row) => ({
              total: sum.total + row.total,
              depositDue: sum.depositDue + row.depositDue,
              depositPaid: sum.depositPaid + row.depositPaid,
              paid: sum.paid + row.paidTotal,
              balance: sum.balance + Math.max(row.balance, 0),
              cogs: sum.cogs + row.cogs,
              expenses: sum.expenses + row.expensesTotal,
              remake: sum.remake + row.remakeTotal,
              installation: sum.installation + (row.isInstallationComplete ? row.installationInvoiceAmount : 0),
              installInvoiced: sum.installInvoiced + row.installationInvoiceAmount,
              ken: sum.ken + row.kenCut,
              jessica: sum.jessica + row.jessicaCommission,
              jessicaOwed: sum.jessicaOwed + row.jessicaCommissionOwed,
              mike: canViewMikeFinancials ? sum.mike + row.mikeProfit : 0
            }),
            {
              total: 0,
              depositDue: 0,
              depositPaid: 0,
              paid: 0,
              balance: 0,
              cogs: 0,
              expenses: 0,
              remake: 0,
              installation: 0,
              installInvoiced: 0,
              ken: 0,
              jessica: 0,
              jessicaOwed: 0,
              mike: 0
            }
          );
          const primaryRow = sortedBookkeepingRows[0] || null;
          const primaryJob = sortedJobs[0] || null;
          const phoneHref = customerFilePhoneHref(file.phone);
          const mailHref = file.email ? `mailto:${file.email}` : null;
          const primaryPaymentQuote = sortedQuotes.find((quote) => quote.share_token) || sortedQuotes[0] || null;
          const primaryQuoteUrl = primaryPaymentQuote ? customerFileQuoteUrl(primaryPaymentQuote) : null;
          const productSummary = file.products.length
            ? customerFileDetailLine([
                `${file.products.reduce((sum, product) => sum + (product.quantity || 0), 0)} items`,
                Array.from(new Set(file.products.map((product) => product.product_type).filter(Boolean))).join(", ")
              ])
            : Array.from(new Set(sortedJobs.map((job) => job.product_interest).filter(Boolean))).join(", ");
          const noteSummary = file.notes.join(" · ");
          const saleValue = totals.total || file.lifetimeValue;
          const balanceValue = totals.balance;
          const fileNeedsOrder = sortedBookkeepingRows.some(rowNeedsOrder);
          const fileDepositMissing = sortedBookkeepingRows.some((row) => rowDepositShortfall(row) > 0);
          const fileBalanceMissing = sortedBookkeepingRows.some((row) => rowBalanceShortfall(row) > 0);
          const fileCogsMissing = sortedBookkeepingRows.some(rowMissingCogs);
          const fileInstallMissing = sortedBookkeepingRows.some(rowMissingInstallInvoice);
          const fileHasMissingWork = fileNeedsOrder || fileDepositMissing || fileBalanceMissing || fileCogsMissing || fileInstallMissing;
          const fileMissingPhone = fileHasMissingWork && !(file.phone || primaryJob?.phone);
          const fileMissingAddress = fileHasMissingWork && !(file.address || primaryJob?.address);
          const fileMissingEmail = fileHasMissingWork && !(file.email || primaryJob?.email);
          const fileMissingCity = fileHasMissingWork && !(file.city || primaryJob?.city);
          const fileMissingProduct = fileHasMissingWork && !productSummary;
          const fileMissingSoldDate = fileHasMissingWork && !(primaryRow?.soldDate || file.latestSoldDate);

          const isFocused = highlighted === normalizeCustomerName(file.customerName);
          const focusClassName = isFocused ? "crm-focus" : "";

          return (
            <Fragment key={file.id}>
              <tr className={`crm-customer-info-row ${focusClassName}${fileHasMissingWork ? " crm-customer-info-row--missing" : ""}`} id={customerCardDomId(file.customerName)}>
                <td className="crm-customer-name-cell">
                  <div className="crm-cf-name" title={`${file.customerName} · ${file.latestStatus || "Open"}`}>
                    <h3>{file.customerName}</h3>
                    <p>{file.latestStatus || "Open"}</p>
                  </div>
                </td>
                <td className={`crm-cf-td${fileMissingPhone ? " crm-missing-data" : ""}`}>
                  <InlineEditableValue
                    value={file.phone || "Pending"}
                    editor={primaryJob ? jobFieldEditor(primaryJob, "Edit phone", file.phone || primaryJob.phone, "phone", "Phone updated.") : undefined}
                    className="crm-cf-text"
                  />
                </td>
                <td className={`crm-cf-td wide${fileMissingAddress ? " crm-missing-data" : ""}`}>
                  <InlineEditableValue
                    value={file.address || "Pending"}
                    editor={
                      primaryJob
                        ? jobFieldEditor(primaryJob, "Edit address", file.address || primaryJob.address, "address", "Address updated.", { autocomplete: "address" })
                        : undefined
                    }
                    className="crm-cf-text"
                  />
                </td>
                <td className="crm-cf-td money">
                  <InlineEditableValue
                    value={toCurrency(saleValue)}
                    editor={
                      primaryRow
                        ? rowMoneyEditor(primaryRow, "Edit sale total", primaryRow.total, rowTotalPatch(primaryRow), "Total updated.")
                        : primaryJob && onSaveJob
                          ? {
                              type: "number",
                              value: primaryJob.estimated_total ? String(primaryJob.estimated_total) : "",
                              disabled: busy,
                              ariaLabel: "Edit estimated total",
                              onSave: (next) => onSaveJob(primaryJob, { estimated_total: roundCurrency(Number(next || 0)) }, "Total updated.")
                            }
                          : undefined
                    }
                    className="crm-cf-money"
                  />
                </td>
                <td className={`crm-cf-td money${fileDepositMissing ? " crm-missing-data" : ""}`}>
                  <span className="crm-cf-pair">
                    <InlineEditableValue
                      value={`${toCurrency(totals.depositPaid)}${paymentMethodSuffix(primaryRow?.depositPaymentType)}`}
                      editor={
                        primaryRow
                          ? rowMoneyEditor(
                              primaryRow,
                              "Edit deposit paid",
                              primaryRow.depositPaid,
                              (amount) => ({
                                deposit_paid_target: amount,
                                payment_type: paymentTypeDefault(primaryRow.depositPaymentType, primaryRow.paymentType),
                                paid_at: todayInputValue()
                              }),
                              "Deposit paid updated."
                            )
                          : undefined
                      }
                      className="crm-cf-money"
                    />
                    <span className="crm-cf-sep">/</span>
                    <InlineEditableValue
                      value={toCurrency(totals.depositDue)}
                      editor={
                        primaryRow
                          ? rowMoneyEditor(primaryRow, "Edit deposit due", primaryRow.depositDue, (amount) => ({ deposit_required: amount }), "Deposit due updated.")
                          : undefined
                      }
                      className="crm-cf-money"
                    />
                  </span>
                </td>
                <td className={`crm-cf-td money${fileBalanceMissing ? " crm-missing-data" : ""}`}>
                  <InlineEditableValue
                    value={toCurrency(balanceValue)}
                    editor={
                      primaryRow
                        ? rowMoneyEditor(primaryRow, "Edit balance due", Math.max(primaryRow.balance, 0), (amount) => ({ balance_due_target: amount }), "Balance updated.")
                        : undefined
                    }
                    className={`crm-cf-money${balanceValue > 0 ? " warn" : ""}`}
                  />
                </td>
                <td className={`crm-cf-td money${fileCogsMissing ? " crm-missing-data" : ""}`}>
                  <InlineEditableValue
                    value={totals.cogs > 0 ? toCurrency(totals.cogs) : "Missing"}
                    editor={primaryRow ? rowMoneyEditor(primaryRow, "Edit COGS", primaryRow.cogs, rowCogsPatch(primaryRow), "COGS updated.") : undefined}
                    className={`crm-cf-money${totals.cogs <= 0 && saleValue > 0 ? " warn" : ""}`}
                  />
                </td>
                <td className="crm-cf-td money">
                  <span className="crm-cf-money">{toCurrency(totals.paid)}</span>
                </td>
                <td className="crm-cf-td money">
                  <span className="crm-cf-money">
                    {toCurrency(totals.expenses)}
                    {totals.remake > 0 ? ` + ${toCurrency(totals.remake)} rmk` : ""}
                  </span>
                </td>
                <td className={`crm-cf-td money${fileInstallMissing ? " crm-missing-data" : ""}`}>
                  <InlineEditableValue
                    value={toCurrency(totals.installInvoiced)}
                    editor={
                      primaryRow
                        ? rowMoneyEditor(primaryRow, "Edit installation amount", primaryRow.installationInvoiceAmount, (amount) => ({ installation_invoice_amount: amount }), "Installation amount updated.")
                        : undefined
                    }
                    className="crm-cf-money"
                  />
                </td>
                <td className="crm-cf-td money">
                  <InlineEditableValue
                    value={toCurrency(totals.ken)}
                    editor={
                      primaryRow && onSaveRow
                        ? {
                            type: "number",
                            value: kenCutOverrideInputValue(primaryRow.kenCutOverride),
                            disabled: busy,
                            ariaLabel: "Edit Ken cut override (blank uses automatic 10%)",
                            onSave: (next) =>
                              onSaveRow(
                                primaryRow,
                                { ken_cut_override: normalizeKenCutOverrideInput(next) },
                                "Ken cut updated."
                              )
                          }
                        : undefined
                    }
                    className="crm-cf-money"
                  />
                </td>
                <td className="crm-cf-td money">
                  <span className={`crm-cf-money${totals.jessicaOwed > 0 ? " warn" : ""}`}>
                    {toCurrency(totals.jessica)}
                    {totals.jessicaOwed > 0 ? " owed" : ""}
                  </span>
                </td>
                {canViewMikeFinancials ? (
                  <td className="crm-cf-td money">
                    <span className="crm-cf-money">{toCurrency(totals.mike)}</span>
                  </td>
                ) : null}
                <td className={`crm-cf-td${fileMissingEmail ? " crm-missing-data" : ""}`}>
                  <InlineEditableValue
                    value={file.email || "Pending"}
                    editor={
                      primaryJob ? jobFieldEditor(primaryJob, "Edit email", file.email || primaryJob.email, "email", "Email updated.", { type: "email" }) : undefined
                    }
                    className="crm-cf-text"
                  />
                </td>
                <td className={`crm-cf-td${fileMissingCity ? " crm-missing-data" : ""}`}>
                  <InlineEditableValue
                    value={file.city || "Pending"}
                    editor={primaryJob ? jobFieldEditor(primaryJob, "Edit city", file.city || primaryJob.city, "city", "City updated.") : undefined}
                    className="crm-cf-text"
                  />
                </td>
                <td className={`crm-cf-td wide${fileMissingProduct ? " crm-missing-data" : ""}`}>
                  <span className="crm-cf-text" title={productSummary || undefined}>
                    {productSummary || "Pending"}
                  </span>
                </td>
                <td className={`crm-cf-td${fileMissingSoldDate ? " crm-missing-data" : ""}`}>
                  <InlineEditableValue
                    value={formatShortDate(primaryRow?.soldDate || file.latestSoldDate)}
                    editor={
                      primaryRow && onSaveRow
                        ? {
                            type: "date",
                            value: dateInputValue(primaryRow.soldDate || file.latestSoldDate),
                            disabled: busy,
                            ariaLabel: "Edit sold date",
                            onSave: (next) =>
                              onSaveRow(
                                primaryRow,
                                primaryRow.source === "crm_quote" ? { sold_at: next || null } : { sold_date: next || null },
                                "Sold date updated."
                              )
                          }
                        : undefined
                    }
                    className="crm-cf-text"
                  />
                </td>
                <td className="crm-cf-td">
                  <span className="crm-cf-doc-links">
                    {primaryQuoteUrl ? (
                      <a href={primaryQuoteUrl} target="_blank" rel="noreferrer">
                        Quote
                      </a>
                    ) : null}
                    {file.contracts.slice(0, 1).map((contract) => {
                      const url = contractUrl(contract);
                      return url ? (
                        <a href={url} target="_blank" rel="noreferrer" key={`contract-link-${contract.id}`}>
                          Contract
                        </a>
                      ) : (
                        <span key={`contract-link-${contract.id}`}>{contract.title}</span>
                      );
                    })}
                    {!file.contracts.length && !primaryQuoteUrl ? <span className="crm-customer-empty-text">None</span> : null}
                  </span>
                </td>
                <td className="crm-cf-td wide">
                  <InlineEditableValue
                    value={noteSummary || "None"}
                    editor={primaryJob ? jobFieldEditor(primaryJob, "Edit notes", primaryJob.notes, "notes", "Notes updated.") : undefined}
                    className="crm-cf-text"
                  />
                </td>
              </tr>
              <tr className={`crm-customer-action-row ${focusClassName}`}>
                <td className="crm-customer-name-cell crm-cf-action-lead">
                  <span>Actions</span>
                </td>
                <td className="crm-customer-action-cell" colSpan={canViewMikeFinancials ? 18 : 17}>
                  <div className="crm-customer-action-strip">
                    {sortedJobs.map((job) => {
                      const measure = getMeasureNeededMeta(job.meta) as Record<string, unknown>;
                      const savedForms = Array.isArray(measure.forms)
                        ? measure.forms.flatMap((value) => value && typeof value === "object" && !Array.isArray(value) ? [value as Record<string, unknown>] : [])
                        : [];
                      const forms = savedForms.length ? savedForms : (typeof measure.form_id === "string" ? [{ id: measure.form_id, status: measure.form_status }] : []);
                      return forms.map((savedForm, index) => typeof savedForm.id === "string" ? (
                        <a
                          className="crm-customer-status-button"
                          href={`/crm/measure/${savedForm.id}`}
                          key={`measure-link-${job.id}-${savedForm.id}`}
                        >
                          {savedForm.status === "submitted" ? "View Technical Measure" : `Technical Measure${forms.length > 1 ? ` ${index + 1}` : ""}`}
                        </a>
                      ) : null);
                    })}
                    {sortedJobs.map((job) => {
                      const nextStatus = nextJobStatus(job.status);
                      return (
                        <div className="crm-cf-track" key={`job-track-${job.id}`}>
                          <span className="crm-cf-track-label" title={customerFileDetailLine([job.product_interest || "Job", job.sales_owner]) || "Job"}>
                            {job.product_interest || "Job"}
                            {job.sales_owner && job.sales_owner !== "Unassigned" ? ` · ${job.sales_owner}` : ""}
                          </span>
                          {jobColumns.map((column) => {
                            const isActive = job.status === column.status;
                            const isNext = nextStatus === column.status;
                            return (
                              <button
                                type="button"
                                className={`crm-customer-status-button${isActive ? " active" : ""}${isNext ? " next" : ""}`}
                                aria-current={isActive ? "step" : undefined}
                                disabled={busy || !onStatusChange || isActive}
                                onClick={() => onStatusChange?.(job, column.status)}
                                key={column.status}
                              >
                                {column.label}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                    {sortedBookkeepingRows.map((row) => {
                      const {
                        depositShortfall,
                        balanceShortfall,
                        balancePaidTarget,
                        openBalance
                      } = paymentControlAmounts({
                        total: row.total || 0,
                        depositDue: row.depositDue || 0,
                        depositPaid: row.depositPaid || 0,
                        balancePaid: row.balancePaid || 0,
                        openBalance: row.balance || 0
                      });
                      const rowNeedsOrderHighlight = rowNeedsOrder(row);
                      const rowDepositMissingHighlight = rowDepositShortfall(row) > 0;
                      const rowBalanceMissingHighlight = rowBalanceShortfall(row) > 0;
                      const rowCogsMissingHighlight = rowMissingCogs(row);
                      const rowManufacturerMissingHighlight = rowMissingManufacturer(row);
                      const rowOrderRefMissingHighlight = rowMissingOrderRef(row);
                      const rowInstallMissingHighlight = rowMissingInstallInvoice(row);
                      const rowPaymentType = row.paymentType || "other";
                      const depositPaymentType = paymentTypeDefault(row.depositPaymentType, rowPaymentType);
                      const balancePaymentType = paymentTypeDefault(row.balancePaymentType, rowPaymentType);
                      const paidAt = todayInputValue();
                      const rowLabel = row.quoteNumber || row.source.replace("_", " ");
                      const markPaidPatch = {
                        payment_type: rowPaymentType,
                        paid_at: paidAt,
                        ...(depositShortfall > 0 ? { deposit_paid_target: row.depositDue } : {}),
                        ...(balanceShortfall > 0 ? { balance_paid_target: balancePaidTarget } : {}),
                        mark_balance_paid: true,
                        ...(row.source === "crm_quote" ? { status: "paid" } : {})
                      };
                      return (
                        <div className={`crm-cf-seg${rowNeedsOrderHighlight || rowDepositMissingHighlight || rowBalanceMissingHighlight || rowCogsMissingHighlight || rowInstallMissingHighlight ? " crm-cf-seg--missing" : ""}`} key={`money-${row.source}-${row.id}`}>
                          <span className="crm-cf-seg-label" title={rowLabel}>
                            {rowLabel}
                          </span>
                          {row.source === "crm_quote" && onSaveRow ? (
                            <select
                              className="crm-cf-select"
                              value={String(row.status || "sold")}
                              disabled={busy}
                              aria-label={`Status for ${rowLabel}`}
                              onChange={(event) => void onSaveRow(row, { status: event.target.value }, "Status updated.")}
                            >
                              {crmQuoteStatuses.map((status) => (
                                <option value={status} key={status}>
                                  {titleCase(status)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="crm-cf-seg-status">{bookkeepingStatusLabel(row)}</span>
                          )}
                          {rowNeedsOrderHighlight ? (
                            <>
                              <span className={`crm-cf-chip${rowManufacturerMissingHighlight ? " crm-cf-chip--missing" : ""}`}>
                                <strong>Mfr</strong>
                                <InlineEditableValue
                                  value={row.manufacturerName || "Missing"}
                                  editor={rowTextEditor(row, `Edit manufacturer for ${rowLabel}`, row.manufacturerName, (value) => ({ manufacturer_name: value }), "Manufacturer updated.")}
                                />
                              </span>
                              <span className={`crm-cf-chip${rowOrderRefMissingHighlight ? " crm-cf-chip--missing" : ""}`}>
                                <strong>Order #</strong>
                                <InlineEditableValue
                                  value={row.manufacturerOrderRef || "Missing"}
                                  editor={rowTextEditor(row, `Edit order number for ${rowLabel}`, row.manufacturerOrderRef, (value) => ({ manufacturer_order_ref: value }), "Order number updated.")}
                                />
                              </span>
                            </>
                          ) : null}
                          <span className="crm-cf-chip">
                            <strong>Total</strong>
                            <InlineEditableValue
                              value={toLedgerCurrency(row.total)}
                              editor={rowMoneyEditor(row, `Edit total for ${rowLabel}`, row.total, rowTotalPatch(row), "Total updated.")}
                            />
                          </span>
                          <span className={`crm-cf-chip${rowCogsMissingHighlight ? " crm-cf-chip--missing" : ""}`}>
                            <strong>COGS</strong>
                            <InlineEditableValue
                              value={row.cogs > 0 ? toLedgerCurrency(row.cogs) : "Missing"}
                              editor={rowMoneyEditor(row, `Edit COGS for ${rowLabel}`, row.cogs, rowCogsPatch(row), "COGS updated.")}
                            />
                          </span>
                          <span className={`crm-cf-chip${rowDepositMissingHighlight ? " crm-cf-chip--missing" : ""}`}>
                            <strong>Dep</strong>
                            <InlineEditableValue
                              value={ledgerCurrencyWithPaymentType(row.depositPaid, row.depositPaymentType)}
                              editor={rowMoneyEditor(
                                row,
                                `Edit deposit paid for ${rowLabel}`,
                                row.depositPaid,
                                (amount) => ({ deposit_paid_target: amount, payment_type: depositPaymentType, paid_at: paidAt }),
                                "Deposit paid updated."
                              )}
                            />
                            <span className="crm-cf-sep">/</span>
                            <InlineEditableValue
                              value={toLedgerCurrency(row.depositDue)}
                              editor={rowMoneyEditor(row, `Edit deposit due for ${rowLabel}`, row.depositDue, (amount) => ({ deposit_required: amount }), "Deposit due updated.")}
                            />
                          </span>
                          <span className={`crm-cf-chip${rowBalanceMissingHighlight ? " crm-cf-chip--missing" : ""}`}>
                            <strong>Bal Paid</strong>
                            <InlineEditableValue
                              value={ledgerCurrencyWithPaymentType(row.balancePaid, row.balancePaymentType)}
                              editor={rowMoneyEditor(
                                row,
                                `Edit balance paid for ${rowLabel}`,
                                row.balancePaid,
                                (amount) => ({ balance_paid_target: amount, payment_type: balancePaymentType, paid_at: paidAt }),
                                "Balance paid updated."
                              )}
                            />
                          </span>
                          <span className={`crm-cf-chip${rowBalanceMissingHighlight ? " crm-cf-chip--missing" : ""}`}>
                            <strong>Owes</strong>
                            <span className={openBalance > 0 ? "warn" : undefined}>{toLedgerCurrency(openBalance)}</span>
                          </span>
                          {rowInstallMissingHighlight ? (
                            <span className="crm-cf-chip crm-cf-chip--missing">
                              <strong>Install</strong>
                              <InlineEditableValue
                                value={row.installationInvoiceAmount > 0 ? toLedgerCurrency(row.installationInvoiceAmount) : "Missing"}
                                editor={rowMoneyEditor(row, `Edit installation amount for ${rowLabel}`, row.installationInvoiceAmount, (amount) => ({ installation_invoice_amount: amount }), "Installation amount updated.")}
                              />
                            </span>
                          ) : null}
                          <span className="crm-cf-chip crm-cf-chip--add">
                            <InlineEditableValue
                              value="+ Payment"
                              editor={
                                onSaveRow
                                  ? {
                                      type: "number",
                                      value: "",
                                      disabled: busy,
                                      ariaLabel: `Add payment for ${rowLabel}`,
                                      onSave: (next) => {
                                        const amount = roundCurrency(Number(next || 0));
                                        if (!amount || amount <= 0) return Promise.resolve(false);
                                        return onSaveRow(
                                          row,
                                          {
                                            payment_amount: amount,
                                            payment_label: "Balance payment",
                                            payment_type: rowPaymentType,
                                            paid_at: paidAt
                                          },
                                          "Payment recorded."
                                        );
                                      }
                                    }
                                  : undefined
                              }
                            />
                          </span>
                          {onSaveRow ? (
                            <select
                              className="crm-cf-select"
                              value={rowPaymentType}
                              disabled={busy}
                              aria-label={`Payment type for ${rowLabel}`}
                              onChange={(event) => void onSaveRow(row, { payment_type: event.target.value }, "Payment type updated.")}
                            >
                              {paymentTypes.map((item) => (
                                <option value={item.value} key={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          {onSaveRow && depositShortfall > 0 ? (
                            <CustomerFilePaymentMethodAction
                              label="Pay Deposit"
                              amountLabel={toLedgerCurrency(depositShortfall)}
                              defaultValue={depositPaymentType}
                              disabled={busy}
                              onSelect={(paymentType) =>
                                void onSaveRow(
                                  row,
                                  { deposit_paid_target: row.depositDue, payment_type: paymentType, paid_at: paidAt },
                                  "Deposit paid."
                                )
                              }
                            />
                          ) : null}
                          {onSaveRow && balanceShortfall > 0 ? (
                            <CustomerFilePaymentMethodAction
                              label="Pay Balance"
                              amountLabel={toLedgerCurrency(balanceShortfall)}
                              defaultValue={balancePaymentType}
                              disabled={busy}
                              onSelect={(paymentType) =>
                                void onSaveRow(
                                  row,
                                  {
                                    balance_paid_target: balancePaidTarget,
                                    payment_type: paymentType,
                                    paid_at: paidAt,
                                    ...(depositShortfall <= 0 ? { mark_balance_paid: true } : {}),
                                    ...(depositShortfall <= 0 && row.source === "crm_quote" ? { status: "paid" } : {})
                                  },
                                  "Balance paid."
                                )
                              }
                            />
                          ) : null}
                          {onSaveRow && openBalance > 0 ? (
                            <button
                              type="button"
                              className="crm-customer-action-link crm-customer-payment-link"
                              disabled={busy}
                              onClick={() => void onSaveRow(row, markPaidPatch, "Job marked paid.")}
                            >
                              Mark Paid
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    <div className="crm-cf-seg crm-cf-seg--contact">
                      {phoneHref ? (
                        <a href={phoneHref} className="crm-customer-action-link">
                          Call
                        </a>
                      ) : null}
                      {mailHref ? (
                        <a href={mailHref} className="crm-customer-action-link">
                          Email
                        </a>
                      ) : null}
                      {primaryPaymentQuote ? (
                        <CustomerFilePaymentActions
                          quote={primaryPaymentQuote}
                          busy={busy}
                          onSendPaymentLink={onSendPaymentLink}
                          onCopyPaymentLink={onCopyPaymentLink}
                        />
                      ) : null}
                      {onDelete ? (
                        <button
                          type="button"
                          className="crm-ghost-button crm-delete-button crm-customer-delete-button"
                          disabled={busy}
                          onClick={() => onDelete(file)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                    {!sortedJobs.length && !sortedBookkeepingRows.length && !phoneHref && !mailHref && !primaryPaymentQuote && !onDelete ? (
                      <span className="crm-customer-empty-text">No actions yet.</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            </Fragment>
          );
        })}
          </tbody>
        </table>
      </div>
      {!files.length ? <p className="crm-empty">No customer files yet. Bookkeeping rows will appear here automatically.</p> : null}
      {files.length && !visibleFiles.length ? (
        <p className="crm-empty">
          No customer files match{" "}
          {normalizedSearch ? `"${search.trim()}"` : activeFilter ? "this lifecycle filter" : statusLabel(activeStatus ?? null).toLowerCase()}.
        </p>
      ) : null}
    </section>
  );
}

function SnapshotColumn({
  title,
  rows,
  empty
}: {
  title: string;
  rows: CrmBookkeepingRow[];
  empty: string;
}) {
  return (
    <div className="crm-snapshot-column">
      <h3>{title}</h3>
      {rows.map((row) => (
        <article key={`${title}-${row.id}`}>
          <strong>{row.customerName}</strong>
          <span>{customerFileDetailLine([row.customerPhone, row.manufacturerName || row.manufacturerOrderRef || formatShortDate(row.soldDate)])}</span>
          <em>{row.balance > 0 ? toCurrency(row.balance) : bookkeepingStatusLabel(row)}</em>
        </article>
      ))}
      {!rows.length ? <p>{empty}</p> : null}
    </div>
  );
}

function JobCard({
  job,
  onStatusChange,
  onMeasureNeededAction,
  onSave,
  onDelete,
  busy
}: {
  job: CrmJob;
  onStatusChange: (job: CrmJob, status: CrmJobStatus) => void;
  onMeasureNeededAction: (job: CrmJob, action: MeasureNeededAction) => void;
  onSave: (event: FormEvent<HTMLFormElement>, job: CrmJob) => void;
  onDelete: (job: CrmJob) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const measure = getMeasureNeededMeta(job.meta);
  const measureActive = isMeasureNeededJob(job);
  const canRequestMeasure = job.status === "sold" && !measureActive;

  if (editing) {
    return (
      <article className="crm-job-card">
        <form
          className="crm-form"
          onSubmit={(event) => {
            onSave(event, job);
            setEditing(false);
          }}
        >
          <label>
            Customer
            <input name="customer_name" defaultValue={job.customer_name} />
          </label>
          <div className="crm-field-row">
            <label>
              Phone
              <input name="phone" defaultValue={job.phone} />
            </label>
            <label>
              Owner
              <select name="sales_owner" defaultValue={job.sales_owner || "Unassigned"}>
                {ownerOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Email
            <input name="email" defaultValue={job.email || ""} />
          </label>
          <div className="crm-field-row">
            <label>
              City
              <input name="city" defaultValue={job.city || ""} />
            </label>
            <label>
              Estimate
              <input name="estimated_total" type="number" min="0" step="50" defaultValue={job.estimated_total || ""} />
            </label>
          </div>
          <label>
            Address
            <AddressAutocomplete name="address" cityFieldName="city" defaultValue={job.address || ""} />
          </label>
          <label>
            Product
            <input name="product_interest" defaultValue={job.product_interest} />
          </label>
          <label>
            Lead Source
            <LeadSourceSelect defaultValue={job.lead_source} />
          </label>
          <div className="crm-field-row">
            <label>
              Next Action
              <input name="next_action" defaultValue={job.next_action || ""} />
            </label>
            <label>
              Due
              <input name="next_action_due" type="date" defaultValue={job.next_action_due || ""} />
            </label>
          </div>
          <label>
            Notes
            <textarea name="notes" rows={3} defaultValue={job.notes || ""} />
          </label>
          <div className="crm-edit-actions">
            <button type="submit" disabled={busy}>
              Save
            </button>
            <button type="button" className="crm-ghost-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="crm-ghost-button crm-delete-button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                onDelete(job);
              }}
            >
              Delete
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article className="crm-job-card">
      <div className="crm-job-card-head">
        <div>
          <h3>{job.customer_name}</h3>
          <p>{job.product_interest}</p>
        </div>
        <span>{job.priority}</span>
      </div>
      <dl>
        <div>
          <dt>Phone</dt>
          <dd>{job.phone}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{job.sales_owner}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{job.lead_source || "Unknown"}</dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>{job.next_action || "Call customer"}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{job.next_action_due || "Open"}</dd>
        </div>
        <div>
          <dt>Measure</dt>
          <dd>{measure.status ? measureNeededLabel(job) : "Not flagged"}</dd>
        </div>
      </dl>
      <div className="crm-card-footer">
        <strong>{toCurrency(job.quote_total || job.estimated_total)}</strong>
        <select className="crm-status-select" data-status={job.status} value={job.status} onChange={(event) => onStatusChange(job, event.target.value as CrmJobStatus)}>
          {crmJobStatuses.map((status) => (
            <option value={status} key={status}>
              {status.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="crm-card-actions">
        {measureActive ? (
          <button type="button" className="crm-ghost-button crm-card-edit" disabled={busy} onClick={() => onMeasureNeededAction(job, "measured")}>
            Measured
          </button>
        ) : canRequestMeasure ? (
          <button type="button" className="crm-ghost-button crm-card-edit" disabled={busy} onClick={() => onMeasureNeededAction(job, "request")}>
            Measure Needed
          </button>
        ) : null}
        <button type="button" className="crm-ghost-button crm-card-edit" onClick={() => setEditing(true)}>
          Edit details
        </button>
      </div>
    </article>
  );
}

function InstallationInvoiceInbox({
  invoices,
  rows,
  onPull,
  onSaveInvoice,
  busy
}: {
  invoices: CrmInstallationInvoiceEmail[];
  rows: CrmBookkeepingRow[];
  onPull: () => void;
  onSaveInvoice: (item: InstallationInvoiceLedgerItem, patch: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const ledger = useMemo(() => buildInstallationInvoiceLedger(rows, invoices), [rows, invoices]);
  const companyLedgers = useMemo(() => {
    const companies = new Map<string, InstallationInvoiceLedgerItem[]>();
    for (const item of ledger.items) {
      const current = companies.get(item.companyName) || [];
      current.push(item);
      companies.set(item.companyName, current);
    }
    return [...companies.entries()].map(([companyName, items]) => ({
      companyName,
      billed: roundCurrency(items.reduce((sum, item) => sum + item.amount, 0)),
      paid: roundCurrency(items.reduce((sum, item) => sum + item.paidAmount, 0)),
      open: roundCurrency(items.reduce((sum, item) => sum + item.openAmount, 0)),
      openCount: items.filter((item) => item.openAmount > 0).length
    }));
  }, [ledger.items]);
  const counts = invoices.reduce(
    (current, invoice) => {
      current[invoice.match_status] += 1;
      return current;
    },
    { matched: 0, needs_review: 0, unmatched: 0, skipped: 0, error: 0 }
  );
  const ledgerRows = ledger.items;
  const summary = [
    { label: "Open Installer Invoices", value: toLedgerCurrency(ledger.totalOpen), detail: `${ledger.openItems.length} unpaid` },
    { label: "Total Billed", value: toLedgerCurrency(ledger.totalBilled), detail: `${ledger.items.length} invoices` },
    { label: "Total Paid", value: toLedgerCurrency(ledger.totalPaid), detail: `${ledger.paidItems.length} paid` },
    { label: "Needs Review", value: String(ledger.reviewItems.length), detail: `${counts.unmatched} unmatched / ${counts.error} errors` }
  ];
  const markPaid = (item: InstallationInvoiceLedgerItem) =>
    onSaveInvoice(item, {
      installation_invoice_paid_at: todayInputValue(),
      installation_invoice_paid_amount: item.amount || item.openAmount
    });
  const reopen = (item: InstallationInvoiceLedgerItem) =>
    onSaveInvoice(item, {
      installation_invoice_paid_at: null,
      installation_invoice_paid_amount: 0,
      installation_invoice_payment_method: "",
      installation_invoice_payment_notes: ""
    });

  return (
    <section className="crm-ledger crm-installation-inbox crm-installation-ledger">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Install emails</p>
          <h2>Installation Fee Ledger</h2>
        </div>
        <button type="button" onClick={onPull} disabled={busy}>
          Pull Install Emails
        </button>
      </div>
      <div className="crm-bookkeeping-summary-grid crm-installation-ledger-summary" aria-label="Installation invoice ledger totals">
        {summary.map((card) => (
          <article className="crm-bookkeeping-summary-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <em>{card.detail}</em>
          </article>
        ))}
      </div>
      <div className="crm-installation-company-grid">
        {companyLedgers.map((company) => (
          <article className="crm-installation-company-card" key={company.companyName}>
            <div>
              <span>Installation Company</span>
              <h3>{company.companyName}</h3>
            </div>
            <strong>{toLedgerCurrency(company.open)}</strong>
            <dl>
              <div><dt>Open</dt><dd>{company.openCount} invoices</dd></div>
              <div><dt>Paid</dt><dd>{toLedgerCurrency(company.paid)}</dd></div>
              <div><dt>Lifetime billed</dt><dd>{toLedgerCurrency(company.billed)}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <div className="crm-bookkeeping-counts" aria-label="Installation email pull counts">
        <span>Matched: {counts.matched}</span>
        <span>Review: {counts.needs_review}</span>
        <span>Unmatched: {counts.unmatched}</span>
        <span>Errors: {counts.error}</span>
      </div>
      <div className="crm-bookkeeping-table-wrap">
        <table className="crm-bookkeeping-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Installation Company</th>
              <th>Customer</th>
              <th>Received</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Open</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {ledgerRows.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.invoiceUrl ? (
                    <a href={item.invoiceUrl} target="_blank" rel="noreferrer">
                      {item.invoiceNumber || "Install invoice"}
                    </a>
                  ) : (
                    item.invoiceNumber || "Install invoice"
                  )}
                  <span>{item.source === "email" ? "Gmail" : "Customer file"}</span>
                </td>
                <td><strong>{item.companyName}</strong></td>
                <td>{item.customerName || "Needs review"}</td>
                <td>{formatShortDate(item.receivedAt)}</td>
                <td>{item.amount ? toLedgerCurrency(item.amount) : "-"}</td>
                <td>
                  {item.paidAmount ? toLedgerCurrency(item.paidAmount) : "-"}
                  {item.paidAt ? <span>{formatShortDate(item.paidAt)}</span> : null}
                </td>
                <td>{item.openAmount ? toLedgerCurrency(item.openAmount) : "$0.00"}</td>
                <td>
                  <span className={`crm-bookkeeping-pill crm-bookkeeping-pill--${item.status}`}>
                    {titleCase(item.status)}
                  </span>
                </td>
                <td>{item.reason || "-"}</td>
                <td>
                  {item.status === "paid" ? (
                    <button type="button" className="crm-ledger-action-link" disabled={busy} onClick={() => void reopen(item)}>
                      Reopen
                    </button>
                  ) : item.amount > 0 ? (
                    <button type="button" className="crm-ledger-action-link" disabled={busy} onClick={() => void markPaid(item)}>
                      Mark Paid
                    </button>
                  ) : (
                    <span className="crm-bookkeeping-pill">Review</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!ledgerRows.length ? <p className="crm-empty">No install invoices recorded yet.</p> : null}
      </div>
    </section>
  );
}

function OrderCogsInbox({
  emails,
  rows,
  jobs,
  files,
  onDrill
}: {
  emails: CrmOrderCogsEmail[];
  rows: CrmBookkeepingRow[];
  jobs: CrmJob[];
  files: CrmCustomerFile[];
  onDrill: (payload: DrillPayload) => void;
}) {
  const counts = emails.reduce(
    (current, email) => {
      current[email.match_status] += 1;
      return current;
    },
    { matched: 0, needs_review: 0, unmatched: 0, skipped: 0, error: 0 }
  );
  const recent = emails.slice(0, 12);
  const allMissingRows = missingCogsRows(rows);
  const missingRows = allMissingRows.slice(0, 12);
  const cogsTotal = rows.reduce((sum, row) => sum + (row.cogs || 0), 0);
  const openMissingRow = (row: CrmBookkeepingRow) =>
    onDrill({
      title: "Missing COGS",
      subtitle: "Cost of goods not yet entered",
      metric: "missingCogs",
      placement: "summary",
      entries: rowsToEntries([row], (item) => item.total, { jobs, files })
    });

  return (
    <section className="crm-ledger crm-order-cogs-inbox">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Order COGS</p>
          <h2>805 CRM COGS History</h2>
        </div>
      </div>
      <div className="crm-bookkeeping-summary-grid crm-installation-ledger-summary">
        <article className="crm-bookkeeping-summary-card">
          <span>Missing COGS</span>
          <strong>{allMissingRows.length}</strong>
          <em>CRM rows</em>
        </article>
        <article className="crm-bookkeeping-summary-card">
          <span>COGS Recorded</span>
          <strong>{toLedgerCurrency(cogsTotal)}</strong>
          <em>{rows.filter((row) => row.cogs > 0).length} rows</em>
        </article>
      </div>
      <div className="crm-bookkeeping-table-wrap">
        <table className="crm-bookkeeping-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Sale</th>
              <th>Order</th>
              <th>COGS</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {missingRows.map((row) => (
              <tr key={bookkeepingRowKey(row)}>
                <td>
                  <strong>{row.customerName}</strong>
                  <span>{row.quoteNumber || row.source.replace("_", " ")}</span>
                </td>
                <td>{toLedgerCurrency(row.total)}</td>
                <td>{row.manufacturerOrderRef || row.manufacturerName || "Not recorded"}</td>
                <td>
                  <span className="crm-bookkeeping-pill">Missing</span>
                </td>
                <td>
                  <button type="button" className="crm-ledger-action-link" onClick={() => openMissingRow(row)}>
                    Write COGS
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!missingRows.length ? <p className="crm-empty">No CRM rows are missing COGS.</p> : null}
      </div>
      <div className="crm-bookkeeping-counts" aria-label="Order COGS history counts">
        <span>Matched: {counts.matched}</span>
        <span>Review: {counts.needs_review}</span>
        <span>Unmatched: {counts.unmatched}</span>
        <span>Errors: {counts.error}</span>
      </div>
      <div className="crm-bookkeeping-table-wrap">
        <table className="crm-bookkeeping-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((email) => (
              <tr key={email.id}>
                <td>
                  {email.email_url ? (
                    <a href={email.email_url} target="_blank" rel="noreferrer">
                      {email.extracted_order_number || email.subject || "Gmail order"}
                    </a>
                  ) : (
                    email.extracted_order_number || email.subject || "Gmail order"
                  )}
                  <span>{formatShortDate(email.sent_at || email.processed_at)}</span>
                </td>
                <td>{email.extracted_customer_name || "Needs review"}</td>
                <td>{email.extracted_order_amount ? toLedgerCurrency(email.extracted_order_amount) : "-"}</td>
                <td>
                  <span className={`crm-bookkeeping-pill crm-bookkeeping-pill--${email.match_status}`}>
                    {titleCase(email.match_status)}
                  </span>
                </td>
                <td>{email.match_reason || email.error_message || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!recent.length ? <p className="crm-empty">No order COGS emails processed yet.</p> : null}
      </div>
    </section>
  );
}

const paymentPeople: CrmPaymentPerson[] = ["ken", "mike", "jessica"];

function paymentPersonDisplayName(person: CrmPaymentPerson) {
  if (person === "ken") return "Ken";
  if (person === "jessica") return "Jessica";
  return "Mike";
}

function paymentStateDisplay(state: CrmPartnerPaymentLedgerItem["paymentState"]) {
  if (state === "partial") return "Partial";
  if (state === "paid") return "Paid";
  return "Unpaid";
}

function kenPaymentStateDisplay(item: CrmPartnerPaymentLedgerItem) {
  if (item.paymentState === "partial") return "Partially paid";
  if (item.paymentState === "paid") return "Paid";
  return "Payable";
}

function jobPaymentStateDisplay(item: CrmDashboardData["partnerPaymentLedger"]["people"]["jessica"]["jobItems"][number]) {
  if (item.paymentState === "partial") return "Partially paid";
  if (item.paymentState === "paid") return "Paid";
  if (item.holdReason === "job_not_completed") return "Future - job not completed";
  if (item.holdReason === "installer_invoice") return "Held - installation cost required";
  if (item.holdReason === "no_profit") return "No profit payable";
  return "Payable";
}

type JessicaJobLedgerItem = CrmDashboardData["partnerPaymentLedger"]["people"]["jessica"]["jobItems"][number];

function JessicaJobLedgerTable({
  items,
  activeItemKeys,
  amountDue,
  selectedItemKeys,
  onToggle
}: {
  items: JessicaJobLedgerItem[];
  activeItemKeys: Set<string>;
  amountDue: number;
  selectedItemKeys: Set<string>;
  onToggle: (itemKey: string) => void;
}) {
  const canViewMikeFinancials = items.some((item) => Object.hasOwn(item, "mikeProfit"));
  return (
    <table className="crm-bookkeeping-table crm-jessica-job-ledger">
      <thead>
        <tr>
          <th className="crm-jessica-owed-column">Jessica Owed</th>
          <th>Customer</th>
          <th>Job Status</th>
          <th>Ken Payoff</th>
          <th>COGS</th>
          <th>Installation</th>
          <th>Other Costs</th>
          {canViewMikeFinancials ? <th>Mike Profit</th> : null}
          <th>Gross Sale</th>
          <th>Marketing</th>
          {canViewMikeFinancials ? <th>Profit to Split</th> : null}
          <th>Sold</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const selectable = activeItemKeys.has(item.itemKey) && amountDue > 0;
          const held = item.displaySection === "completed" && !item.payableReady;
          return (
            <tr
              key={item.itemKey}
              className={held ? "crm-payables-row--held" : item.payableReady ? "crm-payables-row--ready" : undefined}
            >
              <td
                className={`crm-jessica-owed-column${
                  held
                    ? " crm-jessica-owed-column--held"
                    : item.displaySection === "pipeline"
                      ? " crm-jessica-owed-column--pipeline"
                      : " crm-jessica-owed-column--payable"
                }`}
              >
                <strong>{toLedgerCurrency(item.remainingAmount)}</strong>
                <span>{jobPaymentStateDisplay(item)}</span>
                {item.paidAmount > 0 ? <small>{toLedgerCurrency(item.paidAmount)} already paid</small> : null}
                {selectable ? (
                  <input
                    type="checkbox"
                    checked={selectedItemKeys.has(item.itemKey)}
                    onChange={() => onToggle(item.itemKey)}
                    aria-label={`Select ${item.customerName}`}
                  />
                ) : null}
              </td>
              <td>
                <strong title={[
                  `item=${item.itemKey}`,
                  item.quoteId ? `quote=${item.quoteId}` : null,
                  item.quoteIdAliases.length ? `quote aliases=${item.quoteIdAliases.join(",")}` : null,
                  item.bookkeepingEntryId ? `entry=${item.bookkeepingEntryId}` : null,
                  item.jobId ? `job=${item.jobId}` : null
                ].filter(Boolean).join(" · ")}>
                  {item.customerName}
                </strong>
                <span>{item.quoteNumber || "No quote number"}</span>
              </td>
              <td>{item.jobStatus ? titleCase(item.jobStatus) : "Unknown"}</td>
              <td>{toLedgerCurrency(item.kenCut)}</td>
              <td>{toLedgerCurrency(item.cogs)}</td>
              <td>{toLedgerCurrency(item.installationCost)}</td>
              <td>
                <strong>{toLedgerCurrency(item.expensesTotal + item.remakeTotal)}</strong>
                <span>
                  Expenses {toLedgerCurrency(item.expensesTotal)} · Remakes {toLedgerCurrency(item.remakeTotal)}
                </span>
              </td>
              {canViewMikeFinancials ? <td>{toLedgerCurrency(item.mikeProfit)}</td> : null}
              <td>{toLedgerCurrency(item.total)}</td>
              <td className="crm-ledger-money-warn">
                {toLedgerCurrency(item.advertisingReserve)}
                <span>
                  {item.advertisingReserve > 0
                    ? "7% of gross"
                    : `0% · sold before ${formatShortDate(ADVERTISING_RESERVE_EFFECTIVE_FROM)}`}
                </span>
              </td>
              {canViewMikeFinancials ? (
                <td>
                  <strong>{toLedgerCurrency(item.remainingProfitBeforeJessica)}</strong>
                  <span>Gross − marketing − COGS − Ken − installation − expenses − remakes</span>
                </td>
              ) : null}
              <td>{formatShortDate(item.soldDate)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function sumPartnerRemaining(items: CrmPartnerPaymentLedgerItem[]) {
  return Math.round(items.reduce((sum, item) => sum + item.remainingAmount, 0) * 100) / 100;
}

function ManualPaymentPanel({
  person,
  amountDue,
  eligibleItemCount,
  kenReview,
  busy,
  onOpenReview
}: {
  person: CrmPaymentPerson;
  amountDue: number;
  eligibleItemCount: number;
  kenReview: KenPaymentReview | null;
  busy: boolean;
  onOpenReview: () => void;
}) {
  const recipientName = paymentPersonDisplayName(person);
  const disabledReasons = [
    amountDue <= 0 ? `${recipientName}’s current payable balance must be greater than zero.` : null,
    eligibleItemCount === 0 ? "There are no eligible payable entries to review." : null,
    busy ? "Another payment update is currently in progress." : null
  ].filter((reason): reason is string => Boolean(reason));
  const canReviewPayment = disabledReasons.length === 0;
  const kenDisabledReason =
    person === "ken" && kenReview
      ? kenPaymentDisabledReason({ recipientConfigured: true, review: kenReview, busy })
      : null;

  return (
    <section className="crm-manual-payment-panel" aria-label={`${recipientName} manual payment entry`}>
      <div>
        <p className="eyebrow">Manual Payment Record</p>
        <h3>{recipientName}</h3>
      </div>
      <div className="crm-manual-payment-facts">
        <p>
          <span>Current Owed</span>
          <strong>{toLedgerCurrency(amountDue)}</strong>
        </p>
        <p><span>Action</span><strong>Record only</strong></p>
      </div>
      <div className="crm-manual-payment-actions">
        {person === "ken" ? (
          <div className="crm-manual-payment-primary-action">
            <button type="button" disabled={Boolean(kenDisabledReason)} onClick={onOpenReview}>
              Make Payment
            </button>
            <small className={kenDisabledReason ? "crm-manual-payment-action-help crm-manual-payment-action-help--disabled" : "crm-manual-payment-action-help"}>
              {kenDisabledReason || "Opens a manual entry review. No transfer is initiated or suggested."}
            </small>
          </div>
        ) : null}
        {person === "jessica" ? (
          <div className="crm-manual-payment-primary-action">
            <button type="button" disabled={!canReviewPayment} onClick={onOpenReview}>
              Process Jessica’s Payments
            </button>
            <small className={disabledReasons.length ? "crm-manual-payment-action-help crm-manual-payment-action-help--disabled" : "crm-manual-payment-action-help"}>
              {disabledReasons.length ? disabledReasons.join(" ") : "Opens a manual record review; it never sends money."}
            </small>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function KenBuyoutLedgerBox({ ledger }: { ledger: CrmKenBuyoutLedger }) {
  return (
    <section className="crm-ken-buyout-ledger" aria-label="Ken business buyout ledger">
      <div className="crm-ken-buyout-head">
        <div>
          <p className="eyebrow">Business Buyout</p>
          <h3>805 Owes Ken</h3>
        </div>
        <strong>{toLedgerCurrency(ledger.remainingBalance)}</strong>
      </div>
      <div className="crm-ken-buyout-bar" aria-hidden="true">
        <div style={{ width: `${ledger.paidPct}%` }} />
      </div>
      <div className="crm-ken-buyout-stats">
        <p>
          <span>Original Ledger</span>
          <strong>{toLedgerCurrency(ledger.target)}</strong>
        </p>
        <p>
          <span>Payments Applied</span>
          <strong>{toLedgerCurrency(ledger.totalPaid)}</strong>
        </p>
        <p>
          <span>Remaining</span>
          <strong>{toLedgerCurrency(ledger.remainingBalance)}</strong>
        </p>
        <p>
          <span>Percent Paid</span>
          <strong>{ledger.paidPct.toFixed(1)}%</strong>
        </p>
      </div>
      <div className="crm-ken-buyout-history">
        <h4>500K Payment History</h4>
        <div className="crm-bookkeeping-table-wrap">
          <table className="crm-bookkeeping-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Payment</th>
                <th>Applied</th>
                <th>Remaining</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {ledger.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatShortDate(payment.paidOn)}</td>
                  <td>{toLedgerCurrency(payment.amount)}</td>
                  <td>{toLedgerCurrency(payment.runningPaid)}</td>
                  <td>{toLedgerCurrency(payment.remainingBalance)}</td>
                  <td>{payment.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ledger.payments.length ? <p className="crm-empty">No Ken payments applied yet.</p> : null}
        </div>
      </div>
    </section>
  );
}

function PartnerPaymentsView({
  ledger,
  activePerson,
  onPersonChange,
  busy,
  onPay
}: {
  ledger: CrmDashboardData["partnerPaymentLedger"] | undefined;
  activePerson: CrmPaymentPerson;
  onPersonChange: (person: CrmPaymentPerson) => void;
  busy: boolean;
  onPay: (payload: PartnerPaymentRequest) => Promise<void>;
}) {
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(() => new Set());
  const [review, setReview] = useState<
    { itemKeys: string[]; amount: number; count: number; requestId: string; kenReview: KenPaymentReview | null } | null
  >(null);
  const [reviewDate, setReviewDate] = useState(todayInputValue());
  const [reviewAmount, setReviewAmount] = useState("");
  const [reviewMethod, setReviewMethod] = useState("check");
  const [reviewReference, setReviewReference] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [weeklyReviewEnabled, setWeeklyReviewEnabled] = useState(false);
  const [weeklyReviewDay, setWeeklyReviewDay] = useState("5");
  const [weeklyReviewTime, setWeeklyReviewTime] = useState("09:00");
  const [weeklyReviewReady, setWeeklyReviewReady] = useState(false);
  const [weeklyReviewSaved, setWeeklyReviewSaved] = useState(false);
  const activeItems = ledger?.people[activePerson]?.activeItems || [];
  const activePersonLedger = ledger?.people[activePerson];
  const activePersonRestricted = activePersonLedger?.earningsAccess === "restricted";
  const activeHistory = (ledger?.history || []).filter((batch) => batch.person === activePerson);
  const selectedItems = activeItems.filter((item) => selectedItemKeys.has(item.itemKey));
  const amountDue = Math.max(activePersonLedger?.owed || 0, 0);
  const paymentAmountForItems = (items: CrmPartnerPaymentLedgerItem[]) =>
    Math.min(sumPartnerRemaining(items), amountDue);
  const selectedTotal = paymentAmountForItems(selectedItems);
  const allSelected = activeItems.length > 0 && selectedItems.length === activeItems.length;
  const activeItemKeys = new Set(activeItems.map((item) => item.itemKey));
  const jobItems = activePersonLedger?.jobItems || [];
  const completedJobItems = jobItems.filter((item) => item.displaySection === "completed");
  const pipelineJobItems = jobItems.filter((item) => item.displaySection === "pipeline");
  const reviewItems = review ? activeItems.filter((item) => review.itemKeys.includes(item.itemKey)) : [];
  const reviewGrossPayable = sumPartnerRemaining(reviewItems);
  const reviewAdvanceApplied = Math.min(reviewGrossPayable, Math.max(activePersonLedger?.advanceBalance || 0, 0));
  const excludedJessicaItems = completedJobItems.filter((item) => !item.payableReady);
  const kenReview = activePerson === "ken" ? buildKenPaymentReview(activePersonLedger?.items || []) : null;

  useEffect(() => {
    setSelectedItemKeys(new Set());
    setReview(null);
    setReviewDate(todayInputValue());
    setReviewAmount("");
    setReviewMethod("check");
    setReviewReference("");
    setReviewNote("");
  }, [activePerson]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(JESSICA_WEEKLY_REVIEW_STORAGE_KEY) || "{}") as {
        enabled?: boolean;
        weekday?: string;
        time?: string;
      };
      setWeeklyReviewEnabled(Boolean(stored.enabled));
      if (/^[0-6]$/.test(stored.weekday || "")) setWeeklyReviewDay(stored.weekday as string);
      if (/^\d{2}:\d{2}$/.test(stored.time || "")) setWeeklyReviewTime(stored.time as string);
    } catch {
      // Invalid browser-local settings fall back to the safe disabled default.
    }
  }, []);

  useEffect(() => {
    if (!weeklyReviewEnabled || activePerson !== "jessica" || typeof window === "undefined") {
      setWeeklyReviewReady(false);
      return;
    }
    const checkSchedule = () => {
      const now = new Date();
      const [hours, minutes] = weeklyReviewTime.split(":").map(Number);
      const scheduledMinutes = hours * 60 + minutes;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      setWeeklyReviewReady(now.getDay() === Number(weeklyReviewDay) && currentMinutes >= scheduledMinutes);
    };
    checkSchedule();
    const timer = window.setInterval(checkSchedule, 60_000);
    return () => window.clearInterval(timer);
  }, [activePerson, weeklyReviewDay, weeklyReviewEnabled, weeklyReviewTime]);

  const toggleItem = (itemKey: string) => {
    setSelectedItemKeys((current) => {
      const next = new Set(current);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedItemKeys(allSelected ? new Set() : new Set(activeItems.map((item) => item.itemKey)));
  };

  const openReview = () => {
    if (!activeItems.length || amountDue <= 0) return;
    const reviewItems = activePerson === "ken"
      ? (kenReview?.included || [])
      : selectedItems.length ? selectedItems : activeItems;
    setReview({
      itemKeys: reviewItems.map((item) => item.itemKey),
      amount: paymentAmountForItems(reviewItems),
      count: reviewItems.length,
      requestId: crypto.randomUUID(),
      kenReview
    });
    setReviewDate(todayInputValue());
    setReviewAmount(paymentAmountForItems(reviewItems).toFixed(2));
    setReviewMethod("check");
    setReviewReference("");
    setReviewNote("");
  };

  const saveWeeklyReviewSchedule = () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      JESSICA_WEEKLY_REVIEW_STORAGE_KEY,
      JSON.stringify({
        enabled: weeklyReviewEnabled,
        weekday: weeklyReviewDay,
        time: weeklyReviewTime,
        updatedAt: new Date().toISOString(),
        behavior: "review_only"
      })
    );
    setWeeklyReviewSaved(true);
  };

  const confirmReviewPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!review) return;
    try {
      await onPay({
        person: activePerson,
        amount: Number(reviewAmount),
        paid_on: reviewDate,
        note: reviewNote,
        item_ids: review.itemKeys,
        payment_request_id: activePerson === "ken" ? review.requestId : undefined,
        payment_method: reviewMethod,
        payment_reference: reviewReference
      });
      setReview(null);
      setSelectedItemKeys(new Set());
    } catch {
      // The shared CRM alert shows the server validation message.
    }
  };

  const submitManualPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const manualSelectedItems = selectedItems.length ? selectedItems : activeItems;
    const manualAmount = paymentAmountForItems(manualSelectedItems);
    if (!manualSelectedItems.length || manualAmount <= 0) return;

    try {
      await onPay({
        person: activePerson,
        amount: manualAmount,
        paid_on: formString(formData, "paid_on") || null,
        note: formString(formData, "note"),
        item_ids: manualSelectedItems.map((item) => item.itemKey),
        payment_request_id: activePerson === "ken" ? crypto.randomUUID() : undefined
      });
      form.reset();
      setSelectedItemKeys(new Set());
    } catch {
      // The shared CRM alert shows the server validation message.
    }
  };

  const submitAdvance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await onPay({
      person: activePerson,
      advance: true,
      amount: Number(formString(formData, "amount") || 0),
      paid_on: formString(formData, "paid_on") || null,
      note: formString(formData, "note") || "Payment advance"
    });
    form.reset();
  };

  return (
    <section className="crm-workspace crm-workspace-wide crm-payments-workspace">
      <div className="crm-ledger">
        <div className="crm-section-head">
          <div>
            <p className="eyebrow">Internal Payables</p>
            <h2>Payables</h2>
          </div>
          {activePerson !== "jessica" && activePerson !== "ken" ? (
            <button type="button" disabled={busy || !activeItems.length || amountDue <= 0} onClick={openReview}>
              Process {paymentPersonDisplayName(activePerson)} Payment
            </button>
          ) : null}
        </div>

        <div className="crm-bookkeeping-summary-grid crm-payment-person-grid">
          {paymentPeople.map((person) => {
            const personLedger = ledger?.people[person];
            if (personLedger?.earningsAccess === "restricted") {
              return (
                <button
                  type="button"
                  className={`crm-bookkeeping-summary-card crm-bookkeeping-summary-card-button ${activePerson === person ? "active" : ""}`}
                  key={person}
                  onClick={() => onPersonChange(person)}
                >
                  <span>{paymentPersonDisplayName(person)} Payables</span>
                  <strong>Restricted</strong>
                  <em>Only your own earnings are available on this login.</em>
                  <span className="crm-payables-all-time-summary">All-time earnings restricted</span>
                </button>
              );
            }
            const soldEarningDetail =
              person === "mike" || person === "jessica"
                ? `${personLedger?.soldJobCount || 0} sold / ${toLedgerCurrency(personLedger?.soldEarned)} earning`
                : null;
            return (
              <button
                type="button"
                className={`crm-bookkeeping-summary-card crm-bookkeeping-summary-card-button ${
                  activePerson === person ? "active" : ""
                }`}
                key={person}
                onClick={() => onPersonChange(person)}
              >
                <span>{paymentPersonDisplayName(person)} Due</span>
                <strong>{toLedgerCurrency(personLedger?.owed)}</strong>
                <em>
                  {personLedger?.activeJobCount || 0} currently unpaid / {toLedgerCurrency(personLedger?.earned)} payable earned
                </em>
                {soldEarningDetail ? <em className="crm-payment-person-sold-earning">{soldEarningDetail}</em> : null}
                {personLedger?.advanceBalance ? <em>{toLedgerCurrency(personLedger.advanceBalance)} advances recorded</em> : null}
                {personLedger?.allTimeJobSummary?.available ? (
                  <span className="crm-payables-all-time-summary">
                    <b>All-time jobs · {personLedger.allTimeJobSummary.valueLabel}</b>
                    <small>Sold: {personLedger.allTimeJobSummary.sold.count} · {toLedgerCurrency(personLedger.allTimeJobSummary.sold.total)}</small>
                    <small>Active sold: {personLedger.allTimeJobSummary.active.count} · {toLedgerCurrency(personLedger.allTimeJobSummary.active.total)}</small>
                    <small>Closed sold: {personLedger.allTimeJobSummary.closed.count} · {toLedgerCurrency(personLedger.allTimeJobSummary.closed.total)}</small>
                  </span>
                ) : <span className="crm-payables-all-time-summary">All-time job summary unavailable</span>}
              </button>
            );
          })}
        </div>

        <p className="crm-payables-summary-definition">
          All-time Sold includes each exact qualifying sold job once. Active sold has not been completed or paid in full;
          Closed sold is completed or paid in full. Active sold plus Closed sold equals Sold. These totals are separate from
          current amount due and recorded advances.
        </p>

        {activePersonRestricted ? (
          <div className="crm-empty" role="status">
            This person&apos;s payable earnings and all-time job details are restricted on your login.
          </div>
        ) : null}

        {!activePersonRestricted && (activePerson === "mike" || activePerson === "jessica") ? (
          <CollapsiblePanel title="Record Payment Advance">
            <form className="crm-form" onSubmit={submitAdvance}>
              <label>Person<input value={paymentPersonDisplayName(activePerson)} readOnly /></label>
              <div className="crm-field-row">
                <label>Advance Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label>
                <label>Paid Date<input name="paid_on" type="date" defaultValue={todayInputValue()} /></label>
              </div>
              <label>Note<textarea name="note" rows={3} placeholder="Advance payment details" /></label>
              <button type="submit" disabled={busy}>Record Advance</button>
            </form>
          </CollapsiblePanel>
        ) : null}

        {!activePersonRestricted ? <ManualPaymentPanel
          person={activePerson}
          amountDue={activePersonLedger?.owed || 0}
          eligibleItemCount={activeItems.length}
          kenReview={kenReview}
          busy={busy}
          onOpenReview={openReview}
        /> : null}

        {activePerson === "jessica" ? (
          <CollapsiblePanel title="Weekly Jessica Payment Review">
            <div className="crm-form">
              <label>
                <input
                  type="checkbox"
                  checked={weeklyReviewEnabled}
                  onChange={(event) => {
                    setWeeklyReviewEnabled(event.target.checked);
                    setWeeklyReviewSaved(false);
                  }}
                />
                Enable browser-local weekly review reminder
              </label>
              <div className="crm-field-row">
                <label>
                  Weekday
                  <select value={weeklyReviewDay} onChange={(event) => setWeeklyReviewDay(event.target.value)}>
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                    <option value="6">Saturday</option>
                    <option value="0">Sunday</option>
                  </select>
                </label>
                <label>
                  Local time
                  <input type="time" value={weeklyReviewTime} onChange={(event) => setWeeklyReviewTime(event.target.value)} />
                </label>
              </div>
              <p className="crm-inline-note">
                Disabled by default. This browser-local setting only presents the same review; it cannot send money or email.
                Production scheduling still requires durable server scheduling, audit storage, verified sender configuration, and explicit approval.
              </p>
              {weeklyReviewReady ? (
                <div className="crm-inline-alert">
                  Weekly Jessica payment review is ready.
                  <button type="button" onClick={openReview} disabled={busy || !activeItems.length || amountDue <= 0}>
                    Review Eligible Payables
                  </button>
                </div>
              ) : null}
              <button type="button" className="crm-ghost-button" onClick={saveWeeklyReviewSchedule}>
                Save Weekly Review Setting
              </button>
              {weeklyReviewSaved ? <small>Saved in this browser with an update timestamp.</small> : null}
            </div>
          </CollapsiblePanel>
        ) : null}

        {activePerson === "ken" && ledger?.kenBuyout ? <KenBuyoutLedgerBox ledger={ledger.kenBuyout} /> : null}

        <CollapsiblePanel title="Custom Group Payment">
          <form className="crm-form" onSubmit={submitManualPayment} key={activePerson}>
            <label>
              Person
              <input value={paymentPersonDisplayName(activePerson)} readOnly />
            </label>
            <label>
              Amount
              <input value={toLedgerCurrency(selectedTotal > 0 ? selectedTotal : activePersonLedger?.owed || 0)} readOnly />
            </label>
            <div className="crm-field-row">
              <label>
                Paid Date
                <input name="paid_on" type="date" defaultValue={todayInputValue()} />
              </label>
              <label>
                Selected Jobs
                <input value={selectedItems.length ? `${selectedItems.length} selected` : "All active jobs"} readOnly />
              </label>
            </div>
            <label>
              Note
              <textarea name="note" rows={3} placeholder="Manual payment details or adjustment note" />
            </label>
            <button type="submit" disabled={busy || amountDue <= 0}>
              Save Group Payment & Email PDF
            </button>
          </form>
        </CollapsiblePanel>

        <div className="crm-payoff-payments">
          <div className="crm-payment-ledger-head">
            <h3>{activePerson === "jessica" ? "Jessica Job Ledger" : `${paymentPersonDisplayName(activePerson)} Active Payables`}</h3>
            {activeItems.length && activePerson !== "jessica" ? (
              <button type="button" className="crm-ghost-button" onClick={toggleAll}>
                {allSelected ? "Clear Selection" : "Select All"}
              </button>
            ) : null}
          </div>
          <div className="crm-bookkeeping-table-wrap">
            {activePerson === "jessica" ? (
              <div className="crm-jessica-payables-sections">
                <section>
                  <h4>Completed Jobs with Calculated Payables</h4>
                  {completedJobItems.length ? (
                    <JessicaJobLedgerTable
                      items={completedJobItems}
                      activeItemKeys={activeItemKeys}
                      amountDue={amountDue}
                      selectedItemKeys={selectedItemKeys}
                      onToggle={toggleItem}
                    />
                  ) : (
                    <p className="crm-empty">No unpaid completed Jessica jobs.</p>
                  )}
                </section>
                <section>
                  <h4>Future / Pipeline Earnings</h4>
                  {pipelineJobItems.length ? (
                    <JessicaJobLedgerTable
                      items={pipelineJobItems}
                      activeItemKeys={activeItemKeys}
                      amountDue={amountDue}
                      selectedItemKeys={selectedItemKeys}
                      onToggle={toggleItem}
                    />
                  ) : (
                    <p className="crm-empty">No Jessica pipeline jobs.</p>
                  )}
                </section>
              </div>
            ) : (
            <table className={`crm-bookkeeping-table${activePerson === "ken" ? " crm-ken-job-ledger" : ""}`}>
              <thead>
                <tr>
                  {activePerson === "ken" ? <th className="crm-jessica-owed-column">Ken Owed</th> : <th aria-label="Select job" />}
                  {activePerson === "ken" ? <th>Total Contract Amount</th> : null}
                  <th>Customer</th>
                  <th>Closed</th>
                  <th>Status</th>
                  <th>Sold By</th>
                  {activePerson !== "ken" ? <th>Total</th> : null}
                  {activePerson === "mike" ? <th>Advertising 7%</th> : null}
                  {activePerson !== "ken" ? <th>Owed</th> : null}
                  <th>Paid</th>
                  {activePerson !== "ken" ? <th>Remaining</th> : null}
                  {activePerson !== "ken" ? <th>State</th> : null}
                </tr>
              </thead>
              <tbody>
                {activeItems.map((item) => (
                  <tr key={item.itemKey}>
                    {activePerson === "ken" ? (
                      <td className="crm-jessica-owed-column crm-jessica-owed-column--payable">
                        <strong>{toLedgerCurrency(item.remainingAmount)}</strong>
                        <span>{kenPaymentStateDisplay(item)}</span>
                        {item.paidAmount > 0 ? <small>{toLedgerCurrency(item.paidAmount)} already paid</small> : null}
                        <input
                          type="checkbox"
                          checked={selectedItemKeys.has(item.itemKey)}
                          onChange={() => toggleItem(item.itemKey)}
                          aria-label={`Select ${item.customerName}`}
                        />
                      </td>
                    ) : (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedItemKeys.has(item.itemKey)}
                          onChange={() => toggleItem(item.itemKey)}
                          aria-label={`Select ${item.customerName}`}
                        />
                      </td>
                    )}
                    {activePerson === "ken" ? <td>{toLedgerCurrency(item.total)}</td> : null}
                    <td>
                      <strong>{item.customerName}</strong>
                      <span>{item.quoteNumber || item.source.replace("_", " ")}</span>
                    </td>
                    <td>{formatShortDate(item.closedAt)}</td>
                    <td>{bookkeepingStatusLabelForKey(item.sourceStatus)}</td>
                    <td>{saleOwnerDisplayName(item.salesOwner)}</td>
                    {activePerson !== "ken" ? <td>{toLedgerCurrency(item.total)}</td> : null}
                    {activePerson === "mike" ? (
                      <td className="crm-ledger-money-warn">{toLedgerCurrency(item.advertisingReserve)}</td>
                    ) : null}
                    {activePerson !== "ken" ? <td>{toLedgerCurrency(item.owedAmount)}</td> : null}
                    <td>{toLedgerCurrency(item.paidAmount)}</td>
                    {activePerson !== "ken" ? <td className="crm-ledger-money-warn">{toLedgerCurrency(item.remainingAmount)}</td> : null}
                    {activePerson !== "ken" ? <td>{paymentStateDisplay(item.paymentState)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
            )}
            {activePerson !== "jessica" && !activeItems.length ? <p className="crm-empty">No active unpaid jobs for {paymentPersonDisplayName(activePerson)}.</p> : null}
          </div>
        </div>

        <div className="crm-payoff-payments">
          <h3>{paymentPersonDisplayName(activePerson)} Payment History</h3>
          <div className="crm-bookkeeping-table-wrap">
            <table className="crm-bookkeeping-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Payment Period</th>
                  <th>Amount</th>
                  <th>Jobs</th>
                  <th>Note</th>
                  <th>Created By</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {activeHistory.map((batch) => (
                  <PartnerPaymentHistoryRow batch={batch} key={batch.id} />
                ))}
              </tbody>
            </table>
            {!activeHistory.length ? <p className="crm-empty">No payment history for {paymentPersonDisplayName(activePerson)} yet.</p> : null}
          </div>
        </div>
      </div>

      {review ? (
        <div className="crm-slot-modal crm-payment-review-modal" role="dialog" aria-modal="true" aria-labelledby="crm-payment-review-title">
          <button type="button" className="crm-slot-modal__backdrop" aria-label="Close payment review" onClick={() => setReview(null)} />
          <section className="crm-slot-form-panel">
            <div className="crm-slot-form-head">
              <div>
                <p className="eyebrow">Review Payment</p>
                <h2 id="crm-payment-review-title">Process Group Payment</h2>
              </div>
              <button type="button" className="crm-slot-close" aria-label="Close payment review" onClick={() => setReview(null)}>
                ×
              </button>
            </div>
            <div className="crm-payment-review-summary">
              {activePerson === "jessica" ? (
                <>
                  <div>
                    <span>Eligible jobs</span>
                    <strong>{toLedgerCurrency(reviewGrossPayable)}</strong>
                  </div>
                  <div>
                    <span>Jessica advance offset</span>
                    <strong>−{toLedgerCurrency(reviewAdvanceApplied)}</strong>
                  </div>
                </>
              ) : null}
              {activePerson === "ken" ? (
                <>
                  <div><span>Gross total</span><strong>{toLedgerCurrency(review.kenReview?.grossTotal || 0)}</strong></div>
                  <div><span>Prior Ken allocations</span><strong>−{toLedgerCurrency(review.kenReview?.offsets || 0)}</strong></div>
                </>
              ) : null}
              <div>
                <span>{activePerson === "jessica" || activePerson === "ken" ? "Net payment to record" : "Amount"}</span>
                <strong>{toLedgerCurrency(review.amount)}</strong>
              </div>
              <div>
                <span>Jobs</span>
                <strong>{review.count}</strong>
              </div>
            </div>
            {activePerson === "jessica" ? (
              <div className="crm-payment-review-details">
                <div className="crm-manual-payment-facts">
                  <p>
                    <span>Payment workflow</span>
                    <strong>Manual record only</strong>
                  </p>
                  <p>
                    <span>Notification recipient</span>
                    <strong>{JESSICA_PAYMENT_NOTIFICATION_EMAIL}</strong>
                  </p>
                </div>
                <h3>Eligible jobs included</h3>
                <div className="crm-bookkeeping-table-wrap">
                  <table className="crm-bookkeeping-table">
                    <thead><tr><th>Customer</th><th>Quote</th><th>Status</th><th>Installation</th><th>Payable</th></tr></thead>
                    <tbody>
                      {reviewItems.map((item) => (
                        <tr key={item.itemKey}>
                          <td>{item.customerName}</td>
                          <td>{item.quoteNumber || "-"}</td>
                          <td>{paymentStateDisplay(item.paymentState)}</td>
                          <td>Recorded</td>
                          <td>{toLedgerCurrency(item.remainingAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3>Excluded / held jobs</h3>
                {excludedJessicaItems.length ? (
                  <div className="crm-bookkeeping-table-wrap">
                    <table className="crm-bookkeeping-table">
                      <thead><tr><th>Customer</th><th>Quote</th><th>Amount</th><th>Reason excluded</th></tr></thead>
                      <tbody>
                        {excludedJessicaItems.map((item) => (
                          <tr className="crm-payables-row--held" key={item.itemKey}>
                            <td>{item.customerName}</td>
                            <td>{item.quoteNumber || "-"}</td>
                            <td>{toLedgerCurrency(item.remainingAmount)}</td>
                            <td>{jobPaymentStateDisplay(item)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="crm-empty">No completed Jessica jobs are excluded from this review.</p>}
                <p className="crm-inline-note">
                  Saving records only the approved eligible line items. The matching email is sent after a successful record,
                  with PDF and CSV spreadsheet attachments; canceling or a failed save sends no email.
                </p>
              </div>
            ) : activePerson === "ken" && review.kenReview ? (
              <div className="crm-payment-review-details">
                <h3>Closed jobs included</h3>
                <div className="crm-bookkeeping-table-wrap">
                  <table className="crm-bookkeeping-table">
                    <thead><tr><th>Customer</th><th>Quote</th><th>10% gross</th><th>Prior allocation</th><th>Net</th></tr></thead>
                    <tbody>
                      {review.kenReview.included.map((item) => (
                        <tr key={item.itemKey}>
                          <td>{item.customerName}</td>
                          <td>{item.quoteNumber || "-"}</td>
                          <td>{toLedgerCurrency(item.owedAmount)}</td>
                          <td>{toLedgerCurrency(item.paidAmount)}</td>
                          <td>{toLedgerCurrency(item.remainingAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3>Excluded / held rows</h3>
                {review.kenReview.held.length ? (
                  <ul>
                    {review.kenReview.held.map(({ item, reason }) => <li key={item.itemKey}>{item.customerName}: {reason}</li>)}
                  </ul>
                ) : <p className="crm-empty">No excluded or held rows.</p>}
                <p className="crm-inline-note">
                  Ken receives exactly 10% of every closed job whose Ken allocation remains unpaid, whether or not the customer paid in full.
                  Recording applies this batch once to the business-buyout ledger. This review does not transfer funds.
                </p>
              </div>
            ) : null}
            <form className="crm-form" onSubmit={confirmReviewPayment}>
              <label>
                Confirmed Amount
                <input type="number" min="0.01" step="0.01" required value={reviewAmount} onChange={(event) => setReviewAmount(event.target.value)} />
              </label>
              <label>
                Payment Date
                <input type="date" required value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} />
              </label>
              <label>
                Payment Method
                <select required value={reviewMethod} onChange={(event) => setReviewMethod(event.target.value)}>
                  <option value="check">Check</option>
                  <option value="cash">Cash</option>
                  <option value="ach">ACH</option>
                  <option value="card">Card</option>
                  <option value="other">Other manual method</option>
                </select>
              </label>
              <label>
                Reference
                <input value={reviewReference} onChange={(event) => setReviewReference(event.target.value)} placeholder="Check number or confirmation reference" />
              </label>
              <label>
                Note
                <textarea rows={3} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Optional manual payment notes" />
              </label>
              <div className="crm-slot-actions">
                <button type="button" className="crm-ghost-button" onClick={() => setReview(null)}>
                  Cancel
                </button>
                <button type="submit" disabled={busy}>
                  Record Confirmed Manual Payment
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function PartnerPaymentHistoryRow({ batch }: { batch: CrmPartnerPaymentHistoryBatch }) {
  return (
    <tr>
      <td>{formatShortDate(batch.paidOn)}</td>
      <td>{formatShortDate(batch.periodMonth)}</td>
      <td>{toLedgerCurrency(batch.amount)}</td>
      <td>{batch.allocations.length || "-"}</td>
      <td>{batch.note || (batch.isAdvance ? "Payment advance" : batch.isLegacy ? "Legacy unallocated payment" : "")}</td>
      <td>{batch.createdByEmail || "-"}</td>
      <td>
        {batch.allocations.length ? (
          <details className="crm-payment-details">
            <summary>View jobs</summary>
            <div>
              {batch.allocations.map((allocation) => (
                <p key={allocation.id}>
                  <strong title={[
                    `allocation=${allocation.id}`,
                    `item=${allocation.itemKey}`,
                    allocation.quoteId ? `quote=${allocation.quoteId}` : null,
                    allocation.bookkeepingEntryId ? `entry=${allocation.bookkeepingEntryId}` : null,
                    allocation.jobId ? `job=${allocation.jobId}` : null
                  ].filter(Boolean).join(" · ")}>
                    {allocation.customerName}
                  </strong>
                  <span>
                    {[allocation.quoteNumber, formatShortDate(allocation.closedAt)].filter(Boolean).join(" / ")}
                    {allocation.resolution.startsWith("unresolved_")
                      ? ` / ${allocation.resolution.replaceAll("_", " ")}`
                      : allocation.resolution !== "exact_key"
                        ? ` / matched by ${allocation.resolution.replaceAll("_", " ")}`
                        : ""}
                  </span>
                  <em>
                    {toLedgerCurrency(allocation.amount)}
                    {allocation.virtual ? " legacy" : ""}
                    {allocation.unappliedAmount > 0
                      ? ` / ${toLedgerCurrency(allocation.unappliedAmount)} unapplied`
                      : ""}
                  </em>
                </p>
              ))}
            </div>
          </details>
        ) : (
          batch.isAdvance ? `${toLedgerCurrency(batch.unappliedAmount)} credit remaining` : "-"
        )}
        {batch.advanceApplied > 0 ? <small>{toLedgerCurrency(batch.advanceApplied)} advance applied to this batch</small> : null}
      </td>
    </tr>
  );
}

function CommissionPaymentRow({
  payment,
  busy,
  onEdit,
  onDelete
}: {
  payment: CrmCommissionPayment;
  busy: boolean;
  onEdit: (event: FormEvent<HTMLFormElement>, payment: CrmCommissionPayment) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <tr>
        <td colSpan={7}>
          <form
            className="crm-inline-form"
            onSubmit={(event) => {
              onEdit(event, payment);
              setEditing(false);
            }}
          >
            <select name="recipient" defaultValue={payment.recipient} aria-label="Recipient">
              <option value="mike">Mike</option>
              <option value="jessica">Jessica</option>
            </select>
            <input name="amount" type="number" min="0" step="0.01" defaultValue={payment.amount} aria-label="Amount" />
            <input name="paid_on" type="date" defaultValue={payment.paid_on || ""} aria-label="Paid date" />
            <input name="period_month" type="date" defaultValue={payment.period_month || ""} aria-label="For month" />
            <input name="note" defaultValue={payment.note || ""} placeholder="Note" aria-label="Note" />
            <button type="submit" disabled={busy}>
              Save
            </button>
            <button type="button" className="crm-ghost-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{titleCase(payment.recipient)}</td>
      <td>{formatShortDate(payment.paid_on)}</td>
      <td>{payment.period_month ? formatShortDate(payment.period_month) : "-"}</td>
      <td>{toLedgerCurrency(payment.amount)}</td>
      <td>{payment.note || ""}</td>
      <td>{payment.created_by_email || ""}</td>
      <td>
        <button type="button" className="crm-ghost-button" onClick={() => setEditing(true)} disabled={busy}>
          Edit
        </button>
        <button type="button" className="crm-ghost-button" onClick={() => onDelete(payment.id)} disabled={busy}>
          Delete
        </button>
      </td>
    </tr>
  );
}

function CommissionsView({
  summary,
  payments,
  busy,
  onRecord,
  onEdit,
  onDelete
}: {
  summary: CrmCommissionSummary | undefined;
  payments: CrmCommissionPayment[];
  busy: boolean;
  onRecord: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (event: FormEvent<HTMLFormElement>, payment: CrmCommissionPayment) => void;
  onDelete: (id: string) => void;
}) {
  const canViewMikeFinancials = Boolean(summary?.totals && Object.hasOwn(summary.totals, "mikeEarned"));
  const totals = summary?.totals || {
    mikeEarned: 0,
    mikePaid: 0,
    mikeOwed: 0,
    jessicaEarned: 0,
    jessicaPaid: 0,
    jessicaOwed: 0
  };
  const monthly = summary?.monthly || [];
  const recentPayments = [...payments].sort((left, right) => dateSortValue(right.paid_on || right.created_at) - dateSortValue(left.paid_on || left.created_at));

  return (
    <section className="crm-workspace crm-workspace-wide crm-commissions-workspace">
      <CollapsiblePanel title="Record Commission Payment">
        <form className="crm-form" onSubmit={onRecord}>
          <label>
            Recipient
            <select name="recipient" defaultValue="mike">
              <option value="mike">Mike</option>
              <option value="jessica">Jessica</option>
            </select>
          </label>
          <label>
            Amount
            <input name="amount" type="number" min="0" step="0.01" required />
          </label>
          <div className="crm-field-row">
            <label>
              Paid Date
              <input name="paid_on" type="date" defaultValue={lastDayOfMonthInputValue()} />
            </label>
            <label>
              For Month
              <input name="period_month" type="date" defaultValue={lastDayOfMonthInputValue()} />
            </label>
          </div>
          <label>
            Note
            <textarea name="note" rows={3} placeholder="Check #, period, adjustment..." />
          </label>
          <button type="submit" disabled={busy}>
            Record Payment
          </button>
        </form>
      </CollapsiblePanel>

      <div className="crm-ledger">
        <div className="crm-section-head">
          <div>
            <p className="eyebrow">Commissions</p>
            <h2>Mike / Jessica Ledger</h2>
          </div>
        </div>

        <div className="crm-bookkeeping-summary-grid crm-commission-summary-grid">
          {[
            ...(canViewMikeFinancials
              ? [
                  ["Mike Earned", totals.mikeEarned],
                  ["Mike Paid", totals.mikePaid],
                  ["Mike Balance", totals.mikeOwed]
                ]
              : []),
            ["Jessica Earned", totals.jessicaEarned],
            ["Jessica Paid", totals.jessicaPaid],
            ["Jessica Balance", totals.jessicaOwed]
          ].map(([label, value]) => (
            <article className="crm-bookkeeping-summary-card" key={label}>
              <span>{label}</span>
              <strong>{toLedgerCurrency(Number(value))}</strong>
            </article>
          ))}
        </div>

        <div className="crm-bookkeeping-table-wrap">
          <table className="crm-bookkeeping-table">
            <thead>
              <tr>
                <th>Month</th>
                {canViewMikeFinancials ? <th>Mike Earned</th> : null}
                {canViewMikeFinancials ? <th>Mike Paid</th> : null}
                {canViewMikeFinancials ? <th>Mike Balance</th> : null}
                <th>Jessica Earned</th>
                <th>Jessica Paid</th>
                <th>Jessica Balance</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((month) => (
                <tr key={month.periodMonth}>
                  <td>{formatShortDate(month.periodMonth)}</td>
                  {canViewMikeFinancials ? <td>{toLedgerCurrency(month.mikeEarned)}</td> : null}
                  {canViewMikeFinancials ? <td>{toLedgerCurrency(month.mikePaid)}</td> : null}
                  {canViewMikeFinancials ? (
                    <td className={month.mikeBalance > 0 ? "crm-ledger-money-warn" : "crm-ledger-money-good"}>{toLedgerCurrency(month.mikeBalance)}</td>
                  ) : null}
                  <td>{toLedgerCurrency(month.jessicaEarned)}</td>
                  <td>{toLedgerCurrency(month.jessicaPaid)}</td>
                  <td className={month.jessicaBalance > 0 ? "crm-ledger-money-warn" : "crm-ledger-money-good"}>{toLedgerCurrency(month.jessicaBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!monthly.length ? <p className="crm-empty">No closed paid-in-full commission months yet.</p> : null}
        </div>

        <div className="crm-payoff-payments">
          <h3>Payment History</h3>
          <table className="crm-bookkeeping-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Paid Date</th>
                <th>For Month</th>
                <th>Amount</th>
                <th>Note</th>
                <th>Created By</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {recentPayments.map((payment) => (
                <CommissionPaymentRow key={payment.id} payment={payment} busy={busy} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </tbody>
          </table>
          {!recentPayments.length ? <p className="crm-empty">No Mike/Jessica commission payments recorded yet.</p> : null}
        </div>
      </div>
    </section>
  );
}

function bookkeepingRowKey(row: CrmBookkeepingRow) {
  return `${row.source}-${row.id}`;
}

function BookkeepingCellButton({
  children,
  onClick,
  ariaLabel,
  className = ""
}: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button type="button" className={`crm-bookkeeping-cell-button ${className}`.trim()} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

function BookkeepingInlineTextEditor({
  defaultValue,
  type = "text",
  min,
  step,
  placeholder,
  busy,
  onSave,
  onCancel
}: {
  defaultValue: string | number | null | undefined;
  type?: "text" | "number" | "date";
  min?: string;
  step?: string;
  placeholder?: string;
  busy: boolean;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue == null ? "" : String(defaultValue));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(value.trim());
    onCancel();
  }

  return (
    <form className="crm-bookkeeping-inline-form" onSubmit={submit}>
      <input
        autoFocus
        type={type}
        min={min}
        step={step}
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      />
      <button type="submit" disabled={busy}>
        Save
      </button>
      <button type="button" className="crm-bookkeeping-inline-cancel" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

function BookkeepingInlineSelectEditor({
  defaultValue,
  options,
  busy,
  onSave,
  onCancel
}: {
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
  busy: boolean;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(value);
    onCancel();
  }

  return (
    <form className="crm-bookkeeping-inline-form" onSubmit={submit}>
      <select
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        {options.map((item) => (
          <option value={item.value} key={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={busy}>
        Save
      </button>
      <button type="button" className="crm-bookkeeping-inline-cancel" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

function BookkeepingCustomerEditor({
  row,
  busy,
  onSave,
  onCancel
}: {
  row: CrmBookkeepingRow;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [customerName, setCustomerName] = useState(row.customerName);
  const [salesOwner, setSalesOwner] = useState(row.salesOwner || "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({ customer_name: customerName.trim(), sales_owner: salesOwner });
    onCancel();
  }

  return (
    <form className="crm-bookkeeping-inline-form crm-bookkeeping-inline-form--customer" onSubmit={submit}>
      <input
        autoFocus
        value={customerName}
        onChange={(event) => setCustomerName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      />
      <select value={salesOwner} onChange={(event) => setSalesOwner(event.target.value)}>
        <option value="">Unassigned</option>
        <option value="mike">Mike</option>
        <option value="jessica">Jessica</option>
      </select>
      <button type="submit" disabled={busy}>
        Save
      </button>
      <button type="button" className="crm-bookkeeping-inline-cancel" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

function BookkeepingPaymentEditor({
  busy,
  onSave,
  onCancel
}: {
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("Balance payment");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({
      payment_amount: Number(amount || 0),
      payment_label: label.trim() || "Balance payment",
      paid_at: todayInputValue()
    });
    onCancel();
  }

  return (
    <form className="crm-bookkeeping-inline-form crm-bookkeeping-inline-form--payment" onSubmit={submit}>
      <input
        autoFocus
        type="number"
        min="0"
        step="0.01"
        placeholder="Amount"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      />
      <input value={label} onChange={(event) => setLabel(event.target.value)} />
      <button type="submit" disabled={busy}>
        Save
      </button>
      <button type="button" className="crm-bookkeeping-inline-cancel" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

function BookkeepingInstallationEditor({
  row,
  busy,
  onSave,
  onCancel
}: {
  row: CrmBookkeepingRow;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(row.installationInvoiceAmount ? String(row.installationInvoiceAmount) : "");
  const [paidAmount, setPaidAmount] = useState(row.installationInvoicePaidAmount ? String(row.installationInvoicePaidAmount) : "");
  const [paidAt, setPaidAt] = useState(dateInputValue(row.installationInvoicePaidAt));
  const [complete, setComplete] = useState(row.isInstallationComplete);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({
      installation_invoice_amount: Number(amount || 0),
      installation_invoice_paid_amount: Number(paidAmount || 0),
      installation_invoice_paid_at: paidAt || null,
      installation_complete: complete
    });
    onCancel();
  }

  return (
    <form className="crm-bookkeeping-inline-form crm-bookkeeping-inline-form--installation" onSubmit={submit}>
      <input
        autoFocus
        type="number"
        min="0"
        step="0.01"
        placeholder="Invoice"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      />
      <input
        type="date"
        value={paidAt}
        aria-label={`Install paid date for ${row.customerName}`}
        onChange={(event) => setPaidAt(event.target.value)}
      />
      <input
        type="number"
        min="0"
        step="0.01"
        placeholder="Paid"
        value={paidAmount}
        aria-label={`Install paid amount for ${row.customerName}`}
        onChange={(event) => setPaidAmount(event.target.value)}
      />
      <label className="crm-bookkeeping-inline-check">
        <input type="checkbox" checked={complete} onChange={(event) => setComplete(event.target.checked)} />
        Done
      </label>
      <button type="submit" disabled={busy}>
        Save
      </button>
      <button type="button" className="crm-bookkeeping-inline-cancel" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

const partnerPaymentPeople: CrmPaymentPerson[] = ["ken", "mike", "jessica"];

function partnerPaymentItemMap(ledger: CrmDashboardData["partnerPaymentLedger"] | undefined) {
  const map = new Map<string, CrmPartnerPaymentLedgerItem>();
  for (const person of partnerPaymentPeople) {
    for (const item of ledger?.people?.[person]?.items || []) {
      map.set(item.itemKey, item);
    }
  }
  return map;
}

function PartnerPaymentAmountCell({
  person,
  row,
  amount,
  item,
  canMarkPartnerPaid,
  busy,
  onMarkPartnerPaid
}: {
  person: CrmPaymentPerson;
  row: CrmBookkeepingRow;
  amount: number;
  item?: CrmPartnerPaymentLedgerItem;
  canMarkPartnerPaid: boolean;
  busy: boolean;
  onMarkPartnerPaid: (person: CrmPaymentPerson, item: CrmPartnerPaymentLedgerItem, row: CrmBookkeepingRow) => void;
}) {
  const payableItem = item || buildUnpaidPartnerPaymentItemForRow(person, row);
  const paid = payableItem?.paymentState === "paid";
  const canClick = Boolean(canMarkPartnerPaid && payableItem && !paid && payableItem.remainingAmount > 0);
  const label = paid
    ? `${paymentPersonDisplayName(person)} paid for ${row.customerName}`
    : canClick
      ? `Mark ${paymentPersonDisplayName(person)} paid for ${row.customerName}`
      : `${paymentPersonDisplayName(person)} not paid for ${row.customerName}`;
  const status = (
    <span className={`crm-partner-paid-box${paid ? " crm-partner-paid-box--paid" : ""}`} aria-hidden="true">
      {paid ? "✓" : ""}
    </span>
  );

  return (
    <span className="crm-partner-paid-cell">
      <span>{toLedgerCurrency(amount)}</span>
      {canClick && payableItem ? (
        <button
          type="button"
          className="crm-partner-paid-button"
          onClick={() => onMarkPartnerPaid(person, payableItem, row)}
          disabled={busy}
          aria-label={label}
          title={label}
        >
          {status}
        </button>
      ) : (
        <span className="crm-partner-paid-status" aria-label={label} title={label}>
          {status}
        </span>
      )}
    </span>
  );
}

function ReadOnlyBookkeepingSpreadsheet({
  rows,
  totals,
  payoff,
  partnerPaymentLedger,
  busy,
  onOpenPayoff
}: {
  rows: CrmBookkeepingRow[];
  totals: CrmDashboardData["bookkeepingTotals"] | undefined;
  payoff?: CrmDashboardData["kenPayoff"];
  partnerPaymentLedger: CrmDashboardData["partnerPaymentLedger"] | undefined;
  busy: boolean;
  onOpenPayoff: () => void;
}) {
  const canViewMikeFinancials = Boolean(totals && Object.hasOwn(totals, "mikeProfit"));
  const totalProfit = roundCurrency(
    (totals?.total || 0) -
      (totals?.advertisingReserve || 0) -
      (totals?.cogs || 0) -
      (totals?.installationAmount || 0) -
      (totals?.expensesTotal || 0) -
      (totals?.remakeTotal || 0)
  );
  const netProfit = roundCurrency(totalProfit - (totals?.kenCut || 0));
  const profitMargin = totals?.total ? `${((totalProfit / totals.total) * 100).toFixed(1)}%` : "0.0%";
  const missingCogs = totals?.missingCogs || 0;
  const paymentPeople = partnerPaymentLedger?.people;
  const paymentItemsByKey = useMemo(() => partnerPaymentItemMap(partnerPaymentLedger), [partnerPaymentLedger]);
  const statusGroups = useMemo(() => groupBookkeepingRowsByStatus(rows), [rows]);
  const buyoutLedger = partnerPaymentLedger?.kenBuyout;
  const buyoutRemaining = buyoutLedger?.remainingBalance ?? payoff?.payoffRemaining ?? payoff?.payoffTarget ?? 0;
  const buyoutPaid = buyoutLedger?.totalPaid ?? payoff?.kenPaid;
  const summaryCards: Array<{ label: string; value: string; detail?: string; action?: () => void }> = [
    { label: "Total Sales", value: toLedgerCurrency(totals?.total) },
    { label: "Open Balance", value: toLedgerCurrency(totals?.balance) },
    { label: "COGS", value: toLedgerCurrency(totals?.cogs) },
    { label: "Advertising Reserve (7%)", value: toLedgerCurrency(totals?.advertisingReserve) },
    { label: "Remake", value: toLedgerCurrency(-(totals?.remakeTotal || 0)) },
    { label: "Installation", value: toLedgerCurrency(totals?.installationAmount) },
    { label: "Expenses", value: toLedgerCurrency(totals?.expensesTotal) },
    { label: "Ken Profit", value: toLedgerCurrency(totals?.kenCut) },
    {
      label: "Buyout Ledger",
      value: toLedgerCurrency(buyoutRemaining),
      detail: `${toLedgerCurrency(buyoutPaid)} paid to Ken Hill`,
      action: onOpenPayoff
    },
    { label: "Ken's % Monthly Due", value: toLedgerCurrency(paymentPeople?.ken.owed ?? totals?.kenMonthlyDue), action: onOpenPayoff },
    { label: "Ken's % of Total Closed", value: toLedgerCurrency(totals?.kenTotalClosed), action: onOpenPayoff },
    ...(canViewMikeFinancials ? [{ label: "Net Profit", value: toLedgerCurrency(netProfit) }] : []),
    { label: "Paid In Full", value: `${totals?.closedRows || 0} / ${toLedgerCurrency(totals?.closedTotal)}` },
    ...(canViewMikeFinancials
      ? [
          { label: "Total Profit", value: toLedgerCurrency(totalProfit) },
          { label: "Profit Margin", value: profitMargin }
        ]
      : [])
  ];

  return (
    <section className="crm-ledger crm-bookkeeping-ledger">
      <div className="crm-bookkeeping-summary-grid">
        {summaryCards.map((card) =>
          card.action ? (
            <button
              type="button"
              className="crm-bookkeeping-summary-card crm-bookkeeping-summary-card-button"
              key={card.label}
              onClick={card.action}
            >
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              {card.detail ? <em>{card.detail}</em> : null}
            </button>
          ) : (
            <article className="crm-bookkeeping-summary-card" key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              {card.detail ? <em>{card.detail}</em> : null}
            </article>
          )
        )}
      </div>
      {missingCogs ? <p className="crm-bookkeeping-alert">{missingCogs} rows missing COGS.</p> : null}
      <div className="crm-bookkeeping-table-wrap">
        <table className="crm-bookkeeping-table crm-bookkeeping-table--legacy">
          <thead>
            <tr>
              <th>Customer / Quote</th>
              <th>Sold By</th>
              <th>Date</th>
              <th>Total</th>
              <th>Deposit</th>
              <th>PD/W</th>
              <th>COGS</th>
              <th>Advertising 7%</th>
              <th>Remake</th>
              <th>Installation</th>
              <th>Balance / Paid</th>
              <th>Ken</th>
              {canViewMikeFinancials ? <th>Mike</th> : null}
              <th>Jessica</th>
              {canViewMikeFinancials ? <th>Profit</th> : null}
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {statusGroups.map(([status, groupRows]) => {
              const groupTotals = bookkeepingGroupTotals(groupRows);
              return (
                <Fragment key={`readonly-status-group-${status}`}>
                  <tr className="crm-bookkeeping-group-row">
                    <td className="crm-bookkeeping-group-head" colSpan={canViewMikeFinancials ? 16 : 14}>
                      <div className="crm-bookkeeping-group-inner">
                        <em className="crm-bookkeeping-status" data-status={status}>
                          {bookkeepingStatusLabelForKey(status)}
                        </em>
                        <span className="crm-bookkeeping-group-meta">
                          {groupRows.length} {groupRows.length === 1 ? "job" : "jobs"} · {toLedgerCurrency(groupTotals.total)} total
                          {groupTotals.balance > 0 ? ` · ${toLedgerCurrency(groupTotals.balance)} open` : ""}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {groupRows.map((row) => (
                    <tr
                      className={bookkeepingStatusKey(row) === "closed" ? "crm-bookkeeping-row--closed" : undefined}
                      key={`readonly-${bookkeepingRowKey(row)}`}
                    >
                      <td>
                        <strong>{row.customerName}</strong>
                        <span className="crm-bookkeeping-customer-phone">{row.customerPhone || "Phone pending"}</span>
                        <span>{row.quoteNumber || row.source.replace("_", " ")}</span>
                        <em className="crm-bookkeeping-status" data-status={bookkeepingStatusKey(row)}>
                          {bookkeepingStatusLabel(row)}
                        </em>
                      </td>
                      <td className="crm-bookkeeping-soldby">{saleOwnerDisplayName(row.salesOwner)}</td>
                      <td>{formatShortDate(row.soldDate)}</td>
                      <td>{toLedgerCurrency(row.total)}</td>
                      <td>{toLedgerCurrency(row.depositPaid)}</td>
                      <td>{formatPaymentType(row.paymentType)}</td>
                      <td>{row.cogs <= 0 ? <span className="crm-bookkeeping-pill">Missing</span> : toLedgerCurrency(row.cogs)}</td>
                      <td className="crm-ledger-money-warn">{toLedgerCurrency(row.advertisingReserve)}</td>
                      <td className={row.remakeTotal > 0 ? "crm-ledger-money-warn" : undefined}>{toLedgerCurrency(-row.remakeTotal)}</td>
                      <td>
                        {row.isInstallationComplete ? (
                          toLedgerCurrency(row.installationInvoiceAmount)
                        ) : row.isMissingInstallerInvoice ? (
                          <span className="crm-bookkeeping-pill">Missing installer invoice</span>
                        ) : (
                          "No install invoice"
                        )}
                      </td>
                      <td className={row.balance > 0 ? "crm-ledger-money-warn" : "crm-ledger-money-good"}>
                        {toLedgerCurrency(row.balance)}
                      </td>
                      <td>
                        <PartnerPaymentAmountCell
                          person="ken"
                          row={row}
                          amount={row.kenCut}
                          item={paymentItemsByKey.get(partnerPaymentItemKeyForRow("ken", row))}
                          canMarkPartnerPaid={false}
                          busy={busy}
                          onMarkPartnerPaid={() => undefined}
                        />
                      </td>
                      {canViewMikeFinancials ? (
                        <td className="crm-ledger-money-good">
                          <PartnerPaymentAmountCell
                            person="mike"
                            row={row}
                            amount={row.mikeProfit}
                            item={paymentItemsByKey.get(partnerPaymentItemKeyForRow("mike", row))}
                            canMarkPartnerPaid={false}
                            busy={busy}
                            onMarkPartnerPaid={() => undefined}
                          />
                        </td>
                      ) : null}
                      <td>
                        <PartnerPaymentAmountCell
                          person="jessica"
                          row={row}
                          amount={row.jessicaCommission}
                          item={paymentItemsByKey.get(partnerPaymentItemKeyForRow("jessica", row))}
                          canMarkPartnerPaid={false}
                          busy={busy}
                          onMarkPartnerPaid={() => undefined}
                        />
                      </td>
                      {canViewMikeFinancials ? <td className="crm-ledger-money-good">{toLedgerCurrency(row.remainingProfitBeforeJessica)}</td> : null}
                      <td>{row.notes || ""}</td>
                    </tr>
                  ))}
                  <tr className="crm-bookkeeping-group-total-row">
                    <td>
                      <strong>{bookkeepingStatusLabelForKey(status)} totals</strong>
                      <span>{groupRows.length} {groupRows.length === 1 ? "job" : "jobs"}</span>
                    </td>
                    <td />
                    <td />
                    <td>{toLedgerCurrency(groupTotals.total)}</td>
                    <td>{toLedgerCurrency(groupTotals.depositPaid)}</td>
                    <td>-</td>
                    <td>{toLedgerCurrency(groupTotals.cogs)}</td>
                    <td className="crm-ledger-money-warn">{toLedgerCurrency(groupTotals.advertisingReserve)}</td>
                    <td>{toLedgerCurrency(-groupTotals.remake)}</td>
                    <td>{toLedgerCurrency(groupTotals.installation)}</td>
                    <td className={groupTotals.balance > 0 ? "crm-ledger-money-warn" : "crm-ledger-money-good"}>
                      {toLedgerCurrency(groupTotals.balance)}
                    </td>
                    <td className="crm-ledger-money-warn">{toLedgerCurrency(groupTotals.kenCut)}</td>
                    {canViewMikeFinancials ? <td className="crm-ledger-money-good">{toLedgerCurrency(groupTotals.mike)}</td> : null}
                    <td>{toLedgerCurrency(groupTotals.jessica)}</td>
                    {canViewMikeFinancials ? <td className="crm-ledger-money-good">{toLedgerCurrency(groupTotals.profit)}</td> : null}
                    <td />
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? <p className="crm-empty">No bookkeeping rows yet.</p> : null}
      </div>
    </section>
  );
}

function BookkeepingBalancePaidCell({
  row,
  busy,
  onEditBalance,
  onMarkPaid
}: {
  row: CrmBookkeepingRow;
  busy: boolean;
  onEditBalance: () => void;
  onMarkPaid: (row: CrmBookkeepingRow) => void;
}) {
  const paid = row.isPaidInFull;
  const canClick = !paid && row.balance > 0;
  const amountClass = row.balance > 0 ? "crm-ledger-money-warn" : "crm-ledger-money-good";
  const label = paid
    ? `Balance paid for ${row.customerName}`
    : canClick
      ? `Mark balance paid for ${row.customerName}`
      : `No balance due for ${row.customerName}`;
  const status = (
    <span className={`crm-partner-paid-box${paid ? " crm-partner-paid-box--paid" : ""}`} aria-hidden="true">
      {paid ? "✓" : ""}
    </span>
  );

  return (
    <span className="crm-bookkeeping-balance-paid-cell">
      <button
        type="button"
        className={`crm-bookkeeping-balance-paid-amount ${amountClass}`}
        onClick={onEditBalance}
        disabled={busy}
        aria-label={`Edit balance due for ${row.customerName}`}
        title={`Edit balance due for ${row.customerName}`}
      >
        {toLedgerCurrency(row.balance)}
      </button>
      {canClick ? (
        <button
          type="button"
          className="crm-bookkeeping-balance-paid-button crm-partner-paid-button"
          onClick={() => onMarkPaid(row)}
          disabled={busy}
          aria-label={label}
          title={label}
        >
          {status}
        </button>
      ) : (
        <span className="crm-bookkeeping-balance-paid-status crm-partner-paid-status" aria-label={label} title={label}>
          {status}
        </span>
      )}
    </span>
  );
}

function BookkeepingSpreadsheet({
  rows,
  totals,
  payoff,
  commissionSummary,
  partnerPaymentLedger,
  busy,
  canMarkPartnerPaid,
  onOpenPayments,
  onSave,
  onMarkBalancePaid,
  onMarkPartnerPaid,
  onDelete,
  onOpenPayoff
}: {
  rows: CrmBookkeepingRow[];
  totals: CrmDashboardData["bookkeepingTotals"] | undefined;
  payoff?: CrmDashboardData["kenPayoff"];
  commissionSummary: CrmCommissionSummary | undefined;
  partnerPaymentLedger: CrmDashboardData["partnerPaymentLedger"] | undefined;
  busy: boolean;
  canMarkPartnerPaid: boolean;
  onOpenPayments: (person: CrmPaymentPerson) => void;
  onSave: (row: CrmBookkeepingRow, patch: Record<string, unknown>) => Promise<void>;
  onMarkBalancePaid: (row: CrmBookkeepingRow) => void;
  onMarkPartnerPaid: (person: CrmPaymentPerson, item: CrmPartnerPaymentLedgerItem, row: CrmBookkeepingRow) => void;
  onDelete: (row: CrmBookkeepingRow) => void;
  onOpenPayoff: () => void;
}) {
  const canViewMikeFinancials = Boolean(totals && Object.hasOwn(totals, "mikeProfit"));
  const [editingCell, setEditingCell] = useState<BookkeepingCellEdit>(null);
  const totalProfit = roundCurrency(
    (totals?.total || 0) -
      (totals?.advertisingReserve || 0) -
      (totals?.cogs || 0) -
      (totals?.installationAmount || 0) -
      (totals?.expensesTotal || 0) -
      (totals?.remakeTotal || 0)
  );
  const netProfit = roundCurrency(totalProfit - (totals?.kenCut || 0));
  const profitMargin = totals?.total ? `${((totalProfit / totals.total) * 100).toFixed(1)}%` : "0.0%";
  const missingCogs = totals?.missingCogs || 0;
  const commissionTotals = commissionSummary?.totals;
  const paymentPeople = partnerPaymentLedger?.people;
  const paymentItemsByKey = useMemo(() => partnerPaymentItemMap(partnerPaymentLedger), [partnerPaymentLedger]);
  const buyoutLedger = partnerPaymentLedger?.kenBuyout;
  const buyoutRemaining = buyoutLedger?.remainingBalance ?? payoff?.payoffRemaining ?? payoff?.payoffTarget ?? 0;
  const buyoutPaid = buyoutLedger?.totalPaid ?? payoff?.kenPaid;
  const summaryCards: Array<{
    label: string;
    value: string;
    detail?: string;
    action?: () => void;
    person?: CrmPaymentPerson;
  }> = [
    { label: "Total Sales", value: toLedgerCurrency(totals?.total) },
    { label: "Open Balance", value: toLedgerCurrency(totals?.balance) },
    { label: "COGS", value: toLedgerCurrency(totals?.cogs) },
    { label: "Advertising Reserve (7%)", value: toLedgerCurrency(totals?.advertisingReserve) },
    { label: "Remake", value: toLedgerCurrency(-(totals?.remakeTotal || 0)) },
    { label: "Installation", value: toLedgerCurrency(totals?.installationAmount) },
    { label: "Expenses", value: toLedgerCurrency(totals?.expensesTotal) },
    { label: "Ken Profit", value: toLedgerCurrency(totals?.kenCut) },
    {
      label: "Buyout Ledger",
      value: toLedgerCurrency(buyoutRemaining),
      detail: `${toLedgerCurrency(buyoutPaid)} paid to Ken Hill`,
      action: onOpenPayoff
    },
    { label: "Ken's % Monthly Due", value: toLedgerCurrency(paymentPeople?.ken.owed ?? totals?.kenMonthlyDue), person: "ken" as const },
    { label: "Ken's % of Total Closed", value: toLedgerCurrency(totals?.kenTotalClosed), person: "ken" as const },
    { label: "Jessica Commission Due", value: toLedgerCurrency(paymentPeople?.jessica.owed ?? commissionTotals?.jessicaOwed), person: "jessica" as const },
    ...(canViewMikeFinancials
      ? [
          { label: "Mike Commission Due", value: toLedgerCurrency(paymentPeople?.mike.owed ?? commissionTotals?.mikeOwed), person: "mike" as const },
          { label: "Net Profit", value: toLedgerCurrency(netProfit) }
        ]
      : []),
    { label: "Paid In Full", value: `${totals?.closedRows || 0} / ${toLedgerCurrency(totals?.closedTotal)}` },
    ...(canViewMikeFinancials
      ? [
          { label: "Total Profit", value: toLedgerCurrency(totalProfit) },
          { label: "Profit Margin", value: profitMargin }
        ]
      : [])
  ];
  const isEditing = (row: CrmBookkeepingRow, field: BookkeepingEditableField) =>
    editingCell?.rowKey === bookkeepingRowKey(row) && editingCell.field === field;
  const openEdit = (row: CrmBookkeepingRow, field: BookkeepingEditableField) =>
    setEditingCell({ rowKey: bookkeepingRowKey(row), field });
  const closeEdit = () => setEditingCell(null);
  const saveCell = async (row: CrmBookkeepingRow, patch: Record<string, unknown>) => {
    await onSave(row, patch);
    closeEdit();
  };
  const statusGroups = useMemo(() => groupBookkeepingRowsByStatus(rows), [rows]);

  return (
    <section className="crm-ledger crm-bookkeeping-ledger">
      <div className="crm-bookkeeping-summary-grid">
        {summaryCards.map((card) =>
          card.action ? (
            <button
              type="button"
              className="crm-bookkeeping-summary-card crm-bookkeeping-summary-card-button"
              key={card.label}
              onClick={card.action}
            >
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              {card.detail ? <em>{card.detail}</em> : null}
            </button>
          ) : card.person ? (
            <button
              type="button"
              className="crm-bookkeeping-summary-card crm-bookkeeping-summary-card-button"
              key={card.label}
              onClick={() => onOpenPayments(card.person!)}
            >
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              {card.detail ? <em>{card.detail}</em> : null}
            </button>
          ) : (
            <article className="crm-bookkeeping-summary-card" key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              {card.detail ? <em>{card.detail}</em> : null}
            </article>
          )
        )}
      </div>
      {missingCogs ? <p className="crm-bookkeeping-alert">{missingCogs} rows missing COGS.</p> : null}
      <div className="crm-bookkeeping-table-wrap">
        <table className="crm-bookkeeping-table crm-bookkeeping-table--legacy">
          <thead>
            <tr>
              <th>Customer / Quote</th>
              <th>Sold By</th>
              <th>Date</th>
              <th>Total</th>
              <th>Deposit</th>
              <th>PD/W</th>
              <th>COGS</th>
              <th>Advertising 7%</th>
              <th>Remake</th>
              <th>Installation</th>
              <th>Balance / Paid</th>
              <th>Ken</th>
              {canViewMikeFinancials ? <th>Mike</th> : null}
              <th>Jessica</th>
              {canViewMikeFinancials ? <th>Profit</th> : null}
              <th>Notes</th>
              <th className="crm-bookkeeping-delete-col" aria-label="Delete" />
            </tr>
          </thead>
          <tbody>
            {statusGroups.map(([status, groupRows]) => {
              const groupTotals = bookkeepingGroupTotals(groupRows);
              return (
                <Fragment key={`status-group-${status}`}>
                  <tr className="crm-bookkeeping-group-row">
                    <td className="crm-bookkeeping-group-head" colSpan={canViewMikeFinancials ? 17 : 15}>
                      <div className="crm-bookkeeping-group-inner">
                        <em className="crm-bookkeeping-status" data-status={status}>
                          {bookkeepingStatusLabelForKey(status)}
                        </em>
                        <span className="crm-bookkeeping-group-meta">
                          {groupRows.length} {groupRows.length === 1 ? "job" : "jobs"} · {toLedgerCurrency(groupTotals.total)} total
                          {groupTotals.balance > 0 ? ` · ${toLedgerCurrency(groupTotals.balance)} open` : ""}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {groupRows.map((row) => (
              <tr className={bookkeepingStatusKey(row) === "closed" ? "crm-bookkeeping-row--closed" : undefined} key={bookkeepingRowKey(row)}>
                <td>
                  {isEditing(row, "customer") ? (
                    <BookkeepingCustomerEditor row={row} busy={busy} onSave={(patch) => saveCell(row, patch)} onCancel={closeEdit} />
                  ) : (
                    <BookkeepingCellButton ariaLabel={`Edit customer and owner for ${row.customerName}`} onClick={() => openEdit(row, "customer")}>
                      <strong>{row.customerName}</strong>
                      <span className="crm-bookkeeping-customer-phone">{row.customerPhone || "Phone pending"}</span>
                      <span>{row.quoteNumber || row.source.replace("_", " ")}</span>
                      <em className="crm-bookkeeping-status" data-status={bookkeepingStatusKey(row)}>
                        {bookkeepingStatusLabel(row)}
                      </em>
                    </BookkeepingCellButton>
                  )}
                </td>
                <td className="crm-bookkeeping-soldby">{saleOwnerDisplayName(row.salesOwner)}</td>
                <td>
                  {isEditing(row, "soldDate") ? (
                    <BookkeepingInlineTextEditor
                      type="date"
                      defaultValue={dateInputValue(row.soldDate)}
                      busy={busy}
                      onSave={(value) => saveCell(row, { sold_date: value })}
                      onCancel={closeEdit}
                    />
                  ) : (
                    <BookkeepingCellButton ariaLabel={`Edit date for ${row.customerName}`} onClick={() => openEdit(row, "soldDate")}>
                      {formatShortDate(row.soldDate)}
                    </BookkeepingCellButton>
                  )}
                </td>
                <td>
                  {isEditing(row, "total") ? (
                    <BookkeepingInlineTextEditor
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={row.total || ""}
                      busy={busy}
                      onSave={(value) => saveCell(row, { total_amount: Number(value || 0) })}
                      onCancel={closeEdit}
                    />
                  ) : (
                    <BookkeepingCellButton ariaLabel={`Edit total for ${row.customerName}`} onClick={() => openEdit(row, "total")}>
                      {toLedgerCurrency(row.total)}
                    </BookkeepingCellButton>
                  )}
                </td>
                <td>
                  {isEditing(row, "payment") ? (
                    <BookkeepingPaymentEditor busy={busy} onSave={(patch) => saveCell(row, patch)} onCancel={closeEdit} />
                  ) : (
                    <BookkeepingCellButton ariaLabel={`Add payment for ${row.customerName}`} onClick={() => openEdit(row, "payment")}>
                      {toLedgerCurrency(row.depositPaid)}
                    </BookkeepingCellButton>
                  )}
                </td>
                <td>
                  {isEditing(row, "paymentType") ? (
                    <BookkeepingInlineSelectEditor
                      defaultValue={row.paymentType || "other"}
                      options={paymentTypes}
                      busy={busy}
                      onSave={(value) => saveCell(row, { payment_type: value })}
                      onCancel={closeEdit}
                    />
                  ) : (
                    <BookkeepingCellButton ariaLabel={`Edit payment type for ${row.customerName}`} onClick={() => openEdit(row, "paymentType")}>
                      {formatPaymentType(row.paymentType)}
                    </BookkeepingCellButton>
                  )}
                </td>
                <td>
                  {isEditing(row, "cogs") ? (
                    <BookkeepingInlineTextEditor
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={row.cogs || ""}
                      placeholder="Missing"
                      busy={busy}
                      onSave={(value) => saveCell(row, { cogs_amount: Number(value || 0) })}
                      onCancel={closeEdit}
                    />
                  ) : (
                    <BookkeepingCellButton ariaLabel={`Edit COGS for ${row.customerName}`} onClick={() => openEdit(row, "cogs")}>
                      {row.cogs <= 0 ? <span className="crm-bookkeeping-pill">Missing</span> : toLedgerCurrency(row.cogs)}
                    </BookkeepingCellButton>
                  )}
                </td>
                <td className="crm-ledger-money-warn">{toLedgerCurrency(row.advertisingReserve)}</td>
                <td>
                  {isEditing(row, "remake") ? (
                    <BookkeepingInlineTextEditor
                      type="number"
                      step="0.01"
                      defaultValue={row.remakeTotal ? -row.remakeTotal : ""}
                      placeholder="0.00"
                      busy={busy}
                      onSave={(value) => saveCell(row, { remake_amount: value })}
                      onCancel={closeEdit}
                    />
                  ) : (
                    <BookkeepingCellButton
                      ariaLabel={`Edit remake cost for ${row.customerName}`}
                      className={row.remakeTotal > 0 ? "crm-ledger-money-warn" : undefined}
                      onClick={() => openEdit(row, "remake")}
                    >
                      {toLedgerCurrency(-row.remakeTotal)}
                    </BookkeepingCellButton>
                  )}
                </td>
                <td>
                  {isEditing(row, "installation") ? (
                    <BookkeepingInstallationEditor row={row} busy={busy} onSave={(patch) => saveCell(row, patch)} onCancel={closeEdit} />
                  ) : (
                    <BookkeepingCellButton ariaLabel={`Edit installation for ${row.customerName}`} onClick={() => openEdit(row, "installation")}>
                      {row.isInstallationComplete ? (
                        toLedgerCurrency(row.installationInvoiceAmount)
                      ) : row.isMissingInstallerInvoice ? (
                        <span className="crm-bookkeeping-pill">Missing installer invoice</span>
                      ) : (
                        "No install invoice"
                      )}
                      {row.installationInvoiceAmount > 0 ? (
                        <span className={row.installationInvoiceOpenAmount > 0 ? "crm-bookkeeping-install-open" : "crm-bookkeeping-install-paid"}>
                          {row.installationInvoiceOpenAmount > 0
                            ? `${toLedgerCurrency(row.installationInvoiceOpenAmount)} open`
                            : `${toLedgerCurrency(row.installationInvoicePaidAmount)} paid`}
                        </span>
                      ) : null}
                    </BookkeepingCellButton>
                  )}
                </td>
                <td>
                  {isEditing(row, "balance") ? (
                    <BookkeepingInlineTextEditor
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={row.balance}
                      busy={busy}
                      onSave={(value) => saveCell(row, { balance_due_target: Number(value || 0) })}
                      onCancel={closeEdit}
                    />
                  ) : (
                    <BookkeepingBalancePaidCell row={row} busy={busy} onEditBalance={() => openEdit(row, "balance")} onMarkPaid={onMarkBalancePaid} />
                  )}
                </td>
                <td>
                  {isEditing(row, "ken") ? (
                    <BookkeepingInlineTextEditor
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={row.kenCutOverride ?? ""}
                      placeholder="Auto"
                      busy={busy}
                      onSave={(value) => saveCell(row, { ken_cut_override: value === "" ? null : Number(value || 0) })}
                      onCancel={closeEdit}
                    />
                  ) : (
                    <div className="crm-bookkeeping-ken-cell">
                      <PartnerPaymentAmountCell
                        person="ken"
                        row={row}
                        amount={row.kenCut}
                        item={paymentItemsByKey.get(partnerPaymentItemKeyForRow("ken", row))}
                        canMarkPartnerPaid={canMarkPartnerPaid}
                        busy={busy}
                        onMarkPartnerPaid={onMarkPartnerPaid}
                      />
                      <button
                        type="button"
                        className="crm-bookkeeping-ken-override"
                        onClick={() => openEdit(row, "ken")}
                        disabled={busy}
                        aria-label={`Edit Ken override for ${row.customerName}`}
                        title="Edit Ken override"
                      >
                        Override
                      </button>
                    </div>
                  )}
                </td>
                {canViewMikeFinancials ? (
                  <td className="crm-ledger-money-good">
                    <PartnerPaymentAmountCell
                      person="mike"
                      row={row}
                      amount={row.mikeProfit}
                      item={paymentItemsByKey.get(partnerPaymentItemKeyForRow("mike", row))}
                      canMarkPartnerPaid={canMarkPartnerPaid}
                      busy={busy}
                      onMarkPartnerPaid={onMarkPartnerPaid}
                    />
                  </td>
                ) : null}
                <td>
                  <PartnerPaymentAmountCell
                    person="jessica"
                    row={row}
                    amount={row.jessicaCommission}
                    item={paymentItemsByKey.get(partnerPaymentItemKeyForRow("jessica", row))}
                    canMarkPartnerPaid={canMarkPartnerPaid}
                    busy={busy}
                    onMarkPartnerPaid={onMarkPartnerPaid}
                  />
                </td>
                {canViewMikeFinancials ? <td className="crm-ledger-money-good">{toLedgerCurrency(row.remainingProfitBeforeJessica)}</td> : null}
                <td>
                  {isEditing(row, "notes") ? (
                    <BookkeepingInlineTextEditor
                      defaultValue={row.notes || ""}
                      busy={busy}
                      onSave={(value) => saveCell(row, { notes: value })}
                      onCancel={closeEdit}
                    />
                  ) : (
                    <BookkeepingCellButton
                      ariaLabel={`Edit notes for ${row.customerName}`}
                      className="crm-bookkeeping-note-cell"
                      onClick={() => openEdit(row, "notes")}
                    >
                      {row.notes || "Click to add note"}
                    </BookkeepingCellButton>
                  )}
                </td>
                <td className="crm-bookkeeping-delete-col">
                  <button
                    type="button"
                    className="crm-bookkeeping-delete"
                    onClick={() => onDelete(row)}
                    disabled={busy}
                    aria-label={`Hide the bookkeeping row for ${row.customerName}`}
                    title={`Hide this bookkeeping row for ${row.customerName}`}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
                      <path
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
                  ))}
                  <tr className="crm-bookkeeping-group-total-row">
                    <td>
                      <strong>{bookkeepingStatusLabelForKey(status)} totals</strong>
                      <span>{groupRows.length} {groupRows.length === 1 ? "job" : "jobs"}</span>
                    </td>
                    <td />
                    <td />
                    <td>{toLedgerCurrency(groupTotals.total)}</td>
                    <td>{toLedgerCurrency(groupTotals.depositPaid)}</td>
                    <td>-</td>
                    <td>{toLedgerCurrency(groupTotals.cogs)}</td>
                    <td className="crm-ledger-money-warn">{toLedgerCurrency(groupTotals.advertisingReserve)}</td>
                    <td>{toLedgerCurrency(-groupTotals.remake)}</td>
                    <td>{toLedgerCurrency(groupTotals.installation)}</td>
                    <td className={groupTotals.balance > 0 ? "crm-ledger-money-warn" : "crm-ledger-money-good"}>{toLedgerCurrency(groupTotals.balance)}</td>
                    <td className="crm-ledger-money-warn">{toLedgerCurrency(groupTotals.kenCut)}</td>
                    {canViewMikeFinancials ? <td className="crm-ledger-money-good">{toLedgerCurrency(groupTotals.mike)}</td> : null}
                    <td>{toLedgerCurrency(groupTotals.jessica)}</td>
                    {canViewMikeFinancials ? <td className="crm-ledger-money-good">{toLedgerCurrency(groupTotals.profit)}</td> : null}
                    <td />
                    <td />
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? <p className="crm-empty">No bookkeeping rows yet.</p> : null}
      </div>
    </section>
  );
}

function roundCurrency(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// Lifecycle order the ledger groups rows by: open/actionable stages first, with
// fully-paid ("closed") work parked at the bottom. The per-row badge and the
// group headers both read from this so the status shown always reflects the
// live state of the row.
const BOOKKEEPING_STATUS_ORDER = [
  "sold",
  "approved",
  "ordered",
  "received",
  "installed",
  "invoiced",
  "paid",
  "manual",
  "draft",
  "sent",
  "archived",
  "lost",
  "closed"
];

const BOOKKEEPING_STATUS_LABELS: Record<string, string> = {
  sold: "Sold",
  approved: "Approved",
  ordered: "Ordered",
  received: "Received",
  installed: "Installed",
  invoiced: "Invoiced",
  paid: "Paid",
  manual: "Manual",
  legacy: "Legacy",
  draft: "Draft",
  sent: "Sent",
  archived: "Archived",
  lost: "Lost",
  closed: "Closed"
};

// The effective, real-time status of a ledger row. Paid-in-full always wins
// (the balance has hit zero), legacy/manual imports read as "sold"; everything
// else follows the live quote/entry status.
function bookkeepingStatusKey(row: CrmBookkeepingRow): string {
  return effectiveBookkeepingStatus(row);
}

function bookkeepingStatusRank(status: string) {
  const index = BOOKKEEPING_STATUS_ORDER.indexOf(status);
  return index === -1 ? BOOKKEEPING_STATUS_ORDER.length : index;
}

function bookkeepingStatusLabelForKey(status: string) {
  return BOOKKEEPING_STATUS_LABELS[status] || status;
}

function bookkeepingStatusLabel(row: CrmBookkeepingRow) {
  return bookkeepingStatusLabelForKey(bookkeepingStatusKey(row));
}

// Bucket rows by their live status, ordered by pipeline stage. Rows arrive
// already sorted newest-first, so each group stays date-sorted within itself.
function groupBookkeepingRowsByStatus(rows: CrmBookkeepingRow[]): Array<[string, CrmBookkeepingRow[]]> {
  const map = new Map<string, CrmBookkeepingRow[]>();
  for (const row of rows) {
    const key = bookkeepingStatusKey(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return [...map.entries()].sort(([a], [b]) => bookkeepingStatusRank(a) - bookkeepingStatusRank(b));
}

function bookkeepingGroupTotals(rows: CrmBookkeepingRow[]) {
  return rows.reduce(
    (totals, row) => ({
      total: roundCurrency(totals.total + row.total),
      depositPaid: roundCurrency(totals.depositPaid + row.depositPaid),
      cogs: roundCurrency(totals.cogs + row.cogs),
      advertisingReserve: roundCurrency(totals.advertisingReserve + row.advertisingReserve),
      remake: roundCurrency(totals.remake + row.remakeTotal),
      installation: roundCurrency(totals.installation + (row.isInstallationComplete ? row.installationInvoiceAmount : 0)),
      balance: roundCurrency(totals.balance + Math.max(row.balance, 0)),
      kenCut: roundCurrency(totals.kenCut + row.kenCut),
      mike: roundCurrency(totals.mike + row.mikeProfit),
      jessica: roundCurrency(totals.jessica + row.jessicaCommission),
      profit: roundCurrency(totals.profit + row.remainingProfitBeforeJessica)
    }),
    {
      total: 0,
      depositPaid: 0,
      cogs: 0,
      advertisingReserve: 0,
      remake: 0,
      installation: 0,
      balance: 0,
      kenCut: 0,
      mike: 0,
      jessica: 0,
      profit: 0
    }
  );
}

function OrderBoard({
  quotes,
  onUpdate,
  busy,
  onOpenBuilder,
  onOpenContract
}: {
  quotes: CrmQuote[];
  onUpdate: (event: FormEvent<HTMLFormElement>, quote: CrmQuote) => Promise<void>;
  busy: boolean;
  onOpenBuilder: (quoteId: string) => void;
  onOpenContract: (quoteId: string) => void;
}) {
  return (
    <section className="crm-ledger">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Orders</p>
          <h2>Sold Job Tracking</h2>
        </div>
      </div>
      <div className="crm-order-grid">
        {quotes.map((quote) => (
          <article className="crm-order-card" key={quote.id}>
            <div className="crm-order-card-head">
              <div>
                <h3>{quote.customer_name || "Linked job"}</h3>
                <span>{quote.quote_number || quote.id.slice(0, 8)}</span>
              </div>
              <strong>{toCurrency(quote.quote_total)}</strong>
            </div>
            <div className="crm-quote-actions" role="group" aria-label="Quote actions">
              <button
                type="button"
                className="crm-quote-action-button crm-quote-action-button--primary"
                onClick={() => onOpenBuilder(quote.id)}
                aria-label="Open quote builder"
              >
                Builder
              </button>
              <button
                type="button"
                className="crm-quote-action-button"
                onClick={() => onOpenContract(quote.id)}
                disabled={busy}
                aria-label="Open quote contract"
              >
                Contract
              </button>
            </div>
            <form className="crm-order-form" onSubmit={(event) => onUpdate(event, quote)}>
              <div className="crm-field-row">
                <label>
                  Status
                  <select className="crm-status-select" data-status={quote.status} name="status" defaultValue={quote.status}>
                    {crmQuoteStatuses.map((status) => (
                      <option value={status} key={status}>
                        {status.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  COGS
                  <input name="materials_cost" type="number" min="0" step="0.01" defaultValue={quote.materials_cost || ""} />
                </label>
              </div>
              <div className="crm-field-row">
                <label>
                  Quote Total
                  <input name="quote_total" type="number" min="0" step="0.01" defaultValue={quote.quote_total || ""} />
                </label>
                <label>
                  Sold By
                  <select name="sold_by" defaultValue={quote.sold_by || "Unassigned"}>
                    {ownerOptions.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="crm-field-row">
                <label>
                  Add Payment
                  <input name="payment_amount" type="number" min="0" step="0.01" placeholder="0" />
                </label>
                <label>
                  Payment Type
                  <select name="payment_type" defaultValue="other">
                    {paymentTypes.map((item) => (
                      <option value={item.value} key={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="crm-field-row">
                <label>
                  Manufacturer
                  <input name="manufacturer_name" defaultValue={quote.manufacturer_name || ""} />
                </label>
                <label>
                  Order #
                  <input name="manufacturer_order_ref" defaultValue={quote.manufacturer_order_ref || ""} />
                </label>
              </div>
              <label>
                Order Link
                <input name="manufacturer_order_url" defaultValue={quote.manufacturer_order_url || ""} />
              </label>
              <label>
                Document Link
                <input name="manufacturer_document_url" defaultValue={quote.manufacturer_document_url || ""} />
              </label>
              <label>
                Notes
                <textarea name="notes" rows={3} defaultValue={quote.notes || ""} />
              </label>
              <button type="submit" disabled={busy}>
                Update Order
              </button>
            </form>
          </article>
        ))}
        {!quotes.length ? <p className="crm-empty">No quotes or sold jobs yet.</p> : null}
      </div>
    </section>
  );
}

const AVAILABILITY_SLOTS = bookingSlotTimes.map((time) => ({
  time,
  label: calendarTimeFormatter.format(zonedTimeToUtc("2026-01-05", time))
}));

const AVAILABILITY_REPS = ["Jessica", "Mike"];

type AvailabilitySlotRow = CrmAvailabilitySlot & { date: string; time: string };

function availabilitySlotKey(date: string, time: string) {
  return `${date} ${time}`;
}

function availabilityMonthValue(date: string) {
  return date.slice(0, 7);
}

function buildAvailabilityLookup(slots: AvailabilitySlotRow[]) {
  const lookup = new Map<string, string[]>();

  slots.forEach((slot) => {
    if ((slot.status || "available") !== "available") return;
    const key = availabilitySlotKey(slot.date, slot.time);
    const owners = lookup.get(key) || [];
    if (!owners.includes(slot.owner)) owners.push(slot.owner);
    lookup.set(
      key,
      owners.sort((first, second) => {
        const firstIndex = AVAILABILITY_REPS.indexOf(first);
        const secondIndex = AVAILABILITY_REPS.indexOf(second);
        return (firstIndex < 0 ? 99 : firstIndex) - (secondIndex < 0 ? 99 : secondIndex);
      })
    );
  });

  return lookup;
}

function availabilityOwnersLabel(owners: string[]) {
  if (!owners.length) return "No open time";
  return `Open for ${owners.join(", ")}`;
}

function isSlotOpenForCalendarEvent(owners: string[], event: CrmCalendarEvent) {
  if (!owners.length) return false;
  const assignedTo = cleanCalendarText(event.assigned_to);
  if (!assignedTo || assignedTo === "Unassigned") return true;
  return owners.includes(assignedTo);
}

function currentMonthValue() {
  return losAngelesDateString().slice(0, 7);
}

function shiftMonthValue(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function availabilityMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "America/Los_Angeles"
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1, 12)));
}

function availabilityDayLabel(date: string) {
  const [year, monthNumber, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles"
  }).format(new Date(Date.UTC(year, monthNumber - 1, day, 12)));
}

function availabilityMonthDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: count }, (_value, index) => {
    const day = index + 1;
    return `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
}

function isSlotBooked(owner: string, date: string, time: string, events: CrmCalendarEvent[]) {
  const start = zonedTimeToUtc(date, time);
  const end = new Date(start.getTime() + bookingSlotDurationMinutes * 60 * 1000);
  return events.some(
    (event) =>
      event.status !== "canceled" &&
      (event.event_type === "block" || event.assigned_to === owner) &&
      new Date(event.start_at) < end &&
      new Date(event.end_at) > start
  );
}

function AvailabilityBoard({
  session,
  events,
  embedded = false
}: {
  session: Session;
  events: CrmCalendarEvent[];
  embedded?: boolean;
}) {
  const [owner, setOwner] = useState("Jessica");
  const [month, setMonth] = useState(currentMonthValue());
  const [slots, setSlots] = useState<AvailabilitySlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    crmFetch<{ slots: AvailabilitySlotRow[] }>(session, `/api/crm/availability?month=${month}`)
      .then((result) => {
        if (active) setSlots(result.slots || []);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load open times.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session, month]);

  const openKeys = useMemo(() => {
    const keys = new Set<string>();
    slots.filter((slot) => slot.owner === owner).forEach((slot) => keys.add(`${slot.date} ${slot.time}`));
    return keys;
  }, [slots, owner]);

  const today = losAngelesDateString();
  const days = useMemo(() => availabilityMonthDays(month).filter((date) => date >= today), [month, today]);

  async function reloadSlots() {
    const result = await crmFetch<{ slots: AvailabilitySlotRow[] }>(
      session,
      `/api/crm/availability?month=${month}`
    );
    setSlots(result.slots || []);
  }

  async function setAvailability(date: string, time: string, open: boolean) {
    await crmFetch(session, "/api/crm/availability", {
      method: open ? "POST" : "DELETE",
      body: JSON.stringify({ owner, date, time })
    });
  }

  async function toggle(date: string, time: string) {
    const key = `${date} ${time}`;
    const isOpen = openKeys.has(key);
    setBusyKey(key);
    setError(null);
    try {
      await setAvailability(date, time, !isOpen);
      await reloadSlots();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update open times.");
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleDay(date: string) {
    const openableSlots = AVAILABILITY_SLOTS.filter((slot) => !isSlotBooked(owner, date, slot.time, events));
    const shouldOpen = openableSlots.some((slot) => !openKeys.has(`${date} ${slot.time}`));
    const targetSlots = openableSlots.filter((slot) =>
      shouldOpen ? !openKeys.has(`${date} ${slot.time}`) : openKeys.has(`${date} ${slot.time}`)
    );

    if (!targetSlots.length) return;

    setBusyKey(`${date} all`);
    setError(null);
    try {
      for (const slot of targetSlots) {
        await setAvailability(date, slot.time, shouldOpen);
      }
      await reloadSlots();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update the full day.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className={`crm-workspace crm-workspace-wide crm-availability-workspace${embedded ? " crm-availability-workspace--embedded" : ""}`}>
      <aside className="crm-panel">
        <h2>Open Times</h2>
        <p className="crm-help">
          Turn on the appointment slots each rep is available for. Customers can only book slots a rep has opened —
          every slot is closed by default.
        </p>
        <label>
          Rep
          <select value={owner} onChange={(event) => setOwner(event.target.value)}>
            {AVAILABILITY_REPS.map((rep) => (
              <option key={rep}>{rep}</option>
            ))}
          </select>
        </label>
        <div className="crm-availability-month-controls">
          <button type="button" className="crm-ghost-button" onClick={() => setMonth(shiftMonthValue(month, -1))}>
            Prev
          </button>
          <strong>{availabilityMonthLabel(month)}</strong>
          <button type="button" className="crm-ghost-button" onClick={() => setMonth(shiftMonthValue(month, 1))}>
            Next
          </button>
        </div>
        {error ? <p className="crm-alert">{error}</p> : null}
      </aside>

      <div className="crm-availability-panel">
        {loading ? (
          <p className="crm-empty">Loading open times...</p>
        ) : days.length === 0 ? (
          <p className="crm-empty">No upcoming days this month.</p>
        ) : (
          <div className="crm-availability-grid-wrap">
            <table className="crm-availability-grid">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>All Day</th>
                {AVAILABILITY_SLOTS.map((slot) => (
                    <th key={slot.time}>{slot.label}</th>
                ))}
                </tr>
              </thead>
              <tbody>
              {days.map((date) => (
                <tr key={date}>
                    <th scope="row">
                    {availabilityDayLabel(date)}
                  </th>
                    {(() => {
                      const openableSlots = AVAILABILITY_SLOTS.filter(
                        (slot) => !isSlotBooked(owner, date, slot.time, events)
                      );
                      const allOpen =
                        openableSlots.length > 0 &&
                        openableSlots.every((slot) => openKeys.has(`${date} ${slot.time}`));
                      const someOpen = openableSlots.some((slot) => openKeys.has(`${date} ${slot.time}`));
                      const dayBusy = busyKey === `${date} all`;

                      return (
                        <td>
                          <button
                            type="button"
                            className={`crm-availability-day-button${allOpen ? " crm-availability-day-button--open" : ""}${
                              someOpen && !allOpen ? " crm-availability-day-button--partial" : ""
                            }`}
                            onClick={() => toggleDay(date)}
                            disabled={!openableSlots.length || dayBusy}
                          >
                            {allOpen ? "Clear Day" : "All Day"}
                          </button>
                        </td>
                      );
                    })()}
                  {AVAILABILITY_SLOTS.map((slot) => {
                    const key = `${date} ${slot.time}`;
                    const open = openKeys.has(key);
                    const booked = isSlotBooked(owner, date, slot.time, events);
                      const busy = busyKey === key || busyKey === `${date} all`;
                      const label = booked ? "Booked" : open ? "Available" : "Closed";
                    return (
                        <td key={slot.time}>
                        <button
                          type="button"
                            className={`crm-availability-slot${open ? " crm-availability-slot--open" : ""}${
                              booked ? " crm-availability-slot--booked" : ""
                            }`}
                          onClick={() => toggle(date, slot.time)}
                            disabled={booked || busy}
                            title={booked ? "Already booked" : open ? "Available - click to close" : "Closed - click to open"}
                        >
                          {label}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function CalendarPlanner({
  session,
  events,
  anchorDate,
  view,
  canOverrideAvailability,
  onDateChange,
  onViewChange,
  onSelectSlot,
  onRescheduleEvent,
  onOpenEvent
}: {
  session: Session;
  events: CrmCalendarEvent[];
  anchorDate: string;
  view: CalendarView;
  canOverrideAvailability: boolean;
  onDateChange: (date: string) => void;
  onViewChange: (view: CalendarView) => void;
  onSelectSlot: (slot: CalendarSlotSelection) => void;
  onRescheduleEvent: (event: CrmCalendarEvent, slot: CalendarSlotSelection) => void;
  onOpenEvent: (event: CrmCalendarEvent) => void;
}) {
  const today = losAngelesDateString();
  const weekStart = startOfCalendarWeek(anchorDate);
  const weekDays = useMemo(() => calendarWeekDays(startOfCalendarWeek(anchorDate)), [anchorDate]);
  const monthStart = startOfCalendarMonth(anchorDate);
  const monthDays = useMemo(() => calendarMonthDays(anchorDate), [anchorDate]);
  const timelineDays = useMemo(() => (view === "day" ? [anchorDate] : weekDays), [anchorDate, view, weekDays]);
  const rangeStart = view === "month" ? monthDays[0] : timelineDays[0];
  const rangeEnd = view === "month" ? addCalendarDays(monthDays[monthDays.length - 1], 1) : addCalendarDays(timelineDays[timelineDays.length - 1], 1);
  const visibleEvents = calendarEventsForRange(events, rangeStart, rangeEnd);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlotRow[]>([]);
  const [customerBookableSlots, setCustomerBookableSlots] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const availabilityMonths = useMemo(
    () => (view === "month" ? [] : Array.from(new Set(timelineDays.map(availabilityMonthValue)))),
    [timelineDays, view]
  );
  const availabilityMonthKey = availabilityMonths.join("|");
  const rangeLabel =
    view === "day"
      ? formatCalendarLongDay(anchorDate)
      : view === "week"
        ? `${formatCalendarDay(weekStart)} - ${formatCalendarDay(weekDays[weekDays.length - 1])}`
        : formatCalendarMonth(monthStart);

  useEffect(() => {
    let active = true;
    const months = availabilityMonthKey ? availabilityMonthKey.split("|") : [];

    if (!months.length) {
      setAvailabilitySlots([]);
      setCustomerBookableSlots([]);
      setAvailabilityLoading(false);
      setAvailabilityError(null);
      return () => {
        active = false;
      };
    }

    setAvailabilityLoading(true);
    setAvailabilityError(null);

    Promise.all(
      months.map(async (month) => {
        const [managedAvailability, bookingResponse] = await Promise.all([
          crmFetch<{ slots: AvailabilitySlotRow[] }>(session, `/api/crm/availability?month=${month}`),
          fetch(`/api/booking/availability?month=${month}`, { cache: "no-store" })
        ]);
        const bookingAvailability = (await bookingResponse.json().catch(() => ({}))) as BookingAvailabilityResponse & {
          message?: string;
        };

        if (!bookingResponse.ok) {
          throw new Error(bookingAvailability.message || "Customer booking times could not be loaded.");
        }

        return { managedAvailability, bookingAvailability };
      })
    )
      .then((results) => {
        if (!active) return;
        setAvailabilitySlots(results.flatMap((result) => result.managedAvailability.slots || []));
        setCustomerBookableSlots([
          ...customerBookableSlotKeys(results.map((result) => result.bookingAvailability))
        ]);
      })
      .catch((error) => {
        if (!active) return;
        setAvailabilitySlots([]);
        setCustomerBookableSlots([]);
        setAvailabilityError(error instanceof Error ? error.message : "Open times could not be loaded.");
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });

    return () => {
      active = false;
    };
  }, [availabilityMonthKey, session]);

  function moveCalendar(direction: -1 | 1) {
    if (view === "day") {
      onDateChange(addCalendarDays(anchorDate, direction));
      return;
    }

    if (view === "week") {
      onDateChange(addCalendarDays(anchorDate, direction * 7));
      return;
    }

    onDateChange(addCalendarMonths(anchorDate, direction));
  }

  function openDay(day: string) {
    onDateChange(day);
    onViewChange("day");
  }

  return (
    <section className="crm-calendar-board">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2>Sales Appointment Calendar</h2>
        </div>
        <div className="crm-calendar-actions">
          <div className="crm-calendar-view-switch" aria-label="Calendar view">
            {calendarViewOptions.map((option) => (
              <button
                type="button"
                aria-pressed={view === option.value}
                className={view === option.value ? "active" : ""}
                key={option.value}
                onClick={() => onViewChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="crm-calendar-nav" aria-label={`${view} calendar navigation`}>
            <button type="button" className="crm-ghost-button" onClick={() => moveCalendar(-1)}>
              Previous
            </button>
            <button type="button" className="crm-ghost-button" onClick={() => onDateChange(today)}>
              Today
            </button>
            <button type="button" className="crm-ghost-button" onClick={() => moveCalendar(1)}>
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="crm-calendar-week-label">
        <strong>{rangeLabel}</strong>
        <span>{visibleEvents.length} scheduled</span>
      </div>
      {availabilityError && view !== "month" ? <p className="crm-calendar-open-times-error">{availabilityError}</p> : null}

      {view === "month" ? (
        <CalendarMonthGrid
          days={monthDays}
          events={visibleEvents}
          monthStart={monthStart}
          today={today}
          onOpenDay={openDay}
          onOpenEvent={onOpenEvent}
        />
      ) : (
        <CalendarTimelineGrid
          days={timelineDays}
          events={visibleEvents}
          availabilitySlots={availabilitySlots}
          customerBookableSlots={customerBookableSlots}
          availabilityLoading={availabilityLoading}
          canOverrideAvailability={canOverrideAvailability}
          onSelectSlot={onSelectSlot}
          onRescheduleEvent={onRescheduleEvent}
          onOpenEvent={onOpenEvent}
          view={view}
        />
      )}
    </section>
  );
}

function CalendarTimelineGrid({
  days,
  events,
  availabilitySlots,
  customerBookableSlots,
  availabilityLoading,
  canOverrideAvailability,
  onSelectSlot,
  onRescheduleEvent,
  onOpenEvent,
  view
}: {
  days: string[];
  events: CrmCalendarEvent[];
  availabilitySlots: AvailabilitySlotRow[];
  customerBookableSlots: string[];
  availabilityLoading: boolean;
  canOverrideAvailability: boolean;
  onSelectSlot: (slot: CalendarSlotSelection) => void;
  onRescheduleEvent: (event: CrmCalendarEvent, slot: CalendarSlotSelection) => void;
  onOpenEvent: (event: CrmCalendarEvent) => void;
  view: "day" | "week";
}) {
  const overlapLayout = useMemo(() => buildCalendarOverlapLayout(events), [events]);
  const availabilityLookup = useMemo(() => buildAvailabilityLookup(availabilitySlots), [availabilitySlots]);
  const customerBookableLookup = useMemo(() => new Set(customerBookableSlots), [customerBookableSlots]);

  function availabilityOwnersForSlot(date: string, time: string) {
    return availabilityLookup.get(availabilitySlotKey(date, time)) || [];
  }

  function draggedEvent(dragEvent: DragEvent<HTMLElement>) {
    const eventId =
      dragEvent.dataTransfer.getData("application/x-crm-calendar-event-id") ||
      dragEvent.dataTransfer.getData("text/plain");
    return events.find((calendarEvent) => calendarEvent.id === eventId && canRescheduleCalendarEvent(calendarEvent)) || null;
  }

  function slotFromGridPointer(dragEvent: DragEvent<HTMLDivElement>, calendarEvent: CrmCalendarEvent) {
    const rect = dragEvent.currentTarget.getBoundingClientRect();
    const x = dragEvent.clientX - rect.left;
    const y = dragEvent.clientY - rect.top;
    const timeColumnWidth = 58;
    const headerHeight = 48;
    const rowHeight = 76;

    if (x < timeColumnWidth || y < headerHeight) return null;

    const dayColumnWidth = (rect.width - timeColumnWidth) / days.length;
    const dayIndex = Math.floor((x - timeColumnWidth) / dayColumnWidth);
    const slotIndex = Math.floor((y - headerHeight) / rowHeight);

    if (dayIndex < 0 || dayIndex >= days.length || slotIndex < 0 || slotIndex >= calendarSlotTimes.length) return null;

    const date = days[dayIndex];
    const time = calendarSlotTimes[slotIndex];
    return calendarSlotSelection(date, time, calendarEventDurationMinutes(calendarEvent));
  }

  function handleGridDragOver(dragEvent: DragEvent<HTMLDivElement>) {
    const calendarEvent = draggedEvent(dragEvent);
    if (!calendarEvent) return;
    const slot = slotFromGridPointer(dragEvent, calendarEvent);
    const openOwners = slot ? availabilityOwnersForSlot(slot.date, slot.time) : [];
    if (!slot || isPastCalendarSlot(slot.date, slot.time)) return;
    if (!canOverrideAvailability && !isSlotOpenForCalendarEvent(openOwners, calendarEvent)) return;

    dragEvent.preventDefault();
    dragEvent.dataTransfer.dropEffect = "move";
  }

  function handleGridDrop(dragEvent: DragEvent<HTMLDivElement>) {
    const calendarEvent = draggedEvent(dragEvent);
    if (!calendarEvent) return;
    const slot = slotFromGridPointer(dragEvent, calendarEvent);
    const openOwners = slot ? availabilityOwnersForSlot(slot.date, slot.time) : [];
    if (!slot || isPastCalendarSlot(slot.date, slot.time)) return;
    if (!canOverrideAvailability && !isSlotOpenForCalendarEvent(openOwners, calendarEvent)) return;

    dragEvent.preventDefault();
    onRescheduleEvent(calendarEvent, slot);
  }

  function handleEventDragStart(dragEvent: DragEvent<HTMLElement>, calendarEvent: CrmCalendarEvent) {
    if (!canRescheduleCalendarEvent(calendarEvent)) {
      dragEvent.preventDefault();
      return;
    }

    dragEvent.dataTransfer.effectAllowed = "move";
    dragEvent.dataTransfer.setData("application/x-crm-calendar-event-id", calendarEvent.id);
    dragEvent.dataTransfer.setData("text/plain", calendarEvent.id);
  }

  return (
    <div className="crm-calendar-grid-wrap">
      <div
        className={`crm-calendar-grid crm-calendar-grid--${view}`}
        onDragOver={handleGridDragOver}
        onDrop={handleGridDrop}
        style={{ gridTemplateRows: `48px repeat(${calendarSlotTimes.length}, 76px)` }}
      >
        <div className="crm-calendar-time-head" style={{ gridColumn: 1, gridRow: 1 }}>Time</div>
        {days.map((day, dayIndex) => (
          <div className="crm-calendar-day-head" key={day} style={{ gridColumn: dayIndex + 2, gridRow: 1 }}>
            <span>{formatCalendarWeekday(day)}</span>
            <strong>{formatCalendarDayNumber(day)}</strong>
            <em>{calendarEventsForDay(events, day).length || "0"} appt</em>
          </div>
        ))}

        {calendarSlotTimes.map((time, rowIndex) => (
          <Fragment key={time}>
            <div className="crm-calendar-time-label" style={{ gridColumn: 1, gridRow: rowIndex + 2 }}>
              <strong>{formatCalendarSlotTime(time)}</strong>
              <span>{calendarTimeFormatter.format(new Date(calendarSlotSelection("2026-01-05", time).endAt))}</span>
            </div>
            {days.map((day, dayIndex) => {
              const event = findCalendarEventForSlot(events, day, time);
              const past = isPastCalendarSlot(day, time);
              const openOwners = availabilityOwnersForSlot(day, time);
              const available = customerBookableLookup.has(availabilitySlotKey(day, time));
              const pending = availabilityLoading && !available;
              const slot = calendarSlotSelection(day, time);
              const overridable = canOverrideAvailability && !event && !past && !pending && !available && !availabilityLoading;
              const selectable = (!event && !past && available && !availabilityLoading) || overridable;
              const slotLabel = event ? "Booked" : past ? "Past" : pending ? "Checking" : available ? "Available" : "Blocked";
              const slotDetail = event
                ? "Scheduled"
                : past
                  ? "Unavailable"
                  : pending
                    ? "Open times"
                    : available
                      ? openOwners.length
                        ? availabilityOwnersLabel(openOwners)
                        : "Open for online booking"
                      : overridable
                        ? "Admin: book anyway"
                        : "No open time";

              return (
                <button
                  type="button"
                  aria-label={`${slotLabel} ${formatCalendarLongDay(day)} ${formatCalendarSlotTime(time)}`}
                  className={`crm-calendar-slot${event ? " crm-calendar-slot--taken" : ""}${past ? " crm-calendar-slot--past" : ""}${
                    !event && !past && !pending && available ? " crm-calendar-slot--available" : ""
                  }${!event && !past && !pending && !available ? " crm-calendar-slot--blocked" : ""}${
                    overridable ? " crm-calendar-slot--override" : ""
                  }${pending ? " crm-calendar-slot--pending" : ""}`}
                  disabled={!selectable}
                  key={`${day}-${time}`}
                  onClick={() => onSelectSlot({ ...slot, availableOwners: openOwners })}
                  style={{ gridColumn: dayIndex + 2, gridRow: rowIndex + 2 }}
                >
                  <span>{slotLabel}</span>
                  <small>{slotDetail}</small>
                </button>
              );
            })}
          </Fragment>
        ))}
        {events.map((event) => {
          const placement = calendarEventPlacement(event, days);
          if (!placement) return null;
          const overlap = overlapLayout.get(event.id) || { lane: 0, laneCount: 1 };
          const detailLines = calendarEventSecondaryDescriptionLines(event);
          const descriptionLabel = calendarEventDescriptionLabel(event);
          const canManage = canRescheduleCalendarEvent(event);
          const assignmentLabel = event.event_type === "block" ? "" : calendarEventAssignmentLabel(event);
          const customerPhone = cleanCalendarText(event.customer_phone);
          const { bannerLabel } = calendarEventSalePresentation(event);

          return (
            <article
              aria-label={descriptionLabel}
              className={`${calendarEventClassName(event)}${canManage ? " crm-calendar-event-block--interactive" : ""}`}
              draggable={canManage}
              key={event.id}
              onClick={canManage ? () => onOpenEvent(event) : undefined}
              onDragStart={(dragEvent) => handleEventDragStart(dragEvent, event)}
              onKeyDown={
                canManage
                  ? (keyEvent) => {
                      if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
                      keyEvent.preventDefault();
                      onOpenEvent(event);
                    }
                  : undefined
              }
              role={canManage ? "button" : undefined}
              style={{
                gridColumn: placement.column,
                gridRow: `${placement.rowStart} / ${placement.rowEnd}`,
                ...(overlap.laneCount > 1
                  ? {
                      justifySelf: "start",
                      transform: `translateX(${overlap.lane * 100}%)`,
                      width: `calc((100% - 12px) / ${overlap.laneCount})`,
                    }
                  : {}),
              }}
              tabIndex={canManage ? 0 : undefined}
              title={descriptionLabel}
            >
              {bannerLabel ? <div className="crm-calendar-event-status-banner">{bannerLabel}</div> : null}
              <div className="crm-calendar-event-time">
                <span>
                  {calendarTimeFormatter.format(new Date(event.start_at))} -{" "}
                  {calendarTimeFormatter.format(new Date(event.end_at))}
                </span>
                <b>{calendarEventDurationLabel(event)}</b>
              </div>
              <div className="crm-calendar-event-heading">
                <h3>{calendarEventCustomerLabel(event)}</h3>
                {assignmentLabel ? <span className="crm-calendar-event-owner-badge">{assignmentLabel}</span> : null}
              </div>
              {customerPhone ? <p className="crm-calendar-event-phone">{customerPhone}</p> : null}
              <div className="crm-calendar-event-details">
                {detailLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function CalendarMonthGrid({
  days,
  events,
  monthStart,
  today,
  onOpenDay,
  onOpenEvent
}: {
  days: string[];
  events: CrmCalendarEvent[];
  monthStart: string;
  today: string;
  onOpenDay: (day: string) => void;
  onOpenEvent: (event: CrmCalendarEvent) => void;
}) {
  const weekdays = calendarWeekDays(startOfCalendarWeek(monthStart));

  return (
    <div className="crm-calendar-month-wrap">
      <div className="crm-calendar-month-grid">
        {weekdays.map((day) => (
          <div className="crm-calendar-month-head" key={day}>
            {formatCalendarWeekday(day)}
          </div>
        ))}
        {days.map((day) => {
          const dayEvents = calendarEventsForDay(events, day).sort((first, second) => new Date(first.start_at).getTime() - new Date(second.start_at).getTime());
          const eventPreview = dayEvents.slice(0, 3);
          const outsideMonth = startOfCalendarMonth(day) !== monthStart;
          const className = [
            "crm-calendar-month-cell",
            outsideMonth ? "crm-calendar-month-cell--outside" : "",
            day === today ? "crm-calendar-month-cell--today" : ""
          ].filter(Boolean).join(" ");

          return (
            <article className={className} key={day}>
              <button type="button" className="crm-calendar-month-date" onClick={() => onOpenDay(day)} aria-label={`Open day view for ${formatCalendarLongDay(day)}`}>
                <span>{formatCalendarDayNumber(day)}</span>
                <em>{dayEvents.length || "0"} appt</em>
              </button>
              <div className="crm-calendar-month-events">
                {eventPreview.map((event) => {
                  const className = `crm-calendar-month-event ${calendarEventToneClassName(event)}`;
                  const customerPhone = cleanCalendarText(event.customer_phone);
                  const { bannerLabel } = calendarEventSalePresentation(event);
                  const preview = (
                    <>
                      {bannerLabel ? <b className="crm-calendar-event-status-banner">{bannerLabel}</b> : null}
                      <strong>{calendarTimeFormatter.format(new Date(event.start_at))}</strong>
                      <span>{calendarEventCustomerLabel(event)}</span>
                      {customerPhone ? <em>{customerPhone}</em> : null}
                    </>
                  );

                  return canRescheduleCalendarEvent(event) ? (
                    <button type="button" className={className} key={event.id} onClick={() => onOpenEvent(event)}>
                      {preview}
                    </button>
                  ) : (
                    <div className={className} key={event.id}>
                      {preview}
                    </div>
                  );
                })}
                {dayEvents.length > eventPreview.length ? (
                  <button type="button" className="crm-calendar-month-more" onClick={() => onOpenDay(day)}>
                    +{dayEvents.length - eventPreview.length} more
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function KenPaymentRow({
  payment,
  busy,
  onEdit,
  onDelete,
  readOnly = false
}: {
  payment: CrmKenPayment;
  busy: boolean;
  onEdit?: (event: FormEvent<HTMLFormElement>, payment: CrmKenPayment) => void;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing && onEdit) {
    return (
      <tr>
        <td colSpan={5}>
          <form
            className="crm-inline-form"
            onSubmit={(event) => {
              onEdit(event, payment);
              setEditing(false);
            }}
          >
            <input name="amount" type="number" min="0" step="0.01" defaultValue={payment.amount} aria-label="Amount" />
            <input name="paid_on" type="date" defaultValue={payment.paid_on || ""} aria-label="Check date" />
            <input name="period_month" type="date" defaultValue={payment.period_month || ""} aria-label="For month" />
            <input name="note" defaultValue={payment.note || ""} placeholder="Note" aria-label="Note" />
            <button type="submit" disabled={busy}>
              Save
            </button>
            <button type="button" className="crm-ghost-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{formatShortDate(payment.paid_on)}</td>
      <td>{payment.period_month ? formatShortDate(payment.period_month) : "—"}</td>
      <td>{toCurrency(payment.amount)}</td>
      <td>{payment.note || ""}</td>
      {readOnly ? null : (
        <td>
          <button type="button" className="crm-ghost-button" onClick={() => setEditing(true)} disabled={busy}>
            Edit
          </button>
          <button type="button" className="crm-ghost-button" onClick={() => onDelete?.(payment.id)} disabled={busy}>
            Delete
          </button>
        </td>
      )}
    </tr>
  );
}

function KenPayoffView({
  payoff,
  buyoutLedger,
  payments,
  onRecord,
  onEdit,
  onDelete,
  onSaveSettings,
  busy,
  readOnly = false
}: {
  payoff: CrmKenPayoffSummary | undefined;
  buyoutLedger?: CrmDashboardData["partnerPaymentLedger"]["kenBuyout"];
  payments: CrmKenPayment[];
  onRecord?: (event: FormEvent<HTMLFormElement>) => void;
  onEdit?: (event: FormEvent<HTMLFormElement>, payment: CrmKenPayment) => void;
  onDelete?: (id: string) => void;
  onSaveSettings?: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  readOnly?: boolean;
}) {
  const target = buyoutLedger?.target || payoff?.payoffTarget || 500000;
  const remaining = buyoutLedger?.remainingBalance ?? payoff?.payoffRemaining ?? target;
  const paid = buyoutLedger?.totalPaid ?? payoff?.kenPaid ?? 0;
  const pct = buyoutLedger?.paidPct ?? payoff?.payoffPct ?? 0;
  const owed = payoff?.kenOwed || 0;
  const isPaidOff = buyoutLedger ? buyoutLedger.remainingBalance <= 0 : payoff?.isPaidOff;

  return (
    <section className="crm-workspace crm-workspace-wide">
      {!readOnly && onRecord && onSaveSettings ? (
      <CollapsiblePanel title="Record Ken Payment">
        <form className="crm-form" onSubmit={onRecord}>
          <label>
            Amount
            <input name="amount" type="number" min="0" step="0.01" required defaultValue={owed > 0 ? owed : ""} />
          </label>
          <div className="crm-field-row">
            <label>
              Check Date
              <input name="paid_on" type="date" defaultValue={lastDayOfMonthInputValue()} />
            </label>
            <label>
              For Month
              <input name="period_month" type="date" defaultValue={lastDayOfMonthInputValue()} />
            </label>
          </div>
          <label>
            Note
            <textarea name="note" rows={3} placeholder="Check #, month covered..." />
          </label>
          <button type="submit" disabled={busy}>
            Record Payment
          </button>
          <p className="crm-help">Suggested amount = 10% of completed (paid-in-full) jobs not yet paid to Ken.</p>
        </form>

        <h2 className="crm-panel-subhead">Payoff Settings</h2>
        <form className="crm-form" onSubmit={onSaveSettings}>
          <label>
            Already Paid Ken (opening balance)
            <input name="ken_opening_balance" type="number" min="0" step="0.01" defaultValue={payoff?.openingBalance ?? 0} />
          </label>
          <p className="crm-help">Total payoff target is fixed at {toCurrency(target)}.</p>
          <button type="submit" disabled={busy}>
            Save Settings
          </button>
        </form>
      </CollapsiblePanel>
      ) : null}

      <div className="crm-ledger">
        <div className="crm-section-head">
          <div>
            <p className="eyebrow">Business Payoff</p>
            <h2>Buying 805 From Ken</h2>
          </div>
          {isPaidOff ? <strong className="crm-paidoff">PAID OFF</strong> : null}
        </div>

        <div className="crm-payoff-hero">
          <span>Remaining to pay off</span>
          <strong>{toCurrency(remaining)}</strong>
          <div className="crm-payoff-bar">
            <div className="crm-payoff-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <p>
            {toCurrency(paid)} of {toCurrency(target)} paid ({pct}%)
          </p>
        </div>

        <div className="crm-payoff-stats">
          <div>
            <span>Payoff target</span>
            <strong>{toCurrency(target)}</strong>
            <em>purchase total</em>
          </div>
          <div>
            <span>Due to Ken now</span>
            <strong className={owed > 0 ? "warn" : ""}>{toCurrency(owed)}</strong>
            <em>10% of completed, unpaid</em>
          </div>
          <div>
            <span>Completed jobs</span>
            <strong>{payoff?.completedJobs || 0}</strong>
            <em>customer paid in full</em>
          </div>
          <div>
            <span>Ken earned (completed)</span>
            <strong>{toCurrency(payoff?.kenAccruedCompleted)}</strong>
            <em>lifetime 10%</em>
          </div>
          <div>
            <span>Ken paid to date</span>
            <strong>{toCurrency(paid)}</strong>
            <em>500K ledger payments</em>
          </div>
        </div>

        <div className="crm-payoff-payments">
          <h3>{buyoutLedger ? "500K Payment History" : "Payment History"}</h3>
          <table className="crm-bookkeeping-table">
            {buyoutLedger ? (
              <>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Payment</th>
                    <th>Applied</th>
                    <th>Remaining</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {buyoutLedger.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatShortDate(payment.paidOn)}</td>
                      <td>{toLedgerCurrency(payment.amount)}</td>
                      <td>{toLedgerCurrency(payment.runningPaid)}</td>
                      <td>{toLedgerCurrency(payment.remainingBalance)}</td>
                      <td>{payment.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    <th>Check Date</th>
                    <th>For Month</th>
                    <th>Amount</th>
                    <th>Note</th>
                    {readOnly ? null : <th aria-label="Actions" />}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <KenPaymentRow
                      key={payment.id}
                      payment={payment}
                      busy={busy}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      readOnly={readOnly}
                    />
                  ))}
                </tbody>
              </>
            )}
          </table>
          {buyoutLedger && !buyoutLedger.payments.length ? (
            <p className="crm-empty">No 500K ledger payments applied yet.</p>
          ) : !buyoutLedger && !payments.length ? (
            <p className="crm-empty">No Ken checks recorded yet.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CalendarAppointmentModal({
  selectedSlot,
  busy,
  onClose,
  onSubmit
}: {
  selectedSlot: CalendarSlotSelection;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const defaultAssignedTo = selectedSlot.availableOwners?.[0] || "Unassigned";

  return (
    <div className="crm-slot-modal" role="dialog" aria-modal="true" aria-labelledby="crm-slot-modal-title">
      <button type="button" className="crm-slot-modal__backdrop" aria-label="Close appointment form" onClick={onClose} />
      <section className="crm-slot-form-panel">
        <div className="crm-slot-form-head">
          <div>
            <p className="eyebrow">New Appointment</p>
            <h2 id="crm-slot-modal-title">{formatCalendarLongDay(selectedSlot.date)}</h2>
          </div>
          <button type="button" className="crm-slot-close" aria-label="Close appointment form" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="crm-slot-time-summary">{formatCalendarSlotRange(selectedSlot)}</p>
        {!selectedSlot.availableOwners?.length ? (
          <p className="crm-slot-override-note">Admin override: this time is outside the open availability windows.</p>
        ) : null}
        <form className="crm-form" onSubmit={onSubmit}>
          <div className="crm-field-row">
            <label>
              Customer
              <input name="customer_name" required placeholder="Customer name" autoFocus />
            </label>
            <label>
              Phone
              <input name="phone" required placeholder="805-000-0000" />
            </label>
          </div>
          <div className="crm-field-row">
            <label>
              Email
              <input name="email" type="email" placeholder="customer@email.com" />
            </label>
            <label>
              City
              <input name="city" placeholder="Ventura" />
            </label>
          </div>
          <label>
            Address
            <AddressAutocomplete name="address" cityFieldName="city" placeholder="Project address" />
          </label>
          <div className="crm-field-row">
            <label>
              Product
              <select name="product_interest" defaultValue="Shutters">
                {productOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Assigned
              <select name="assigned_to" defaultValue={defaultAssignedTo}>
                {ownerOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Lead Source
            <LeadSourceSelect />
          </label>
          <label>
            Job Notes
            <textarea name="notes" rows={4} placeholder="Gate code, rooms, samples to bring..." />
          </label>
          <div className="crm-slot-actions">
            <button type="button" className="crm-ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save Appointment"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CalendarRescheduleModal({
  event,
  busy,
  onClose,
  onSubmit
}: {
  event: CrmCalendarEvent;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const date = calendarEventDateValue(event);
  const time = calendarEventTimeValue(event);
  const durationMinutes = calendarEventDurationMinutes(event);

  return (
    <div className="crm-slot-modal" role="dialog" aria-modal="true" aria-labelledby="crm-reschedule-modal-title">
      <button type="button" className="crm-slot-modal__backdrop" aria-label="Close reschedule form" onClick={onClose} />
      <section className="crm-slot-form-panel">
        <div className="crm-slot-form-head">
          <div>
            <p className="eyebrow">Reschedule</p>
            <h2 id="crm-reschedule-modal-title">{calendarEventCustomerLabel(event)}</h2>
          </div>
          <button type="button" className="crm-slot-close" aria-label="Close reschedule form" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="crm-slot-time-summary">
          {formatCalendarLongDay(date)} - {calendarTimeFormatter.format(new Date(event.start_at))} -{" "}
          {calendarTimeFormatter.format(new Date(event.end_at))}
        </p>
        <form className="crm-form" onSubmit={onSubmit}>
          <div className="crm-field-row">
            <label>
              Date
              <input name="date" type="date" required defaultValue={date} />
            </label>
            <label>
              Time
              <select name="time" required defaultValue={time}>
                {calendarEventTimeOptions(event).map((option) => (
                  <option value={option} key={option}>
                    {formatCalendarSlotTime(option)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Duration
              <select name="duration" required defaultValue={String(durationMinutes)}>
                {calendarAppointmentDurationChoices(durationMinutes).map((minutes) => (
                  <option value={minutes} key={minutes}>
                    {calendarAppointmentDurationLabel(minutes)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="crm-slot-actions">
            <button type="button" className="crm-ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save New Time"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CalendarAppointmentDetailModal({
  event,
  onClose,
  onReschedule,
  onCancel
}: {
  event: CrmCalendarEvent;
  onClose: () => void;
  onReschedule: (event: CrmCalendarEvent) => void;
  onCancel: (event: CrmCalendarEvent) => void;
}) {
  const date = calendarEventDateValue(event);
  const detailLines = calendarEventSecondaryDescriptionLines(event);
  const assignmentLabel = event.event_type === "block" ? "" : calendarEventAssignmentLabel(event);
  const customerPhone = cleanCalendarText(event.customer_phone);

  return (
    <div className="crm-slot-modal" role="dialog" aria-modal="true" aria-labelledby="crm-appointment-detail-title">
      <button type="button" className="crm-slot-modal__backdrop" aria-label="Close appointment details" onClick={onClose} />
      <section className="crm-slot-form-panel">
        <div className="crm-slot-form-head">
          <div>
            <p className="eyebrow">Appointment</p>
            <h2 id="crm-appointment-detail-title">{calendarEventCustomerLabel(event)}</h2>
          </div>
          <button type="button" className="crm-slot-close" aria-label="Close appointment details" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="crm-slot-time-summary">
          {formatCalendarLongDay(date)} - {calendarTimeFormatter.format(new Date(event.start_at))} -{" "}
          {calendarTimeFormatter.format(new Date(event.end_at))}
        </p>
        {customerPhone ? <p className="crm-slot-phone-summary">Phone: {customerPhone}</p> : null}
        <div className="crm-appointment-detail-lines">
          {assignmentLabel ? <p>Scheduled for: {assignmentLabel}</p> : null}
          {detailLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <div className="crm-slot-actions">
          <button type="button" className="crm-ghost-button" onClick={onClose}>
            Close
          </button>
          <button type="button" onClick={() => onReschedule(event)}>
            Reschedule
          </button>
          <button type="button" className="crm-danger-button" onClick={() => onCancel(event)}>
            Cancel Appointment
          </button>
        </div>
      </section>
    </div>
  );
}

function CalendarCancelModal({
  event,
  busy,
  onClose,
  onConfirm
}: {
  event: CrmCalendarEvent;
  busy: boolean;
  onClose: () => void;
  onConfirm: (event: CrmCalendarEvent) => Promise<void>;
}) {
  const date = calendarEventDateValue(event);

  return (
    <div className="crm-slot-modal" role="dialog" aria-modal="true" aria-labelledby="crm-cancel-modal-title">
      <button type="button" className="crm-slot-modal__backdrop" aria-label="Close cancel form" onClick={onClose} />
      <section className="crm-slot-form-panel">
        <div className="crm-slot-form-head">
          <div>
            <p className="eyebrow">Cancel Appointment</p>
            <h2 id="crm-cancel-modal-title">{calendarEventCustomerLabel(event)}</h2>
          </div>
          <button type="button" className="crm-slot-close" aria-label="Close cancel form" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="crm-slot-time-summary">
          {formatCalendarLongDay(date)} - {calendarTimeFormatter.format(new Date(event.start_at))} -{" "}
          {calendarTimeFormatter.format(new Date(event.end_at))}
        </p>
        <div className="crm-slot-actions">
          <button type="button" className="crm-ghost-button" onClick={onClose} disabled={busy}>
            Keep Appointment
          </button>
          <button type="button" className="crm-danger-button" onClick={() => void onConfirm(event)} disabled={busy}>
            {busy ? "Canceling..." : "Cancel Appointment"}
          </button>
        </div>
      </section>
    </div>
  );
}

function PaymentPlanSection({
  job,
  suggestedTotal,
  busy,
  onPaymentPlanAction
}: {
  job: CrmJob;
  suggestedTotal: number;
  busy: boolean;
  onPaymentPlanAction?: (jobId: string, action: PaymentPlanUiAction) => Promise<boolean>;
}) {
  const plan = getPaymentPlanMeta(job.meta);
  const openPlan = plan && (plan.status === "pending_install" || plan.status === "active") ? plan : null;
  const defaultTotal = suggestedTotal > 0 ? suggestedTotal : Math.round(((Number(job.estimated_total) || 0) / 2) * 100) / 100;
  const [amount, setAmount] = useState<string>(defaultTotal ? String(defaultTotal) : "");
  const [count, setCount] = useState<string>("6");
  const [method, setMethod] = useState<CrmPaymentPlanMethod>("square_autopay");
  const [passCardFee, setPassCardFee] = useState(true);
  const cardFeeActive = method === "square_autopay" && passCardFee;
  const perMonthBase = Number(amount) > 0 && Number(count) > 0 ? Number(amount) / Number(count) : 0;
  const perMonthCharge = cardFeeActive ? perMonthBase * 1.03 : perMonthBase;

  const paidCount = openPlan ? openPlan.installments.filter((inst) => inst.paid_at).length : 0;
  const summaryLabel = openPlan
    ? openPlan.status === "pending_install"
      ? "Waiting for install"
      : `${paidCount}/${openPlan.installment_count} paid`
    : plan
      ? titleCase(plan.status)
      : "None";

  return (
    <details className="crm-drill-line-section crm-payment-plan-section">
      <summary>
        <span>Payment Plan</span>
        <em>{summaryLabel}</em>
      </summary>
      <div className="crm-drill-line-list">
        {openPlan ? (
          <>
            <div className="crm-drill-line-item">
              <strong>
                {toLedgerCurrency(openPlan.financed_total)} over {openPlan.installment_count} monthly payment
                {openPlan.installment_count === 1 ? "" : "s"} - 0% interest
                {openPlan.card_fee_percent ? ` + ${openPlan.card_fee_percent}% card fee (customer pays)` : ""}
              </strong>
              <span>
                {PAYMENT_PLAN_METHOD_LABELS[openPlan.method] || openPlan.method}
                {openPlan.status === "pending_install"
                  ? " / Schedule starts the day of installation (first payment due that day)"
                  : ` / Started ${formatShortDate(openPlan.activated_at)}`}
              </span>
            </div>
            {openPlan.method === "square_autopay" ? (
              <div className="crm-drill-line-item crm-payment-plan-autopay">
                <strong>
                  {openPlan.autopay?.status === "linked"
                    ? `Autopay ON - ${(openPlan.autopay.card_brand || "card").toUpperCase()} ending ${openPlan.autopay.card_last4 || "????"}`
                    : "Autopay: customer has not saved a card yet"}
                </strong>
                {openPlan.autopay?.status === "linked" ? (
                  <span>Each due installment is charged automatically by the daily sweep.</span>
                ) : (
                  <span>Send them the secure card setup link (it is also texted automatically on install day).</span>
                )}
                {openPlan.autopay?.token ? (
                  <button
                    type="button"
                    className="crm-ghost-button"
                    onClick={() => {
                      const link = `${window.location.origin}/autopay/${openPlan.autopay?.token}`;
                      void navigator.clipboard?.writeText(link);
                      window.alert(`Card setup link copied:\n${link}`);
                    }}
                  >
                    Copy card setup link
                  </button>
                ) : null}
              </div>
            ) : null}
            {openPlan.installments.map((inst) => (
              <div className="crm-drill-line-item crm-payment-plan-installment" key={inst.seq}>
                <strong>
                  Payment {inst.seq}/{openPlan.installment_count}
                </strong>
                <span>
                  {toLedgerCurrency(installmentChargeAmount(inst))}
                  {inst.card_fee ? ` (${toLedgerCurrency(inst.amount)} + ${toLedgerCurrency(inst.card_fee)} card fee)` : ""}
                  {inst.due_date ? ` / due ${formatShortDate(inst.due_date)}` : " / due date set at install"}
                  {inst.paid_at ? ` / PAID ${formatShortDate(inst.paid_at)}${inst.payment_type ? ` (${titleCase(inst.payment_type)})` : ""}` : ""}
                </span>
                {!inst.paid_at && onPaymentPlanAction ? (
                  <button
                    type="button"
                    className="crm-ghost-button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Mark payment ${inst.seq} of ${openPlan.installment_count} (${toLedgerCurrency(installmentChargeAmount(inst))}) as paid?\n\nIt will also be recorded in the bookkeeping ledger.`)) {
                        void onPaymentPlanAction(job.id, { op: "mark_paid", seq: inst.seq });
                      }
                    }}
                  >
                    Mark paid
                  </button>
                ) : null}
              </div>
            ))}
            {onPaymentPlanAction ? (
              <div className="crm-payment-plan-actions">
                <button
                  type="button"
                  className="crm-ghost-button"
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt("Cancel this payment plan? Add a short reason:");
                    if (reason !== null) {
                      void onPaymentPlanAction(job.id, { op: "cancel", reason: reason || undefined });
                    }
                  }}
                >
                  Cancel plan
                </button>
              </div>
            ) : null}
          </>
        ) : onPaymentPlanAction ? (
          <div className="crm-payment-plan-form">
            <p className="crm-payment-plan-hint">
              In-house plan: 0% interest, 50% deposit already collected up front, first payment due the day of
              installation, then monthly.
            </p>
            <label>
              Amount to finance
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Remaining balance"
              />
            </label>
            <label>
              Monthly payments
              <select value={count} onChange={(event) => setCount(event.target.value)}>
                {["2", "3", "4", "5", "6"].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Collected by
              <select value={method} onChange={(event) => setMethod(event.target.value as CrmPaymentPlanMethod)}>
                <option value="square_autopay">Square autopay (card on file)</option>
                <option value="zelle">Zelle</option>
                <option value="other">Other</option>
              </select>
            </label>
            {method === "square_autopay" ? (
              <label className="crm-payment-plan-fee-toggle">
                <input
                  type="checkbox"
                  checked={passCardFee}
                  onChange={(event) => setPassCardFee(event.target.checked)}
                />
                Customer pays the 3% card processing fee (credit cards only - waive it if they use a debit card)
              </label>
            ) : null}
            <button
              type="button"
              className="crm-ghost-button"
              disabled={busy || !Number(amount)}
              onClick={() =>
                void onPaymentPlanAction(job.id, {
                  op: "create",
                  payload: {
                    financed_total: Number(amount),
                    installment_count: Number(count),
                    method,
                    card_fee_percent: cardFeeActive ? 3 : 0
                  }
                })
              }
            >
              Create payment plan
            </button>
            {perMonthBase > 0 ? (
              <p className="crm-payment-plan-hint">
                = {toLedgerCurrency(perMonthCharge)} per month for {count} months
                {cardFeeActive ? ` (${toLedgerCurrency(perMonthBase)} + 3% card fee)` : ""}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="crm-empty">No payment plan on this job.</p>
        )}
      </div>
    </details>
  );
}
