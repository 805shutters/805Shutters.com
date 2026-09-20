import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailAttachment, EmailResult } from "@/lib/notify/email";
import { sendEmail } from "@/lib/notify/email";
import {
  INSTALLER_FORM_RECIPIENT,
  buildInstallerFormEmail,
  buildInstallerFormPdf,
  ensureInstallerForm,
  installerFormHandoffPackage,
  installerFormInstallationHandoffState,
  prepareInstallerFormInstallationHandoff,
  type InstallerFormRow,
} from "@/lib/crm/installer-forms";
import { refreshInstallerCustomerBalance } from "@/lib/crm/installer-balance";
import type { InstallationHandoffDeliveryState } from "@/lib/crm/installation-handoff";

export const INSTALLER_FORM_FROM = "805 Shutters <805@805shutters.com>";
export const INSTALLER_FORM_CC = "mtsinstallations@gmail.com";
const BASE_VERSION = "base-v1";
const BASE_RETRY_MINUTES = 5;

type InstallerOutboxKind = "base_packet" | "installation_handoff";
type InstallerOutboxStatus = "pending" | "processing" | "retry" | "uncertain" | "accepted" | "sent" | "blocked";

export type FrozenInstallerEmail = {
  to: typeof INSTALLER_FORM_RECIPIENT;
  // Optional only for immutable payloads frozen before dual-recipient delivery.
  cc?: [typeof INSTALLER_FORM_CC];
  from: typeof INSTALLER_FORM_FROM;
  subject: string;
  html: string;
  text: string;
  attachments: EmailAttachment[];
  idempotencyKey: string;
};

export type InstallerOutboxClaim = {
  id: string;
  quote_id: string;
  form_id: string | null;
  kind: InstallerOutboxKind;
  version_key: string;
  status: "processing";
  payload: FrozenInstallerEmail | null;
  idempotency_key: string | null;
  lease_token: string;
  first_send_attempt_at: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
};

type PreparedDelivery = { form: InstallerFormRow; payload: FrozenInstallerEmail };
type OutboxPatch = Partial<{
  form_id: string;
  status: InstallerOutboxStatus;
  payload: FrozenInstallerEmail;
  idempotency_key: string;
  failure_stage: "form" | "balance" | "handoff" | "send" | "persist" | null;
  last_error: string | null;
  available_at: string;
  lease_token: null;
  lease_expires_at: null;
  first_send_attempt_at: string;
  provider_message_id: string;
  sent_at: string;
}>;

export type InstallerDeliveryDependencies = {
  claim: (supabase: SupabaseClient, quoteId?: string) => Promise<InstallerOutboxClaim | null>;
  updateOutbox: (supabase: SupabaseClient, claim: InstallerOutboxClaim, patch: OutboxPatch) => Promise<void>;
  loadForm: (supabase: SupabaseClient, claim: InstallerOutboxClaim) => Promise<InstallerFormRow | null>;
  prepareBase: (supabase: SupabaseClient, claim: InstallerOutboxClaim) => Promise<PreparedDelivery>;
  prepareHandoff: (supabase: SupabaseClient, claim: InstallerOutboxClaim) => Promise<PreparedDelivery>;
  discoverHandoff: (supabase: SupabaseClient, form: InstallerFormRow) => Promise<void>;
  recordFormFailure: (supabase: SupabaseClient, form: InstallerFormRow | null, stage: string, error: string) => Promise<void>;
  recordAccepted: (supabase: SupabaseClient, form: InstallerFormRow, claim: InstallerOutboxClaim, result: EmailResult, at: string) => Promise<InstallerFormRow>;
  send: (payload: FrozenInstallerEmail) => Promise<EmailResult>;
  stats: (supabase: SupabaseClient, quoteId?: string) => Promise<{ pending: number; blocked: number; errors: string[] }>;
  now: () => string;
};

function installerUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.805shutters.com").replace(/\/$/, "");
  return `${base}/installer-form/${encodeURIComponent(token)}`;
}

class FrozenPayloadError extends Error {}

