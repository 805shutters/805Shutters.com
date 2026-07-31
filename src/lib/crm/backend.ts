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
import { getMeasureNeededMeta } from "@/lib/crm/measure-needed-state";
import {
  buildPartnerPaymentLedger,
  buildUnpaidPartnerPaymentItemForRow,
  paymentPersonLabel
} from "@/lib/crm/partner-payments";
import {
  partnerPaymentReceiptAllocationFromRow,
  sendPartnerPaymentReceiptEmail
} from "@/lib/crm/partner-payment-receipts";
import { CrmAuthError } from "@/lib/crm/auth";
import { maybeSendCustomerCloseoutForQuote } from "@/lib/crm/customer-closeout";
import { hydrateLeadSource, isMissingLeadSourceColumnError, withLeadSourceMeta } from "@/lib/lead-source";
import { isMikePaymentAdminEmail } from "@/lib/crm/allowed-users";
import { sendCalendarAssignmentSms } from "@/lib/crm/calendar-notifications";
import {
  deleteSyncedGoogleCalendarEvents,
  GoogleCalendarDeleteResult,
  GoogleCalendarSyncResult,
  syncAppointmentToGoogleCalendars
} from "@/lib/google/calendar";
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
  CrmOrderCogsEmailStatus,
  CrmPartnerPaymentLedgerItem,
  CrmPaymentPerson,
  CrmQuote,
  CrmQuoteStatus,
  CrmVendorOrderTask,
  crmJobStatuses,
  crmQuoteStatuses
} from "@/lib/crm/types";
import { advanceJobStatus, jobStatusForQuote } from "@/lib/quote/lifecycle";
import { computeQuoteMoney, parseAdjustments } from "@/lib/crm/quote-money";

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
  "lead_source",
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
  "installation_invoice_paid_at",
  "installation_invoice_paid_amount",
  "installation_invoice_payment_method",
  "installation_invoice_payment_notes",
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

