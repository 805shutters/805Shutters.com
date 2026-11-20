import type { SupabaseClient } from "@supabase/supabase-js";
import { isTwilioConfigured, sendSms } from "@/lib/notify/twilio";
import { stripeConfig } from "@/lib/finance/stripe";
export const STRIPE_OWNER_ALERT_CALLBACK =
  "https://www.805shutters.com/api/webhooks/twilio/stripe-payment-alert/";
export async function deliverStripePaymentAlerts(
  db: SupabaseClient,
  sender: typeof sendSms = sendSms,
) {
  if (
    process.env.STRIPE_OWNER_ALERTS_ENABLED !== "true" ||
    !isTwilioConfigured()
  )
    return { status: "disabled", attempted: 0 };
  const config = stripeConfig();
  if (!config.livemode) return { status: "test_mode", attempted: 0 };
  const pending = await db
    .from("crm_stripe_alerts")
    .select("*")
    .eq("account_id", config.account)
    .eq("status", "queued")
    .order("created_at")
    .limit(3);
  if (pending.error) throw new Error("Stripe alert queue unavailable.");
  let attempted = 0;
  for (const alert of pending.data || []) {
    const request = await db
      .from("crm_stripe_requests")
      .select("job_id,amount_cents,status")
      .eq("account_id", config.account)
      .eq("livemode", true)
      .eq("id", alert.request_id)
      .single();
    if (request.error) throw new Error("Stripe alert request unavailable.");
    if (request.data.status !== "paid") continue;
    const job = await db
      .from("crm_jobs")
      .select("customer_name")
      .eq("id", request.data.job_id)
      .single();
    if (job.error) throw new Error("Stripe alert customer unavailable.");
    const name = String(job.data.customer_name || "the customer")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 100);
    const amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(request.data.amount_cents) / 100);
    const body = `805 Shutters: Stripe received ${amount} from ${name}. Recorded against the job balance.`;
    const claim = await db
      .from("crm_stripe_alerts")
      .update({
        status: "sending",
        body,
        attempted_at: new Date().toISOString(),
      })
      .eq("id", alert.id)
      .eq("status", "queued")
      .select("id");
    if (claim.error) throw new Error("Stripe alert could not be claimed.");
    if (!claim.data?.length) continue;
    attempted++;
    // A thrown/ambiguous send stays held. Never automatically resubmit it.
    const result = await sender({
      to: "+18052985555",
      ownerAlert: true,
      body,
      statusCallback: `${STRIPE_OWNER_ALERT_CALLBACK}?alert=${encodeURIComponent(alert.id)}`,
      timeoutMs: 10000,
    });
    const saved = await db
      .from("crm_stripe_alerts")
      .update({
        status: result.sent
          ? "accepted"
          : result.uncertain
            ? "unknown"
            : "failed",
        provider_sid: result.sid || null,
        provider_status: result.providerStatus || null,
        error: result.error || result.skipped || null,
      })
      .eq("id", alert.id)
      .eq("status", "sending");
    if (saved.error)
      throw new Error(
        "Stripe text was attempted; check Twilio before any resend.",
      );
  }
  return { status: "processed", attempted };
}
