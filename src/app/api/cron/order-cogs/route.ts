import { observeIntegration } from "@/lib/crm/integration-health";
import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { processOrderCogsInbox } from "@/lib/crm/order-cogs";
import { reconcileRecentSquarePayments } from "@/lib/crm/square-api-reconciliation";
import { processPeerPaymentEmails } from "@/lib/crm/peer-payment-emails";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Vercel uses UTC. Both possible offsets are scheduled; only 8 AM/PM Pacific runs. */
export function isOrderCogsRunTime(now: Date) {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(now);
  return hour === "08" || hour === "20" || hour === "8";
}

export type OrderCogsCronDependencies = {
  now?: () => Date;
  env: Partial<Pick<NodeJS.ProcessEnv, "ORDER_COGS_CRON_SECRET" | "CRON_SECRET">>;
  getSupabase: typeof getSupabaseServiceClient;
  processOrderCogs: typeof processOrderCogsInbox;
  reconcileSquarePayments: typeof reconcileRecentSquarePayments;
  processPeerPayments: typeof processPeerPaymentEmails;
};

const defaultDependencies: OrderCogsCronDependencies = {
  env: {
    ORDER_COGS_CRON_SECRET: process.env.ORDER_COGS_CRON_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  },
  getSupabase: getSupabaseServiceClient,
  processOrderCogs: processOrderCogsInbox,
  reconcileSquarePayments: reconcileRecentSquarePayments,
  processPeerPayments: processPeerPaymentEmails,
};

function requireCronAccess(request: NextRequest, env: OrderCogsCronDependencies["env"]) {
  const secrets = [env.ORDER_COGS_CRON_SECRET, env.CRON_SECRET].filter(Boolean);
  if (!secrets.length) throw new CrmAuthError(503, "Order COGS cron secret is not configured.");
  if (!secrets.some(secret => request.headers.get("authorization") === `Bearer ${secret}`)) {
    throw new CrmAuthError(401, "Order COGS cron is not authorized.");
  }
}

async function runAuxiliaryProcessor<T>(
  name: "Square payment reconciliation" | "Peer payment processing",
  unavailableMessage: string,
  processor: () => Promise<T>,
) {
  try {
    return {
      result: await processor(),
      state: { status: "completed" as const },
    };
  } catch (error) {
    console.error(`${name} failed during order COGS cron.`, error);
    return {
      result: null,
      state: { status: "failed" as const, message: unavailableMessage },
    };
  }
}

export async function runOrderCogsCron(
  request: NextRequest,
  dependencies: OrderCogsCronDependencies = defaultDependencies,
) {
  try {
    requireCronAccess(request, dependencies.env);
    if (request.method === "GET" && !isOrderCogsRunTime(dependencies.now?.() || new Date())) {
      return NextResponse.json({ skipped: true, reason: "Scheduled for 8 AM and 8 PM America/Los_Angeles." });
    }
    const supabase = dependencies.getSupabase();
    if (!supabase) throw new CrmAuthError(503, "Dedicated Supabase database is not configured.");
    const orderCogs = await observeIntegration(supabase, "order-cogs", () => dependencies.processOrderCogs(supabase, {
      actorEmail: "order-cogs-cron",
      autoApply: false,
      productAutoApply: true,
      archive: false,
      maxRunMs: 230_000,
    }), result => !(result.errors || result.recordErrors || result.deferred));
    const [squarePayments, peerPayments] = await Promise.all([
      runAuxiliaryProcessor(
        "Square payment reconciliation",
        "Square payment reconciliation is temporarily unavailable.",
        () => dependencies.reconcileSquarePayments(supabase),
      ),
      runAuxiliaryProcessor(
        "Peer payment processing",
        "Peer payment processing is temporarily unavailable.",
        () => dependencies.processPeerPayments(supabase),
      ),
    ]);
    return NextResponse.json({
      orderCogs,
      squarePayments: squarePayments.result,
      peerPayments: peerPayments.result,
      processorStates: {
        orderCogs: { status: orderCogs.errors || orderCogs.recordErrors || orderCogs.deferred ? "failed" : "completed" },
        squarePayments: squarePayments.state,
        peerPayments: peerPayments.state,
      },
    }, { status: orderCogs.errors || orderCogs.recordErrors || orderCogs.deferred ? 502 : 200 });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  return runOrderCogsCron(request);
}

export async function POST(request: NextRequest) {
  return runOrderCogsCron(request);
}
