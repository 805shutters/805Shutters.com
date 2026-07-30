import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";

export const INSTALLER_CUSTOMER_BALANCE_META_KEY = "customer_balance";
export const INSTALLER_CUSTOMER_BALANCE_SCHEMA = "805_installer_customer_balance_v1";

type MoneyRow = {
  amount?: number | string | null;
};

export type InstallerCustomerBalanceSnapshot = {
  schema: typeof INSTALLER_CUSTOMER_BALANCE_SCHEMA;
  contract_id: string;
  contract_total: number;
  recorded_payments_total: number;
  payment_record_count: number;
  credits_in_total: number;
  credits_out_total: number;
  remaining_customer_balance: number;
  contract_signed_at: string;
  calculated_at: string;
};

type InstallerBalanceForm = {
  id: string;
  quote_id: string;
  meta?: Record<string, unknown>;
};

function strictMoney(value: unknown, label: string, options: { positive?: boolean } = {}) {
  if (value === null || value === undefined || value === "") {
    throw new CrmAuthError(409, `${label} is missing.`);
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (options.positive && amount <= 0)) {
    throw new CrmAuthError(409, `${label} is invalid.`);
  }
  return Math.round(amount * 100) / 100;
}

function sumStrictMoney(rows: MoneyRow[], label: string) {
  return Math.round(
    rows.reduce((sum, row, index) => sum + strictMoney(row.amount, `${label} row ${index + 1}`), 0) * 100,
  ) / 100;
}

function exactInstant(value: unknown, label: string) {
  const instant = String(value || "").trim();
  if (!instant || !Number.isFinite(new Date(instant).getTime())) {
    throw new CrmAuthError(409, `${label} is missing or invalid.`);
  }
  return instant;
}

export function calculateInstallerCustomerBalance(input: {
  contractId: unknown;
  contractTotal: unknown;
  contractSignedAt: unknown;
  payments: MoneyRow[];
  creditsIn?: MoneyRow[];
  creditsOut?: MoneyRow[];
  calculatedAt?: string;
}): InstallerCustomerBalanceSnapshot {
  const contractId = String(input.contractId || "").trim();
  if (!contractId) throw new CrmAuthError(409, "The signed customer contract identifier is missing.");
  if (!Array.isArray(input.payments)) {
    throw new CrmAuthError(409, "The recorded customer payment ledger is missing.");
  }

  const contractTotal = strictMoney(input.contractTotal, "The signed customer contract total", {
    positive: true,
  });
  const recordedPaymentsTotal = sumStrictMoney(input.payments, "Customer payment");
  const creditsInTotal = sumStrictMoney(input.creditsIn || [], "Incoming customer credit");
  const creditsOutTotal = sumStrictMoney(input.creditsOut || [], "Outgoing customer credit");
  const remainingCustomerBalance = Math.max(
    Math.round(
      (contractTotal - recordedPaymentsTotal - creditsInTotal + creditsOutTotal) * 100,
    ) / 100,
    0,
  );

  return {
    schema: INSTALLER_CUSTOMER_BALANCE_SCHEMA,
    contract_id: contractId,
    contract_total: contractTotal,
    recorded_payments_total: recordedPaymentsTotal,
    payment_record_count: input.payments.length,
    credits_in_total: creditsInTotal,
    credits_out_total: creditsOutTotal,
    remaining_customer_balance: remainingCustomerBalance,
    contract_signed_at: exactInstant(input.contractSignedAt, "The signed customer contract timestamp"),
    calculated_at: exactInstant(
      input.calculatedAt || new Date().toISOString(),
      "The installer balance calculation timestamp",
    ),
  };
}

export function installerCustomerBalanceSnapshot(
  form: Pick<InstallerBalanceForm, "meta">,
): InstallerCustomerBalanceSnapshot | null {
  const value = form.meta?.[INSTALLER_CUSTOMER_BALANCE_META_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Partial<InstallerCustomerBalanceSnapshot>;
  try {
    const parsed = calculateInstallerCustomerBalance({
      contractId: snapshot.contract_id,
      contractTotal: snapshot.contract_total,
      contractSignedAt: snapshot.contract_signed_at,
      payments: [{
        amount: snapshot.recorded_payments_total,
      }],
      creditsIn: [{ amount: snapshot.credits_in_total }],
      creditsOut: [{ amount: snapshot.credits_out_total }],
      calculatedAt: snapshot.calculated_at,
    });
    if (
      snapshot.schema !== INSTALLER_CUSTOMER_BALANCE_SCHEMA ||
      !Number.isInteger(snapshot.payment_record_count) ||
      Number(snapshot.payment_record_count) < 0 ||
      parsed.remaining_customer_balance !== snapshot.remaining_customer_balance
    ) {
      return null;
    }
    return {
      ...parsed,
      payment_record_count: Number(snapshot.payment_record_count),
    };
  } catch {
    return null;
  }
}

export function requireInstallerCustomerBalance(
  form: Pick<InstallerBalanceForm, "meta">,
): InstallerCustomerBalanceSnapshot {
  const snapshot = installerCustomerBalanceSnapshot(form);
  if (!snapshot) {
    throw new CrmAuthError(
      409,
      "The installer form is missing a verified current customer balance and cannot be delivered.",
    );
  }
  return snapshot;
}

export async function refreshInstallerCustomerBalance(
  supabase: SupabaseClient,
  form: InstallerBalanceForm,
): Promise<InstallerBalanceForm> {
  const [contractResult, paymentsResult, creditsInResult, creditsOutResult] = await Promise.all([
    supabase
      .from("crm_customer_contracts")
      .select("id,total_amount,signed_at")
      .eq("quote_id", form.quote_id)
      .not("signed_at", "is", null)
      .order("signed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("crm_quote_bookkeeping_payments")
      .select("amount")
      .eq("quote_id", form.quote_id),
    supabase
      .from("crm_quote_bookkeeping_credits")
      .select("amount")
      .eq("to_quote_id", form.quote_id),
    supabase
      .from("crm_quote_bookkeeping_credits")
      .select("amount")
      .eq("from_quote_id", form.quote_id),
  ]);
  const ledgerError =
    contractResult.error ||
    paymentsResult.error ||
    creditsInResult.error ||
    creditsOutResult.error;
  if (ledgerError) {
    throw new CrmAuthError(
      502,
      `The current installer customer balance could not be verified: ${ledgerError.message}`,
    );
  }
  if (!contractResult.data) {
    throw new CrmAuthError(
      409,
      "A signed customer contract with a current total is required before the installer form can be delivered.",
    );
  }

  const contract = contractResult.data as {
    id?: unknown;
    total_amount?: unknown;
    signed_at?: unknown;
  };
  const snapshot = calculateInstallerCustomerBalance({
    contractId: contract.id,
    contractTotal: contract.total_amount,
    contractSignedAt: contract.signed_at,
    payments: (paymentsResult.data || []) as MoneyRow[],
    creditsIn: (creditsInResult.data || []) as MoneyRow[],
    creditsOut: (creditsOutResult.data || []) as MoneyRow[],
  });
  const meta = {
    ...(form.meta || {}),
    [INSTALLER_CUSTOMER_BALANCE_META_KEY]: snapshot,
  };
  const { error: updateError } = await supabase
    .from("crm_installer_forms")
    .update({ meta })
    .eq("id", form.id);
  if (updateError) {
    throw new CrmAuthError(
      502,
      `The verified installer customer balance could not be saved: ${updateError.message}`,
    );
  }
  return { ...form, meta };
}
