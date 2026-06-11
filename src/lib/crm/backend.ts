import { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAccountabilityQueue,
  buildBookkeepingRows,
  normalizePaymentType,
  sumBookkeepingRows
} from "@/lib/crm/bookkeeping";
import { buildCustomerFiles } from "@/lib/crm/customer-files";
import {
  buildOrderTrackers,
  buildSalesOpportunities,
  summarizeOrderSystem,
  summarizeSalesSystem
} from "@/lib/crm/sales-system";
import { dispatchCrmAppointmentAlerts } from "@/lib/crm/appointment-alerts";
import {
  dispatch805InvoiceNoteNotification,
  dispatch805SoldQuoteNotification
} from "@/lib/crm/bookkeeping-alerts";
import { syncCrmCalendarEventToGoogle } from "@/lib/crm/google-calendar";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  CrmBookkeepingCredit,
  CrmBookkeepingEntry,
  CrmBookkeepingPayment,
  CrmCalendarEvent,
  CrmCustomer,
  CrmCustomerContract,
  CrmCustomerProduct,
  CrmDashboardData,
  CrmJob,
  CrmJobExpense,
  CrmJobStatus,
  CrmQuote,
  CrmQuoteStatus,
  crmJobStatuses,
  crmQuoteStatuses
} from "@/lib/crm/types";

type CrmSupabaseClient = SupabaseClient;

type CrmActor = {
  email: string;
  userId?: string;
};

type CustomerSnapshot = {
  displayName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  latestStatus?: string | null;
  latestSoldDate?: string | null;
  source?: "crm" | "bookkeeping_import" | "manual";
  notes?: string | null;
  meta?: Record<string, unknown>;
};

const openStatuses = new Set(["new", "follow_up", "scheduled", "quoted", "sold", "ordered"]);
const jobStatusSet = new Set<string>(crmJobStatuses);
const quoteStatusSet = new Set<string>(crmQuoteStatuses);
const prioritySet = new Set(["low", "normal", "high", "urgent"]);
const calendarEventTypes = new Set(["sales_consult", "measure", "install", "follow_up", "block"]);
const calendarStatuses = new Set(["scheduled", "complete", "canceled", "rescheduled"]);

function isSoldQuoteStatus(status: unknown) {
  return status === "sold" || status === "approved";
}

const allowedJobPatchFields = new Set([
  "status",
  "priority",
  "customer_name",
  "phone",
  "email",
  "address",
  "city",
  "product_interest",
  "sales_owner",
  "next_action",
  "next_action_due",
  "appointment_start",
  "appointment_end",
  "estimated_total",
  "deposit_paid",
  "notes"
]);

const allowedQuotePatchFields = new Set([
  "status",
  "quote_number",
  "quote_total",
  "materials_cost",
  "labor_cost",
  "discount",
  "tax",
  "deposit_required",
  "balance_due",
  "sold_by",
  "sent_at",
  "approved_at",
  "sold_at",
  "ordered_at",
  "received_at",
  "installed_at",
  "archived_at",
  "manufacturer_name",
  "manufacturer_order_ref",
  "manufacturer_order_url",
  "manufacturer_document_url",
  "notes"
]);

const allowedEntryPatchFields = new Set([
  "customer_name",
  "sold_date",
  "total_amount",
  "payment_type",
  "cogs_amount",
  "ken_cut_override",
  "sales_owner",
  "installation_invoice_document_id",
  "installation_invoice_amount",
  "installation_invoice_number",
  "installation_invoice_url",
  "installation_match_status",
  "installation_matched_at",
  "jessica_commission_paid_at",
  "manufacturer_name",
  "manufacturer_order_ref",
  "manufacturer_order_url",
  "manufacturer_document_url",
  "notes",
  "imported_sheet_row"
]);

export function toMoney(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
}

// Nullable money: empty/absent means "no override", a number (including 0) is
// an explicit amount.
function toMoneyOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(amount, 0) : null;
}

function optionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function requiredText(value: unknown, message: string) {
  const trimmed = optionalText(value);
  if (!trimmed) throw new CrmAuthError(400, message);
  return trimmed;
}

function normalizeEnum<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
  message: string
): T {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim();
  if (!allowed.has(normalized)) throw new CrmAuthError(400, message);
  return normalized as T;
}

function normalizeOwner(value: unknown) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("jessica")) return "jessica";
  if (lower.includes("mike")) return "mike";
  return null;
}

function normalizeCustomerKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metadataWithActor(payload: unknown, actor: CrmActor, action: string) {
  const source = typeof payload === "object" && payload && "meta" in payload ? (payload as { meta?: unknown }).meta : null;

  return {
    ...(typeof source === "object" && source ? source : {}),
    [action]: actor.email,
    [`${action}At`]: new Date().toISOString()
  };
}

function getJobStatusForQuote(status: string) {
  if (status === "ordered" || status === "received") return "ordered";
  if (status === "installed" || status === "invoiced" || status === "paid") return "installed";
  if (status === "sold" || status === "approved") return "sold";
  return "quoted";
}

