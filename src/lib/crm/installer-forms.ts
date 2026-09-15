import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { ensureShareToken, loadPublicQuoteByToken, type PublicQuote } from "@/lib/crm/public-quote";
import { getMeasureNeededMeta } from "@/lib/crm/measure-needed-state";
import { sendEmail, type EmailResult } from "@/lib/notify/email";
import { brandIdentity } from "@/lib/brand-identity";
import {
  INSTALLATION_HANDOFF_RECIPIENT,
  buildNoMeasureInstallationHandoff,
  buildTechnicalMeasureInstallationHandoff,
  installationHandoffDeliveryState,
  installationHandoffPackageFromDeliveryState,
  pendingInstallationHandoffDeliveryState,
  type InstallationHandoffDeliveryState,
  type InstallationHandoffPackage,
} from "@/lib/crm/installation-handoff";
import { requireInstallerCustomerBalance } from "@/lib/crm/installer-balance";

export const INSTALLER_FORM_RECIPIENT = INSTALLATION_HANDOFF_RECIPIENT;
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
  created_at?: string;
  updated_at?: string;
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
  sent_at?: string | null;
  email_recipient?: string | null;
  email_message_id?: string | null;
  email_error?: string | null;
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
const INSTALLATION_HANDOFF_META_KEY = "installation_handoff";

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
  const { enqueueAndProcessInstallerDelivery } = await import("@/lib/crm/installer-delivery-outbox");
  const result = await enqueueAndProcessInstallerDelivery(supabase, quoteId);
  const form = result.form || await ensureInstallerForm(supabase, quoteId);
  return { form, email: result.email || { sent: false, skipped: "installer delivery remains queued" } };
}

