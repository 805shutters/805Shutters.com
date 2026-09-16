import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sendEmail, type EmailAttachment, type EmailResult } from "@/lib/notify/email";
import type { CustomerContractTerms } from "@/lib/crm/customer-contract-terms";
import type { SignedContractSnapshot } from "@/lib/crm/public-quote";

export const CUSTOMER_SIGNED_CONTRACT_FROM = "805 Shutters <805@805shutters.com>";
export const CUSTOMER_SIGNED_CONTRACT_SUBJECT = "Thank you for choosing 805 Shutters — your signed contract";
const PAYLOAD_VERSION = "customer-signed-contract-v1";
const RETRY_MINUTES = 5;
const PROVIDER_TIMEOUT_MS = 120_000;
const PROVIDER_DEADLINE_SAFETY_MS = 10_000;

type DeliveryStatus = "pending" | "processing" | "retry" | "uncertain" | "accepted" | "blocked";

export type FrozenCustomerContractEmail = {
  to: string;
  from: typeof CUSTOMER_SIGNED_CONTRACT_FROM;
  subject: typeof CUSTOMER_SIGNED_CONTRACT_SUBJECT;
  html: string;
  text: string;
  attachments: EmailAttachment[];
  idempotencyKey: string;
};

export type CustomerContractEmailClaim = {
  id: string;
  contract_id: string;
  quote_id: string;
  status: "processing";
  recipient: string;
  signed_snapshot: SignedContractSnapshot;
  customer_signature: string;
  contract_signed_at: string;
  payload: FrozenCustomerContractEmail | null;
  idempotency_key: string | null;
  lease_token: string;
  first_send_attempt_at: string | null;
  provider_message_id: string | null;
  provider_accepted_at: string | null;
};

type OutboxPatch = Partial<{
  status: DeliveryStatus;
  payload: FrozenCustomerContractEmail;
  idempotency_key: string;
  failure_stage: "prepare" | "send" | "persist" | null;
  last_error: string | null;
  available_at: string;
  lease_token: null;
  lease_expires_at: null;
  first_send_attempt_at: string;
  provider_message_id: string;
  provider_accepted_at: string;
}>;

export type CustomerContractEmailHealth = {
  pending: number;
  processing: number;
  retry: number;
  uncertain: number;
  accepted: number;
  blocked: number;
  total: number;
  errors: string[];
};

export type CustomerContractEmailDependencies = {
  claim: (supabase: SupabaseClient, quoteId?: string) => Promise<CustomerContractEmailClaim | null>;
  update: (supabase: SupabaseClient, claim: CustomerContractEmailClaim, patch: OutboxPatch) => Promise<void>;
  prepare: (claim: CustomerContractEmailClaim) => Promise<FrozenCustomerContractEmail>;
  send: (payload: FrozenCustomerContractEmail, timeoutMs?: number) => Promise<EmailResult>;
  health: (supabase: SupabaseClient, quoteId?: string) => Promise<CustomerContractEmailHealth>;
  now: () => string;
};