export async function recordCrmActivity(
  supabase: CrmSupabaseClient,
  actor: CrmActor,
  event: {
    entityType:
      | "job"
      | "quote"
      | "bookkeeping_entry"
      | "bookkeeping_payment"
      | "expense"
      | "calendar_event"
      | "customer"
      | "session"
      | "system";
    entityId?: string | null;
    action: string;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("crm_activity_events").insert({
    actor_auth_user_id: actor.userId || null,
    actor_email: actor.email,
    entity_type: event.entityType,
    entity_id: event.entityId || null,
    action: event.action,
    before_data: event.before ?? null,
    after_data: event.after ?? null,
    metadata: event.metadata || {}
  });

  if (error && !error.message.includes("crm_activity_events")) {
    console.warn("CRM activity event could not be recorded.", error.message);
  }
}

export async function upsertCrmCustomer(supabase: CrmSupabaseClient, snapshot: CustomerSnapshot) {
  const displayName = requiredText(snapshot.displayName, "Customer name is required.");
  const normalizedName = normalizeCustomerKey(displayName);

  const { data: existing } = await supabase
    .from("crm_customers")
    .select("*")
    .eq("normalized_name", normalizedName)
    .maybeSingle();

  const record = {
    source: existing?.source || snapshot.source || "crm",
    display_name: existing?.display_name || displayName,
    normalized_name: normalizedName,
    phone: snapshot.phone || existing?.phone || null,
    email: snapshot.email || existing?.email || null,
    address: snapshot.address || existing?.address || null,
    city: snapshot.city || existing?.city || null,
    first_sold_date: existing?.first_sold_date || snapshot.latestSoldDate || null,
    latest_sold_date: snapshot.latestSoldDate || existing?.latest_sold_date || null,
    latest_status: snapshot.latestStatus || existing?.latest_status || null,
    lifetime_value: existing?.lifetime_value || 0,
    open_balance: existing?.open_balance || 0,
    notes: snapshot.notes || existing?.notes || null,
    meta: {
      ...(existing?.meta || {}),
      ...(snapshot.meta || {})
    }
  };

  const query = existing
    ? supabase.from("crm_customers").update(record).eq("id", existing.id)
    : supabase.from("crm_customers").insert(record);

  const { data, error } = await query.select("*").single();

  if (error) {
    console.warn("CRM customer snapshot could not be saved.", error.message);
    return null;
  }

  return data as CrmCustomer;
}

async function syncCustomerFromJob(supabase: CrmSupabaseClient, job: Record<string, unknown>) {
  return upsertCrmCustomer(supabase, {
    displayName: String(job.customer_name || ""),
    phone: typeof job.phone === "string" ? job.phone : null,
    email: typeof job.email === "string" ? job.email : null,
    address: typeof job.address === "string" ? job.address : null,
    city: typeof job.city === "string" ? job.city : null,
    latestStatus: typeof job.status === "string" ? job.status : null,
    source: "crm",
    notes: typeof job.notes === "string" ? job.notes : null,
    meta: {
      lastJobId: job.id
    }
  });
}

async function syncCustomerFromBookkeepingEntry(
  supabase: CrmSupabaseClient,
  entry: Record<string, unknown>
) {
  return upsertCrmCustomer(supabase, {
    displayName: String(entry.customer_name || ""),
    latestStatus: typeof entry.source === "string" ? entry.source : "manual",
    latestSoldDate: typeof entry.sold_date === "string" ? entry.sold_date : null,
    source: entry.source === "legacy_sheet" ? "bookkeeping_import" : "manual",
    notes: typeof entry.notes === "string" ? entry.notes : null,
    meta: {
      lastBookkeepingEntryId: entry.id
    }
  });
}

export function buildDashboardData({
  jobs,
  quotes,
  events,
  customers,
  products,
  contracts,
  entries,
  payments,
  credits,
  expenses = []
}: {
  jobs: CrmJob[];
  quotes: CrmQuote[];
  events: CrmCalendarEvent[];
  customers: CrmCustomer[];
  products: CrmCustomerProduct[];
  contracts: CrmCustomerContract[];
  entries: CrmBookkeepingEntry[];
  payments: CrmBookkeepingPayment[];
  credits: CrmBookkeepingCredit[];
  expenses?: CrmJobExpense[];
}): CrmDashboardData {
  const quotesByJob = new Map<string, number>();
  for (const quote of quotes) {
    quotesByJob.set(quote.job_id, Math.max(quotesByJob.get(quote.job_id) || 0, toMoney(quote.quote_total)));
  }

  const bookkeepingRows = buildBookkeepingRows({ quotes, entries, payments, credits, expenses });
  const bookkeepingTotals = sumBookkeepingRows(bookkeepingRows);
  const accountability = buildAccountabilityQueue(bookkeepingRows);
  const customerFiles = buildCustomerFiles({
    customers,
    products,
    contracts,
    jobs,
    quotes,
    bookkeepingRows
  });
  const jobsWithQuotes = jobs.map((job) => ({
    ...job,
    quote_total: quotesByJob.get(job.id) || toMoney(job.estimated_total)
  }));
  const salesOpportunities = buildSalesOpportunities(jobsWithQuotes);
  const orderTrackers = buildOrderTrackers({
    rows: bookkeepingRows,
    jobs: jobsWithQuotes,
    quotes
  });

  return {
    jobs: jobsWithQuotes,
    quotes,
    events,
    customers,
    customerProducts: products,
    customerContracts: contracts,
    customerFiles,
    bookkeepingEntries: entries,
    bookkeepingPayments: payments,
    bookkeepingCredits: credits,
    bookkeepingExpenses: expenses,
    bookkeepingRows,
    bookkeepingTotals,
    accountability,
    salesOpportunities,
    salesSystemSummary: summarizeSalesSystem(salesOpportunities),
    orderTrackers,
    orderSystemSummary: summarizeOrderSystem(orderTrackers),
    summary: {
      openJobs: jobsWithQuotes.filter((job) => openStatuses.has(job.status)).length,
      scheduledJobs: jobsWithQuotes.filter((job) => job.status === "scheduled").length,
      quotedJobs: jobsWithQuotes.filter((job) => job.status === "quoted").length,
      soldJobs: jobsWithQuotes.filter((job) => job.status === "sold" || job.status === "ordered").length,
      quotePipeline: jobsWithQuotes.reduce((total, job) => total + toMoney(job.quote_total), 0),
      depositCollected: jobsWithQuotes.reduce((total, job) => total + toMoney(job.deposit_paid), 0),
      openBalance: bookkeepingTotals.balance,
      needsOrder: accountability.filter((item) => item.type === "needs_order").length,
      missingCogs: bookkeepingTotals.missingCogs,
      readyToInstall: accountability.filter((item) => item.type === "ready_to_install").length,
      customerFiles: customerFiles.length,
      contracts: customerFiles.reduce((total, file) => total + file.contracts.length, 0)
    }
  };
}

export async function loadCrmDashboardData(supabase: CrmSupabaseClient) {
  const [
    jobsResult,
    quotesResult,
    eventsResult,
    customersResult,
    productsResult,
    contractsResult,
    entriesResult,
    paymentsResult,
    creditsResult,
    expensesResult
  ] = await Promise.all([
    supabase.from("crm_jobs").select("*").order("created_at", { ascending: false }).limit(120),
    supabase.from("crm_quotes").select("*").order("created_at", { ascending: false }).limit(120),
    supabase
      .from("crm_calendar_events")
      .select("*")
      .gte("start_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString())
      .order("start_at", { ascending: true })
      .limit(600),
    supabase.from("crm_customers").select("*").order("latest_sold_date", { ascending: false }).limit(800),
    supabase.from("crm_customer_products").select("*").order("created_at", { ascending: false }).limit(1600),
    supabase.from("crm_customer_contracts").select("*").order("created_at", { ascending: false }).limit(1000),
    supabase
      .from("crm_quote_bookkeeping_entries")
      .select("*")
      .order("sold_date", { ascending: false, nullsFirst: false })
      .limit(500),
    supabase.from("crm_quote_bookkeeping_payments").select("*").order("paid_at", { ascending: false }).limit(800),
    supabase.from("crm_quote_bookkeeping_credits").select("*").order("credit_date", { ascending: false }).limit(500),
    supabase.from("crm_job_expenses").select("*").order("incurred_on", { ascending: false }).limit(1000)
  ]);

  if (
    jobsResult.error ||
    quotesResult.error ||
    eventsResult.error ||
    customersResult.error ||
    productsResult.error ||
    contractsResult.error ||
    entriesResult.error ||
    paymentsResult.error ||
    creditsResult.error ||
    expensesResult.error
  ) {
    throw new CrmAuthError(502, "CRM data failed to load. Run the 805 CRM Supabase migrations.");
  }

  const jobs = (jobsResult.data || []) as CrmJob[];
  const quotes = (quotesResult.data || []) as CrmQuote[];
  const events = (eventsResult.data || []) as CrmCalendarEvent[];
  const customers = (customersResult.data || []) as CrmCustomer[];
  const products = (productsResult.data || []) as CrmCustomerProduct[];
  const contracts = (contractsResult.data || []) as CrmCustomerContract[];
  const entries = (entriesResult.data || []) as CrmBookkeepingEntry[];
  const payments = (paymentsResult.data || []) as CrmBookkeepingPayment[];
  const credits = (creditsResult.data || []) as CrmBookkeepingCredit[];
  const expenses = (expensesResult.data || []) as CrmJobExpense[];
  const jobNames = new Map(jobs.map((job) => [job.id, job.customer_name]));

  return buildDashboardData({
    jobs,
    quotes: quotes.map((quote) => ({ ...quote, customer_name: jobNames.get(quote.job_id) })),
    events: events.map((event) => ({
      ...event,
      customer_name: event.job_id ? jobNames.get(event.job_id) : undefined
    })),
    customers,
    products,
    contracts,
    entries,
    payments,
    credits,
    expenses
  });
}

export async function createCrmJob(supabase: CrmSupabaseClient, payload: Record<string, unknown>, actor: CrmActor) {
  const record = {
    source: "crm",
    status: normalizeEnum<CrmJobStatus>(payload.status, jobStatusSet, "new", "Invalid CRM job status."),
    priority: normalizeEnum(payload.priority, prioritySet, "normal", "Invalid CRM job priority."),
    customer_name: requiredText(payload.customer_name, "Customer name and phone are required."),
    phone: requiredText(payload.phone, "Customer name and phone are required."),
    email: optionalText(payload.email),
    address: optionalText(payload.address),
    city: optionalText(payload.city),
    product_interest: optionalText(payload.product_interest) || "shutters",
    sales_owner: optionalText(payload.sales_owner) || "Unassigned",
    next_action: optionalText(payload.next_action) || "Call customer",
    next_action_due: payload.next_action_due || null,
    estimated_total: toMoney(payload.estimated_total),
    notes: optionalText(payload.notes),
    meta: metadataWithActor(payload, actor, "createdBy")
  };

  const { data, error } = await supabase.from("crm_jobs").insert(record).select("*").single();
  if (error || !data) throw new CrmAuthError(502, "CRM job could not be created.");

  await syncCustomerFromJob(supabase, data);
  await recordCrmActivity(supabase, actor, {
    entityType: "job",
    entityId: data.id,
    action: "create",
    after: data
  });

  return data as CrmJob;
}

export async function updateCrmJob(
  supabase: CrmSupabaseClient,
  id: string,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const { data: existing, error: existingError } = await supabase.from("crm_jobs").select("*").eq("id", id).maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "CRM job was not found.");

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!allowedJobPatchFields.has(key)) continue;
    if (key === "status") {
      patch.status = normalizeEnum<CrmJobStatus>(value, jobStatusSet, existing.status, "Invalid CRM job status.");
    } else if (key === "priority") {
      patch.priority = normalizeEnum(value, prioritySet, existing.priority, "Invalid CRM job priority.");
    } else if (["estimated_total", "deposit_paid"].includes(key)) {
      patch[key] = toMoney(value);
    } else {
      patch[key] = value === "" ? null : value;
    }
  }

  if (!Object.keys(patch).length) {
    throw new CrmAuthError(400, "No supported CRM job fields provided.");
  }

  patch.meta = {
    ...(existing.meta || {}),
    ...(typeof payload.meta === "object" && payload.meta ? payload.meta : {}),
    lastUpdatedBy: actor.email,
    lastUpdatedAt: new Date().toISOString()
  };

  const { data, error } = await supabase.from("crm_jobs").update(patch).eq("id", id).select("*").single();
  if (error || !data) throw new CrmAuthError(502, "CRM job could not be updated.");

  await syncCustomerFromJob(supabase, data);
  await recordCrmActivity(supabase, actor, {
    entityType: "job",
    entityId: id,
    action: "update",
    before: existing,
    after: data
  });

  return data as CrmJob;
}

