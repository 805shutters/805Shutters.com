import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { ensureShareToken, loadPublicQuoteByToken, type PublicQuote } from "@/lib/crm/public-quote";
import { sendEmail, type EmailResult } from "@/lib/notify/email";
import { brandIdentity } from "@/lib/brand-identity";

export const INSTALLER_FORM_RECIPIENT = "mtsinstallations@gmail.com";
export const INSTALLER_REPORT_RECIPIENT = "805@805shutters.com";

export type InstallerOutcome = "completed" | "partially_completed" | "incomplete";

export type InstallerWorkflow = {
  outcome: InstallerOutcome;
  reasonCode: string;
  notes: string;
  revision: number;
  updatedAt: string | null;
};

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
  meta?: Record<string, unknown>;
};

export type InstallerFormPublic = Omit<
  InstallerFormRow,
  "line_snapshot" | "cod_original" | "cod_adjusted" | "cod_withheld" | "meta"
> & {
  lines: Array<Omit<InstallerLineSnapshot, "lineTotal">>;
  workflow: InstallerWorkflow;
};

const INSTALLER_OUTCOMES = new Set<InstallerOutcome>([
  "completed",
  "partially_completed",
  "incomplete",
]);
const INSTALLER_REASON_CODES = new Set([
  "",
  "missing_product",
  "damaged_product",
  "wrong_product",
  "fit_or_measurement",
  "site_access",
  "customer_request",
  "other",
]);

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
  const {
    line_snapshot: lineSnapshot,
    cod_original: _codOriginal,
    cod_adjusted: _codAdjusted,
    cod_withheld: _codWithheld,
    meta: _meta,
    ...publicForm
  } = form;
  return {
    ...publicForm,
    lines: (lineSnapshot || []).map(({ lineTotal: _lineTotal, ...line }) => line),
    workflow: installerWorkflowFromMeta(form),
  };
}

export async function submitInstallerForm(
  supabase: SupabaseClient,
  token: string,
  input: {
    accepted?: unknown;
    signerName?: unknown;
    issues?: unknown;
    outcome?: unknown;
    reasonCode?: unknown;
    notes?: unknown;
  },
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
  const outcome = normalizeInstallerOutcome(input.outcome, issues);
  const reasonCode = String(input.reasonCode || "").trim();
  const notes = String(input.notes || "").trim().slice(0, 4000);
  if (!INSTALLER_REASON_CODES.has(reasonCode)) {
    throw new CrmAuthError(400, "Choose a valid incomplete-work reason.");
  }
  const hasNotInstalled = issues.some((issue) => issue.notInstalled);
  if (outcome === "completed" && hasNotInstalled) {
    throw new CrmAuthError(400, "A completed installation cannot include a not-installed line item.");
  }
  if (outcome === "partially_completed" && !hasNotInstalled) {
    throw new CrmAuthError(400, "Mark at least one line item as not installed for a partially completed job.");
  }
  if (outcome === "incomplete" && !reasonCode && !notes && issues.length === 0) {
    throw new CrmAuthError(400, "Add an incomplete-work reason, notes, or a line-item issue.");
  }
  const { withheld, adjusted } = calculateInstallerCod(form.cod_original, form.line_snapshot, issues);
  const signedAt = new Date().toISOString();
  const status = outcome === "completed" ? "completed" : "partially_installed";
  const previousWorkflow = installerWorkflowFromMeta(form);
  const revision = previousWorkflow.revision + 1;
  const previousMeta = form.meta && typeof form.meta === "object" ? form.meta : {};
  const previousHistory = Array.isArray(previousMeta.report_history)
    ? previousMeta.report_history.slice(-19)
    : [];
  const meta = {
    ...previousMeta,
    schema: "805_installer_form_v2",
    workflow: {
      outcome,
      reasonCode,
      notes,
      revision,
      updatedAt: signedAt,
    },
    report_history: [
      ...previousHistory,
      {
        outcome,
        reasonCode,
        notes,
        signerName,
        issues,
        revision,
        updatedAt: signedAt,
      },
    ],
  };
  const { error } = await supabase.from("crm_installer_forms").update({
    status,
    issues,
    cod_withheld: withheld,
    cod_adjusted: adjusted,
    accepted: true,
    signer_name: signerName,
    signed_at: signedAt,
    meta,
  }).eq("id", form.id);
  if (error) throw new CrmAuthError(502, "The installation report could not be saved.");

  const issueText = issues.length
    ? issues.map((issue) => {
        const line = allowed.get(issue.lineId);
        return `${line?.room || "Window"}: ${issue.notInstalled ? "NOT INSTALLED" : "Issue noted"}${issue.details ? ` — ${issue.details}` : ""}`;
      }).join("\n")
    : "No installation issues reported.";
  const outcomeLabel = installerOutcomeLabel(outcome);
  const subject = `${previousWorkflow.revision ? "Updated" : "New"} ${outcomeLabel.toLowerCase()} installation report — ${form.customer_snapshot.name}`;
  const workflowText = `Outcome: ${outcomeLabel}${reasonCode ? `\nReason: ${installerReasonLabel(reasonCode)}` : ""}${notes ? `\nTechnician notes: ${notes}` : ""}`;
  const text = `${subject}\n\nInstaller: ${signerName}\nContract: ${form.customer_snapshot.quoteNumber || form.quote_id}\nRevision: ${revision}\n\n${workflowText}\n\n${issueText}\n\nOpen form: ${installerUrl(token)}`;
  const reportEmail = await sendEmail({
    to: INSTALLER_REPORT_RECIPIENT,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:680px"><h1>${html(subject)}</h1><p><strong>Installer:</strong> ${html(signerName)}<br><strong>Contract:</strong> ${html(form.customer_snapshot.quoteNumber || form.quote_id)}<br><strong>Revision:</strong> ${revision}</p><pre style="font:14px/1.5 Arial,sans-serif;white-space:pre-wrap">${html(workflowText)}\n\n${html(issueText)}</pre><p><a href="${html(installerUrl(token))}">Open installation form</a></p></div>`,
  });
  return {
    status,
    outcome,
    savedAt: signedAt,
    revision,
    reportEmail: { sent: reportEmail.sent },
  };
}

