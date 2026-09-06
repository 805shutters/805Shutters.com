import { CrmAuthError } from "./auth";
import { HUB_FROM } from "./quote-hub-model";
import type { HubAttachment } from "./quote-hub-gmail";

export class HubDeliveryRejected extends Error {}
export type HubDeliveryInput = {
  id: string;
  createdAt: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  rfcMessageId: string;
  replyToMessageId?: string;
  attachments: HubAttachment[];
};
export function assertHubDeliveryConfigured() {
  if (!process.env.RESEND_API_KEY)
    throw new CrmAuthError(
      503,
      "805 email sending is not configured. Connect the existing email provider.",
    );
}
/** Retry the same immutable payload with the same provider idempotency key.
 * Never retry after the provider's 24-hour key retention window. */
export async function deliverHubEmail(
  input: HubDeliveryInput,
): Promise<string> {
  assertHubDeliveryConfigured();
  if (
    !Number.isFinite(Date.parse(input.createdAt)) ||
    Date.now() - Date.parse(input.createdAt) > 23 * 60 * 60 * 1000
  )
    throw new CrmAuthError(
      409,
      "This email is too old for a safe retry. Verify it in the email provider before preparing a replacement.",
    );
  const headers: Record<string, string> = { "Message-ID": input.rfcMessageId };
  if (input.replyToMessageId && /^<[^<>\r\n]+>$/.test(input.replyToMessageId)) {
    headers["In-Reply-To"] = input.replyToMessageId;
    headers.References = input.replyToMessageId;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `quote-hub/${input.id}`,
    },
    body: JSON.stringify({
      from: `805 Shutters <${HUB_FROM}>`,
      reply_to: HUB_FROM,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      headers,
      attachments: input.attachments.map((a, i) => ({
        filename: `photo-${i}.${a.contentType === "image/png" ? "png" : a.contentType === "image/webp" ? "webp" : "jpg"}`,
        content: a.content.toString("base64"),
        content_type: a.contentType,
        content_id: `photo-${i}`,
      })),
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if ([400, 401, 403, 422].includes(response.status))
      throw new HubDeliveryRejected(
        "Email provider rejected the message. Check the sending account and recipient before trying again.",
      );
    throw new Error("Email provider did not confirm delivery.");
  }
  if (typeof data.id !== "string" || !data.id)
    throw new Error("Email provider did not return a message ID.");
  return data.id;
}