async function assertCalendarWindowAvailable(
  supabase: CrmSupabaseClient,
  assignedTo: string,
  startAt: string,
  endAt: string
) {
  if (assignedTo === "Unassigned") return;

  const { data, error } = await supabase
    .from("crm_calendar_events")
    .select("id,title,start_at,end_at")
    .eq("assigned_to", assignedTo)
    .in("status", ["scheduled", "rescheduled"])
    .lt("start_at", endAt)
    .gt("end_at", startAt)
    .limit(1);

  if (error) throw new CrmAuthError(502, "Calendar availability could not be checked.");
  if (data?.length) throw new CrmAuthError(409, "That CRM calendar window is already booked.");
}

export async function createCrmCalendarEvent(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const title = requiredText(payload.title, "Title, start, and end are required.");
  const startAt = requiredText(payload.start_at, "Title, start, and end are required.");
  const endAt = requiredText(payload.end_at, "Title, start, and end are required.");
  const startDate = new Date(startAt);
  const endDate = new Date(endAt);

  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
    throw new CrmAuthError(400, "Calendar event end time must be after its start time.");
  }

  const assignedTo = optionalText(payload.assigned_to) || "Unassigned";
  await assertCalendarWindowAvailable(supabase, assignedTo, startAt, endAt);

  const record = {
    job_id: payload.job_id || null,
    title,
    event_type: normalizeEnum(payload.event_type, calendarEventTypes, "sales_consult", "Invalid calendar event type."),
    status: normalizeEnum(payload.status, calendarStatuses, "scheduled", "Invalid calendar event status."),
    assigned_to: assignedTo,
    start_at: startAt,
    end_at: endAt,
    location: optionalText(payload.location),
    notes: optionalText(payload.notes),
    meta: metadataWithActor(payload, actor, "createdBy")
  };

  const { data, error } = await supabase.from("crm_calendar_events").insert(record).select("*").single();
  if (error || !data) throw new CrmAuthError(502, "Calendar event could not be saved.");
  let calendarEvent = data as CrmCalendarEvent;

  if (payload.job_id) {
    const { data: job } = await supabase
      .from("crm_jobs")
      .update({
        status: "scheduled",
        appointment_start: startAt,
        appointment_end: endAt
      })
      .eq("id", payload.job_id)
      .select("*")
      .maybeSingle();

    if (job) await syncCustomerFromJob(supabase, job);
  }

  await recordCrmActivity(supabase, actor, {
    entityType: "calendar_event",
    entityId: calendarEvent.id,
    action: "create",
    after: calendarEvent,
    metadata: {
      jobId: payload.job_id || null
    }
  });

  const googleSync = await syncCrmCalendarEventToGoogle(supabase, calendarEvent);
  calendarEvent = googleSync.event;

  if (googleSync.configured) {
    await recordCrmActivity(supabase, actor, {
      entityType: "calendar_event",
      entityId: calendarEvent.id,
      action: "google_calendar_sync",
      metadata: {
        jobId: payload.job_id || null,
        synced: googleSync.synced,
        skippedReason: googleSync.skippedReason || null,
        googleEventId: googleSync.googleEventId || null,
        error: googleSync.error || null
      }
    });
  }

  if (payload.suppress_alerts !== true) {
    const alertResult = await dispatchCrmAppointmentAlerts(calendarEvent);
    await recordCrmActivity(supabase, actor, {
      entityType: "calendar_event",
      entityId: calendarEvent.id,
      action: "appointment_alert",
      metadata: {
        jobId: payload.job_id || null,
        ...alertResult
      }
    });
  }

  return calendarEvent;
}

