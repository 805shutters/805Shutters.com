import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { ensureShareToken, loadPublicQuoteByToken, type PublicQuote } from "@/lib/crm/public-quote";
import { sendEmail, type EmailResult } from "@/lib/notify/email";
import { brandIdentity } from "@/lib/brand-identity";

export const INSTALLER_FORM_RECIPIENT = "mtsinstallations@gmail.com";
export const INSTALLER_REPORT_RECIPIENT = "805@805shutters.com";

type InstallerLineSnapshot = {
  id: string;
  room: string;
  productName: string;
  styleName: string;
  options: string[];
  quantity: number;
  lineTotal: number;
};

export type InstallerFormRow = {
  id: string;
  quote_id: string;
  job_id: string | null;
  public_token: string;
  status: string;
  customer_snapshot: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    quoteNumber: string | null;
  };
  line_snapshot: InstallerLineSnapshot[];
  cod_original: number;
  cod_adjusted: number | null;
  cod_withheld: number;
  issues: Array<{ lineId: string; notInstalled: boolean; details: string }>;
  accepted: boolean;
  signer_name: string | null;
  signed_at: string | null;
};

export type InstallerFormPublic = Omit<InstallerFormRow, "line_snapshot"> & {
  lines: Array<Omit<InstallerLineSnapshot, "lineTotal">>;
};

function money(value: unknown) {
  return Number(Number(value || 0).toFixed(2));
}

