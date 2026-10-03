import {
  planDate,
  unpaidCents,
  targetForPlan,
} from "@/lib/crm/in-house-plan-model";
import { NextRequest, NextResponse } from "next/server";
import {
  requireCrmUser,
  crmAuthErrorResponse,
  CrmAuthError,
} from "@/lib/crm/auth";
import {
  listPaymentPlans,
  requirePlanManager,
  withPlanLease,
  synchronizePlan,
  snapshotFingerprint,
  loadPlanSnapshot,
  loadPaymentPlan,
} from "@/lib/crm/in-house-plans";
import {
  managePaymentPlan,
  processPaymentPlan,
  installmentLink,
  installmentMessage,
  providers,
} from "@/lib/crm/in-house-plan-processor";
export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    let plans = await listPaymentPlans(supabase);
    const salesId = request.nextUrl.searchParams.get("salesQuoteId");
    if (salesId) {
      const r = await supabase
        .from("sales_quote_v2_deliveries")
        .select("crm_quote_id")
        .eq("quote_id", salesId);
      if (r.error) throw new CrmAuthError(502, r.error.message);
      const ids = new Set((r.data || []).map((x) => x.crm_quote_id));
      plans = plans.filter((p) => ids.has(p.quote_id));
    }
    return NextResponse.json({ plans });
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const b = await request.json();
    if (!/^[\da-f-]{36}$/i.test(b.id || ""))
      throw new CrmAuthError(400, "Valid plan required.");
    if (b.action === "resend" && b.reviewed !== true)
      throw new CrmAuthError(
        400,
        "Review the recipients, amount and message before resending.",
      );
    if (b.action === "resend") {
      const p = await loadPaymentPlan(supabase, b.id);
      if (
        b.fingerprint !==
        snapshotFingerprint(await loadPlanSnapshot(supabase, targetForPlan(p)))
      )
        throw new CrmAuthError(
          409,
          "Recipients or payments changed. Review the reminder again.",
        );
    }
    return NextResponse.json({
      plan: await managePaymentPlan(
        supabase,
        b.id,
        b.action,
        email,
        b.requestId,
      ),
    });
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const b = await request.json();
    requirePlanManager(email);
    if (!/^[\da-f-]{36}$/i.test(b.id || ""))
      throw new CrmAuthError(400, "Valid plan required.");
    const plan = await processPaymentPlan(supabase, b.id);
    if (plan.status !== "active")
      throw new CrmAuthError(
        409,
        "Only an active, verified schedule can be resent.",
      );
    const messages = await withPlanLease(supabase, b.id, async (p, token) => {
      p = await synchronizePlan(supabase, p, token);
      const messages: {
        channel: string;
        recipient: string | null;
        text: string;
      }[] = [];
      for (const i of p.installments.filter(
        (i) => i.number > 1 && unpaidCents(i),
      )) {
        const url = await installmentLink(supabase, p, i, providers);
        const text = installmentMessage(p, i, url, planDate());
        messages.push(
          { channel: "email", recipient: p.current.email, text },
          {
            channel: "sms",
            recipient: p.current.phone,
            text: text + " Reply STOP to stop text messages.",
          },
        );
      }
      return messages;
    });
    return NextResponse.json({
      id: plan.id,
      fingerprint: snapshotFingerprint(plan.current),
      messages,
    });
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}
