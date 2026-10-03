import { NextRequest, NextResponse } from "next/server";
import {
  requireCrmUser,
  crmAuthErrorResponse,
  CrmAuthError,
} from "@/lib/crm/auth";
import {
  requirePlanManager,
  withPlanLease,
  synchronizePlan,
} from "@/lib/crm/in-house-plans";
import { insertReceivedPayment } from "@/lib/crm/received-payment";
import { dateOnly, planDate, unpaidCents } from "@/lib/crm/in-house-plan-model";
import {
  providers,
  retireObsoletePlanLinks,
} from "@/lib/crm/in-house-plan-processor";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    requirePlanManager(email);
    const { id } = await params;
    const b = await request.json();
    const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
    if (
      !uuid.test(id) ||
      !uuid.test(b.requestId || "") ||
      !uuid.test(b.installmentId || "")
    )
      throw new CrmAuthError(
        400,
        "Valid plan, installment and receipt request required.",
      );
    const cents = Math.round(Number(b.amount) * 100);
    const day = dateOnly(b.receiptDate);
    if (
      !Number.isSafeInteger(cents) ||
      cents < 1 ||
      Math.abs(Number(b.amount) * 100 - cents) > 0.00001 ||
      !day ||
      day !== b.receiptDate ||
      day > planDate()
    )
      throw new CrmAuthError(
        400,
        "Enter a positive cent amount and the actual receipt date, no later than today.",
      );
    if (!["cash", "check", "zelle", "credit_card", "other"].includes(b.method))
      throw new CrmAuthError(400, "Choose a receipt method.");
    const result = await withPlanLease(supabase, id, async (plan, token) => {
      plan = await synchronizePlan(supabase, plan, token);
      const i = plan.installments.find((i) => i.id === b.installmentId);
      if (!i || !plan.quote_id || !plan.current.jobId)
        throw new CrmAuthError(
          409,
          "Exact accepted quote and installment required.",
        );
      // Verify an earlier retry before checking the newly reduced unpaid amount.
      const earlier = await supabase
        .from("crm_quote_bookkeeping_payments")
        .select("id")
        .eq("id", b.requestId)
        .maybeSingle();
      if (earlier.error) throw new CrmAuthError(502, earlier.error.message);
      if (!earlier.data && cents > unpaidCents(i))
        throw new CrmAuthError(
          409,
          "Receipt exceeds this installment's remaining amount. Record each installment allocation separately.",
        );
      const receipt = await insertReceivedPayment(
        supabase,
        {
          quote_id: plan.quote_id,
          job_id: plan.current.jobId,
          payment_label:
            i.number === 1 ? "Deposit" : `Payment ${i.number} of 3`,
          payment_type: b.method,
          amount: cents / 100,
          paid_at: day,
          source: "crm_quote",
          notes: null,
          meta: {
            createdBy: email,
            in_house_plan_id: id,
            in_house_installment_id: i.id,
          },
        },
        b.requestId,
      );
      plan = await synchronizePlan(supabase, plan, token);
      let warning: string | null = null;
      try {
        await retireObsoletePlanLinks(supabase, plan, providers);
      } catch (e) {
        warning = `Receipt saved. Checkout retirement needs attention: ${e instanceof Error ? e.message : "unavailable"}`;
      }
      return { receipt, plan, warning };
    });
    return NextResponse.json(result);
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}
