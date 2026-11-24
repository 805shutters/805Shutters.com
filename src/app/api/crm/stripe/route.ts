import { retireLegacySquareRequests } from "@/lib/crm/square-collection-retirement";
import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  crmAuthErrorResponse,
  requireCrmUser,
} from "@/lib/crm/auth";
import { isMikePaymentAdminEmail } from "@/lib/crm/allowed-users";
import { stripeConfig, stripeRecord } from "@/lib/finance/stripe";
import { syncStripeFinance } from "@/lib/crm/stripe-finance";
import { retireStripePaymentLink } from "@/lib/crm/stripe-collection";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    let config: ReturnType<typeof stripeConfig>;
    try {
      config = stripeConfig();
    } catch {
      throw new CrmAuthError(
        503,
        "Stripe setup is not complete. Reconciliation will be available after the account connection is configured.",
      );
    }
    const results = await Promise.all(
      ["requests", "objects", "events", "sync", "bank_matches", "alerts"].map(
        async (name) => {
          let q = supabase
            .from(`crm_stripe_${name}`)
            .select("*")
            .eq("account_id", config.account);
          if (name !== "bank_matches") q = q.eq("livemode", config.livemode);
          else if (!config.livemode) return [name, []] as const;
          const r = await q
            .order(
              name === "objects"
                ? "occurred_at"
                : name === "events"
                  ? "received_at"
                  : name === "sync"
                    ? "last_started_at"
                    : "created_at",
              { ascending: false },
            )
            .limit(501);
          if (r.error) throw new Error("Stripe evidence is unavailable.");
          return [name, r.data] as const;
        },
      ),
    );
    const data = Object.fromEntries(results),
      truncated = results.some(([, rows]) => rows.length > 500);
    return NextResponse.json(
      {
        account: config.account,
        livemode: config.livemode,
        canReview: isMikePaymentAdminEmail(email),
        truncated,
        ...data,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    if (!isMikePaymentAdminEmail(email))
      throw new CrmAuthError(
        403,
        "Only Mike can review Stripe reconciliation.",
      );
    const body = stripeRecord(await request.json()),
      config = stripeConfig();
    if (body.action === "sync")
      return NextResponse.json(await syncStripeFinance(supabase));
    if (body.action === "expire" && typeof body.sessionId === "string") {
      await retireStripePaymentLink(supabase, body.sessionId);
      return NextResponse.json({ expired: true });
    }
    if (body.action === "retire-legacy") {
      if (typeof body.targetId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.targetId))
        throw new CrmAuthError(400, "Choose an exact quote to retire its old payment links.");
      const quote = await supabase.from("crm_quotes").select("id,job_id").eq("id", body.targetId).maybeSingle();
      if (quote.error || !quote.data?.job_id) throw new CrmAuthError(409, "The exact quote and job could not be verified.");
      return NextResponse.json(await retireLegacySquareRequests(supabase, { quoteId: quote.data.id, jobId: quote.data.job_id }));
    }
    if (body.action === "clearance") {
      if (
        body.confirmObligationsResolved !== true ||
        typeof body.targetId !== "string" ||
        typeof body.evidence !== "string" ||
        body.evidence.trim().length < 20
      )
        throw new CrmAuthError(
          400,
          "Confirm all historical Square links, invoices and mandates were resolved, with exact evidence.",
        );
      const result = await supabase.rpc("clear_stripe_migration_target", {
        p_target: body.targetId,
        p_evidence: body.evidence,
        p_actor: email,
      });
      if (result.error)
        throw new CrmAuthError(
          409,
          "Historical obligation clearance could not be recorded.",
        );
      return NextResponse.json(result.data);
    }
    if (body.action === "bank") {
      if (
        !config.livemode ||
        !Number.isSafeInteger(body.amountCents) ||
        typeof body.evidence !== "string" ||
        body.evidence.length < 8
      )
        throw new CrmAuthError(
          400,
          "Exact live payout and bank evidence required.",
        );
      const r = await supabase.rpc("match_stripe_bank", {
        p_account: config.account,
        p_payout: body.payoutId,
        p_transaction: body.bankTransactionId,
        p_date: body.bankDate,
        p_amount: body.amountCents,
        p_evidence: body.evidence,
        p_actor: email,
      });
      if (r.error)
        throw new CrmAuthError(
          409,
          "Bank evidence did not match the verified payout.",
        );
      return NextResponse.json(r.data);
    }
    throw new CrmAuthError(400, "Unsupported Stripe review action.");
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
