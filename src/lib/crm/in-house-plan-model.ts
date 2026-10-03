/** Shared, side-effect-free in-house-plan rules. All amounts are integer USD cents. */
export type PlanTarget = {
  quoteId?: string | null;
  bookkeepingEntryId?: string | null;
};
export type PlanStatus =
  | "waiting_deposit"
  | "active"
  | "paused"
  | "review"
  | "completed"
  | "cancelled";
export type PlanPayment = {
  id: string;
  cents: number;
  label: string;
  installmentId?: string | null;
  paidAt: string;
  method: string;
};
export type PlanSnapshot = {
  target: PlanTarget;
  jobId: string | null;
  customerName: string;
  quoteNumber: string | null;
  email: string | null;
  phone: string | null;
  acceptedDate: string | null;
  totalCents: number;
  depositCents: number;
  depositOutstandingCents: number;
  outstandingCents: number;
  paidCents: number;
  creditFingerprint: string;
  payments: PlanPayment[];
};
export type PlanInstallment = {
  id: string;
  plan_id: string;
  number: number;
  amount_cents: number;
  paid_cents: number;
  due_date: string | null;
  paid_at?: string | null;
  payment_method?: string | null;
};
export type PaymentPlan = {
  id: string;
  quote_id: string | null;
  bookkeeping_entry_id: string | null;
  status: PlanStatus;
  principal_cents: number;
  baseline: PlanSnapshot;
  current: PlanSnapshot;
  anchor_date: string | null;
  processing_error?: string | null;
  review_reason: string | null;
  approved_by: string;
  approved_at: string;
  updated_at: string;
  installments: PlanInstallment[];
};
export type PlanAllocation = {
  payment_id: string;
  installment_id: string;
  amount_cents: number;
};
export type PlanNotification = {
  id: string;
  plan_id: string;
  event_key: string;
  channel: "email" | "sms" | "owner";
  recipient: string | null;
  status:
    | "pending"
    | "sending"
    | "accepted"
    | "delivered"
    | "failed"
    | "unknown"
    | "skipped";
  provider_id: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
};
export type PlanView = PaymentPlan & {
  notifications: PlanNotification[];
  history: {
    action: string;
    actor: string;
    created_at: string;
    detail: string | null;
  }[];
};
export const PLAN_TIME_ZONE = "America/Los_Angeles";
export function planManager(email: string | null | undefined) {
  return ["805shutters@gmail.com", "jessica@805shutters.com"].includes(
    (email || "").trim().toLowerCase(),
  );
}
export function planTargetKey(target: PlanTarget) {
  if (Boolean(target.quoteId) === Boolean(target.bookkeepingEntryId))
    throw new Error("Choose exactly one quote or bookkeeping record.");
  return target.quoteId
    ? `quote:${target.quoteId}`
    : `entry:${target.bookkeepingEntryId}`;
}
export function targetForPlan(
  plan: Pick<PaymentPlan, "quote_id" | "bookkeeping_entry_id">,
): PlanTarget {
  return {
    quoteId: plan.quote_id,
    bookkeepingEntryId: plan.bookkeeping_entry_id,
  };
}
export function planDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PLAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function planHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PLAN_TIME_ZONE,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}
export function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
      ? value
      : null;
  return Number.isFinite(Date.parse(value)) ? planDate(new Date(value)) : null;
}
export function monthlyDate(anchor: string, months: number): string {
  const [y, m, d] = anchor.split("-").map(Number);
  const end = new Date(Date.UTC(y, m + months, 0));
  return `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, end.getUTCDate())).padStart(2, "0")}`;
}
export function splitThirds(cents: number): [number, number, number] {
  if (!Number.isSafeInteger(cents) || cents < 3)
    throw new Error("The remaining balance must be at least $0.03.");
  const third = Math.floor(cents / 3);
  return [third, third, cents - third * 2];
}
export const unpaidCents = (i: PlanInstallment) =>
  Math.max(i.amount_cents - i.paid_cents, 0);
