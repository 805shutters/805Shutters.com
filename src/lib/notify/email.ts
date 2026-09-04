// Resend email helper. Env-gated and NEVER throws (same contract as Twilio).
// Env: RESEND_API_KEY + optional RESEND_FROM / BOOKING_EMAIL_FROM.

import { ZELLE_DESTINATION } from "@/lib/finance/payment-options";
import { brandIdentity, officialContactLine } from "@/lib/brand-identity";
import { quoteProductDetails } from "@/lib/crm/customer-quote-details";
import { customerQuoteProductName, customerQuoteText } from "@/lib/crm/customer-quote-branding";

export type EmailResult = { sent: boolean; skipped?: string; error?: string; id?: string; uncertain?: boolean };
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
  from?: string;
  idempotencyKey?: string;
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
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: input.from || resendFromAddress(),
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
    return { sent: false, error: e instanceof Error ? e.message : "send failed", uncertain: true };
  }
}

export type QuoteEmailLine = {
  room: string;
  productName: string;
  styleName?: string;
  options?: string[];
  designOptions?: QuoteEmailDesignOption[];
  showDesignOptions?: boolean;
  quantity: number;
  lineTotal: number;
  priceReady?: boolean;
};

export type QuoteEmailDesignOption = {
  id?: string;
  label?: string;
  productName: string;
  styleName?: string;
  options?: string[];
  lineTotal?: number;
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
  versions?: { label: string; total: number; current?: boolean }[];
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

export type SquareOrderPaymentEmailDetails = {
  paymentType: "deposit" | "balance";
  amount: number;
  quoteNumber?: string | null;
  logoUrl?: string;
};

export function buildSquareOrderPaymentEmail(
  customerName: string,
  url: string,
  details: SquareOrderPaymentEmailDetails,
): { subject: string; html: string; text: string } {
  const name = customerName && customerName !== "Valued customer" ? customerName : "there";
  const isDeposit = details.paymentType === "deposit";
  const amount = money(details.amount);
  const subject = isDeposit
    ? `Your 805 Shutters deposit link - ${amount}`
    : `Your 805 Shutters balance link - ${amount}`;
  const intro = isDeposit
    ? "Here is your deposit information to start your order. Please use the secure Square link below to pay your deposit."
    : "Thank you so much for your order. Please use the secure Square link below to pay your remaining balance.";
  const action = isDeposit ? "Pay deposit through Square" : "Pay balance through Square";
  const quoteLabel = details.quoteNumber ? `Order ${details.quoteNumber}` : "805 Shutters order";
  const text = `Hello ${name},\n\n${intro}\n\n${isDeposit ? "Deposit" : "Balance"} due: ${amount}\n\n${action}: ${url}\n\nThank you,\n805 Shutters\n\n${officialContactLine}`;
  const html = `<div style="margin:0;padding:0;background:#ffffff;color:#0b0b0b;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px">
    <div style="border-bottom:2px solid #0b0b0b;padding-bottom:18px;margin-bottom:22px">
      ${details.logoUrl ? `<img src="${escapeAttr(details.logoUrl)}" alt="805 Shutters" width="176" style="display:block;width:176px;max-width:60%;height:auto;margin:0 0 16px 0;border:0">` : `<div style="font-size:18px;font-weight:700;letter-spacing:0.04em;margin-bottom:16px">805 SHUTTERS</div>`}
      <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#333333">${escapeHtml(quoteLabel)}</div>
      <h1 style="margin:6px 0 0 0;font-size:26px;line-height:1.18;font-weight:700;color:#0b0b0b">${isDeposit ? "Deposit payment" : "Balance payment"}</h1>
      <p style="margin:10px 0 0 0;font-size:15px;line-height:1.55;color:#1f1f1f">Hello ${escapeHtml(name)},</p>
      <p style="margin:8px 0 0 0;font-size:15px;line-height:1.55;color:#1f1f1f">${escapeHtml(intro)}</p>
    </div>
    <div style="border:2px solid #0b0b0b;padding:14px 16px;margin:0 0 20px 0"><div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#333333">${isDeposit ? "Deposit due" : "Balance due"}</div><div style="font-size:28px;line-height:1.2;font-weight:700;color:#0b0b0b">${amount}</div></div>
    <div style="margin:26px 0 18px 0"><a href="${escapeAttr(url)}" style="display:inline-block;background:#0b0b0b;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:4px;font-size:15px;font-weight:700">${escapeHtml(action)}</a></div>
    <p style="margin:0 0 18px 0;font-size:13px;line-height:1.5;color:#555555">Or paste this secure Square link into your browser:<br><span style="word-break:break-all;color:#0b0b0b">${escapeHtml(url)}</span></p>
    ${officialContactFooterHtml()}
  </div>
</div>`;
  return { subject, html, text };
}

const FINANCING_SMS_NUMBER = "+18058069344";
const DEFAULT_SITE_ORIGIN = "https://www.805shutters.com";

function siteOriginFromLogo(logoUrl?: string) {
  try {
    return logoUrl ? new URL(logoUrl).origin : DEFAULT_SITE_ORIGIN;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

function smsHref(body: string) {
  return `sms:${FINANCING_SMS_NUMBER}?&body=${encodeURIComponent(body)}`;
}

/**
 * "Two Financing Options Available!" section appended to customer quote and
 * payment-link emails: Wisetack financing + the 805 in-house plan (0%
 * interest, Square autopay, first payment on install day). Fluid-hybrid
 * two-column layout: side-by-side on desktop, stacks on phones without media
 * queries.
 */
export function buildFinancingOptionsSection(details: {
  quoteNumber?: string | null;
  total?: number;
  depositDue?: number;
  balanceDue?: number;
  logoUrl?: string;
}): { html: string; text: string } {
  const total = Number(details.total) || 0;
  const depositDue = Number(details.depositDue) || 0;
  const balanceDue = Number(details.balanceDue) || 0;
  const financeAmount =
    balanceDue > 0 ? balanceDue : total > 0 && depositDue > 0 ? Math.max(0, total - depositDue) : total > 0 ? total / 2 : 0;
  const monthly = financeAmount > 0 ? Math.round((financeAmount / 3) * 1.03 * 100) / 100 : 0;
  const quoteRef = details.quoteNumber ? ` for quote ${details.quoteNumber}` : "";
  const origin = siteOriginFromLogo(details.logoUrl);
  const wisetackSms = smsHref(`Hi! I'd like the Wisetack financing application link${quoteRef}.`);
  const housePlanSms = smsHref(`Hi! I'd like to set up the 805 in-house payment plan${quoteRef}.`);

  const check = (line: string) =>
    `<div style="padding:3px 0 3px 0;font-size:13px;line-height:1.55;color:#0b0b0b"><strong>&#10003;</strong>&nbsp; ${line}</div>`;

  const card = (input: { bar: string; logo: string; big: string; bigsub: string; checks: string[]; ctaLabel: string; ctaHref: string }) => `<div style="display:inline-block;width:100%;max-width:301px;vertical-align:top;text-align:left;margin:0 0 14px 0">
  <div style="border:2px solid #0b0b0b;margin:0 3px">
    <div style="background:#0b0b0b;color:#ffffff;padding:10px 14px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700">${input.bar}</div>
    <div style="padding:16px 14px 14px">
      <div style="height:88px;line-height:88px;text-align:center;border-bottom:1px solid #d8d8d2;margin:0 0 12px 0">${input.logo}</div>
      <div style="font-size:28px;font-weight:700;line-height:1.05;color:#0b0b0b">${input.big}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b6b66;margin:4px 0 12px 0">${input.bigsub}</div>
      ${input.checks.map(check).join("")}
      <a href="${escapeAttr(input.ctaHref)}" style="display:block;text-align:center;background:#0b0b0b;color:#ffffff;text-decoration:none;padding:12px 14px;border-radius:4px;font-size:13px;font-weight:700;margin:14px 0 0 0">${input.ctaLabel}</a>
    </div>
  </div>
</div>`;

  const html = `<div style="margin:28px 0 6px 0;border-top:2px solid #0b0b0b;padding-top:18px">
  <div style="text-align:center;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;font-weight:700;color:#0b0b0b">Two Financing Options Available!</div>
  <p style="text-align:center;font-size:13.5px;line-height:1.55;color:#6b6b66;margin:6px 0 16px 0">You don't have to pay it all at once &mdash; choose the option that fits.</p>
  <div style="text-align:center;font-size:0">
    ${card({
      bar: "Option 1 &middot; Wisetack Financing",
      logo: `<img src="${escapeAttr(`${origin}/images/wisetack-logo.png`)}" alt="Wisetack" height="26" style="height:26px;width:auto;vertical-align:middle;border:0">`,
      big: "0% APR",
      bigsub: "available for qualified customers*",
      checks: [
        "Apply from your phone in about a minute",
        "Checking options won't affect your credit score",
        "Multiple monthly plans to choose from",
        "No prepayment penalties or hidden fees"
      ],
      ctaLabel: "Text us for your application link",
      ctaHref: wisetackSms
    })}
    ${card({
      bar: "Option 2 &middot; 805 In-House Plan",
      logo: `<img src="${escapeAttr(`${origin}/brand/805-shutters-logo-exact-transparent.png`)}" alt="805 Shutters" height="78" style="height:78px;width:auto;vertical-align:middle;border:0">`,
      big: monthly > 0 ? `${money(monthly)}<span style="font-size:13px;font-weight:400">/mo</span>` : "0% Interest",
      bigsub: monthly > 0 ? "on this quote &middot; 3 payments &middot; 0% interest" : "up to 3 monthly payments",
      checks: [
        "No credit application &mdash; ever",
        "50% deposit today, the rest over 3 monthly payments",
        "Auto-charged to your card, starting install day",
        "Set it up once &mdash; nothing to remember"
      ],
      ctaLabel: "Reply or text 805-806-9344",
      ctaHref: housePlanSms
    })}
  </div>
  <p style="font-size:10.5px;line-height:1.5;color:#6b6b66;margin:8px 0 0 0">*All financing is subject to credit approval. Your terms may vary. Payment options through Wisetack are provided by Wisetack's lending partners. Offers range from 0&ndash;35.9% APR based on amount requested and creditworthiness. Not all merchants and lending partners participate in 0% interest programs. See additional terms at wisetack.com/faqs. In-house plan collected by automatic card payment through Square; 3 monthly payments shown include a 3% card processing fee (credit cards).</p>
</div>`;

  const text = `\n\nTWO FINANCING OPTIONS AVAILABLE!\n\nOption 1 - Wisetack Financing: 0% APR available for qualified customers*. Apply from your phone in about a minute; checking options won't affect your credit score. Text ${FINANCING_SMS_NUMBER} for your application link.\n\nOption 2 - 805 In-House Plan: 0% interest, no credit application.${monthly > 0 ? ` On this quote: 50% deposit, then 3 monthly payments of ${money(monthly)} auto-charged to your card, starting the day of installation.` : " 50% deposit, then up to 3 monthly card payments starting the day of installation."} Reply or text 805-806-9344 to set it up.\n\n*Financing subject to credit approval; terms vary. Provided by Wisetack's lending partners. See wisetack.com/faqs. In-house monthly amount includes a 3% card processing fee.`;

  return { html, text };
}

export function buildQuoteEmail(customerName: string, url: string, total: number, details: QuoteEmailDetails = {}): {
  subject: string;
  html: string;
  text: string;
} {
  const amount = money(total);
  const fullName = customerName.trim();
  const name = fullName && fullName !== "Valued customer" ? fullName.split(/\s+/)[0] : "there";
  const quoteLabel = details.quoteNumber ? `Contract ${details.quoteNumber}` : "Your Contract";
  const subject = `Your 805 Shutters contract${total > 0 ? ` - ${amount}` : ""}`;
  const personalNote = customerQuoteText(details.personalNote);
  const personalNoteText = personalNote ? `\n\n${personalNote}` : "";
  const quoteVersions = (details.versions ?? []).map((version, index) => ({
    ...version, label: customerQuoteText(version.label) || String(index + 1),
  }));
  const versionsText = quoteVersions.length > 1
    ? `\n\nThis link includes ${quoteVersions.length} quotes to compare:\n${quoteVersions.map((version) => `- Quote ${version.label}: ${money(version.total)}`).join("\n")}`
    : "";
  const itemText = details.lines?.length ? `\n\nContract items:\n${details.lines.map((line, index) => textLine(line, index)).join("\n")}` : "";
  const financing = buildFinancingOptionsSection({
    quoteNumber: details.quoteNumber,
    total,
    depositDue: details.depositDue,
    balanceDue: details.balanceDue,
    logoUrl: details.logoUrl
  });
  const text = `Hi ${name},${personalNoteText}\n\nYour contract from 805 Shutters is ready${total > 0 ? ` (${amount})` : ""}.${versionsText}${itemText}\n\nPay your deposit: Zelle ${ZELLE_DESTINATION}.\n\nReview and approve it here:\n${url}${financing.text}\n\nThank you,\n805 Shutters\n\n${officialContactLine}`;
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-collapse:collapse;margin:0;padding:0;background:#ffffff!important;background-color:#ffffff!important;color:#0b0b0b!important;font-family:'Helvetica Neue',Arial,sans-serif">
  <tr>
    <td bgcolor="#ffffff" style="background:#ffffff!important;background-color:#ffffff!important;color:#0b0b0b!important">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;background:#ffffff!important;background-color:#ffffff!important;color:#0b0b0b!important">
    <div style="border-bottom:2px solid #0b0b0b;padding-bottom:18px;margin-bottom:22px">
      ${details.logoUrl ? `<div align="center" style="display:block;text-align:center;background:#ffffff!important;background-color:#ffffff!important;margin:0 0 16px 0"><img src="${escapeAttr(details.logoUrl)}" alt="805 Shutters" width="176" style="display:block;width:176px;max-width:100%;height:auto;margin:0 auto;border:0"></div>` : `<div style="font-size:18px;font-weight:700;letter-spacing:0.04em;margin-bottom:16px;color:#0b0b0b">805 SHUTTERS</div>`}
      <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#0b0b0b">${escapeHtml(quoteLabel)}</div>
      <h1 style="margin:6px 0 0 0;font-size:26px;line-height:1.18;font-weight:700;color:#0b0b0b">Ready for review</h1>
      <p style="margin:10px 0 0 0;font-size:15px;line-height:1.55;color:#0b0b0b">Hi ${escapeHtml(name)}, your contract${total > 0 ? ` for <strong>${amount}</strong>` : ""} is ready to review and approve.</p>
    </div>
    ${personalNote ? `<div style="border:1px solid #d8d8d2;background:#ffffff;padding:14px 16px;margin:0 0 20px 0;font-size:14px;line-height:1.55;color:#0b0b0b">${escapeHtml(personalNote).replace(/\n/g, "<br>")}</div>` : ""}
    ${reviewContractButton(url, "0 0 20px 0")}
    ${quoteVersions.length > 1 ? `<div style="border:2px solid #0b0b0b;background:#f4f4f2;padding:14px 16px;margin:0 0 20px 0"><div style="font-size:15px;font-weight:700;margin-bottom:8px">${quoteVersions.length} quotes included</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${quoteVersions.map((version) => `<tr><td width="50%" style="width:50%;padding:7px 12px 7px 0;border-top:1px solid #d8d8d2;white-space:nowrap"><strong>Quote ${escapeHtml(version.label)}</strong></td><td width="50%" align="right" style="width:50%;padding:7px 0 7px 12px;border-top:1px solid #d8d8d2;white-space:nowrap"><strong>${money(version.total)}</strong></td></tr>`).join("")}</table><div style="font-size:13px;line-height:1.45;margin-top:8px;color:#0b0b0b">Use the large tabs at the top of the contract page to compare each quote.</div></div>` : ""}
    ${details.lines?.length ? quoteLinesTable(details.lines) : ""}
    ${quoteSummary(details, total)}
    <p style="margin:18px 0 0 0;font-size:14px;line-height:1.6;color:#0b0b0b">Prefer to pay directly? Zelle <strong>${escapeHtml(ZELLE_DESTINATION)}</strong></p>
    ${reviewContractButton(url, "26px 0 18px 0")}
    <p style="margin:0 0 18px 0;font-size:13px;line-height:1.5;color:#0b0b0b">Or paste this link into your browser:<br><span style="word-break:break-all;color:#0b0b0b">${escapeHtml(url)}</span></p>
    ${financing.html}
    ${officialContactFooterHtml()}
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
  const financing = buildFinancingOptionsSection({
    quoteNumber: details.quoteNumber,
    total: details.total,
    depositDue: details.depositDue,
    balanceDue: details.balanceDue,
    logoUrl: details.logoUrl
  });
  const text = `Hello ${name},${personalNoteText}\n\n${intro}${dueText}\n\nPayment options:\n- Square card payment: ${url}\n- Zelle: ${ZELLE_DESTINATION}\n\nPlease reference your name when paying by Zelle.${financing.text}\n\nThank you,\n805 Shutters\n\n${officialContactLine}`;
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
        <td style="padding:12px 0;border-bottom:1px solid #d8d8d2;font-size:14px;color:#0b0b0b"><strong>Zelle</strong><br><span style="color:#0b0b0b">${escapeHtml(ZELLE_DESTINATION)}</span></td>
      </tr>
    </table>
    <div style="margin:26px 0 18px 0">
      <a href="${escapeAttr(url)}" style="display:inline-block;background:#0b0b0b;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:4px;font-size:15px;font-weight:700">${escapeHtml(squareLabel)}</a>
    </div>
    <p style="margin:0 0 18px 0;font-size:13px;line-height:1.5;color:#0b0b0b">Or paste this link into your browser:<br><span style="word-break:break-all;color:#0b0b0b">${escapeHtml(url)}</span></p>
    <p style="margin:0 0 18px 0;font-size:13px;line-height:1.5;color:#0b0b0b">Please reference your name when paying by Zelle.</p>
    ${financing.html}
    ${officialContactFooterHtml()}
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
  const rows = lines.map(quoteLineHtml).join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px 0">
    <tbody>${rows}</tbody>
  </table>`;
}

function quoteLineHtml(line: QuoteEmailLine): string {
  const price = line.priceReady === false ? "Pricing in progress" : money(line.lineTotal);
  const configurations = quoteLineConfigurations(line);
  const showOptionLabels = configurations.length > 1;
  const configurationHtml = configurations
    .map((configuration) => quoteConfigurationHtml(configuration, showOptionLabels))
    .join("");

  return `<tr>
    <td style="padding:18px 0;border-top:1px solid #0b0b0b;vertical-align:top;color:#0b0b0b">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:0 12px 0 0;vertical-align:top">
            <div style="font-size:18px;line-height:1.25;font-weight:700;color:#0b0b0b">${escapeHtml(line.room || "Window")}</div>
          </td>
          <td width="64" align="center" style="width:64px;padding:0 8px;vertical-align:top">
            <div style="font-size:10px;line-height:1.2;letter-spacing:0.08em;text-transform:uppercase;color:#666666">Qty</div>
            <div style="margin-top:3px;font-size:15px;font-weight:700;color:#0b0b0b">${line.quantity}</div>
          </td>
          <td width="112" align="right" style="width:112px;padding:0;vertical-align:top">
            <div style="font-size:10px;line-height:1.2;letter-spacing:0.08em;text-transform:uppercase;color:#666666">Price</div>
            <div style="margin-top:3px;font-size:15px;font-weight:700;color:#0b0b0b;white-space:nowrap">${price}</div>
          </td>
        </tr>
        <tr>
          <td colspan="3" style="padding:12px 0 0 0">${configurationHtml}</td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function quoteConfigurationHtml(configuration: QuoteEmailDesignOption, showOptionLabel: boolean): string {
  const product = configuration.priceReady === false
    ? "Pricing in progress"
    : customerQuoteProductName(configuration.productName);
  const selections = quoteProductDetails(configuration.styleName || "", configuration.options ?? []);
  const selectionRows = selections
    .map((selection) => `<tr>
      <td width="34%" style="width:34%;padding:3px 14px 3px 0;vertical-align:top;font-size:12px;line-height:1.4;color:#666666">${escapeHtml(selection.label)}</td>
      <td style="padding:3px 0;vertical-align:top;font-size:13px;line-height:1.4;color:#0b0b0b">${escapeHtml(selection.value)}</td>
    </tr>`)
    .join("");

  return `<div style="${showOptionLabel ? "border-top:1px solid #e5e5e0;padding-top:10px;margin-top:10px" : ""}">
    ${showOptionLabel ? `<div style="font-size:10px;line-height:1.2;letter-spacing:0.08em;text-transform:uppercase;color:#666666">Option ${escapeHtml(customerQuoteText(configuration.label) || "A")}</div>` : ""}
    <div style="margin:${showOptionLabel ? "3px" : "0"} 0 5px 0;font-size:15px;line-height:1.35;font-weight:700;color:#0b0b0b">${escapeHtml(product)}</div>
    ${selectionRows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${selectionRows}</table>` : ""}
  </div>`;
}

function quoteLineConfigurations(line: QuoteEmailLine): QuoteEmailDesignOption[] {
  if (line.showDesignOptions && line.designOptions?.length) return line.designOptions;
  return [{
    productName: line.productName,
    styleName: line.styleName,
    options: line.options,
    priceReady: line.priceReady,
  }];
}

function officialContactFooterHtml(): string {
  return `<div style="border-top:1px solid #d8d8d2;margin:22px 0 0 0;padding-top:16px;font-size:13px;line-height:1.6;color:#0b0b0b">
    Thank you,<br><strong style="color:#0b0b0b">${brandIdentity.name}</strong><br>
    Official contact: <a href="${brandIdentity.website}" style="color:#0b0b0b;font-weight:700">${brandIdentity.domain}</a> &middot; <a href="${brandIdentity.phoneHref}" style="color:#0b0b0b;font-weight:700">${brandIdentity.phone}</a><br>
    <a href="${brandIdentity.emailHref}" style="color:#0b0b0b">${brandIdentity.email}</a>
  </div>`;
}

function reviewContractButton(url: string, margin: string): string {
  return `<div style="margin:${margin}">
    <a href="${escapeAttr(url)}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:4px;font-size:15px;font-weight:700">Review and approve your quote here</a>
  </div>`;
}

function quoteSummary(details: QuoteEmailDetails, total: number): string {
  const rows = [
    typeof details.subtotal === "number" ? summaryRow("Subtotal", details.subtotal) : "",
    ...(details.fees ?? []).map((fee) => summaryRow(customerQuoteText(fee.name) || "Additional fee", fee.amount)),
    details.discount && details.discount > 0 ? summaryRow("Discount", -details.discount) : "",
    details.tax && details.tax > 0 ? summaryRow("Tax", details.tax) : "",
    details.sourceTotalAdjustment ? summaryRow("Contract adjustment", details.sourceTotalAdjustment) : "",
    `<tr><td style="padding:10px 0 0 0;border-top:2px solid #0b0b0b;font-size:16px;font-weight:700;color:#0b0b0b">Total</td><td align="right" style="padding:10px 0 0 0;border-top:2px solid #0b0b0b;font-size:18px;font-weight:700;color:#0b0b0b">${money(total)}</td></tr>`,
    details.depositDue && details.depositDue > 0 ? summaryRow("Deposit due", details.depositDue) : "",
    details.balanceDue && details.balanceDue > 0 ? summaryRow("Balance", details.balanceDue) : "",
  ].filter(Boolean).join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 0 auto;max-width:320px">${rows}</table>`;
}

function summaryRow(label: string, value: number): string {
  return `<tr><td style="padding:4px 0;font-size:14px;color:#0b0b0b">${escapeHtml(label)}</td><td align="right" style="padding:4px 0;font-size:14px;color:#0b0b0b">${money(value)}</td></tr>`;
}

function textLine(line: QuoteEmailLine, _index: number): string {
  const total = line.priceReady === false ? "Pricing in progress" : money(line.lineTotal);
  const configurations = quoteLineConfigurations(line);
  const showOptionLabels = configurations.length > 1;
  const configurationText = configurations.map((configuration) => {
    const product = configuration.priceReady === false ? "Pricing in progress" : customerQuoteProductName(configuration.productName);
    const heading = `${showOptionLabels ? `Option ${customerQuoteText(configuration.label) || "A"} - ` : ""}${product}`;
    const selections = quoteProductDetails(configuration.styleName || "", configuration.options ?? []);
    return [heading, ...selections.map((selection) => `  ${selection.label}: ${selection.value}`)].join("\n");
  }).join("\n");
  return `${line.room || "Window"}\nQuantity: ${line.quantity}\nPrice: ${total}\n${configurationText}`;
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
