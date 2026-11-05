import type { Metadata } from "next";
import { resolveSquareApplicationId, squareLocationId, squareWebSdkUrl } from "@/lib/finance/square";
import { findJobByAutopayToken } from "@/lib/crm/payment-plans";
import { installmentChargeAmount, formatMoney } from "@/lib/crm/payment-plan-shared";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { AutopayCardForm } from "./AutopayCardForm";

export const metadata: Metadata = {
  title: "Set Up Automatic Payments | 805 Shutters",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function AutopaySetupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getSupabaseServiceClient();
  const found = supabase ? await findJobByAutopayToken(supabase, token) : null;

  if (!found || (found.plan.status !== "active" && found.plan.status !== "pending_install")) {
    return (
      <div className="autopay-page">
        <h1>Set Up Automatic Payments</h1>
        <p>
          This payment setup link is no longer valid. Please call or text 805 Shutters at{" "}
          <a href="tel:+18058069344">805-806-9344</a> and we will send you a fresh one.
        </p>
      </div>
    );
  }

  const { job, plan } = found;
  const firstName = String(job.customer_name || "").trim().split(/\s+/)[0] || "there";
  const first = plan.installments[0];
  const monthly = first ? formatMoney(installmentChargeAmount(first)) : null;
  const scheduleNote =
    plan.status === "pending_install"
      ? "Your first payment happens the day of installation, then monthly."
      : first?.due_date
        ? `Your first payment is due ${first.due_date}, then monthly.`
        : "";
  const applicationId = await resolveSquareApplicationId();
  const locationId = squareLocationId();
  const configured = Boolean(applicationId && locationId);
  const alreadyLinked = plan.autopay?.status === "linked";

  return (
    <div className="autopay-page">
      <p className="autopay-eyebrow">805 Shutters payment plan</p>
      <h1>Set Up Automatic Payments</h1>
      <p>
        Hi {firstName} — save a card once and your {plan.installment_count} monthly payment
        {plan.installment_count === 1 ? "" : "s"}
        {monthly ? ` of ${monthly}` : ""} will be charged automatically. Nothing to remember, no late payments.{" "}
        {scheduleNote}
      </p>
      {alreadyLinked ? (
        <p className="autopay-linked">
          A card ending in {plan.autopay?.card_last4 || "????"} is already on file. Entering a new card below will
          replace it.
        </p>
      ) : null}
      {configured ? (
        <AutopayCardForm token={token} sdkUrl={squareWebSdkUrl()} applicationId={applicationId} locationId={locationId} />
      ) : (
        <p>
          Online card setup is temporarily unavailable. Please call or text us at{" "}
          <a href="tel:+18058069344">805-806-9344</a> and we will set up your automatic payments over the phone.
        </p>
      )}
      <p className="autopay-fine">
        Payments are processed securely by Square. 805 Shutters never sees or stores your card number. Monthly amount
        includes a 3% card processing fee. Questions? Call or text 805-806-9344.
      </p>
    </div>
  );
}
