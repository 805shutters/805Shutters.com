// Resend email helper. Env-gated and NEVER throws (same contract as Twilio).
// Env: RESEND_API_KEY + RESEND_FROM ("Name <sender@domain>"). When unset, skips.

export type EmailResult = { sent: boolean; skipped?: string; error?: string; id?: string };

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export async function sendEmail(input: {
  to: string | null | undefined;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailResult> {
  const to = (input.to || "").trim();
  if (!to) return { sent: false, skipped: "no recipient email" };
  if (!isResendConfigured()) return { sent: false, skipped: "resend not configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: [to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      console.warn("Resend send failed:", data.message || res.status);
      return { sent: false, error: data.message || `Resend error ${res.status}` };
    }
    return { sent: true, id: data.id };
  } catch (e) {
    console.warn("Resend send threw:", e);
    return { sent: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

export function buildQuoteEmail(customerName: string, url: string, total: number): {
  subject: string;
  html: string;
  text: string;
} {
  const amount = total.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const name = customerName && customerName !== "Valued customer" ? customerName : "there";
  const subject = `Your 805 Shutters quote${total > 0 ? ` — ${amount}` : ""}`;
  const text = `Hi ${name},\n\nYour quote from 805 Shutters is ready${total > 0 ? ` (${amount})` : ""}. Review and approve it here:\n${url}\n\nThank you!\n805 Shutters`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
  <h2 style="color:#0f172a">Your 805 Shutters quote is ready</h2>
  <p>Hi ${escapeHtml(name)}, your quote${total > 0 ? ` of <strong>${amount}</strong>` : ""} is ready to review and approve.</p>
  <p style="margin:24px 0"><a href="${escapeAttr(url)}" style="background:#0f172a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none">Review &amp; approve your quote</a></p>
  <p style="color:#64748b;font-size:13px">Or paste this link into your browser:<br>${escapeHtml(url)}</p>
  <p style="color:#64748b;font-size:13px">Thank you,<br>805 Shutters</p>
</div>`;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
