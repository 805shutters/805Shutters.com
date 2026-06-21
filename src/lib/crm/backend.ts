import { SupabaseClient } from "@supabase/supabase-js";
import {
  BUSINESS_PAYOFF_TARGET,
  buildAccountabilityQueue,
  buildBookkeepingRows,
  buildKenPayoffSummary,
  effectiveBookkeepingStatus,
  normalizePaymentType,
  sumBookkeepingRows
} from "@/lib/crm/bookkeeping";
import { buildCommissionSummary } from "@/lib/crm/commissions";
import { buildCustomerFiles } from "@/lib/crm/customer-files";
import { buildDashboardSummaryMetrics } from "@/lib/crm/dashboard-metrics";
import { buildPartnerPaymentLedger, paymentPersonLabel } from "@/lib/crm/partner-payments";
import { CrmAuthError } from "@/lib/crm/auth";
import { isMikePaymentAdminEmail } from "@/lib/crm/allowed-users";
import { sendCalendarAssignmentSms } from "@/lib/crm/calendar-notifications";
import {
  bookingEndIso,
  losAngelesDateString,
  losAngelesTimeString,
  monthRangeUtc,
  zonedTimeToUtc
} from "@/lib/booking/availability";
import {
  CrmAvailabilitySlot,
  CrmBookkeepingStatus,
  CrmBookkeepingRow,
  CrmBookkeepingCredit,
  CrmBookkeepingEntry,
  CrmBookkeepingPayment,
  CrmCommissionPaymentAllocation,
  CrmCommissionPayment,
  CrmCalendarEvent,
  CrmCustomer,
  CrmCustomerContract,
  CrmCustomerProduct,
  CrmDashboardData,
  CrmInstallationInvoiceEmail,
  CrmJob,
  CrmJobExpense,
  CrmJobExpenseSource,
  CrmJobStatus,
  CrmKenPaymentAllocation,
  CrmKenPayment,
  CrmOrderCogsEmail,
  CrmPartnerPaymentLedgerItem,
  CrmPaymentPerson,
  CrmQuote,
  CrmQuoteStatus,
  crmJobStatuses,
  crmQuoteStatuses
} from "@/lib/crm/types";
import { advanceJobStatus, jobStatusForQuote } from "@/lib/quote/lifecycle";

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

const jobStatusSet = new Set<string>(crmJobStatuses);
const quoteStatusSet = new Set<string>(crmQuoteStatuses);
const prioritySet = new Set(["low", "normal", "high", "urgent"]);
const calendarEventTypes = new Set(["sales_consult", "measure", "install", "follow_up", "block"]);
const calendarStatuses = new Set(["scheduled", "complete", "canceled", "rescheduled"]);
const saleOwnerSyncJobStatuses = new Set(["sold", "ordered", "installed", "invoiced", "closed"]);
const saleOwnerSyncQuoteStatuses = ["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"];

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
  "customer_email",
  "customer_phone",
  "customer_address",
  "customer_printed_name",
  "signed_at",
  "notes"
]);

const allowedEntryPatchFields = new Set([
  "customer_name",
  "sold_date",
  "total_amount",
  "payment_type",
  "cogs_amount",
  "sales_owner",
  "installation_invoice_document_id",
  "installation_invoice_amount",
  "installation_invoice_number",
  "installation_invoice_url",
  "installation_match_status",
  "installation_matched_at",
  "manufacturer_name",
  "manufacturer_order_ref",
  "manufacturer_order_url",
  "manufacturer_document_url",
  "notes",
  "imported_sheet_row",
  "ken_cut_override"
]);

export function toMoney(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
}

