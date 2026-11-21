import { observeIntegration } from "@/lib/crm/integration-health";
import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { processScheduledOrderMailboxes } from "@/lib/crm/order-cogs-mailboxes";
import { processOrderCogsInbox } from "@/lib/crm/order-cogs";
import { reconcileRecentSquarePayments } from "@/lib/crm/square-api-reconciliation";
import { processPeerPaymentEmails } from "@/lib/crm/peer-payment-emails";
import { getSupabaseServiceClient } from "@/lib/supabase-server";


/** Preserve the existing twice-daily payment checks while orders run every ten minutes. */
export function isAuxiliaryRunTime(now: Date) {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(now);
  return (hour === "08" || hour === "20" || hour === "8") && now.getUTCMinutes() === 0;
}

export type OrderCogsCronDependencies = {
  now?: () => Date;
  env: Partial<Pick<NodeJS.ProcessEnv, "ORDER_COGS_CRON_SECRET" | "CRON_SECRET">>;
  getSupabase: typeof getSupabaseServiceClient;
  processOrderCogs: typeof processOrderCogsInbox;
  reconcileSquarePayments: typeof reconcileRecentSquarePayments;
  processPeerPayments: typeof processPeerPaymentEmails;
};

type OrderCogsRunSummary = {
  matched?: number;
  needsReview?: number;
  unmatched?: number;
  skipped?: number;
  applied?: number;
  errors?: number;
  recordErrors?: number;
};

/** Review, unmatched, and time-budget deferrals are normal intake. Fail only for row or audit errors. */
export function orderCogsRunSucceeded(result: OrderCogsRunSummary) {
  return (result.errors ?? 0) === 0 && (result.recordErrors ?? 0) === 0;
}

export function orderCogsRunCounts(result: OrderCogsRunSummary) {
  return {
    matched: result.matched ?? 0,
    needs_review: result.needsReview ?? 0,
    unmatched: result.unmatched ?? 0,
    skipped: result.skipped ?? 0,
    applied: result.applied ?? 0,
    errors: result.errors ?? 0,
  };
}

const defaultDependencies: OrderCogsCronDependencies = {
  env: {
    ORDER_COGS_CRON_SECRET: process.env.ORDER_COGS_CRON_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  },
  getSupabase: getSupabaseServiceClient,
  processOrderCogs: processScheduledOrderMailboxes,
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
  name: "Order email processing" | "Square payment reconciliation" | "Peer payment processing",
  unavailableMessage: string,
  processor: () => Promise<T>,
  succeeded: (result: T) => boolean = () => true,
) {
  try {
    const result = await processor();
    return {
      result,
      state: succeeded(result) ? { status: "completed" as const }
        : { status: "failed" as const, message: unavailableMessage },
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
    const runPayments = request.method === "POST" || isAuxiliaryRunTime(dependencies.now?.() || new Date());
    const supabase = dependencies.getSupabase();
    if (!supabase) throw new CrmAuthError(503, "Dedicated Supabase database is not configured.");
    // Start independent email intake immediately: a failed or slow vendor scan
    // must not prevent customer receipts from being checked within this invocation.
    const [orders, squarePayments, peerPayments] = await Promise.all([
      runAuxiliaryProcessor(
        "Order email processing",
        "Order email processing is temporarily unavailable.",
        () => observeIntegration(supabase, "order-cogs", () => dependencies.processOrderCogs(supabase, {
          actorEmail: "order-cogs-cron",
          autoApply: false,
          productAutoApply: true,
          archive: false,
          maxRunMs: 230_000,
        }), orderCogsRunSucceeded, orderCogsRunCounts),
        orderCogsRunSucceeded,
      ),
      runPayments ? runAuxiliaryProcessor(
        "Square payment reconciliation",
        "Square payment reconciliation is temporarily unavailable.",
        () => dependencies.reconcileSquarePayments(supabase),
      ) : Promise.resolve({ result: null, state: { status: "skipped" as const } }),
      runPayments ? runAuxiliaryProcessor(
        "Peer payment processing",
        "Peer payment processing is temporarily unavailable.",
        () => observeIntegration(supabase, "peer-payment-email", () => dependencies.processPeerPayments(supabase), result => result.errors === 0),
        result => result.errors === 0,
      ) : Promise.resolve({ result: null, state: { status: "skipped" as const } }),
    ]);
    const counts = orders.result ? orderCogsRunCounts(orders.result) : undefined;
    return NextResponse.json({
      orderCogs: orders.result,
      ...(counts ? { counts } : {}),
      squarePayments: squarePayments.result,
      peerPayments: peerPayments.result,
      processorStates: {
        orderCogs: orders.state,
        squarePayments: squarePayments.state,
        peerPayments: peerPayments.state,
      },
    }, { status: orders.state.status === "failed" || peerPayments.state.status === "failed" ? 502 : 200 });
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
