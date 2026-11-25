import type { SupabaseClient } from "@supabase/supabase-js";
import { isTwilioConfigured, sendSms } from "@/lib/notify/twilio";
import { toE164 } from "@/lib/notify/phone";
import { OWNER_ALERT_FROM_PHONE } from "@/lib/notify/owner-alert-routing";
import { stripeConfig } from "@/lib/finance/stripe";
export const STRIPE_OWNER_ALERT_CALLBACK =
  "https://www.805shutters.com/api/webhooks/twilio/stripe-payment-alert/";
const clean = (value: unknown, max = 180) =>
  typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").trim().slice(0, max) : "";

export function buildStripePaymentAlert(input: {
  amountCents: number; purpose: string; name: string; phone?: string | null;
  address?: string | null; quoteNumber?: string | null;
}) {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(input.amountCents / 100);
  const purpose = ({ deposit: "Deposit", balance: "Balance", installment: "Installment" } as Record<string, string>)[input.purpose] || "Payment";
  return ["805 Shutters: Stripe payment received", `${purpose}: ${amount}`,
    `Customer: ${clean(input.name, 100) || "Not recorded"}`,
    `Address: ${clean(input.address) || "Not recorded"}`,
    `Phone: ${clean(input.phone, 40) || "Not recorded"}`,
    ...(input.quoteNumber ? [`Quote: ${clean(input.quoteNumber, 40)}`] : []),
    "Recorded in CRM."].join("\n");
}

export async function deliverStripePaymentAlerts(
  db: SupabaseClient,
  sender: typeof sendSms = sendSms,
) {
  if (
    process.env.STRIPE_OWNER_ALERTS_ENABLED !== "true" ||
    !isTwilioConfigured()
  )
    return { status: "disabled", attempted: 0 };
  const recipient = toE164(process.env.STRIPE_PAYMENT_ALERT_TO);
  if (!recipient || recipient === OWNER_ALERT_FROM_PHONE)
    return { status: "invalid_recipient", attempted: 0 };
  const config = stripeConfig();
  if (!config.livemode) return { status: "test_mode", attempted: 0 };
  const pending = await db
    .from("crm_stripe_alerts")
    .select("*")
    .eq("account_id", config.account)
    .eq("livemode", true)
    .eq("status", "queued")
    .order("created_at")
    .limit(3);
  if (pending.error) throw new Error("Stripe alert queue unavailable.");
  let attempted = 0;
  for (const alert of pending.data || []) {
    const request = await db
      .from("crm_stripe_requests")
      .select("job_id,quote_id,amount_cents,status,purpose,payment_intent_id")
      .eq("account_id", config.account)
      .eq("livemode", true)
      .eq("id", alert.request_id)
      .single();
    if (request.error) throw new Error("Stripe alert request unavailable.");
    if (request.data.status !== "paid" || request.data.payment_intent_id !== alert.payment_intent_id) continue;
    const job = await db
      .from("crm_jobs")
      .select("customer_name,phone,address")
      .eq("id", request.data.job_id)
      .single();
    if (job.error) throw new Error("Stripe alert customer unavailable.");
    const quote = request.data.quote_id
      ? await db.from("crm_quotes").select("quote_number,customer_name,customer_phone,customer_address")
        .eq("id", request.data.quote_id).eq("job_id", request.data.job_id).single()
      : { data: null, error: null };
    if (quote.error) throw new Error("Stripe alert quote unavailable.");
    const body = buildStripePaymentAlert({
      amountCents: Number(request.data.amount_cents), purpose: request.data.purpose,
      name: quote.data?.customer_name || job.data.customer_name,
      phone: quote.data?.customer_phone || job.data.phone,
      address: quote.data?.customer_address || job.data.address,
      quoteNumber: quote.data?.quote_number,
    });
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
      to: recipient,
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
