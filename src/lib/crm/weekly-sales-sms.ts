import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { losAngelesDateString, losAngelesTimeString, zonedTimeToUtc } from "@/lib/booking/availability";
import { buildClosedSalesReport } from "@/lib/crm/dashboard-metrics";
import { loadCompleteCrmTable } from "@/lib/crm/pagination";
import { isTwilioConfigured, sendSms, toE164 } from "@/lib/notify/twilio";
import type { CrmBookkeepingEntry, CrmClosedSalesWeek, CrmCustomer, CrmCustomerContract, CrmJob, CrmQuote } from "@/lib/crm/types";

/** The two UTC cron slots cover PST/PDT; only Sunday 17:00 Pacific may send. */
export function weeklySalesCutoff(now: Date): Date | null {
  const date = losAngelesDateString(now);
  if (new Date(`${date}T12:00:00Z`).getUTCDay() !== 0 || !losAngelesTimeString(now).startsWith("17:")) return null;
  return zonedTimeToUtc(date, "17:00");
}

export function weeklySalesSmsBody(week: CrmClosedSalesWeek, reviewCount: number) {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(week.totalCents / 100);
  return `805 Shutters weekly sales — ${week.label}. Gross signed sales as of Sunday 5:00 PM Pacific: ${amount}.`
    + (reviewCount ? ` ${reviewCount} signing record${reviewCount === 1 ? " needs" : "s need"} review; total includes verified sales only. See Closed Sales in CRM.` : "");
}

// Stable primary keys make the existing activity table an atomic per-week claim.
// A process crash or uncertain provider response never causes an automatic resend.
function weeklySalesEventId(key: string) {
  const hash = createHash("sha256").update(`805:weekly-sales-sms:v1:${key}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function loadWeeklySalesSmsReport(supabase: SupabaseClient, cutoff: Date) {
  const results = await Promise.all([
    loadCompleteCrmTable(supabase, "crm_jobs"),
    loadCompleteCrmTable(supabase, "crm_quotes"),
    loadCompleteCrmTable(supabase, "crm_customer_contracts"),
    loadCompleteCrmTable(supabase, "crm_quote_bookkeeping_entries", "sold_date"),
    loadCompleteCrmTable(supabase, "crm_customers", "latest_sold_date"),
  ]);
  for (const result of results) if (result.error) throw new Error(`Weekly sales unavailable: ${result.error.message}`);
  const [jobs, quotes, contracts, entries, customers] = results.map(result => result.data || []);
  const report = buildClosedSalesReport({ jobs: jobs as CrmJob[], quotes: quotes as CrmQuote[],
    contracts: contracts as CrmCustomerContract[], entries: entries as CrmBookkeepingEntry[], customers: customers as CrmCustomer[],
    now: cutoff, includeCurrentWeek: true });
  const week = report.weeks[0];
  const reviewCount = report.review.filter(item => !item.signedAt || (item.signedAt >= week.startAt && item.signedAt <= cutoff.toISOString())).length;
  return { week, reviewCount, body: weeklySalesSmsBody(week, reviewCount), cutoff: cutoff.toISOString() };
}

export async function runWeeklySalesSms(supabase: SupabaseClient, now = new Date(), smsSender: typeof sendSms = sendSms) {
  const cutoff = weeklySalesCutoff(now);
  if (!cutoff) return { accepted: 0, skipped: 0, failed: 0, outsideSendHour: true };
  const recipients = [
    { name: "Jessica", phone: toE164(process.env.JESSICA_805_SALES_SMS_NUMBER) },
    { name: "Mike", phone: toE164(process.env.MIKE_805_SALES_SMS_NUMBER) },
  ];
  if (recipients.some(recipient => !recipient.phone) || recipients[0].phone === recipients[1].phone) {
    throw new Error("Weekly sales requires distinct, configured Jessica and Mike SMS numbers.");
  }
  if (!isTwilioConfigured()) throw new Error("Weekly sales SMS provider is not configured.");

  const calculated = await loadWeeklySalesSmsReport(supabase, cutoff);
  const snapshotId = weeklySalesEventId(`${calculated.week.startDate}:report`);
  const { error: snapshotError } = await supabase.from("crm_activity_events").insert({
    id: snapshotId, entity_type: "system", action: "weekly_sales_sms.report", actor_email: "weekly-sales-cron",
    after_data: calculated,
  });
  if (snapshotError && snapshotError.code !== "23505") throw snapshotError;
  // Both recipients and all overlapping invocations use the first saved total.
  const { data: snapshot, error: readError } = await supabase.from("crm_activity_events")
    .select("after_data").eq("id", snapshotId).single();
  if (readError || !snapshot?.after_data?.body) throw readError || new Error("Weekly sales report snapshot unavailable.");
  const report = snapshot.after_data as typeof calculated;
  let accepted = 0, skipped = 0, failed = 0;
  for (const recipient of recipients) {
    const id = weeklySalesEventId(`${report.week.startDate}:${recipient.name}`);
    const metadata = { reportId: snapshotId, weekStart: report.week.startDate, cutoff: report.cutoff,
      recipient: recipient.name, to: recipient.phone, totalCents: report.week.totalCents };
    const { error: claimError } = await supabase.from("crm_activity_events").insert({
      id, entity_type: "system", action: "weekly_sales_sms.claimed", actor_email: "weekly-sales-cron", metadata,
    });
    if (claimError?.code === "23505") {
      skipped += 1;
      const { data: previous, error } = await supabase.from("crm_activity_events").select("action").eq("id", id).single();
      if (error || previous?.action === "weekly_sales_sms.needs_review") failed += 1;
      continue;
    }
    if (claimError) throw claimError;
    let result;
    try { result = await smsSender({ to: recipient.phone, body: report.body }); }
    catch { result = { sent: false, error: "Provider outcome uncertain; review before resending." }; }
    const providerAccepted = Boolean(result.sent && result.sid);
    const { error: saveError } = await supabase.from("crm_activity_events").update({
      action: providerAccepted ? "weekly_sales_sms.accepted" : "weekly_sales_sms.needs_review",
      after_data: { ...result, status: providerAccepted ? "accepted" : "needs_review", attemptedAt: now.toISOString() },
    }).eq("id", id);
    if (providerAccepted) accepted += 1;
    if (!providerAccepted || saveError) failed += 1;
  }
  return { accepted, skipped, failed, outsideSendHour: false, weekStart: report.week.startDate, totalCents: report.week.totalCents };
}
