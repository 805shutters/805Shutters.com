import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, type EmailAttachment, type EmailResult } from "@/lib/notify/email";
import type { SignedContractSnapshot } from "@/lib/crm/public-quote";
import { buildSignedContractPdf } from "./signed-contract-pdf";
import { ContractContentError, validateSignedContractSnapshot } from "./signed-contract-snapshot";

export const DEFAULT_INTERNAL_SIGNED_CONTRACT_COPY_RECIPIENT = "wcbot+805@mail.grokbot.com";
export const INTERNAL_SIGNED_CONTRACT_COPY_EMAIL_ENV = "INTERNAL_SIGNED_CONTRACT_COPY_EMAIL";
export const INTERNAL_SIGNED_CONTRACT_COPY_FROM = "805 Shutters <805@805shutters.com>";

const CONTRACT_NUMBER = /^805-\d{4,}$/;
const RETRY_MINUTES = 5;
const SEND_BUDGET_MS = 55_000;

type DeliveryStatus = "pending" | "processing" | "retry" | "uncertain" | "accepted" | "blocked";

export type FrozenInternalSignedContractCopy = {
  to: string;
  from: typeof INTERNAL_SIGNED_CONTRACT_COPY_FROM;
  subject: string;
  html: string;
  text: string;
  attachments: EmailAttachment[];
  idempotencyKey: string;
};

export type InternalSignedContractCopyClaim = {
  id: string;
  contract_id: string;
  quote_id: string;
  contract_number: string;
  status: "processing";
  recipient: string;
  signed_snapshot: SignedContractSnapshot;
  customer_signature: string;
  contract_signed_at: string;
  payload: FrozenInternalSignedContractCopy | null;
  idempotency_key: string | null;
  lease_token: string;
  first_send_attempt_at: string | null;
  provider_message_id: string | null;
  provider_accepted_at: string | null;
};