export function installerWorkflowFromMeta(form: Pick<InstallerFormRow, "status" | "issues" | "meta">): InstallerWorkflow {
  const meta = form.meta && typeof form.meta === "object" ? form.meta : {};
  const workflow = meta.workflow && typeof meta.workflow === "object"
    ? meta.workflow as Record<string, unknown>
    : {};
  const fallbackOutcome: InstallerOutcome = form.status === "partially_installed"
    ? form.issues?.some((issue) => issue.notInstalled)
      ? "partially_completed"
      : "incomplete"
    : "completed";
  const candidate = String(workflow.outcome || "");
  return {
    outcome: INSTALLER_OUTCOMES.has(candidate as InstallerOutcome)
      ? candidate as InstallerOutcome
      : fallbackOutcome,
    reasonCode: INSTALLER_REASON_CODES.has(String(workflow.reasonCode || ""))
      ? String(workflow.reasonCode || "")
      : "",
    notes: String(workflow.notes || "").slice(0, 4000),
    revision: Math.max(0, Number.isSafeInteger(Number(workflow.revision)) ? Number(workflow.revision) : 0),
    updatedAt: typeof workflow.updatedAt === "string" ? workflow.updatedAt : null,
  };
}

function normalizeInstallerOutcome(
  value: unknown,
  issues: Array<{ notInstalled: boolean }>,
): InstallerOutcome {
  const candidate = String(value || "");
  if (INSTALLER_OUTCOMES.has(candidate as InstallerOutcome)) {
    return candidate as InstallerOutcome;
  }
  return issues.some((issue) => issue.notInstalled) ? "partially_completed" : "completed";
}

function installerOutcomeLabel(outcome: InstallerOutcome) {
  if (outcome === "partially_completed") return "Partially completed";
  if (outcome === "incomplete") return "Incomplete";
  return "Completed";
}

function installerReasonLabel(reasonCode: string) {
  return reasonCode.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  const text = `${subject}\n\n${contract}\n${form.customer_snapshot.address || ""}\n${form.line_snapshot.length} installation line item(s)\n\nOpen the editable technician form to record the overall outcome, report incomplete work or line-item issues, add notes, and sign off. Reopen the same link to update the report:\n${url}\n\nA price-redacted reference PDF is attached.`;
  const body = `<div style="font-family:Arial,sans-serif;max-width:680px"><h1>805 Shutters Installation Form</h1><p><strong>${html(form.customer_snapshot.name)}</strong><br>${html(form.customer_snapshot.address || "")}<br>${html(contract)}</p><p>${form.line_snapshot.length} installation line item(s). The attached PDF contains the customer and product details without pricing.</p><p><a href="${html(url)}" style="display:inline-block;background:#111;color:#fff;padding:13px 18px;text-decoration:none;font-weight:bold">Open editable technician form</a></p><p>Use the live form to record the job outcome, report incomplete work, add notes, and sign off. Reopen this same link whenever the report needs an update.</p></div>`;
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
  write("JOB OUTCOME: [ ] Complete  [ ] Partially complete  [ ] Incomplete", 10, true);
  write("Incomplete reason: __________________________________________________________");
  write("Technician notes: ___________________________________________________________");
  write(`Open the editable technician workflow: ${url}`, 8);

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
