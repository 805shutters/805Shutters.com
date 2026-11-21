import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
type Outcome = {
  sent: boolean;
  uncertain?: boolean;
  error?: string;
  [key: string]: unknown;
};
/** At-most-once provider submission. An ambiguous acknowledgement stays held, never resent. */
export async function deliverStripeRequest<T extends Outcome>(
  db: SupabaseClient,
  requestId: string,
  channel: "email" | "text",
  recipient: string,
  key: string | undefined,
  payload: unknown,
  sender: () => Promise<T>,
): Promise<T> {
  const requestKey = key || `initial:${requestId}`;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ recipient, channel, payload }))
    .digest("hex");
  const inserted = await db
    .from("crm_stripe_deliveries")
    .upsert(
      {
        request_id: requestId,
        channel,
        request_key: requestKey,
        recipient,
        fingerprint,
      },
      { onConflict: "request_id,channel,request_key", ignoreDuplicates: true },
    );
  if (inserted.error) throw new Error("Delivery could not be safely reserved.");
  const scope = () =>
    db
      .from("crm_stripe_deliveries")
      .select("*")
      .eq("request_id", requestId)
      .eq("channel", channel)
      .eq("request_key", requestKey);
  const found = await scope().single();
  if (found.error || !found.data)
    throw new Error("Prior delivery could not be verified.");
  const row = found.data;
  if (row.recipient !== recipient || row.fingerprint !== fingerprint)
    throw new Error(
      "This delivery identity already belongs to different message details.",
    );
  if (row.status !== "pending") {
    if (row.result) return row.result as T;
    return {
      sent: false,
      uncertain: true,
      error:
        "A previous delivery has an unknown result. Review provider evidence before any resend.",
    } as T;
  }
  const claimed = await db
    .from("crm_stripe_deliveries")
    .update({ status: "sending", attempted_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id");
  if (claimed.error) throw new Error("Delivery claim could not be saved.");
  if (!claimed.data?.length)
    return {
      sent: false,
      uncertain: true,
      error: "Another worker owns this delivery. Refresh its recorded result.",
    } as T;
  let result: T;
  try {
    result = await sender();
  } catch {
    result = {
      sent: false,
      uncertain: true,
      error: "Provider acknowledgement unavailable; review before resending.",
    } as T;
  }
  const saved = await db
    .from("crm_stripe_deliveries")
    .update({
      status: result.sent
        ? "accepted"
        : result.uncertain
          ? "unknown"
          : "failed",
      result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "sending");
  if (saved.error)
    return {
      ...result,
      uncertain: true,
      error:
        "Delivery was attempted but its result could not be saved; do not resend.",
    };
  return result;
}