export async function ensureInstallerForm(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<InstallerFormRow> {
  const { data: existingData, error: existingError } = await supabase
    .from("crm_installer_forms")
    .select("*")
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (existingError) {
    throw new CrmAuthError(502, `The installer form delivery state could not be checked: ${existingError.message}`);
  }
  if (existingData) return existingData as InstallerFormRow;

  const { token } = await ensureShareToken(supabase, quoteId, { email: "automation:installer_form" });
  const quote = await loadPublicQuoteByToken(supabase, token);
  if (!quote) throw new CrmAuthError(404, "The sold quote could not be prepared for installation.");
  const { data: quoteRow, error: quoteError } = await supabase
    .from("crm_quotes")
    .select("job_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteError) {
    throw new CrmAuthError(502, `The installer form source job could not be loaded: ${quoteError.message}`);
  }
  const row = {
    quote_id: quoteId,
    job_id: (quoteRow as { job_id?: string | null } | null)?.job_id || null,
    public_token: randomBytes(24).toString("base64url"),
    status: "pending_delivery",
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
    .upsert(row, { onConflict: "quote_id", ignoreDuplicates: true })
    .select("*")
    .single();
  if (error || !data) throw new CrmAuthError(502, `The installer form could not be saved${error?.message ? `: ${error.message}` : "."}`);
  return data as InstallerFormRow;
}

export function installerFormInstallationHandoffState(
  form: Pick<InstallerFormRow, "meta">,
): InstallationHandoffDeliveryState | null {
  return installationHandoffDeliveryState(form.meta?.[INSTALLATION_HANDOFF_META_KEY]);
}

export function installerFormDeliveryComplete(form: InstallerFormRow): boolean {
  return Boolean(form.sent_at)
    && !["email_failed", "pending_delivery", "preparation_failed"].includes(form.status);
}

function physicalOpeningCount(form: Pick<InstallerFormRow, "line_snapshot">): number {
  return form.line_snapshot.reduce((total, line) => {
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new CrmAuthError(409, "The installer form contains an invalid physical opening quantity.");
    }
    return total + quantity;
  }, 0);
}

function installerFormHasDrapery(form: Pick<InstallerFormRow, "line_snapshot">): boolean {
  return form.line_snapshot.some((line) =>
    /\b(draper(?:y|ies)|drapes?|curtains?)\b/i.test(
      [line.productName, line.styleName, ...line.options].join(" "),
    )
  );
}

export function buildNoMeasureInstallerFormHandoff(
  form: InstallerFormRow,
  sourceCustomerId: string,
): InstallationHandoffPackage {
  if (!form.job_id) {
    throw new CrmAuthError(409, "The installer form is missing its exact source job UUID.");
  }
  if (!form.created_at) {
    throw new CrmAuthError(409, "The installer form is missing its persisted creation timestamp.");
  }
  return buildNoMeasureInstallationHandoff({
    sourceCustomerId,
    sourceJobId: form.job_id,
    sourceDocumentId: form.id,
    submittedAt: form.created_at,
    distinctPhysicalWindowOpenings: physicalOpeningCount(form),
    hasDrapery: installerFormHasDrapery(form),
  });
}

export async function prepareInstallerFormInstallationHandoff(
  supabase: SupabaseClient,
  form: InstallerFormRow,
): Promise<InstallerFormRow> {
  const existingState = installerFormInstallationHandoffState(form);
  if (!form.job_id) {
    throw new CrmAuthError(409, "The installer form is missing its exact source job UUID.");
  }

  const [measureResult, jobResult, contractResult] = await Promise.all([
    supabase
      .from("crm_technical_measure_forms")
      .select("id,customer_id,job_id,quote_id,submitted_at,meta")
      .eq("job_id", form.job_id)
      .eq("quote_id", form.quote_id)
      .eq("status", "submitted")
      .maybeSingle(),
    supabase.from("crm_jobs").select("id,meta").eq("id", form.job_id).maybeSingle(),
    supabase
      .from("crm_customer_contracts")
      .select("id,customer_id,job_id,quote_id,external_source,signed_at")
      .eq("quote_id", form.quote_id)
      .eq("job_id", form.job_id)
      .in("external_source", ["crm_quote", "technical_measure_addendum"])
      .not("signed_at", "is", null)
      .order("signed_at", { ascending: false }),
  ]);
  const lookupError = measureResult.error || jobResult.error || contractResult.error;
  if (lookupError) {
    throw new CrmAuthError(502, `The exact installer handoff lineage could not be loaded: ${lookupError.message}`);
  }

  let handoff: InstallationHandoffPackage | null = null;
  const contracts = (contractResult.data || []) as Array<{
    id?: string;
    customer_id?: string | null;
    signed_at?: string | null;
  }>;
  const contract = contracts[0] || null;
  if (
    contracts.length > 1 &&
    contract?.signed_at &&
    contracts[1]?.signed_at === contract.signed_at &&
    contracts[1]?.customer_id !== contract.customer_id
  ) {
    throw new CrmAuthError(409, "The exact signed customer lineage is ambiguous.");
  }
  const measure = measureResult.data as {
    id?: string;
    customer_id?: string | null;
    job_id?: string;
    submitted_at?: string | null;
    meta?: Record<string, unknown> | null;
  } | null;
  if (measure?.id) {
    const sourceCustomerId = measure.customer_id || contract?.customer_id || null;
    if (!sourceCustomerId || !measure.job_id || !measure.submitted_at) {
      throw new CrmAuthError(
        409,
        "The submitted Technical Measure is missing exact customer, job, or document lineage.",
      );
    }
    if (!measure.customer_id) {
      const linkedAt = new Date().toISOString();
      const { error: linkError } = await supabase
        .from("crm_technical_measure_forms")
        .update({
          customer_id: sourceCustomerId,
          contract_id: contract?.id || null,
          meta: {
            ...(measure.meta || {}),
            customer_lineage_repair: {
              source: "exact_signed_customer_contract",
              contract_id: contract?.id || null,
              repaired_at: linkedAt,
            },
          },
        })
        .eq("id", measure.id)
        .eq("job_id", form.job_id)
        .eq("quote_id", form.quote_id)
        .is("customer_id", null);
      if (linkError) {
        throw new CrmAuthError(502, `The Technical Measure customer lineage could not be saved: ${linkError.message}`);
      }
    }
    handoff = buildTechnicalMeasureInstallationHandoff({
      sourceCustomerId,
      sourceJobId: measure.job_id,
      sourceDocumentId: measure.id,
      submittedAt: measure.submitted_at,
      submittedBySourceProfileId:
        typeof measure.meta?.submitted_by_source_profile_id === "string"
          ? measure.meta.submitted_by_source_profile_id
          : null,
      durationMinutes: measure.meta?.installation_duration_minutes,
    });
  } else if (getMeasureNeededMeta(jobResult.data?.meta).status === "not_needed") {
    const sourceCustomerId = contract?.customer_id;
    if (!sourceCustomerId) {
      throw new CrmAuthError(
        409,
        "The no-measure installer handoff is missing an exact source customer UUID.",
      );
    }
    handoff = buildNoMeasureInstallerFormHandoff(form, sourceCustomerId);
  }

  if (!handoff) return form;
  const nextHandoffState = existingState?.source_sha256 === handoff.sha256
    ? existingState
    : pendingInstallationHandoffDeliveryState(handoff);
  const meta = {
    ...(form.meta || {}),
    [INSTALLATION_HANDOFF_META_KEY]: nextHandoffState,
  };
  const { error } = await supabase.from("crm_installer_forms").update({ meta }).eq("id", form.id);
  if (error) {
    throw new CrmAuthError(502, `The installer handoff delivery state could not be saved: ${error.message}`);
  }
  return { ...form, meta };
}

export function installerFormHandoffPackage(form: InstallerFormRow) {
  const state = installerFormInstallationHandoffState(form);
  return state ? installationHandoffPackageFromDeliveryState(state) : null;
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
    expectedRevision?: unknown;
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
  if (input.expectedRevision !== undefined && input.expectedRevision !== previousWorkflow.revision) throw new CrmAuthError(409, "This report changed. Reload and review the latest revision; your current entries have not been submitted.");
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
  if (error) throw new CrmAuthError(error.message?.includes("REPORT_CONFLICT") ? 409 : 502, error.message?.includes("REPORT_CONFLICT") ? "This report changed. Reload and review the latest revision." : "The installation report could not be saved.");

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
  }).catch(() => ({ sent: false }));
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
  const balance = requireInstallerCustomerBalance(form);
  const remainingBalance = formatInstallerMoney(balance.remaining_customer_balance);
  const contract = form.customer_snapshot.quoteNumber ? `Contract ${form.customer_snapshot.quoteNumber}` : "Sold job";
  const subject = `805 Shutters Installation Form — ${form.customer_snapshot.name}`;
  const text = `${subject}\n\n${contract}\n${form.customer_snapshot.address || ""}\nRemaining customer balance: ${remainingBalance}\n${form.line_snapshot.length} installation line item(s)\n\nOpen the editable technician form to record the overall outcome, report incomplete work or line-item issues, add notes, and sign off. Reopen the same link to update the report:\n${url}\n\nA price-redacted reference PDF is attached with the remaining customer balance clearly labeled.`;
  const body = `<div style="font-family:Arial,sans-serif;max-width:680px"><h1>805 Shutters Installation Form</h1><p><strong>${html(form.customer_snapshot.name)}</strong><br>${html(form.customer_snapshot.address || "")}<br>${html(contract)}</p><p><strong>Remaining customer balance: ${html(remainingBalance)}</strong></p><p>${form.line_snapshot.length} installation line item(s). The attached PDF contains the customer and product details without line-item pricing and clearly labels the remaining customer balance.</p><p><a href="${html(url)}" style="display:inline-block;background:#111;color:#fff;padding:13px 18px;text-decoration:none;font-weight:bold">Open editable technician form</a></p><p>Use the live form to record the job outcome, report incomplete work, add notes, and sign off. Reopen this same link whenever the report needs an update.</p></div>`;
  return { subject, text, html: body };
}

function formatInstallerMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function buildInstallerFormPdf(form: InstallerFormRow, url: string) {
  const balance = requireInstallerCustomerBalance(form);
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
  write(
    `REMAINING CUSTOMER BALANCE: ${formatInstallerMoney(balance.remaining_customer_balance)}`,
    12,
    true,
  );
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