function assertFrozenPayload(payload: FrozenInstallerEmail) {
  if (
    payload.to !== INSTALLER_FORM_RECIPIENT ||
    (payload.cc !== undefined && (
      !Array.isArray(payload.cc) || payload.cc.length !== 1 || payload.cc[0] !== INSTALLER_FORM_CC
    )) ||
    payload.from !== INSTALLER_FORM_FROM ||
    !payload.idempotencyKey ||
    !payload.subject ||
    !payload.text ||
    !payload.html ||
    !Array.isArray(payload.attachments) ||
    payload.attachments.length === 0
  ) {
    throw new FrozenPayloadError("The frozen installer email payload is invalid.");
  }
}

function expectedIdempotencyKey(claim: InstallerOutboxClaim, formId: string) {
  return claim.kind === "base_packet"
    ? `805-installer-form-${formId}-${BASE_VERSION}-${INSTALLER_FORM_RECIPIENT}`
    : `805-installer-handoff-${formId}-${claim.version_key.slice(0, 24)}-${INSTALLER_FORM_RECIPIENT}`;
}

async function defaultClaim(supabase: SupabaseClient, quoteId?: string) {
  const { data, error } = await supabase.rpc("installer_delivery_claim", {
    p_quote_id: quoteId || null,
  });
  if (error) throw new Error(`Installer delivery claim failed: ${error.message}`);
  return (data || null) as InstallerOutboxClaim | null;
}

async function defaultUpdateOutbox(
  supabase: SupabaseClient,
  claim: InstallerOutboxClaim,
  patch: OutboxPatch,
) {
  const { data, error } = await supabase
    .from("crm_installer_delivery_outbox")
    .update(patch)
    .eq("id", claim.id)
    .in("status", ["processing", "accepted"])
    .eq("lease_token", claim.lease_token)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    throw new Error(`Installer delivery lease was lost before state could be saved${error?.message ? `: ${error.message}` : "."}`);
  }
}

async function defaultLoadForm(supabase: SupabaseClient, claim: InstallerOutboxClaim) {
  const query = supabase.from("crm_installer_forms").select("*");
  const { data, error } = claim.form_id
    ? await query.eq("id", claim.form_id).maybeSingle()
    : await query.eq("quote_id", claim.quote_id).maybeSingle();
  if (error) throw new Error(`Installer form could not be loaded: ${error.message}`);
  return (data || null) as InstallerFormRow | null;
}

async function defaultPrepareBase(
  supabase: SupabaseClient,
  claim: InstallerOutboxClaim,
): Promise<PreparedDelivery> {
  const form = await ensureInstallerForm(supabase, claim.quote_id);
  const balanced = await refreshInstallerCustomerBalance(supabase, form) as InstallerFormRow;
  const url = installerUrl(balanced.public_token);
  const message = buildInstallerFormEmail(balanced, url);
  const payload: FrozenInstallerEmail = {
    to: INSTALLER_FORM_RECIPIENT,
    cc: [INSTALLER_FORM_CC],
    from: INSTALLER_FORM_FROM,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: [{
      filename: `805-Shutters-Installation-Form-${balanced.customer_snapshot.quoteNumber || balanced.id.slice(0, 8)}.pdf`,
      content: buildInstallerFormPdf(balanced, url).toString("base64"),
      contentType: "application/pdf",
    }],
    idempotencyKey: `805-installer-form-${balanced.id}-${BASE_VERSION}-${INSTALLER_FORM_RECIPIENT}`,
  };
  assertFrozenPayload(payload);
  return { form: balanced, payload };
}