class ContractContentError extends Error {}
class FrozenPayloadError extends Error {}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function email(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

function money(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) throw new ContractContentError("The signed contract contains an invalid price.");
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function firstName(value: string) {
  const first = value.trim().split(/\s+/)[0] || "there";
  return /^(valued|customer)$/i.test(first) ? "there" : first;
}

function safeFilename(value: unknown) {
  return String(value || "signed-contract")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "signed-contract";
}

function terms(value: unknown): CustomerContractTerms {
  const candidate = object(value);
  if (candidate.version !== "2026-09-16" || !Array.isArray(candidate.sections) || candidate.sections.length === 0) {
    throw new ContractContentError("The signed contract terms snapshot is missing or unsupported.");
  }
  for (const rawSection of candidate.sections) {
    const section = object(rawSection);
    if (
      (section.heading != null && typeof section.heading !== "string") ||
      (section.paragraphs != null && (!Array.isArray(section.paragraphs) || !section.paragraphs.every((item) => typeof item === "string"))) ||
      (section.bullets != null && (!Array.isArray(section.bullets) || !section.bullets.every((item) => typeof item === "string")))
    ) {
      throw new ContractContentError("The signed contract terms snapshot is malformed.");
    }
  }
  return candidate as unknown as CustomerContractTerms;
}

export function validateSignedContractSnapshot(
  value: unknown,
  expectedSignature?: string,
): SignedContractSnapshot {
  const snapshot = object(value) as Partial<SignedContractSnapshot>;
  const signature = String(snapshot.customerSignature || "").trim();
  const totals = object(snapshot.totals);
  const quote = object(snapshot.quote);
  const business = object(snapshot.business);
  const finiteMoney = (candidate: unknown) => typeof candidate === "number" && Number.isFinite(candidate);
  if (
    snapshot.schema !== "805_signed_quote_contract_v1" ||
    typeof snapshot.signedAt !== "string" || !snapshot.signedAt ||
    typeof snapshot.customerPrintedName !== "string" || !snapshot.customerPrintedName.trim() ||
    typeof snapshot.customerName !== "string" || !snapshot.customerName.trim() ||
    snapshot.customerEmailDelivery !== "enabled" ||
    !signature ||
    signature.length > 200 ||
    /^data:/i.test(signature) ||
    !Array.isArray(snapshot.lines) ||
    snapshot.lines.length === 0 ||
    typeof quote.id !== "string" || !quote.id ||
    typeof business.name !== "string" || !business.name ||
    typeof business.website !== "string" || !business.website ||
    typeof business.email !== "string" || !business.email ||
    !Number.isFinite(Date.parse(String(snapshot.signedAt || ""))) ||
    !Array.isArray(totals.fees) ||
    !finiteMoney(totals.subtotal) || !finiteMoney(totals.discount) ||
    !finiteMoney(totals.tax) || !finiteMoney(totals.sourceTotalAdjustment) ||
    !finiteMoney(totals.depositDue) || !finiteMoney(totals.balanceDue) ||
    !finiteMoney(totals.total) || Number(totals.total) <= 0 ||
    !totals.fees.every((fee) => {
      const entry = object(fee);
      return typeof entry.name === "string" && Boolean(entry.name.trim()) && finiteMoney(entry.amount);
    })
  ) {
    throw new ContractContentError("The immutable signed contract snapshot is incomplete.");
  }
  if (expectedSignature && signature !== expectedSignature.trim()) {
    throw new ContractContentError("The signed contract signature no longer matches its immutable snapshot.");
  }
  terms(snapshot.terms);
  for (const line of snapshot.lines) {
    if (
      typeof line.lineItemId !== "string" || !line.lineItemId ||
      typeof line.productName !== "string" || !line.productName || !Array.isArray(line.options) ||
      !line.options.every((option) => typeof option === "string") ||
      !finiteMoney(line.unitPrice) || !finiteMoney(line.lineTotal) || !finiteMoney(line.discountPercent) ||
      !finiteMoney(line.quantity) || Number(line.quantity) <= 0 || Number(line.lineTotal) < 0
    ) {
      throw new ContractContentError("The immutable signed contract has an incomplete line item.");
    }
  }
  return snapshot as SignedContractSnapshot;
}

export function buildCustomerSignedContractEmail(customerName: string): {
  subject: typeof CUSTOMER_SIGNED_CONTRACT_SUBJECT;
  text: string;
  html: string;
} {
  const greeting = firstName(customerName);
  const text = `Hi ${greeting},\n\nThank you for signing your contract and choosing 805 Shutters! We appreciate you supporting a local business and trusting us with your home.\n\nAttached is a copy of your signed contract for your records. We’ll be in touch with the next steps and keep you updated as your project moves forward.\n\nIf you have any questions, simply reply to this email—we’re happy to help.\n\nThank you again for your business. We look forward to bringing your project to life!\n\nJessica\n805 Shutters\n805@805shutters.com\n805shutters.com`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:640px;margin:auto;padding:28px 18px">
    <p style="font-size:15px;line-height:1.65">Hi ${escapeHtml(greeting)},</p>
    <p style="font-size:15px;line-height:1.65">Thank you for signing your contract and choosing 805 Shutters! We appreciate you supporting a local business and trusting us with your home.</p>
    <p style="font-size:15px;line-height:1.65">Attached is a copy of your signed contract for your records. We’ll be in touch with the next steps and keep you updated as your project moves forward.</p>
    <p style="font-size:15px;line-height:1.65">If you have any questions, simply reply to this email—we’re happy to help.</p>
    <p style="font-size:15px;line-height:1.65">Thank you again for your business. We look forward to bringing your project to life!</p>
    <p style="font-size:15px;line-height:1.65;margin-top:24px">Jessica<br><strong>805 Shutters</strong><br><a href="mailto:805@805shutters.com">805@805shutters.com</a><br><a href="https://805shutters.com">805shutters.com</a></p>
  </div>`;
  return { subject: CUSTOMER_SIGNED_CONTRACT_SUBJECT, text, html };
}

function pdfText(value: unknown, font: { encodeText(text: string): unknown }) {
  const text = String(value ?? "").replace(/[\t\r\n]+/g, " ");
  try {
    font.encodeText(text);
  } catch {
    throw new ContractContentError("The signed contract contains text that cannot be rendered faithfully in the PDF.");
  }
  return text;
}

function wrap(
  value: unknown,
  font: { widthOfTextAtSize(text: string, size: number): number; encodeText(text: string): unknown },
  size: number,
  maxWidth: number,
) {
  const words = pdfText(value, font).split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let row = "";
  const pieces = words.flatMap((word) => {
    if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
    const chunks: string[] = [];
    let chunk = "";
    for (const character of word) {
      const next = chunk + character;
      if (chunk && font.widthOfTextAtSize(next, size) > maxWidth) {
        chunks.push(chunk);
        chunk = character;
      } else chunk = next;
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  });
  for (const word of pieces) {
    const next = row ? `${row} ${word}` : word;
    if (!row || font.widthOfTextAtSize(next, size) <= maxWidth) row = next;
    else {
      rows.push(row);
      row = word;
    }
  }
  if (row) rows.push(row);
  return rows.length ? rows : [""];
}

export async function buildSignedContractPdf(snapshotValue: unknown): Promise<Buffer> {
  const snapshot = validateSignedContractSnapshot(snapshotValue);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const ink = rgb(0.04, 0.04, 0.04);
  const muted = rgb(0.34, 0.34, 0.32);
  const rule = rgb(0.78, 0.77, 0.73);
  const width = 612;
  const height = 792;
  const margin = 48;
  const contentWidth = width - margin * 2;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const newPage = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
  };
  const ensure = (space: number) => { if (y - space < 52) newPage(); };
  const line = (value: unknown, options: { size?: number; bold?: boolean; italic?: boolean; indent?: number; after?: number } = {}) => {
    const size = options.size || 10;
    const font = options.bold ? bold : options.italic ? italic : regular;
    const indent = options.indent || 0;
    const rows = wrap(value, font, size, contentWidth - indent);
    for (const row of rows) {
      ensure(size + 3 + (options.after ?? 4));
      page.drawText(row, { x: margin + indent, y, size, font, color: ink });
      y -= size + 3;
    }
    y -= options.after ?? 4;
  };
  const section = (title: string) => {
    ensure(62);
    y -= 7;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.8, color: rule });
    y -= 18;
    line(title.toUpperCase(), { size: 11, bold: true, after: 8 });
  };
  const moneyRow = (label: string, value: unknown, strong = false) => {
    const labelFont = strong ? bold : regular;
    const labelSize = strong ? 11 : 10;
    const formatted = money(value);
    const font = strong ? bold : regular;
    const size = strong ? 11 : 10;
    const valueX = width - margin - font.widthOfTextAtSize(formatted, size);
    const labelX = margin + 220;
    const labelRows = wrap(label, labelFont, labelSize, Math.max(32, valueX - labelX - 12));
    ensure(Math.max(18, labelRows.length * 13 + 5));
    labelRows.forEach((labelRow, index) => {
      page.drawText(labelRow, { x: labelX, y: y - index * 13, size: labelSize, font: labelFont, color: ink });
    });
    page.drawText(formatted, { x: valueX, y, size, font, color: ink });
    y -= Math.max(18, labelRows.length * 13 + 5);
  };

  page.drawRectangle({ x: margin, y: y - 5, width: contentWidth, height: 5, color: ink });
  y -= 30;
  line("805 SHUTTERS", { size: 10, bold: true, after: 5 });
  line("SIGNED CUSTOMER CONTRACT", { size: 23, bold: true, after: 8 });
  line(`Contract ${snapshot.quote.quoteNumber || snapshot.quote.id}`, { size: 11, after: 3 });
  line(`Signed ${new Date(snapshot.signedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "long", timeStyle: "short" })} Pacific`, { size: 9, after: 12 });

  section("Customer");
  line(snapshot.customerName, { bold: true, after: 2 });
  for (const detail of [snapshot.customerAddress, snapshot.customerPhone, snapshot.customerEmail]) {
    if (detail) line(detail, { after: 1 });
  }

  section("Purchased line items");
  snapshot.lines.forEach((item, index) => {
    ensure(78);
    line(`${index + 1}. ${item.room || "Project area"} - ${item.productName}`, { size: 11, bold: true, after: 2 });
    if (item.styleName) line(item.styleName, { italic: true, after: 2 });
    item.options.forEach((option) => line(`- ${option}`, { size: 9, indent: 10, after: 1 }));
    line(`Quantity ${item.quantity} | Unit price ${money(item.unitPrice)} | Line total ${money(item.lineTotal)}`, { size: 9, bold: true, after: 4 });
    if (item.discountPercent > 0) line(`${item.discountPercent}% line discount applied`, { size: 8, after: 4 });
  });

  section("Contract totals");
  moneyRow("Subtotal", snapshot.totals.subtotal);
  snapshot.totals.fees.forEach((fee) => moneyRow(fee.name, fee.amount));
  if (snapshot.totals.discount > 0) moneyRow("Discount", -snapshot.totals.discount);
  if (snapshot.totals.tax > 0) moneyRow("Tax", snapshot.totals.tax);
  if (snapshot.totals.sourceTotalAdjustment) moneyRow("Contract adjustment", snapshot.totals.sourceTotalAdjustment);
  moneyRow("TOTAL", snapshot.totals.total, true);
  if (snapshot.totals.depositDue > 0) moneyRow("Deposit", snapshot.totals.depositDue);
  if (snapshot.totals.balanceDue > 0) moneyRow("Balance", snapshot.totals.balanceDue);

  ensure(110);
  section("Terms");
  for (const termSection of terms(snapshot.terms).sections) {
    if (termSection.heading) {
      ensure(52);
      line(termSection.heading, { bold: true, after: 4 });
    }
    termSection.paragraphs?.forEach((paragraph) => line(paragraph, { size: 9, after: 6 }));
    termSection.bullets?.forEach((bullet) => line(`- ${bullet}`, { size: 9, indent: 10, after: 2 }));
    y -= 3;
  }

  ensure(100 + wrap(snapshot.customerSignature, italic, 18, contentWidth).length * 21);
  section("Electronic signature");
  line(snapshot.customerSignature, { size: 18, italic: true, after: 5 });
  line(`Signed by ${snapshot.customerPrintedName} on ${new Date(snapshot.signedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "long", timeStyle: "short" })} Pacific`, { size: 9, after: 10 });
  line("805 Shutters | 805@805shutters.com | 805shutters.com | 805-806-9344", { size: 8, after: 0 });

  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    const label = `805 Shutters signed contract | Page ${index + 1} of ${pages.length}`;
    current.drawText(pdfText(label, regular), { x: margin, y: 28, size: 7, font: regular, color: muted });
  });
  const bytes = await pdf.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

function expectedIdempotencyKey(claim: Pick<CustomerContractEmailClaim, "contract_id">) {
  return `805-signed-contract-${claim.contract_id}-${PAYLOAD_VERSION}`;
}

async function prepareEmail(claim: CustomerContractEmailClaim): Promise<FrozenCustomerContractEmail> {
  const recipient = email(claim.recipient);
  if (!recipient) throw new ContractContentError("The signed customer contract has no valid customer email.");
  const snapshot = validateSignedContractSnapshot(claim.signed_snapshot, claim.customer_signature);
  if (snapshot.quote.id !== claim.quote_id) {
    throw new ContractContentError("The signed contract snapshot belongs to a different quote.");
  }
  if (Date.parse(snapshot.signedAt) !== Date.parse(claim.contract_signed_at)) {
    throw new ContractContentError("The signed contract date no longer matches its immutable snapshot.");
  }
  if (email(snapshot.customerEmail) !== recipient) {
    throw new ContractContentError("The frozen customer email does not match the signed contract snapshot.");
  }
  const message = buildCustomerSignedContractEmail(snapshot.customerName);
  const pdf = await buildSignedContractPdf(snapshot);
  return {
    to: recipient,
    from: CUSTOMER_SIGNED_CONTRACT_FROM,
    subject: CUSTOMER_SIGNED_CONTRACT_SUBJECT,
    html: message.html,
    text: message.text,
    attachments: [{
      filename: `805-Shutters-${safeFilename(snapshot.quote.quoteNumber || snapshot.quote.id)}-Signed-Contract.pdf`,
      content: pdf.toString("base64"),
      contentType: "application/pdf",
    }],
    idempotencyKey: expectedIdempotencyKey(claim),
  };
}

function assertFrozenPayload(payload: FrozenCustomerContractEmail, claim: CustomerContractEmailClaim) {
  if (
    payload.to !== email(claim.recipient) ||
    payload.from !== CUSTOMER_SIGNED_CONTRACT_FROM ||
    payload.subject !== CUSTOMER_SIGNED_CONTRACT_SUBJECT ||
    payload.idempotencyKey !== expectedIdempotencyKey(claim) ||
    payload.attachments.length !== 1 ||
    payload.attachments[0].contentType !== "application/pdf" ||
    !payload.attachments[0].content.startsWith("JVBER")
  ) {
    throw new FrozenPayloadError("The frozen signed-contract email payload is invalid.");
  }
}

async function defaultClaim(supabase: SupabaseClient, quoteId?: string) {
  const { data, error: claimError } = await supabase.rpc("customer_signed_contract_email_claim", {
    p_quote_id: quoteId || null,
  });
  if (claimError) throw new Error(`Customer signed-contract email claim failed: ${claimError.message}`);
  return (data || null) as CustomerContractEmailClaim | null;
}

async function defaultUpdate(supabase: SupabaseClient, claim: CustomerContractEmailClaim, patch: OutboxPatch) {
  const { data, error: updateError } = await supabase
    .from("crm_customer_signed_contract_email_outbox")
    .update(patch)
    .eq("id", claim.id)
    .eq("lease_token", claim.lease_token)
    .in("status", ["processing", "accepted"])
    .select("id")
    .maybeSingle();
  if (updateError || !data) {
    throw new Error(`Customer signed-contract email lease was lost before state could be saved${updateError?.message ? `: ${updateError.message}` : "."}`);
  }
}

export async function getCustomerSignedContractEmailHealth(
  supabase: SupabaseClient,
  quoteId?: string,
): Promise<CustomerContractEmailHealth> {
  const statuses: DeliveryStatus[] = ["pending", "processing", "retry", "uncertain", "accepted", "blocked"];
  const results = await Promise.all(statuses.map(async (status) => {
    let query = supabase
      .from("crm_customer_signed_contract_email_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    if (quoteId) query = query.eq("quote_id", quoteId);
    const { count, error: healthError } = await query;
    if (healthError) throw new Error(`Customer signed-contract email health could not be read: ${healthError.message}`);
    return [status, count || 0] as const;
  }));
  const counts = Object.fromEntries(results) as Record<DeliveryStatus, number>;
  return {
    pending: counts.pending, processing: counts.processing, retry: counts.retry,
    uncertain: counts.uncertain, accepted: counts.accepted, blocked: counts.blocked,
    total: results.reduce((sum, [, count]) => sum + count, 0), errors: [],
  };
}

const defaults: CustomerContractEmailDependencies = {
  claim: defaultClaim,
  update: defaultUpdate,
  prepare: prepareEmail,
  send: (payload, timeoutMs = PROVIDER_TIMEOUT_MS) => sendEmail({ ...payload, signal: AbortSignal.timeout(timeoutMs) }),
  health: getCustomerSignedContractEmailHealth,
  now: () => new Date().toISOString(),
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Customer signed-contract email failed.";
}

function retryAt(value: string) {
  return new Date(new Date(value).getTime() + RETRY_MINUTES * 60_000).toISOString();
}

export async function processCustomerSignedContractEmailOutbox(
  supabase: SupabaseClient,
  options: {
    quoteId?: string;
    limit?: number;
    deadlineMs?: number;
    dependencies?: Partial<CustomerContractEmailDependencies>;
  } = {},
) {
  const dependencies = { ...defaults, ...(options.dependencies || {}) };
  const limit = Math.min(Math.max(options.limit || 20, 1), 50);
  const deadline = Date.now() + Math.min(Math.max(options.deadlineMs || 220_000, 1_000), 240_000);
  const errors: string[] = [];
  let processed = 0;

  for (
    let index = 0;
    index < limit && Date.now() < deadline - PROVIDER_TIMEOUT_MS - PROVIDER_DEADLINE_SAFETY_MS;
    index += 1
  ) {
    let claim = await dependencies.claim(supabase, options.quoteId);
    if (!claim) break;
    processed += 1;
    let stage: "prepare" | "send" | "persist" = "prepare";
    let acceptedId = claim.provider_message_id;
    let acceptedAt = claim.provider_accepted_at;
    let providerAccepted = Boolean(acceptedId && acceptedAt);
    try {
      if (acceptedId || acceptedAt) {
        if (!acceptedId || !acceptedAt) {
          await dependencies.update(supabase, claim, {
            status: "blocked", failure_stage: "persist",
            last_error: "The stored email-provider acceptance proof is incomplete; reconcile before retry.",
            lease_token: null, lease_expires_at: null,
          });
        } else {
          await dependencies.update(supabase, claim, {
            status: "accepted", provider_message_id: acceptedId, provider_accepted_at: acceptedAt,
            failure_stage: null, last_error: null, lease_token: null, lease_expires_at: null,
          });
        }
        continue;
      }
      const payload = claim.payload || await dependencies.prepare(claim);
      assertFrozenPayload(payload, claim);
      if (!claim.payload) {
        await dependencies.update(supabase, claim, {
          payload, idempotency_key: payload.idempotencyKey, failure_stage: null, last_error: null,
        });
        claim = { ...claim, payload, idempotency_key: payload.idempotencyKey };
      } else if (claim.idempotency_key !== payload.idempotencyKey) {
        throw new FrozenPayloadError("The frozen signed-contract email idempotency key changed.");
      }

      const attemptAt = dependencies.now();
      stage = "send";
      await dependencies.update(supabase, claim, {
        first_send_attempt_at: claim.first_send_attempt_at || attemptAt,
        failure_stage: "send",
      });
      let result: EmailResult;
      try {
        result = await dependencies.send(payload, Math.max(1_000, Math.min(PROVIDER_TIMEOUT_MS, deadline - Date.now() - 5_000)));
      } catch (sendError) {
        result = { sent: false, uncertain: true, error: errorText(sendError) };
      }
      if (!result.sent || !result.id) {
        const message = result.error || result.skipped || "The email provider did not accept the signed contract email.";
        await dependencies.update(supabase, claim, {
          status: result.uncertain || result.sent ? "uncertain" : "retry",
          failure_stage: "send", last_error: message, available_at: retryAt(attemptAt),
          lease_token: null, lease_expires_at: null,
        });
        errors.push(message);
        continue;
      }

      acceptedId = result.id;
      acceptedAt = dependencies.now();
      providerAccepted = true;
      stage = "persist";
      await dependencies.update(supabase, claim, {
        status: "accepted", provider_message_id: acceptedId, provider_accepted_at: acceptedAt,
        failure_stage: null, last_error: null, lease_token: null, lease_expires_at: null,
      });
    } catch (error) {
      const message = errorText(error);
      const permanent = error instanceof ContractContentError || error instanceof FrozenPayloadError;
      const status: DeliveryStatus = permanent ? "blocked" : providerAccepted ? "accepted" : stage === "send" ? "uncertain" : "retry";
      try {
        await dependencies.update(supabase, claim, {
          status,
          ...(providerAccepted && acceptedId && acceptedAt ? { provider_message_id: acceptedId, provider_accepted_at: acceptedAt } : {}),
          failure_stage: stage, last_error: message, available_at: retryAt(dependencies.now()),
          lease_token: null, lease_expires_at: null,
        });
      } catch (persistError) {
        errors.push(errorText(persistError));
      }
      errors.push(message);
    }
  }

  const health = await dependencies.health(supabase, options.quoteId);
  return { processed, ...health, errors: [...new Set([...errors, ...health.errors])] };
}
