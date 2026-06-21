"use client";

import { FormEvent, Fragment, ReactNode, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { formatPaymentType, isPaidInFullBookkeepingRow } from "@/lib/crm/bookkeeping";
import { isAllowedCrmEmail } from "@/lib/crm/allowed-users";
import { productInterestOptions } from "@/lib/product-interest-options";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  bookingSlotDurationMinutes,
  bookingSlotTimes,
  losAngelesDateString,
  zonedTimeToUtc
} from "@/lib/booking/availability";
import { QuoteBuilderPanel } from "@/components/crm/QuoteBuilderPanel";
import { QuotesWorkspace } from "@/components/crm/quotes/QuotesWorkspace";
import {
  CrmAccountabilityItem,
  CrmAvailabilitySlot,
  CrmBookkeepingPaymentType,
  CrmBookkeepingRow,
  CrmCalendarEvent,
  CrmCustomerFile,
  CrmDashboardData,
  CrmInstallationInvoiceEmail,
  CrmJob,
  CrmJobStatus,
  CrmKenPayment,
  CrmKenPayoffSummary,
  CrmQuote,
  CrmQuoteStatus,
  crmJobStatuses,
  crmQuoteStatuses
} from "@/lib/crm/types";

type CrmTab = "command" | "quotes" | "customers" | "jobs" | "bookkeeping" | "orders" | "calendar" | "availability" | "payoff";
type JobStatusFilter = CrmJobStatus | null;
type CustomerFileFilter = "need_to_schedule" | "scheduled" | "quoted" | "sold" | "ordered" | "completed";

type CrmUser = {
  email: string;
  displayName: string | null;
};

const jobColumns: Array<{ status: CrmJobStatus; label: string }> = crmJobStatuses.map((status) => ({
  status,
  label: titleCase(status)
}));

const productOptions = [...productInterestOptions, "Mixed"];
const ownerOptions = ["Mike", "Jessica", "Unassigned"];
const paymentTypes: Array<{ value: CrmBookkeepingPaymentType; label: string }> = [
  { value: "zelle", label: "Zelle" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit Card" },
  { value: "other", label: "Other" }
];
const customerFileFilters: Array<{ value: CustomerFileFilter; label: string }> = [
  { value: "need_to_schedule", label: "Need to Schedule" },
  { value: "scheduled", label: "Scheduled" },
  { value: "quoted", label: "Quoted" },
  { value: "sold", label: "Sold" },
  { value: "ordered", label: "Ordered" },
  { value: "completed", label: "Completed" }
];
const calendarSlotHours = bookingSlotTimes.map((time) => Number(time.slice(0, 2)));
const calendarTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles"
});
const calendarHourFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
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
  hour: number;
  startAt: string;
  endAt: string;
};
type CalendarView = "day" | "week" | "month";

