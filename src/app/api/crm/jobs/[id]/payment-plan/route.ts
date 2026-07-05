import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser, CrmAuthError } from "@/lib/crm/auth";
import {
  cancelPaymentPlan,
  createPaymentPlanForJob,
  markInstallmentPaid,
  type CrmPaymentPlanMethod
} from "@/lib/crm/payment-plans";

export const runtime = "nodejs";

const METHODS = new Set<CrmPaymentPlanMethod>(["square_autopay", "zelle", "other"]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const payload = await request.json();
    const method = METHODS.has(payload.method) ? (payload.method as CrmPaymentPlanMethod) : undefined;

    const result = await createPaymentPlanForJob(
      supabase,
      id,
      {
        financed_total: Number(payload.financed_total),
        installment_count: Number(payload.installment_count),
        method,
        notes: typeof payload.notes === "string" && payload.notes.trim() ? payload.notes.trim() : null
      },
      { email, userId: user.id }
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CrmAuthError) return crmAuthErrorResponse(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment plan failed." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const payload = await request.json();
    const actor = { email, userId: user.id };

    if (payload.action === "mark_paid") {
      const result = await markInstallmentPaid(
        supabase,
        id,
        Number(payload.seq),
        {
          amount: payload.amount != null ? Number(payload.amount) : undefined,
          payment_type: typeof payload.payment_type === "string" ? payload.payment_type : undefined,
          paid_at: typeof payload.paid_at === "string" ? payload.paid_at : undefined
        },
        actor
      );
      return NextResponse.json(result);
    }

    if (payload.action === "cancel") {
      const result = await cancelPaymentPlan(
        supabase,
        id,
        actor,
        typeof payload.reason === "string" ? payload.reason : undefined
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown payment-plan action." }, { status: 400 });
  } catch (error) {
    if (error instanceof CrmAuthError) return crmAuthErrorResponse(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment plan failed." }, { status: 400 });
  }
}