export async function createCrmQuote(supabase: CrmSupabaseClient, payload: Record<string, unknown>, actor: CrmActor) {
  const jobId = requiredText(payload.job_id, "Job is required for a quote.");
  const status = normalizeEnum<CrmQuoteStatus>(payload.status, quoteStatusSet, "draft", "Invalid quote status.");
  const quoteTotal = toMoney(payload.quote_total);
  const depositPaid = toMoney(payload.deposit_paid ?? payload.deposit_required);
  const balancePaid = toMoney(payload.balance_paid);
  const paymentType = normalizePaymentType(optionalText(payload.payment_type)) || "other";
  const now = new Date().toISOString();

  const { data: parentJob, error: parentJobError } = await supabase
    .from("crm_jobs")
    .select("id,customer_name,sales_owner")
    .eq("id", jobId)
    .maybeSingle();
  if (parentJobError || !parentJob) throw new CrmAuthError(404, "Job for this quote was not found.");

  // Every sold job needs a salesperson: fall back to the job's assigned owner
  // when the quote form leaves "Sold By" empty or Unassigned.
  const soldByInput = optionalText(payload.sold_by);
  const soldBy =
    soldByInput && normalizeOwner(soldByInput)
      ? soldByInput
      : normalizeOwner(parentJob.sales_owner)
        ? parentJob.sales_owner
        : soldByInput;

  const record = {
    job_id: jobId,
    quote_number: optionalText(payload.quote_number),
    status,
    quote_total: quoteTotal,
    materials_cost: toMoney(payload.materials_cost),
    labor_cost: toMoney(payload.labor_cost),
    discount: toMoney(payload.discount),
    tax: toMoney(payload.tax),
    deposit_required: depositPaid,
    balance_due: Math.max(quoteTotal - depositPaid - balancePaid, 0),
    sold_by: soldBy,
    sold_at: status === "sold" || status === "approved" ? payload.sold_at || now : null,
    approved_at: status === "approved" ? payload.approved_at || now : null,
    ordered_at: status === "ordered" ? payload.ordered_at || now : null,
    received_at: status === "received" ? payload.received_at || now : null,
    installed_at: status === "installed" ? payload.installed_at || now : null,
    manufacturer_name: optionalText(payload.manufacturer_name),
    manufacturer_order_ref: optionalText(payload.manufacturer_order_ref),
    manufacturer_order_url: optionalText(payload.manufacturer_order_url),
    manufacturer_document_url: optionalText(payload.manufacturer_document_url),
    notes: optionalText(payload.notes),
    meta: metadataWithActor(payload, actor, "createdBy")
  };

  const { data, error } = await supabase.from("crm_quotes").insert(record).select("*").single();
  if (error || !data) throw new CrmAuthError(502, "Quote could not be saved.");

  const paymentRows = [
    { label: "Deposit", amount: depositPaid },
    { label: "Balance payment", amount: balancePaid }
  ].filter((payment) => payment.amount > 0);

  if (paymentRows.length) {
    const { error: paymentError } = await supabase.from("crm_quote_bookkeeping_payments").insert(
      paymentRows.map((payment) => ({
        quote_id: data.id,
        job_id: jobId,
        payment_label: payment.label,
        payment_type: paymentType,
        amount: payment.amount,
        paid_at: payload.paid_at || new Date().toISOString().slice(0, 10),
        source: "crm_quote",
        meta: { createdBy: actor.email }
      }))
    );

    if (paymentError) throw new CrmAuthError(502, "Quote was saved, but payments failed to save.");
  }

  const entrySalesOwner = normalizeOwner(soldBy);
  const { error: entryError } = await supabase.from("crm_quote_bookkeeping_entries").insert({
    quote_id: data.id,
    job_id: jobId,
    source: "crm_quote",
    customer_name: optionalText(payload.customer_name) || parentJob.customer_name || "Linked job",
    sold_date: payload.sold_at || (status === "draft" || status === "sent" ? null : now.slice(0, 10)),
    total_amount: quoteTotal,
    payment_type: paymentType,
    cogs_amount: toMoney(payload.materials_cost),
    ken_cut_override: toMoneyOrNull(payload.ken_cut_override),
    sales_owner: entrySalesOwner,
    sales_owner_set_at: entrySalesOwner ? now : null,
    manufacturer_name: optionalText(payload.manufacturer_name),
    manufacturer_order_ref: optionalText(payload.manufacturer_order_ref),
    manufacturer_order_url: optionalText(payload.manufacturer_order_url),
    manufacturer_document_url: optionalText(payload.manufacturer_document_url),
    notes: optionalText(payload.notes),
    meta: { createdBy: actor.email }
  });

  if (entryError) throw new CrmAuthError(502, "Quote was saved, but bookkeeping failed to save.");

  const jobPatch: Record<string, unknown> = {
    status: getJobStatusForQuote(status),
    estimated_total: quoteTotal,
    deposit_paid: depositPaid
  };
  // Keep the job's salesperson in sync with who sold the quote.
  if (entrySalesOwner) {
    jobPatch.sales_owner = entrySalesOwner === "jessica" ? "Jessica" : "Mike";
  }

  const { data: job } = await supabase
    .from("crm_jobs")
    .update(jobPatch)
    .eq("id", jobId)
    .select("*")
    .maybeSingle();

  if (job) await syncCustomerFromJob(supabase, job);

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: data.id,
    action: "create",
    after: data,
    metadata: {
      jobId
    }
  });

  if (isSoldQuoteStatus(data.status)) {
    const alertResult = await dispatch805SoldQuoteNotification(supabase, data as CrmQuote, {
      customerName: optionalText(payload.customer_name),
      contractUrl: optionalText(payload.contract_url)
    });
    await recordCrmActivity(supabase, actor, {
      entityType: "quote",
      entityId: data.id,
      action: "sold_quote_alert",
      metadata: alertResult
    });
  }

  return data as CrmQuote;
}