const calendarViewOptions: Array<{ value: CalendarView; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" }
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

function calendarTimeValue(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function calendarSlotStart(date: string, hour: number) {
  return zonedTimeToUtc(date, calendarTimeValue(hour));
}

function calendarSlotSelection(date: string, hour: number): CalendarSlotSelection {
  const start = calendarSlotStart(date, hour);
  const end = new Date(start.getTime() + bookingSlotDurationMinutes * 60 * 1000);

  return {
    date,
    hour,
    startAt: start.toISOString(),
    endAt: end.toISOString()
  };
}

function formatCalendarHour(hour: number) {
  return calendarHourFormatter.format(calendarSlotStart("2026-01-05", hour));
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

function findCalendarEventForSlot(events: CrmCalendarEvent[], date: string, hour: number) {
  const selection = calendarSlotSelection(date, hour);
  const slotStart = new Date(selection.startAt);
  const slotEnd = new Date(selection.endAt);

  return events.find((event) => {
    if (!isActiveCalendarEvent(event)) return false;
    const eventStart = new Date(event.start_at);
    const eventEnd = new Date(event.end_at);
    return slotStart < eventEnd && slotEnd > eventStart;
  });
}

function isPastCalendarSlot(date: string, hour: number) {
  const selection = calendarSlotSelection(date, hour);
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
  const overlappingRows = calendarSlotHours
    .map((hour, index) => {
      const slot = calendarSlotSelection(day, hour);
      return eventStart < new Date(slot.endAt) && eventEnd > new Date(slot.startAt) ? index : -1;
    })
    .filter((index) => index >= 0);

  if (!overlappingRows.length) return null;

  const firstRow = Math.min(...overlappingRows);
  const lastRow = Math.max(...overlappingRows);

  return {
    column: dayIndex + 2,
    rowStart: firstRow + 2,
    rowEnd: lastRow + 3
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
  const minutes = Math.max(0, Math.round((new Date(event.end_at).getTime() - new Date(event.start_at).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function calendarEventToneClassName(event: CrmCalendarEvent) {
  const owner = (event.assigned_to || "").toLowerCase();
  const ownerClass = owner.includes("mike")
    ? "crm-calendar-event-block--mike"
    : owner.includes("jessica")
      ? "crm-calendar-event-block--jessica"
      : "crm-calendar-event-block--unassigned";
  const typeClass = event.event_type === "block" ? " crm-calendar-event-block--block" : "";

  return `${ownerClass}${typeClass}`;
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

function calendarEventDescriptionLines(event: CrmCalendarEvent) {
  const address = cleanCalendarText(event.customer_address || event.location);
  const city = cleanCalendarText(event.customer_city);
  const notes = cleanCalendarText(event.customer_notes || event.notes);

  return [
    cleanCalendarText(event.customer_phone) ? `Phone: ${cleanCalendarText(event.customer_phone)}` : null,
    address ? `Address: ${address}` : null,
    city ? `City: ${city}` : null,
    cleanCalendarText(event.assigned_to) ? `Assigned: ${cleanCalendarText(event.assigned_to)}` : null,
    cleanCalendarText(event.product_interest) ? `Product: ${cleanCalendarText(event.product_interest)}` : null,
    notes ? `Notes: ${notes}` : null
  ].filter((line): line is string => Boolean(line));
}

function calendarEventDescriptionLabel(event: CrmCalendarEvent) {
  return [
    `${calendarTimeFormatter.format(new Date(event.start_at))} - ${calendarTimeFormatter.format(new Date(event.end_at))}`,
    calendarEventCustomerLabel(event),
    ...calendarEventDescriptionLines(event)
  ].join(". ");
}

function formString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function dateInputValue(value: string | null | undefined) {
  return value ? String(value).slice(0, 10) : "";
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

function crmRedirectUrl() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const origin = configuredSiteUrl || window.location.origin;
  return `${origin}/crm/`;
}

async function crmFetch<T>(session: Session, path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(init.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.message || "CRM request failed.");
  }

  return body as T;
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

export function CrmApp() {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CrmUser | null>(null);
  const [data, setData] = useState<CrmDashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<CrmTab>("command");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [authSetupMessage, setAuthSetupMessage] = useState<string | null>(null);
  const [emailLoginMessage, setEmailLoginMessage] = useState<string | null>(null);
  const [emailLoginBusy, setEmailLoginBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => losAngelesDateString());
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [selectedCalendarSlot, setSelectedCalendarSlot] = useState<CalendarSlotSelection | null>(null);
  const [builderQuoteId, setBuilderQuoteId] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillPayload | null>(null);
  const [focusCustomer, setFocusCustomer] = useState<string | null>(null);
  const [activeJobStatus, setActiveJobStatus] = useState<JobStatusFilter>(null);

  const configured = Boolean(supabase);
  const jobs = useMemo(() => data?.jobs || [], [data]);
  const quotes = useMemo(() => data?.quotes || [], [data]);
  const events = useMemo(() => data?.events || [], [data]);
  const rows = useMemo(() => data?.bookkeepingRows || [], [data]);
  const installationInvoiceEmails = useMemo(() => data?.installationInvoiceEmails || [], [data]);
  const customerFiles = useMemo(() => data?.customerFiles || [], [data]);
  const accountability = useMemo(() => data?.accountability || [], [data]);
  const kenPayments = useMemo(() => data?.kenPayments || [], [data]);
  const visibleJobs = useMemo(
    () => (activeJobStatus ? jobs.filter((job) => job.status === activeJobStatus) : jobs),
    [activeJobStatus, jobs]
  );

  function openCustomerFile(customerName: string) {
    setFocusCustomer(customerName);
    setActiveJobStatus(null);
    setActiveTab("customers");
    setDrill(null);
  }

  function openSummaryDrill(metric: string) {
    const payload = buildSummaryDrill(metric, jobs, rows, customerFiles);
    if (payload) setDrill(payload);
  }

  function openTab(tab: CrmTab) {
    setActiveTab(tab);
    setDrill(null);
    setFocusCustomer(null);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setData(null);
  }

  async function loadCrm(activeSession: Session) {
    setMessage(null);
    const sessionResult = await crmFetch<CrmUser>(activeSession, "/api/crm/session");
    const dashboardResult = await crmFetch<CrmDashboardData>(activeSession, "/api/crm/jobs");
    setUser(sessionResult);
    setData(dashboardResult);
  }

  async function refresh() {
    if (!session) return null;
    const dashboardResult = await crmFetch<CrmDashboardData>(session, "/api/crm/jobs");
    setData(dashboardResult);
    return dashboardResult;
  }

  async function pullInstallationInvoices() {
    if (!session) return;
    setBusy(true);
    setMessage(null);

    try {
      const result = await crmFetch<{
        matched: number;
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
        `Installation invoice pull: ${result.matched} matched, ${result.needsReview} review, ${result.unmatched} unmatched, ${result.skipped} skipped, ${result.errors} errors.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Installation invoices could not be pulled.");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    const email = formString(new FormData(event.currentTarget), "email").toLowerCase();
    if (!email) {
      setEmailLoginMessage("Enter an approved 805 Shutters email.");
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
          emailRedirectTo: crmRedirectUrl(),
          shouldCreateUser: true
        }
      });

      if (error) {
        throw error;
      }

      setEmailLoginMessage(`Login link sent to ${email}.`);
      event.currentTarget.reset();
    } catch (error) {
      setEmailLoginMessage(error instanceof Error ? error.message : "Email login link could not be sent.");
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

    let mounted = true;

    supabase.auth.getSession().then(async ({ data: authData }) => {
      if (!mounted) return;
      setSession(authData.session);

      if (authData.session) {
        try {
          await loadCrm(authData.session);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "CRM failed to load.");
        }
      }

      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        setLoading(true);
        loadCrm(nextSession)
          .catch((error) => {
            setMessage(error instanceof Error ? error.message : "CRM failed to load.");
          })
          .finally(() => setLoading(false));
      } else {
        setUser(null);
        setData(null);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

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
        body: JSON.stringify({ status })
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CRM job could not be updated.");
      await refresh();
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
          dashboardResult.bookkeepingRows,
          dashboardResult.customerFiles
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

  async function saveDrillField(entry: DrillEntry, patch: DrillFieldPatch) {
    if (!session) return false;

    const row = entry.row;
    const jobId = entry.job?.id || entry.jobId || row?.jobId || null;

    if ((patch.job && !jobId) || (patch.row && !row)) {
      setMessage("This card is a customer snapshot. Open the file to edit the source record.");
      return false;
    }

    setBusy(true);
    setMessage(null);

    try {
      if (patch.job && jobId) {
        await crmFetch<{ job: CrmJob }>(session, `/api/crm/jobs/${jobId}`, {
          method: "PATCH",
          body: JSON.stringify(patch.job)
        });
      }

      if (patch.row && row) {
        if (row.source === "crm_quote" && row.quoteId) {
          await crmFetch(session, `/api/crm/quotes/${row.quoteId}`, {
            method: "PATCH",
            body: JSON.stringify(patch.row)
          });
        } else {
          await crmFetch(session, `/api/crm/bookkeeping/${row.id}`, {
            method: "PATCH",
            body: JSON.stringify(patch.row)
          });
        }
      }

      const dashboardResult = await refresh();
      if (dashboardResult && drill) {
        setDrill(rebuildDrillPayload(drill, dashboardResult.jobs, dashboardResult.bookkeepingRows, dashboardResult.customerFiles));
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

  async function updateQuote(event: FormEvent<HTMLFormElement>, quote: CrmQuote) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ quote: CrmQuote }>(session, `/api/crm/quotes/${quote.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: formString(formData, "status"),
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
          ken_opening_balance: Number(formString(formData, "ken_opening_balance") || 0),
          payoff_target: Number(formString(formData, "payoff_target") || 0)
        })
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function editBookkeepingRow(event: FormEvent<HTMLFormElement>, row: CrmBookkeepingRow) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    const owner = formString(formData, "sales_owner");
    const customerName = formString(formData, "customer_name");
    const soldDate = formString(formData, "sold_date");
    const total = Number(formString(formData, "total_amount") || 0);
    const cogs = Number(formString(formData, "cogs_amount") || 0);
    const overrideRaw = formString(formData, "ken_cut_override");
    const shared = {
      payment_type: formString(formData, "payment_type") || "other",
      payment_amount: Number(formString(formData, "payment_amount") || 0),
      payment_label: formString(formData, "payment_label") || "Balance payment",
      paid_at: formString(formData, "paid_at") || todayInputValue(),
      installation_invoice_amount: Number(formString(formData, "installation_invoice_amount") || 0),
      installation_complete: formData.get("installation_complete") === "on",
      jessica_commission_paid: formData.get("jessica_commission_paid") === "on",
      ken_cut_override: overrideRaw === "" ? null : Number(overrideRaw),
      manufacturer_name: formString(formData, "manufacturer_name"),
      manufacturer_order_ref: formString(formData, "manufacturer_order_ref"),
      notes: formString(formData, "notes")
    };

    setBusy(true);
    setMessage(null);

    try {
      if (row.source === "crm_quote" && row.quoteId) {
        if (row.jobId && customerName && customerName !== row.customerName) {
          await crmFetch(session, `/api/crm/jobs/${row.jobId}`, {
            method: "PATCH",
            body: JSON.stringify({ customer_name: customerName })
          });
        }
        await crmFetch(session, `/api/crm/quotes/${row.quoteId}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...shared,
            customer_name: customerName,
            ...(soldDate ? { sold_at: soldDate } : {}),
            quote_total: total,
            materials_cost: cogs,
            sold_by: owner
          })
        });
      } else {
        await crmFetch(session, `/api/crm/bookkeeping/${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...shared,
            customer_name: customerName,
            sold_date: soldDate,
            total_amount: total,
            cogs_amount: cogs,
            sales_owner: owner
          })
        });
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Row could not be updated.");
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

  if (loading) {
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
          <p className="eyebrow">Private CRM</p>
          <h1>CRM login.</h1>
          <p>Use an approved 805 Shutters email to access sales jobs, quotes, bookkeeping, and calendar.</p>
          {authSetupMessage ? <p className="crm-alert">{authSetupMessage}</p> : null}
          {emailLoginMessage ? <p className="crm-alert">{emailLoginMessage}</p> : null}
          <form className="crm-email-login" onSubmit={sendEmailLogin}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="jessica@805shutters.com"
                required
              />
            </label>
            <button type="submit" className="button primary" disabled={emailLoginBusy}>
              {emailLoginBusy ? "Sending link..." : "Email Login Link"}
            </button>
          </form>
          <a className="button secondary" href="/api/crm/oauth/google?redirectTo=/crm/">
            Continue with Google
          </a>
        </section>
      </div>
    );
  }

  if (message && !data) {
    return (
      <div className="crm-app-shell">
        <section className="crm-login-panel">
          <p className="eyebrow">805 CRM</p>
          <h1>CRM access is blocked.</h1>
          <p>{message}</p>
          <button type="button" onClick={signOut}>
            Sign Out
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="crm-app-shell">
      {builderQuoteId && session ? (
        <QuoteBuilderPanel
          session={session}
          quoteId={builderQuoteId}
          onClose={() => setBuilderQuoteId(null)}
          onChanged={refresh}
          onSwitch={setBuilderQuoteId}
        />
      ) : null}
      <header className="crm-topbar">
        <div className="crm-logo-lockup">
          <img src="/brand/805-shutters-logo-header.png" alt="805 Shutters" width={227} height={148} />
          <h1 className="crm-visually-hidden">CRM Command</h1>
          <span aria-hidden="true">CRM</span>
        </div>
        <section className="crm-metrics" aria-label="CRM summary">
          <Metric label="Open Jobs" value={data?.summary.openJobs || 0} onClick={() => openSummaryDrill("openJobs")} />
          <Metric label="Sold Jobs" value={data?.summary.soldJobs || 0} onClick={() => openSummaryDrill("soldJobs")} />
          <Metric label="Pipeline" value={toCurrency(data?.summary.quotePipeline)} onClick={() => openSummaryDrill("pipeline")} />
          <Metric label="Open Balance" value={toCurrency(data?.summary.openBalance)} onClick={() => openSummaryDrill("openBalance")} />
          <Metric label="Needs Order" value={data?.summary.needsOrder || 0} onClick={() => openSummaryDrill("needsOrder")} />
          <Metric label="Missing COGS" value={data?.summary.missingCogs || 0} onClick={() => openSummaryDrill("missingCogs")} />
          <Metric label="Ready Install" value={data?.summary.readyToInstall || 0} onClick={() => openSummaryDrill("readyInstall")} />
          <Metric label="Customer Files" value={data?.summary.customerFiles || 0} onClick={() => openSummaryDrill("customerFiles")} />
          <Metric label="Jessica Owed" value={toCurrency(data?.bookkeepingTotals.jessicaCommissionOwed)} onClick={() => openSummaryDrill("jessicaOwed")} />
          <Metric label="Payoff Left" value={toCurrency(data?.kenPayoff.payoffRemaining)} />
        </section>
      </header>

      {message ? <p className="crm-alert">{message}</p> : null}

      <nav className="crm-tabs" aria-label="CRM sections">
        {[
          ["command", "Command Center"],
          ["quotes", "Quotes"],
          ["customers", "Customer Files"],
          ["jobs", "Jobs"],
          ["bookkeeping", "Bookkeeping"],
          ["orders", "Orders"],
          ["calendar", "Calendar"],
          ["availability", "Open Times"],
          ["payoff", "Ken / Payoff"]
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

      {drill && activeTab !== "command" ? (
        <div className="crm-inline-drill-shell">
          <DrillDetailPanel
            payload={drill}
            busy={busy}
            onClose={() => setDrill(null)}
            onOpenCustomer={openCustomerFile}
            onReassignSale={reassignSale}
            onSaveField={saveDrillField}
          />
        </div>
      ) : null}

      {activeTab === "quotes" && session ? (
        <QuotesWorkspace session={session} jobs={jobs} quotes={quotes} onChanged={refresh} />
      ) : null}

      {activeTab === "command" ? (
        <>
          <CommandDashboard
            jobs={jobs}
            rows={rows}
            files={customerFiles}
            activeDrill={drill}
            busy={busy}
            onDrill={setDrill}
            onCloseDrill={() => setDrill(null)}
            onOpenCustomer={openCustomerFile}
            onReassignSale={reassignSale}
            onSaveField={saveDrillField}
          />
          <section className="crm-command-grid">
            <AccountabilityBoard items={accountability} />
            <BookkeepingSnapshot rows={rows} />
          </section>
        </>
      ) : null}

      {activeTab === "customers" ? (
        <CustomerFilesView
          files={customerFiles}
          focusCustomer={focusCustomer}
          onFocusHandled={() => setFocusCustomer(null)}
        />
      ) : null}

      {activeTab === "jobs" ? (
        <section className="crm-workspace crm-jobs-workspace">
          <div className="crm-job-board">
            <div className="crm-job-toolbar">
              <JobStatusTabs jobs={jobs} activeStatus={activeJobStatus} onChange={setActiveJobStatus} />
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
                    <input name="address" placeholder="Project address" />
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
                <JobCard job={job} key={job.id} onStatusChange={updateJobStatus} onSave={updateJob} busy={busy} />
              ))}
              {!visibleJobs.length ? <p className="crm-empty">No {statusLabel(activeJobStatus).toLowerCase()} jobs.</p> : null}
            </div>
            <CustomerFilesView
              files={customerFiles}
              activeStatus={activeJobStatus}
              focusCustomer={focusCustomer}
              onFocusHandled={() => setFocusCustomer(null)}
            />
          </div>
        </section>
      ) : null}

      {activeTab === "bookkeeping" ? (
        <section className="crm-workspace crm-bookkeeping-workspace crm-bookkeeping-workspace--full">
          <div className="crm-bookkeeping-main">
            <BookkeepingSpreadsheet rows={rows} totals={data?.bookkeepingTotals} busy={busy} onSave={editBookkeepingRow} />
            <InstallationInvoiceInbox invoices={installationInvoiceEmails} onPull={pullInstallationInvoices} busy={busy} />
          </div>
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
                  <select name="status" defaultValue="sold">
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

          <OrderBoard quotes={quotes} onUpdate={updateQuote} busy={busy} onOpenBuilder={setBuilderQuoteId} />
        </section>
      ) : null}

      {activeTab === "calendar" ? (
        <>
          <CalendarPlanner
            events={events}
            anchorDate={calendarDate}
            view={calendarView}
            onDateChange={setCalendarDate}
            onViewChange={setCalendarView}
            onSelectSlot={setSelectedCalendarSlot}
          />
          {selectedCalendarSlot ? (
            <CalendarAppointmentModal
              busy={busy}
              selectedSlot={selectedCalendarSlot}
              onClose={() => setSelectedCalendarSlot(null)}
              onSubmit={createAppointmentFromSlot}
            />
          ) : null}
        </>
      ) : null}

      {activeTab === "availability" && session ? (
        <AvailabilityBoard session={session} events={events} />
      ) : null}

      {activeTab === "payoff" ? (
        <KenPayoffView
          payoff={data?.kenPayoff}
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

function Metric({
  label,
  value,
  onClick
}: {
  label: string;
  value: number | string;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button type="button" className="crm-metric crm-metric-button" onClick={onClick}>
        <span>{label}</span>
        <strong>{value}</strong>
      </button>
    );
  }
  return (
    <div className="crm-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
  const needsOrder = rows.filter((row) => (row.status === "sold" || row.status === "approved") && !row.manufacturerOrderRef);
  const readyInstall = rows.filter((row) => row.status === "received");
  const openBalances = rows.filter((row) => !isPaidInFullBookkeepingRow(row) && row.balance > 0).slice(0, 8);

  return (
    <section className="crm-ledger">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Sales Organizer</p>
          <h2>Job Movement</h2>
        </div>
      </div>
      <div className="crm-snapshot-grid">
        <SnapshotColumn title="Needs Ordered" rows={needsOrder} empty="No sold jobs waiting on orders." />
        <SnapshotColumn title="Ready To Install" rows={readyInstall} empty="No jobs are waiting for install scheduling." />
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
const OPEN_SOLD_BOOKKEEPING_STATUSES = new Set<CrmBookkeepingRow["status"]>([
  "sold",
  "approved",
  "ordered",
  "received",
  "installed",
  "invoiced",
  "paid",
  "legacy",
  "manual"
]);

function isOpenSoldBookkeepingRow(row: CrmBookkeepingRow) {
  return row.total > 0 && !isPaidInFullBookkeepingRow(row) && row.balance > 0 && OPEN_SOLD_BOOKKEEPING_STATUSES.has(row.status);
}

function uniqueOpenSoldRows(rows: CrmBookkeepingRow[]) {
  const seenJobIds = new Set<string>();
  const uniqueRows: CrmBookkeepingRow[] = [];

  for (const row of rows.filter(isOpenSoldBookkeepingRow)) {
    if (row.jobId) {
      if (seenJobIds.has(row.jobId)) continue;
      seenJobIds.add(row.jobId);
    }
    uniqueRows.push(row);
  }

  return uniqueRows;
}

type DrillPlacement = "summary" | "numbers" | "product" | "closing" | "response";
type DrillDocument = {
  id: string;
  title: string;
  url: string;
  status?: string | null;
  kind: string;
};
type DrillEntry = {
  id: string;
  name: string;
  customerName: string;
  meta: string;
  value?: string;
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
type DrillEntryContext = {
  jobs?: CrmJob[];
  files?: CrmCustomerFile[];
};

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
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

function customerFileForName(files: CrmCustomerFile[] = [], name: string) {
  const normalized = normalizeCustomerName(name);
  return files.find((file) => normalizeCustomerName(file.customerName) === normalized);
}

function relatedJobForRow(row: CrmBookkeepingRow, jobs: CrmJob[] = []) {
  return row.jobId ? jobs.find((job) => job.id === row.jobId) : undefined;
}

function contractUrl(contract: CrmCustomerFile["contracts"][number]) {
  if (contract.contract_url) return contract.contract_url;
  if (contract.share_token) return `/quote/${contract.share_token}`;
  return null;
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
    const url = contractUrl(contract);
    if (!url) continue;
    documents.push({
      id: `contract-${contract.id}`,
      title: contract.title || "Contract copy",
      url,
      status: contract.status,
      kind: "Contract copy"
    });
  }

  if (row?.manufacturerDocumentUrl) {
    documents.push({
      id: `manufacturer-document-${row.id}`,
      title: row.manufacturerOrderRef || row.manufacturerName || "Manufacturer document",
      url: row.manufacturerDocumentUrl,
      status: row.status,
      kind: "Manufacturer document"
    });
  }

  if (row?.manufacturerOrderUrl) {
    documents.push({
      id: `manufacturer-order-${row.id}`,
      title: row.manufacturerOrderRef || "Manufacturer order",
      url: row.manufacturerOrderUrl,
      status: row.status,
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
  return {
    id: job.id,
    name: job.customer_name,
    customerName: job.customer_name,
    meta: [job.product_interest, job.city, titleCase(job.status)].filter(Boolean).join(" · "),
    value: value ? toCurrency(value) : undefined,
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
      return {
        id: row.id,
        name: row.customerName,
        customerName: row.customerName,
        meta: [titleCase(String(row.status)), formatShortDate(row.soldDate)].filter(Boolean).join(" · "),
        value: toCurrency(valueOf(row)),
        tone: row.balance > 0 ? ("warn" as const) : undefined,
        jobId: row.jobId,
        salesOwner: saleOwnerDisplayName(row.salesOwner || job?.sales_owner),
        canReassignSale: Boolean(row.jobId && (row.status === "sold" || row.status === "approved")),
        row,
        job,
        file,
        documents: documentsForDetail(row, job, file),
        products: productsForDetail(file, row, job),
        notes: detailNotes(row, job, file)
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

// Builds the drill payloads for the global summary band, mirroring backend.ts summary logic.
function buildSummaryDrill(
  metric: string,
  jobs: CrmJob[],
  rows: CrmBookkeepingRow[],
  files: CrmCustomerFile[]
): DrillPayload | null {
  switch (metric) {
    case "openJobs":
      return {
        title: "Open Jobs",
        subtitle: "Sold jobs not yet paid in full",
        placement: "summary",
        entries: rowsToEntries(uniqueOpenSoldRows(rows), (row) => row.balance, { jobs, files })
      };
    case "soldJobs":
      return {
        title: "Sold Jobs",
        subtitle: "Sold or ordered",
        metric,
        allowSaleReassignment: true,
        placement: "summary",
        entries: jobsToEntries(
          jobs.filter((job) => job.status === "sold" || job.status === "ordered"),
          rows,
          { files }
        ).map((entry) => ({ ...entry, canReassignSale: true }))
      };
    case "pipeline":
      return {
        title: "Pipeline",
        subtitle: "Jobs carrying a live quote",
        placement: "summary",
        entries: jobsToEntries(jobs.filter((job) => (job.quote_total || 0) > 0), rows, { files })
      };
    case "openBalance":
      return {
        title: "Open Balance",
        subtitle: "Jobs with money still owed",
        placement: "summary",
        entries: rowsToEntries(rows.filter((row) => row.balance > 0), (row) => row.balance, { jobs, files })
      };
    case "needsOrder":
      return {
        title: "Needs Order",
        subtitle: "Sold jobs without a manufacturer order",
        placement: "summary",
        entries: rowsToEntries(
          rows.filter((row) => (row.status === "sold" || row.status === "approved") && !row.manufacturerOrderRef),
          (row) => row.total,
          { jobs, files }
        )
      };
    case "missingCogs":
      return {
        title: "Missing COGS",
        subtitle: "Cost of goods not yet entered",
        placement: "summary",
        entries: rowsToEntries(rows.filter((row) => row.cogs <= 0), (row) => row.total, { jobs, files })
      };
    case "readyInstall":
      return {
        title: "Ready To Install",
        subtitle: "Received and awaiting install scheduling",
        placement: "summary",
        entries: rowsToEntries(rows.filter((row) => row.status === "received"), (row) => row.total, { jobs, files })
      };
    case "customerFiles":
      return {
        title: "Customer Files",
        subtitle: "All customers on file",
        placement: "summary",
        entries: filesToEntries(files)
      };
    case "jessicaOwed":
      return {
        title: "Jessica Owed",
        subtitle: "Commission owed to Jessica",
        metric,
        placement: "summary",
        entries: rowsToEntries(
          rows.filter((row) => row.jessicaCommissionOwed > 0),
          (row) => row.jessicaCommissionOwed,
          { jobs, files }
        )
      };
    case "jessicaNet":
      return {
        title: "Jessica Net",
        subtitle: "Jessica net per job",
        metric,
        placement: "numbers",
        entries: rowsToEntries(
          rows.filter((row) => row.jessicaCommission > 0),
          (row) => row.jessicaCommission,
          { jobs, files }
        )
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
  rows: CrmBookkeepingRow[],
  files: CrmCustomerFile[]
) {
  if (payload.metric) {
    return buildSummaryDrill(payload.metric, jobs, rows, files) || payload;
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

function CommandDashboard({
  jobs,
  rows,
  files,
  activeDrill,
  busy,
  onDrill,
  onCloseDrill,
  onOpenCustomer,
  onReassignSale,
  onSaveField
}: {
  jobs: CrmJob[];
  rows: CrmBookkeepingRow[];
  files: CrmCustomerFile[];
  activeDrill: DrillPayload | null;
  busy: boolean;
  onDrill: (payload: DrillPayload) => void;
  onCloseDrill: () => void;
  onOpenCustomer: (customerName: string) => void;
  onReassignSale?: (entry: DrillEntry, owner: string) => void;
  onSaveField: (entry: DrillEntry, patch: DrillFieldPatch) => Promise<boolean>;
}) {
  const numbers = useMemo(() => {
    const bookedRevenue = rows.reduce((sum, row) => sum + (row.total || 0), 0);
    const collected = rows.reduce((sum, row) => sum + (row.paidTotal || 0), 0);
    const collectedRows = rows.filter((row) => (row.paidTotal || 0) > 0);
    const outstandingRows = rows.filter((row) => row.balance > 0);
    const outstanding = outstandingRows.reduce((sum, row) => sum + row.balance, 0);
    const mikeNet = rows.reduce((sum, row) => sum + (row.mikeProfit || 0), 0);
    const jessicaNetRows = rows.filter((row) => (row.jessicaCommission || 0) > 0);
    const jessicaNet = jessicaNetRows.reduce((sum, row) => sum + (row.jessicaCommission || 0), 0);
    return { bookedRevenue, collected, collectedRows, outstanding, outstandingRows, mikeNet, jessicaNet, jessicaNetRows };
  }, [rows]);

  const productMix = useMemo(() => {
    const map = new Map<string, CrmJob[]>();
    for (const job of jobs) {
      const key = job.product_interest?.trim() || "Unspecified";
      const list = map.get(key) || [];
      list.push(job);
      map.set(key, list);
    }
    const all = [...map.entries()]
      .map(([label, list]) => ({
        label,
        list,
        count: list.length,
        value: list.reduce((sum, job) => sum + jobValue(job), 0)
      }))
      .sort((a, b) => b.count - a.count);
    const top = all.slice(0, 6);
    const rest = all.slice(6).flatMap((slice) => slice.list);
    if (rest.length) {
      top.push({
        label: "Other",
        list: rest,
        count: rest.length,
        value: rest.reduce((sum, job) => sum + jobValue(job), 0)
      });
    }
    return top;
  }, [jobs]);

  const closing = useMemo(() => {
    function bucketize(list: CrmJob[]) {
      const won = list.filter((job) => WON_JOB_STATUSES.includes(job.status));
      const lost = list.filter((job) => job.status === "lost");
      const open = list.filter((job) => OPEN_JOB_STATUSES.includes(job.status));
      const decided = won.length + lost.length;
      return { won, lost, open, total: list.length, rate: decided ? won.length / decided : 0 };
    }
    const byOwner = ["Mike", "Jessica"].map((owner) => ({
      owner,
      ...bucketize(jobs.filter((job) => (job.sales_owner || "Unassigned") === owner))
    }));
    return { overall: bucketize(jobs), byOwner };
  }, [jobs]);

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

  const productTotal = productMix.reduce((sum, slice) => sum + slice.count, 0);
  const responseMax = Math.max(1, ...response.buckets.map((bucket) => bucket.list.length));
  const activePlacement = activeDrill?.placement || "summary";
  const drillPanel = (placements: DrillPlacement[]) =>
    activeDrill && placements.includes(activePlacement) ? (
      <DrillDetailPanel
        payload={activeDrill}
        busy={busy}
        onClose={onCloseDrill}
        onOpenCustomer={onOpenCustomer}
        onReassignSale={onReassignSale}
        onSaveField={onSaveField}
      />
    ) : null;

  return (
    <section className="crm-dashboard">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Our Numbers</p>
          <h2>Business At A Glance</h2>
        </div>
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
          label="Profit"
          value={toCurrency(numbers.mikeNet)}
          sub="Mike net"
          onClick={() =>
            onDrill({
              title: "Profit By Job",
              subtitle: "Mike net per job",
              placement: "numbers",
              entries: rowsToEntries(rows, (row) => row.mikeProfit, { jobs, files })
            })
          }
        />
        <StatTile
          label="Profit"
          value={toCurrency(numbers.jessicaNet)}
          sub="Jessica net"
          onClick={() =>
            onDrill({
              title: "Jessica Net",
              subtitle: "Jessica net per job",
              metric: "jessicaNet",
              placement: "numbers",
              entries: rowsToEntries(numbers.jessicaNetRows, (row) => row.jessicaCommission, { jobs, files })
            })
          }
        />
      </div>

      {drillPanel(["summary", "numbers"])}

      <div className="crm-dashboard-grid">
        <section className="crm-ledger crm-chart-card">
          <div className="crm-section-head">
            <div>
              <p className="eyebrow">Product Mix</p>
              <h2>Jobs By Product</h2>
            </div>
            <strong>{productTotal}</strong>
          </div>
          {productTotal ? (
            <div className="crm-donut-row">
              <Donut slices={productMix} total={productTotal} />
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
            </div>
          ) : (
            <p className="crm-empty">No jobs to chart yet.</p>
          )}
        </section>

        <section className="crm-ledger crm-chart-card">
          <div className="crm-section-head">
            <div>
              <p className="eyebrow">Closing Rate</p>
              <h2>Won vs Lost</h2>
            </div>
            <strong>{Math.round(closing.overall.rate * 100)}%</strong>
          </div>
          <div className="crm-close-list">
            <CloseRow label="Everyone" bucket={closing.overall} rows={rows} files={files} onDrill={onDrill} />
            {closing.byOwner.map((owner) => (
              <CloseRow key={owner.owner} label={owner.owner} bucket={owner} rows={rows} files={files} onDrill={onDrill} />
            ))}
          </div>
        </section>
      </div>

      {drillPanel(["product", "closing"])}

      <section className="crm-ledger crm-chart-card">
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

      {drillPanel(["response"])}
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
        JOBS
      </text>
    </svg>
  );
}

function CloseRow({
  label,
  bucket,
  rows,
  files,
  onDrill
}: {
  label: string;
  bucket: { won: CrmJob[]; lost: CrmJob[]; open: CrmJob[]; rate: number; total: number };
  rows: CrmBookkeepingRow[];
  files: CrmCustomerFile[];
  onDrill: (payload: DrillPayload) => void;
}) {
  const total = Math.max(1, bucket.won.length + bucket.lost.length + bucket.open.length);
  const segments: Array<{ key: "won" | "lost" | "open"; label: string; list: CrmJob[] }> = [
    { key: "won", label: "Won", list: bucket.won },
    { key: "lost", label: "Lost", list: bucket.lost },
    { key: "open", label: "Open", list: bucket.open }
  ];
  return (
    <div className="crm-close-row">
      <div className="crm-close-head">
        <span className="crm-close-name">{label}</span>
        <strong className="crm-close-rate">{Math.round(bucket.rate * 100)}%</strong>
      </div>
      <div className="crm-close-bar">
        {segments.map((segment) =>
          segment.list.length ? (
            <button
              type="button"
              key={segment.key}
              className={`crm-close-seg ${segment.key}`}
              style={{ width: `${(segment.list.length / total) * 100}%` }}
              title={`${segment.label}: ${segment.list.length}`}
              onClick={() =>
                onDrill({
                  title: `${label} · ${segment.label}`,
                  subtitle: `${segment.list.length} jobs`,
                  placement: "closing",
                  entries: jobsToEntries(segment.list, rows, { files })
                })
              }
            />
          ) : null
        )}
      </div>
      <div className="crm-close-key">
        <span>{bucket.won.length} won</span>
        <span>{bucket.lost.length} lost</span>
        <span>{bucket.open.length} open</span>
      </div>
    </div>
  );
}

type DrillPanelProps = {
  payload: DrillPayload;
  busy: boolean;
  onClose: () => void;
  onOpenCustomer: (customerName: string) => void;
  onReassignSale?: (entry: DrillEntry, owner: string) => void;
  onSaveField: (entry: DrillEntry, patch: DrillFieldPatch) => Promise<boolean>;
};

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
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void submit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
    />
  );
}

function DrillDetailPanel({
  payload,
  busy,
  onClose,
  onOpenCustomer,
  onReassignSale,
  onSaveField
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
            onSaveField={onSaveField}
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
  onSaveField
}: {
  entry: DrillEntry;
  payload: DrillPayload;
  busy: boolean;
  onOpenCustomer: (customerName: string) => void;
  onReassignSale?: (entry: DrillEntry, owner: string) => void;
  onSaveField: (entry: DrillEntry, patch: DrillFieldPatch) => Promise<boolean>;
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
  const hasActivity = Boolean(row && (row.payments.length || row.creditsIn.length || row.creditsOut.length || row.expenses.length));
  const hasDocumentsOrNotes = Boolean(documents.length || notes.length);
  const activityItemCount = (row?.payments.length || 0) + (row?.creditsIn.length || 0) + (row?.creditsOut.length || 0) + (row?.expenses.length || 0);
  const documentsAndNotesCount = documents.length + notes.length;
  const lineItemLabel = (count: number) => `${count} line item${count === 1 ? "" : "s"}`;
  const customerName = job?.customer_name || row?.customerName || file?.customerName || entry.customerName;
  const saveJob = (patch: Record<string, unknown>, message: string) => onSaveField(entry, { job: patch, message });
  const saveRow = (patch: Record<string, unknown>, message: string) => {
    if (!row) return Promise.resolve(false);
    const rowPatch = row.source === "crm_quote" && row.quoteId ? { quote_total: row.total, ...patch } : patch;
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
      value: file?.phone || job?.phone || "",
      fallback: "Phone pending",
      editor: canEditJob
        ? {
            value: file?.phone || job?.phone || "",
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
  const totalEditor: DrillInlineEditor | undefined = row
    ? {
        type: "number",
        value: moneyEditorValue(row.total),
        disabled: busy,
        ariaLabel: "Edit total",
        onSave: (value) => saveRow(row.source === "crm_quote" ? { quote_total: moneyPatch(value) } : { total_amount: moneyPatch(value) }, "Total updated.")
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
  const paymentEditor: DrillInlineEditor | undefined = row
    ? {
        type: "select",
        value: row.paymentType || "other",
        options: paymentTypes.map((item) => ({ value: item.value, label: item.label })),
        disabled: busy,
        ariaLabel: "Edit payment type",
        onSave: (value) => saveRow({ payment_type: value }, "Payment type updated.")
      }
    : undefined;
  const cogsEditor: DrillInlineEditor | undefined = row
    ? {
        type: "number",
        value: moneyEditorValue(row.cogs),
        disabled: busy,
        ariaLabel: "Edit COGS",
        onSave: (value) => saveRow(row.source === "crm_quote" ? { materials_cost: moneyPatch(value) } : { cogs_amount: moneyPatch(value) }, "COGS updated.")
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

  return (
    <article className="crm-drill-detail-card">
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
        <div className="crm-drill-detail-value">
          {entry.value ? <strong className={entry.tone === "warn" ? "warn" : ""}>{entry.value}</strong> : null}
          <button type="button" className="crm-ghost-button" onClick={() => onOpenCustomer(entry.customerName)}>
            Open File
          </button>
        </div>
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
              <DrillFact label="Balance" value={toLedgerCurrency(row?.balance ?? file?.openBalance)} tone={(row?.balance ?? file?.openBalance ?? 0) > 0 ? "warn" : "good"} />
              <DrillFact label="Deposit" value={row ? `${toLedgerCurrency(row.depositPaid)} / ${toLedgerCurrency(row.depositDue)}` : "No ledger row"} />
              <DrillFact label="Balance Paid" value={row ? toLedgerCurrency(row.balancePaid) : "No ledger row"} />
              <DrillFact label="Payment" value={row?.paymentType ? formatPaymentType(row.paymentType) : "Not recorded"} editor={paymentEditor} />
              <DrillFact
                label="COGS"
                value={row ? (row.cogs > 0 ? toLedgerCurrency(row.cogs) : "Missing") : "No COGS row"}
                tone={row && row.cogs <= 0 ? "warn" : undefined}
                editor={cogsEditor}
              />
              <DrillFact label="Ken" value={row ? toLedgerCurrency(row.kenCut) : "No ledger row"} />
              <DrillFact label="Mike Profit" value={row ? toLedgerCurrency(row.mikeProfit) : "No ledger row"} tone={row && row.mikeProfit >= 0 ? "good" : undefined} />
              <DrillFact label="Install $" value={row ? toLedgerCurrency(row.installationInvoiceAmount) : "No install row"} editor={installAmountEditor} />
            </div>
          </section>

          <section className="crm-drill-fact-column">
            <h4>Status + Product</h4>
            <div className="crm-drill-fact-column-list">
              <DrillFact label="Status" value={titleCase(String(row?.status || job?.status || file?.latestStatus || "open"))} editor={statusEditor} />
              <DrillFact label="Manufacturer" value={row?.manufacturerName || "Needs order details"} editor={manufacturerEditor} />
              <DrillFact label="Order #" value={row?.manufacturerOrderRef || "No order number"} editor={orderRefEditor} />
              <DrillFact
                label="Install Status"
                value={row ? (row.isInstallationComplete ? "Complete" : titleCase(row.installationMatchStatus)) : "No install row"}
                editor={installStatusEditor}
              />
            </div>
          </section>
        </div>

        {products.length || hasActivity || hasDocumentsOrNotes ? (
          <div className="crm-drill-detail-strip">
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

            {hasActivity ? (
              <details className="crm-drill-line-section">
                <summary>
                  <span>Payments + Activity</span>
                  <em>{lineItemLabel(activityItemCount)}</em>
                </summary>
                <div className="crm-drill-line-list">
                  {row?.payments.map((payment) => (
                    <div className="crm-drill-line-item" key={payment.id}>
                      <strong>{payment.payment_label || formatPaymentType(payment.payment_type)}</strong>
                      <span>{[formatPaymentType(payment.payment_type), formatShortDate(payment.paid_at), payment.source].filter(Boolean).join(" / ")}</span>
                      <em>{toLedgerCurrency(payment.amount)}</em>
                    </div>
                  ))}
                  {row?.creditsIn.map((credit) => (
                    <div className="crm-drill-line-item" key={`credit-in-${credit.id}`}>
                      <strong>Credit In</strong>
                      <span>{[formatShortDate(credit.credit_date), credit.note].filter(Boolean).join(" / ")}</span>
                      <em>{toLedgerCurrency(credit.amount)}</em>
                    </div>
                  ))}
                  {row?.creditsOut.map((credit) => (
                    <div className="crm-drill-line-item" key={`credit-out-${credit.id}`}>
                      <strong>Credit Out</strong>
                      <span>{[formatShortDate(credit.credit_date), credit.note].filter(Boolean).join(" / ")}</span>
                      <em>{toLedgerCurrency(credit.amount)}</em>
                    </div>
                  ))}
                  {row?.expenses.map((expense) => (
                    <div className="crm-drill-line-item" key={`expense-${expense.id}`}>
                      <strong>{expense.label}</strong>
                      <span>{[titleCase(expense.category), formatShortDate(expense.incurred_on), expense.notes].filter(Boolean).join(" / ")}</span>
                      <em>{toLedgerCurrency(expense.amount)}</em>
                    </div>
                  ))}
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

function buildDrillFieldPatch(event: FormEvent<HTMLFormElement>, entry: DrillEntry): DrillFieldPatch {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const row = entry.row;
  const jobId = entry.job?.id || entry.jobId || row?.jobId || null;
  const customerName = formString(formData, "customer_name") || entry.customerName;
  const patch: DrillFieldPatch = {};

  if (jobId) {
    const jobPatch: Record<string, unknown> = {
      customer_name: customerName,
      phone: formString(formData, "phone"),
      email: formString(formData, "email"),
      city: formString(formData, "city"),
      address: formString(formData, "address"),
      product_interest: formString(formData, "product_interest"),
      next_action: formString(formData, "next_action"),
      next_action_due: formString(formData, "next_action_due") || null,
      estimated_total: Number(formString(formData, "estimated_total") || 0),
      appointment_start: dateTimeLocalToIso(formString(formData, "appointment_start")),
      appointment_end: dateTimeLocalToIso(formString(formData, "appointment_end")),
      notes: formString(formData, "job_notes")
    };
    const jobStatus = formString(formData, "job_status");
    if (jobStatus) jobPatch.status = jobStatus;
    patch.job = jobPatch;
  }

  if (row) {
    const soldDate = formString(formData, "sold_date");
    const total = Number(formString(formData, "total_amount") || 0);
    const cogs = Number(formString(formData, "cogs_amount") || 0);
    const paymentAmount = Number(formString(formData, "payment_amount") || 0);
    const kenCutOverride = formString(formData, "ken_cut_override");
    const sharedRowPatch = {
      customer_name: customerName,
      payment_type: formString(formData, "payment_type") || "other",
      payment_amount: paymentAmount,
      payment_label: formString(formData, "payment_label") || "Balance payment",
      paid_at: formString(formData, "paid_at") || null,
      installation_invoice_amount: Number(formString(formData, "installation_invoice_amount") || 0),
      installation_invoice_number: formString(formData, "installation_invoice_number"),
      installation_invoice_url: formString(formData, "installation_invoice_url"),
      installation_complete: formData.get("installation_complete") === "on",
      jessica_commission_paid: formData.get("jessica_commission_paid") === "on",
      ken_cut_override: kenCutOverride === "" ? null : Number(kenCutOverride),
      manufacturer_name: formString(formData, "manufacturer_name"),
      manufacturer_order_ref: formString(formData, "manufacturer_order_ref"),
      manufacturer_order_url: formString(formData, "manufacturer_order_url"),
      manufacturer_document_url: formString(formData, "manufacturer_document_url"),
      notes: formString(formData, "row_notes")
    };

    patch.row =
      row.source === "crm_quote" && row.quoteId
        ? {
            ...sharedRowPatch,
            status: formString(formData, "quote_status") || row.status,
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
  const installationAmount = row?.installationInvoiceAmount ?? 0;
  const paymentType = row?.paymentType || "other";

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
            <input name="address" defaultValue={file?.address || job?.address || ""} />
          </label>
          <div className="crm-field-row">
            <label>
              Status
              {canEditQuoteStatus ? (
                <select name="quote_status" defaultValue={statusValue}>
                  {crmQuoteStatuses.map((status) => (
                    <option value={status} key={status}>
                      {titleCase(status)}
                    </option>
                  ))}
                </select>
              ) : canEditJobStatus ? (
                <select name="job_status" defaultValue={statusValue}>
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
              Mike Profit <strong>{row ? toLedgerCurrency(row.mikeProfit) : "No ledger row"}</strong>
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
          <label className="crm-checkbox">
            <input name="installation_complete" type="checkbox" defaultChecked={Boolean(row?.isInstallationComplete)} disabled={!row} />
            Installation complete
          </label>
          <label className="crm-checkbox">
            <input name="jessica_commission_paid" type="checkbox" defaultChecked={Boolean(row?.jessicaCommissionPaidAt)} disabled={!row} />
            Jessica commission paid
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

function DrillFact({
  label,
  value,
  tone,
  wide,
  editor
}: {
  label: string;
  value: string;
  tone?: "warn" | "good";
  wide?: boolean;
  editor?: DrillInlineEditor;
}) {
  return (
    <div className={`crm-drill-fact ${tone || ""} ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <strong>
        <InlineEditableValue value={value} editor={editor} />
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
  if (file.latestStatus) statuses.add(file.latestStatus);
  for (const job of file.jobs) statuses.add(job.status);
  for (const quote of file.quotes) statuses.add(quote.status);
  for (const row of file.bookkeepingRows) statuses.add(String(row.status));
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
    case "closed":
      return statuses.has(status);
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

function CustomerFilesView({
  files,
  activeStatus,
  focusCustomer,
  onFocusHandled
}: {
  files: CrmCustomerFile[];
  activeStatus?: JobStatusFilter;
  focusCustomer?: string | null;
  onFocusHandled?: () => void;
}) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<CustomerFileFilter | null>(null);
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
  const visibleFiles = useMemo(
    () => (activeFilter ? statusFilteredFiles.filter((file) => customerFileMatchesFilter(file, activeFilter)) : statusFilteredFiles),
    [activeFilter, statusFilteredFiles]
  );
  const filterCounts = useMemo(
    () =>
      new Map<CustomerFileFilter, number>(
        customerFileFilters.map((filter) => [
          filter.value,
          statusFilteredFiles.filter((file) => customerFileMatchesFilter(file, filter.value)).length
        ])
      ),
    [statusFilteredFiles]
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
      <div className="crm-customer-filter-bar" aria-label="Customer lifecycle filters">
        <button type="button" className={!activeFilter ? "active" : ""} aria-pressed={!activeFilter} onClick={() => setActiveFilter(null)}>
          All
          <span>{statusFilteredFiles.length}</span>
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
      <div className="crm-customer-stack">
        {visibleFiles.map((file) => {
          const sortedBookkeepingRows = [...file.bookkeepingRows].sort((a, b) => {
            const dateDelta = dateSortValue(b.soldDate) - dateSortValue(a.soldDate);
            return dateDelta || (a.quoteNumber || a.source).localeCompare(b.quoteNumber || b.source);
          });

          return (
            <article
              className={`crm-customer-card ${highlighted === normalizeCustomerName(file.customerName) ? "crm-focus" : ""}`}
              id={customerCardDomId(file.customerName)}
              key={file.id}
            >
              <div className="crm-customer-primary">
                <header className="crm-customer-card-head">
                  <div>
                    <h3>{file.customerName}</h3>
                    <p>{[file.phone, file.email, file.city].filter(Boolean).join(" / ") || "Contact details pending"}</p>
                  </div>
                  <strong>{toCurrency(file.lifetimeValue)}</strong>
                </header>

                {file.address ? <p className="crm-customer-address">{file.address}</p> : null}

                {file.notes.length ? (
                  <div className="crm-customer-notes">
                    <h4>Notes</h4>
                    <p>{file.notes.slice(0, 3).join(" / ")}</p>
                  </div>
                ) : null}
              </div>

              <dl className="crm-customer-facts">
                <div>
                  <dt>Sold Date</dt>
                  <dd>{formatShortDate(file.latestSoldDate)}</dd>
                </div>
                <div>
                  <dt>Open Balance</dt>
                  <dd className={file.openBalance > 0 ? "warn" : ""}>{toCurrency(file.openBalance)}</dd>
                </div>
                <div>
                  <dt>Latest Status</dt>
                  <dd>{file.latestStatus || "Open"}</dd>
                </div>
                <div>
                  <dt>Contracts</dt>
                  <dd>{file.contracts.length}</dd>
                </div>
              </dl>

              <div className="crm-customer-row-details">
                <div className="crm-customer-section">
                  <h4>Products</h4>
                  <div className="crm-customer-list">
                    {file.products.map((product) => (
                      <div key={product.id}>
                        <strong>
                          {product.room ? `${product.room} / ` : ""}
                          {product.product_type}
                        </strong>
                        <span>
                          {[product.description, product.fabric, product.material, product.control_type, product.mount_type]
                            .filter(Boolean)
                            .join(" / ") || "Product details pending"}
                        </span>
                        <em>
                          {product.quantity} item{product.quantity === 1 ? "" : "s"}
                          {product.total_price ? ` / ${toCurrency(product.total_price)}` : ""}
                        </em>
                      </div>
                    ))}
                    {!file.products.length ? <p>No product details imported yet.</p> : null}
                  </div>
                </div>

                <div className="crm-customer-section">
                  <h4>Contracts + Documents</h4>
                  <div className="crm-document-list">
                    {file.contracts.map((contract) => {
                      const url = contractUrl(contract);
                      return url ? (
                        <a href={url} target="_blank" rel="noreferrer" key={contract.id}>
                          {contract.title}
                          <span>{contract.status || "Document"}</span>
                          <em>View contract</em>
                        </a>
                      ) : (
                        <div key={contract.id}>
                          {contract.title}
                          <span>{contract.status || "No link"}</span>
                        </div>
                      );
                    })}
                    {!file.contracts.length ? <p>No contract or document link attached.</p> : null}
                  </div>
                </div>

                <div className="crm-customer-section">
                  <h4>Jobs + Bookkeeping</h4>
                  <div className="crm-customer-list compact">
                    {sortedBookkeepingRows.slice(0, 4).map((row) => (
                      <div key={`${row.source}-${row.id}`}>
                        <strong>{row.quoteNumber || row.source.replace("_", " ")}</strong>
                        <span>{formatShortDate(row.soldDate)} / {row.manufacturerName || row.status}</span>
                        <em>
                          {toCurrency(row.total)} / balance {toCurrency(row.balance)}
                        </em>
                      </div>
                    ))}
                    {!file.bookkeepingRows.length ? <p>No bookkeeping row attached.</p> : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!files.length ? <p className="crm-empty">No customer files yet. Bookkeeping rows will appear here automatically.</p> : null}
      {files.length && !visibleFiles.length ? (
        <p className="crm-empty">
          No customer files match {activeFilter ? "this lifecycle filter" : statusLabel(activeStatus ?? null).toLowerCase()}.
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
          <span>{row.manufacturerName || row.manufacturerOrderRef || formatShortDate(row.soldDate)}</span>
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
  onSave,
  busy
}: {
  job: CrmJob;
  onStatusChange: (job: CrmJob, status: CrmJobStatus) => void;
  onSave: (event: FormEvent<HTMLFormElement>, job: CrmJob) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);

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
            <input name="address" defaultValue={job.address || ""} />
          </label>
          <label>
            Product
            <input name="product_interest" defaultValue={job.product_interest} />
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
          <dt>Next</dt>
          <dd>{job.next_action || "Call customer"}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{job.next_action_due || "Open"}</dd>
        </div>
      </dl>
      <div className="crm-card-footer">
        <strong>{toCurrency(job.quote_total || job.estimated_total)}</strong>
        <select value={job.status} onChange={(event) => onStatusChange(job, event.target.value as CrmJobStatus)}>
          {crmJobStatuses.map((status) => (
            <option value={status} key={status}>
              {status.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="crm-ghost-button crm-card-edit" onClick={() => setEditing(true)}>
        Edit details
      </button>
    </article>
  );
}

function InstallationInvoiceInbox({
  invoices,
  onPull,
  busy
}: {
  invoices: CrmInstallationInvoiceEmail[];
  onPull: () => void;
  busy: boolean;
}) {
  const counts = invoices.reduce(
    (current, invoice) => {
      current[invoice.match_status] += 1;
      return current;
    },
    { matched: 0, needs_review: 0, unmatched: 0, skipped: 0, error: 0 }
  );
  const recent = invoices.slice(0, 12);

  return (
    <section className="crm-ledger crm-installation-inbox">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Install invoices</p>
          <h2>805 Gmail Reconciliation</h2>
        </div>
        <button type="button" onClick={onPull} disabled={busy}>
          Pull Invoices
        </button>
      </div>
      <div className="crm-bookkeeping-counts" aria-label="Installation invoice pull counts">
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
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  {invoice.email_url ? (
                    <a href={invoice.email_url} target="_blank" rel="noreferrer">
                      {invoice.extracted_invoice_number || invoice.subject || "Gmail invoice"}
                    </a>
                  ) : (
                    invoice.extracted_invoice_number || invoice.subject || "Gmail invoice"
                  )}
                  <span>{formatShortDate(invoice.sent_at || invoice.processed_at)}</span>
                </td>
                <td>{invoice.extracted_customer_name || "Needs review"}</td>
                <td>{invoice.extracted_invoice_amount ? toLedgerCurrency(invoice.extracted_invoice_amount) : "-"}</td>
                <td>
                  <span className={`crm-bookkeeping-pill crm-bookkeeping-pill--${invoice.match_status}`}>
                    {titleCase(invoice.match_status)}
                  </span>
                </td>
                <td>{invoice.match_reason || invoice.error_message || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!recent.length ? <p className="crm-empty">No installation invoice emails processed yet.</p> : null}
      </div>
    </section>
  );
}

function BookkeepingSpreadsheet({
  rows,
  totals,
  busy,
  onSave
}: {
  rows: CrmBookkeepingRow[];
  totals: CrmDashboardData["bookkeepingTotals"] | undefined;
  busy: boolean;
  onSave: (event: FormEvent<HTMLFormElement>, row: CrmBookkeepingRow) => void;
}) {
  const totalProfit = roundCurrency(
    (totals?.total || 0) - (totals?.cogs || 0) - (totals?.installationAmount || 0) - (totals?.expensesTotal || 0)
  );
  const netProfit = roundCurrency(totalProfit - (totals?.kenCut || 0));
  const profitMargin = totals?.total ? `${((totalProfit / totals.total) * 100).toFixed(1)}%` : "0.0%";
  const missingCogs = totals?.missingCogs || 0;
  const summaryCards = [
    ["Total Sales", toLedgerCurrency(totals?.total)],
    ["Open Balance", toLedgerCurrency(totals?.balance)],
    ["COGS", toLedgerCurrency(totals?.cogs)],
    ["Installation", toLedgerCurrency(totals?.installationAmount)],
    ["Ken Total Profit", toLedgerCurrency(totals?.kenCut)],
    ["MTS Total Profit", toLedgerCurrency(netProfit)],
    ["Jessica Commission", toLedgerCurrency(totals?.jessicaCommission)],
    ["Jessica Paid", toLedgerCurrency(totals?.jessicaCommissionPaid)],
    ["Jessica Owed", toLedgerCurrency(totals?.jessicaCommissionOwed)],
    ["Paid In Full", `${totals?.closedRows || 0} / ${toLedgerCurrency(totals?.closedTotal)}`],
    ["Total Profit", toLedgerCurrency(totalProfit)],
    ["Profit Margin", profitMargin]
  ];

  return (
    <section className="crm-ledger crm-bookkeeping-ledger">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Bookkeeping</p>
          <h2>Quote Job Ledger</h2>
        </div>
        <div className="crm-bookkeeping-counts" aria-label="Bookkeeping row counts">
          <span>Rows: {totals?.rows || 0}</span>
        </div>
      </div>
      <div className="crm-bookkeeping-summary-grid">
        {summaryCards.map(([label, value]) => (
          <article className="crm-bookkeeping-summary-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      {missingCogs ? <p className="crm-bookkeeping-alert">{missingCogs} rows missing COGS.</p> : null}
      <div className="crm-bookkeeping-table-wrap">
        <table className="crm-bookkeeping-table crm-bookkeeping-table--legacy">
          <thead>
            <tr>
              <th>Customer / Quote</th>
              <th>Date</th>
              <th>Total</th>
              <th>Deposit</th>
              <th>PD/W</th>
              <th>COGS</th>
              <th>Installation</th>
              <th>Balance</th>
              <th>Ken</th>
              <th>Mike</th>
              <th>Jessica</th>
              <th>J Paid</th>
              <th>Notes</th>
              <th aria-label="Save row" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const formId = `crm-bookkeeping-row-${row.source}-${row.id}`;
              return (
                <tr className={row.isPaidInFull ? "crm-bookkeeping-row--closed" : undefined} key={`${row.source}-${row.id}`}>
                  <td>
                    <form id={formId} onSubmit={(event) => onSave(event, row)} />
                    <div className="crm-bookkeeping-cell-stack crm-bookkeeping-customer-stack">
                      <input
                        form={formId}
                        name="customer_name"
                        className="crm-bookkeeping-input crm-bookkeeping-customer-input"
                        defaultValue={row.customerName}
                        aria-label={`Customer for ${row.customerName}`}
                      />
                      <span>{row.quoteNumber || row.source.replace("_", " ")}</span>
                      <select
                        form={formId}
                        name="sales_owner"
                        className="crm-bookkeeping-select"
                        defaultValue={row.salesOwner || ""}
                        aria-label={`Sales owner for ${row.customerName}`}
                      >
                        <option value="">Unassigned</option>
                        <option value="mike">Mike</option>
                        <option value="jessica">Jessica</option>
                      </select>
                      <em className={`crm-bookkeeping-status${row.isPaidInFull ? " crm-bookkeeping-status--closed" : ""}`}>
                        {bookkeepingStatusLabel(row)}
                      </em>
                    </div>
                  </td>
                  <td>
                    <input
                      form={formId}
                      name="sold_date"
                      type="date"
                      className="crm-bookkeeping-input crm-bookkeeping-date-input"
                      defaultValue={dateInputValue(row.soldDate)}
                      aria-label={`Date for ${row.customerName}`}
                    />
                  </td>
                  <td>
                    <input
                      form={formId}
                      name="total_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      className="crm-bookkeeping-input crm-bookkeeping-number-input"
                      defaultValue={row.total || ""}
                      aria-label={`Total for ${row.customerName}`}
                    />
                  </td>
                  <td>
                    <div className="crm-bookkeeping-cell-stack crm-bookkeeping-money-stack">
                      <span className="crm-bookkeeping-calc">{toLedgerCurrency(row.depositPaid)}</span>
                      <input
                        form={formId}
                        name="payment_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        className="crm-bookkeeping-input crm-bookkeeping-number-input"
                        placeholder="Add payment"
                        aria-label={`Add payment for ${row.customerName}`}
                      />
                      <input
                        form={formId}
                        name="payment_label"
                        className="crm-bookkeeping-input"
                        placeholder="Payment label"
                        aria-label={`Payment label for ${row.customerName}`}
                      />
                      <input form={formId} name="paid_at" type="hidden" defaultValue={todayInputValue()} />
                    </div>
                  </td>
                  <td>
                    <select
                      form={formId}
                      name="payment_type"
                      className="crm-bookkeeping-select"
                      defaultValue={row.paymentType || "other"}
                      aria-label={`Payment type for ${row.customerName}`}
                    >
                      {paymentTypes.map((item) => (
                        <option value={item.value} key={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      form={formId}
                      name="cogs_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      className="crm-bookkeeping-input crm-bookkeeping-number-input"
                      defaultValue={row.cogs || ""}
                      placeholder={row.cogs <= 0 ? "Missing" : undefined}
                      aria-label={`COGS for ${row.customerName}`}
                    />
                  </td>
                  <td>
                    <div className="crm-bookkeeping-cell-stack crm-bookkeeping-money-stack">
                      <input
                        form={formId}
                        name="installation_invoice_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        className="crm-bookkeeping-input crm-bookkeeping-number-input"
                        defaultValue={row.installationInvoiceAmount || ""}
                        placeholder="No invoice"
                        aria-label={`Installation invoice for ${row.customerName}`}
                      />
                      <label className="crm-bookkeeping-check">
                        <input form={formId} name="installation_complete" type="checkbox" defaultChecked={row.isInstallationComplete} />
                        Done
                      </label>
                    </div>
                  </td>
                  <td className={row.balance > 0 ? "crm-ledger-money-warn" : "crm-ledger-money-good"}>{toLedgerCurrency(row.balance)}</td>
                  <td>
                    <div className="crm-bookkeeping-cell-stack crm-bookkeeping-money-stack">
                      <span className="crm-bookkeeping-calc crm-ledger-money-warn">{toLedgerCurrency(row.kenCut)}</span>
                      <input
                        form={formId}
                        name="ken_cut_override"
                        type="number"
                        min="0"
                        step="0.01"
                        className="crm-bookkeeping-input crm-bookkeeping-number-input"
                        defaultValue={row.kenCutOverride ?? ""}
                        placeholder="Override"
                        aria-label={`Ken override for ${row.customerName}`}
                      />
                    </div>
                  </td>
                  <td className="crm-ledger-money-good">{toLedgerCurrency(row.mikeProfit)}</td>
                  <td>{jessicaLedgerStatus(row)}</td>
                  <td>
                    <label className="crm-bookkeeping-check crm-bookkeeping-check--compact">
                      <input
                        form={formId}
                        name="jessica_commission_paid"
                        type="checkbox"
                        defaultChecked={Boolean(row.jessicaCommissionPaidAt)}
                      />
                      Paid
                    </label>
                  </td>
                  <td>
                    <textarea
                      form={formId}
                      name="notes"
                      rows={3}
                      className="crm-bookkeeping-textarea"
                      defaultValue={row.notes || ""}
                      aria-label={`Notes for ${row.customerName}`}
                    />
                  </td>
                  <td className="crm-bookkeeping-action-cell">
                    <button type="submit" form={formId} className="crm-ghost-button crm-bookkeeping-edit-button" disabled={busy}>
                      Save
                    </button>
                  </td>
                </tr>
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

function jessicaLedgerStatus(row: CrmBookkeepingRow) {
  if (row.salesOwner === "mike") return "Mike sale";
  if (row.jessicaCommission > 0) return toLedgerCurrency(row.jessicaCommission);
  if (!row.isInstallationComplete) return "Pending install";
  return "-";
}

function bookkeepingStatusLabel(row: CrmBookkeepingRow) {
  if (row.isPaidInFull) return "closed";
  if (row.source === "legacy_sheet") return "sold";
  return String(row.status);
}

function OrderBoard({
  quotes,
  onUpdate,
  busy,
  onOpenBuilder
}: {
  quotes: CrmQuote[];
  onUpdate: (event: FormEvent<HTMLFormElement>, quote: CrmQuote) => Promise<void>;
  busy: boolean;
  onOpenBuilder: (quoteId: string) => void;
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
            <button
              type="button"
              className="crm-ghost-button"
              onClick={() => onOpenBuilder(quote.id)}
              style={{ marginBottom: 10 }}
            >
              Edit line items &amp; pricing
            </button>
            <form className="crm-order-form" onSubmit={(event) => onUpdate(event, quote)}>
              <div className="crm-field-row">
                <label>
                  Status
                  <select name="status" defaultValue={quote.status}>
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

function AvailabilityBoard({ session, events }: { session: Session; events: CrmCalendarEvent[] }) {
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
    <section className="crm-workspace crm-workspace-wide crm-availability-workspace">
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
  events,
  anchorDate,
  view,
  onDateChange,
  onViewChange,
  onSelectSlot
}: {
  events: CrmCalendarEvent[];
  anchorDate: string;
  view: CalendarView;
  onDateChange: (date: string) => void;
  onViewChange: (view: CalendarView) => void;
  onSelectSlot: (slot: CalendarSlotSelection) => void;
}) {
  const today = losAngelesDateString();
  const weekStart = startOfCalendarWeek(anchorDate);
  const weekDays = useMemo(() => calendarWeekDays(startOfCalendarWeek(anchorDate)), [anchorDate]);
  const monthStart = startOfCalendarMonth(anchorDate);
  const monthDays = useMemo(() => calendarMonthDays(anchorDate), [anchorDate]);
  const timelineDays = view === "day" ? [anchorDate] : weekDays;
  const rangeStart = view === "month" ? monthDays[0] : timelineDays[0];
  const rangeEnd = view === "month" ? addCalendarDays(monthDays[monthDays.length - 1], 1) : addCalendarDays(timelineDays[timelineDays.length - 1], 1);
  const visibleEvents = calendarEventsForRange(events, rangeStart, rangeEnd);
  const rangeLabel =
    view === "day"
      ? formatCalendarLongDay(anchorDate)
      : view === "week"
        ? `${formatCalendarDay(weekStart)} - ${formatCalendarDay(weekDays[weekDays.length - 1])}`
        : formatCalendarMonth(monthStart);

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

      {view === "month" ? (
        <CalendarMonthGrid days={monthDays} events={visibleEvents} monthStart={monthStart} today={today} onOpenDay={openDay} />
      ) : (
        <CalendarTimelineGrid days={timelineDays} events={visibleEvents} onSelectSlot={onSelectSlot} view={view} />
      )}
    </section>
  );
}

function CalendarTimelineGrid({
  days,
  events,
  onSelectSlot,
  view
}: {
  days: string[];
  events: CrmCalendarEvent[];
  onSelectSlot: (slot: CalendarSlotSelection) => void;
  view: "day" | "week";
}) {
  return (
    <div className="crm-calendar-grid-wrap">
      <div className={`crm-calendar-grid crm-calendar-grid--${view}`}>
        <div className="crm-calendar-time-head" style={{ gridColumn: 1, gridRow: 1 }}>Time</div>
        {days.map((day, dayIndex) => (
          <div className="crm-calendar-day-head" key={day} style={{ gridColumn: dayIndex + 2, gridRow: 1 }}>
            <span>{formatCalendarWeekday(day)}</span>
            <strong>{formatCalendarDayNumber(day)}</strong>
            <em>{calendarEventsForDay(events, day).length || "0"} appt</em>
          </div>
        ))}

        {calendarSlotHours.map((hour, rowIndex) => (
          <Fragment key={hour}>
            <div className="crm-calendar-time-label" style={{ gridColumn: 1, gridRow: rowIndex + 2 }}>
              <strong>{formatCalendarHour(hour)}</strong>
              <span>{formatCalendarHour(hour + 1)}</span>
            </div>
            {days.map((day, dayIndex) => {
              const event = findCalendarEventForSlot(events, day, hour);
              const past = isPastCalendarSlot(day, hour);
              const slot = calendarSlotSelection(day, hour);

              return (
                <button
                  type="button"
                  aria-label={`${event ? "Booked" : "Add appointment"} ${formatCalendarLongDay(day)} ${formatCalendarHour(hour)}`}
                  className={`crm-calendar-slot${event ? " crm-calendar-slot--taken" : ""}${past ? " crm-calendar-slot--past" : ""}`}
                  disabled={Boolean(event) || past}
                  key={`${day}-${hour}`}
                  onClick={() => onSelectSlot(slot)}
                  style={{ gridColumn: dayIndex + 2, gridRow: rowIndex + 2 }}
                >
                  <span>{event ? "Booked" : "Open"}</span>
                  <small>{event ? "Scheduled" : "Add appointment"}</small>
                </button>
              );
            })}
          </Fragment>
        ))}
        {events.map((event) => {
          const placement = calendarEventPlacement(event, days);
          if (!placement) return null;
          const detailLines = calendarEventDescriptionLines(event);
          const descriptionLabel = calendarEventDescriptionLabel(event);

          return (
            <article
              aria-label={descriptionLabel}
              className={calendarEventClassName(event)}
              key={event.id}
              style={{
                gridColumn: placement.column,
                gridRow: `${placement.rowStart} / ${placement.rowEnd}`
              }}
              title={descriptionLabel}
            >
              <div className="crm-calendar-event-time">
                <span>
                  {calendarTimeFormatter.format(new Date(event.start_at))} -{" "}
                  {calendarTimeFormatter.format(new Date(event.end_at))}
                </span>
                <b>{calendarEventDurationLabel(event)}</b>
              </div>
              <h3>{calendarEventCustomerLabel(event)}</h3>
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
  onOpenDay
}: {
  days: string[];
  events: CrmCalendarEvent[];
  monthStart: string;
  today: string;
  onOpenDay: (day: string) => void;
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
                {eventPreview.map((event) => (
                  <div className={`crm-calendar-month-event ${calendarEventToneClassName(event)}`} key={event.id}>
                    <strong>{calendarTimeFormatter.format(new Date(event.start_at))}</strong>
                    <span>{calendarEventCustomerLabel(event)}</span>
                  </div>
                ))}
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
  onDelete
}: {
  payment: CrmKenPayment;
  busy: boolean;
  onEdit: (event: FormEvent<HTMLFormElement>, payment: CrmKenPayment) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
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

function KenPayoffView({
  payoff,
  payments,
  onRecord,
  onEdit,
  onDelete,
  onSaveSettings,
  busy
}: {
  payoff: CrmKenPayoffSummary | undefined;
  payments: CrmKenPayment[];
  onRecord: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (event: FormEvent<HTMLFormElement>, payment: CrmKenPayment) => void;
  onDelete: (id: string) => void;
  onSaveSettings: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
}) {
  const target = payoff?.payoffTarget || 500000;
  const remaining = payoff?.payoffRemaining ?? target;
  const paid = payoff?.kenPaid || 0;
  const pct = payoff?.payoffPct || 0;
  const owed = payoff?.kenOwed || 0;

  return (
    <section className="crm-workspace crm-workspace-wide">
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
          <label>
            Total Payoff Target
            <input name="payoff_target" type="number" min="0" step="100" defaultValue={target} />
          </label>
          <button type="submit" disabled={busy}>
            Save Settings
          </button>
        </form>
      </CollapsiblePanel>

      <div className="crm-ledger">
        <div className="crm-section-head">
          <div>
            <p className="eyebrow">Business Payoff</p>
            <h2>Buying 805 From Ken</h2>
          </div>
          {payoff?.isPaidOff ? <strong className="crm-paidoff">PAID OFF</strong> : null}
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
            <em>opening + checks</em>
          </div>
        </div>

        <div className="crm-payoff-payments">
          <h3>Payment History</h3>
          <table className="crm-bookkeeping-table">
            <thead>
              <tr>
                <th>Check Date</th>
                <th>For Month</th>
                <th>Amount</th>
                <th>Note</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <KenPaymentRow key={payment.id} payment={payment} busy={busy} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </tbody>
          </table>
          {!payments.length ? (
            <p className="crm-empty">No Ken checks recorded yet. The opening balance above seeds the payoff.</p>
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
            <input name="address" placeholder="Project address" />
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
              <select name="assigned_to" defaultValue="Unassigned">
                {ownerOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
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
