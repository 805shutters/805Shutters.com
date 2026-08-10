import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  backfillPartialPublicQuoteAcceptance,
  buildPartialAcceptancePlan,
  buildSignedContractSnapshot,
  linkedSalesQuoteIdForPublicQuote,
  loadPublicQuoteById,
  type PublicQuote,
} from "@/lib/crm/public-quote";

const CONFIRMATION = "REPAIR_SIGNED_PARTIAL_ACCEPTANCE";

type RecordValue = Record<string, unknown>;

export type HistoricalPartialRepairInput = {
  mode: "dryRun" | "apply";
  confirmation: string;
  expectedQuoteNumber: string;
  expectedSignedAt: string;
  expectedSourceTotal: number;
  expectedSelectedTotal: number;
  expectedDepositPaid: number;
  selectedLineIds: string[];
};

export type HistoricalPartialRepairEvidence = {
  quote: {
    id: string;
    updated_at: string;
    external_id: string | null;
    quote_number: string | null;
    quote_total: number | string | null;
    signed_at: string | null;
    share_token: string | null;
    customer_printed_name: string | null;
    meta: unknown;
  };
  job: { id: string; deposit_paid: number | string | null };
  contract: {
    id: string;
    updated_at: string;
    total_amount: number | string | null;
    signed_at: string | null;
    meta: unknown;
  };
  publicQuote: PublicQuote;
};

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}
function cents(value: unknown): number {
  return Math.round((Number(value) || 0) * 100);
}

function requireMoney(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CrmAuthError(400, `${label} must be a non-negative dollar amount.`);
  }
  return Math.round(parsed * 100) / 100;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CrmAuthError(400, `${label} is required.`);
  }
  return value.trim();
}

export function parseHistoricalPartialRepairInput(value: unknown): HistoricalPartialRepairInput {
  const body = record(value);
  const mode = body.mode === "dryRun" || body.mode === "apply" ? body.mode : null;
  if (!mode) throw new CrmAuthError(400, "mode must be dryRun or apply.");
  const selectedLineIds = Array.isArray(body.selectedLineIds)
    ? body.selectedLineIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
    : [];
  if (!selectedLineIds.length || selectedLineIds.length !== (body.selectedLineIds as unknown[])?.length) {
    throw new CrmAuthError(400, "selectedLineIds must contain at least one valid line id.");
  }
  if (new Set(selectedLineIds).size !== selectedLineIds.length) {
    throw new CrmAuthError(400, "selectedLineIds must not contain duplicates.");
  }
  const confirmation = requireText(body.confirmation, "confirmation");
  if (mode === "apply" && confirmation !== CONFIRMATION) {
    throw new CrmAuthError(400, `Apply requires confirmation ${CONFIRMATION}.`);
  }
  return {
    mode,
    confirmation,
    expectedQuoteNumber: requireText(body.expectedQuoteNumber, "expectedQuoteNumber"),
    expectedSignedAt: requireText(body.expectedSignedAt, "expectedSignedAt"),
    expectedSourceTotal: requireMoney(body.expectedSourceTotal, "expectedSourceTotal"),
    expectedSelectedTotal: requireMoney(body.expectedSelectedTotal, "expectedSelectedTotal"),
    expectedDepositPaid: requireMoney(body.expectedDepositPaid, "expectedDepositPaid"),
    selectedLineIds,
  };
}

