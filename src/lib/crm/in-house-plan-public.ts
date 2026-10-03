import type { SupabaseClient } from "@supabase/supabase-js";
import {
  check,
  findOpenPlan,
  loadPlanSnapshot,
  planRows,
  L_TABLE,
} from "./in-house-plans";
import {
  reconcilePlan,
  targetForPlan,
  unpaidCents,
  type PlanTarget,
  type PlanInstallment,
} from "./in-house-plan-model";
export type PublicPaymentPlan = {
  status: string;
  installments: PlanInstallment[];
  links: Record<string, string>;
  depositOutstandingCents: number;
  target: PlanTarget;
};
export async function loadPublicPaymentPlan(
  db: SupabaseClient,
  quoteId: string,
): Promise<PublicPaymentPlan | null> {
  let plan = await findOpenPlan(db, { quoteId });
  if (!plan) {
    const linked = await db
      .from("crm_quote_bookkeeping_entries")
      .select("id,source")
      .eq("quote_id", quoteId)
      .in("source", ["manual", "legacy_sheet"]);
    check(linked);
    if (linked.data?.length === 1)
      plan = await findOpenPlan(db, { bookkeepingEntryId: linked.data[0].id });
  }
  if (!plan) return null;
  try {
    plan = {
      ...plan,
      ...reconcilePlan(plan, await loadPlanSnapshot(db, targetForPlan(plan))),
    };
  } catch {
    plan = { ...plan, status: "review" };
  }
  const links: Record<string, string> = {};
  if (plan.status === "active") {
    const rows = await planRows<{
      installment_id: string;
      amount_cents: number;
      status: string;
      url: string | null;
    }>(db, L_TABLE, "plan_id", plan.id);
    for (const l of rows) {
      const i = plan.installments.find((i) => i.id === l.installment_id);
      if (
        i &&
        i.due_date &&
        unpaidCents(i) > 0 &&
        l.status === "active" &&
        l.amount_cents === unpaidCents(i) &&
        l.url?.startsWith("https://")
      )
        links[i.id] = l.url;
    }
  }
  return {
    target: targetForPlan(plan),
    status: plan.status,
    installments: plan.installments.sort((a, b) => a.number - b.number),
    links,
    depositOutstandingCents: plan.current.depositOutstandingCents,
  };
}