export async function updateCrmQuote(
  supabase: CrmSupabaseClient,
  id: string,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const { data: existing, error: existingError } = await supabase
    .from("crm_quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Quote was not found.");

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (!allowedQuotePatchFields.has(key)) continue;
    if (key === "status") {
      patch.status = normalizeEnum<CrmQuoteStatus>(value, quoteStatusSet, existing.status, "Invalid quote status.");
    } else if (["quote_total", "materials_cost", "labor_cost", "discount", "tax", "deposit_required", "balance_due"].includes(key)) {
      patch[key] = toMoney(value);
    } else {
      patch[key] = value === "" ? null : value;
    }
  }

  if (typeof payload.status === "string") {
    if ((payload.status === "sold" || payload.status === "approved") && !patch.sold_at) patch.sold_at = now;
    if (payload.status === "approved" && !patch.approved_at) patch.approved_at = now;
    if (payload.status === "ordered" && !patch.ordered_at) patch.ordered_at = now;
    if (payload.status === "received" && !patch.received_at) patch.received_at = now;
    if (payload.status === "installed" && !patch.installed_at) patch.installed_at = now;
    if (payload.status === "archived" && !patch.archived_at) patch.archived_at = now;
  }

  if (!Object.keys(patch).length) {
    throw new CrmAuthError(400, "No supported quote fields provided.");
  }

  patch.meta = {
    ...(existing.meta || {}),
    ...(typeof payload.meta === "object" && payload.meta ? payload.meta : {}),
    lastUpdatedBy: actor.email,
    lastUpdatedAt: now
  };

  const { data: quote, error } = await supabase.from("crm_quotes").update(patch).eq("id", id).select("*").single();
  if (error || !quote) throw new CrmAuthError(502, "Quote could not be updated.");

  const paymentType = normalizePaymentType(optionalText(payload.payment_type)) || "other";
  const paymentAmount = toMoney(payload.payment_amount);
  if (paymentAmount > 0) {
    const { error: paymentError } = await supabase.from("crm_quote_bookkeeping_payments").insert({
      quote_id: id,
      job_id: quote.job_id,
      payment_label: optionalText(payload.payment_label) || "Balance payment",
      payment_type: paymentType,
      amount: paymentAmount,
      paid_at: payload.paid_at || new Date().toISOString().slice(0, 10),
      source: "crm_quote",
      notes: optionalText(payload.payment_notes),
      meta: { createdBy: actor.email }
    });

    if (paymentError) throw new CrmAuthError(502, "Quote was updated, but payment failed to save.");
  }

  // Merge into the linked bookkeeping entry without stomping values that
  // bookkeeping owns: only overwrite a field when this update touched it or
  // the entry has nothing yet. The quote always owns the sale price.
  const { data: existingEntry } = await supabase
    .from("crm_quote_bookkeeping_entries")
    .select("*")
    .eq("quote_id", id)
    .maybeSingle();

  const touched = (key: string) => key in payload;
  const nextSalesOwner = touched("sold_by")
    ? normalizeOwner(quote.sold_by)
    : (existingEntry?.sales_owner as string | null) ?? normalizeOwner(quote.sold_by);
  const salesOwnerChanged = nextSalesOwner !== (existingEntry?.sales_owner ?? null);

  const { error: entryError } = await supabase.from("crm_quote_bookkeeping_entries").upsert(
    {
      quote_id: id,
      job_id: quote.job_id,
      source: "crm_quote",
      customer_name:
        optionalText(payload.customer_name) || existingEntry?.customer_name || "Linked job",
      sold_date: quote.sold_at ? String(quote.sold_at).slice(0, 10) : existingEntry?.sold_date || null,
      total_amount: toMoney(quote.quote_total),
      payment_type: optionalText(payload.payment_type)
        ? paymentType
        : (existingEntry?.payment_type ?? null),
      cogs_amount: touched("materials_cost")
        ? toMoney(quote.materials_cost)
        : (existingEntry?.cogs_amount ?? toMoney(quote.materials_cost)),
      sales_owner: nextSalesOwner,
      sales_owner_set_at: salesOwnerChanged ? now : (existingEntry?.sales_owner_set_at ?? null),
      manufacturer_name: quote.manufacturer_name || existingEntry?.manufacturer_name || null,
      manufacturer_order_ref: quote.manufacturer_order_ref || existingEntry?.manufacturer_order_ref || null,
      manufacturer_order_url: quote.manufacturer_order_url || existingEntry?.manufacturer_order_url || null,
      manufacturer_document_url:
        quote.manufacturer_document_url || existingEntry?.manufacturer_document_url || null,
      notes: quote.notes || existingEntry?.notes || null,
      meta: { lastUpdatedBy: actor.email }
    },
    { onConflict: "quote_id" }
  );

  if (entryError) throw new CrmAuthError(502, "Quote was updated, but bookkeeping failed to update.");

  const jobPatch: Record<string, unknown> = {
    status: getJobStatusForQuote(String(quote.status || payload.status)),
    estimated_total: toMoney(quote.quote_total),
    deposit_paid: toMoney(quote.deposit_required)
  };
  if (touched("sold_by") && nextSalesOwner) {
    jobPatch.sales_owner = nextSalesOwner === "jessica" ? "Jessica" : "Mike";
  }

  const { data: job } = await supabase
    .from("crm_jobs")
    .update(jobPatch)
    .eq("id", quote.job_id)
    .select("*")
    .maybeSingle();

  if (job) await syncCustomerFromJob(supabase, job);

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: id,
    action: "update",
    before: existing,
    after: quote
  });

  if (!isSoldQuoteStatus(existing.status) && isSoldQuoteStatus(quote.status)) {
    const alertResult = await dispatch805SoldQuoteNotification(supabase, quote as CrmQuote, {
      customerName: optionalText(payload.customer_name),
      contractUrl: optionalText(payload.contract_url)
    });
    await recordCrmActivity(supabase, actor, {
      entityType: "quote",
      entityId: id,
      action: "sold_quote_alert",
      metadata: alertResult
    });
  }

  if (Object.prototype.hasOwnProperty.call(payload, "notes")) {
    const alertResult = await dispatch805InvoiceNoteNotification({
      customerName: optionalText(payload.customer_name) || quote.customer_name || "Linked job",
      note: quote.notes,
      previousNote: existing.notes
    });
    await recordCrmActivity(supabase, actor, {
      entityType: "quote",
      entityId: id,
      action: "invoice_note_alert",
      metadata: alertResult
    });
  }

  return quote as CrmQuote;
}