export function validateHistoricalPartialRepairEvidence(
  evidence: HistoricalPartialRepairEvidence,
  input: HistoricalPartialRepairInput,
) {
  const { quote, job, contract, publicQuote } = evidence;
  if (quote.quote_number !== input.expectedQuoteNumber) {
    throw new CrmAuthError(409, "The quote number changed; no repair was applied.");
  }
  if (!quote.signed_at || quote.signed_at !== input.expectedSignedAt) {
    throw new CrmAuthError(409, "The signature timestamp changed; no repair was applied.");
  }
  if (!quote.share_token) {
    throw new CrmAuthError(409, "The signed quote has no customer share token.");
  }
  if (cents(quote.quote_total) !== cents(input.expectedSourceTotal)) {
    throw new CrmAuthError(409, "The source quote total changed; no repair was applied.");
  }
  if (cents(job.deposit_paid) !== cents(input.expectedDepositPaid)) {
    throw new CrmAuthError(409, "The recorded deposit changed; no repair was applied.");
  }
  if (contract.signed_at !== input.expectedSignedAt) {
    throw new CrmAuthError(409, "The signed contract timestamp changed; no repair was applied.");
  }
  if (cents(contract.total_amount) !== cents(input.expectedSourceTotal)) {
    throw new CrmAuthError(409, "The signed contract source total changed; no repair was applied.");
  }
  const quoteMeta = record(quote.meta);
  if (Object.keys(record(quoteMeta.partial_acceptance)).length) {
    throw new CrmAuthError(409, "This quote already has a partial-acceptance partition.");
  }
  const storedIds = record(quoteMeta.signed_selection).lineItemIds;
  if (storedIds !== undefined) {
    if (
      !Array.isArray(storedIds) ||
      storedIds.length !== input.selectedLineIds.length ||
      [...storedIds].sort().join("|") !== [...input.selectedLineIds].sort().join("|")
    ) {
      throw new CrmAuthError(409, "The stored signed selection conflicts with this repair.");
    }
  }
  const plan = buildPartialAcceptancePlan(publicQuote, input.selectedLineIds);
  if (cents(plan.current.total) !== cents(input.expectedSelectedTotal)) {
    throw new CrmAuthError(409, "The selected lines do not match the expected signed total.");
  }
  return plan;
}

function summarizeQuote(quote: PublicQuote) {
  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    total: quote.total,
    lines: quote.lines.map((line) => ({
      id: line.id,
      lineItemId: line.lineItemId,
      room: line.room,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
    })),
  };
}

async function reconcileCompletedHistoricalPartition(
  supabase: SupabaseClient,
  input: HistoricalPartialRepairInput,
  quote: HistoricalPartialRepairEvidence["quote"] & { job_id: string; quote_number: string | null },
  job: HistoricalPartialRepairEvidence["job"],
  contract: HistoricalPartialRepairEvidence["contract"],
) {
  const quoteMeta = record(quote.meta);
  const partial = record(quoteMeta.partial_acceptance);
  const prePartition = record(partial.pre_partition);
  const signedSelection = record(quoteMeta.signed_selection);
  const storedIds = Array.isArray(signedSelection.lineItemIds)
    ? signedSelection.lineItemIds.filter((id): id is string => typeof id === "string")
    : [];
  const futureQuoteId = typeof partial.future_quote_id === "string" ? partial.future_quote_id : "";
  const futureJobId = typeof partial.future_job_id === "string" ? partial.future_job_id : "";
  if (
    partial.role !== "current" ||
    partial.historical_backfill !== true ||
    !futureQuoteId ||
    !futureJobId ||
    quote.quote_number !== input.expectedQuoteNumber ||
    quote.signed_at !== input.expectedSignedAt ||
    cents(prePartition.quote_total) !== cents(input.expectedSourceTotal) ||
    cents(quote.quote_total) !== cents(input.expectedSelectedTotal) ||
    cents(job.deposit_paid) !== cents(input.expectedDepositPaid) ||
    cents(contract.total_amount) !== cents(input.expectedSelectedTotal) ||
    storedIds.length !== input.selectedLineIds.length ||
    [...storedIds].sort().join("|") !== [...input.selectedLineIds].sort().join("|")
  ) {
    throw new CrmAuthError(409, "The existing partial partition does not match this repair evidence.");
  }

  if (input.mode === "apply") {
    const linkedSalesQuoteId = linkedSalesQuoteIdForPublicQuote(quote);
    if (linkedSalesQuoteId) {
      const { data: linked, error: linkedReadError } = await supabase
        .from("sales_quotes")
        .select("id,total_amount")
        .eq("id", linkedSalesQuoteId)
        .maybeSingle();
      if (linkedReadError || !linked) {
        throw new CrmAuthError(409, "The linked legacy quote could not be reconciled.");
      }
      if (cents(linked.total_amount) === cents(input.expectedSourceTotal)) {
        const { data: updated, error: updateError } = await supabase
          .from("sales_quotes")
          .update({ total_amount: input.expectedSelectedTotal })
          .eq("id", linkedSalesQuoteId)
          .eq("total_amount", input.expectedSourceTotal)
          .select("id")
          .maybeSingle();
        if (updateError || !updated) {
          throw new CrmAuthError(409, "The linked legacy quote changed before reconciliation.");
        }
      } else if (cents(linked.total_amount) !== cents(input.expectedSelectedTotal)) {
        throw new CrmAuthError(409, "The linked legacy quote total conflicts with this repair.");
      }
    }
  }

  const [current, future] = await Promise.all([
    loadPublicQuoteById(supabase, quote.id),
    loadPublicQuoteById(supabase, futureQuoteId),
  ]);
  const expectedFutureTotal = Math.round((input.expectedSourceTotal - input.expectedSelectedTotal) * 100) / 100;
  if (
    !current ||
    !future ||
    cents(current.total) !== cents(input.expectedSelectedTotal) ||
    cents(future.total) !== cents(expectedFutureTotal)
  ) {
    throw new CrmAuthError(409, "The existing current/future projections do not match this repair.");
  }
  if (input.mode === "dryRun") {
    return { mode: "dryRun" as const, current: summarizeQuote(current), future: summarizeQuote(future) };
  }

  const finalContractMeta = {
    ...record(contract.meta),
    contract_snapshot: buildSignedContractSnapshot(
      current,
      input.expectedSignedAt,
      quote.customer_printed_name || current.customerName,
    ),
    historical_partial_repair: {
      ...record(record(contract.meta).historical_partial_repair),
      completedAt: new Date().toISOString(),
      futureQuoteId,
      futureJobId,
    },
  };
  const { data: updatedContract, error: contractError } = await supabase
    .from("crm_customer_contracts")
    .update({ meta: finalContractMeta })
    .eq("id", contract.id)
    .eq("updated_at", contract.updated_at)
    .eq("total_amount", input.expectedSelectedTotal)
    .select("id")
    .maybeSingle();
  if (contractError || !updatedContract) {
    throw new CrmAuthError(409, "The signed contract changed before reconciliation.");
  }
  return {
    mode: "apply" as const,
    current: summarizeQuote(current),
    future: summarizeQuote(future),
    futureJobId,
  };
}