export function installmentStatus(i: PlanInstallment, today = planDate()) {
  return !unpaidCents(i)
    ? "Paid"
    : !i.due_date
      ? "Waiting for full deposit"
      : i.due_date < today
        ? "Overdue"
        : i.due_date === today
          ? "Due today"
          : "Scheduled";
}
export function overdueWeek(due: string, today: string) {
  const days = Math.floor((Date.parse(today) - Date.parse(due)) / 86400000);
  return days < 1 ? null : Math.floor((days - 1) / 7);
}
export function summarizePlans(plans: PaymentPlan[], today = planDate()) {
  const open = plans.filter(
    (p) => !["cancelled", "completed"].includes(p.status),
  );
  return {
    active: open.filter((p) => ["active", "waiting_deposit"].includes(p.status))
      .length,
    outstanding: open.reduce(
      (s, p) => s + p.installments.reduce((n, i) => n + unpaidCents(i), 0),
      0,
    ),
    dueThisMonth: open
      .flatMap((p) => p.installments)
      .filter((i) => i.due_date?.slice(0, 7) === today.slice(0, 7))
      .reduce((s, i) => s + unpaidCents(i), 0),
    overdue: open
      .flatMap((p) => p.installments)
      .filter((i) => i.due_date && i.due_date < today)
      .reduce((s, i) => s + unpaidCents(i), 0),
  };
}
export function reconcilePlan(plan: PaymentPlan, snapshot: PlanSnapshot) {
  let reason: string | null = null;
  if (
    snapshot.totalCents !== plan.baseline.totalCents ||
    snapshot.creditFingerprint !== plan.baseline.creditFingerprint
  )
    reason = "Contract total or credits changed. Review the agreed schedule.";
  const current = new Map(snapshot.payments.map((p) => [p.id, p]));
  for (const old of plan.current.payments) {
    const next = current.get(old.id);
    if (
      !next ||
      next.cents !== old.cents ||
      next.paidAt !== old.paidAt ||
      next.installmentId !== old.installmentId ||
      next.label !== old.label
    )
      reason =
        "A receipt was removed, changed or reclassified. Review the schedule.";
  }
  if (
    snapshot.payments.some(
      (p) =>
        p.installmentId &&
        !plan.installments.some((i) => i.id === p.installmentId),
    )
  )
    reason =
      "An identified receipt references another installment. Review required.";
  if (
    snapshot.payments.some(
      (p) => !dateOnly(p.paidAt) || !Number.isSafeInteger(p.cents),
    )
  )
    reason = "A receipt date or amount could not be verified.";
  if (
    new Set(snapshot.payments.map((p) => p.id)).size !==
    snapshot.payments.length
  )
    reason = "Duplicate receipt identity requires review.";
  if (snapshot.payments.some((p) => p.cents < 0))
    reason = "A refund requires review.";
  const installments = plan.installments.map((i) => ({
    ...i,
    paid_cents: 0,
    paid_at: null as string | null,
    payment_method: null as string | null,
  }));
  const allocations: PlanAllocation[] = [];
  let anchor: string | null = null;
  for (const p of [...snapshot.payments].sort(
    (a, b) => a.paidAt.localeCompare(b.paidAt) || a.id.localeCompare(b.id),
  )) {
    let remaining = Math.max(p.cents, 0);
    const ordered = [...installments].sort(
      (a, b) =>
        Number(b.id === p.installmentId) - Number(a.id === p.installmentId) ||
        a.number - b.number,
    );
    for (const i of ordered) {
      const amount = Math.min(remaining, unpaidCents(i));
      if (amount) {
        allocations.push({
          payment_id: p.id,
          installment_id: i.id,
          amount_cents: amount,
        });
        i.paid_cents += amount;
        i.paid_at = p.paidAt;
        i.payment_method = p.method;
        if (i.number === 1 && !unpaidCents(i) && !anchor)
          anchor = dateOnly(p.paidAt);
      }
      remaining -= amount;
    }
    if (remaining > 0)
      reason = "Payments exceed the agreed total. Review the ledger.";
  }
  if (plan.anchor_date && anchor !== plan.anchor_date)
    reason = "The deposit receipt date changed. Review the agreed due dates.";
  anchor = plan.anchor_date || anchor;
  const paid = installments.reduce((n, i) => n + i.paid_cents, 0);
  if (snapshot.outstandingCents !== Math.max(snapshot.totalCents - paid, 0))
    reason = "Ledger balance has unmatched payment or credit evidence.";
  return {
    status: (plan.status === "cancelled"
      ? "cancelled"
      : reason || plan.status === "review"
        ? "review"
        : paid === plan.principal_cents
          ? "completed"
          : plan.status === "paused"
            ? "paused"
            : anchor
              ? "active"
              : "waiting_deposit") as PlanStatus,
    review_reason: reason || plan.review_reason,
    anchor_date: anchor,
    current: snapshot,
    installments: installments.map((i) => ({
      ...i,
      due_date:
        i.number === 1
          ? plan.baseline.acceptedDate
          : anchor
            ? monthlyDate(anchor, i.number - 1)
            : null,
    })),
    allocations,
  };
}