export function normalizeRemakeAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  const amount = Math.abs(Number(value));
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function hasPayloadKey(payload: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

type RemakeExpenseTarget = {
  bookkeepingEntryId?: string | null;
  quoteId?: string | null;
  jobId?: string | null;
  source: CrmJobExpenseSource;
  actorEmail: string;
  incurredOn?: string | null;
};

export async function syncRemakeExpense(
  supabase: CrmSupabaseClient,
  target: RemakeExpenseTarget,
  rawAmount: unknown
) {
  const amount = normalizeRemakeAmount(rawAmount);
  const applyTarget = <T extends { eq: (column: string, value: string) => T }>(query: T) => {
    if (target.bookkeepingEntryId) return query.eq("bookkeeping_entry_id", target.bookkeepingEntryId);
    if (target.quoteId) return query.eq("quote_id", target.quoteId);
    if (target.jobId) return query.eq("job_id", target.jobId);
    throw new CrmAuthError(400, "Remake cost must be tied to a bookkeeping row, quote, or job.");
  };

  if (amount <= 0) {
    const { error } = await applyTarget(supabase.from("crm_job_expenses").delete().eq("category", "remake"));
    if (error) throw new CrmAuthError(502, "Remake cost could not be cleared.");
    return;
  }

  const { data: existingRows, error: selectError } = await applyTarget(
    supabase.from("crm_job_expenses").select("*").eq("category", "remake").order("created_at", { ascending: true })
  );
  if (selectError) throw new CrmAuthError(502, "Remake cost could not be loaded.");

  const now = new Date().toISOString();
  const expensePatch = {
    bookkeeping_entry_id: target.bookkeepingEntryId || null,
    quote_id: target.quoteId || null,
    job_id: target.jobId || null,
    label: "Remake",
    category: "remake",
    amount,
    incurred_on: target.incurredOn || null,
    notes: null,
    source: target.source,
    meta: { lastUpdatedBy: target.actorEmail, lastUpdatedAt: now }
  };

  const [primary, ...duplicates] = existingRows || [];
  if (primary) {
    const { error: updateError } = await supabase
      .from("crm_job_expenses")
      .update({
        ...expensePatch,
        meta: { ...(primary.meta || {}), lastUpdatedBy: target.actorEmail, lastUpdatedAt: now }
      })
      .eq("id", primary.id);
    if (updateError) throw new CrmAuthError(502, "Remake cost could not be updated.");
  } else {
    const { error: insertError } = await supabase.from("crm_job_expenses").insert({
      ...expensePatch,
      meta: { createdBy: target.actorEmail, createdAt: now, lastUpdatedBy: target.actorEmail, lastUpdatedAt: now }
    });
    if (insertError) throw new CrmAuthError(502, "Remake cost could not be saved.");
  }

  const duplicateIds = duplicates.map((expense) => expense.id).filter(Boolean);
  if (duplicateIds.length) {
    const { error: deleteError } = await supabase.from("crm_job_expenses").delete().in("id", duplicateIds);
    if (deleteError) throw new CrmAuthError(502, "Duplicate remake costs could not be collapsed.");
  }
}

export function assertMikePaymentAdmin(actor: CrmActor) {
  if (!isMikePaymentAdminEmail(actor.email)) {
    throw new CrmAuthError(403, "Only Mike can record or edit partner payments.");
  }
}

export function resolveFullPartnerPaymentAmount(payloadAmount: unknown, payableAmount: number) {
  const amount =
    payloadAmount === undefined || payloadAmount === null || payloadAmount === ""
      ? payableAmount
      : toMoney(payloadAmount);
  if (amount <= 0) throw new CrmAuthError(400, "Payment amount must be greater than zero.");
  if (Math.abs(amount - payableAmount) > 0.005) {
    throw new CrmAuthError(400, "Partial partner payments are not supported. Pay the selected job balance in full.");
  }
  return Math.round(amount * 100) / 100;
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

function ownerDisplayName(value: unknown) {
  const owner = normalizeOwner(value);
  if (owner === "jessica") return "Jessica";
  if (owner === "mike") return "Mike";
  return null;
}

function shouldSyncSaleOwnerForJob(status: unknown) {
  return saleOwnerSyncJobStatuses.has(String(status || ""));
}

// Availability + calendar assignment use capitalized rep names ("Jessica", "Mike")
// to match the CRM "Assigned to" dropdown and crm_calendar_events.assigned_to.
function normalizeAvailabilityOwner(value: unknown) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("jessica")) return "Jessica";
  if (lower.includes("mike")) return "Mike";
  throw new CrmAuthError(400, "Availability owner must be Jessica or Mike.");
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

function objectMeta(value: unknown) {
  return typeof value === "object" && value && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function fetchCrmJob(supabase: CrmSupabaseClient, jobId: string): Promise<CrmJob> {
  const { data, error } = await supabase.from("crm_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error || !data) throw new CrmAuthError(404, "CRM job was not found.");
  return data as CrmJob;
}

async function nextCrmQuoteNumber(supabase: CrmSupabaseClient) {
  const { data, error } = await supabase
    .from("crm_quotes")
    .select("quote_number")
    .ilike("quote_number", "805-%")
    .limit(5000);

  if (error) return null;

  const max = ((data as Array<{ quote_number: string | null }>) || []).reduce((highest, row) => {
    const match = String(row.quote_number || "").match(/^805-(\d+)$/i);
    if (!match) return highest;
    return Math.max(highest, Number(match[1]) || 0);
  }, 1000);

  return `805-${max + 1}`;
}

function isMissingAvailabilityColumn(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message || "";
  return (
    error?.code === "PGRST204" ||
    error?.code === "42703" ||
    (message.includes("crm_availability_slots") && message.includes("column")) ||
    message.includes("Could not find")
  );
}

function isAvailabilitySlotsTableMissing(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "PGRST205" && Boolean(error.message?.includes("crm_availability_slots"));
}

function logSupabaseError(label: string, error: { code?: string; message?: string; details?: string; hint?: string }) {
  console.error(label, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint
  });
}

function availabilitySlotFromActivity(row: Record<string, unknown>) {
  const metadata = typeof row.metadata === "object" && row.metadata ? row.metadata : {};
  const afterData = typeof row.after_data === "object" && row.after_data ? row.after_data : {};
  const source = { ...metadata, ...afterData } as Record<string, unknown>;
  const owner = typeof source.owner === "string" ? source.owner : null;
  const startAt = typeof source.start_at === "string" ? source.start_at : null;
  const endAt = typeof source.end_at === "string" ? source.end_at : null;

  if (!owner || !startAt || !endAt) return null;

  return {
    id: typeof row.id === "string" ? row.id : `${owner}-${startAt}`,
    created_at: typeof row.created_at === "string" ? row.created_at : startAt,
    updated_at: typeof row.created_at === "string" ? row.created_at : startAt,
    owner,
    start_at: startAt,
    end_at: endAt,
    status: row.action === "availability_slot_closed" ? "canceled" : "available",
    source: "crm_activity_events_fallback",
    created_by_email: typeof row.actor_email === "string" ? row.actor_email : null,
    meta: typeof source.meta === "object" && source.meta ? source.meta : {}
  } as CrmAvailabilitySlot;
}

function activityAvailabilityRowsToSlots(rows: Record<string, unknown>[], range: { start: string; end: string }) {
  const latestByWindow = new Map<string, CrmAvailabilitySlot>();

  for (const row of rows) {
    const slot = availabilitySlotFromActivity(row);
    if (!slot) continue;
    if (slot.start_at < range.start || slot.start_at >= range.end) continue;
    latestByWindow.set(`${slot.owner}|${slot.start_at}`, slot);
  }

  return Array.from(latestByWindow.values())
    .filter((slot) => slot.status === "available")
    .sort((left, right) => left.start_at.localeCompare(right.start_at));
}

export async function listCrmAvailabilityFallbackSlots(supabase: CrmSupabaseClient, month: string) {
  const range = monthRangeUtc(month);
  const { data, error } = await supabase
    .from("crm_activity_events")
    .select("id,created_at,actor_email,action,after_data,metadata")
    .eq("entity_type", "system")
    .in("action", ["availability_slot_open", "availability_slot_closed"])
    .order("created_at", { ascending: true })
    .limit(5000);

  if (error) {
    logSupabaseError("crm availability activity fallback query failed", error);
    throw new CrmAuthError(502, "Availability could not be loaded.");
  }

  return activityAvailabilityRowsToSlots((data || []) as Record<string, unknown>[], range).map((slot) => {
    const start = new Date(slot.start_at);
    return {
      ...slot,
      date: losAngelesDateString(start),
      time: losAngelesTimeString(start)
    };
  });
}

async function recordAvailabilityFallbackSlot(
  supabase: CrmSupabaseClient,
  actor: CrmActor,
  record: { owner: string; start_at: string; end_at: string },
  open: boolean
) {
  const status = open ? "available" : "canceled";
  const action = open ? "availability_slot_open" : "availability_slot_closed";
  const slot = {
    ...record,
    status,
    source: "crm_activity_events_fallback",
    created_by_email: actor.email,
    meta: {
      fallbackStore: "crm_activity_events"
    }
  };
  const { data, error } = await supabase
    .from("crm_activity_events")
    .insert({
      actor_auth_user_id: actor.userId || null,
      actor_email: actor.email,
      entity_type: "system",
      action,
      after_data: slot,
      metadata: slot
    })
    .select("id,created_at,actor_email,action,after_data,metadata")
    .single();

  if (error || !data) {
    if (error) logSupabaseError("crm availability activity fallback insert failed", error);
    throw new CrmAuthError(502, open ? "Availability slot could not be saved." : "Availability slot could not be removed.");
  }

  const fallbackSlot = availabilitySlotFromActivity(data as Record<string, unknown>);
  return {
    ...(fallbackSlot || slot),
    date: losAngelesDateString(new Date(record.start_at)),
    time: losAngelesTimeString(new Date(record.start_at))
  };
}

// The single source of truth for the quote -> job projection lives in
// @/lib/quote/lifecycle (jobStatusForQuote). The legacy paths below go through
// syncJobFromQuote so the builder and legacy endpoints never diverge.
/**
 * Forward-only write of the parent job's status from a quote's status, plus any
 * extra job fields (estimated_total, deposit_paid). Reads the job's current
 * status and never downgrades it (a sold/ordered/installed job is not dragged
 * back to "quoted" by a later quote edit) — `lost` is the one allowed override.
 * An unsent `draft` quote does NOT advance the job (an empty/early draft leaves
 * the job "scheduled"), matching the builder's recalcQuoteTotals behavior.
 */
async function syncJobFromQuote(
  supabase: CrmSupabaseClient,
  jobId: string,
  quoteStatus: string,
  extra: Record<string, unknown>,
): Promise<CrmJob | null> {
  const update: Record<string, unknown> = { ...extra };
  if (quoteStatus !== "draft") {
    const { data: jobRow } = await supabase.from("crm_jobs").select("status").eq("id", jobId).maybeSingle();
    const current = (jobRow as { status?: CrmJobStatus } | null)?.status;
    if (current) {
      const next = advanceJobStatus(current, jobStatusForQuote(quoteStatus as CrmQuoteStatus));
      if (next !== current) update.status = next;
    }
  }
  const { data: job } = await supabase.from("crm_jobs").update(update).eq("id", jobId).select("*").maybeSingle();
  return (job as CrmJob | null) ?? null;
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
      | "ken_payment"
      | "commission_payment"
      | "order_cogs_email"
      | "settings"
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

function publicQuoteUrl(token: string | null | undefined): string | null {
  if (!token) return null;
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  return base ? `${base}/quote/${token}` : `/quote/${token}`;
}

async function upsertSoldQuoteContract(
  supabase: CrmSupabaseClient,
  quote: CrmQuote,
  job?: Record<string, unknown> | null
) {
  if (quote.status !== "sold" && quote.status !== "approved") return;
  const signedAt = quote.signed_at || quote.sold_at || quote.approved_at;
  if (!signedAt && !quote.share_token) return;

  let linkedJob = job || null;
  if (!linkedJob && quote.job_id) {
    const { data } = await supabase.from("crm_jobs").select("*").eq("id", quote.job_id).maybeSingle();
    linkedJob = data || null;
  }
  const customerName = String(quote.customer_name || linkedJob?.customer_name || "Linked customer");
  const customer = linkedJob
    ? await upsertCrmCustomer(supabase, {
        displayName: customerName,
        phone: typeof linkedJob.phone === "string" ? linkedJob.phone : null,
        email: typeof linkedJob.email === "string" ? linkedJob.email : quote.customer_email,
        address: typeof linkedJob.address === "string" ? linkedJob.address : quote.customer_address,
        city: typeof linkedJob.city === "string" ? linkedJob.city : null,
        latestStatus: quote.status,
        latestSoldDate: signedAt ? signedAt.slice(0, 10) : null,
        source: "crm",
        notes: quote.notes || (typeof linkedJob.notes === "string" ? linkedJob.notes : null),
        meta: {
          lastQuoteId: quote.id,
          lastSignedQuoteId: quote.id,
          lastJobId: linkedJob.id
        }
      })
    : null;

  const { error } = await supabase.from("crm_customer_contracts").upsert(
    {
      external_source: "crm_quote",
      external_id: `contract:${quote.id}`,
      customer_id: customer?.id || null,
      job_id: quote.job_id,
      quote_id: quote.id,
      bookkeeping_entry_id: null,
      title: quote.quote_number ? `Contract ${quote.quote_number}` : `${customerName} contract`,
      contract_url: publicQuoteUrl(quote.share_token),
      share_token: quote.share_token,
      status: quote.status,
      signed_at: signedAt || null,
      total_amount: toMoney(quote.quote_total),
      meta: {
        customer_printed_name: quote.customer_printed_name || null,
        source: "crm_quote_status"
      }
    },
    { onConflict: "external_source,external_id" }
  );

  if (error) throw new CrmAuthError(502, "Quote was saved, but the customer contract file could not be saved.");
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

export function enrichCalendarEventsWithJobDetails(events: CrmCalendarEvent[], jobs: CrmJob[]): CrmCalendarEvent[] {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));

  return events.map((event) => {
    const job = event.job_id ? jobsById.get(event.job_id) : null;
    if (!job) return event;

    return {
      ...event,
      customer_name: event.customer_name || job.customer_name,
      customer_phone: job.phone,
      customer_email: job.email,
      customer_address: event.location || job.address,
      customer_city: job.city,
      product_interest: job.product_interest,
      customer_notes: event.notes || job.notes
    };
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
  expenses,
  installationInvoiceEmails = [],
  kenPayments,
  kenPaymentAllocations = [],
  orderCogsEmails = [],
  commissionPayments = [],
  commissionPaymentAllocations = [],
  openingBalance,
  payoffTarget,
  now
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
  expenses: CrmJobExpense[];
  installationInvoiceEmails: CrmInstallationInvoiceEmail[];
  kenPayments: CrmKenPayment[];
  kenPaymentAllocations?: CrmKenPaymentAllocation[];
  orderCogsEmails?: CrmOrderCogsEmail[];
  commissionPayments?: CrmCommissionPayment[];
  commissionPaymentAllocations?: CrmCommissionPaymentAllocation[];
  openingBalance: number;
  payoffTarget: number;
  now?: Date | string;
}): CrmDashboardData {
  const quotesByJob = new Map<string, number>();
  for (const quote of quotes) {
    quotesByJob.set(quote.job_id, Math.max(quotesByJob.get(quote.job_id) || 0, toMoney(quote.quote_total)));
  }

  const baseBookkeepingRows = buildBookkeepingRows({ quotes, entries, payments, credits, expenses });
  const liveJobs = projectLiveJobStatuses(jobs, baseBookkeepingRows);
  const bookkeepingRows = projectLiveBookkeepingStatuses(baseBookkeepingRows, liveJobs);
  const liveQuotes = projectLiveQuoteStatuses(quotes, bookkeepingRows);
  const bookkeepingTotals = sumBookkeepingRows(bookkeepingRows);
  const accountability = buildAccountabilityQueue(bookkeepingRows);
  const kenPayoff = buildKenPayoffSummary({
    rows: bookkeepingRows,
    payments: kenPayments,
    openingBalance,
    payoffTarget
  });
  const commissionSummary = buildCommissionSummary(bookkeepingRows, commissionPayments);
  const partnerPaymentLedger = buildPartnerPaymentLedger({
    rows: bookkeepingRows,
    kenPayments,
    commissionPayments,
    kenAllocations: kenPaymentAllocations,
    commissionAllocations: commissionPaymentAllocations
  });
  const customerFiles = buildCustomerFiles({
    customers,
    products,
    contracts,
    jobs: liveJobs,
    quotes: liveQuotes,
    bookkeepingRows
  });
  const jobsWithQuotes = liveJobs.map((job) => ({
    ...job,
    quote_total: quotesByJob.get(job.id) || toMoney(job.estimated_total)
  }));
  const calendarEvents = enrichCalendarEventsWithJobDetails(events, jobsWithQuotes);

  return {
    jobs: jobsWithQuotes,
    quotes: liveQuotes,
    events: calendarEvents,
    customers,
    customerProducts: products,
    customerContracts: contracts,
    customerFiles,
    bookkeepingEntries: entries,
    bookkeepingPayments: payments,
    bookkeepingCredits: credits,
    jobExpenses: expenses,
    installationInvoiceEmails,
    orderCogsEmails,
    bookkeepingRows,
    bookkeepingTotals,
    kenPayments,
    kenPaymentAllocations,
    kenPayoff,
    commissionPayments,
    commissionPaymentAllocations,
    commissionSummary,
    partnerPaymentLedger,
    accountability,
    summary: buildDashboardSummaryMetrics({
      jobs: jobsWithQuotes,
      quotes: liveQuotes,
      rows: bookkeepingRows,
      installationInvoiceEmails,
      orderCogsEmails,
      now
    })
  };
}

function projectLiveQuoteStatuses(quotes: CrmQuote[], rows: CrmBookkeepingRow[]) {
  const statusByQuoteId = new Map<string, ReturnType<typeof effectiveBookkeepingStatus>>();
  for (const row of rows) {
    if (!row.quoteId) continue;
    statusByQuoteId.set(row.quoteId, effectiveBookkeepingStatus(row));
  }

  return quotes.map((quote) => {
    const liveStatus = statusByQuoteId.get(quote.id) || quote.status;
    return liveStatus === quote.live_status ? quote : { ...quote, live_status: liveStatus };
  });
}

const BOOKKEEPING_STATUS_RANK: Record<CrmBookkeepingStatus, number> = {
  draft: 0,
  sent: 1,
  sold: 2,
  approved: 2,
  legacy: 2,
  manual: 2,
  ordered: 3,
  received: 4,
  installed: 5,
  invoiced: 6,
  paid: 7,
  closed: 8,
  archived: 0,
  lost: 9
};

function projectLiveBookkeepingStatuses(rows: CrmBookkeepingRow[], jobs: CrmJob[]) {
  const statusByJobId = new Map(jobs.map((job) => [job.id, job.status]));

  return rows.map((row) => {
    const current = effectiveBookkeepingStatus({
      source: row.source,
      status: row.status,
      isPaidInFull: row.isPaidInFull
    });
    const jobStatus = row.jobId ? statusByJobId.get(row.jobId) : undefined;
    const targetStatus = bookkeepingStatusForJob(jobStatus);
    const liveStatus = advanceBookkeepingStatus(current, targetStatus);
    return liveStatus === row.liveStatus ? row : { ...row, liveStatus };
  });
}

function bookkeepingStatusForJob(status: CrmJobStatus | undefined): CrmBookkeepingStatus | null {
  if (status === "closed") return "closed";
  if (status === "invoiced") return "invoiced";
  if (status === "installed") return "installed";
  if (status === "ordered") return "ordered";
  if (status === "sold") return "sold";
  if (status === "lost") return "lost";
  return null;
}

function advanceBookkeepingStatus(current: CrmBookkeepingStatus, target: CrmBookkeepingStatus | null) {
  if (!target) return current;
  if (target === "lost") return "lost";
  if (current === "lost" || current === "closed") return current;
  return (BOOKKEEPING_STATUS_RANK[target] ?? 0) > (BOOKKEEPING_STATUS_RANK[current] ?? 0) ? target : current;
}

function projectLiveJobStatuses(jobs: CrmJob[], rows: CrmBookkeepingRow[]) {
  const statusByJobId = new Map(jobs.map((job) => [job.id, job.status]));

  for (const row of rows) {
    if (!row.jobId) continue;
    const current = statusByJobId.get(row.jobId);
    if (!current) continue;
    statusByJobId.set(row.jobId, advanceJobStatus(current, jobStatusForBookkeepingRow(row)));
  }

  return jobs.map((job) => {
    const status = statusByJobId.get(job.id) || job.status;
    return status === job.status ? job : { ...job, status };
  });
}

function jobStatusForBookkeepingRow(row: CrmBookkeepingRow): CrmJobStatus {
  const status = effectiveBookkeepingStatus(row);
  if (status === "closed") return "closed";
  if (status === "paid") return row.isPaidInFull ? "closed" : "invoiced";
  if (status === "installed" || status === "invoiced") return "installed";
  if (status === "ordered" || status === "received") return "ordered";
  if (status === "lost") return "lost";
  if (status === "draft" || status === "sent" || status === "archived") return "quoted";
  return "sold";
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
    expensesResult,
    installationInvoiceEmailsResult,
    kenPaymentsResult,
    kenPaymentAllocationsResult,
    orderCogsEmailsResult,
    commissionPaymentsResult,
    commissionPaymentAllocationsResult,
    settingsResult
  ] = await Promise.all([
    // Jobs and quotes use the SAME limit so a job and its quote don't land on
    // opposite sides of the cap (which blanks quote customer names and shows
    // "Build Quote" for jobs that already have one). TODO: server-side pagination.
    supabase.from("crm_jobs").select("*").order("created_at", { ascending: false }).limit(1000),
    supabase.from("crm_quotes").select("*").order("created_at", { ascending: false }).limit(1000),
    supabase
      .from("crm_calendar_events")
      .select("*")
      .gte("start_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString())
      .order("start_at", { ascending: true })
      .limit(120),
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
    supabase
      .from("crm_job_expenses")
      .select("*")
      .order("incurred_on", { ascending: false, nullsFirst: false })
      .limit(1000),
    supabase
      .from("crm_installation_invoice_emails")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("crm_ken_payments")
      .select("*")
      .order("paid_on", { ascending: false, nullsFirst: false })
      .limit(500),
    supabase
      .from("crm_ken_payment_allocations")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(2000),
    supabase
      .from("crm_order_cogs_emails")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("crm_commission_payments")
      .select("*")
      .order("paid_on", { ascending: false, nullsFirst: false })
      .limit(1000),
    supabase
      .from("crm_commission_payment_allocations")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(4000),
    supabase.from("crm_settings").select("*")
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
    creditsResult.error
  ) {
    throw new CrmAuthError(502, "CRM data failed to load. Run the 805 CRM Supabase migrations.");
  }

  // Job expenses are newer than the core tables; degrade gracefully (no expense
  // deductions) rather than breaking the whole dashboard if the table is absent.
  if (expensesResult.error) {
    console.warn("CRM job expenses could not be loaded.", expensesResult.error.message);
  }

  if (installationInvoiceEmailsResult.error) {
    console.warn("CRM installation invoice email records could not be loaded.", installationInvoiceEmailsResult.error.message);
  }

  if (kenPaymentsResult.error) {
    console.warn("CRM Ken payments could not be loaded.", kenPaymentsResult.error.message);
  }

  if (kenPaymentAllocationsResult.error) {
    console.warn("CRM Ken payment allocations could not be loaded.", kenPaymentAllocationsResult.error.message);
  }

  if (orderCogsEmailsResult.error) {
    console.warn("CRM order COGS emails could not be loaded.", orderCogsEmailsResult.error.message);
  }

  if (commissionPaymentsResult.error) {
    console.warn("CRM commission payments could not be loaded.", commissionPaymentsResult.error.message);
  }

  if (commissionPaymentAllocationsResult.error) {
    console.warn("CRM commission payment allocations could not be loaded.", commissionPaymentAllocationsResult.error.message);
  }

  if (settingsResult.error) {
    console.warn("CRM settings could not be loaded.", settingsResult.error.message);
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
  const expenses = (expensesResult.error ? [] : expensesResult.data || []) as CrmJobExpense[];
  const installationInvoiceEmails = (
    installationInvoiceEmailsResult.error ? [] : installationInvoiceEmailsResult.data || []
  ) as CrmInstallationInvoiceEmail[];
  const kenPayments = (kenPaymentsResult.error ? [] : kenPaymentsResult.data || []) as CrmKenPayment[];
  const kenPaymentAllocations = (
    kenPaymentAllocationsResult.error ? [] : kenPaymentAllocationsResult.data || []
  ) as CrmKenPaymentAllocation[];
  const orderCogsEmails = (orderCogsEmailsResult.error ? [] : orderCogsEmailsResult.data || []) as CrmOrderCogsEmail[];
  const commissionPayments = (
    commissionPaymentsResult.error ? [] : commissionPaymentsResult.data || []
  ) as CrmCommissionPayment[];
  const commissionPaymentAllocations = (
    commissionPaymentAllocationsResult.error ? [] : commissionPaymentAllocationsResult.data || []
  ) as CrmCommissionPaymentAllocation[];
  const settingsRows = (settingsResult.error ? [] : settingsResult.data || []) as Array<{
    key: string;
    value: number;
  }>;
  const settingsMap = new Map(settingsRows.map((row) => [row.key, Number(row.value) || 0]));
  const openingBalance = settingsMap.get("ken_opening_balance") ?? 0;
  const payoffTarget = settingsMap.get("payoff_target") ?? BUSINESS_PAYOFF_TARGET;
  const jobNames = new Map(jobs.map((job) => [job.id, job.customer_name]));

  return buildDashboardData({
    jobs,
    quotes: quotes.map((quote) => ({ ...quote, customer_name: jobNames.get(quote.job_id) })),
    events,
    customers,
    products,
    contracts,
    entries,
    payments,
    credits,
    expenses,
    installationInvoiceEmails,
    kenPayments,
    kenPaymentAllocations,
    orderCogsEmails,
    commissionPayments,
    commissionPaymentAllocations,
    openingBalance,
    payoffTarget
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

  if (Object.prototype.hasOwnProperty.call(patch, "sales_owner") && shouldSyncSaleOwnerForJob(data.status)) {
    await syncSaleOwnerForJob(supabase, id, patch.sales_owner, actor);
  }

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

async function syncSaleOwnerForJob(
  supabase: CrmSupabaseClient,
  jobId: string,
  value: unknown,
  actor: CrmActor
) {
  const salesOwner = normalizeOwner(value);
  const soldBy = ownerDisplayName(value);
  const now = new Date().toISOString();

  const quoteResult = await supabase
    .from("crm_quotes")
    .update({ sold_by: soldBy })
    .eq("job_id", jobId)
    .in("status", saleOwnerSyncQuoteStatuses);

  if (quoteResult.error) throw new CrmAuthError(502, "Sale owner was saved on the job, but quote ownership failed to sync.");

  const entryResult = await supabase
    .from("crm_quote_bookkeeping_entries")
    .update({
      sales_owner: salesOwner,
      sales_owner_auth_user_id: salesOwner ? actor.userId || null : null,
      sales_owner_set_at: salesOwner ? now : null
    })
    .eq("job_id", jobId);

  if (entryResult.error) {
    throw new CrmAuthError(502, "Sale owner was saved on the job, but bookkeeping ownership failed to sync.");
  }

  await recordCrmActivity(supabase, actor, {
    entityType: "job",
    entityId: jobId,
    action: "sync_sale_owner",
    metadata: {
      salesOwner,
      soldBy
    }
  });
}

async function assertCalendarWindowAvailable(
  supabase: CrmSupabaseClient,
  startAt: string,
  endAt: string
) {
  const { data, error } = await supabase
    .from("crm_calendar_events")
    .select("id,title,start_at,end_at")
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
  await assertCalendarWindowAvailable(supabase, startAt, endAt);

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

  let linkedJob: CrmJob | null = null;
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

    if (job) {
      linkedJob = job as CrmJob;
      await syncCustomerFromJob(supabase, linkedJob);
    }
  }

  const assignedSalespersonSms = await sendCalendarAssignmentSms({
    assignedTo,
    title,
    startAt,
    endAt,
    location: optionalText(payload.location) || linkedJob?.address || null,
    customerName: linkedJob?.customer_name || null,
    phone: linkedJob?.phone || null,
    productInterest: linkedJob?.product_interest || null
  });

  await recordCrmActivity(supabase, actor, {
    entityType: "calendar_event",
    entityId: data.id,
    action: "create",
    after: data,
    metadata: {
      jobId: payload.job_id || null,
      assignedSalespersonSms
    }
  });

  return data as CrmCalendarEvent;
}

export async function listCrmAvailabilitySlots(supabase: CrmSupabaseClient, month: string) {
  const range = monthRangeUtc(month);
  let { data, error } = await supabase
    .from("crm_availability_slots")
    .select("*")
    .gte("start_at", range.start)
    .lt("start_at", range.end)
    .order("start_at", { ascending: true });

  if (error) {
    logSupabaseError("crm_availability_slots ranged query failed", error);
    if (isAvailabilitySlotsTableMissing(error)) {
      return listCrmAvailabilityFallbackSlots(supabase, month);
    }
    const fallback = await supabase.from("crm_availability_slots").select("*");
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    logSupabaseError("crm_availability_slots fallback query failed", error);
    if (isAvailabilitySlotsTableMissing(error)) {
      return listCrmAvailabilityFallbackSlots(supabase, month);
    }
    throw new CrmAuthError(502, "Availability could not be loaded.");
  }

  return (data || []).filter((row) => {
    if ((row.status || "available") !== "available") return false;
    const startAt = typeof row.start_at === "string" ? row.start_at : "";
    return startAt >= range.start && startAt < range.end;
  }).map((row) => {
    const slot = {
      status: "available",
      source: "crm_click_availability",
      created_by_email: null,
      meta: {},
      ...row
    } as CrmAvailabilitySlot;
    const start = new Date(slot.start_at);
    return {
      ...slot,
      date: losAngelesDateString(start),
      time: losAngelesTimeString(start)
    };
  });
}

export async function createCrmAvailabilitySlot(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const owner = normalizeAvailabilityOwner(payload.owner);
  const date = requiredText(payload.date, "Availability date and time are required.");
  const time = requiredText(payload.time, "Availability date and time are required.");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new CrmAuthError(400, "Availability date and time are invalid.");
  }

  const record = {
    owner,
    start_at: zonedTimeToUtc(date, time).toISOString(),
    end_at: bookingEndIso(date, time),
    status: "available",
    source: "crm_click_availability",
    created_by_email: actor.email,
    meta: metadataWithActor(payload, actor, "createdBy")
  };

  const { error: staleSlotError } = await supabase
    .from("crm_availability_slots")
    .delete()
    .eq("owner", owner)
    .eq("start_at", record.start_at);

  if (staleSlotError) {
    logSupabaseError("crm_availability_slots delete-before-insert failed", staleSlotError);
    if (isAvailabilitySlotsTableMissing(staleSlotError)) {
      return recordAvailabilityFallbackSlot(supabase, actor, record, true);
    }
    throw new CrmAuthError(502, "Availability slot could not be saved.");
  }

  const { data, error } = await supabase
    .from("crm_availability_slots")
    .insert(record)
    .select("*")
    .single();

  if (error && isAvailabilitySlotsTableMissing(error)) {
    logSupabaseError("crm_availability_slots insert table missing", error);
    return recordAvailabilityFallbackSlot(supabase, actor, record, true);
  }

  if (error && isMissingAvailabilityColumn(error)) {
    logSupabaseError("crm_availability_slots full insert failed", error);
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("crm_availability_slots")
      .insert({
        owner: record.owner,
        start_at: record.start_at,
        end_at: record.end_at
      })
      .select("*")
      .single();

    if (fallbackError || !fallbackData) {
      if (fallbackError) logSupabaseError("crm_availability_slots fallback insert failed", fallbackError);
      throw new CrmAuthError(502, "Availability slot could not be saved.");
    }

    return {
      status: "available",
      source: "crm_click_availability",
      created_by_email: null,
      meta: {},
      ...fallbackData
    } as CrmAvailabilitySlot;
  }

  if (error || !data) {
    if (error) logSupabaseError("crm_availability_slots insert failed", error);
    throw new CrmAuthError(502, "Availability slot could not be saved.");
  }

  return data as CrmAvailabilitySlot;
}

export async function deleteCrmAvailabilitySlot(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const owner = normalizeAvailabilityOwner(payload.owner);
  const date = requiredText(payload.date, "Availability date and time are required.");
  const time = requiredText(payload.time, "Availability date and time are required.");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new CrmAuthError(400, "Availability date and time are invalid.");
  }

  const { error } = await supabase
    .from("crm_availability_slots")
    .delete()
    .eq("owner", owner)
    .eq("start_at", zonedTimeToUtc(date, time).toISOString());

  if (error) {
    logSupabaseError("crm_availability_slots delete failed", error);
    if (isAvailabilitySlotsTableMissing(error)) {
      await recordAvailabilityFallbackSlot(
        supabase,
        actor,
        {
          owner,
          start_at: zonedTimeToUtc(date, time).toISOString(),
          end_at: bookingEndIso(date, time)
        },
        false
      );
      return { removed: true };
    }
    throw new CrmAuthError(502, "Availability slot could not be removed.");
  }

  return { removed: true };
}

export async function createCrmQuote(supabase: CrmSupabaseClient, payload: Record<string, unknown>, actor: CrmActor) {
  let jobId = optionalText(payload.job_id);
  let linkedJob: CrmJob | null = null;

  if (jobId) {
    linkedJob = await fetchCrmJob(supabase, jobId);
  } else {
    const customerName = requiredText(payload.customer_name, "Customer name and phone are required to start a quote.");
    const phone = requiredText(payload.phone ?? payload.customer_phone, "Customer name and phone are required to start a quote.");
    linkedJob = await createCrmJob(
      supabase,
      {
        customer_name: customerName,
        phone,
        email: payload.email ?? payload.customer_email,
        address: payload.address ?? payload.customer_address,
        city: payload.city,
        product_interest: optionalText(payload.product_interest) || "Window Treatments",
        sales_owner: optionalText(payload.sales_owner) || optionalText(payload.sold_by) || "Unassigned",
        priority: optionalText(payload.priority) || "normal",
        next_action: "Build quote",
        next_action_due: payload.next_action_due || null,
        notes: optionalText(payload.notes),
        meta: {
          ...(typeof payload.meta === "object" && payload.meta ? payload.meta : {}),
          source: "quote_builder"
        }
      },
      actor
    );
    jobId = linkedJob.id;
  }

  const status = normalizeEnum<CrmQuoteStatus>(payload.status, quoteStatusSet, "draft", "Invalid quote status.");
  const quoteTotal = toMoney(payload.quote_total);
  const depositPaid = toMoney(payload.deposit_paid ?? payload.deposit_required);
  const balancePaid = toMoney(payload.balance_paid);
  const paymentType = normalizePaymentType(optionalText(payload.payment_type)) || "other";
  const now = new Date().toISOString();
  const quoteNumber = optionalText(payload.quote_number) || (await nextCrmQuoteNumber(supabase));

  const record = {
    job_id: jobId,
    quote_number: quoteNumber,
    status,
    quote_total: quoteTotal,
    materials_cost: toMoney(payload.materials_cost),
    labor_cost: toMoney(payload.labor_cost),
    discount: toMoney(payload.discount),
    tax: toMoney(payload.tax),
    deposit_required: depositPaid,
    balance_due: Math.max(quoteTotal - depositPaid - balancePaid, 0),
    sold_by: optionalText(payload.sold_by),
    signed_at: status === "sold" || status === "approved" ? payload.signed_at || payload.sold_at || now : null,
    sold_at: status === "sold" || status === "approved" ? payload.sold_at || now : null,
    approved_at: status === "approved" ? payload.approved_at || now : null,
    ordered_at: status === "ordered" ? payload.ordered_at || now : null,
    received_at: status === "received" ? payload.received_at || now : null,
    installed_at: status === "installed" ? payload.installed_at || now : null,
    manufacturer_name: optionalText(payload.manufacturer_name),
    manufacturer_order_ref: optionalText(payload.manufacturer_order_ref),
    manufacturer_order_url: optionalText(payload.manufacturer_order_url),
    manufacturer_document_url: optionalText(payload.manufacturer_document_url),
    customer_email: optionalText(payload.customer_email) || optionalText(payload.email) || linkedJob.email || null,
    customer_phone: optionalText(payload.customer_phone) || optionalText(payload.phone) || linkedJob.phone || null,
    customer_address: optionalText(payload.customer_address) || optionalText(payload.address) || linkedJob.address || null,
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

  // Defer the bookkeeping entry until the quote is actually committed (sold or
  // further). Draft/sent (not yet won) and lost/archived (never won) must NOT
  // create a ledger entry — that would inflate the pipeline with quotes that were
  // never sold. When the quote later advances to sold, updateCrmQuote's upsert
  // creates the entry.
  const committedSale = status !== "draft" && status !== "sent" && status !== "lost" && status !== "archived";
  if (committedSale) {
    const { error: entryError } = await supabase.from("crm_quote_bookkeeping_entries").insert({
      quote_id: data.id,
      job_id: jobId,
      source: "crm_quote",
      customer_name: optionalText(payload.customer_name) || linkedJob.customer_name || "Linked job",
      sold_date: payload.sold_at || now.slice(0, 10),
      total_amount: quoteTotal,
      payment_type: paymentType,
      cogs_amount: toMoney(payload.materials_cost),
      sales_owner: normalizeOwner(payload.sold_by),
      sales_owner_set_at: payload.sold_by ? now : null,
      manufacturer_name: optionalText(payload.manufacturer_name),
      manufacturer_order_ref: optionalText(payload.manufacturer_order_ref),
      manufacturer_order_url: optionalText(payload.manufacturer_order_url),
      manufacturer_document_url: optionalText(payload.manufacturer_document_url),
      notes: optionalText(payload.bookkeeping_notes),
      meta: { createdBy: actor.email }
    });

    if (entryError) throw new CrmAuthError(502, "Quote was saved, but bookkeeping failed to save.");
  }

  // Forward-only job projection (never downgrades; an unsent draft leaves the
  // job at "scheduled").
  const job = await syncJobFromQuote(supabase, jobId, status, {
    estimated_total: quoteTotal,
    deposit_paid: depositPaid
  });

  if (job) await syncCustomerFromJob(supabase, job);
  await upsertSoldQuoteContract(supabase, data as CrmQuote, job);

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: data.id,
    action: "create",
    after: data,
    metadata: {
      jobId
    }
  });

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

  // A quote with line items is priced by the engine (recalcQuoteTotals is the
  // authority). The legacy ledger endpoint must NOT overwrite those
  // server-computed customer-facing totals with a client-supplied number — that
  // would let an unvalidated price reach the contract and bookkeeping. (Manual
  // ledger quotes with no line items still accept a typed-in total.)
  const { count: lineItemCount } = await supabase
    .from("crm_quote_line_items")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", id);
  const builderManaged = (lineItemCount ?? 0) > 0;
  const serverPricedFields = new Set(["quote_total", "discount", "tax", "deposit_required", "balance_due"]);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  const hasRemakeAmount = hasPayloadKey(payload, "remake_amount");

  for (const [key, value] of Object.entries(payload)) {
    if (!allowedQuotePatchFields.has(key)) continue;
    if (builderManaged && serverPricedFields.has(key)) continue; // server-authoritative
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
    if ((payload.status === "sold" || payload.status === "approved") && !patch.signed_at) patch.signed_at = now;
    if (payload.status === "approved" && !patch.approved_at) patch.approved_at = now;
    if (payload.status === "ordered" && !patch.ordered_at) patch.ordered_at = now;
    if (payload.status === "received" && !patch.received_at) patch.received_at = now;
    if (payload.status === "installed" && !patch.installed_at) patch.installed_at = now;
    if (payload.status === "archived" && !patch.archived_at) patch.archived_at = now;
  }

  const hasEntryOnlyBookkeepingPatch = [
    "bookkeeping_notes",
    "installation_invoice_amount",
    "installation_complete",
    "ken_cut_override",
    "remake_amount"
  ].some((key) => Object.prototype.hasOwnProperty.call(payload, key));
  const hasPaymentPatch = toMoney(payload.payment_amount) > 0;

  if (!Object.keys(patch).length && !hasEntryOnlyBookkeepingPatch && !hasPaymentPatch) {
    throw new CrmAuthError(400, "No supported quote fields provided.");
  }

  let quote = existing as CrmQuote;
  if (Object.keys(patch).length) {
    patch.meta = {
      ...(existing.meta || {}),
      ...(typeof payload.meta === "object" && payload.meta ? payload.meta : {}),
      lastUpdatedBy: actor.email,
      lastUpdatedAt: now
    };

    const result = await supabase.from("crm_quotes").update(patch).eq("id", id).select("*").single();
    if (result.error || !result.data) throw new CrmAuthError(502, "Quote could not be updated.");
    quote = result.data as CrmQuote;
  }

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

  // Don't materialize a ledger entry for an unsold draft/sent quote (matches the
  // create path and the builder, which only create the entry once sold).
  const maintainEntry = quote.status !== "draft" && quote.status !== "sent";
  const entryRecord = {
      quote_id: id,
      job_id: quote.job_id,
      source: "crm_quote",
      customer_name: optionalText(payload.customer_name) || "Linked job",
      sold_date: quote.sold_at ? String(quote.sold_at).slice(0, 10) : null,
      total_amount: toMoney(quote.quote_total),
      payment_type: paymentType,
      cogs_amount: toMoney(quote.materials_cost),
      sales_owner: normalizeOwner(quote.sold_by),
      sales_owner_set_at: quote.sold_by ? now : null,
      manufacturer_name: quote.manufacturer_name || null,
      manufacturer_order_ref: quote.manufacturer_order_ref || null,
      manufacturer_order_url: quote.manufacturer_order_url || null,
      manufacturer_document_url: quote.manufacturer_document_url || null,
      // Entry-only fields (no column on crm_quotes) editable from the ledger.
      // Only written when the caller sends them, so a plain quote update leaves
      // them untouched (upsert updates only the columns present in this object).
      ...(payload.bookkeeping_notes !== undefined ? { notes: optionalText(payload.bookkeeping_notes) } : {}),
      ...(payload.installation_invoice_amount !== undefined
        ? { installation_invoice_amount: toMoney(payload.installation_invoice_amount) }
        : {}),
      ...(typeof payload.installation_complete === "boolean"
        ? {
            installation_match_status: payload.installation_complete ? "matched" : "unmatched",
            installation_matched_at: payload.installation_complete ? now : null
          }
        : {}),
      ...(payload.ken_cut_override !== undefined
        ? {
            ken_cut_override:
              payload.ken_cut_override === "" || payload.ken_cut_override === null
                ? null
                : Math.max(Number(payload.ken_cut_override) || 0, 0)
          }
        : {}),
      meta: { lastUpdatedBy: actor.email }
  };

  if (maintainEntry) {
    const { error: entryError } = await supabase
      .from("crm_quote_bookkeeping_entries")
      .upsert(entryRecord, { onConflict: "quote_id" });
    if (entryError) throw new CrmAuthError(502, "Quote was updated, but bookkeeping failed to update.");
  }

  if (hasRemakeAmount) {
    await syncRemakeExpense(
      supabase,
      {
        quoteId: id,
        jobId: quote.job_id,
        source: "crm_quote",
        actorEmail: actor.email,
        incurredOn: quote.sold_at ? String(quote.sold_at).slice(0, 10) : null
      },
      payload.remake_amount
    );
  }

  // Forward-only job projection: never downgrade a sold/ordered/installed job
  // because someone edited the quote (lost is the one allowed override).
  const job = await syncJobFromQuote(supabase, String(quote.job_id), String(quote.status || payload.status), {
    estimated_total: toMoney(quote.quote_total),
    deposit_paid: toMoney(quote.deposit_required)
  });

  if (job) await syncCustomerFromJob(supabase, job);
  await upsertSoldQuoteContract(supabase, quote as CrmQuote, job);

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: id,
    action: "update",
    before: existing,
    after: quote
  });

  return quote as CrmQuote;
}

export async function deleteCrmLedgerRow(
  supabase: CrmSupabaseClient,
  id: string,
  actor: CrmActor
) {
  // SURGICAL, single-row ledger tombstone. This hides ONLY the bookkeeping
  // ledger row and deliberately keeps the parent job/quote intact. A physical
  // delete lets imported rows or linked quote rows reappear on refresh.
  const deletedAt = new Date().toISOString();
  const tombstone = {
    bookkeeping_deleted_at: deletedAt,
    bookkeeping_deleted_by: actor.email,
    bookkeeping_deleted_by_user_id: actor.userId || null,
    bookkeeping_delete_source: "ledger_row_delete"
  };
  const { data: existing, error: entryReadError } = await supabase
    .from("crm_quote_bookkeeping_entries")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (entryReadError) throw new CrmAuthError(502, "Row could not be checked before hiding.");

  if (existing) {
    const after = {
      ...existing,
      meta: {
        ...objectMeta((existing as CrmBookkeepingEntry).meta),
        ...tombstone
      }
    };
    const { error } = await supabase
      .from("crm_quote_bookkeeping_entries")
      .update({ meta: after.meta })
      .eq("id", id);
    if (error) throw new CrmAuthError(502, "Row could not be hidden.");

    await recordCrmActivity(supabase, actor, {
      entityType: "bookkeeping_entry",
      entityId: id,
      action: "delete",
      before: existing,
      after,
      metadata: { source: "ledger_row_delete" }
    });

    return { id };
  }

  const { data: quote, error: quoteReadError } = await supabase
    .from("crm_quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (quoteReadError) throw new CrmAuthError(502, "Quote row could not be checked before hiding.");

  if (!quote) {
    throw new CrmAuthError(
      404,
      "That bookkeeping row could not be found. Refresh the CRM and try again."
    );
  }

  const after = {
    ...(quote as CrmQuote),
    meta: {
      ...objectMeta((quote as CrmQuote).meta),
      ...tombstone
    }
  };
  const { error } = await supabase.from("crm_quotes").update({ meta: after.meta }).eq("id", id);
  if (error) throw new CrmAuthError(502, "Quote row could not be hidden from bookkeeping.");

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: id,
    action: "delete",
    before: quote,
    after,
    metadata: { source: "ledger_row_delete" }
  });

  return { id };
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
      sales_owner: normalizeOwner(payload.sales_owner),
      sales_owner_auth_user_id: normalizeOwner(payload.sales_owner) ? actor.userId || null : null,
      sales_owner_set_at: normalizeOwner(payload.sales_owner) ? now : null,
      installation_invoice_amount: toMoney(payload.installation_invoice_amount),
      installation_invoice_number: optionalText(payload.installation_invoice_number),
      installation_invoice_url: optionalText(payload.installation_invoice_url),
      installation_match_status: payload.installation_complete ? "matched" : "unmatched",
      installation_matched_at: payload.installation_complete ? now : null,
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

  if (hasPayloadKey(payload, "remake_amount")) {
    await syncRemakeExpense(
      supabase,
      {
        bookkeepingEntryId: entry.id,
        source,
        actorEmail: actor.email,
        incurredOn: entry.sold_date
      },
      payload.remake_amount
    );
  }

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
  const hasRemakeAmount = hasPayloadKey(payload, "remake_amount");

  for (const [key, value] of Object.entries(payload)) {
    if (!allowedEntryPatchFields.has(key)) continue;
    if (key === "payment_type") {
      patch.payment_type = normalizePaymentType(optionalText(value));
    } else if (key === "sales_owner") {
      patch.sales_owner = normalizeOwner(value);
      patch.sales_owner_set_at = now;
    } else if (["total_amount", "cogs_amount", "installation_invoice_amount"].includes(key)) {
      patch[key] = toMoney(value);
    } else if (key === "ken_cut_override") {
      // null/blank reverts to the default rule; a number pins it (0 waives).
      patch.ken_cut_override =
        value === "" || value === null || value === undefined ? null : Math.max(Number(value) || 0, 0);
    } else {
      patch[key] = value === "" ? null : value;
    }
  }

  if (typeof payload.installation_complete === "boolean") {
    patch.installation_match_status = payload.installation_complete ? "matched" : "unmatched";
    patch.installation_matched_at = payload.installation_complete ? now : null;
  }

  if (!Object.keys(patch).length && !toMoney(payload.payment_amount) && !hasRemakeAmount) {
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

  if (hasRemakeAmount) {
    await syncRemakeExpense(
      supabase,
      {
        bookkeepingEntryId: id,
        source: entry.source === "legacy_sheet" ? "legacy_sheet" : "manual",
        actorEmail: actor.email,
        incurredOn: entry.sold_date
      },
      payload.remake_amount
    );
  }

  await syncCustomerFromBookkeepingEntry(supabase, entry);
  await recordCrmActivity(supabase, actor, {
    entityType: "bookkeeping_entry",
    entityId: id,
    action: "update",
    before: existing,
    after: entry
  });

  return entry as CrmBookkeepingEntry;
}

const allowedSettingKeys = new Set(["payoff_target", "ken_opening_balance"]);

export async function createKenPayment(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  assertMikePaymentAdmin(actor);

  const amount = toMoney(payload.amount);
  if (amount <= 0) throw new CrmAuthError(400, "Ken payment amount must be greater than zero.");

  const record = {
    paid_on: payload.paid_on || new Date().toISOString().slice(0, 10),
    period_month: payload.period_month || null,
    amount,
    note: optionalText(payload.note),
    created_by_email: actor.email,
    meta: { createdBy: actor.email }
  };

  const { data, error } = await supabase.from("crm_ken_payments").insert(record).select("*").single();
  if (error || !data) throw new CrmAuthError(502, "Ken payment could not be saved.");

  await recordCrmActivity(supabase, actor, {
    entityType: "ken_payment",
    entityId: data.id,
    action: "create",
    after: data
  });

  return data as CrmKenPayment;
}

export async function deleteKenPayment(supabase: CrmSupabaseClient, id: string, actor: CrmActor) {
  assertMikePaymentAdmin(actor);

  const { data: existing, error: existingError } = await supabase
    .from("crm_ken_payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Ken payment was not found.");

  const { error } = await supabase.from("crm_ken_payments").delete().eq("id", id);
  if (error) throw new CrmAuthError(502, "Ken payment could not be deleted.");

  await recordCrmActivity(supabase, actor, {
    entityType: "ken_payment",
    entityId: id,
    action: "delete",
    before: existing
  });

  return { id };
}

export async function updateKenPayment(
  supabase: CrmSupabaseClient,
  id: string,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  assertMikePaymentAdmin(actor);

  const { data: existing, error: existingError } = await supabase
    .from("crm_ken_payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Ken payment was not found.");

  const patch: Record<string, unknown> = {};
  if (payload.amount !== undefined) {
    const amount = toMoney(payload.amount);
    if (amount <= 0) throw new CrmAuthError(400, "Ken payment amount must be greater than zero.");
    patch.amount = amount;
  }
  if (payload.paid_on !== undefined) patch.paid_on = payload.paid_on || null;
  if (payload.period_month !== undefined) patch.period_month = payload.period_month || null;
  if (payload.note !== undefined) patch.note = optionalText(payload.note);

  if (!Object.keys(patch).length) {
    throw new CrmAuthError(400, "No supported Ken payment fields provided.");
  }

  const { data, error } = await supabase
    .from("crm_ken_payments")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new CrmAuthError(502, "Ken payment could not be updated.");

  await recordCrmActivity(supabase, actor, {
    entityType: "ken_payment",
    entityId: id,
    action: "update",
    before: existing,
    after: data
  });

  return data as CrmKenPayment;
}

function normalizeCommissionRecipient(value: unknown) {
  const recipient = normalizeOwner(value);
  if (recipient === "mike" || recipient === "jessica") return recipient;
  throw new CrmAuthError(400, "Commission recipient must be Mike or Jessica.");
}

function normalizePaymentPerson(value: unknown): CrmPaymentPerson {
  const lower = String(value || "").trim().toLowerCase();
  if (lower === "ken") return "ken";
  const recipient = normalizeOwner(value);
  if (recipient === "mike" || recipient === "jessica") return recipient;
  throw new CrmAuthError(400, "Payment person must be Ken, Mike, or Jessica.");
}

function monthStartDate(value: string | null | undefined) {
  const date = optionalText(value) || new Date().toISOString().slice(0, 10);
  const time = Date.parse(date);
  if (!Number.isFinite(time)) return new Date().toISOString().slice(0, 7) + "-01";
  return new Date(time).toISOString().slice(0, 7) + "-01";
}

function selectedPaymentItemKeys(payload: Record<string, unknown>) {
  const raw = payload.item_ids ?? payload.itemIds ?? payload.selected_item_ids ?? payload.selectedItemIds;
  if (!Array.isArray(raw)) return null;
  const keys = raw.map((value) => String(value || "").trim()).filter(Boolean);
  return keys.length ? new Set(keys) : null;
}

function comparePartnerItems(left: CrmPartnerPaymentLedgerItem, right: CrmPartnerPaymentLedgerItem) {
  const closed = (left.closedAt || "").localeCompare(right.closedAt || "");
  if (closed) return closed;
  const customer = left.customerName.localeCompare(right.customerName);
  if (customer) return customer;
  return left.itemKey.localeCompare(right.itemKey);
}

function paymentAllocationRows({
  person,
  paymentId,
  items,
  amount,
  actor
}: {
  person: CrmPaymentPerson;
  paymentId: string;
  items: CrmPartnerPaymentLedgerItem[];
  amount: number;
  actor: CrmActor;
}) {
  let remaining = toMoney(amount);
  const allocations: Array<Record<string, unknown>> = [];

  for (const item of [...items].sort(comparePartnerItems)) {
    if (remaining <= 0) break;
    const allocationAmount = Math.round(Math.min(item.remainingAmount, remaining) * 100) / 100;
    if (allocationAmount <= 0) continue;
    remaining = Math.round((remaining - allocationAmount) * 100) / 100;
    allocations.push({
      ...(person === "ken" ? {} : { recipient: person }),
      payment_id: paymentId,
      source: item.source,
      quote_id: item.quoteId,
      bookkeeping_entry_id: item.bookkeepingEntryId,
      job_id: item.jobId,
      item_key: item.itemKey,
      customer_name: item.customerName,
      closed_at: item.closedAt ? item.closedAt.slice(0, 10) : null,
      amount: allocationAmount,
      period_month: item.periodMonth,
      meta: {
        createdBy: actor.email,
        person,
        sourceStatus: item.sourceStatus,
        salesOwner: item.salesOwner,
        quoteNumber: item.quoteNumber,
        total: item.total
      }
    });
  }

  return allocations;
}

function paymentAllocationMetadata(allocations: Array<Record<string, unknown>>) {
  return allocations.map((allocation) => ({
    person: allocation.meta && typeof allocation.meta === "object" ? (allocation.meta as Record<string, unknown>).person : undefined,
    source: allocation.source,
    quote_id: allocation.quote_id,
    bookkeeping_entry_id: allocation.bookkeeping_entry_id,
    job_id: allocation.job_id,
    item_key: allocation.item_key,
    customer_name: allocation.customer_name,
    closed_at: allocation.closed_at,
    amount: allocation.amount,
    period_month: allocation.period_month,
    meta: allocation.meta
  }));
}

function isMissingPartnerPaymentRpc(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message || "";
  return (
    error?.code === "PGRST202" ||
    error?.code === "42883" ||
    message.includes("Could not find the function") ||
    message.includes("function public.crm_create_")
  );
}

function isMissingPartnerAllocationTable(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message || "";
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes("Could not find the table") ||
    message.includes("Could not find the relation") ||
    message.includes("does not exist")
  );
}

async function createPartnerPaymentBatchDirect(
  supabase: CrmSupabaseClient,
  person: CrmPaymentPerson,
  record: Record<string, unknown>,
  allocations: Array<Record<string, unknown>>
) {
  const table = person === "ken" ? "crm_ken_payments" : "crm_commission_payments";
  const allocationTable = person === "ken" ? "crm_ken_payment_allocations" : "crm_commission_payment_allocations";
  const paymentRecord = person === "ken" ? record : { recipient: person, ...record };
  const { data: payment, error: paymentError } = await supabase.from(table).insert(paymentRecord).select("*").single();
  if (paymentError || !payment) throw new CrmAuthError(502, `${paymentPersonLabel(person)} payment could not be saved.`);

  const allocationRows = allocations.map((allocation) => ({
    ...allocation,
    payment_id: String(payment.id)
  }));
  const { error: allocationError } = await supabase.from(allocationTable).insert(allocationRows);
  if (allocationError && !isMissingPartnerAllocationTable(allocationError)) {
    throw new CrmAuthError(502, `${paymentPersonLabel(person)} payment was saved, but job allocation failed.`);
  }
  if (allocationError) {
    console.warn(`${paymentPersonLabel(person)} payment allocation table was unavailable; using payment metadata fallback.`, allocationError.message);
  }

  return payment;
}

export async function createPartnerPaymentBatch(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  assertMikePaymentAdmin(actor);

  const person = normalizePaymentPerson(payload.person);
  const dashboard = await loadCrmDashboardData(supabase);
  const selectedKeys = selectedPaymentItemKeys(payload);
  const activeItems = dashboard.partnerPaymentLedger.people[person].activeItems;
  const selectedItems = selectedKeys
    ? activeItems.filter((item) => selectedKeys.has(item.itemKey) || selectedKeys.has(item.id))
    : activeItems;

  if (!selectedItems.length) {
    throw new CrmAuthError(400, `${paymentPersonLabel(person)} has no active unpaid jobs to pay.`);
  }

  const payableAmount = Math.round(selectedItems.reduce((sum, item) => sum + item.remainingAmount, 0) * 100) / 100;
  const amount = resolveFullPartnerPaymentAmount(payload.amount, payableAmount);
  const paidOn = optionalText(payload.paid_on) || selectedItems[0]?.closedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const periodMonth = optionalText(payload.period_month) || monthStartDate(paidOn);
  const note = optionalText(payload.note);
  const allocations = paymentAllocationRows({
    person,
    paymentId: "00000000-0000-0000-0000-000000000000",
    items: selectedItems,
    amount,
    actor
  });

  if (!allocations.length) {
    throw new CrmAuthError(400, "No payable allocation rows were created.");
  }

  const meta = {
    createdBy: actor.email,
    batchSource: "unified_payment_ledger",
    selectedItemCount: selectedItems.length,
    selectedItemKeys: selectedItems.map((item) => item.itemKey),
    selectedItemAllocations: paymentAllocationMetadata(allocations)
  };
  const paymentRecord = {
    paid_on: paidOn,
    period_month: periodMonth,
    amount,
    note,
    created_by_email: actor.email,
    meta
  };
  const rpcName = person === "ken" ? "crm_create_ken_payment_batch" : "crm_create_commission_payment_batch";
  const rpcPayload =
    person === "ken"
      ? {
          p_paid_on: paidOn,
          p_period_month: periodMonth,
          p_amount: amount,
          p_note: note,
          p_created_by_email: actor.email,
          p_meta: meta,
          p_allocations: allocations
        }
      : {
          p_recipient: person,
          p_paid_on: paidOn,
          p_period_month: periodMonth,
          p_amount: amount,
          p_note: note,
          p_created_by_email: actor.email,
          p_meta: meta,
          p_allocations: allocations
        };

  const { data: paymentId, error: rpcError } = await supabase.rpc(rpcName, rpcPayload);
  let payment: Record<string, unknown>;
  if (rpcError || !paymentId) {
    if (!isMissingPartnerPaymentRpc(rpcError) && !isMissingPartnerAllocationTable(rpcError)) {
      throw new CrmAuthError(502, `${paymentPersonLabel(person)} payment could not be allocated to jobs.`);
    }
    payment = await createPartnerPaymentBatchDirect(supabase, person, paymentRecord, allocations);
  } else {
    const table = person === "ken" ? "crm_ken_payments" : "crm_commission_payments";
    const { data: rpcPayment, error: paymentError } = await supabase
      .from(table)
      .select("*")
      .eq("id", String(paymentId))
      .single();
    if (paymentError || !rpcPayment) throw new CrmAuthError(502, `${paymentPersonLabel(person)} payment could not be loaded after save.`);
    payment = rpcPayment;
  }

  await recordCrmActivity(supabase, actor, {
    entityType: person === "ken" ? "ken_payment" : "commission_payment",
    entityId: String(payment.id),
    action: "create_batch",
    after: payment,
    metadata: {
      person,
      allocationCount: allocations.length,
      allocatedAmount: amount
    }
  });

  return {
    payment,
    allocations,
    dashboard: await loadCrmDashboardData(supabase)
  };
}

export async function createCommissionPayment(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  assertMikePaymentAdmin(actor);

  const amount = toMoney(payload.amount);
  if (amount <= 0) throw new CrmAuthError(400, "Commission payment amount must be greater than zero.");

  const record = {
    recipient: normalizeCommissionRecipient(payload.recipient),
    paid_on: payload.paid_on || new Date().toISOString().slice(0, 10),
    period_month: payload.period_month || null,
    amount,
    note: optionalText(payload.note),
    created_by_email: actor.email,
    meta: { createdBy: actor.email }
  };

  const { data, error } = await supabase.from("crm_commission_payments").insert(record).select("*").single();
  if (error || !data) throw new CrmAuthError(502, "Commission payment could not be saved.");

  await recordCrmActivity(supabase, actor, {
    entityType: "commission_payment",
    entityId: data.id,
    action: "create",
    after: data
  });

  return data as CrmCommissionPayment;
}

export async function deleteCommissionPayment(supabase: CrmSupabaseClient, id: string, actor: CrmActor) {
  assertMikePaymentAdmin(actor);

  const { data: existing, error: existingError } = await supabase
    .from("crm_commission_payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Commission payment was not found.");

  const { error } = await supabase.from("crm_commission_payments").delete().eq("id", id);
  if (error) throw new CrmAuthError(502, "Commission payment could not be deleted.");

  await recordCrmActivity(supabase, actor, {
    entityType: "commission_payment",
    entityId: id,
    action: "delete",
    before: existing
  });

  return { id };
}

export async function updateCommissionPayment(
  supabase: CrmSupabaseClient,
  id: string,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  assertMikePaymentAdmin(actor);

  const { data: existing, error: existingError } = await supabase
    .from("crm_commission_payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Commission payment was not found.");

  const patch: Record<string, unknown> = {};
  if (payload.recipient !== undefined) patch.recipient = normalizeCommissionRecipient(payload.recipient);
  if (payload.amount !== undefined) {
    const amount = toMoney(payload.amount);
    if (amount <= 0) throw new CrmAuthError(400, "Commission payment amount must be greater than zero.");
    patch.amount = amount;
  }
  if (payload.paid_on !== undefined) patch.paid_on = payload.paid_on || null;
  if (payload.period_month !== undefined) patch.period_month = payload.period_month || null;
  if (payload.note !== undefined) patch.note = optionalText(payload.note);

  if (!Object.keys(patch).length) {
    throw new CrmAuthError(400, "No supported commission payment fields provided.");
  }

  const { data, error } = await supabase
    .from("crm_commission_payments")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new CrmAuthError(502, "Commission payment could not be updated.");

  await recordCrmActivity(supabase, actor, {
    entityType: "commission_payment",
    entityId: id,
    action: "update",
    before: existing,
    after: data
  });

  return data as CrmCommissionPayment;
}

export async function updateCrmSettings(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const updates: Array<{ key: string; value: number }> = [];
  for (const key of allowedSettingKeys) {
    if (payload[key] === undefined) continue;
    updates.push({ key, value: toMoney(payload[key]) });
  }
  if (!updates.length) throw new CrmAuthError(400, "No supported settings provided.");

  const { error } = await supabase
    .from("crm_settings")
    .upsert(
      updates.map((row) => ({ ...row, updated_at: new Date().toISOString() })),
      { onConflict: "key" }
    );
  if (error) throw new CrmAuthError(502, "Settings could not be saved.");

  const result = Object.fromEntries(updates.map((row) => [row.key, row.value]));
  await recordCrmActivity(supabase, actor, {
    entityType: "settings",
    action: "update",
    after: result
  });

  return result;
}
