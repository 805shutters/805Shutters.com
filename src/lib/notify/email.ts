// Resend email helper. Env-gated and NEVER throws (same contract as Twilio).
// Env: RESEND_API_KEY + optional RESEND_FROM / BOOKING_EMAIL_FROM.

import { VENMO_HANDLE, ZELLE_DESTINATION } from "@/lib/finance/payment-options";

export type EmailResult = { sent: boolean; skipped?: string; error?: string; id?: string };
export type EmailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

const DEFAULT_EMAIL_FROM = "805 Shutters <805@805shutters.com>";

function resendFromAddress(): string {
  return process.env.RESEND_FROM || process.env.BOOKING_EMAIL_FROM || DEFAULT_EMAIL_FROM;
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && resendFromAddress());
}

export async function sendEmail(input: {
  to: string | null | undefined;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
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
        from: resendFromAddress(),
        to: [to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.attachments?.length
          ? {
              attachments: input.attachments.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.content,
                ...(attachment.contentType ? { content_type: attachment.contentType } : {})
              }))
            }
          : {})
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
  personalNote?: string | null;
};

export type PaymentLinkEmailDetails = {
  quoteNumber?: string | null;
  depositDue?: number;
  balanceDue?: number;
  total?: number;
  logoUrl?: string;
  businessPhone?: string;
  personalNote?: string | null;
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
  const personalNote = details.personalNote?.trim();
  const personalNoteText = personalNote ? `\n\n${personalNote}` : "";
  const itemText = details.lines?.length ? `\n\nQuote items:\n${details.lines.map((line, index) => textLine(line, index)).join("\n")}` : "";
  const text = `Hi ${name},${personalNoteText}\n\nYour quote from 805 Shutters is ready${total > 0 ? ` (${amount})` : ""}.${itemText}\n\nPay your deposit: Venmo @${VENMO_HANDLE} or Zelle ${ZELLE_DESTINATION}.\n\nReview and approve it here:\n${url}\n\nThank you,\n805 Shutters`;
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-collapse:collapse;margin:0;padding:0;background:#ffffff!important;background-color:#ffffff!important;color:#0b0b0b!important;font-family:Arial,Helvetica,sans-serif">
  <tr>
    <td bgcolor="#ffffff" style="background:#ffffff!important;background-color:#ffffff!important;color:#0b0b0b!important">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;background:#ffffff!important;background-color:#ffffff!important;color:#0b0b0b!important">
    <div style="border-bottom:2px solid #0b0b0b;padding-bottom:18px;margin-bottom:22px">
      ${details.logoUrl ? `<div style="display:inline-block;background:#ffffff!important;background-color:#ffffff!important;margin:0 0 16px 0"><img src="${escapeAttr(details.logoUrl)}" alt="805 Shutters" width="176" style="display:block;width:176px;max-width:100%;height:auto;margin:0;border:0"></div>` : `<div style="font-size:18px;font-weight:700;letter-spacing:0.04em;margin-bottom:16px;color:#0b0b0b">805 SHUTTERS</div>`}
      <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#0b0b0b">${escapeHtml(quoteLabel)}</div>
      <h1 style="margin:6px 0 0 0;font-size:26px;line-height:1.18;font-weight:700;color:#0b0b0b">Ready for review</h1>
      <p style="margin:10px 0 0 0;font-size:15px;line-height:1.55;color:#0b0b0b">Hi ${escapeHtml(name)}, your quote${total > 0 ? ` for <strong>${amount}</strong>` : ""} is ready to review and approve.</p>
    </div>
    ${personalNote ? `<div style="border:1px solid #d8d8d2;background:#ffffff;padding:14px 16px;margin:0 0 20px 0;font-size:14px;line-height:1.55;color:#0b0b0b">${escapeHtml(personalNote).replace(/\n/g, "<br>")}</div>` : ""}
    ${details.lines?.length ? quoteLinesTable(details.lines) : ""}
    ${quoteSummary(details, total)}
    <p style="margin:18px 0 0 0;font-size:14px;line-height:1.6;color:#0b0b0b">Prefer to pay directly? Venmo <strong>@${escapeHtml(VENMO_HANDLE)}</strong> &middot; Zelle <strong>${escapeHtml(ZELLE_DESTINATION)}</strong></p>
    <div style="margin:26px 0 18px 0">
      <a href="${escapeAttr(url)}" style="display:inline-block;background:#0b0b0b;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:4px;font-size:15px;font-weight:700">Review and approve quote</a>
    </div>
    <p style="margin:0 0 18px 0;font-size:13px;line-height:1.5;color:#0b0b0b">Or paste this link into your browser:<br><span style="word-break:break-all;color:#0b0b0b">${escapeHtml(url)}</span></p>
    <p style="border-top:1px solid #d8d8d2;margin:22px 0 0 0;padding-top:16px;font-size:13px;line-height:1.5;color:#0b0b0b">Thank you,<br><strong style="color:#0b0b0b">805 Shutters</strong>${details.businessPhone ? `<br>${escapeHtml(details.businessPhone)}` : ""}</p>
  </div>
    </td>
  </tr>
</table>`;
  return { subject, html, text };
}

export function buildPaymentLinkEmail(customerName: string, url: string, details: PaymentLinkEmailDetails = {}): {
  subject: string;
  html: string;
  text: string;
} {
  const name = customerName && customerName !== "Valued customer" ? customerName : "there";
  const hasDepositDue = Number(details.depositDue) > 0;
  const amountDue = hasDepositDue
    ? Number(details.depositDue)
    : Number(details.balanceDue) > 0
      ? Number(details.balanceDue)
      : Number(details.total) > 0
        ? Number(details.total)
        : 0;
  const amountLabel = amountDue > 0 ? money(amountDue) : "";
  const dueLabel = hasDepositDue ? "Deposit due" : "Amount due";
  const headline = hasDepositDue ? "Deposit payment link" : "Payment link";
  const intro = hasDepositDue
    ? "Here is a payment link to pay the deposit for your new window coverings from 805 Shutters."
    : "Here is a payment link for your new window coverings from 805 Shutters.";
  const squareLabel = hasDepositDue ? "Pay deposit by Square card" : "Pay by Square card";
  const quoteLabel = details.quoteNumber ? `Quote ${details.quoteNumber}` : "805 Shutters";
  const personalNote = details.personalNote?.trim();
  const personalNoteText = personalNote ? `\n\n${personalNote}` : "";
  const dueText = amountLabel ? `\n\n${dueLabel}: ${amountLabel}` : "";
  const subject = `805 Shutters ${hasDepositDue ? "deposit " : ""}payment link${amountLabel ? ` - ${amountLabel}` : ""}`;
  const text = `Hello ${name},${personalNoteText}\n\n${intro}${dueText}\n\nPayment options:\n- Square card payment: ${url}\n- Venmo: @${VENMO_HANDLE}\n- Zelle: ${ZELLE_DESTINATION}\n\nPlease reference your name when paying by Venmo or Zelle.\n\nThank you,\n805 Shutters`;
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-collapse:collapse;margin:0;padding:0;background:#ffffff!important;background-color:#ffffff!important;color:#0b0b0b!important;font-family:Arial,Helvetica,sans-serif">
  <tr>
    <td bgcolor="#ffffff" style="background:#ffffff!important;background-color:#ffffff!important;color:#0b0b0b!important">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;background:#ffffff!important;background-color:#ffffff!important;color:#0b0b0b!important">
    <div style="border-bottom:2px solid #0b0b0b;padding-bottom:18px;margin-bottom:22px">
      ${details.logoUrl ? `<div style="display:inline-block;background:#ffffff!important;background-color:#ffffff!important;margin:0 0 16px 0"><img src="${escapeAttr(details.logoUrl)}" alt="805 Shutters" width="176" style="display:block;width:176px;max-width:100%;height:auto;margin:0;border:0"></div>` : `<div style="font-size:18px;font-weight:700;letter-spacing:0.04em;margin-bottom:16px;color:#0b0b0b">805 SHUTTERS</div>`}
      <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#0b0b0b">${escapeHtml(quoteLabel)}</div>
      <h1 style="margin:6px 0 0 0;font-size:26px;line-height:1.18;font-weight:700;color:#0b0b0b">${escapeHtml(headline)}</h1>
      <p style="margin:10px 0 0 0;font-size:15px;line-height:1.55;color:#0b0b0b">Hello ${escapeHtml(name)},</p>
      <p style="margin:8px 0 0 0;font-size:15px;line-height:1.55;color:#0b0b0b">${escapeHtml(intro)}</p>
    </div>
    ${personalNote ? `<div style="border:1px solid #d8d8d2;background:#ffffff;padding:14px 16px;margin:0 0 20px 0;font-size:14px;line-height:1.55;color:#0b0b0b">${escapeHtml(personalNote).replace(/\n/g, "<br>")}</div>` : ""}
    ${amountLabel ? `<div style="border:2px solid #0b0b0b;padding:14px 16px;margin:0 0 20px 0"><div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0b0b0b">${escapeHtml(dueLabel)}</div><div style="font-size:28px;line-height:1.2;font-weight:700;color:#0b0b0b">${amountLabel}</div></div>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 22px 0">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #d8d8d2;font-size:14px;color:#0b0b0b"><strong>Square card payment</strong><br><a href="${escapeAttr(url)}" style="color:#0b0b0b;font-weight:700">${escapeHtml(squareLabel)}</a><br><span style="color:#0b0b0b">Pay by credit or debit card through Square.</span></td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #d8d8d2;font-size:14px;color:#0b0b0b"><strong>Venmo</strong><br><span style="color:#0b0b0b">@${escapeHtml(VENMO_HANDLE)}</span></td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #d8d8d2;font-size:14px;color:#0b0b0b"><strong>Zelle</strong><br><span style="color:#0b0b0b">${escapeHtml(ZELLE_DESTINATION)}</span></td>
      </tr>
    </table>
    <div style="margin:26px 0 18px 0">
      <a href="${escapeAttr(url)}" style="display:inline-block;background:#0b0b0b;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:4px;font-size:15px;font-weight:700">${escapeHtml(squareLabel)}</a>
    </div>
    <p style="margin:0 0 18px 0;font-size:13px;line-height:1.5;color:#0b0b0b">Or paste this link into your browser:<br><span style="word-break:break-all;color:#0b0b0b">${escapeHtml(url)}</span></p>
    <p style="margin:0 0 18px 0;font-size:13px;line-height:1.5;color:#0b0b0b">Please reference your name when paying by Venmo or Zelle.</p>
    <p style="border-top:1px solid #d8d8d2;margin:22px 0 0 0;padding-top:16px;font-size:13px;line-height:1.5;color:#0b0b0b">Thank you,<br><strong style="color:#0b0b0b">805 Shutters</strong>${details.businessPhone ? `<br>${escapeHtml(details.businessPhone)}` : ""}</p>
  </div>
    </td>
  </tr>
</table>`;
  return { subject, html, text };
}

/** Signed-contract notification emailed to the SHOP when a customer signs.
 *  Reuses the full contract rendering (line items, total, link) with a signed banner. */
export function buildSignedQuoteShopEmail(customerName: string, url: string, total: number, details: QuoteEmailDetails = {}): {
  subject: string;
  html: string;
  text: string;
} {
  const base = buildQuoteEmail(customerName, url, total, details);
  const amount = money(total);
  const name = customerName && customerName !== "Valued customer" ? customerName : "a customer";
  const banner = `<div style="background:#0b0b0b;color:#ffffff;border-radius:8px;padding:14px 18px;margin:0 0 18px 0"><strong style="font-size:16px">✅ Signed &amp; approved</strong><div style="font-size:14px;margin-top:4px;opacity:0.92">${escapeHtml(name)} just signed this contract${total > 0 ? ` for <strong>${amount}</strong>` : ""}. Time to order.</div></div>`;
  return {
    subject: `✅ Signed contract: ${name}${total > 0 ? ` — ${amount}` : ""}`,
    html: `<div style="margin:0;padding:0;background:#ffffff;color:#0b0b0b;font-family:Arial,Helvetica,sans-serif"><div style="max-width:640px;margin:0 auto;padding:28px 18px">${banner}${base.html}</div></div>`,
    text: `✅ SIGNED & APPROVED\n${name} just signed this contract${total > 0 ? ` for ${amount}` : ""}. Time to order.\n\n${base.text}`,
  };
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
        <span style="color:#0b0b0b">${escapeHtml(product)}${escapeHtml(style)}</span>
        ${details ? `<br><span style="font-size:12px;color:#0b0b0b">${escapeHtml(details)}</span>` : ""}
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #e5e5e0;vertical-align:top;text-align:right;font-size:14px;color:#0b0b0b">${line.quantity}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #e5e5e0;vertical-align:top;text-align:right;font-size:14px;color:#0b0b0b">${price}</td>
    </tr>`;
  }).join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px 0">
    <thead>
      <tr>
        <th align="left" style="padding:0 8px 8px 8px;border-bottom:1px solid #0b0b0b;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#0b0b0b;font-weight:700">#</th>
        <th align="left" style="padding:0 8px 8px 8px;border-bottom:1px solid #0b0b0b;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#0b0b0b;font-weight:700">Item</th>
        <th align="right" style="padding:0 8px 8px 8px;border-bottom:1px solid #0b0b0b;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#0b0b0b;font-weight:700">Qty</th>
        <th align="right" style="padding:0 8px 8px 8px;border-bottom:1px solid #0b0b0b;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#0b0b0b;font-weight:700">Total</th>
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
  return `<tr><td style="padding:4px 0;font-size:14px;color:#0b0b0b">${escapeHtml(label)}</td><td align="right" style="padding:4px 0;font-size:14px;color:#0b0b0b">${money(value)}</td></tr>`;
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