async function defaultPrepareHandoff(
  supabase: SupabaseClient,
  claim: InstallerOutboxClaim,
): Promise<PreparedDelivery> {
  const form = await defaultLoadForm(supabase, claim) || await ensureInstallerForm(supabase, claim.quote_id);
  const prepared = await prepareInstallerFormInstallationHandoff(supabase, form);
  const handoff = installerFormHandoffPackage(prepared);
  if (!handoff || handoff.sha256 !== claim.version_key) {
    throw new Error("The exact canonical installation handoff version is not available.");
  }
  const subject = `805 Shutters MTS installation handoff — ${prepared.customer_snapshot.name}`;
  const text = `${subject}\n\nCanonical handoff JSON and SHA-256 sidecar are attached. Source version: ${handoff.payload.sourceVersion}`;
  const payload: FrozenInstallerEmail = {
    to: INSTALLER_FORM_RECIPIENT,
    cc: [INSTALLER_FORM_CC],
    from: INSTALLER_FORM_FROM,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif"><h1>${subject}</h1><p>Canonical handoff JSON and SHA-256 sidecar are attached.</p><p>Source version: ${handoff.payload.sourceVersion}</p></div>`,
    attachments: [
      {
        filename: handoff.jsonFilename,
        content: Buffer.from(handoff.canonicalJson, "utf8").toString("base64"),
        contentType: "application/json",
      },
      {
        filename: handoff.sha256Filename,
        content: Buffer.from(`${handoff.sha256}  ${handoff.jsonFilename}\n`, "utf8").toString("base64"),
        contentType: "text/plain",
      },
    ],
    idempotencyKey: `805-installer-handoff-${prepared.id}-${handoff.sha256.slice(0, 24)}-${INSTALLER_FORM_RECIPIENT}`,
  };
  assertFrozenPayload(payload);
  return { form: prepared, payload };
}

function workflowStatus(form: InstallerFormRow, fallback: string) {
  return ["partially_installed", "completed"].includes(form.status) ? form.status : fallback;
}

async function updateForm(supabase: SupabaseClient, formId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("crm_installer_forms").update(patch).eq("id", formId);
  if (error) throw new Error(`Installer form delivery state could not be saved: ${error.message}`);
}

async function defaultRecordFormFailure(
  supabase: SupabaseClient,
  form: InstallerFormRow | null,
  stage: string,
  error: string,
) {
  if (!form) return;
  const { data: currentData } = await supabase
    .from("crm_installer_forms")
    .select("*")
    .eq("id", form.id)
    .maybeSingle();
  const current = (currentData || form) as InstallerFormRow;
  const handoff = installerFormInstallationHandoffState(current);
  const handoffFailure = stage === "handoff" && handoff
    ? {
        ...handoff,
        status: "email_failed" as const,
        email_error: error,
      }
    : handoff;
  await updateForm(supabase, current.id, {
    status: stage === "handoff"
      ? current.status
      : workflowStatus(current, stage === "send" ? "email_failed" : "preparation_failed"),
    email_recipient: INSTALLER_FORM_RECIPIENT,
    email_error: stage === "handoff" ? current.email_error || null : error,
    meta: {
      ...(current.meta || {}),
      ...(handoffFailure ? { installation_handoff: handoffFailure } : {}),
      ...(stage === "handoff"
        ? {}
        : { installer_delivery: { status: "failed", failure_stage: stage, error, failed_at: new Date().toISOString() } }),
    },
  });
}

async function defaultRecordAccepted(
  supabase: SupabaseClient,
  form: InstallerFormRow,
  claim: InstallerOutboxClaim,
  result: EmailResult,
  at: string,
) {
  if (!result.id) throw new Error("The email provider accepted delivery without a message identifier.");
  const current = await defaultLoadForm(supabase, { ...claim, form_id: form.id }) || form;
  if (claim.kind === "installation_handoff") {
    const handoff = installerFormInstallationHandoffState(current);
    if (!handoff || handoff.source_sha256 !== claim.version_key) {
      throw new Error("The accepted handoff no longer matches the claimed canonical version.");
    }
    const next: InstallationHandoffDeliveryState = {
      ...handoff,
      status: "sent",
      email_recipient: INSTALLER_FORM_RECIPIENT,
      email_message_id: result.id,
      email_error: null,
      sent_at: at,
    };
    const updated = { ...current, meta: { ...(current.meta || {}), installation_handoff: next } };
    await updateForm(supabase, current.id, { meta: updated.meta });
    return updated;
  }
  const patch = {
    status: workflowStatus(current, "sent"),
    sent_at: at,
    email_recipient: INSTALLER_FORM_RECIPIENT,
    email_message_id: result.id,
    email_error: null,
    meta: {
      ...(current.meta || {}),
      installer_delivery: { status: "sent", provider_message_id: result.id, sent_at: at },
    },
  };
  await updateForm(supabase, current.id, patch);
  return { ...current, ...patch };
}

