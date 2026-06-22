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

export type QuoteEmailLine = {
  room: string;
  dimensions?: string;
  productName: string;
  styleName?: string;
  options?: string[];
  quantity: number;
  lineTotal: number;
  priceReady?: boolean;
};

export type QuoteEmailFee = {
  name: string;
  amount: number;
};

export type QuoteEmailDetails = {
  quoteNumber?: string | null;
  lines?: QuoteEmailLine[];
  subtotal?: number;
  fees?: QuoteEmailFee[];
  discount?: number;
  tax?: number;
  sourceTotalAdjustment?: number;
  depositDue?: number;
  balanceDue?: number;
  logoUrl?: string;
  businessPhone?: string;
};

export function buildQuoteEmail(customerName: string, url: string, total: number, details: QuoteEmailDetails = {}): {
  subject: string;
  html: string;
  text: string;
} {
  const amount = money(total);
  const name = customerName && customerName !== "Valued customer" ? customerName : "there";
  const quoteLabel = details.quoteNumber ? `Quote ${details.quoteNumber}` : "Your Quote";
  const subject = `Your 805 Shutters quote${total > 0 ? ` - ${amount}` : ""}`;
  const itemText = details.lines?.length ? `\n\nQuote items:\n${details.lines.map((line, index) => textLine(line, index)).join("\n")}` : "";
  const text = `Hi ${name},\n\nYour quote from 805 Shutters is ready${total > 0 ? ` (${amount})` : ""}.${itemText}\n\nReview and approve it here:\n${url}\n\nThank you,\n805 Shutters`;
  const html = `<div style="margin:0;padding:0;background:#ffffff;color:#0b0b0b;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px">
    <div style="border-bottom:2px solid #0b0b0b;padding-bottom:18px;margin-bottom:22px">
      ${details.logoUrl ? `<img src="${escapeAttr(details.logoUrl)}" alt="805 Shutters" width="176" style="display:block;width:176px;max-width:60%;height:auto;margin:0 0 16px 0;border:0">` : `<div style="font-size:18px;font-weight:700;letter-spacing:0.04em;margin-bottom:16px">805 SHUTTERS</div>`}
      <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#333333">${escapeHtml(quoteLabel)}</div>
      <h1 style="margin:6px 0 0 0;font-size:26px;line-height:1.18;font-weight:700;color:#0b0b0b">Ready for review</h1>
      <p style="margin:10px 0 0 0;font-size:15px;line-height:1.55;color:#1f1f1f">Hi ${escapeHtml(name)}, your quote${total > 0 ? ` for <strong>${amount}</strong>` : ""} is ready to review and approve.</p>
    </div>
    ${details.lines?.length ? quoteLinesTable(details.lines) : ""}
    ${quoteSummary(details, total)}
    <div style="margin:26px 0 18px 0">
      <a href="${escapeAttr(url)}" style="display:inline-block;background:#0b0b0b;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:4px;font-size:15px;font-weight:700">Review and approve quote</a>
    </div>
    <p style="margin:0 0 18px 0;font-size:13px;line-height:1.5;color:#555555">Or paste this link into your browser:<br><span style="word-break:break-all;color:#0b0b0b">${escapeHtml(url)}</span></p>
    <p style="border-top:1px solid #d8d8d2;margin:22px 0 0 0;padding-top:16px;font-size:13px;line-height:1.5;color:#555555">Thank you,<br><strong style="color:#0b0b0b">805 Shutters</strong>${details.businessPhone ? `<br>${escapeHtml(details.businessPhone)}` : ""}</p>
  </div>
</div>`;
  return { subject, html, text };
}

function quoteLinesTable(lines: QuoteEmailLine[]): string {
  const rows = lines.map((line, index) => {
    const product = line.priceReady === false ? "Pricing in progress" : line.productName || "Window treatment";
    const style = line.styleName ? ` - ${line.styleName}` : "";
    const details = [line.dimensions, ...(line.options ?? [])].filter(Boolean).join(" | ");
    const price = line.priceReady === false ? "-" : money(line.lineTotal);
    return `<tr>
      <td style="padding:12px 8px;border-bottom:1px solid #e5e5e0;vertical-align:top;font-size:14px;color:#0b0b0b">${index + 1}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #e5e5e0;vertical-align:top;font-size:14px;color:#0b0b0b">
        <strong>${escapeHtml(line.room || "Window")}</strong><br>
        <span style="color:#333333">${escapeHtml(product)}${escapeHtml(style)}</span>
        ${details ? `<br><span style="font-size:12px;color:#666666">${escapeHtml(details)}</span>` : ""}
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #e5e5e0;vertical-align:top;text-align:right;font-size:14px;color:#0b0b0b">${line.quantity}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #e5e5e0;vertical-align:top;text-align:right;font-size:14px;color:#0b0b0b">${price}</td>
    </tr>`;
  }).join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px 0">
    <thead>
      <tr>
        <th align="left" style="padding:0 8px 8px 8px;border-bottom:1px solid #0b0b0b;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#333333;font-weight:700">#</th>
        <th align="left" style="padding:0 8px 8px 8px;border-bottom:1px solid #0b0b0b;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#333333;font-weight:700">Item</th>
        <th align="right" style="padding:0 8px 8px 8px;border-bottom:1px solid #0b0b0b;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#333333;font-weight:700">Qty</th>
        <th align="right" style="padding:0 8px 8px 8px;border-bottom:1px solid #0b0b0b;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#333333;font-weight:700">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function quoteSummary(details: QuoteEmailDetails, total: number): string {
  const rows = [
    typeof details.subtotal === "number" ? summaryRow("Subtotal", details.subtotal) : "",
    ...(details.fees ?? []).map((fee) => summaryRow(fee.name, fee.amount)),
    details.discount && details.discount > 0 ? summaryRow("Discount", -details.discount) : "",
    details.tax && details.tax > 0 ? summaryRow("Tax", details.tax) : "",
    details.sourceTotalAdjustment ? summaryRow("Quote adjustment", details.sourceTotalAdjustment) : "",
    `<tr><td style="padding:10px 0 0 0;border-top:2px solid #0b0b0b;font-size:16px;font-weight:700;color:#0b0b0b">Total</td><td align="right" style="padding:10px 0 0 0;border-top:2px solid #0b0b0b;font-size:18px;font-weight:700;color:#0b0b0b">${money(total)}</td></tr>`,
    details.depositDue && details.depositDue > 0 ? summaryRow("Deposit due", details.depositDue) : "",
    details.balanceDue && details.balanceDue > 0 ? summaryRow("Balance", details.balanceDue) : "",
  ].filter(Boolean).join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 0 auto;max-width:320px">${rows}</table>`;
}

function summaryRow(label: string, value: number): string {
  return `<tr><td style="padding:4px 0;font-size:14px;color:#333333">${escapeHtml(label)}</td><td align="right" style="padding:4px 0;font-size:14px;color:#0b0b0b">${money(value)}</td></tr>`;
}

function textLine(line: QuoteEmailLine, index: number): string {
  const product = line.priceReady === false ? "Pricing in progress" : [line.productName, line.styleName].filter(Boolean).join(" - ");
  const details = [line.dimensions, ...(line.options ?? [])].filter(Boolean).join("; ");
  const total = line.priceReady === false ? "Pricing in progress" : money(line.lineTotal);
  return `${index + 1}. ${line.room || "Window"} - ${product}${details ? ` (${details})` : ""} - Qty ${line.quantity} - ${total}`;
}

function money(n: number): string {
  const value = Number(n) || 0;
  const abs = Math.abs(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return value < 0 ? `- ${abs}` : abs;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