export async function repairHistoricalPartialAcceptance(
  supabase: SupabaseClient,
  quoteId: string,
  rawInput: unknown,
  actor: { email: string; userId?: string },
) {
  const input = parseHistoricalPartialRepairInput(rawInput);
  const { data: quote, error: quoteError } = await supabase
    .from("crm_quotes")
    .select("id,updated_at,external_id,job_id,quote_number,quote_total,signed_at,share_token,customer_printed_name,meta")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteError || !quote) throw new CrmAuthError(404, "The signed quote was not found.");
  if (!quote.job_id) throw new CrmAuthError(409, "The signed quote has no linked job.");

  const [{ data: job, error: jobError }, { data: contract, error: contractError }, publicQuote] =
    await Promise.all([
      supabase.from("crm_jobs").select("id,deposit_paid").eq("id", quote.job_id).maybeSingle(),
      supabase
        .from("crm_customer_contracts")
        .select("id,updated_at,total_amount,signed_at,meta")
        .eq("external_source", "crm_quote")
        .eq("external_id", `contract:${quoteId}`)
        .maybeSingle(),
      loadPublicQuoteById(supabase, quoteId),
    ]);
  if (jobError || !job) throw new CrmAuthError(409, "The signed quote's job was not found.");
  if (contractError || !contract) throw new CrmAuthError(409, "The signed customer contract was not found.");
  if (!publicQuote) throw new CrmAuthError(409, "The customer quote could not be projected.");

  if (record(record(quote.meta).partial_acceptance).role === "current") {
    return reconcileCompletedHistoricalPartition(supabase, input, quote, job, contract);
  }

  const plan = validateHistoricalPartialRepairEvidence(
    { quote, job, contract, publicQuote },
    input,
  );
  const dryRunResult = {
    mode: input.mode,
    current: summarizeQuote(plan.current),
    future: summarizeQuote(plan.future),
    evidence: {
      quoteNumber: quote.quote_number,
      signedAt: quote.signed_at,
      sourceTotal: Number(quote.quote_total),
      selectedTotal: plan.current.total,
      depositPaid: Number(job.deposit_paid),
    },
  };
  if (input.mode === "dryRun") return dryRunResult;

  const originalQuoteMeta = record(quote.meta);
  const originalContractMeta = record(contract.meta);
  const stagedAt = new Date().toISOString();
  const stagedQuoteMeta = {
    ...originalQuoteMeta,
    signed_selection: {
      lineItemIds: plan.selectedLineIds,
      subtotal: plan.current.subtotal,
      total: plan.current.total,
    },
    partial_acceptance: {
      role: "current",
      repair_staging: true,
      staged_at: stagedAt,
      staged_by: actor.email,
    },
  };
  const stagedContractMeta = {
    ...originalContractMeta,
    historical_partial_repair: {
      stagedAt,
      stagedBy: actor.email,
      sourceTotal: input.expectedSourceTotal,
      selectedTotal: input.expectedSelectedTotal,
      originalContractSnapshot: originalContractMeta.contract_snapshot ?? null,
    },
  };

  const { data: stagedQuote, error: stageQuoteError } = await supabase
    .from("crm_quotes")
    .update({ meta: stagedQuoteMeta })
    .eq("id", quoteId)
    .eq("updated_at", quote.updated_at)
    .eq("signed_at", input.expectedSignedAt)
    .eq("quote_total", input.expectedSourceTotal)
    .select("id,updated_at")
    .maybeSingle();
  if (stageQuoteError || !stagedQuote) {
    throw new CrmAuthError(409, "The quote changed before repair staging; no repair was applied.");
  }

  const { data: stagedContract, error: stageContractError } = await supabase
    .from("crm_customer_contracts")
    .update({ total_amount: input.expectedSelectedTotal, meta: stagedContractMeta })
    .eq("id", contract.id)
    .eq("updated_at", contract.updated_at)
    .eq("signed_at", input.expectedSignedAt)
    .eq("total_amount", input.expectedSourceTotal)
    .select("id,updated_at")
    .maybeSingle();
  if (stageContractError || !stagedContract) {
    await supabase
      .from("crm_quotes")
      .update({ meta: originalQuoteMeta })
      .eq("id", quoteId)
      .eq("updated_at", stagedQuote.updated_at);
    throw new CrmAuthError(409, "The contract changed before repair staging; no repair was applied.");
  }

  let repaired: { futureQuoteId: string; futureJobId: string };
  try {
    repaired = await backfillPartialPublicQuoteAcceptance(supabase, {
      quoteId,
      token: quote.share_token,
      selectedLineIds: plan.selectedLineIds,
      expectedSignedAt: input.expectedSignedAt,
      expectedContractTotal: input.expectedSelectedTotal,
      actor,
    });
  } catch (error) {
    const { data: rolledBackQuote } = await supabase
      .from("crm_quotes")
      .update({ meta: originalQuoteMeta })
      .eq("id", quoteId)
      .eq("updated_at", stagedQuote.updated_at)
      .select("id")
      .maybeSingle();
    if (rolledBackQuote) {
      await supabase
        .from("crm_customer_contracts")
        .update({ total_amount: input.expectedSourceTotal, meta: originalContractMeta })
        .eq("id", contract.id)
        .eq("updated_at", stagedContract.updated_at)
        .eq("total_amount", input.expectedSelectedTotal);
      throw error;
    }
    throw new CrmAuthError(
      502,
      "The partition crossed its commit boundary but downstream reconciliation failed. Inspect the linked current/future quotes before retrying.",
    );
  }

  const [current, future] = await Promise.all([
    loadPublicQuoteById(supabase, quoteId),
    loadPublicQuoteById(supabase, repaired.futureQuoteId),
  ]);
  if (!current || !future) {
    throw new CrmAuthError(502, "The repaired current/future quotes could not be reloaded.");
  }
  const finalContractMeta = {
    ...stagedContractMeta,
    contract_snapshot: buildSignedContractSnapshot(
      current,
      input.expectedSignedAt,
      quote.customer_printed_name || current.customerName,
    ),
    historical_partial_repair: {
      ...record(stagedContractMeta.historical_partial_repair),
      completedAt: new Date().toISOString(),
      futureQuoteId: repaired.futureQuoteId,
      futureJobId: repaired.futureJobId,
    },
  };
  const { data: updatedSnapshot, error: snapshotError } = await supabase
    .from("crm_customer_contracts")
    .update({ meta: finalContractMeta })
    .eq("id", contract.id)
    .eq("updated_at", stagedContract.updated_at)
    .eq("total_amount", input.expectedSelectedTotal)
    .select("id")
    .maybeSingle();
  if (snapshotError || !updatedSnapshot) {
    throw new CrmAuthError(
      502,
      "The quote split completed, but the corrected signed-contract snapshot needs reconciliation.",
    );
  }

  return {
    mode: "apply" as const,
    current: summarizeQuote(current),
    future: summarizeQuote(future),
    futureJobId: repaired.futureJobId,
  };
}
