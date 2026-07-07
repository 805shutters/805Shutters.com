import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { processOrderCogsInbox } from "@/lib/crm/order-cogs";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function requireCronAccess(request: NextRequest) {
  const secret = process.env.ORDER_COGS_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return;

  const authorization = request.headers.get("authorization") || "";
  if (authorization !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "Order COGS cron is not authorized.");
  }
}

async function run(request: NextRequest) {
  try {
    requireCronAccess(request);
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Dedicated Supabase database is not configured.");

    const result = await processOrderCogsInbox(supabase, {
      actorEmail: "order-cogs-cron"
    });
    const summary = {
      scanned: result.scanned,
      processed: result.processed,
      matched: result.matched,
      needsReview: result.needsReview,
      unmatched: result.unmatched,
      skipped: result.skipped,
      applied: result.applied || 0,
      archived: result.archived,
      errors: result.errors,
      recordErrors: result.recordErrors || 0,
      archiveErrors: result.archiveErrors,
      lastError: result.lastError || null,
      lastInsertError: result.lastInsertError || null
    };
    if (result.errors || result.recordErrors || result.archiveErrors) {
      console.warn("Order COGS cron completed with warnings.", summary);
    } else {
      console.info("Order COGS cron completed.", summary);
    }

    return NextResponse.json(result);
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