const allowedInstallationInvoiceEmailPatchFields = new Set([
  "installation_invoice_paid_at",
  "installation_invoice_paid_amount",
  "installation_invoice_payment_method",
  "installation_invoice_payment_notes"
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

type BalanceAdjustmentResult = {
  direction: "credit_in" | "credit_out";
  amount: number;
  previousBalance: number;
  targetBalance: number;
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

function roundMoney(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function sumAmounts(rows: Array<{ amount?: unknown }>) {
  return roundMoney(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));
}

function adjustmentMoney(value: number) {
  return `$${roundMoney(value).toFixed(2)}`;
}

async function recordBalanceAdjustmentCredit(
  supabase: CrmSupabaseClient,
  target:
    | { kind: "quote"; quote: CrmQuote }
    | { kind: "entry"; entry: CrmBookkeepingEntry },
  payload: Record<string, unknown>,
  actor: CrmActor
): Promise<BalanceAdjustmentResult | null> {
  if (!hasPayloadKey(payload, "balance_due_target")) return null;

  const targetBalance = toMoney(payload.balance_due_target);
  const isQuote = target.kind === "quote";
  const targetId = isQuote ? target.quote.id : target.entry.id;
  const paymentKey = isQuote ? "quote_id" : "bookkeeping_entry_id";
  const creditInKey = isQuote ? "to_quote_id" : "to_bookkeeping_entry_id";
  const creditOutKey = isQuote ? "from_quote_id" : "from_bookkeeping_entry_id";

  const [paymentsResult, creditsInResult, creditsOutResult] = await Promise.all([
    supabase.from("crm_quote_bookkeeping_payments").select("amount").eq(paymentKey, targetId),
    supabase.from("crm_quote_bookkeeping_credits").select("amount").eq(creditInKey, targetId),
    supabase.from("crm_quote_bookkeeping_credits").select("amount").eq(creditOutKey, targetId)
  ]);

  if (paymentsResult.error || creditsInResult.error || creditsOutResult.error) {
    throw new CrmAuthError(502, "Balance adjustment could not read the current ledger.");
  }

  const paidTotal = sumAmounts((paymentsResult.data || []) as Array<{ amount?: unknown }>);
  const creditIn = sumAmounts((creditsInResult.data || []) as Array<{ amount?: unknown }>);
  const creditOut = sumAmounts((creditsOutResult.data || []) as Array<{ amount?: unknown }>);
  const total = isQuote ? toMoney(target.quote.quote_total) : toMoney(target.entry.total_amount);
  const previousBalance = roundMoney(total - (paidTotal + creditIn - creditOut));
  const delta = roundMoney(targetBalance - previousBalance);

  if (Math.abs(delta) < 0.01) return null;

  const amount = Math.abs(delta);
  const direction: BalanceAdjustmentResult["direction"] = delta < 0 ? "credit_in" : "credit_out";
  const note =
    optionalText(payload.balance_adjustment_note) ||
    `Balance adjusted from ${adjustmentMoney(previousBalance)} to ${adjustmentMoney(targetBalance)}`;
  const record = {
    amount,
    credit_date: optionalText(payload.balance_adjustment_date) || new Date().toISOString().slice(0, 10),
    note,
    [direction === "credit_in" ? creditInKey : creditOutKey]: targetId,
    meta: {
      createdBy: actor.email,
      createdAt: new Date().toISOString(),
      balanceAdjustment: true,
      previousBalance,
      targetBalance
    }
  };

  const { error } = await supabase.from("crm_quote_bookkeeping_credits").insert(record);
  if (error) throw new CrmAuthError(502, "Balance adjustment could not be saved.");

  return { direction, amount, previousBalance, targetBalance };
}

type PaymentTargetAdjustmentResult = {
  kind: "deposit_paid" | "balance_paid";
  amount: number;
  previousAmount: number;
  targetAmount: number;
};

async function recordPaymentTargetAdjustments(
  supabase: CrmSupabaseClient,
  target:
    | { kind: "quote"; quote: CrmQuote }
    | { kind: "entry"; entry: CrmBookkeepingEntry },
  payload: Record<string, unknown>,
  actor: CrmActor
): Promise<PaymentTargetAdjustmentResult[]> {
  const requestedTargets = [
    { payloadKey: "deposit_paid_target", kind: "deposit_paid" as const, label: "Deposit adjustment" },
    { payloadKey: "balance_paid_target", kind: "balance_paid" as const, label: "Balance payment adjustment" }
  ].filter((item) => hasPayloadKey(payload, item.payloadKey));

  if (!requestedTargets.length) return [];

  const isQuote = target.kind === "quote";
  const targetId = isQuote ? target.quote.id : target.entry.id;
  const paymentKey = isQuote ? "quote_id" : "bookkeeping_entry_id";
  const { data, error } = await supabase
    .from("crm_quote_bookkeeping_payments")
    .select("payment_label,amount")
    .eq(paymentKey, targetId);

  if (error) throw new CrmAuthError(502, "Payment adjustment could not read the current ledger.");

  const payments = (data || []) as Array<{ payment_label?: unknown; amount?: unknown }>;
  const currentDepositPaid = sumAmounts(
    payments.filter((payment) => String(payment.payment_label || "").toLowerCase().includes("deposit"))
  );
  const currentBalancePaid = sumAmounts(
    payments.filter((payment) => !String(payment.payment_label || "").toLowerCase().includes("deposit"))
  );
  const paymentType =
    normalizePaymentType(optionalText(payload.payment_type)) ||
    (target.kind === "entry" ? target.entry.payment_type : null) ||
    "other";
  const paidAt = optionalText(payload.paid_at) || new Date().toISOString().slice(0, 10);
  const source = isQuote ? "crm_quote" : target.entry.source === "legacy_sheet" ? "legacy_sheet" : "manual";
  const records: Record<string, unknown>[] = [];
  const adjustments: PaymentTargetAdjustmentResult[] = [];

  for (const requested of requestedTargets) {
    const targetAmount = toMoney(payload[requested.payloadKey]);
    const previousAmount = requested.kind === "deposit_paid" ? currentDepositPaid : currentBalancePaid;
    const amount = roundMoney(targetAmount - previousAmount);
    if (Math.abs(amount) < 0.01) continue;

    adjustments.push({ kind: requested.kind, amount, previousAmount, targetAmount });
    records.push({
      [paymentKey]: targetId,
      job_id: isQuote ? target.quote.job_id : target.entry.job_id,
      payment_label: requested.label,
      payment_type: paymentType,
      amount,
      paid_at: paidAt,
      source,
      notes:
        optionalText(payload.payment_notes) ||
        `Set ${requested.kind === "deposit_paid" ? "deposit paid" : "balance paid"} from ${adjustmentMoney(previousAmount)} to ${adjustmentMoney(targetAmount)}`,
      meta: {
        createdBy: actor.email,
        createdAt: new Date().toISOString(),
        paymentTargetAdjustment: true,
        adjustmentKind: requested.kind,
        previousAmount,
        targetAmount
      }
    });
  }

  if (!records.length) return [];

  const { error: insertError } = await supabase.from("crm_quote_bookkeeping_payments").insert(records);
  if (insertError) throw new CrmAuthError(502, "Payment adjustment could not be saved.");

  return adjustments;
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

export function resolvePartnerPaymentAdvanceOffset(
  person: CrmPaymentPerson,
  grossPayableAmount: number,
  advanceBalance: number
) {
  if (person !== "jessica" && person !== "mike") return 0;
  return Math.round(Math.min(Math.max(grossPayableAmount, 0), Math.max(advanceBalance, 0)) * 100) / 100;
}

function optionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function resolveQuoteBookkeepingCustomerName(input: {
  payloadCustomerName?: unknown;
  quoteCustomerName?: unknown;
  existingEntryCustomerName?: unknown;
  jobCustomerName?: unknown;
}) {
  const payloadName = optionalText(input.payloadCustomerName);
  if (payloadName) return payloadName;

  const existingName = optionalText(input.existingEntryCustomerName);
  if (existingName && existingName !== "Linked job") return existingName;

  const quoteName = optionalText(input.quoteCustomerName);
  if (quoteName) return quoteName;

  const jobName = optionalText(input.jobCustomerName);
  if (jobName) return jobName;

  return existingName || "Linked job";
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

function hasDeleteTombstone(value: unknown) {
  return Boolean(objectMeta(value).deleted_at);
}

function uniqueTextValues(values: Array<unknown>) {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    )
  );
}

function payloadStringArray(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return Array.isArray(value) ? uniqueTextValues(value) : [];
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

function jsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

const orderCogsEmailStatuses: CrmOrderCogsEmailStatus[] = ["matched", "needs_review", "unmatched", "skipped", "error"];

function orderCogsEmailStatus(value: unknown): CrmOrderCogsEmailStatus {
  const status = nullableText(value);
  return orderCogsEmailStatuses.includes(status as CrmOrderCogsEmailStatus)
    ? (status as CrmOrderCogsEmailStatus)
    : "needs_review";
}

function orderCogsEmailFromActivity(row: Record<string, unknown>): CrmOrderCogsEmail | null {
  const metadata = jsonRecord(row.metadata);
  const afterData = jsonRecord(row.after_data);
  const source = Object.keys(jsonRecord(metadata.orderCogsEmail)).length
    ? jsonRecord(metadata.orderCogsEmail)
    : afterData;
  const createdAt = nullableText(row.created_at) || new Date().toISOString();
  const gmailMessageId = nullableText(source.gmail_message_id);

  if (!gmailMessageId) return null;

  return {
    id: nullableText(row.id) || `activity:${gmailMessageId}`,
    created_at: createdAt,
    updated_at: createdAt,
    mailbox_email: nullableText(source.mailbox_email) || "805shutters@gmail.com",
    gmail_message_id: gmailMessageId,
    gmail_thread_id: nullableText(source.gmail_thread_id),
    gmail_history_id: nullableText(source.gmail_history_id),
    from_email: nullableText(source.from_email),
    to_email: nullableText(source.to_email),
    subject: nullableText(source.subject),
    sent_at: nullableText(source.sent_at),
    snippet: nullableText(source.snippet),
    attachment_names: Array.isArray(source.attachment_names)
      ? source.attachment_names.map((item) => String(item || "")).filter(Boolean)
      : [],
    email_url: nullableText(source.email_url),
    extracted_customer_name: nullableText(source.extracted_customer_name),
    extracted_order_amount: nullableMoney(source.extracted_order_amount),
    extracted_order_number: nullableText(source.extracted_order_number),
    extraction_confidence: Number(source.extraction_confidence) || 0,
    matched_job_id: nullableText(source.matched_job_id),
    matched_quote_id: nullableText(source.matched_quote_id),
    matched_bookkeeping_entry_id: nullableText(source.matched_bookkeeping_entry_id),
    match_status: orderCogsEmailStatus(source.match_status),
    match_confidence: Number(source.match_confidence) || 0,
    match_reason: nullableText(source.match_reason) || nullableText(metadata.auditError),
    processed_at: nullableText(source.processed_at),
    applied_at: nullableText(source.applied_at),
    error_message: nullableText(source.error_message),
    raw: {
      ...jsonRecord(source.raw),
      fallbackStore: "crm_activity_events",
      auditError: nullableText(metadata.auditError)
    }
  } satisfies CrmOrderCogsEmail;
}

function mergeOrderCogsEmails(primary: CrmOrderCogsEmail[], fallback: CrmOrderCogsEmail[]) {
  const byMessage = new Map<string, CrmOrderCogsEmail>();
  for (const email of fallback) byMessage.set(email.gmail_message_id, email);
  for (const email of primary) byMessage.set(email.gmail_message_id, email);
  return Array.from(byMessage.values()).sort((left, right) => {
    const leftTime = Date.parse(left.created_at || left.processed_at || "");
    const rightTime = Date.parse(right.created_at || right.processed_at || "");
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
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
      | "bookkeeping_credit"
      | "expense"
      | "calendar_event"
      | "customer"
      | "ken_payment"
      | "commission_payment"
      | "order_cogs_email"
      | "installation_invoice_email"
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

function latestCalendarTimestamp(values: Array<string | null | undefined>) {
  let latestValue: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms) || ms <= latestMs) continue;
    latestMs = ms;
    latestValue = value;
  }

  return latestValue;
}

export function enrichCalendarEventsWithJobDetails(
  events: CrmCalendarEvent[],
  jobs: CrmJob[],
  quotes: CrmQuote[] = [],
  contracts: CrmCustomerContract[] = []
): CrmCalendarEvent[] {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const quotesByJobId = new Map<string, CrmQuote[]>();
  const contractsByJobId = new Map<string, CrmCustomerContract[]>();
  const contractsByQuoteId = new Map<string, CrmCustomerContract[]>();

  for (const quote of quotes) {
    const existing = quotesByJobId.get(quote.job_id) || [];
    existing.push(quote);
    quotesByJobId.set(quote.job_id, existing);
  }

  for (const contract of contracts) {
    if (contract.job_id) {
      const existing = contractsByJobId.get(contract.job_id) || [];
      existing.push(contract);
      contractsByJobId.set(contract.job_id, existing);
    }

    if (contract.quote_id) {
      const existing = contractsByQuoteId.get(contract.quote_id) || [];
      existing.push(contract);
      contractsByQuoteId.set(contract.quote_id, existing);
    }
  }

  return events.map((event) => {
    const job = event.job_id ? jobsById.get(event.job_id) : null;
    if (!job) return event;
    const relatedQuotes = quotesByJobId.get(job.id) || [];
    const relatedQuoteIds = new Set(relatedQuotes.map((quote) => quote.id));
    const relatedContractsById = new Map<string, CrmCustomerContract>();

    for (const contract of contractsByJobId.get(job.id) || []) {
      relatedContractsById.set(contract.id, contract);
    }

    for (const quoteId of relatedQuoteIds) {
      for (const contract of contractsByQuoteId.get(quoteId) || []) {
        relatedContractsById.set(contract.id, contract);
      }
    }

    const relatedContracts = [...relatedContractsById.values()];

    return {
      ...event,
      customer_name: event.customer_name || job.customer_name,
      customer_phone: job.phone,
      customer_email: job.email,
      customer_address: event.location || job.address,
      customer_city: job.city,
      product_interest: job.product_interest,
      customer_notes: event.notes || job.notes,
      job_status: job.status,
      quote_sent_at: latestCalendarTimestamp(relatedQuotes.map((quote) => quote.sent_at)),
      quote_signed_at: latestCalendarTimestamp(relatedQuotes.map((quote) => quote.signed_at)),
      customer_contract_signed_at: latestCalendarTimestamp(relatedContracts.map((contract) => contract.signed_at))
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
  vendorOrderTasks = [],
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
  vendorOrderTasks?: CrmVendorOrderTask[];
  openingBalance: number;
  payoffTarget: number;
  now?: Date | string;
}): CrmDashboardData {
  const contractProjectedQuotes = projectSignedContractsOntoQuotes(quotes, contracts);
  const contractProjectedJobs = projectSignedContractsOntoJobs(jobs, contractProjectedQuotes, contracts);
  const quotesByJob = new Map<string, number>();
  for (const quote of contractProjectedQuotes) {
    quotesByJob.set(quote.job_id, Math.max(quotesByJob.get(quote.job_id) || 0, toMoney(quote.quote_total)));
  }

  const baseBookkeepingRows = buildBookkeepingRows({ quotes: contractProjectedQuotes, entries, payments, credits, expenses });
  const liveJobs = projectLiveJobStatuses(contractProjectedJobs, baseBookkeepingRows);
  const sourceJobStatusById = new Map(jobs.map((job) => [job.id, job.status]));
  const statusBookkeepingRows = projectLiveBookkeepingStatuses(baseBookkeepingRows, liveJobs).map((row) => ({
    ...row,
    jobStatus: row.jobId ? sourceJobStatusById.get(row.jobId) || null : null
  }));
  const liveQuotes = projectLiveQuoteStatuses(contractProjectedQuotes, statusBookkeepingRows);
  const bookkeepingRows = projectBookkeepingRowContacts(statusBookkeepingRows, liveJobs, liveQuotes, customers);
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
  const calendarEvents = enrichCalendarEventsWithJobDetails(events, jobsWithQuotes, liveQuotes, contracts);

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
    vendorOrderTasks,
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

function hasSignedContractSignal(value: { signed_at?: string | null; customer_signature?: string | null }) {
  return Boolean(value.signed_at || value.customer_signature);
}

function isUnsignedQuoteStatus(status: CrmQuoteStatus | CrmBookkeepingStatus | null | undefined) {
  return !status || status === "draft" || status === "sent";
}

function latestSignedAt(current: string | null | undefined, next: string | null | undefined) {
  if (!next) return current || null;
  if (!current) return next;
  return Date.parse(next) > Date.parse(current) ? next : current;
}

function projectSignedContractsOntoQuotes(quotes: CrmQuote[], contracts: CrmCustomerContract[]) {
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
  const quoteByShareToken = new Map(
    quotes
      .filter((quote) => quote.share_token)
      .map((quote) => [quote.share_token as string, quote])
  );
  const quotesByJobId = new Map<string, CrmQuote[]>();
  const signedAtByQuoteId = new Map<string, string>();

  for (const quote of quotes) {
    const existing = quotesByJobId.get(quote.job_id) || [];
    existing.push(quote);
    quotesByJobId.set(quote.job_id, existing);
    if (hasSignedContractSignal(quote)) signedAtByQuoteId.set(quote.id, quote.signed_at || quote.sold_at || quote.created_at);
  }

  for (const contract of contracts) {
    if (!contract.signed_at) continue;

    const quote =
      (contract.quote_id ? quoteById.get(contract.quote_id) : null) ||
      (contract.share_token ? quoteByShareToken.get(contract.share_token) : null) ||
      (contract.job_id && (quotesByJobId.get(contract.job_id) || []).length === 1
        ? (quotesByJobId.get(contract.job_id) || [])[0]
        : null);
    if (!quote) continue;

    signedAtByQuoteId.set(quote.id, latestSignedAt(signedAtByQuoteId.get(quote.id), contract.signed_at) || contract.signed_at);
  }

  return quotes.map((quote) => {
    const signedAt = signedAtByQuoteId.get(quote.id);
    if (!signedAt) return quote;

    const nextStatus = isUnsignedQuoteStatus(quote.status) ? "sold" : quote.status;
    const nextLiveStatus = isUnsignedQuoteStatus(quote.live_status) ? "sold" : quote.live_status;
    if (
      nextStatus === quote.status &&
      nextLiveStatus === quote.live_status &&
      quote.signed_at &&
      quote.sold_at
    ) {
      return quote;
    }

    return {
      ...quote,
      status: nextStatus,
      live_status: nextLiveStatus,
      signed_at: quote.signed_at || signedAt,
      sold_at: quote.sold_at || signedAt
    };
  });
}

function projectSignedContractsOntoJobs(jobs: CrmJob[], quotes: CrmQuote[], contracts: CrmCustomerContract[]) {
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
  const quoteByShareToken = new Map(
    quotes
      .filter((quote) => quote.share_token)
      .map((quote) => [quote.share_token as string, quote])
  );
  const soldJobIds = new Set<string>();

  for (const quote of quotes) {
    if (hasSignedContractSignal(quote)) soldJobIds.add(quote.job_id);
  }

  for (const contract of contracts) {
    if (!contract.signed_at) continue;
    const quote =
      (contract.quote_id ? quoteById.get(contract.quote_id) : null) ||
      (contract.share_token ? quoteByShareToken.get(contract.share_token) : null);
    const jobId = contract.job_id || quote?.job_id || null;
    if (jobId) soldJobIds.add(jobId);
  }

  return jobs.map((job) => {
    if (!soldJobIds.has(job.id)) return job;
    const status = advanceJobStatus(job.status, "sold");
    return status === job.status ? job : { ...job, status };
  });
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

function projectBookkeepingRowContacts(
  rows: CrmBookkeepingRow[],
  jobs: CrmJob[],
  quotes: CrmQuote[],
  customers: CrmCustomer[]
) {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
  const customerByName = new Map(
    customers.map((customer) => [
      normalizeCustomerKey(customer.normalized_name || customer.display_name),
      customer
    ])
  );

  return rows.map((row) => {
    const job = row.jobId ? jobById.get(row.jobId) : null;
    const quote = row.quoteId ? quoteById.get(row.quoteId) : null;
    const customer = customerByName.get(normalizeCustomerKey(row.customerName));
    const customerPhone =
      optionalText(job?.phone) ||
      optionalText(quote?.customer_phone) ||
      optionalText(row.customerPhone) ||
      optionalText(customer?.phone);

    return customerPhone === row.customerPhone ? row : { ...row, customerPhone };
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(optionalText).filter((item): item is string => Boolean(item))
    : [];
}

export function vendorOrderTasksFromRow(value: unknown): CrmVendorOrderTask[] {
  const row = objectMeta(value);
  const meta = objectMeta(row.meta);
  const orders = Array.isArray(meta.vendor_order_preparations)
    ? meta.vendor_order_preparations
    : meta.vendor_order_preparation
      ? [meta.vendor_order_preparation]
      : [];
  const customer = objectMeta(row.customer_snapshot);
  const quote = objectMeta(row.quote_snapshot);
  const formId = optionalText(row.id);
  const jobId = optionalText(row.job_id);
  const quoteId = optionalText(row.quote_id);
  const submittedAt = optionalText(row.submitted_at);
  if (!formId || !jobId || !quoteId || !submittedAt) return [];
  const seen = new Set<string>();
  return orders.flatMap((value) => {
    const order = objectMeta(value);
    const taskId = optionalText(order.taskId);
    const manufacturer = ["Norman", "Onyx", "Lotus", "Polar"].includes(String(order.manufacturer))
      ? order.manufacturer as CrmVendorOrderTask["manufacturer"]
      : null;
    const productType = optionalText(order.productType);
    if (!taskId || seen.has(taskId) || !manufacturer || !productType || order.status !== "queued") return [];
    seen.add(taskId);
    const productNames = stringArray(order.productNames);
    return [{
      recordId: null,
      taskId,
      formId,
      jobId,
      quoteId,
      customerName: optionalText(customer.name) || "Customer",
      quoteNumber: optionalText(quote.quoteNumber),
      manufacturer,
      productType,
      status: "queued" as const,
      sourceKind: "submitted_technical_measure" as const,
      submittedAt,
      message: optionalText(order.message) || `${manufacturer} order entry is ready to start.`,
      routingKeys: stringArray(order.routingKeys),
      productNames,
      lineCount: Math.max(1, Number(order.lineCount) || 1),
      portalUrl: optionalText(order.portalUrl),
      orderPacketUrl: optionalText(order.orderPacketUrl),
      manufacturerOrderRef: null,
    }];
  });
}

export function vendorOrderTaskFromRow(value: unknown): CrmVendorOrderTask | null {
  return vendorOrderTasksFromRow(value)[0] || null;
}

export function vendorOrderTaskFromDraftRow(value: unknown): CrmVendorOrderTask | null {
  const row = objectMeta(value);
  const recordId = optionalText(row.id);
  const taskId = optionalText(row.external_task_id);
  const jobId = optionalText(row.crm_job_id);
  const quoteId = optionalText(row.crm_quote_id);
  const requestedAt = optionalText(row.requested_at);
  const manufacturer = ["Norman", "Onyx", "Lotus", "Polar"].includes(String(row.manufacturer))
    ? row.manufacturer as CrmVendorOrderTask["manufacturer"]
    : null;
  const status = ["needs_input", "queued", "processing", "review_ready", "failed"].includes(String(row.status))
    ? row.status as CrmVendorOrderTask["status"]
    : null;
  const sourceKind = row.source_kind === "signed_contract" || row.source_kind === "submitted_technical_measure"
    ? row.source_kind
    : null;
  if (!recordId || !taskId || !jobId || !quoteId || !requestedAt || !manufacturer || !status || !sourceKind) return null;
  const customer = objectMeta(row.customer_snapshot);
  const quote = objectMeta(row.quote_snapshot);
  return {
    recordId,
    taskId,
    formId: optionalText(row.technical_measure_form_id),
    jobId,
    quoteId,
    customerName: optionalText(customer.name) || "Customer",
    quoteNumber: optionalText(quote.quoteNumber),
    manufacturer,
    productType: optionalText(row.product_type) || "product",
    status,
    sourceKind,
    submittedAt: requestedAt,
    message: optionalText(row.message)
      || optionalText(row.error_message)
      || `${manufacturer} order entry is ${status.replaceAll("_", " ")}.`,
    routingKeys: stringArray(row.routing_keys),
    productNames: stringArray(row.product_names),
    lineCount: Math.max(1, Number(row.line_count) || 1),
    portalUrl: optionalText(row.portal_url),
    orderPacketUrl: optionalText(row.order_packet_url),
    manufacturerOrderRef: optionalText(row.manufacturer_order_ref),
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
    expensesResult,
    installationInvoiceEmailsResult,
    kenPaymentsResult,
    kenPaymentAllocationsResult,
    orderCogsEmailsResult,
    orderCogsEmailFallbackEventsResult,
    commissionPaymentsResult,
    commissionPaymentAllocationsResult,
    vendorOrderDraftsResult,
    vendorOrderTasksResult,
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
      .limit(2000),
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
      .from("crm_activity_events")
      .select("id,created_at,after_data,metadata")
      .eq("entity_type", "order_cogs_email")
      .eq("action", "order_cogs_email_audit_fallback")
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
    supabase
      .from("crm_vendor_order_drafts")
      .select("id,external_task_id,technical_measure_form_id,crm_job_id,crm_quote_id,manufacturer,product_type,status,source_kind,requested_at,customer_snapshot,quote_snapshot,routing_keys,product_names,line_count,portal_url,order_packet_url,manufacturer_order_ref,message,error_message")
      .order("requested_at", { ascending: false })
      .limit(1000),
    supabase
      .from("crm_technical_measure_forms")
      .select("id,job_id,quote_id,submitted_at,meta,customer_snapshot,quote_snapshot")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(1000),
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

  if (vendorOrderDraftsResult.error) {
    console.warn("CRM durable vendor order tasks could not be loaded.", vendorOrderDraftsResult.error.message);
  }

  if (vendorOrderTasksResult.error) {
    console.warn("CRM legacy vendor order tasks could not be loaded.", vendorOrderTasksResult.error.message);
  }

  if (settingsResult.error) {
    console.warn("CRM settings could not be loaded.", settingsResult.error.message);
  }

  // Tombstoned jobs (soft-deleted via meta.deleted_at) are hidden everywhere:
  // the job list, the quote/order dropdowns, and the bookkeeping job-name
  // lookups all read from this array. The row stays in the table so a delete
  // is recoverable and never destroys a linked quote or sale.
  const jobs = ((jobsResult.data || []) as CrmJob[]).map(hydrateLeadSource).filter(
    (job) => !hasDeleteTombstone((job as { meta?: unknown }).meta)
  );
  const quotes = ((quotesResult.data || []) as CrmQuote[]).filter(
    (quote) => !hasDeleteTombstone(quote.meta)
  );
  const events = (eventsResult.data || []) as CrmCalendarEvent[];
  const customers = ((customersResult.data || []) as CrmCustomer[]).filter(
    (customer) => !hasDeleteTombstone(customer.meta)
  );
  const products = ((productsResult.data || []) as CrmCustomerProduct[]).filter(
    (product) => !hasDeleteTombstone(product.meta)
  );
  const contracts = ((contractsResult.data || []) as CrmCustomerContract[]).filter(
    (contract) => !hasDeleteTombstone(contract.meta)
  );
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
  const orderCogsTableEmails = (orderCogsEmailsResult.error ? [] : orderCogsEmailsResult.data || []) as CrmOrderCogsEmail[];
  const orderCogsFallbackEmails = (orderCogsEmailFallbackEventsResult.error
    ? []
    : ((orderCogsEmailFallbackEventsResult.data || []) as Record<string, unknown>[])
        .map(orderCogsEmailFromActivity)
        .filter((email): email is CrmOrderCogsEmail => Boolean(email)));
  const orderCogsEmails = mergeOrderCogsEmails(orderCogsTableEmails, orderCogsFallbackEmails);
  const commissionPayments = (
    commissionPaymentsResult.error ? [] : commissionPaymentsResult.data || []
  ) as CrmCommissionPayment[];
  const commissionPaymentAllocations = (
    commissionPaymentAllocationsResult.error ? [] : commissionPaymentAllocationsResult.data || []
  ) as CrmCommissionPaymentAllocation[];
  const durableVendorOrderTasks = (vendorOrderDraftsResult.error ? [] : vendorOrderDraftsResult.data || [])
    .map(vendorOrderTaskFromDraftRow)
    .filter((task): task is CrmVendorOrderTask => Boolean(task));
  const durableTaskIds = new Set(durableVendorOrderTasks.map((task) => task.taskId));
  const legacyVendorOrderTasks = (vendorOrderTasksResult.error ? [] : vendorOrderTasksResult.data || [])
    .flatMap(vendorOrderTasksFromRow)
    .filter((task) => !durableTaskIds.has(task.taskId));
  const vendorOrderTasks = [...durableVendorOrderTasks, ...legacyVendorOrderTasks];
  const settingsRows = (settingsResult.error ? [] : settingsResult.data || []) as Array<{
    key: string;
    value: number;
  }>;
  const settingsMap = new Map(settingsRows.map((row) => [row.key, Number(row.value) || 0]));
  const openingBalance = settingsMap.get("ken_opening_balance") ?? 0;
  const payoffTarget = BUSINESS_PAYOFF_TARGET;
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
    vendorOrderTasks,
    openingBalance,
    payoffTarget
  });
}

export async function createCrmJob(supabase: CrmSupabaseClient, payload: Record<string, unknown>, actor: CrmActor) {
  const record = withLeadSourceMeta({
    source: "crm",
    status: normalizeEnum<CrmJobStatus>(payload.status, jobStatusSet, "new", "Invalid CRM job status."),
    priority: normalizeEnum(payload.priority, prioritySet, "normal", "Invalid CRM job priority."),
    customer_name: requiredText(payload.customer_name, "Customer name and phone are required."),
    phone: requiredText(payload.phone, "Customer name and phone are required."),
    email: optionalText(payload.email),
    address: optionalText(payload.address),
    city: optionalText(payload.city),
    product_interest: optionalText(payload.product_interest) || "shutters",
    lead_source: optionalText(payload.lead_source),
    sales_owner: optionalText(payload.sales_owner) || "Unassigned",
    next_action: optionalText(payload.next_action) || "Call customer",
    next_action_due: payload.next_action_due || null,
    estimated_total: toMoney(payload.estimated_total),
    notes: optionalText(payload.notes),
    meta: metadataWithActor(payload, actor, "createdBy")
  });

  let { data, error } = await supabase.from("crm_jobs").insert(record).select("*").single();
  if (error && isMissingLeadSourceColumnError(error)) {
    const { lead_source: _leadSource, ...withoutLeadSource } = record;
    ({ data, error } = await supabase.from("crm_jobs").insert(withoutLeadSource).select("*").single());
  }
  if (error || !data) throw new CrmAuthError(502, "CRM job could not be created.");

  data = hydrateLeadSource(data as CrmJob);

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

  const updatedAt = new Date().toISOString();
  patch.meta = {
    ...(existing.meta || {}),
    ...(typeof payload.meta === "object" && payload.meta ? payload.meta : {}),
    lastUpdatedBy: actor.email,
    lastUpdatedAt: updatedAt
  };
  const measure = getMeasureNeededMeta(patch.meta);
  if (Object.prototype.hasOwnProperty.call(patch, "status") && patch.status === "ordered" && measure.status === "needed") {
    throw new CrmAuthError(409, "Complete the required technical measure before marking this job ordered.");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "lead_source")) {
    const leadSource = typeof patch.lead_source === "string" && patch.lead_source.trim() ? patch.lead_source.trim() : null;
    const meta = patch.meta && typeof patch.meta === "object" && !Array.isArray(patch.meta) ? patch.meta : {};
    patch.meta = {
      ...meta,
      lead_source: leadSource,
      leadSource
    };
  }

  let { data, error } = await supabase.from("crm_jobs").update(patch).eq("id", id).select("*").single();
  if (error && isMissingLeadSourceColumnError(error)) {
    const { lead_source: _leadSource, ...withoutLeadSource } = patch;
    ({ data, error } = await supabase.from("crm_jobs").update(withoutLeadSource).eq("id", id).select("*").single());
  }
  if (error || !data) throw new CrmAuthError(502, "CRM job could not be updated.");
  data = hydrateLeadSource(data as CrmJob);

  if (Object.prototype.hasOwnProperty.call(patch, "sales_owner") && shouldSyncSaleOwnerForJob(data.status)) {
    await syncSaleOwnerForJob(supabase, id, patch.sales_owner, actor);
  }

  const updatedJob = data as CrmJob;

  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    try {
      const { isReviewRequestTransition, maybeSendReviewRequestForJob } = await import("@/lib/crm/review-request");
      if (isReviewRequestTransition(existing.status, updatedJob.status)) {
        const { activatePaymentPlanForJob } = await import("@/lib/crm/payment-plans");
        await activatePaymentPlanForJob(supabase, id, actor);
        await maybeSendReviewRequestForJob(supabase, id, actor, "job_update");
      }
    } catch (error) {
      console.error("review-request automation failed", error);
    }
  }

  await syncCustomerFromJob(supabase, updatedJob);
  await recordCrmActivity(supabase, actor, {
    entityType: "job",
    entityId: id,
    action: "update",
    before: existing,
    after: updatedJob
  });

  return updatedJob;
}

// Quote statuses that mean a recorded sale exists in the bookkeeping ledger.
const soldQuoteStatusGuard = new Set(saleOwnerSyncQuoteStatuses);

export async function deleteCrmJob(supabase: CrmSupabaseClient, id: string, actor: CrmActor) {
  const { data: existing, error: existingError } = await supabase
    .from("crm_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "CRM job was not found.");

  // Guard against the wiped-sale failure mode: never hide a job that carries a
  // sold quote, or that sale's customer name would vanish from the ledger. A
  // real sale must be removed from bookkeeping first; this delete is for leads
  // and abandoned/test jobs only.
  const { data: quoteRows, error: quoteError } = await supabase
    .from("crm_quotes")
    .select("status")
    .eq("job_id", id);
  if (quoteError) throw new CrmAuthError(502, "Job quotes could not be checked before deleting.");
  if ((quoteRows || []).some((row) => soldQuoteStatusGuard.has(String(row.status)))) {
    throw new CrmAuthError(
      409,
      "This job has a sold quote in the bookkeeping ledger. Remove the sale from bookkeeping before deleting the job."
    );
  }

  // Soft-delete tombstone, matching deleteCrmLedgerRow: the row is preserved so
  // the action is recoverable and no linked quote is physically destroyed.
  const meta = {
    ...objectMeta((existing as { meta?: unknown }).meta),
    deleted_at: new Date().toISOString(),
    deleted_by: actor.email,
    deleted_by_user_id: actor.userId || null,
    delete_source: "job_delete"
  };
  const { error } = await supabase.from("crm_jobs").update({ meta }).eq("id", id);
  if (error) throw new CrmAuthError(502, "CRM job could not be deleted.");

  await recordCrmActivity(supabase, actor, {
    entityType: "job",
    entityId: id,
    action: "delete",
    before: existing,
    after: { ...existing, meta },
    metadata: { source: "job_delete" }
  });

  return { id };
}

async function selectIdsByColumn(
  supabase: CrmSupabaseClient,
  table: string,
  column: string,
  values: string[],
  errorMessage: string
) {
  if (!values.length) return [];
  const { data, error } = await supabase.from(table).select("id").in(column, values);
  if (error) throw new CrmAuthError(502, errorMessage);
  return uniqueTextValues(((data || []) as Array<{ id?: unknown }>).map((row) => row.id));
}

async function tombstoneRowsByIds(
  supabase: CrmSupabaseClient,
  table: string,
  ids: string[],
  metaPatch: Record<string, unknown>,
  errorMessage: string
) {
  const uniqueIds = uniqueTextValues(ids);
  if (!uniqueIds.length) return [];

  const { data, error } = await supabase.from(table).select("id,meta").in("id", uniqueIds);
  if (error) throw new CrmAuthError(502, errorMessage);

  const rows = ((data || []) as Array<{ id: string; meta?: unknown }>).filter((row) => row.id);
  for (const row of rows) {
    const after = {
      ...objectMeta(row.meta),
      ...metaPatch
    };
    const { error: updateError } = await supabase.from(table).update({ meta: after }).eq("id", row.id);
    if (updateError) throw new CrmAuthError(502, errorMessage);
  }

  return rows;
}

async function selectRowsByIds(
  supabase: CrmSupabaseClient,
  table: string,
  ids: string[],
  errorMessage: string
) {
  const uniqueIds = uniqueTextValues(ids);
  if (!uniqueIds.length) return [];

  const { data, error } = await supabase.from(table).select("id,meta").in("id", uniqueIds);
  if (error) throw new CrmAuthError(502, errorMessage);
  return ((data || []) as Array<{ id: string; meta?: unknown }>).filter((row) => row.id);
}

export async function deleteCrmCustomerFile(
  supabase: CrmSupabaseClient,
  id: string,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const customerName = optionalText(payload.customerName);
  const customerIds = uniqueTextValues([
    optionalText(payload.customerId),
    ...(isUuid(id) ? [id] : []),
    ...payloadStringArray(payload, "customerIds")
  ]);
  const jobIds = uniqueTextValues([
    ...payloadStringArray(payload, "jobIds"),
    ...payloadStringArray(payload, "rowJobIds")
  ]);
  let quoteIds = uniqueTextValues([
    ...payloadStringArray(payload, "quoteIds"),
    ...payloadStringArray(payload, "rowQuoteIds")
  ]);
  let bookkeepingEntryIds = uniqueTextValues(payloadStringArray(payload, "bookkeepingEntryIds"));
  let productIds = uniqueTextValues(payloadStringArray(payload, "productIds"));
  let contractIds = uniqueTextValues(payloadStringArray(payload, "contractIds"));

  if (!customerIds.length && !jobIds.length && !quoteIds.length && !bookkeepingEntryIds.length && !customerName) {
    throw new CrmAuthError(400, "Customer file details are required before deleting.");
  }

  const customerRows = customerIds.length
    ? await selectRowsByIds(
        supabase,
        "crm_customers",
        customerIds,
        "Customer file could not be checked before deleting."
      )
    : [];
  const existingCustomerIds = uniqueTextValues(customerRows.map((row) => row.id));

  const quoteIdsFromJobs = await selectIdsByColumn(
    supabase,
    "crm_quotes",
    "job_id",
    jobIds,
    "Customer quotes could not be checked before deleting."
  );
  quoteIds = uniqueTextValues([...quoteIds, ...quoteIdsFromJobs]);

  const entriesFromJobs = await selectIdsByColumn(
    supabase,
    "crm_quote_bookkeeping_entries",
    "job_id",
    jobIds,
    "Customer bookkeeping rows could not be checked before deleting."
  );
  const entriesFromQuotes = await selectIdsByColumn(
    supabase,
    "crm_quote_bookkeeping_entries",
    "quote_id",
    quoteIds,
    "Customer bookkeeping rows could not be checked before deleting."
  );
  bookkeepingEntryIds = uniqueTextValues([...bookkeepingEntryIds, ...entriesFromJobs, ...entriesFromQuotes]);

  const productIdSources = await Promise.all([
    selectIdsByColumn(
      supabase,
      "crm_customer_products",
      "customer_id",
      existingCustomerIds,
      "Customer products could not be checked before deleting."
    ),
    selectIdsByColumn(
      supabase,
      "crm_customer_products",
      "job_id",
      jobIds,
      "Customer products could not be checked before deleting."
    ),
    selectIdsByColumn(
      supabase,
      "crm_customer_products",
      "quote_id",
      quoteIds,
      "Customer products could not be checked before deleting."
    ),
    selectIdsByColumn(
      supabase,
      "crm_customer_products",
      "bookkeeping_entry_id",
      bookkeepingEntryIds,
      "Customer products could not be checked before deleting."
    )
  ]);
  productIds = uniqueTextValues([...productIds, ...productIdSources.flat()]);

  const contractIdSources = await Promise.all([
    selectIdsByColumn(
      supabase,
      "crm_customer_contracts",
      "customer_id",
      existingCustomerIds,
      "Customer contracts could not be checked before deleting."
    ),
    selectIdsByColumn(
      supabase,
      "crm_customer_contracts",
      "job_id",
      jobIds,
      "Customer contracts could not be checked before deleting."
    ),
    selectIdsByColumn(
      supabase,
      "crm_customer_contracts",
      "quote_id",
      quoteIds,
      "Customer contracts could not be checked before deleting."
    ),
    selectIdsByColumn(
      supabase,
      "crm_customer_contracts",
      "bookkeeping_entry_id",
      bookkeepingEntryIds,
      "Customer contracts could not be checked before deleting."
    )
  ]);
  contractIds = uniqueTextValues([...contractIds, ...contractIdSources.flat()]);

  const deletedAt = new Date().toISOString();
  const deleteMeta = {
    deleted_at: deletedAt,
    deleted_by: actor.email,
    deleted_by_user_id: actor.userId || null,
    delete_source: "customer_file_delete"
  };
  const ledgerDeleteMeta = {
    ...deleteMeta,
    bookkeeping_deleted_at: deletedAt,
    bookkeeping_deleted_by: actor.email,
    bookkeeping_deleted_by_user_id: actor.userId || null,
    bookkeeping_delete_source: "customer_file_delete"
  };

  const [updatedJobs, updatedQuotes, updatedEntries, updatedProducts, updatedContracts, updatedCustomers] =
    await Promise.all([
      tombstoneRowsByIds(supabase, "crm_jobs", jobIds, deleteMeta, "Customer jobs could not be deleted."),
      tombstoneRowsByIds(supabase, "crm_quotes", quoteIds, ledgerDeleteMeta, "Customer quotes could not be deleted."),
      tombstoneRowsByIds(
        supabase,
        "crm_quote_bookkeeping_entries",
        bookkeepingEntryIds,
        ledgerDeleteMeta,
        "Customer bookkeeping rows could not be deleted."
      ),
      tombstoneRowsByIds(supabase, "crm_customer_products", productIds, deleteMeta, "Customer products could not be deleted."),
      tombstoneRowsByIds(supabase, "crm_customer_contracts", contractIds, deleteMeta, "Customer contracts could not be deleted."),
      tombstoneRowsByIds(supabase, "crm_customers", existingCustomerIds, deleteMeta, "Customer file could not be deleted.")
    ]);

  const deletedCount =
    updatedJobs.length +
    updatedQuotes.length +
    updatedEntries.length +
    updatedProducts.length +
    updatedContracts.length +
    updatedCustomers.length;

  if (!deletedCount) {
    throw new CrmAuthError(404, "Customer file was not found.");
  }

  await recordCrmActivity(supabase, actor, {
    entityType: "customer",
    entityId: existingCustomerIds[0] || id,
    action: "delete",
    after: {
      id,
      customerName,
      deletedAt,
      counts: {
        customers: updatedCustomers.length,
        jobs: updatedJobs.length,
        quotes: updatedQuotes.length,
        bookkeepingEntries: updatedEntries.length,
        products: updatedProducts.length,
        contracts: updatedContracts.length
      }
    },
    metadata: { source: "customer_file_delete", customerName: customerName || null }
  });

  return { id, deleted: true, count: deletedCount };
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
  endAt: string,
  excludeEventId?: string
) {
  let query = supabase
    .from("crm_calendar_events")
    .select("id,title,start_at,end_at")
    .in("status", ["scheduled", "rescheduled"])
    .lt("start_at", endAt)
    .gt("end_at", startAt);

  if (excludeEventId) {
    query = query.neq("id", excludeEventId);
  }

  const { data, error } = await query.limit(1);

  if (error) throw new CrmAuthError(502, "Calendar availability could not be checked.");
  if (data?.length) throw new CrmAuthError(409, "That CRM calendar window is already booked.");
}

async function syncTechnicalMeasureCalendarState(
  supabase: CrmSupabaseClient,
  event: Record<string, unknown>,
  patch: { status: "scheduled" | "unscheduled"; startAt?: string | null; endAt?: string | null; actorEmail: string }
) {
  if (event.event_type !== "measure") return;
  const formId = optionalText(objectMeta(event.meta).technical_measure_form_id);
  if (!formId) return;
  const { data: form, error: formReadError } = await supabase
    .from("crm_technical_measure_forms")
    .select("id,job_id,meta")
    .eq("id", formId)
    .maybeSingle();
  if (formReadError || !form) throw new CrmAuthError(502, "The calendar changed, but the technical measure form could not be updated.");
  const formMeta = objectMeta(form.meta);
  const previous = objectMeta(formMeta.measure_scheduling);
  const scheduling = {
    ...previous,
    status: patch.status,
    scheduled_at: patch.status === "scheduled" ? new Date().toISOString() : null,
    scheduled_by: patch.status === "scheduled" ? patch.actorEmail : null,
    scheduled_start_at: patch.status === "scheduled" ? patch.startAt || null : null,
    scheduled_end_at: patch.status === "scheduled" ? patch.endAt || null : null,
    calendar_event_id: event.id,
  };
  const { error: formError } = await supabase
    .from("crm_technical_measure_forms")
    .update({ meta: { ...formMeta, measure_scheduling: scheduling } })
    .eq("id", formId);
  if (formError) throw new CrmAuthError(502, "The calendar changed, but the technical measure form could not be updated.");

  if (form.job_id) {
    const { data: job, error: jobReadError } = await supabase
      .from("crm_jobs")
      .select("meta")
      .eq("id", form.job_id)
      .maybeSingle();
    if (jobReadError || !job) throw new CrmAuthError(502, "The calendar changed, but the customer file could not be updated.");
    const jobMeta = objectMeta(job.meta);
    const measureMeta = objectMeta(jobMeta.measure_needed);
    const { error: jobError } = await supabase
      .from("crm_jobs")
      .update({
        meta: {
          ...jobMeta,
          measure_needed: {
            ...measureMeta,
            schedule_status: scheduling.status,
            scheduled_at: scheduling.scheduled_at,
            scheduled_by: scheduling.scheduled_by,
            scheduled_start_at: scheduling.scheduled_start_at,
            scheduled_end_at: scheduling.scheduled_end_at,
            calendar_event_id: scheduling.calendar_event_id,
          },
        },
      })
      .eq("id", form.job_id);
    if (jobError) throw new CrmAuthError(502, "The calendar changed, but the customer file could not be updated.");
  }
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
  const eventType = normalizeEnum<string>(payload.event_type, calendarEventTypes, "sales_consult", "Invalid calendar event type.");
  if (eventType !== "measure") await assertCalendarWindowAvailable(supabase, startAt, endAt);

  const record = {
    job_id: payload.job_id || null,
    title,
    event_type: eventType,
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

  // Best-effort mirror to Google Calendar (service account + domain-wide
  // delegation). Non-blocking: never throws. Persists the created Google event
  // ids back onto the row when any calendar syncs.
  let googleCalendarSync: GoogleCalendarSyncResult = { synced: false, results: [] };
  try {
    googleCalendarSync = await syncAppointmentToGoogleCalendars({
      summary: title,
      description: optionalText(payload.notes) || undefined,
      location: optionalText(payload.location) || linkedJob?.address || undefined,
      startAt,
      endAt,
      timeZone: "America/Los_Angeles"
    });

    if (googleCalendarSync.synced) {
      const googleCalendarEventIds: Record<string, string> = {};
      const googleCalendarHtmlLinks: Record<string, string> = {};
      for (const result of googleCalendarSync.results) {
        if (result.eventId) {
          googleCalendarEventIds[result.calendar] = result.eventId;
          if (result.htmlLink) googleCalendarHtmlLinks[result.calendar] = result.htmlLink;
        }
      }
      await supabase
        .from("crm_calendar_events")
        .update({
          meta: { ...(data.meta || {}), googleCalendarEventIds, googleCalendarHtmlLinks }
        })
        .eq("id", data.id);
    }
  } catch (error) {
    console.warn("[crm] google calendar sync error", error);
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
      assignedSalespersonSms,
      googleCalendarSynced: googleCalendarSync.synced,
      googleCalendarSync: googleCalendarSync.results
    }
  });

  return data as CrmCalendarEvent;
}

export async function rescheduleCrmCalendarEvent(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const eventId = requiredText(payload.id, "Calendar event is required.");
  const startAt = requiredText(payload.start_at, "Start and end are required.");
  const endAt = requiredText(payload.end_at, "Start and end are required.");
  const startDate = new Date(startAt);
  const endDate = new Date(endAt);

  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
    throw new CrmAuthError(400, "Calendar event end time must be after its start time.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("crm_calendar_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (existingError) throw new CrmAuthError(502, "Calendar event could not be loaded.");
  if (!existing) throw new CrmAuthError(404, "Calendar event was not found.");
  if (!["scheduled", "rescheduled"].includes(String(existing.status || ""))) {
    throw new CrmAuthError(409, "Only scheduled appointments can be rescheduled.");
  }

  if (existing.event_type !== "measure") await assertCalendarWindowAvailable(supabase, startAt, endAt, eventId);

  const update = {
    start_at: startAt,
    end_at: endAt,
    status: "rescheduled",
    meta: metadataWithActor({ meta: existing.meta }, actor, "rescheduledBy")
  };

  const { data, error } = await supabase
    .from("crm_calendar_events")
    .update(update)
    .eq("id", eventId)
    .select("*")
    .single();

  if (error || !data) throw new CrmAuthError(502, "Calendar event could not be rescheduled.");

  await syncTechnicalMeasureCalendarState(supabase, data, {
    status: "scheduled",
    startAt,
    endAt,
    actorEmail: actor.email,
  });

  let linkedJob: CrmJob | null = null;
  if (existing.job_id && existing.event_type !== "measure") {
    const { data: job, error: jobError } = await supabase
      .from("crm_jobs")
      .update({
        appointment_start: startAt,
        appointment_end: endAt
      })
      .eq("id", existing.job_id)
      .select("*")
      .maybeSingle();

    if (jobError) throw new CrmAuthError(502, "Appointment moved, but the linked job could not be updated.");
    if (job) {
      linkedJob = job as CrmJob;
      await syncCustomerFromJob(supabase, linkedJob);
    }
  }

  const rescheduledSalespersonSms = await sendCalendarAssignmentSms({
    action: "rescheduled",
    assignedTo: existing.assigned_to,
    title: existing.title,
    startAt,
    endAt,
    previousStartAt: existing.start_at,
    previousEndAt: existing.end_at,
    location: existing.location || linkedJob?.address,
    customerName: linkedJob?.customer_name,
    phone: linkedJob?.phone,
    productInterest: linkedJob?.product_interest
  });

  await recordCrmActivity(supabase, actor, {
    entityType: "calendar_event",
    entityId: data.id,
    action: "reschedule",
    before: existing,
    after: data,
    metadata: {
      jobId: existing.job_id || null,
      rescheduledSalespersonSms
    }
  });

  return data as CrmCalendarEvent;
}

export async function cancelCrmCalendarEvent(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const eventId = requiredText(payload.id, "Calendar event is required.");

  const { data: existing, error: existingError } = await supabase
    .from("crm_calendar_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (existingError) throw new CrmAuthError(502, "Calendar event could not be loaded.");
  if (!existing) throw new CrmAuthError(404, "Calendar event was not found.");
  if (!["scheduled", "rescheduled"].includes(String(existing.status || ""))) {
    throw new CrmAuthError(409, "Only scheduled appointments can be canceled.");
  }

  const cancelMeta = metadataWithActor({ meta: existing.meta }, actor, "canceledBy");
  const cancelReason = optionalText(payload.reason);
  if (cancelReason) cancelMeta.canceledReason = cancelReason;

  const { data, error } = await supabase
    .from("crm_calendar_events")
    .update({
      status: "canceled",
      meta: cancelMeta
    })
    .eq("id", eventId)
    .select("*")
    .single();

  if (error || !data) throw new CrmAuthError(502, "Calendar event could not be canceled.");

  await syncTechnicalMeasureCalendarState(supabase, data, {
    status: "unscheduled",
    actorEmail: actor.email,
  });

  let linkedJob: CrmJob | null = null;
  if (existing.job_id && existing.event_type !== "measure") {
    const { data: linkedJobData, error: linkedJobError } = await supabase
      .from("crm_jobs")
      .select("*")
      .eq("id", existing.job_id)
      .maybeSingle();

    if (linkedJobError) throw new CrmAuthError(502, "Appointment canceled, but the linked job could not be loaded.");

    if (linkedJobData) {
      linkedJob = linkedJobData as CrmJob;
      const jobUpdate: Record<string, unknown> = {
        appointment_start: null,
        appointment_end: null
      };

      if (linkedJob.status === "scheduled") {
        jobUpdate.status = "follow_up";
        jobUpdate.next_action = "Follow up after canceled appointment";
        jobUpdate.next_action_due = null;
      }

      const { data: job, error: jobError } = await supabase
        .from("crm_jobs")
        .update(jobUpdate)
        .eq("id", existing.job_id)
        .select("*")
        .maybeSingle();

      if (jobError) throw new CrmAuthError(502, "Appointment canceled, but the linked job could not be updated.");
      if (job) await syncCustomerFromJob(supabase, job as CrmJob);
    }
  }

  let googleCalendarDelete: GoogleCalendarDeleteResult = { deleted: false, results: [], skipped: "no-google-event-ids" };
  try {
    googleCalendarDelete = await deleteSyncedGoogleCalendarEvents(objectMeta(objectMeta(existing.meta).googleCalendarEventIds));
  } catch (error) {
    console.warn("[crm] google calendar delete error", error);
  }

  const canceledSalespersonSms = await sendCalendarAssignmentSms({
    action: "canceled",
    assignedTo: existing.assigned_to,
    title: existing.title,
    startAt: existing.start_at,
    endAt: existing.end_at,
    location: existing.location || linkedJob?.address,
    customerName: linkedJob?.customer_name,
    phone: linkedJob?.phone,
    productInterest: linkedJob?.product_interest
  });

  await recordCrmActivity(supabase, actor, {
    entityType: "calendar_event",
    entityId: data.id,
    action: "cancel",
    before: existing,
    after: data,
    metadata: {
      jobId: existing.job_id || null,
      googleCalendarDeleted: googleCalendarDelete.deleted,
      googleCalendarDeleteSkipped: googleCalendarDelete.skipped || null,
      googleCalendarDelete: googleCalendarDelete.results,
      canceledSalespersonSms
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

  if (paymentRows.length) {
    await maybeSendCustomerCloseoutForQuote(supabase, data.id, actor, "quote_create_payment");
  }

  return data as CrmQuote;
}

export async function deleteSalesQuote(
  supabase: CrmSupabaseClient,
  id: string,
  actor: CrmActor
) {
  const { data: existing, error: existingError } = await supabase
    .from("sales_quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Quote was not found.");

  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .from("sales_quotes")
    .update({
      deleted_at: deletedAt,
      deleted_by: actor.email,
      deleted_by_user_id: actor.userId || null
    })
    .eq("id", id);
  if (error) {
    logSupabaseError("sales_quotes soft delete failed", error);
    throw new CrmAuthError(502, "Quote could not be deleted.");
  }

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: id,
    action: "delete",
    before: existing,
    metadata: { source: "sales_quotes", deletedAt }
  });
  return { deleted: true, quoteId: id };
}

export async function deleteCrmQuote(
  supabase: CrmSupabaseClient,
  id: string,
  actor: CrmActor
) {
  const { data: existing, error: existingError } = await supabase
    .from("crm_quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Quote was not found.");

  const meta = existing.meta && typeof existing.meta === "object"
    ? existing.meta as Record<string, unknown>
    : {};
  const externalId = typeof existing.external_id === "string" && existing.external_id.startsWith("quote:")
    ? existing.external_id.slice("quote:".length)
    : null;
  const linkedSalesQuoteId = [
    meta.target_sales_quote_id,
    meta.sales_quote_id,
    meta.mts_quote_id,
    externalId
  ].find((value): value is string => typeof value === "string" && Boolean(value.trim())) || null;

  const { error } = await supabase.from("crm_quotes").delete().eq("id", id);
  if (error) {
    logSupabaseError("crm_quotes delete failed", error);
    throw new CrmAuthError(502, "Quote could not be deleted.");
  }

  if (linkedSalesQuoteId) {
    const linkedDelete = await supabase
      .from("sales_quotes")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: actor.email,
        deleted_by_user_id: actor.userId || null
      })
      .eq("id", linkedSalesQuoteId);
    if (linkedDelete.error) {
      logSupabaseError("linked sales_quotes soft delete failed", linkedDelete.error);
      throw new CrmAuthError(502, "The CRM quote was deleted, but its linked V2 quote could not be deleted.");
    }
  }

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: id,
    action: "delete",
    before: existing,
    metadata: { jobId: existing.job_id, linkedSalesQuoteId }
  });
  return { deleted: true, quoteId: id, linkedSalesQuoteId };
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
  const serverPricedFields = new Set(["quote_total", "discount", "tax", "balance_due"]);
  const hasBuilderTotalOverride =
    builderManaged && payload.manual_total_override === true && hasPayloadKey(payload, "quote_total");

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  const hasRemakeAmount = hasPayloadKey(payload, "remake_amount");
  const hasBalanceAdjustment = hasPayloadKey(payload, "balance_due_target");
  const hasPaymentTargetAdjustment =
    hasPayloadKey(payload, "deposit_paid_target") || hasPayloadKey(payload, "balance_paid_target");

  for (const [key, value] of Object.entries(payload)) {
    if (!allowedQuotePatchFields.has(key)) continue;
    if (builderManaged && serverPricedFields.has(key) && !(key === "quote_total" && hasBuilderTotalOverride)) continue; // server-authoritative
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
    "installation_invoice_paid_at",
    "installation_invoice_paid_amount",
    "installation_invoice_payment_method",
    "installation_invoice_payment_notes",
    "installation_complete",
    "ken_cut_override",
    "remake_amount",
    "balance_due_target",
    "deposit_paid_target",
    "balance_paid_target"
  ].some((key) => Object.prototype.hasOwnProperty.call(payload, key));
  const hasPaymentPatch = toMoney(payload.payment_amount) > 0;

  if (!Object.keys(patch).length && !hasEntryOnlyBookkeepingPatch && !hasPaymentPatch && !hasPaymentTargetAdjustment) {
    throw new CrmAuthError(400, "No supported quote fields provided.");
  }

  let quote = existing as CrmQuote;
  if (Object.keys(patch).length) {
    const existingMeta = (existing.meta as Record<string, unknown> | null) || {};
    const existingAdjustments =
      existingMeta.adjustments && typeof existingMeta.adjustments === "object"
        ? (existingMeta.adjustments as Record<string, unknown>)
        : {};
    const totalOverrideAdjustments = hasBuilderTotalOverride
      ? {
          ...existingAdjustments,
          totalOverride: toMoney(payload.quote_total),
          balanceDueOverride: null
        }
      : null;
    if (totalOverrideAdjustments) {
      const overrideMoney = computeQuoteMoney(0, parseAdjustments({ adjustments: totalOverrideAdjustments }));
      patch.deposit_required = overrideMoney.depositRequired;
      patch.balance_due = overrideMoney.balanceDue;
    }
    patch.meta = {
      ...existingMeta,
      ...(typeof payload.meta === "object" && payload.meta ? payload.meta : {}),
      ...(hasBuilderTotalOverride
        ? {
            adjustments: {
              ...totalOverrideAdjustments
            }
          }
        : {}),
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

  const paymentTargetAdjustments = hasPaymentTargetAdjustment
    ? await recordPaymentTargetAdjustments(supabase, { kind: "quote", quote }, payload, actor)
    : [];
  const balanceAdjustment = hasBalanceAdjustment
    ? await recordBalanceAdjustmentCredit(supabase, { kind: "quote", quote }, payload, actor)
    : null;

  // Don't materialize a ledger entry for an unsold draft/sent quote (matches the
  // create path and the builder, which only create the entry once sold).
  const maintainEntry = quote.status !== "draft" && quote.status !== "sent";
  let entryCustomerName = "Linked job";
  if (maintainEntry) {
    const { data: existingEntry } = await supabase
      .from("crm_quote_bookkeeping_entries")
      .select("customer_name")
      .eq("quote_id", id)
      .maybeSingle();
    const { data: linkedJob } = quote.job_id
      ? await supabase
          .from("crm_jobs")
          .select("customer_name")
          .eq("id", quote.job_id)
          .maybeSingle()
      : { data: null };
    entryCustomerName = resolveQuoteBookkeepingCustomerName({
      payloadCustomerName: payload.customer_name,
      quoteCustomerName: quote.customer_name,
      existingEntryCustomerName: (existingEntry as { customer_name?: unknown } | null)?.customer_name,
      jobCustomerName: (linkedJob as { customer_name?: unknown } | null)?.customer_name,
    });
  }
  const entryRecord = {
      quote_id: id,
      job_id: quote.job_id,
      source: "crm_quote",
      customer_name: entryCustomerName,
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
      ...(payload.installation_invoice_paid_at !== undefined
        ? { installation_invoice_paid_at: optionalText(payload.installation_invoice_paid_at) }
        : {}),
      ...(payload.installation_invoice_paid_amount !== undefined
        ? { installation_invoice_paid_amount: toMoney(payload.installation_invoice_paid_amount) }
        : {}),
      ...(payload.installation_invoice_payment_method !== undefined
        ? { installation_invoice_payment_method: optionalText(payload.installation_invoice_payment_method) }
        : {}),
      ...(payload.installation_invoice_payment_notes !== undefined
        ? { installation_invoice_payment_notes: optionalText(payload.installation_invoice_payment_notes) }
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
    after: quote,
    metadata:
      balanceAdjustment || paymentTargetAdjustments.length
        ? { balanceAdjustment, paymentTargetAdjustments }
        : undefined
  });

  if (hasPaymentPatch || hasPaymentTargetAdjustment || hasBalanceAdjustment) {
    await maybeSendCustomerCloseoutForQuote(supabase, id, actor, "quote_ledger_update");
  }

  return quote as CrmQuote;
}

export async function updateCrmInstallationInvoiceEmail(
  supabase: CrmSupabaseClient,
  id: string,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const { data: existing, error: existingError } = await supabase
    .from("crm_installation_invoice_emails")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Installation invoice was not found.");

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!allowedInstallationInvoiceEmailPatchFields.has(key)) continue;
    if (key === "installation_invoice_paid_amount") {
      patch[key] = toMoney(value);
    } else {
      patch[key] = optionalText(value);
    }
  }

  const paidAt = optionalText(payload.installation_invoice_paid_at);
  if (hasPayloadKey(payload, "installation_invoice_paid_at")) {
    if (paidAt && !hasPayloadKey(payload, "installation_invoice_paid_amount")) {
      patch.installation_invoice_paid_amount = toMoney(
        (existing as CrmInstallationInvoiceEmail).extracted_invoice_amount
      );
    }
    if (!paidAt && !hasPayloadKey(payload, "installation_invoice_paid_amount")) {
      patch.installation_invoice_paid_amount = 0;
    }
  }

  if (!Object.keys(patch).length) {
    throw new CrmAuthError(400, "No supported installation invoice fields provided.");
  }

  patch.raw = {
    ...objectMeta((existing as CrmInstallationInvoiceEmail).raw),
    lastPaymentStatusUpdatedBy: actor.email,
    lastPaymentStatusUpdatedAt: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("crm_installation_invoice_emails")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new CrmAuthError(502, "Installation invoice could not be updated.");

  await recordCrmActivity(supabase, actor, {
    entityType: "installation_invoice_email",
    entityId: id,
    action: "update",
    before: existing,
    after: data
  });

  return data as CrmInstallationInvoiceEmail;
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
  const additionalPaymentAmount = toMoney(payload.payment_amount);
  const now = new Date().toISOString();

  const { data: entry, error } = await supabase
    .from("crm_quote_bookkeeping_entries")
    .insert({
      source,
      job_id: optionalText(payload.job_id),
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
      meta: {
        createdBy: actor.email,
        ...(hasPayloadKey(payload, "deposit_required") ? { deposit_required: toMoney(payload.deposit_required) } : {})
      }
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
    { label: "Balance payment", amount: balanceAmount },
    { label: optionalText(payload.payment_label) || "Payment", amount: additionalPaymentAmount }
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
  const hasBalanceAdjustment = hasPayloadKey(payload, "balance_due_target");
  const hasDepositDueTarget = hasPayloadKey(payload, "deposit_required");
  const hasPaymentTargetAdjustment =
    hasPayloadKey(payload, "deposit_paid_target") || hasPayloadKey(payload, "balance_paid_target");
  const markBalancePaid = payload.mark_balance_paid === true;
  const entryMetaPatch = hasDepositDueTarget ? { deposit_required: toMoney(payload.deposit_required) } : {};

  for (const [key, value] of Object.entries(payload)) {
    if (!allowedEntryPatchFields.has(key)) continue;
    if (key === "payment_type") {
      patch.payment_type = normalizePaymentType(optionalText(value));
    } else if (key === "sales_owner") {
      patch.sales_owner = normalizeOwner(value);
      patch.sales_owner_set_at = now;
    } else if (["total_amount", "cogs_amount", "installation_invoice_amount", "installation_invoice_paid_amount"].includes(key)) {
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

  if (
    !Object.keys(patch).length &&
    !toMoney(payload.payment_amount) &&
    !hasRemakeAmount &&
    !markBalancePaid &&
    !hasBalanceAdjustment &&
    !hasDepositDueTarget &&
    !hasPaymentTargetAdjustment
  ) {
    throw new CrmAuthError(400, "No supported bookkeeping fields provided.");
  }

  let entry = existing;
  if (Object.keys(patch).length || hasDepositDueTarget) {
    patch.meta = {
      ...(existing.meta || {}),
      ...(typeof payload.meta === "object" && payload.meta ? payload.meta : {}),
      ...entryMetaPatch,
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

  const paymentTargetAdjustments = hasPaymentTargetAdjustment
    ? await recordPaymentTargetAdjustments(supabase, { kind: "entry", entry: entry as CrmBookkeepingEntry }, payload, actor)
    : [];
  const balanceAdjustment = hasBalanceAdjustment
    ? await recordBalanceAdjustmentCredit(supabase, { kind: "entry", entry: entry as CrmBookkeepingEntry }, payload, actor)
    : null;

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

  if (markBalancePaid && entry.job_id) {
    await closeBookkeepingJobAfterBalancePaid(supabase, String(entry.job_id), actor);
  }

  if (
    entry.quote_id &&
    (paymentAmount > 0 || markBalancePaid || hasPaymentTargetAdjustment || hasBalanceAdjustment)
  ) {
    await maybeSendCustomerCloseoutForQuote(supabase, String(entry.quote_id), actor, "bookkeeping_ledger_update");
  }

  const totalAmountChanged =
    hasPayloadKey(payload, "total_amount") &&
    Math.abs(toMoney(entry.total_amount) - toMoney(existing.total_amount)) >= 0.01;
  if (totalAmountChanged && entry.job_id && !entry.quote_id) {
    await updateCrmJob(supabase, String(entry.job_id), { estimated_total: toMoney(entry.total_amount) }, actor);
  }

  await syncCustomerFromBookkeepingEntry(supabase, entry);
  await recordCrmActivity(supabase, actor, {
    entityType: "bookkeeping_entry",
    entityId: id,
    action: "update",
    before: existing,
    after: entry,
    metadata:
      balanceAdjustment || paymentTargetAdjustments.length
        ? { balanceAdjustment, paymentTargetAdjustments }
        : undefined
  });

  return entry as CrmBookkeepingEntry;
}

async function closeBookkeepingJobAfterBalancePaid(
  supabase: CrmSupabaseClient,
  jobId: string,
  actor: CrmActor
) {
  const { data: existingJob, error } = await supabase
    .from("crm_jobs")
    .select("id,status")
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw new CrmAuthError(502, "Balance was marked paid, but the linked job could not be checked.");
  if (!existingJob) return;

  const status = String((existingJob as { status?: unknown }).status || "");
  if (status === "closed" || status === "lost") return;

  await updateCrmJob(supabase, jobId, { status: "closed" }, actor);
}

// --- Ledger line-item CRUD (payments, credits, expenses) -------------------
// These edit/delete ONLY the leaf row; the parent job/quote/bookkeeping entry
// is never touched. Balances, profit, Ken's cut, and Jessica's commission are
// derived from these rows in bookkeeping.ts, so any change here recomputes
// them on the next load. Every mutation records a before/after activity event.

export async function updateCrmBookkeepingPayment(
  supabase: CrmSupabaseClient,
  id: string,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const { data: existing, error: existingError } = await supabase
    .from("crm_quote_bookkeeping_payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Payment was not found.");

  const patch: Record<string, unknown> = {};
  if (payload.amount !== undefined) {
    const amount = toMoney(payload.amount);
    if (amount <= 0) throw new CrmAuthError(400, "Payment amount must be greater than zero.");
    patch.amount = amount;
  }
  if (payload.payment_label !== undefined) {
    patch.payment_label = optionalText(payload.payment_label) || "Balance payment";
  }
  if (payload.payment_type !== undefined) {
    patch.payment_type = normalizePaymentType(optionalText(payload.payment_type)) || "other";
  }
  if (payload.paid_at !== undefined) patch.paid_at = payload.paid_at || null;
  if (payload.notes !== undefined) patch.notes = optionalText(payload.notes);

  if (!Object.keys(patch).length) throw new CrmAuthError(400, "No supported payment fields provided.");

  patch.meta = {
    ...objectMeta((existing as CrmBookkeepingPayment & { meta?: unknown }).meta),
    lastUpdatedBy: actor.email,
    lastUpdatedAt: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("crm_quote_bookkeeping_payments")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new CrmAuthError(502, "Payment could not be updated.");

  await recordCrmActivity(supabase, actor, {
    entityType: "bookkeeping_payment",
    entityId: id,
    action: "update",
    before: existing,
    after: data
  });

  const quoteId = optionalText((data as CrmBookkeepingPayment).quote_id || (existing as CrmBookkeepingPayment).quote_id);
  if (quoteId) await maybeSendCustomerCloseoutForQuote(supabase, quoteId, actor, "payment_row_update");

  return data as CrmBookkeepingPayment;
}

export async function deleteCrmBookkeepingPayment(supabase: CrmSupabaseClient, id: string, actor: CrmActor) {
  const { data: existing, error: existingError } = await supabase
    .from("crm_quote_bookkeeping_payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Payment was not found.");

  const { error } = await supabase.from("crm_quote_bookkeeping_payments").delete().eq("id", id);
  if (error) throw new CrmAuthError(502, "Payment could not be deleted.");

  await recordCrmActivity(supabase, actor, {
    entityType: "bookkeeping_payment",
    entityId: id,
    action: "delete",
    before: existing
  });

  return { id };
}

export async function updateCrmBookkeepingCredit(
  supabase: CrmSupabaseClient,
  id: string,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const { data: existing, error: existingError } = await supabase
    .from("crm_quote_bookkeeping_credits")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Credit was not found.");

  const patch: Record<string, unknown> = {};
  if (payload.amount !== undefined) {
    const amount = toMoney(payload.amount);
    if (amount <= 0) throw new CrmAuthError(400, "Credit amount must be greater than zero.");
    patch.amount = amount;
  }
  if (payload.credit_date !== undefined) patch.credit_date = payload.credit_date || null;
  if (payload.note !== undefined) patch.note = optionalText(payload.note);

  if (!Object.keys(patch).length) throw new CrmAuthError(400, "No supported credit fields provided.");

  patch.meta = {
    ...objectMeta((existing as CrmBookkeepingCredit & { meta?: unknown }).meta),
    lastUpdatedBy: actor.email,
    lastUpdatedAt: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("crm_quote_bookkeeping_credits")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new CrmAuthError(502, "Credit could not be updated.");

  await recordCrmActivity(supabase, actor, {
    entityType: "bookkeeping_credit",
    entityId: id,
    action: "update",
    before: existing,
    after: data
  });

  return data as CrmBookkeepingCredit;
}

export async function deleteCrmBookkeepingCredit(supabase: CrmSupabaseClient, id: string, actor: CrmActor) {
  const { data: existing, error: existingError } = await supabase
    .from("crm_quote_bookkeeping_credits")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Credit was not found.");

  const { error } = await supabase.from("crm_quote_bookkeeping_credits").delete().eq("id", id);
  if (error) throw new CrmAuthError(502, "Credit could not be deleted.");

  await recordCrmActivity(supabase, actor, {
    entityType: "bookkeeping_credit",
    entityId: id,
    action: "delete",
    before: existing
  });

  return { id };
}

const jobExpenseCategories = new Set([
  "materials",
  "installation_extra",
  "processing_fee",
  "permit",
  "repair",
  "remake",
  "referral",
  "other"
]);

function normalizeExpenseCategory(value: unknown) {
  const category = String(value || "").trim().toLowerCase();
  if (!jobExpenseCategories.has(category)) {
    throw new CrmAuthError(400, "Expense category is not recognized.");
  }
  return category;
}

export async function createCrmJobExpense(
  supabase: CrmSupabaseClient,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const bookkeepingEntryId = optionalText(payload.bookkeeping_entry_id);
  const quoteId = optionalText(payload.quote_id);
  const jobId = optionalText(payload.job_id);
  if (!bookkeepingEntryId && !quoteId && !jobId) {
    throw new CrmAuthError(400, "An expense must be tied to a bookkeeping row, quote, or job.");
  }

  const amount = toMoney(payload.amount);
  if (amount <= 0) throw new CrmAuthError(400, "Expense amount must be greater than zero.");

  const record = {
    bookkeeping_entry_id: bookkeepingEntryId,
    quote_id: quoteId,
    job_id: jobId,
    label: requiredText(payload.label, "Expense label is required."),
    category: payload.category === undefined ? "other" : normalizeExpenseCategory(payload.category),
    amount,
    incurred_on: payload.incurred_on || null,
    notes: optionalText(payload.notes),
    source: payload.source === "legacy_sheet" ? "legacy_sheet" : "manual",
    meta: { createdBy: actor.email }
  };

  const { data, error } = await supabase.from("crm_job_expenses").insert(record).select("*").single();
  if (error || !data) throw new CrmAuthError(502, "Expense could not be saved.");

  await recordCrmActivity(supabase, actor, {
    entityType: "expense",
    entityId: data.id,
    action: "create",
    after: data
  });

  return data as CrmJobExpense;
}

export async function updateCrmJobExpense(
  supabase: CrmSupabaseClient,
  id: string,
  payload: Record<string, unknown>,
  actor: CrmActor
) {
  const { data: existing, error: existingError } = await supabase
    .from("crm_job_expenses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Expense was not found.");

  const patch: Record<string, unknown> = {};
  if (payload.amount !== undefined) {
    const amount = toMoney(payload.amount);
    if (amount <= 0) throw new CrmAuthError(400, "Expense amount must be greater than zero.");
    patch.amount = amount;
  }
  if (payload.label !== undefined) patch.label = requiredText(payload.label, "Expense label is required.");
  if (payload.category !== undefined) patch.category = normalizeExpenseCategory(payload.category);
  if (payload.incurred_on !== undefined) patch.incurred_on = payload.incurred_on || null;
  if (payload.notes !== undefined) patch.notes = optionalText(payload.notes);

  if (!Object.keys(patch).length) throw new CrmAuthError(400, "No supported expense fields provided.");

  patch.meta = {
    ...objectMeta((existing as CrmJobExpense & { meta?: unknown }).meta),
    lastUpdatedBy: actor.email,
    lastUpdatedAt: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("crm_job_expenses")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new CrmAuthError(502, "Expense could not be updated.");

  await recordCrmActivity(supabase, actor, {
    entityType: "expense",
    entityId: id,
    action: "update",
    before: existing,
    after: data
  });

  return data as CrmJobExpense;
}

export async function deleteCrmJobExpense(supabase: CrmSupabaseClient, id: string, actor: CrmActor) {
  const { data: existing, error: existingError } = await supabase
    .from("crm_job_expenses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) throw new CrmAuthError(404, "Expense was not found.");

  const { error } = await supabase.from("crm_job_expenses").delete().eq("id", id);
  if (error) throw new CrmAuthError(502, "Expense could not be deleted.");

  await recordCrmActivity(supabase, actor, {
    entityType: "expense",
    entityId: id,
    action: "delete",
    before: existing
  });

  return { id };
}

const allowedSettingKeys = new Set(["ken_opening_balance"]);

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

async function createPartnerPaymentBatchDirect(
  supabase: CrmSupabaseClient,
  person: CrmPaymentPerson,
  record: Record<string, unknown>,
  allocations: Array<Record<string, unknown>>
) {
  const table = person === "ken" ? "crm_ken_payments" : "crm_commission_payments";
  const allocationTable = person === "ken" ? "crm_ken_payment_allocations" : "crm_commission_payment_allocations";
  const paymentRecord = person === "ken" ? record : { recipient: person, ...record };
  let allocationTableForPayment: string | null = allocationTable;
  let { data: payment, error: paymentError } = await supabase.from(table).insert(paymentRecord).select("*").single();

  if ((paymentError || !payment) && person !== "ken") {
    console.warn(
      `${paymentPersonLabel(person)} payment table could not be used; storing partner payment metadata in crm_ken_payments fallback.`,
      paymentError?.message
    );
    const meta = typeof record.meta === "object" && record.meta ? record.meta : {};
    const fallbackRecord = {
      ...record,
      meta: {
        ...meta,
        partnerPaymentPerson: person,
        partnerPaymentFallbackTable: "crm_ken_payments",
        partnerPaymentOriginalTable: table
      }
    };
    const fallbackResult = await supabase.from("crm_ken_payments").insert(fallbackRecord).select("*").single();
    payment = fallbackResult.data;
    paymentError = fallbackResult.error;
    allocationTableForPayment = null;
  }

  if (paymentError || !payment) throw new CrmAuthError(502, `${paymentPersonLabel(person)} payment could not be saved.`);

  if (!allocationTableForPayment) return payment;

  const allocationRows = allocations.map((allocation) => ({
    ...allocation,
    payment_id: String(payment.id)
  }));
  const { error: allocationError } = await supabase.from(allocationTableForPayment).insert(allocationRows);
  if (allocationError) {
    console.warn(
      `${paymentPersonLabel(person)} payment allocation rows could not be saved; using payment metadata fallback.`,
      allocationError.message
    );
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
  if (payload.advance === true) {
    if (person === "ken") throw new CrmAuthError(400, "Advances are only available for Mike or Jessica.");
    const amount = toMoney(payload.amount);
    if (amount <= 0) throw new CrmAuthError(400, "Advance amount must be greater than zero.");
    const paidOn = optionalText(payload.paid_on) || new Date().toISOString().slice(0, 10);
    const note = optionalText(payload.note) || "Payment advance";
    const meta = { createdBy: actor.email, batchSource: "unified_payment_ledger", advancePayment: true };
    const payment = await createPartnerPaymentBatchDirect(supabase, person, {
      amount,
      paid_on: paidOn,
      period_month: monthStartDate(paidOn),
      note,
      created_by_email: actor.email,
      meta
    }, []);
    await recordCrmActivity(supabase, actor, {
      entityType: "commission_payment",
      entityId: String(payment.id),
      action: "create_advance",
      after: payment,
      metadata: { person, amount }
    });
    return { payment, allocations: [], dashboard: await loadCrmDashboardData(supabase) };
  }
  const dashboard = await loadCrmDashboardData(supabase);
  const selectedKeys = selectedPaymentItemKeys(payload);
  const personLedger = dashboard.partnerPaymentLedger.people[person];
  const activeItems = personLedger.activeItems;
  const selectedItemsByKey = new Map<string, CrmPartnerPaymentLedgerItem>();
  const ledgerMatchedKeys = new Set<string>();
  const addSelectedItem = (item: CrmPartnerPaymentLedgerItem | null | undefined) => {
    if (!item || item.remainingAmount <= 0) return;
    selectedItemsByKey.set(item.itemKey, item);
  };

  if (selectedKeys) {
    personLedger.items
      .filter((item) => selectedKeys.has(item.itemKey) || selectedKeys.has(item.id))
      .forEach((item) => {
        ledgerMatchedKeys.add(item.itemKey);
        addSelectedItem(item);
      });
    dashboard.bookkeepingRows
      .map((row) => buildUnpaidPartnerPaymentItemForRow(person, row))
      .filter((item): item is CrmPartnerPaymentLedgerItem => Boolean(item))
      .filter((item) => selectedKeys.has(item.itemKey) || selectedKeys.has(item.id))
      .filter((item) => !ledgerMatchedKeys.has(item.itemKey))
      .forEach(addSelectedItem);
  } else {
    activeItems.forEach(addSelectedItem);
  }

  const selectedItems = [...selectedItemsByKey.values()].sort(comparePartnerItems);

  if (!selectedItems.length) {
    throw new CrmAuthError(400, `${paymentPersonLabel(person)} has no active unpaid jobs to pay.`);
  }

  const grossPayableAmount = Math.round(selectedItems.reduce((sum, item) => sum + item.remainingAmount, 0) * 100) / 100;
  const advanceApplied = resolvePartnerPaymentAdvanceOffset(person, grossPayableAmount, personLedger.advanceBalance);
  const payableAmount = Math.round((grossPayableAmount - advanceApplied) * 100) / 100;
  const amount = resolveFullPartnerPaymentAmount(payload.amount, payableAmount);
  const paidOn = optionalText(payload.paid_on) || selectedItems[0]?.closedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const periodMonth = optionalText(payload.period_month) || monthStartDate(paidOn);
  const note = optionalText(payload.note);
  const allocations = paymentAllocationRows({
    person,
    paymentId: "00000000-0000-0000-0000-000000000000",
    items: selectedItems,
    amount: grossPayableAmount,
    actor
  });

  if (!allocations.length) {
    throw new CrmAuthError(400, "No payable allocation rows were created.");
  }

  const meta = {
    createdBy: actor.email,
    batchSource: "unified_payment_ledger",
    kenBuyoutApplied: person === "ken",
    selectedItemCount: selectedItems.length,
    selectedItemKeys: selectedItems.map((item) => item.itemKey),
    grossPayableAmount,
    advanceApplied,
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
    if (rpcError) {
      console.warn(
        `${paymentPersonLabel(person)} payment batch RPC could not be used; using direct insert fallback.`,
        rpcError.message
      );
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

  const receiptEmail = await sendPartnerPaymentReceiptEmail({
    paymentId: String(payment.id),
    person,
    paidOn,
    amount,
    note,
    createdByEmail: actor.email,
    advanceApplied,
    allocations: allocations.map(partnerPaymentReceiptAllocationFromRow)
  });

  await recordCrmActivity(supabase, actor, {
    entityType: person === "ken" ? "ken_payment" : "commission_payment",
    entityId: String(payment.id),
    action: "create_batch",
    after: payment,
    metadata: {
      person,
      allocationCount: allocations.length,
      allocatedAmount: amount,
      grossPayableAmount,
      advanceApplied,
      receiptEmail
    }
  });

  return {
    payment,
    allocations,
    receiptEmail,
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
  assertMikePaymentAdmin(actor);

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