type OutboxPatch = Partial<{
  status: DeliveryStatus;
  recipient: string;
  payload: FrozenInternalSignedContractCopy;
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

export type InternalSignedContractCopyDependencies = {
  claim: (supabase: SupabaseClient, quoteId?: string) => Promise<InternalSignedContractCopyClaim | null>;
  update: (supabase: SupabaseClient, claim: InternalSignedContractCopyClaim, patch: OutboxPatch) => Promise<void>;
  prepare: (claim: InternalSignedContractCopyClaim) => Promise<FrozenInternalSignedContractCopy>;
  send: (payload: FrozenInternalSignedContractCopy, timeoutMs?: number) => Promise<EmailResult>;
  now: () => string;
};

class FrozenPayloadError extends Error {}

function emailAddress(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

export function internalSignedContractCopyRecipient(source = process.env[INTERNAL_SIGNED_CONTRACT_COPY_EMAIL_ENV]) {
  const configured = emailAddress(source);
  return configured || DEFAULT_INTERNAL_SIGNED_CONTRACT_COPY_RECIPIENT;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function oneLine(value: unknown) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

export function internalSignedContractCopySubject(contractNumber: string, customerName: string) {
  if (!CONTRACT_NUMBER.test(contractNumber)) {
    throw new ContractContentError("The signed contract has no 805 contract number.");
  }
  return `Signed contract ${contractNumber} — ${oneLine(customerName) || "customer"}`;
}

function expectedIdempotencyKey(claim: Pick<InternalSignedContractCopyClaim, "contract_id">) {
  return `805-internal-signed-contract-${claim.contract_id}-v1`;
}

async function prepareCopy(claim: InternalSignedContractCopyClaim): Promise<FrozenInternalSignedContractCopy> {
  const contractNumber = oneLine(claim.contract_number);
  const snapshot = validateSignedContractSnapshot(claim.signed_snapshot, claim.customer_signature);
  if (snapshot.quote.id !== claim.quote_id) {
    throw new ContractContentError("The signed contract snapshot belongs to a different quote.");
  }
  if (Date.parse(snapshot.signedAt) !== Date.parse(claim.contract_signed_at)) {
    throw new ContractContentError("The signed contract date no longer matches its immutable snapshot.");
  }
  if (oneLine(snapshot.quote.quoteNumber) !== contractNumber) {
    throw new ContractContentError("The signed contract number does not match the signed snapshot.");
  }
  const recipient = internalSignedContractCopyRecipient();
  const customer = emailAddress(snapshot.customerEmail);
  if (!recipient || recipient === customer) {
    throw new ContractContentError("The internal signed-contract copy has no separate recipient.");
  }
  const subject = internalSignedContractCopySubject(contractNumber, snapshot.customerName);
  const text = `Internal copy of signed contract ${contractNumber} for ${oneLine(snapshot.customerName) || "the customer"}.\n\nThe signed contract PDF is attached. This copy is only for the 805 financial checklist.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:640px;margin:auto;padding:28px 18px">
    <p style="font-size:15px;line-height:1.65">Internal copy of signed contract <strong>${escapeHtml(contractNumber)}</strong> for ${escapeHtml(oneLine(snapshot.customerName) || "the customer")}.</p>
    <p style="font-size:15px;line-height:1.65">The signed contract PDF is attached. This copy is only for the 805 financial checklist.</p>
  </div>`;
  const pdf = await buildSignedContractPdf(snapshot, claim.id);
  return {
    to: recipient,
    from: INTERNAL_SIGNED_CONTRACT_COPY_FROM,
    subject,
    html,
    text,
    attachments: [{
      filename: `805-Shutters-${contractNumber}-Signed-Contract.pdf`,
      content: pdf.toString("base64"),
      contentType: "application/pdf",
    }],
    idempotencyKey: expectedIdempotencyKey(claim),
  };
}

function assertFrozenPayload(payload: FrozenInternalSignedContractCopy, claim: InternalSignedContractCopyClaim) {
  const customer = emailAddress(claim.signed_snapshot?.customerEmail);
  const expectedTo = claim.payload ? emailAddress(claim.recipient) : internalSignedContractCopyRecipient();
  const contractNumber = oneLine(claim.contract_number);
  const extra = payload as FrozenInternalSignedContractCopy & { cc?: unknown; bcc?: unknown };
  if (
    payload.to !== expectedTo ||
    payload.to === customer ||
    payload.from !== INTERNAL_SIGNED_CONTRACT_COPY_FROM ||
    payload.subject !== internalSignedContractCopySubject(contractNumber, claim.signed_snapshot.customerName) ||
    !payload.subject.includes(contractNumber) ||
    payload.idempotencyKey !== expectedIdempotencyKey(claim) ||
    extra.cc != null ||
    extra.bcc != null ||
    payload.attachments.length !== 1 ||
    payload.attachments[0].contentType !== "application/pdf" ||
    !payload.attachments[0].filename.includes(contractNumber) ||
    !payload.attachments[0].content.startsWith("JVBER")
  ) {
    throw new FrozenPayloadError("The frozen internal signed-contract copy is invalid.");
  }
}

async function defaultClaim(supabase: SupabaseClient, quoteId?: string) {
  const { data, error } = await supabase.rpc("internal_signed_contract_copy_claim", {
    p_quote_id: quoteId || null,
  });
  if (error) throw new Error(`Internal signed-contract copy claim failed: ${error.message}`);
  return (data || null) as InternalSignedContractCopyClaim | null;
}

async function defaultUpdate(supabase: SupabaseClient, claim: InternalSignedContractCopyClaim, patch: OutboxPatch) {
  const { data, error } = await supabase
    .from("crm_internal_signed_contract_copy_outbox")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", claim.id)
    .eq("lease_token", claim.lease_token)
    .in("status", ["processing", "accepted"])
    .select("id")
    .maybeSingle();
  if (error || !data) {
    throw new Error(`Internal signed-contract copy lease was lost before state could be saved${error?.message ? `: ${error.message}` : "."}`);
  }
}

const defaults: InternalSignedContractCopyDependencies = {
  claim: defaultClaim,
  update: defaultUpdate,
  prepare: prepareCopy,
  send: (payload, timeoutMs = SEND_BUDGET_MS) => sendEmail({ ...payload, signal: AbortSignal.timeout(timeoutMs) }),
  now: () => new Date().toISOString(),
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Internal signed-contract copy failed.";
}

function retryAt(value: string) {
  return new Date(new Date(value).getTime() + RETRY_MINUTES * 60_000).toISOString();
}

export async function processInternalSignedContractCopyOutbox(
  supabase: SupabaseClient,
  options: {
    quoteId?: string;
    limit?: number;
    deadlineMs?: number;
    dependencies?: Partial<InternalSignedContractCopyDependencies>;
  } = {},
) {
  const dependencies = { ...defaults, ...(options.dependencies || {}) };
  const limit = Math.min(Math.max(options.limit || 10, 1), 20);
  const deadline = Date.now() + Math.min(Math.max(options.deadlineMs || 70_000, 1_000), 90_000);
  const errors: string[] = [];
  let processed = 0;

  for (let index = 0; index < limit && Date.now() < deadline - SEND_BUDGET_MS; index += 1) {
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
          payload, recipient: payload.to, idempotency_key: payload.idempotencyKey,
          failure_stage: null, last_error: null,
        });
        claim = { ...claim, payload, recipient: payload.to, idempotency_key: payload.idempotencyKey };
      } else if (claim.idempotency_key !== payload.idempotencyKey || emailAddress(claim.recipient) !== payload.to) {
        throw new FrozenPayloadError("The frozen internal signed-contract copy changed.");
      }

      const attemptAt = dependencies.now();
      stage = "send";
      await dependencies.update(supabase, claim, {
        first_send_attempt_at: claim.first_send_attempt_at || attemptAt,
        failure_stage: "send",
      });
      let result: EmailResult;
      try {
        result = await dependencies.send(payload, Math.max(1_000, Math.min(SEND_BUDGET_MS, deadline - Date.now() - 5_000)));
      } catch (sendError) {
        result = { sent: false, uncertain: true, error: errorText(sendError) };
      }
      if (!result.sent || !result.id) {
        const message = result.error || result.skipped || "The email provider did not accept the internal signed-contract copy.";
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

  return { processed, errors: [...new Set(errors)] };
}
