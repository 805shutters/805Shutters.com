import type { SupabaseClient } from "@supabase/supabase-js";
import { customerEmailStatus, type CustomerEmailRecord } from "./customer-email-status";
const TABLE = "crm_customer_signed_contract_email_outbox";
export const CUSTOMER_EMAIL_FIELDS = "id,kind,status,recipient,created_at,provider_accepted_at,delivery_status,delivery_checked_at,delivery_error,last_error";
export async function customerEmailActivation(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db.from("crm_customer_email_settings").select("enabled_from").eq("singleton", true).single();
  if (error) throw new Error("Customer email activation could not be read.");
  return data.enabled_from;
}
/** Read-only provider lookup; never sends or resends an email. */
export async function checkCustomerEmailDeliveries(db: SupabaseClient, activation: string, fetcher: typeof fetch = fetch) {
  const { data, error } = await db.from(TABLE).select("id,provider_message_id,delivery_status")
    .gte("created_at", activation).eq("status", "accepted")
    .gte("provider_accepted_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .or(`delivery_checked_at.is.null,delivery_checked_at.lt.${new Date(Date.now() - 10 * 60000).toISOString()}`)
    .order("delivery_checked_at", { ascending: true, nullsFirst: true }).limit(20);
  if (error) throw new Error("Customer email delivery queue could not be read.");
  const deadline = Date.now() + 45_000;
  for (const row of data || []) {
    if (Date.now() > deadline - 11_000) break;
    let status: string | undefined;
    let failure: string | null = null;
    try {
      if (!process.env.RESEND_API_KEY) throw new Error("Email provider is not configured.");
      const response = await fetcher(`https://api.resend.com/emails/${encodeURIComponent(row.provider_message_id)}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Email provider status lookup failed (${response.status}).`);
      const result = await response.json();
      if (result.id !== row.provider_message_id || typeof result.last_event !== "string") throw new Error("Email provider returned incomplete delivery evidence.");
      status = result.last_event;
    } catch (error) { failure = error instanceof Error ? error.message : "Delivery lookup failed."; }
    const { error: saveError } = await db.from(TABLE).update({
      ...(status ? { delivery_status: status } : {}), delivery_checked_at: new Date().toISOString(), delivery_error: failure,
    }).eq("id", row.id).eq("status", "accepted");
    if (saveError) throw new Error("Customer email delivery evidence could not be saved.");
    // Respect provider rate limits, including the sending worker in this invocation.
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  return data?.length || 0;
}
export async function getCustomerEmailMonitor(db: SupabaseClient, now = Date.now()) {
  const activation = await customerEmailActivation(db);
  if (!activation) return { ok: false, activated: false, reason: "Forward customer email delivery has not been activated.", attention: 0, stale: true };
  const [queue, heartbeat, reconciliation] = await Promise.all([
    db.from(TABLE).select(CUSTOMER_EMAIL_FIELDS).gte("created_at", activation)
      .or("delivery_status.is.null,delivery_status.not.in.(delivered,opened,clicked),delivery_error.not.is.null").order("created_at", { ascending: false }).limit(1000),
    db.from("crm_activity_events").select("created_at,action").eq("entity_type", "system")
      .eq("metadata->>processor", "customer-email").in("action", ["customer-email.succeeded", "customer-email.failed"])
      .order("created_at", { ascending: false }).limit(1),
    db.rpc("crm_customer_email_missing_count"),
  ]);
  if (queue.error || heartbeat.error || reconciliation.error) throw new Error("Customer email health could not be read.");
  const rows = queue.data as CustomerEmailRecord[];
  const attention = rows.filter(row => {
    const label = customerEmailStatus(row);
    return label.includes("attention") || label === "Delivery delayed" ||
      (label !== "Delivered" && now - Date.parse(row.created_at) > 15 * 60000);
  }).length;
  const lastRun = heartbeat.data?.[0]?.created_at || null;
  const stale = !lastRun || now - Date.parse(lastRun) > 15 * 60000;
  const workerFailed = heartbeat.data?.[0]?.action === "customer-email.failed";
  return { ok: Boolean(process.env.RESEND_API_KEY) && attention === 0 && !stale && !workerFailed && rows.length < 1000 && reconciliation.data === 0, activated: true, activation,
    providerConfigured: Boolean(process.env.RESEND_API_KEY), attention, stale, workerFailed, lastRun, missing: reconciliation.data as number, total: rows.length, truncated: rows.length >= 1000 };
}

/** Validates credentials and provider delivery access using an existing acceptance.
 * Read-only: no old email is sent, claimed, retried, or modified. */
export async function customerEmailReadiness(db: SupabaseClient) {
  if (!process.env.RESEND_API_KEY) return { ok: false, providerReady: false, reason: "Email provider is not configured." };
  const { data, error } = await db.from(TABLE).select("provider_message_id").eq("status", "accepted")
    .order("provider_accepted_at", { ascending: false }).limit(1);
  if (error || !data?.[0]?.provider_message_id) return { ok: false, providerReady: false, reason: "No provider acceptance is available to verify delivery access." };
  const id = data[0].provider_message_id;
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return { ok: false, providerReady: false, reason: `Email provider delivery access failed (${response.status}).` };
  const result = await response.json();
  const providerReady = result.id === id && typeof result.last_event === "string";
  return { ok: providerReady, providerReady };
}
