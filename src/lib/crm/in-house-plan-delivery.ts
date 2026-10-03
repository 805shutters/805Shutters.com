import { OWNER_ALERT_FROM_PHONE } from "@/lib/notify/owner-alert-routing";
import { createHmac, timingSafeEqual } from "node:crypto";
import { toE164 } from "@/lib/notify/twilio";
import type { PlanNotification } from "./in-house-plan-model";
export type DeliveryResult = {
  status: PlanNotification["status"];
  providerId?: string;
  error?: string;
  retry?: boolean;
};
export type DeliveryMessage = {
  id: string;
  channel: "email" | "sms" | "owner";
  to: string | null;
  subject: string;
  text: string;
};
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function deliverPlanMessage(
  message: DeliveryMessage,
): Promise<DeliveryResult> {
  if (!message.to)
    return { status: "skipped", error: "Missing recipient contact" };
  try {
    let response: Response;
    if (message.channel === "email") {
      if (!process.env.RESEND_API_KEY)
        return { status: "skipped", error: "Email provider is not configured" };
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `805-plan-${message.id}`,
        },
        body: JSON.stringify({
          from: "805 Shutters <805@805shutters.com>",
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: `<div style="font:16px/1.6 Arial,sans-serif;color:#18231e;max-width:600px"><h2>805 Shutters</h2>${message.text
            .split("\n")
            .map((l) => `<p>${escapeHtml(l)}</p>`)
            .join("")}</div>`,
        }),
      });
    } else {
      const to = toE164(message.to);
      if (!to)
        return { status: "skipped", error: "Invalid or missing phone number" };
      const {
        TWILIO_ACCOUNT_SID: sid,
        TWILIO_AUTH_TOKEN: token,
        TWILIO_MESSAGING_SERVICE_SID: service,
        TWILIO_FROM_PHONE: from,
      } = process.env;
      const callback = `${(process.env.NEXT_PUBLIC_SITE_URL || "https://www.805shutters.com").replace(/\/$/, "")}/api/webhooks/in-house-plan-sms/`;
      if (!sid || !token || (!service && !from))
        return {
          status: "skipped",
          error: "SMS provider or delivery callback URL is not configured",
        };
      const body = new URLSearchParams({
        To: to,
        Body: message.text,
        StatusCallback: `${callback}?notification=${message.id}`,
        ...(service ? { MessagingServiceSid: service } : { From: from! }),
        ...(message.channel === "owner" ? { From: OWNER_ALERT_FROM_PHONE } : {}),
      });
      response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        },
      );
    }
    const result = (await response.json().catch(() => ({}))) as {
      id?: string;
      sid?: string;
      message?: string;
      code?: number;
    };
    if (!response.ok) {
      if (result.code === 21610)
        return {
          status: "skipped",
          error: "Recipient opted out of text messages",
        };
      // 429 explicitly rejects acceptance. 5xx/network failures can follow acceptance: never blindly resend SMS.
      return {
        status: response.status >= 500 ? "unknown" : "failed",
        error: result.message || `Provider returned ${response.status}`,
        retry: response.status === 429,
      };
    }
    const providerId = result.id || result.sid;
    return providerId
      ? { status: "accepted", providerId }
      : { status: "unknown", error: "Provider did not return a message ID" };
  } catch {
    return {
      status: "unknown",
      error:
        "Delivery response was interrupted. Check provider history before resending.",
    };
  }
}
export function verifyPlanSmsSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  token = process.env.TWILIO_AUTH_TOKEN || "",
) {
  if (!token || !signature) return false;
  const text =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = Buffer.from(
    createHmac("sha1", token).update(text).digest("base64"),
  );
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
/** Read delivery proof; provider acceptance alone never means delivered. */
export async function emailDeliveryStatus(
  providerId: string,
  fetcher: typeof fetch = fetch,
): Promise<DeliveryResult> {
  if (!process.env.RESEND_API_KEY)
    return {
      status: "accepted",
      error: "Email delivery lookup is not configured",
    };
  try {
    const r = await fetcher(
      `https://api.resend.com/emails/${encodeURIComponent(providerId)}`,
      {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!r.ok) throw new Error(`Email delivery lookup failed (${r.status})`);
    const data = await r.json();
    if (data.id !== providerId || typeof data.last_event !== "string")
      throw new Error("Incomplete email delivery evidence");
    if (["delivered", "opened", "clicked"].includes(data.last_event))
      return { status: "delivered", providerId };
    if (
      ["bounced", "failed", "complained", "suppressed"].includes(
        data.last_event,
      )
    )
      return {
        status: "failed",
        providerId,
        error: `Email ${data.last_event}`,
      };
    return { status: "accepted", providerId };
  } catch (e) {
    return {
      status: "accepted",
      providerId,
      error:
        e instanceof Error ? e.message : "Email delivery lookup unavailable",
    };
  }
}