export async function createCrmBookkeepingEntry(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const paymentType = normalizePaymentType(optionalText(payload.payment_type)) || "other";
  const source = payload.source === "legacy_sheet" ? "legacy_sheet" : "manual";
  const depositAmount = toMoney(payload.deposit_paid);
  const balanceAmount = toMoney(payload.balance_paid);
  const now = new Date().toISOString();

  const { data: entry, error } = await supabase
    .from("crm_quote_bookkeeping_entries")
    .insert({
      source,
      customer_name: requiredText(payload.customer_name, "Customer name is required for a bookkeeping row."),
      sold_date: payload.sold_date || null,
      total_amount: toMoney(payload.total_amount),
      payment_type: paymentType,
      cogs_amount: toMoney(payload.cogs_amount),
      ken_cut_override: toMoneyOrNull(payload.ken_cut_override),
      sales_owner: normalizeOwner(payload.sales_owner),
      sales_owner_auth_user_id: normalizeOwner(payload.sales_owner) ? actor.userId || null : null,
      sales_owner_set_at: normalizeOwner(payload.sales_owner) ? now : null,
      installation_invoice_amount: toMoney(payload.installation_invoice_amount),
      installation_invoice_number: optionalText(payload.installation_invoice_number),
      installation_invoice_url: optionalText(payload.installation_invoice_url),
      installation_match_status: payload.installation_complete ? "matched" : "unmatched",
      installation_matched_at: payload.installation_complete ? now : null,
      jessica_commission_paid_at: payload.jessica_commission_paid ? now : null,
      manufacturer_name: optionalText(payload.manufacturer_name),
      manufacturer_order_ref: optionalText(payload.manufacturer_order_ref),
      manufacturer_order_url: optionalText(payload.manufacturer_order_url),
      manufacturer_document_url: optionalText(payload.manufacturer_document_url),
      notes: optionalText(payload.notes),
      imported_sheet_row: payload.imported_sheet_row ? Number(payload.imported_sheet_row) : null,
      meta: { createdBy: actor.email }
    })
    .select("*")
    .single();

  if (error || !entry) throw new CrmAuthError(502, "Bookkeeping row could not be created.");

  const paymentRows = [
    { label: "Deposit", amount: depositAmount },
    { label: "Balance payment", amount: balanceAmount }
  ].filter((payment) => payment.amount > 0);

  if (paymentRows.length) {
    const { error: paymentError } = await supabase.from("crm_quote_bookkeeping_payments").insert(
      paymentRows.map((payment) => ({
        bookkeeping_entry_id: entry.id,
        payment_label: payment.label,
        payment_type: paymentType,
        amount: payment.amount,
        paid_at: payload.paid_at || payload.sold_date || new Date().toISOString().slice(0, 10),
        source,
        notes: optionalText(payload.payment_notes),
        meta: { createdBy: actor.email }
      }))
    );

    if (paymentError) throw new CrmAuthError(502, "Bookkeeping row was created, but payments failed to save.");
  }

  await syncCustomerFromBookkeepingEntry(supabase, entry);
  await recordCrmActivity(supabase, actor, {
    entityType: "bookkeeping_entry",
    entityId: entry.id,
    action: "create",
    after: entry
  });

  const noteAlertResult = await dispatch805InvoiceNoteNotification({
    customerName: entry.customer_name,
    note: entry.notes,
    previousNote: null
  });
  if (!noteAlertResult.skipped || noteAlertResult.reason !== "Note is blank.") {
    await recordCrmActivity(supabase, actor, {
      entityType: "bookkeeping_entry",
      entityId: entry.id,
      action: "invoice_note_alert",
      metadata: noteAlertResult
    });
  }

  return entry as CrmBookkeepingEntry;
}

