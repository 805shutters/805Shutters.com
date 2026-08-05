import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { processOrderCogsInbox } from "@/lib/crm/order-cogs";
import { reconcileRecentSquarePayments } from "@/lib/crm/square-api-reconciliation";
import { processPeerPaymentEmails } from "@/lib/crm/peer-payment-emails";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function requireCronAccess(request: NextRequest) {
  const secret = process.env.ORDER_COGS_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return;
  if ((request.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "Order COGS cron is not authorized.");
  }
}

async function run(request: NextRequest) {
  try {
    requireCronAccess(request);
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Dedicated Supabase database is not configured.");
    const orderCogs = await processOrderCogsInbox(supabase, { actorEmail: "order-cogs-cron" });
    const squarePayments = await reconcileRecentSquarePayments(supabase);
    const peerPayments = await processPeerPaymentEmails(supabase);
    return NextResponse.json({ orderCogs, squarePayments, peerPayments });
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
