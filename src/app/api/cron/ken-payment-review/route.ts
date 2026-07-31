import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { loadCrmDashboardData, recordCrmActivity } from "@/lib/crm/backend";
import { planMonthEndKenPaymentReview } from "@/lib/crm/ken-payment-scheduler";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function requireCronAccess(request: NextRequest) {
  const secret = process.env.KEN_PAYMENT_REVIEW_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "Ken payment review cron is not authorized.");
  }
}

async function run(request: NextRequest) {
  try {
    requireCronAccess(request);
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Database is not configured.");
    const dashboard = await loadCrmDashboardData(supabase);
    const plan = planMonthEndKenPaymentReview(dashboard.partnerPaymentLedger.people.ken.items, new Date());

    if (plan.queued && plan.review) {
      await recordCrmActivity(supabase, { email: "ken-payment-review-cron" }, {
        entityType: "system",
        action: "queue_ken_month_end_payment_review",
        metadata: {
          includedItemKeys: plan.review.included.map((item) => item.itemKey),
          held: plan.review.held.map(({ item, reason }) => ({ itemKey: item.itemKey, reason })),
          grossTotal: plan.review.grossTotal,
          offsets: plan.review.offsets,
          netAmount: plan.review.netAmount,
          unattendedTransfer: false,
          emailSent: false
        }
      });
    }
    return NextResponse.json(plan);
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