export async function discoverAndEnqueueInstallerHandoff(
  supabase: SupabaseClient,
  form: InstallerFormRow,
) {
  try {
    const prepared = await prepareInstallerFormInstallationHandoff(supabase, form);
    const handoff = installerFormHandoffPackage(prepared);
    if (!handoff) return null;
    const { data, error } = await supabase.rpc("installer_delivery_enqueue", {
      p_quote_id: form.quote_id,
      p_kind: "installation_handoff",
      p_version_key: handoff.sha256,
    });
    if (error) throw new Error(`The canonical handoff could not be queued: ${error.message}`);
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Installation handoff preparation failed.";
    const { data: currentData } = await supabase
      .from("crm_installer_forms")
      .select("meta")
      .eq("id", form.id)
      .maybeSingle();
    const currentMeta = (currentData as { meta?: Record<string, unknown> } | null)?.meta || form.meta || {};
    await updateForm(supabase, form.id, {
      meta: {
        ...currentMeta,
        installation_handoff_preparation: {
          status: "failed",
          error: message,
          failed_at: new Date().toISOString(),
        },
      },
    });
    throw error;
  }
}

async function defaultStats(supabase: SupabaseClient, quoteId?: string) {
  let query = supabase
    .from("crm_installer_delivery_outbox")
    .select("status,last_error")
    .in("status", ["pending", "processing", "retry", "uncertain", "accepted", "blocked"])
    .limit(200);
  if (quoteId) query = query.eq("quote_id", quoteId);
  const { data, error } = await query;
  if (error) throw new Error(`Installer delivery status could not be read: ${error.message}`);
  const rows = (data || []) as Array<{ status: InstallerOutboxStatus; last_error?: string | null }>;
  return {
    pending: rows.filter((row) => row.status !== "blocked").length,
    blocked: rows.filter((row) => row.status === "blocked").length,
    errors: rows.flatMap((row) => row.last_error ? [row.last_error] : []),
  };
}

const defaults: InstallerDeliveryDependencies = {
  claim: defaultClaim,
  updateOutbox: defaultUpdateOutbox,
  loadForm: defaultLoadForm,
  prepareBase: defaultPrepareBase,
  prepareHandoff: defaultPrepareHandoff,
  discoverHandoff: discoverAndEnqueueInstallerHandoff,
  recordFormFailure: defaultRecordFormFailure,
  recordAccepted: defaultRecordAccepted,
  send: (payload) => sendEmail({ ...payload, signal: AbortSignal.timeout(120_000) }),
  stats: defaultStats,
  now: () => new Date().toISOString(),
};

function retryAt(at: string) {
  return new Date(new Date(at).getTime() + BASE_RETRY_MINUTES * 60_000).toISOString();
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Installer delivery failed.";
}

function recordedBaseAcceptance(form: InstallerFormRow | null) {
  if (!form?.sent_at) return null;
  const delivery = form.meta?.installer_delivery;
  const metaId = delivery && typeof delivery === "object" && !Array.isArray(delivery)
    ? String((delivery as Record<string, unknown>).provider_message_id || "").trim()
    : "";
  const id = String(form.email_message_id || metaId).trim();
  return id ? { id, at: form.sent_at } : null;
}