function html(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pdfText(value: unknown) {
  return String(value ?? "").replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function installerUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.805shutters.com").replace(/\/$/, "");
  return `${base}/installer-form/${encodeURIComponent(token)}`;
}

function snapshotLines(quote: PublicQuote): InstallerLineSnapshot[] {
  return quote.lines.map((line) => ({
    id: line.lineItemId,
    room: line.room,
    productName: line.productName,
    styleName: line.styleName,
    options: line.options,
    quantity: line.quantity,
    lineTotal: money(line.lineTotal),
  }));
}

export async function createAndSendInstallerForm(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<{ form: InstallerFormRow; email: EmailResult }> {
  const { data: existingData, error: existingError } = await supabase
    .from("crm_installer_forms")
    .select("*")
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (existingError) {
    throw new CrmAuthError(502, `The installer form delivery state could not be checked: ${existingError.message}`);
  }

  const existing = existingData as InstallerFormRow | null;
  if (existing && installerFormDeliveryComplete(existing)) {
    return {
      form: existing,
      email: { sent: true, id: installerFormEmailMessageId(existing), skipped: "installer form already delivered" },
    };
  }

  if (existing) return deliverInstallerForm(supabase, existing);

  const { token } = await ensureShareToken(supabase, quoteId, { email: "automation:installer_form" });
  const quote = await loadPublicQuoteByToken(supabase, token);
  if (!quote) throw new CrmAuthError(404, "The sold quote could not be prepared for installation.");
  const { data: quoteRow } = await supabase.from("crm_quotes").select("job_id").eq("id", quoteId).maybeSingle();
  const publicToken = randomBytes(24).toString("base64url");
  const row = {
    quote_id: quoteId,
    job_id: (quoteRow as { job_id?: string | null } | null)?.job_id || null,
    public_token: publicToken,
    status: "sent",
    customer_snapshot: {
      name: quote.customerName,
      address: quote.customerAddress,
      phone: quote.customerPhone,
      email: quote.customerEmail,
      quoteNumber: quote.quoteNumber,
    },
    line_snapshot: snapshotLines(quote),
    cod_original: money(quote.balanceDue),
    cod_adjusted: money(quote.balanceDue),
    cod_withheld: 0,
    issues: [],
    accepted: false,
    meta: { schema: "805_installer_form_v1" },
  };
  const { data, error } = await supabase
    .from("crm_installer_forms")
    .upsert(row, { onConflict: "quote_id" })
    .select("*")
    .single();
  if (error || !data) throw new CrmAuthError(502, `The installer form could not be saved${error?.message ? `: ${error.message}` : "."}`);

  return deliverInstallerForm(supabase, data as InstallerFormRow);
}

function installerFormDeliveryComplete(form: InstallerFormRow): boolean {
  const row = form as InstallerFormRow & { sent_at?: string | null };
  return Boolean(row.sent_at) && !["email_failed", "pending_delivery"].includes(form.status);
}

function installerFormEmailMessageId(form: InstallerFormRow): string | undefined {
  const value = (form as InstallerFormRow & { email_message_id?: string | null }).email_message_id;
  return value || undefined;
}

async function deliverInstallerForm(
  supabase: SupabaseClient,
  form: InstallerFormRow,
): Promise<{ form: InstallerFormRow; email: EmailResult }> {
  const url = installerUrl(form.public_token);
  const pdf = buildInstallerFormPdf(form, url);
  const message = buildInstallerFormEmail(form, url);
  const email = await sendEmail({
    to: INSTALLER_FORM_RECIPIENT,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: [{
      filename: `805-Shutters-Installation-Form-${form.customer_snapshot.quoteNumber || form.id.slice(0, 8)}.pdf`,
      content: pdf.toString("base64"),
      contentType: "application/pdf",
    }],
    idempotencyKey: `805-installer-form-${form.id}`,
  });
  const deliveryPatch = {
    status: email.sent ? "sent" : "email_failed",
    sent_at: email.sent ? new Date().toISOString() : null,
    email_recipient: INSTALLER_FORM_RECIPIENT,
    email_message_id: email.id || null,
    email_error: email.error || email.skipped || null,
  };
  const { error: deliveryError } = await supabase
    .from("crm_installer_forms")
    .update(deliveryPatch)
    .eq("id", form.id);
  if (deliveryError) {
    throw new CrmAuthError(502, `The installer form email result could not be recorded: ${deliveryError.message}`);
  }
  return { form: { ...form, ...deliveryPatch }, email };
}

export async function loadInstallerFormByToken(supabase: SupabaseClient, token: string): Promise<InstallerFormPublic | null> {
  const { data } = await supabase.from("crm_installer_forms").select("*").eq("public_token", token).maybeSingle();
  if (!data) return null;
  const form = data as InstallerFormRow;
  return {
    ...form,
    lines: (form.line_snapshot || []).map(({ lineTotal: _lineTotal, ...line }) => line),
  };
}

export async function submitInstallerForm(
  supabase: SupabaseClient,
  token: string,
  input: { accepted?: unknown; signerName?: unknown; issues?: unknown },
) {
  const { data } = await supabase.from("crm_installer_forms").select("*").eq("public_token", token).maybeSingle();
  if (!data) throw new CrmAuthError(404, "Installer form was not found.");
  const form = data as InstallerFormRow;
  const signerName = String(input.signerName || "").trim();
  if (input.accepted !== true || !signerName) throw new CrmAuthError(400, "Enter the installer name and accept the installation sign-off.");
  const allowed = new Map((form.line_snapshot || []).map((line) => [line.id, line]));
  const rawIssues = Array.isArray(input.issues) ? input.issues : [];
  const issuesByLine = new Map<string, { lineId: string; notInstalled: boolean; details: string }>();
  rawIssues.forEach((value) => {
    if (!value || typeof value !== "object") return;
    const issue = value as { lineId?: unknown; notInstalled?: unknown; details?: unknown };
    const lineId = String(issue.lineId || "");
    if (!allowed.has(lineId)) return;
    const details = String(issue.details || "").trim().slice(0, 2000);
    const notInstalled = issue.notInstalled === true;
    if (notInstalled || details) issuesByLine.set(lineId, { lineId, notInstalled, details });
  });
  const issues = [...issuesByLine.values()];
  const { withheld, adjusted } = calculateInstallerCod(form.cod_original, form.line_snapshot, issues);
  const signedAt = new Date().toISOString();
  const status = issues.some((issue) => issue.notInstalled) ? "partially_installed" : "completed";
  const { error } = await supabase.from("crm_installer_forms").update({
    status,
    issues,
    cod_withheld: withheld,
    cod_adjusted: adjusted,
    accepted: true,
    signer_name: signerName,
    signed_at: signedAt,
  }).eq("id", form.id);
  if (error) throw new CrmAuthError(502, "The installation report could not be saved.");

  const issueText = issues.length
    ? issues.map((issue) => {
        const line = allowed.get(issue.lineId);
        return `${line?.room || "Window"}: ${issue.notInstalled ? "NOT INSTALLED" : "Issue noted"}${issue.details ? ` — ${issue.details}` : ""}`;
      }).join("\n")
    : "No installation issues reported.";
  const subject = `${status === "completed" ? "Completed" : "Partial"} installation report — ${form.customer_snapshot.name}`;
  const text = `${subject}\n\nInstaller: ${signerName}\nContract: ${form.customer_snapshot.quoteNumber || form.quote_id}\n\n${issueText}\n\nOriginal COD: $${money(form.cod_original).toFixed(2)}\nWithheld for incomplete line items: $${withheld.toFixed(2)}\nCOD to collect now: $${adjusted.toFixed(2)}\n\nOpen form: ${installerUrl(token)}`;
  const reportEmail = await sendEmail({
    to: INSTALLER_REPORT_RECIPIENT,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:680px"><h1>${html(subject)}</h1><p><strong>Installer:</strong> ${html(signerName)}<br><strong>Contract:</strong> ${html(form.customer_snapshot.quoteNumber || form.quote_id)}</p><pre style="font:14px/1.5 Arial,sans-serif;white-space:pre-wrap">${html(issueText)}</pre><p><strong>Original COD:</strong> $${money(form.cod_original).toFixed(2)}<br><strong>Withheld:</strong> $${withheld.toFixed(2)}<br><strong>COD to collect now:</strong> $${adjusted.toFixed(2)}</p><p><a href="${html(installerUrl(token))}">Open installation form</a></p></div>`,
  });
  return { status, codOriginal: money(form.cod_original), codWithheld: withheld, codAdjusted: adjusted, reportEmail };
}

export function calculateInstallerCod(
  originalCod: number,
  lines: Array<Pick<InstallerLineSnapshot, "id" | "lineTotal">>,
  issues: Array<{ lineId: string; notInstalled: boolean }>,
) {
  const lineTotals = new Map(lines.map((line) => [line.id, money(line.lineTotal)]));
  const incompleteIds = new Set(issues.filter((issue) => issue.notInstalled).map((issue) => issue.lineId));
  const withheld = money([...incompleteIds].reduce((sum, lineId) => sum + money((lineTotals.get(lineId) || 0) * 0.5), 0));
  return { withheld, adjusted: money(Math.max(money(originalCod) - withheld, 0)) };
}

export function buildInstallerFormEmail(form: InstallerFormRow, url: string) {
  const contract = form.customer_snapshot.quoteNumber ? `Contract ${form.customer_snapshot.quoteNumber}` : "Sold job";
  const subject = `805 Shutters Installation Form — ${form.customer_snapshot.name}`;
  const text = `${subject}\n\n${contract}\n${form.customer_snapshot.address || ""}\n${form.line_snapshot.length} installation line item(s)\n\nOpen the live form to report line-item issues, mark windows not installed, calculate the adjusted COD, and sign off:\n${url}\n\nA price-redacted PDF is attached.`;
  const body = `<div style="font-family:Arial,sans-serif;max-width:680px"><h1>805 Shutters Installation Form</h1><p><strong>${html(form.customer_snapshot.name)}</strong><br>${html(form.customer_snapshot.address || "")}<br>${html(contract)}</p><p>${form.line_snapshot.length} installation line item(s). The attached PDF contains the customer and product details without line-item pricing.</p><p><a href="${html(url)}" style="display:inline-block;background:#111;color:#fff;padding:13px 18px;text-decoration:none;font-weight:bold">Open installation form</a></p><p>Use the live form to identify an affected window, explain the issue, mark it not installed when applicable, calculate the COD adjustment, and complete installer sign-off.</p></div>`;
  return { subject, text, html: body };
}

export function buildInstallerFormPdf(form: InstallerFormRow, url: string) {
  const pages: string[][] = [[]];
  let page = pages[0];
  let y = 750;
  const write = (value: string, size = 9, bold = false, x = 42) => {
    if (y < 70) { page = []; pages.push(page); y = 750; }
    for (const chunk of String(value).match(/.{1,92}(?:\s|$)|.{1,92}/g) || [""]) {
      page.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfText(chunk.trim())}) Tj ET`);
      y -= size + 4;
    }
  };
  write("805 SHUTTERS INSTALLATION FORM", 17, true);
  write(`Customer: ${form.customer_snapshot.name}`, 11, true);
  write(`Address: ${form.customer_snapshot.address || "Not provided"}`);
  write(`Phone: ${form.customer_snapshot.phone || "Not provided"}`);
  write(`Email: ${form.customer_snapshot.email || "Not provided"}`);
  write(`Contract: ${form.customer_snapshot.quoteNumber || form.quote_id}`);
  y -= 8;
  form.line_snapshot.forEach((line, index) => {
    write(`${index + 1}. ${line.room} — ${line.productName}${line.styleName ? ` — ${line.styleName}` : ""}`, 10, true);
    write(`Quantity: ${line.quantity}`, 9, false, 54);
    line.options.forEach((option) => write(option, 8, false, 54));
    write("[ ] Issue   [ ] Not installed   Notes: __________________________________________", 8, false, 54);
    y -= 5;
  });
  write("INSTALLER SIGN-OFF", 11, true);
  write("I confirm that the installed items were reviewed with the customer and all exceptions are reported above.");
  write("Installer name/signature: __________________________________  Date: ______________");
  y -= 8;
  write(`COD TO COLLECT: $${money(form.cod_original).toFixed(2)}`, 13, true);
  write("For each line marked Not installed, withhold 50% of that line item's value. The live form calculates the adjusted COD.");
  write(`Complete and report issues: ${url}`, 8);

  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 5 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((commands, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const stream = commands.join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, "latin1");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) pdf += `${String(offsets[index] || 0).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