export async function updateCrmBookkeepingEntry(
  supabase: CrmSupabaseClient,
  id: string,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const { data: existing, error: existingError } = await supabase
    .from("crm_quote_bookkeeping_entries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Bookkeeping row was not found.");

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (!allowedEntryPatchFields.has(key)) continue;
    if (key === "payment_type") {
      patch.payment_type = normalizePaymentType(optionalText(value));
    } else if (key === "sales_owner") {
      patch.sales_owner = normalizeOwner(value);
      patch.sales_owner_set_at = now;
    } else if (key === "ken_cut_override") {
      patch.ken_cut_override = toMoneyOrNull(value);
    } else if (["total_amount", "cogs_amount", "installation_invoice_amount"].includes(key)) {
      patch[key] = toMoney(value);
    } else {
      patch[key] = value === "" ? null : value;
    }
  }

  if (typeof payload.installation_complete === "boolean") {
    patch.installation_match_status = payload.installation_complete ? "matched" : "unmatched";
    patch.installation_matched_at = payload.installation_complete ? now : null;
  }

  if (typeof payload.jessica_commission_paid === "boolean") {
    patch.jessica_commission_paid_at = payload.jessica_commission_paid ? now : null;
  }

  if (!Object.keys(patch).length && !toMoney(payload.payment_amount)) {
    throw new CrmAuthError(400, "No supported bookkeeping fields provided.");
  }

  let entry = existing;
  if (Object.keys(patch).length) {
    patch.meta = {
      ...(existing.meta || {}),
      ...(typeof payload.meta === "object" && payload.meta ? payload.meta : {}),
      lastUpdatedBy: actor.email,
      lastUpdatedAt: now
    };

    const result = await supabase
      .from("crm_quote_bookkeeping_entries")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (result.error || !result.data) throw new CrmAuthError(502, "Bookkeeping row could not be updated.");
    entry = result.data;

    // Keep the job card in sync when the ledger row's salesperson changes.
    if ("sales_owner" in patch && entry.job_id) {
      const ownerLabel =
        patch.sales_owner === "jessica" ? "Jessica" : patch.sales_owner === "mike" ? "Mike" : "Unassigned";
      const { data: linkedJob } = await supabase
        .from("crm_jobs")
        .update({ sales_owner: ownerLabel })
        .eq("id", entry.job_id)
        .select("*")
        .maybeSingle();
      if (linkedJob) await syncCustomerFromJob(supabase, linkedJob);
    }
  }

  const paymentAmount = toMoney(payload.payment_amount);
  if (paymentAmount > 0) {
    const paymentType = normalizePaymentType(optionalText(payload.payment_type)) || "other";
    const { error: paymentError } = await supabase.from("crm_quote_bookkeeping_payments").insert({
      bookkeeping_entry_id: id,
      payment_label: optionalText(payload.payment_label) || "Balance payment",
      payment_type: paymentType,
      amount: paymentAmount,
      paid_at: payload.paid_at || new Date().toISOString().slice(0, 10),
      source: payload.source === "legacy_sheet" ? "legacy_sheet" : "manual",
      notes: optionalText(payload.payment_notes),
      meta: { createdBy: actor.email }
    });

    if (paymentError) throw new CrmAuthError(502, "Bookkeeping row was updated, but payment failed to save.");
  }

  await syncCustomerFromBookkeepingEntry(supabase, entry);
  await recordCrmActivity(supabase, actor, {
    entityType: "bookkeeping_entry",
    entityId: id,
    action: "update",
    before: existing,
    after: entry
  });

  if (Object.prototype.hasOwnProperty.call(payload, "notes")) {
    const noteAlertResult = await dispatch805InvoiceNoteNotification({
      customerName: entry.customer_name,
      note: entry.notes,
      previousNote: existing.notes
    });
    await recordCrmActivity(supabase, actor, {
      entityType: "bookkeeping_entry",
      entityId: id,
      action: "invoice_note_alert",
      metadata: noteAlertResult
    });
  }

  return entry as CrmBookkeepingEntry;
}

