"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { CrmAvailabilityCalendar } from "@/components/crm/CrmAvailabilityCalendar";
import { CrmPricingGuide } from "@/components/crm/CrmPricingGuide";
import { formatPaymentType } from "@/lib/crm/bookkeeping";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  CrmAccountabilityItem,
  CrmBookkeepingPaymentType,
  CrmBookkeepingRow,
  CrmCalendarEvent,
  CrmCustomerFile,
  CrmDashboardData,
  CrmJob,
  CrmJobStatus,
  CrmOrderTracker,
  CrmOrderTrackerLane,
  CrmQuote,
  CrmQuoteStatus,
  CrmSalesOpportunity,
  crmJobStatuses,
  crmQuoteStatuses
} from "@/lib/crm/types";

type CrmTab = "sales" | "command" | "customers" | "jobs" | "bookkeeping" | "orders" | "calendar" | "pricing";
type CalendarWorkspaceMode = "appointments" | "availability";
type CalendarAssigneeFilter = "all" | "Jessica" | "Mike" | "Unassigned";
type DashboardMetricKey =
  | "hot_leads"
  | "due_today"
  | "quote_needed"
  | "pipeline"
  | "ready_order"
  | "awaiting_product"
  | "ready_install"
  | "balance_risk";

type DashboardMetricDrilldown =
  | {
      key: DashboardMetricKey;
      label: string;
      value: number | string;
      count: number;
      kind: "sales";
      items: CrmSalesOpportunity[];
      empty: string;
    }
  | {
      key: DashboardMetricKey;
      label: string;
      value: number | string;
      count: number;
      kind: "orders";
      items: CrmOrderTracker[];
      empty: string;
    };
type SalesLifecycleKey = "leads" | "scheduled" | "quote_sent" | "sold" | "manufacturing" | "installation" | "complete";
type SalesLifecycleLineItem = {
  id: string;
  source: "sales" | "order";
  lifecycle: SalesLifecycleKey;
  customerName: string;
  phone: string | null;
  product: string | null;
  city: string | null;
  owner: string;
  statusLabel: string;
  value: number;
  balance: number;
  score: number | null;
  urgency: CrmOrderTracker["urgency"] | CrmSalesOpportunity["dueBucket"];
  nextAction: string;
  dueLabel: string;
  signal: string;
  blockers: string[];
  ageDays: number;
};

type CrmUser = {
  email: string;
  displayName: string | null;
};

const jobColumns: Array<{ status: CrmJobStatus; label: string }> = [
  { status: "new", label: "New" },
  { status: "follow_up", label: "Follow Up" },
  { status: "scheduled", label: "Scheduled" },
  { status: "quoted", label: "Quoted" },
  { status: "sold", label: "Sold" },
  { status: "ordered", label: "Ordered" },
  { status: "installed", label: "Installed" }
];

const productOptions = ["Shutters", "Shades", "Blinds", "Drapery", "Exterior Shades", "Mixed"];
const ownerOptions = ["Mike", "Jessica", "Unassigned"];
const calendarFilters: Array<{ value: CalendarAssigneeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "Jessica", label: "Jessica" },
  { value: "Mike", label: "Mike" },
  { value: "Unassigned", label: "Unassigned" }
];
const orderLanes: Array<{ lane: CrmOrderTrackerLane; label: string }> = [
  { lane: "ready_to_order", label: "Ready To Order" },
  { lane: "awaiting_product", label: "Awaiting Product" },
  { lane: "ready_to_install", label: "Ready To Install" },
  { lane: "installed_collect", label: "Installed / Collect" },
  { lane: "financial_review", label: "Financial Review" },
  { lane: "complete", label: "Complete" }
];
const paymentTypes: Array<{ value: CrmBookkeepingPaymentType; label: string }> = [
  { value: "zelle", label: "Zelle" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit Card" },
  { value: "other", label: "Other" }
];
const salesLifecycleFilters: Array<{ key: SalesLifecycleKey; label: string; empty: string }> = [
  { key: "leads", label: "Leads", empty: "No open leads need attention." },
  { key: "scheduled", label: "Scheduled", empty: "No sales appointments are scheduled." },
  { key: "quote_sent", label: "Quote Sent", empty: "No sent quotes are waiting for a close." },
  { key: "sold", label: "Sold", empty: "No sold jobs are waiting for order placement." },
  { key: "manufacturing", label: "Manufacturing", empty: "No orders are currently in manufacturing." },
  { key: "installation", label: "Installation", empty: "No jobs are ready for install or install follow-up." },
  { key: "complete", label: "Complete", empty: "No completed jobs are in this view." }
];

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function toCurrency(value: number | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "Open";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit"
  }).format(new Date(value));
}

function formatLongDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatMonthTitle(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(value);
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatEventTimeRange(event: CrmCalendarEvent) {
  return `${formatEventTime(event.start_at)} - ${formatEventTime(event.end_at)}`;
}

function losAngelesDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calendarMonthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(monthDate: Date) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const today = toIsoDate(new Date());

  return Array.from({ length: 42 }, (_item, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateKey = toIsoDate(date);

    return {
      date,
      dateKey,
      day: date.getDate(),
      currentMonth: date.getMonth() === monthDate.getMonth(),
      today: dateKey === today
    };
  });
}

