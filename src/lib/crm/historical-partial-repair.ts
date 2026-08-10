import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  backfillPartialPublicQuoteAcceptance,
  buildPartialAcceptancePlan,
  buildSignedContractSnapshot,
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

export async function repairHistoricalPartialAcceptance(
  supabase: SupabaseClient,
  quoteId: string,
  rawInput: unknown,
  actor: { email: string; userId?: string },
) {
  const input = parseHistoricalPartialRepairInput(rawInput);
  const { data: quote, error: quoteError } = await supabase
    .from("crm_quotes")
    .select("id,job_id,quote_number,quote_total,signed_at,share_token,customer_printed_name,meta")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteError || !quote) throw new CrmAuthError(404, "The signed quote was not found.");
  if (!quote.job_id) throw new CrmAuthError(409, "The signed quote has no linked job.");

  const [{ data: job, error: jobError }, { data: contract, error: contractError }, publicQuote] =
    await Promise.all([
      supabase.from("crm_jobs").select("id,deposit_paid").eq("id", quote.job_id).maybeSingle(),
      supabase
        .from("crm_customer_contracts")
        .select("id,total_amount,signed_at,meta")
        .eq("external_source", "crm_quote")
        .eq("external_id", `contract:${quoteId}`)
        .maybeSingle(),
      loadPublicQuoteById(supabase, quoteId),
    ]);
  if (jobError || !job) throw new CrmAuthError(409, "The signed quote's job was not found.");
  if (contractError || !contract) throw new CrmAuthError(409, "The signed customer contract was not found.");
  if (!publicQuote) throw new CrmAuthError(409, "The customer quote could not be projected.");

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
    .eq("signed_at", input.expectedSignedAt)
    .eq("quote_total", input.expectedSourceTotal)
    .eq("meta", originalQuoteMeta)
    .select("id")
    .maybeSingle();
  if (stageQuoteError || !stagedQuote) {
    throw new CrmAuthError(409, "The quote changed before repair staging; no repair was applied.");
  }

  const { data: stagedContract, error: stageContractError } = await supabase
    .from("crm_customer_contracts")
    .update({ total_amount: input.expectedSelectedTotal, meta: stagedContractMeta })
    .eq("id", contract.id)
    .eq("signed_at", input.expectedSignedAt)
    .eq("total_amount", input.expectedSourceTotal)
    .eq("meta", originalContractMeta)
    .select("id")
    .maybeSingle();
  if (stageContractError || !stagedContract) {
    await supabase
      .from("crm_quotes")
      .update({ meta: originalQuoteMeta })
      .eq("id", quoteId)
      .eq("meta", stagedQuoteMeta);
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
      .eq("meta", stagedQuoteMeta)
      .select("id")
      .maybeSingle();
    if (rolledBackQuote) {
      await supabase
        .from("crm_customer_contracts")
        .update({ total_amount: input.expectedSourceTotal, meta: originalContractMeta })
        .eq("id", contract.id)
        .eq("total_amount", input.expectedSelectedTotal)
        .eq("meta", stagedContractMeta);
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
  const { error: snapshotError } = await supabase
    .from("crm_customer_contracts")
    .update({ meta: finalContractMeta })
    .eq("id", contract.id)
    .eq("total_amount", input.expectedSelectedTotal)
    .eq("meta", stagedContractMeta);
  if (snapshotError) {
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