const expenseCategories = new Set([
  "materials",
  "installation_extra",
  "processing_fee",
  "permit",
  "repair",
  "referral",
  "other"
]);

export async function createCrmJobExpense(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const label = requiredText(payload.label, "Expense label is required.");
  const amount = toMoney(payload.amount);
  if (amount <= 0) throw new CrmAuthError(400, "Expense amount must be greater than zero.");

  let entryId = optionalText(payload.bookkeeping_entry_id);
  let quoteId = optionalText(payload.quote_id);
  let jobId = optionalText(payload.job_id);

  // Resolve the sale the expense belongs to so it always lands on the same
  // bookkeeping row the profit calculation reads.
  if (entryId) {
    const { data: entry } = await supabase
      .from("crm_quote_bookkeeping_entries")
      .select("id,quote_id,job_id")
      .eq("id", entryId)
      .maybeSingle();
    if (!entry) throw new CrmAuthError(404, "Bookkeeping row for this expense was not found.");
    quoteId = quoteId || entry.quote_id;
    jobId = jobId || entry.job_id;
  } else if (quoteId) {
    const { data: quote } = await supabase
      .from("crm_quotes")
      .select("id,job_id")
      .eq("id", quoteId)
      .maybeSingle();
    if (!quote) throw new CrmAuthError(404, "Quote for this expense was not found.");
    jobId = jobId || quote.job_id;
    const { data: linkedEntry } = await supabase
      .from("crm_quote_bookkeeping_entries")
      .select("id")
      .eq("quote_id", quoteId)
      .maybeSingle();
    entryId = linkedEntry?.id || null;
  } else if (!jobId) {
    throw new CrmAuthError(400, "An expense needs a bookkeeping row, quote, or job to attach to.");
  }

  const { data: expense, error } = await supabase
    .from("crm_job_expenses")
    .insert({
      bookkeeping_entry_id: entryId,
      quote_id: quoteId,
      job_id: jobId,
      label,
      category: normalizeEnum(payload.category, expenseCategories, "other", "Invalid expense category."),
      amount,
      incurred_on: payload.incurred_on || new Date().toISOString().slice(0, 10),
      notes: optionalText(payload.notes),
      source: "manual",
      meta: { createdBy: actor.email }
    })
    .select("*")
    .single();

  if (error || !expense) throw new CrmAuthError(502, "Expense could not be saved.");

  await recordCrmActivity(supabase, actor, {
    entityType: "expense",
    entityId: expense.id,
    action: "create",
    after: expense
  });

  return expense as CrmJobExpense;
}