function eventMetaText(event: CrmCalendarEvent, key: string) {
  const value = event.meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function eventCustomerName(event: CrmCalendarEvent) {
  return eventMetaText(event, "customer_name") || event.customer_name || event.title;
}

function eventCustomerPhone(event: CrmCalendarEvent) {
  return eventMetaText(event, "customer_phone") || eventMetaText(event, "customer_phone_normalized");
}

function eventSourceLabel(event: CrmCalendarEvent) {
  if (eventMetaText(event, "imported_from")) return "MTS import";
  return eventMetaText(event, "bookingSource") || eventMetaText(event, "source") || event.event_type.replace("_", " ");
}

function formatAge(days: number) {
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function formatStatusLabel(value: string | null | undefined) {
  if (!value) return "Open";
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function ownerLabel(value: string | null | undefined): "Mike" | "Jessica" | "" {
  const lower = (value || "").toLowerCase();
  if (lower.includes("jessica")) return "Jessica";
  if (lower.includes("mike")) return "Mike";
  return "";
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

export function CrmApp() {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CrmUser | null>(null);
  const [data, setData] = useState<CrmDashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<CrmTab>("sales");
  const [calendarMode, setCalendarMode] = useState<CalendarWorkspaceMode>("appointments");
  const [activeMetric, setActiveMetric] = useState<DashboardMetricKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [authSetupMessage, setAuthSetupMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const configured = Boolean(supabase);
  const jobs = useMemo(() => data?.jobs || [], [data]);
  const quotes = useMemo(() => data?.quotes || [], [data]);
  const events = useMemo(() => data?.events || [], [data]);
  const rows = useMemo(() => data?.bookkeepingRows || [], [data]);
  const customerFiles = useMemo(() => data?.customerFiles || [], [data]);
  const accountability = useMemo(() => data?.accountability || [], [data]);
  const salesOpportunities = useMemo(() => data?.salesOpportunities || [], [data]);
  const orderTrackers = useMemo(() => data?.orderTrackers || [], [data]);
  const metricDrilldowns = useMemo<DashboardMetricDrilldown[]>(() => {
    const hotLeads = salesOpportunities.filter((item) => item.score >= 80);
    const dueToday = salesOpportunities.filter((item) => item.dueBucket === "overdue" || item.dueBucket === "today");
    const quoteNeeded = salesOpportunities.filter((item) => item.status === "scheduled" || item.status === "quoted");
    const readyOrder = orderTrackers.filter((item) => item.lane === "ready_to_order");
    const awaitingProduct = orderTrackers.filter((item) => item.lane === "awaiting_product");
    const readyInstall = orderTrackers.filter((item) => item.lane === "ready_to_install");
    const balanceRisk = orderTrackers.filter((item) => item.balance > 0);

    return [
      {
        key: "hot_leads",
        label: "Hot Leads",
        value: data?.salesSystemSummary.hot || 0,
        count: hotLeads.length,
        kind: "sales",
        items: hotLeads,
        empty: "No high-score opportunities."
      },
      {
        key: "due_today",
        label: "Due Today",
        value: (data?.salesSystemSummary.today || 0) + (data?.salesSystemSummary.overdue || 0),
        count: dueToday.length,
        kind: "sales",
        items: dueToday,
        empty: "No follow-ups are due today or overdue."
      },
      {
        key: "quote_needed",
        label: "Quote Needed",
        value: data?.salesSystemSummary.quoteNeeded || 0,
        count: quoteNeeded.length,
        kind: "sales",
        items: quoteNeeded,
        empty: "No scheduled or quoted jobs need quote work."
      },
      {
        key: "pipeline",
        label: "Pipeline",
        value: toCurrency(data?.salesSystemSummary.pipelineValue),
        count: salesOpportunities.length,
        kind: "sales",
        items: salesOpportunities,
        empty: "No active sales opportunities."
      },
      {
        key: "ready_order",
        label: "Ready Order",
        value: data?.orderSystemSummary.readyToOrder || 0,
        count: readyOrder.length,
        kind: "orders",
        items: readyOrder,
        empty: "No sold jobs are waiting for order placement."
      },
      {
        key: "awaiting_product",
        label: "Awaiting Product",
        value: data?.orderSystemSummary.awaitingProduct || 0,
        count: awaitingProduct.length,
        kind: "orders",
        items: awaitingProduct,
        empty: "No orders are waiting on product."
      },
      {
        key: "ready_install",
        label: "Ready Install",
        value: data?.orderSystemSummary.readyToInstall || 0,
        count: readyInstall.length,
        kind: "orders",
        items: readyInstall,
        empty: "No received jobs are ready for install."
      },
      {
        key: "balance_risk",
        label: "Balance Risk",
        value: toCurrency(data?.orderSystemSummary.balanceAtRisk),
        count: balanceRisk.length,
        kind: "orders",
        items: balanceRisk,
        empty: "No open balances in the active order list."
      }
    ];
  }, [data, orderTrackers, salesOpportunities]);
  const activeMetricDrilldown = metricDrilldowns.find((metric) => metric.key === activeMetric) || null;

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
    if (!session) return;
    const dashboardResult = await crmFetch<CrmDashboardData>(session, "/api/crm/jobs");
    setData(dashboardResult);
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
          product_interest: formString(formData, "product_interest").toLowerCase(),
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

  async function updateJobOwner(job: CrmJob, salesOwner: string) {
    if (!session) return;

    setData((current) =>
      current
        ? {
            ...current,
            jobs: current.jobs.map((item) => (item.id === job.id ? { ...item, sales_owner: salesOwner } : item))
          }
        : current
    );

    try {
      await crmFetch<{ job: CrmJob }>(session, `/api/crm/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sales_owner: salesOwner })
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CRM job could not be updated.");
      await refresh();
    }
  }

  async function assignRowSalesOwner(
    target: { id: string; source: CrmBookkeepingRow["source"]; quoteId: string | null; customerName?: string },
    owner: "mike" | "jessica"
  ) {
    if (!session) return;
    setBusy(true);
    setMessage(null);

    try {
      if (target.source === "crm_quote" && target.quoteId) {
        await crmFetch<{ quote: CrmQuote }>(session, `/api/crm/quotes/${target.quoteId}`, {
          method: "PATCH",
          body: JSON.stringify({
            sold_by: owner === "jessica" ? "Jessica" : "Mike",
            ...(target.customerName && target.customerName !== "Linked job"
              ? { customer_name: target.customerName }
              : {})
          })
        });
      } else {
        await crmFetch<{ entry: unknown }>(session, `/api/crm/bookkeeping/${target.id}`, {
          method: "PATCH",
          body: JSON.stringify({ sales_owner: owner })
        });
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Salesperson could not be assigned.");
    } finally {
      setBusy(false);
    }
  }

  async function createExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    const [targetKind, targetId] = formString(formData, "target").split(":");
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ expense: unknown }>(session, "/api/crm/expenses", {
        method: "POST",
        body: JSON.stringify({
          [targetKind === "quote" ? "quote_id" : "bookkeeping_entry_id"]: targetId,
          label: formString(formData, "label"),
          category: formString(formData, "category") || "other",
          amount: Number(formString(formData, "amount") || 0),
          incurred_on: formString(formData, "incurred_on") || null,
          notes: formString(formData, "notes")
        })
      });
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Expense could not be saved.");
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

  async function createBookkeepingEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ entry: unknown }>(session, "/api/crm/bookkeeping", {
        method: "POST",
        body: JSON.stringify({
          source: formString(formData, "source"),
          customer_name: formString(formData, "customer_name"),
          sold_date: formString(formData, "sold_date"),
          total_amount: Number(formString(formData, "total_amount") || 0),
          deposit_paid: Number(formString(formData, "deposit_paid") || 0),
          balance_paid: Number(formString(formData, "balance_paid") || 0),
          payment_type: formString(formData, "payment_type"),
          cogs_amount: Number(formString(formData, "cogs_amount") || 0),
          ken_cut_override: formString(formData, "ken_cut_override") || null,
          sales_owner: formString(formData, "sales_owner"),
          manufacturer_name: formString(formData, "manufacturer_name"),
          manufacturer_order_ref: formString(formData, "manufacturer_order_ref"),
          manufacturer_order_url: formString(formData, "manufacturer_order_url"),
          installation_invoice_amount: Number(formString(formData, "installation_invoice_amount") || 0),
          installation_invoice_number: formString(formData, "installation_invoice_number"),
          installation_complete: formData.get("installation_complete") === "on",
          jessica_commission_paid: formData.get("jessica_commission_paid") === "on",
          notes: formString(formData, "notes")
        })
      });
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bookkeeping row could not be saved.");
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
      // Only send COGS when the field was filled so an empty input cannot
      // zero out a value bookkeeping already entered. Likewise sold_by is
      // only sent when actually changed, so a routine order update cannot
      // undo a reassignment made from the bookkeeping screen.
      const materialsCost = formString(formData, "materials_cost");
      const soldBy = formString(formData, "sold_by");
      await crmFetch<{ quote: CrmQuote }>(session, `/api/crm/quotes/${quote.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          customer_name: quote.customer_name || formString(formData, "customer_name"),
          status: formString(formData, "status"),
          ...(soldBy !== ownerLabel(quote.sold_by) ? { sold_by: soldBy } : {}),
          ...(materialsCost ? { materials_cost: Number(materialsCost) } : {}),
          manufacturer_name: formString(formData, "manufacturer_name"),
          manufacturer_order_ref: formString(formData, "manufacturer_order_ref"),
          manufacturer_order_url: formString(formData, "manufacturer_order_url"),
          manufacturer_document_url: formString(formData, "manufacturer_document_url"),
          payment_amount: Number(formString(formData, "payment_amount") || 0),
          payment_label: formString(formData, "payment_label"),
          payment_type: formString(formData, "payment_type"),
          paid_at: formString(formData, "paid_at") || null,
          payment_notes: formString(formData, "payment_notes"),
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

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const formData = new FormData(event.currentTarget);
    const date = formString(formData, "date");
    const time = formString(formData, "time");
    const duration = Number(formString(formData, "duration") || 90);
    const start = new Date(`${date}T${time || "09:00"}`);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const jobId = formString(formData, "job_id");
    const job = jobs.find((item) => item.id === jobId);

    setBusy(true);
    setMessage(null);

    try {
      await crmFetch<{ event: CrmCalendarEvent }>(session, "/api/crm/calendar", {
        method: "POST",
        body: JSON.stringify({
          job_id: jobId || null,
          title: formString(formData, "title") || (job ? `${job.customer_name} consultation` : "Sales appointment"),
          event_type: formString(formData, "event_type") || "sales_consult",
          assigned_to: formString(formData, "assigned_to") || "Jessica",
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          location: formString(formData, "location") || job?.address,
          notes: formString(formData, "notes"),
          meta: {
            customer_name: formString(formData, "title") || job?.customer_name || null,
            customer_phone: formString(formData, "customer_phone") || job?.phone || null,
            source: "805_crm_calendar"
          }
        })
      });
      event.currentTarget.reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calendar event could not be saved.");
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
          <h1>Google login only.</h1>
          <p>Use an approved 805 Shutters Google account to access sales jobs, quotes, bookkeeping, and calendar.</p>
          {authSetupMessage ? <p className="crm-alert">{authSetupMessage}</p> : null}
          <a className="button primary" href="/api/crm/oauth/google/?redirectTo=%2Fcrm">
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
      <header className="crm-topbar">
        <div>
          <p className="eyebrow">805 Shutters</p>
          <h1>CRM Command</h1>
        </div>
        <div className="crm-user">
          <span>{user?.displayName || user?.email}</span>
          <button type="button" className="crm-ghost-button" onClick={refresh}>
            Refresh
          </button>
          <button type="button" className="crm-ghost-button" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>

      {message ? <p className="crm-alert">{message}</p> : null}

      <section className="crm-metrics" aria-label="CRM summary">
        {metricDrilldowns.map((metric) => (
          <Metric
            key={metric.key}
            label={metric.label}
            value={metric.value}
            count={metric.count}
            active={metric.key === activeMetric}
            onClick={() => setActiveMetric((current) => (current === metric.key ? null : metric.key))}
          />
        ))}
      </section>

      {activeMetricDrilldown ? (
        <MetricDrilldownPanel
          metric={activeMetricDrilldown}
          onClose={() => setActiveMetric(null)}
        />
      ) : null}

      <nav className="crm-tabs" aria-label="CRM sections">
        {[
          ["sales", "Sales System"],
          ["command", "Command Center"],
          ["customers", "Customer Files"],
          ["jobs", "Sales Jobs"],
          ["bookkeeping", "Bookkeeping"],
          ["orders", "Orders"],
          ["calendar", "Calendar"],
          ["pricing", "Pricing"]
        ].map(([tab, label]) => (
          <button
            type="button"
            key={tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab as CrmTab)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "sales" ? (
        <SalesSystemView
          opportunities={salesOpportunities}
          orderTrackers={orderTrackers}
          salesSummary={data?.salesSystemSummary}
          orderSummary={data?.orderSystemSummary}
        />
      ) : null}

      {activeTab === "command" ? (
        <section className="crm-command-grid">
          <AccountabilityBoard items={accountability} onAssignOwner={assignRowSalesOwner} busy={busy} />
          <BookkeepingSnapshot rows={rows} />
        </section>
      ) : null}

      {activeTab === "customers" ? <CustomerFilesView files={customerFiles} /> : null}

      {activeTab === "jobs" ? (
        <section className="crm-workspace">
          <aside className="crm-panel">
            <h2>New Sales Job</h2>
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
          </aside>

          <div className="crm-kanban">
            {jobColumns.map((column) => (
              <section className="crm-column" key={column.status}>
                <div className="crm-column-head">
                  <h2>{column.label}</h2>
                  <span>{jobs.filter((job) => job.status === column.status).length}</span>
                </div>
                <div className="crm-card-stack">
                  {jobs
                    .filter((job) => job.status === column.status)
                    .map((job) => (
                      <JobCard job={job} key={job.id} onStatusChange={updateJobStatus} onOwnerChange={updateJobOwner} />
                    ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "bookkeeping" ? (
        <section className="crm-workspace crm-bookkeeping-workspace">
          <aside className="crm-panel">
            <h2>Add Spreadsheet Row</h2>
            <form className="crm-form" onSubmit={createBookkeepingEntry}>
              <div className="crm-field-row">
                <label>
                  Source
                  <select name="source" defaultValue="manual">
                    <option value="manual">Manual</option>
                    <option value="legacy_sheet">Legacy Sheet</option>
                  </select>
                </label>
                <label>
                  Sold Date
                  <input name="sold_date" type="date" defaultValue={todayInputValue()} />
                </label>
              </div>
              <label>
                Customer
                <input name="customer_name" required placeholder="Customer name" />
              </label>
              <div className="crm-field-row">
                <label>
                  Total
                  <input name="total_amount" type="number" min="0" step="0.01" required />
                </label>
                <label>
                  COGS
                  <input name="cogs_amount" type="number" min="0" step="0.01" />
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
              <div className="crm-field-row">
                <label>
                  Payment
                  <select name="payment_type" defaultValue="other">
                    {paymentTypes.map((item) => (
                      <option value={item.value} key={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sales Owner
                  <select name="sales_owner" defaultValue="mike">
                    <option value="mike">Mike</option>
                    <option value="jessica">Jessica</option>
                  </select>
                </label>
              </div>
              <label>
                Ken Cut Override
                <input
                  name="ken_cut_override"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Auto: 10%, Jessica jobs exempt"
                />
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
              <div className="crm-field-row">
                <label>
                  Install Invoice
                  <input name="installation_invoice_amount" type="number" min="0" step="0.01" />
                </label>
                <label>
                  Invoice #
                  <input name="installation_invoice_number" placeholder="Invoice number" />
                </label>
              </div>
              <label className="crm-checkbox">
                <input name="installation_complete" type="checkbox" />
                Installation complete
              </label>
              <label className="crm-checkbox">
                <input name="jessica_commission_paid" type="checkbox" />
                Jessica commission paid
              </label>
              <label>
                Notes
                <textarea name="notes" rows={4} placeholder="Payment notes, order details, install status..." />
              </label>
              <button type="submit" disabled={busy}>
                Save Row
              </button>
            </form>

            <h2>Add Job Expense</h2>
            <form className="crm-form" onSubmit={createExpense}>
              <label>
                Job / Row
                <select name="target" required>
                  <option value="">Choose sale</option>
                  {rows.map((row) => (
                    <option
                      value={row.source === "crm_quote" ? `quote:${row.quoteId}` : `entry:${row.id}`}
                      key={`expense-target-${row.id}`}
                    >
                      {row.customerName} - {formatShortDate(row.soldDate)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="crm-field-row">
                <label>
                  Amount
                  <input name="amount" type="number" min="0.01" step="0.01" required />
                </label>
                <label>
                  Category
                  <select name="category" defaultValue="other">
                    <option value="materials">Materials</option>
                    <option value="installation_extra">Install extra</option>
                    <option value="processing_fee">Card/processing fee</option>
                    <option value="permit">Permit</option>
                    <option value="repair">Repair</option>
                    <option value="referral">Referral</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>
              <div className="crm-field-row">
                <label>
                  Label
                  <input name="label" required placeholder="What was this expense?" />
                </label>
                <label>
                  Date
                  <input name="incurred_on" type="date" defaultValue={todayInputValue()} />
                </label>
              </div>
              <label>
                Notes
                <input name="notes" placeholder="Optional details" />
              </label>
              <button type="submit" disabled={busy}>
                Add Expense
              </button>
            </form>
          </aside>

          <BookkeepingSpreadsheet
            rows={rows}
            totals={data?.bookkeepingTotals}
            onAssignOwner={assignRowSalesOwner}
            busy={busy}
          />
        </section>
      ) : null}

      {activeTab === "orders" ? (
        <section className="crm-workspace crm-workspace-wide">
          <aside className="crm-panel">
            <h2>New Quote / Sold Job</h2>
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
                        {formatStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sold By
                  <select name="sold_by" defaultValue="">
                    <option value="">Job&apos;s salesperson</option>
                    <option value="Mike">Mike</option>
                    <option value="Jessica">Jessica</option>
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
          </aside>

          <OrderBoard trackers={orderTrackers} quotes={quotes} onUpdate={updateQuote} busy={busy} />
        </section>
      ) : null}

      {activeTab === "calendar" ? (
        <section className="crm-calendar-workspace">
          <div className="crm-calendar-mode-tabs" role="tablist" aria-label="Calendar workflow">
            <button
              type="button"
              className={calendarMode === "appointments" ? "active" : ""}
              onClick={() => setCalendarMode("appointments")}
            >
              Appointments
            </button>
            <button
              type="button"
              className={calendarMode === "availability" ? "active" : ""}
              onClick={() => setCalendarMode("availability")}
            >
              Jessica Availability
            </button>
          </div>

          {calendarMode === "appointments" ? (
            <section className="crm-workspace crm-workspace-wide">
              <aside className="crm-panel">
                <h2>Schedule</h2>
                <form className="crm-form" onSubmit={createEvent}>
                  <label>
                    Job
                    <select name="job_id">
                      <option value="">No linked job</option>
                      {jobs.map((job) => (
                        <option value={job.id} key={job.id}>
                          {job.customer_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Customer / Title
                    <input name="title" placeholder="Customer name or sales consultation" />
                  </label>
                  <label>
                    Phone
                    <input name="customer_phone" placeholder="805-000-0000" />
                  </label>
                  <div className="crm-field-row">
                    <label>
                      Date
                      <input name="date" type="date" required defaultValue={todayInputValue()} />
                    </label>
                    <label>
                      Time
                      <input name="time" type="time" required defaultValue="09:00" />
                    </label>
                  </div>
                  <div className="crm-field-row">
                    <label>
                      Duration
                      <select name="duration" defaultValue="90">
                        <option value="60">1 hour</option>
                        <option value="90">1.5 hours</option>
                        <option value="120">2 hours</option>
                        <option value="180">3 hours</option>
                      </select>
                    </label>
                    <label>
                      Assigned
                      <select name="assigned_to" defaultValue="Jessica">
                        {ownerOptions.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Location
                    <input name="location" placeholder="Customer address" />
                  </label>
                  <label>
                    Notes
                    <textarea name="notes" rows={4} placeholder="Gate code, rooms, samples to bring..." />
                  </label>
                  <button type="submit" disabled={busy}>
                    Add Event
                  </button>
                </form>
              </aside>

              <SalesCalendarView events={events} />
            </section>
          ) : (
            <CrmAvailabilityCalendar session={session} />
          )}
        </section>
      ) : null}

      {activeTab === "pricing" ? <CrmPricingGuide /> : null}
    </div>
  );
}

function Metric({
  label,
  value,
  count,
  active,
  onClick
}: {
  label: string;
  value: number | string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {typeof count === "number" ? (
        <em>
          {count} job{count === 1 ? "" : "s"}
        </em>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={`crm-metric crm-metric-button${active ? " active" : ""}`}
        onClick={onClick}
        aria-pressed={active}
        aria-label={`Show ${label} jobs`}
      >
        {content}
      </button>
    );
  }

  return <div className="crm-metric">{content}</div>;
}

function MetricDrilldownPanel({
  metric,
  onClose
}: {
  metric: DashboardMetricDrilldown;
  onClose: () => void;
}) {
  return (
    <section className="crm-metric-drilldown">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Metric List</p>
          <h2>{metric.label}</h2>
        </div>
        <div className="crm-metric-drilldown-meta">
          <strong>{metric.count}</strong>
          <button type="button" className="crm-ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {metric.kind === "sales" ? (
        <SalesOpportunityList items={metric.items} empty={metric.empty} />
      ) : (
        <OrderTrackerList items={metric.items} empty={metric.empty} />
      )}
    </section>
  );
}

type ProductAnalyticsItem = {
  product: string;
  count: number;
  revenue: number;
  profit: number;
  margin: number;
  missingCogs: number;
  color: string;
};

const productAnalyticsColors = ["#102033", "#2f7dbb", "#3f7a56", "#9a7d58", "#8b3f24", "#6e5b8c", "#4f6d72"];

function toPercent(value: number) {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  }).format(value)}%`;
}

function normalizeProductAnalyticsLabel(value: string | null | undefined) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!cleaned || cleaned.toLowerCase() === "mixed") return cleaned ? "Mixed" : "Needs Product Type";

  return cleaned
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildProductAnalytics(trackers: CrmOrderTracker[]) {
  const groups = new Map<string, Omit<ProductAnalyticsItem, "color" | "margin">>();

  for (const tracker of trackers) {
    const product = normalizeProductAnalyticsLabel(tracker.productInterest);
    const existing = groups.get(product) || {
      product,
      count: 0,
      revenue: 0,
      profit: 0,
      missingCogs: 0
    };

    existing.count += 1;
    existing.revenue += tracker.total;
    existing.profit += tracker.mikeProfit;
    existing.missingCogs += tracker.cogs <= 0 && tracker.total > 0 ? 1 : 0;
    groups.set(product, existing);
  }

  return Array.from(groups.values())
    .map((item, index) => ({
      ...item,
      revenue: Math.round(item.revenue * 100) / 100,
      profit: Math.round(item.profit * 100) / 100,
      margin: item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0,
      color: productAnalyticsColors[index % productAnalyticsColors.length]
    }))
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue);
}

function getOpportunityLifecycle(item: CrmSalesOpportunity): SalesLifecycleKey {
  if (item.status === "scheduled") return "scheduled";
  if (item.status === "quoted") return "quote_sent";
  return "leads";
}

function getOrderLifecycle(tracker: CrmOrderTracker): SalesLifecycleKey {
  const status = String(tracker.status);
  if (tracker.lane === "complete") return "complete";
  if (
    tracker.lane === "ready_to_install" ||
    tracker.lane === "installed_collect" ||
    status === "received" ||
    status === "installed" ||
    status === "invoiced"
  ) {
    return "installation";
  }
  if (tracker.lane === "awaiting_product" || status === "ordered") return "manufacturing";
  return "sold";
}

function buildSalesLifecycleLineItems(
  opportunities: CrmSalesOpportunity[],
  orderTrackers: CrmOrderTracker[]
): SalesLifecycleLineItem[] {
  const salesItems: SalesLifecycleLineItem[] = opportunities.map((item) => ({
    id: item.id,
    source: "sales",
    lifecycle: getOpportunityLifecycle(item),
    customerName: item.customerName,
    phone: item.phone,
    product: item.productInterest,
    city: item.city,
    owner: item.owner,
    statusLabel: formatStatusLabel(item.status === "quoted" ? "quote sent" : item.status),
    value: item.value,
    balance: 0,
    score: item.score,
    urgency: item.dueBucket,
    nextAction: item.nextAction,
    dueLabel: item.dueDate || formatStatusLabel(item.dueBucket),
    signal: item.signal,
    blockers: item.blockers,
    ageDays: item.ageDays
  }));
  const orderItems: SalesLifecycleLineItem[] = orderTrackers.map((tracker) => ({
    id: tracker.id,
    source: "order",
    lifecycle: getOrderLifecycle(tracker),
    customerName: tracker.customerName,
    phone: tracker.quoteNumber,
    product: tracker.productInterest,
    city: null,
    owner: formatStatusLabel(tracker.salesOwner || "Unassigned"),
    statusLabel: tracker.lane === "awaiting_product" ? "Manufacturing" : tracker.laneLabel,
    value: tracker.total,
    balance: tracker.balance,
    score: null,
    urgency: tracker.urgency,
    nextAction: tracker.nextAction,
    dueLabel: tracker.stageDate ? formatShortDate(tracker.stageDate) : formatAge(tracker.ageDays),
    signal: tracker.manufacturerName || formatStatusLabel(tracker.status),
    blockers: tracker.blockers,
    ageDays: tracker.ageDays
  }));

  return [...salesItems, ...orderItems].sort((a, b) => {
    if (a.lifecycle !== b.lifecycle) {
      return (
        salesLifecycleFilters.findIndex((filter) => filter.key === a.lifecycle) -
        salesLifecycleFilters.findIndex((filter) => filter.key === b.lifecycle)
      );
    }
    return b.value - a.value || b.ageDays - a.ageDays;
  });
}

function SalesSystemView({
  opportunities,
  orderTrackers,
  salesSummary,
  orderSummary
}: {
  opportunities: CrmSalesOpportunity[];
  orderTrackers: CrmOrderTracker[];
  salesSummary: CrmDashboardData["salesSystemSummary"] | undefined;
  orderSummary: CrmDashboardData["orderSystemSummary"] | undefined;
}) {
  const [activeLifecycle, setActiveLifecycle] = useState<SalesLifecycleKey>("leads");
  const lifecycleItems = useMemo(() => buildSalesLifecycleLineItems(opportunities, orderTrackers), [opportunities, orderTrackers]);
  const activeLifecycleFilter =
    salesLifecycleFilters.find((filter) => filter.key === activeLifecycle) || salesLifecycleFilters[0];
  const activeLifecycleItems = lifecycleItems.filter((item) => item.lifecycle === activeLifecycle);
  const urgentOrders = orderTrackers.filter((item) => item.urgency === "urgent").slice(0, 6);

  return (
    <section className="crm-sales-system">
      <div className="crm-sales-hero">
        <div>
          <p className="eyebrow">Elite Sales System</p>
          <h2>Close the sale, place the order, collect the balance.</h2>
        </div>
        <div className="crm-sales-scoreboard">
          <Metric label="Active Opps" value={salesSummary?.opportunities || 0} />
          <Metric label="Open Orders" value={orderSummary?.openOrders || 0} />
          <Metric label="Order Value" value={toCurrency(orderSummary?.orderValue)} />
          <Metric label="Mike Profit" value={toCurrency(orderTrackers.reduce((sum, item) => sum + item.mikeProfit, 0))} />
        </div>
      </div>

      <ProductAnalyticsPanel trackers={orderTrackers} />

      <section className="crm-lifecycle-panel">
        <div className="crm-section-head">
          <div>
            <p className="eyebrow">Line Item View</p>
            <h2>Status pipeline</h2>
          </div>
          <strong>{activeLifecycleItems.length}</strong>
        </div>
        <div className="crm-lifecycle-filters" aria-label="Filter sales jobs by status">
          {salesLifecycleFilters.map((filter) => {
            const count = lifecycleItems.filter((item) => item.lifecycle === filter.key).length;
            return (
              <button
                type="button"
                key={filter.key}
                className={activeLifecycle === filter.key ? "active" : ""}
                onClick={() => setActiveLifecycle(filter.key)}
              >
                <span>{filter.label}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </div>
        <SalesLifecycleLineItemList items={activeLifecycleItems} empty={activeLifecycleFilter.empty} />
      </section>

      <div className="crm-ops-grid">
        <section className="crm-ops-panel">
          <div className="crm-section-head">
            <div>
              <p className="eyebrow">Sales Playbook</p>
              <h2>805 Job Lifecycle</h2>
            </div>
          </div>
          <div className="crm-stage-rail">
            {[
              ["Lead", "Qualify phone, product, city, urgency."],
              ["Measure", "Book consult and capture rooms/windows."],
              ["Quote", "Send price, collect deposit, assign owner."],
              ["Order", "Enter vendor order, attach proof, record COGS."],
              ["Receive", "Mark product landed and schedule install."],
              ["Close", "Invoice install, collect balance, pay commission."]
            ].map(([title, detail], index) => (
              <article key={title}>
                <span>{index + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="crm-ops-panel">
          <div className="crm-section-head">
            <div>
              <p className="eyebrow">Order Pulse</p>
              <h2>Urgent Order Work</h2>
            </div>
            <strong>{urgentOrders.length}</strong>
          </div>
          <div className="crm-pulse-list">
            {urgentOrders.map((tracker) => (
              <OrderPulseCard tracker={tracker} key={`${tracker.lane}-${tracker.id}`} />
            ))}
            {!urgentOrders.length ? <p className="crm-empty">No urgent order work.</p> : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function ProductAnalyticsPanel({ trackers }: { trackers: CrmOrderTracker[] }) {
  const analytics = useMemo(() => buildProductAnalytics(trackers), [trackers]);
  const totalSold = analytics.reduce((sum, item) => sum + item.count, 0);
  const totalRevenue = analytics.reduce((sum, item) => sum + item.revenue, 0);
  const totalProfit = analytics.reduce((sum, item) => sum + item.profit, 0);
  const totalMissingCogs = analytics.reduce((sum, item) => sum + item.missingCogs, 0);
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return (
    <section className="crm-product-analytics">
      <div className="crm-product-chart-card">
        <div className="crm-section-head">
          <div>
            <p className="eyebrow">Product Mix</p>
            <h2>Product types sold</h2>
          </div>
          <strong>{totalSold}</strong>
        </div>
        {analytics.length ? (
          <div className="crm-product-chart-layout">
            <ProductPieChart items={analytics} total={totalSold} />
            <div className="crm-product-legend" aria-label="Product type legend">
              {analytics.map((item) => (
                <div key={item.product}>
                  <span style={{ backgroundColor: item.color }} />
                  <strong>{item.product}</strong>
                  <em>
                    {item.count} sold / {toPercent((item.count / totalSold) * 100)}
                  </em>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="crm-empty">Sold product mix will appear after orders are attached to product types.</p>
        )}
      </div>

      <div className="crm-product-chart-card">
        <div className="crm-section-head">
          <div>
            <p className="eyebrow">Profit Margin</p>
            <h2>Margin per product</h2>
          </div>
          <strong>{toPercent(overallMargin)}</strong>
        </div>
        <div className="crm-product-margin-grid">
          {analytics.map((item) => (
            <article className="crm-product-margin-card" key={item.product}>
              <header>
                <span style={{ backgroundColor: item.color }} />
                <h3>{item.product}</h3>
                <strong>{toPercent(item.margin)}</strong>
              </header>
              <div className="crm-product-margin-meter" aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(item.margin, 100))}%`, backgroundColor: item.color }} />
              </div>
              <dl>
                <div>
                  <dt>Revenue</dt>
                  <dd>{toCurrency(item.revenue)}</dd>
                </div>
                <div>
                  <dt>Profit</dt>
                  <dd>{toCurrency(item.profit)}</dd>
                </div>
                <div>
                  <dt>Sold</dt>
                  <dd>{item.count}</dd>
                </div>
                <div>
                  <dt>COGS Gaps</dt>
                  <dd className={item.missingCogs ? "warn" : ""}>{item.missingCogs}</dd>
                </div>
              </dl>
            </article>
          ))}
          {!analytics.length ? <p className="crm-empty">Profit margin by product will appear after sold jobs load.</p> : null}
        </div>
        {totalMissingCogs ? (
          <p className="crm-product-note">{totalMissingCogs} sold rows still need COGS before margin is fully trusted.</p>
        ) : null}
      </div>
    </section>
  );
}

function ProductPieChart({ items, total }: { items: ProductAnalyticsItem[]; total: number }) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="crm-product-pie-wrap">
      <svg className="crm-product-pie" viewBox="0 0 160 160" role="img" aria-label="Pie chart of product types sold">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#ece7df" strokeWidth="24" />
        {items.map((item) => {
          const length = total > 0 ? (item.count / total) * circumference : 0;
          const segment = (
            <circle
              cx="80"
              cy="80"
              fill="none"
              key={item.product}
              r={radius}
              stroke={item.color}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              strokeWidth="24"
              transform="rotate(-90 80 80)"
            />
          );
          offset += length;
          return segment;
        })}
      </svg>
      <div>
        <strong>{total}</strong>
        <span>sold</span>
      </div>
    </div>
  );
}

function SalesLifecycleLineItemList({ items, empty }: { items: SalesLifecycleLineItem[]; empty: string }) {
  return (
    <div className="crm-line-item-list">
      {items.length ? (
        <div className="crm-line-item-head" aria-hidden="true">
          <span>Customer</span>
          <span>Status</span>
          <span>Value</span>
          <span>Owner / Product</span>
          <span>Next</span>
          <span>Due / Stage</span>
        </div>
      ) : null}
      {items.map((item) => (
        <SalesLifecycleLineItemRow item={item} key={`${item.source}-${item.id}`} />
      ))}
      {!items.length ? <p className="crm-empty">{empty}</p> : null}
    </div>
  );
}

function SalesLifecycleLineItemRow({ item }: { item: SalesLifecycleLineItem }) {
  return (
    <article className={`crm-line-item-row ${item.urgency}`}>
      <div>
        <strong>{item.customerName}</strong>
        <span>{[item.phone, item.city].filter(Boolean).join(" / ") || "No contact detail"}</span>
      </div>
      <div>
        <span className="crm-status-chip">{item.statusLabel}</span>
        {item.score !== null ? <em>{item.score}</em> : null}
      </div>
      <div>
        <strong>{toCurrency(item.value)}</strong>
        {item.balance > 0 ? <span>{toCurrency(item.balance)} balance</span> : <span>{formatAge(item.ageDays)}</span>}
      </div>
      <div>
        <strong>{item.owner}</strong>
        <span>{item.product || "Product open"}</span>
      </div>
      <div>
        <strong>{item.nextAction}</strong>
        <span>{item.signal}</span>
      </div>
      <div>
        <strong>{item.dueLabel}</strong>
        <span>{item.blockers.length ? item.blockers.join(" / ") : "Clear"}</span>
      </div>
    </article>
  );
}

function SalesOpportunityList({ items, empty }: { items: CrmSalesOpportunity[]; empty: string }) {
  return (
    <div className="crm-sales-card-stack">
      {items.map((item) => (
        <SalesOpportunityCard item={item} key={item.id} />
      ))}
      {!items.length ? <p className="crm-empty">{empty}</p> : null}
    </div>
  );
}

function SalesOpportunityCard({ item }: { item: CrmSalesOpportunity }) {
  return (
    <article className={`crm-sales-card ${item.dueBucket}`}>
      <header>
        <div>
          <h3>{item.customerName}</h3>
          <p>{[item.productInterest, item.city, item.owner].filter(Boolean).join(" / ")}</p>
        </div>
        <strong>{item.score}</strong>
      </header>
      <dl>
        <div>
          <dt>Value</dt>
          <dd>{toCurrency(item.value)}</dd>
        </div>
        <div>
          <dt>Signal</dt>
          <dd>{item.signal}</dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>{item.nextAction}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{item.dueDate || item.dueBucket}</dd>
        </div>
      </dl>
      <footer>
        <span>{item.phone}</span>
        <em>{item.blockers.length ? item.blockers.join(" / ") : formatAge(item.ageDays)}</em>
      </footer>
    </article>
  );
}

function OrderTrackerList({ items, empty }: { items: CrmOrderTracker[]; empty: string }) {
  return (
    <div className="crm-sales-card-stack crm-metric-order-list">
      {items.map((tracker) => (
        <OrderPulseCard tracker={tracker} key={`${tracker.lane}-${tracker.id}`} />
      ))}
      {!items.length ? <p className="crm-empty">{empty}</p> : null}
    </div>
  );
}

function AccountabilityBoard({
  items,
  onAssignOwner,
  busy
}: {
  items: CrmAccountabilityItem[];
  onAssignOwner: (
    target: { id: string; source: CrmBookkeepingRow["source"]; quoteId: string | null },
    owner: "mike" | "jessica"
  ) => void;
  busy: boolean;
}) {
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
              {item.type === "assign_sales_owner" && item.rowId ? (
                <span className="crm-assign-actions">
                  <button
                    type="button"
                    className="crm-assign-button"
                    disabled={busy}
                    onClick={() =>
                      onAssignOwner(
                        {
                          id: item.rowId as string,
                          // Quote-backed ledger rows use the quote id as the row id.
                          source: item.quoteId && item.quoteId === item.rowId ? "crm_quote" : "manual",
                          quoteId: item.quoteId ?? null
                        },
                        "jessica"
                      )
                    }
                  >
                    Assign Jessica
                  </button>
                  <button
                    type="button"
                    className="crm-assign-button crm-assign-button-alt"
                    disabled={busy}
                    onClick={() =>
                      onAssignOwner(
                        {
                          id: item.rowId as string,
                          source: item.quoteId && item.quoteId === item.rowId ? "crm_quote" : "manual",
                          quoteId: item.quoteId ?? null
                        },
                        "mike"
                      )
                    }
                  >
                    Assign Mike
                  </button>
                </span>
              ) : null}
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
  const openBalances = rows.filter((row) => row.balance > 0).slice(0, 8);

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

function CustomerFilesView({ files }: { files: CrmCustomerFile[] }) {
  return (
    <section className="crm-customer-files">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Customer Files</p>
          <h2>Bookkeeping Customers</h2>
        </div>
        <strong>{files.length}</strong>
      </div>
      <div className="crm-customer-grid">
        {files.map((file) => (
          <article className="crm-customer-card" key={file.id}>
            <header className="crm-customer-card-head">
              <div>
                <h3>{file.customerName}</h3>
                <p>{[file.phone, file.email, file.city].filter(Boolean).join(" / ") || "Contact details pending"}</p>
              </div>
              <strong>{toCurrency(file.lifetimeValue)}</strong>
            </header>

            <dl className="crm-customer-facts">
              <div>
                <dt>Open Balance</dt>
                <dd className={file.openBalance > 0 ? "warn" : ""}>{toCurrency(file.openBalance)}</dd>
              </div>
              <div>
                <dt>Latest Status</dt>
                <dd>{file.latestStatus || "Open"}</dd>
              </div>
              <div>
                <dt>Sold Date</dt>
                <dd>{formatShortDate(file.latestSoldDate)}</dd>
              </div>
              <div>
                <dt>Contracts</dt>
                <dd>{file.contracts.length}</dd>
              </div>
            </dl>

            {file.address ? <p className="crm-customer-address">{file.address}</p> : null}

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
                {file.contracts.map((contract) =>
                  contract.contract_url ? (
                    <a href={contract.contract_url} target="_blank" rel="noreferrer" key={contract.id}>
                      {contract.title}
                      <span>{contract.status || "Document"}</span>
                    </a>
                  ) : (
                    <div key={contract.id}>
                      {contract.title}
                      <span>{contract.status || "No link"}</span>
                    </div>
                  )
                )}
                {!file.contracts.length ? <p>No contract or document link attached.</p> : null}
              </div>
            </div>

            <div className="crm-customer-section">
              <h4>Jobs + Bookkeeping</h4>
              <div className="crm-customer-list compact">
                {file.bookkeepingRows.slice(0, 4).map((row) => (
                  <div key={`${row.source}-${row.id}`}>
                    <strong>{row.quoteNumber || row.source.replace("_", " ")}</strong>
                    <span>{row.manufacturerName || row.status}</span>
                    <em>
                      {toCurrency(row.total)} / balance {toCurrency(row.balance)}
                    </em>
                  </div>
                ))}
                {!file.bookkeepingRows.length ? <p>No bookkeeping row attached.</p> : null}
              </div>
            </div>

            {file.notes.length ? (
              <div className="crm-customer-notes">
                <h4>Notes</h4>
                <p>{file.notes.slice(0, 3).join(" / ")}</p>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {!files.length ? <p className="crm-empty">No customer files yet. Bookkeeping rows will appear here automatically.</p> : null}
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
          <em>{row.balance > 0 ? toCurrency(row.balance) : row.status}</em>
        </article>
      ))}
      {!rows.length ? <p>{empty}</p> : null}
    </div>
  );
}

function JobCard({
  job,
  onStatusChange,
  onOwnerChange
}: {
  job: CrmJob;
  onStatusChange: (job: CrmJob, status: CrmJobStatus) => void;
  onOwnerChange: (job: CrmJob, salesOwner: string) => void;
}) {
  return (
    <article className="crm-job-card">
      <div className="crm-job-card-head">
        <h3>{job.customer_name}</h3>
        <span>{job.priority}</span>
      </div>
      <p>{job.product_interest}</p>
      <dl>
        <div>
          <dt>Phone</dt>
          <dd>{job.phone}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>
            <select
              value={ownerOptions.includes(job.sales_owner) ? job.sales_owner : "Unassigned"}
              onChange={(event) => onOwnerChange(job, event.target.value)}
              aria-label={`Salesperson for ${job.customer_name}`}
            >
              {ownerOptions.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </dd>
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
              {formatStatusLabel(status)}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function BookkeepingSpreadsheet({
  rows,
  totals,
  onAssignOwner,
  busy
}: {
  rows: CrmBookkeepingRow[];
  totals: CrmDashboardData["bookkeepingTotals"] | undefined;
  onAssignOwner: (
    target: { id: string; source: CrmBookkeepingRow["source"]; quoteId: string | null; customerName?: string },
    owner: "mike" | "jessica"
  ) => void;
  busy: boolean;
}) {
  return (
    <section className="crm-ledger crm-bookkeeping-ledger">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Bookkeeping</p>
          <h2>805 Spreadsheet</h2>
        </div>
        <div className="crm-ledger-totals">
          <span>Total Sales {toCurrency(totals?.total)}</span>
          <span>Open Balance {toCurrency(totals?.balance)}</span>
          <span>Paid {toCurrency(totals?.paidTotal)}</span>
          <span>COGS {toCurrency(totals?.cogs)}</span>
          <span>Installation {toCurrency(totals?.installationAmount)}</span>
          <span>Expenses {toCurrency(totals?.expenses)}</span>
          <span>Ken Total Profit {toCurrency(totals?.kenCut)}</span>
          <span>Total Profit {toCurrency(totals?.grossProfit)}</span>
          <span>Profit Margin {totals ? `${totals.profitMargin.toFixed(1)}%` : "0.0%"}</span>
          <span>Net Profit {toCurrency(totals?.netProfit)}</span>
          <span>Mike 50% {toCurrency(totals?.mikeShare)}</span>
          <span>Jessica 50% {toCurrency(totals?.jessicaShare)}</span>
          <span>Jessica Paid {toCurrency(totals?.jessicaSharePaid)}</span>
          <span>Jessica Owed {toCurrency(totals?.jessicaShareOwed)}</span>
        </div>
      </div>
      {totals && totals.missingCogs > 0 ? (
        <p className="crm-alert">
          {totals.missingCogs} {totals.missingCogs === 1 ? "row" : "rows"} missing COGS.
        </p>
      ) : null}
      <div className="crm-bookkeeping-table-wrap">
        <table className="crm-bookkeeping-table">
          <thead>
            <tr>
              <th>Customer / Quote</th>
              <th>Sold Date</th>
              <th>Total</th>
              <th>Deposit Due</th>
              <th>Deposit Paid</th>
              <th>Balance Paid</th>
              <th>Paid Total</th>
              <th>Credit In</th>
              <th>Credit Out</th>
              <th>Payment Type</th>
              <th>COGS</th>
              <th>Balance</th>
              <th>Ken Cut</th>
              <th>Expenses</th>
              <th>Net Profit</th>
              <th>Mike 50%</th>
              <th>Jessica 50%</th>
              <th>Sales Owner</th>
              <th>Installation</th>
              <th>Jessica Owed</th>
              <th>Manufacturer</th>
              <th>Order Ref</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.source}-${row.id}`}>
                <td>
                  <strong>{row.customerName}</strong>
                  <span>{row.quoteNumber || row.source.replace("_", " ")}</span>
                </td>
                <td>{formatShortDate(row.soldDate)}</td>
                <td>{toCurrency(row.total)}</td>
                <td>{toCurrency(row.depositDue)}</td>
                <td>{toCurrency(row.depositPaid)}</td>
                <td>{toCurrency(row.balancePaid)}</td>
                <td>{toCurrency(row.paidTotal)}</td>
                <td>{toCurrency(row.creditIn)}</td>
                <td>{toCurrency(row.creditOut)}</td>
                <td>{formatPaymentType(row.paymentType)}</td>
                <td className={row.cogs <= 0 ? "crm-warning-cell" : ""}>{row.cogs <= 0 ? "Missing" : toCurrency(row.cogs)}</td>
                <td className={row.balance > 0 ? "crm-warning-cell" : "crm-complete-cell"}>{toCurrency(row.balance)}</td>
                <td>{toCurrency(row.kenCut)}</td>
                <td>{toCurrency(row.expensesTotal)}</td>
                <td className={row.isProfitFinal ? "crm-complete-cell" : ""}>
                  <strong>{toCurrency(row.netProfit)}</strong>
                  <span>{row.isProfitFinal ? "Final" : "Projected"}</span>
                </td>
                <td>{toCurrency(row.mikeShare)}</td>
                <td>{toCurrency(row.jessicaShare)}</td>
                <td className={row.salesOwner ? "" : "crm-warning-cell"}>
                  <strong>
                    {row.salesOwner === "mike" ? "Mike" : row.salesOwner === "jessica" ? "Jessica" : "Unassigned"}
                  </strong>
                  <span className="crm-assign-actions">
                    {row.salesOwner !== "jessica" ? (
                      <button
                        type="button"
                        className="crm-assign-button"
                        disabled={busy}
                        onClick={() => onAssignOwner(row, "jessica")}
                      >
                        Assign Jessica
                      </button>
                    ) : null}
                    {row.salesOwner !== "mike" ? (
                      <button
                        type="button"
                        className="crm-assign-button crm-assign-button-alt"
                        disabled={busy}
                        onClick={() => onAssignOwner(row, "mike")}
                      >
                        Assign Mike
                      </button>
                    ) : null}
                  </span>
                </td>
                <td>
                  <strong>{toCurrency(row.installationInvoiceAmount)}</strong>
                  <span>{row.isInstallationComplete ? "Complete" : row.installationMatchStatus}</span>
                </td>
                <td className={row.jessicaShareOwed > 0 ? "crm-warning-cell" : ""}>{toCurrency(row.jessicaShareOwed)}</td>
                <td>{row.manufacturerName || "Open"}</td>
                <td>{row.manufacturerOrderRef || "Needs order"}</td>
                <td>{row.status}</td>
                <td>{row.notes || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="crm-empty">No bookkeeping rows yet.</p> : null}
      </div>
    </section>
  );
}

function OrderBoard({
  trackers,
  quotes,
  onUpdate,
  busy
}: {
  trackers: CrmOrderTracker[];
  quotes: CrmQuote[];
  onUpdate: (event: FormEvent<HTMLFormElement>, quote: CrmQuote) => Promise<void>;
  busy: boolean;
}) {
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));

  return (
    <section className="crm-ledger crm-order-system">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Order Tracking</p>
          <h2>Sold Job Operating Board</h2>
        </div>
        <strong>{trackers.filter((tracker) => tracker.lane !== "complete").length}</strong>
      </div>
      <div className="crm-order-lanes">
        {orderLanes.map(({ lane, label }) => {
          const laneTrackers = trackers.filter((tracker) => tracker.lane === lane);
          return (
            <section className="crm-order-lane" key={lane}>
              <header>
                <h3>{label}</h3>
                <span>{laneTrackers.length}</span>
              </header>
              <div className="crm-order-lane-stack">
                {laneTrackers.map((tracker) => {
                  const quote = tracker.quoteId ? quoteById.get(tracker.quoteId) || null : null;
                  return (
                    <OrderTrackerCard
                      tracker={tracker}
                      quote={quote}
                      onUpdate={onUpdate}
                      busy={busy}
                      key={`${tracker.lane}-${tracker.id}`}
                    />
                  );
                })}
                {!laneTrackers.length ? <p className="crm-empty">No jobs in this lane.</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function OrderPulseCard({ tracker }: { tracker: CrmOrderTracker }) {
  return (
    <article className={`crm-order-pulse-card ${tracker.urgency}`}>
      <header>
        <div>
          <h3>{tracker.customerName}</h3>
          <p>{tracker.laneLabel}</p>
        </div>
        <strong>{toCurrency(tracker.balance > 0 ? tracker.balance : tracker.total)}</strong>
      </header>
      <p>{tracker.nextAction}</p>
      <footer>
        <span>{tracker.manufacturerName || "Vendor open"}</span>
        <em>{tracker.blockers.length ? tracker.blockers.join(" / ") : formatAge(tracker.ageDays)}</em>
      </footer>
    </article>
  );
}

function OrderTrackerCard({
  tracker,
  quote,
  onUpdate,
  busy
}: {
  tracker: CrmOrderTracker;
  quote: CrmQuote | null;
  onUpdate: (event: FormEvent<HTMLFormElement>, quote: CrmQuote) => Promise<void>;
  busy: boolean;
}) {
  return (
    <article className={`crm-order-card crm-order-card-${tracker.urgency}`}>
      <div className="crm-order-card-head">
        <div>
          <h3>{tracker.customerName}</h3>
          <span>{tracker.quoteNumber || tracker.quoteId?.slice(0, 8) || "Spreadsheet row"}</span>
        </div>
        <strong>{toCurrency(tracker.total)}</strong>
      </div>

      <dl className="crm-order-facts">
        <div>
          <dt>Age</dt>
          <dd>{formatAge(tracker.ageDays)}</dd>
        </div>
        <div>
          <dt>Balance</dt>
          <dd className={tracker.balance > 0 ? "warn" : ""}>{toCurrency(tracker.balance)}</dd>
        </div>
        <div>
          <dt>COGS</dt>
          <dd className={tracker.cogs <= 0 ? "warn" : ""}>{tracker.cogs > 0 ? toCurrency(tracker.cogs) : "Missing"}</dd>
        </div>
        <div>
          <dt>Profit</dt>
          <dd>{toCurrency(tracker.mikeProfit)}</dd>
        </div>
      </dl>

      <div className="crm-order-action">
        <strong>{tracker.nextAction}</strong>
        {tracker.blockers.length ? <span>{tracker.blockers.join(" / ")}</span> : <span>{tracker.laneLabel}</span>}
      </div>

      <div className="crm-order-links">
        {tracker.manufacturerOrderUrl ? (
          <a href={tracker.manufacturerOrderUrl} target="_blank" rel="noreferrer">
            Order
          </a>
        ) : null}
        {tracker.manufacturerDocumentUrl ? (
          <a href={tracker.manufacturerDocumentUrl} target="_blank" rel="noreferrer">
            Document
          </a>
        ) : null}
      </div>

      {quote ? (
        <form className="crm-order-form" onSubmit={(event) => onUpdate(event, quote)}>
          <input name="customer_name" type="hidden" defaultValue={tracker.customerName} />
          <div className="crm-field-row">
            <label>
              Status
              <select name="status" defaultValue={quote.status}>
                {crmQuoteStatuses.map((status) => (
                  <option value={status} key={status}>
                    {formatStatusLabel(status)}
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
              Manufacturer
              <input name="manufacturer_name" defaultValue={quote.manufacturer_name || tracker.manufacturerName || ""} />
            </label>
            <label>
              Order #
              <input name="manufacturer_order_ref" defaultValue={quote.manufacturer_order_ref || tracker.manufacturerOrderRef || ""} />
            </label>
          </div>
          <label>
            Order Link
            <input name="manufacturer_order_url" defaultValue={quote.manufacturer_order_url || tracker.manufacturerOrderUrl || ""} />
          </label>
          <label>
            Document Link
            <input name="manufacturer_document_url" defaultValue={quote.manufacturer_document_url || tracker.manufacturerDocumentUrl || ""} />
          </label>
          <div className="crm-field-row">
            <label>
              New Payment
              <input name="payment_amount" type="number" min="0" step="0.01" placeholder="0.00" />
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
              Payment Label
              <input name="payment_label" defaultValue="Balance payment" />
            </label>
            <label>
              Paid Date
              <input name="paid_at" type="date" defaultValue={todayInputValue()} />
            </label>
          </div>
          <label>
            Notes
            <textarea name="notes" rows={3} defaultValue={quote.notes || ""} />
          </label>
          <label>
            Payment Notes
            <input name="payment_notes" placeholder="Check #, Zelle note, card auth..." />
          </label>
          <button type="submit" disabled={busy}>
            Update Order
          </button>
        </form>
      ) : (
        <p className="crm-order-readonly">Imported spreadsheet row. Edit details from Bookkeeping.</p>
      )}
    </article>
  );
}

function SalesCalendarView({ events }: { events: CrmCalendarEvent[] }) {
  const [visibleMonth, setVisibleMonth] = useState(() => calendarMonthStart());
  const [assigneeFilter, setAssigneeFilter] = useState<CalendarAssigneeFilter>("all");
  const [selectedDate, setSelectedDate] = useState(() => toIsoDate(new Date()));

  const filteredEvents = useMemo(
    () =>
      assigneeFilter === "all"
        ? events
        : events.filter((event) => event.assigned_to === assigneeFilter),
    [assigneeFilter, events]
  );
  const groupedEvents = useMemo(
    () =>
      filteredEvents.reduce<Record<string, CrmCalendarEvent[]>>((acc, event) => {
        const key = losAngelesDateKey(event.start_at);
        if (!acc[key]) acc[key] = [];
        acc[key].push(event);
        return acc;
      }, {}),
    [filteredEvents]
  );
  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const monthEventCount = days.reduce((count, day) => count + (groupedEvents[day.dateKey]?.length || 0), 0);
  const selectedEvents = selectedDate ? groupedEvents[selectedDate] || [] : [];

  return (
    <section className="crm-ledger crm-calendar-ledger">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">805 Sales Calendar</p>
          <h2>{formatMonthTitle(visibleMonth)}</h2>
        </div>
        <div className="crm-calendar-controls">
          <button type="button" className="crm-ghost-button" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}>
            Previous
          </button>
          <button
            type="button"
            className="crm-ghost-button"
            onClick={() => {
              setVisibleMonth(calendarMonthStart());
              setSelectedDate(toIsoDate(new Date()));
            }}
          >
            Today
          </button>
          <button type="button" className="crm-ghost-button" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}>
            Next
          </button>
        </div>
      </div>

      <div className="crm-calendar-subhead">
        <div className="crm-calendar-filters">
          {calendarFilters.map((filter) => (
            <button
              type="button"
              key={filter.value}
              className={assigneeFilter === filter.value ? "active" : ""}
              onClick={() => setAssigneeFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <strong>{monthEventCount} appointments</strong>
      </div>

      <div className="crm-calendar-board" aria-label="805 sales calendar month">
        <div className="crm-calendar-weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="crm-calendar-grid">
          {days.map((day) => {
            const dayEvents = groupedEvents[day.dateKey] || [];
            return (
              <button
                type="button"
                key={day.dateKey}
                className={[
                  "crm-calendar-day",
                  day.currentMonth ? "" : "muted",
                  day.today ? "today" : "",
                  selectedDate === day.dateKey ? "selected" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSelectedDate(day.dateKey)}
                aria-label={`View appointments for ${day.dateKey}`}
              >
                <span className="crm-calendar-day-number">{day.day}</span>
                <span className="crm-calendar-day-events">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span className={`crm-calendar-pill ${event.assigned_to.toLowerCase()}`} key={event.id}>
                      <strong>{eventCustomerName(event)}</strong>
                      <em>{formatEventTime(event.start_at)}</em>
                    </span>
                  ))}
                  {dayEvents.length > 3 ? <span className="crm-calendar-more">+{dayEvents.length - 3} more</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="crm-calendar-detail" aria-live="polite">
        <div className="crm-section-head">
          <div>
            <p className="eyebrow">Day Detail</p>
            <h2>{formatLongDateKey(selectedDate)}</h2>
          </div>
          <strong>{selectedEvents.length}</strong>
        </div>
        <div className="crm-agenda">
          {selectedEvents.map((event) => (
            <article className="crm-event-card" key={event.id}>
              <time>{formatEventTimeRange(event)}</time>
              <div>
                <h3>{eventCustomerName(event)}</h3>
                <p>{[eventCustomerPhone(event), event.location].filter(Boolean).join(" / ") || "805 Shutters"}</p>
                {event.notes ? <p>{event.notes}</p> : null}
              </div>
              <span>
                {event.assigned_to}
                <em>{eventSourceLabel(event)}</em>
              </span>
            </article>
          ))}
          {!selectedEvents.length ? <p className="crm-empty">No appointments on this day.</p> : null}
        </div>
      </section>
    </section>
  );
}