export async function processInstallerDeliveryOutbox(
  supabase: SupabaseClient,
  options: {
    quoteId?: string;
    limit?: number;
    deadlineMs?: number;
    dependencies?: Partial<InstallerDeliveryDependencies>;
  } = {},
) {
  const dependencies = { ...defaults, ...(options.dependencies || {}) };
  const limit = Math.min(Math.max(options.limit || 20, 1), 50);
  const deadline = Date.now() + Math.min(Math.max(options.deadlineMs || 220_000, 1_000), 240_000);
  const errors: string[] = [];
  let processed = 0;
  let lastForm: InstallerFormRow | null = null;
  let lastEmail: EmailResult | null = null;

  for (let index = 0; index < limit && Date.now() < deadline; index += 1) {
    let claim = await dependencies.claim(supabase, options.quoteId);
    if (!claim) break;
    processed += 1;
    let form: InstallerFormRow | null = null;
    let stage: "form" | "balance" | "handoff" | "send" | "persist" = "form";
    let acceptedProviderId = claim.provider_message_id;
    let acceptedAt = claim.sent_at;
    let providerAccepted = Boolean(acceptedProviderId && acceptedAt);
    try {
      form = await dependencies.loadForm(supabase, claim);
      const handoffState = installerFormInstallationHandoffState(form || { meta: {} });
      const legacyAcceptance = claim.kind === "base_packet"
        ? recordedBaseAcceptance(form)
        : handoffState?.source_sha256 === claim.version_key && handoffState.sent_at && handoffState.email_message_id
          ? { id: handoffState.email_message_id, at: handoffState.sent_at }
          : null;
      const acceptedId = claim.provider_message_id || legacyAcceptance?.id || null;
      const existingAcceptedAt = claim.sent_at || legacyAcceptance?.at || null;

      if (acceptedId && existingAcceptedAt && form) {
        acceptedProviderId = acceptedId;
        acceptedAt = existingAcceptedAt;
        providerAccepted = true;
        if (!claim.provider_message_id) {
          await dependencies.updateOutbox(supabase, claim, {
            form_id: form.id,
            status: "accepted",
            provider_message_id: acceptedId,
            sent_at: existingAcceptedAt,
            failure_stage: null,
            last_error: null,
          });
        }
        stage = "persist";
        const reconciled = claim.kind === "base_packet" && recordedBaseAcceptance(form)
          ? form
          : await dependencies.recordAccepted(
              supabase,
              form,
              claim,
              { sent: true, id: acceptedId, skipped: "provider acceptance already recorded" },
              existingAcceptedAt,
            );
        lastForm = reconciled;
        lastEmail = { sent: true, id: acceptedId, skipped: "accepted installer delivery already recorded" };
        if (claim.kind === "base_packet") {
          stage = "handoff";
          await dependencies.discoverHandoff(supabase, reconciled);
        }
        await dependencies.updateOutbox(supabase, claim, {
          form_id: reconciled.id,
          status: "sent",
          provider_message_id: acceptedId,
          sent_at: existingAcceptedAt,
          failure_stage: null,
          last_error: null,
          lease_token: null,
          lease_expires_at: null,
        });
        continue;
      }

      stage = claim.kind === "installation_handoff" ? "handoff" : form ? "balance" : "form";
      const prepared = claim.payload
        ? { form: form || await ensureInstallerForm(supabase, claim.quote_id), payload: claim.payload }
        : await (claim.kind === "base_packet" ? dependencies.prepareBase : dependencies.prepareHandoff)(supabase, claim);
      form = prepared.form;
      lastForm = form;
      assertFrozenPayload(prepared.payload);
      if (
        claim.payload &&
        (
          claim.idempotency_key !== prepared.payload.idempotencyKey ||
          prepared.payload.idempotencyKey !== expectedIdempotencyKey(claim, form.id)
        )
      ) {
        throw new FrozenPayloadError("The frozen installer payload idempotency key changed.");
      }
      if (!claim.payload) {
        await dependencies.updateOutbox(supabase, claim, {
          form_id: form.id,
          payload: prepared.payload,
          idempotency_key: prepared.payload.idempotencyKey,
          failure_stage: null,
          last_error: null,
        });
        claim = { ...claim, form_id: form.id, payload: prepared.payload, idempotency_key: prepared.payload.idempotencyKey };
      }

      const attemptAt = dependencies.now();
      stage = "send";
      await dependencies.updateOutbox(supabase, claim, {
        first_send_attempt_at: claim.first_send_attempt_at || attemptAt,
        failure_stage: "send",
      });
      let email: EmailResult;
      try {
        email = await dependencies.send(prepared.payload);
      } catch (error) {
        email = { sent: false, uncertain: true, error: errorText(error) };
      }
      lastEmail = email;
      if (!email.sent || !email.id) {
        const message = email.error || email.skipped || (email.sent ? "Provider response omitted the accepted message ID." : "Provider did not accept installer email.");
        const uncertain = Boolean(email.uncertain || email.sent);
        await dependencies.updateOutbox(supabase, claim, {
          status: uncertain ? "uncertain" : "retry",
          failure_stage: "send",
          last_error: message,
          available_at: retryAt(attemptAt),
          lease_token: null,
          lease_expires_at: null,
        });
        await dependencies.recordFormFailure(supabase, form, "send", message);
        errors.push(message);
        continue;
      }

      acceptedAt = dependencies.now();
      acceptedProviderId = email.id;
      providerAccepted = true;
      await dependencies.updateOutbox(supabase, claim, {
        status: "accepted",
        provider_message_id: acceptedProviderId,
        sent_at: acceptedAt,
        failure_stage: "persist",
        last_error: null,
      });
      stage = "persist";
      const acceptedForm = await dependencies.recordAccepted(supabase, form, claim, email, acceptedAt);
      lastForm = acceptedForm;
      if (claim.kind === "base_packet") {
        stage = "handoff";
        await dependencies.discoverHandoff(supabase, acceptedForm);
      }
      await dependencies.updateOutbox(supabase, claim, {
        status: "sent",
        provider_message_id: email.id,
        sent_at: acceptedAt,
        failure_stage: null,
        last_error: null,
        lease_token: null,
        lease_expires_at: null,
      });
    } catch (error) {
      const message = errorText(error);
      const blocked = error instanceof FrozenPayloadError;
      const status: InstallerOutboxStatus = blocked
        ? "blocked"
        : providerAccepted
          ? "accepted"
          : stage === "send"
            ? "uncertain"
            : "retry";
      try {
        await dependencies.updateOutbox(supabase, claim, {
          status,
          ...(providerAccepted && acceptedProviderId && acceptedAt
            ? { provider_message_id: acceptedProviderId, sent_at: acceptedAt }
            : {}),
          failure_stage: stage,
          last_error: message,
          available_at: retryAt(dependencies.now()),
          lease_token: null,
          lease_expires_at: null,
        });
        if (!providerAccepted) {
          await dependencies.recordFormFailure(supabase, form, stage, message);
        }
      } catch (persistError) {
        errors.push(errorText(persistError));
      }
      errors.push(message);
    }
  }

  const state = await dependencies.stats(supabase, options.quoteId);
  return {
    processed,
    pending: state.pending,
    blocked: state.blocked,
    errors: [...new Set([...errors, ...state.errors])],
    form: lastForm,
    email: lastEmail,
  };
}

export async function enqueueAndProcessInstallerDelivery(
  supabase: SupabaseClient,
  quoteId: string,
) {
  const { data, error } = await supabase.rpc("installer_delivery_enqueue", {
    p_quote_id: quoteId,
    p_kind: "base_packet",
    p_version_key: BASE_VERSION,
  });
  if (error) throw new Error(`Installer delivery could not be queued: ${error.message}`);
  if (!data) return { processed: 0, pending: 0, blocked: 0, errors: [], form: null, email: null };

  const { data: existingForm, error: formError } = await supabase
    .from("crm_installer_forms")
    .select("*")
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (formError) throw new Error(`Installer form could not be checked: ${formError.message}`);
  if (existingForm) {
    try {
      await discoverAndEnqueueInstallerHandoff(supabase, existingForm as InstallerFormRow);
    } catch {
      // Optional MTS handoff failure must never suppress the base installer PDF.
    }
  }
  return processInstallerDeliveryOutbox(supabase, { quoteId, limit: 4 });
}
