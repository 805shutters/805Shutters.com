import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSignedContractPdf } from "./signed-contract-pdf";
import { ContractContentError, validateSignedContractSnapshot } from "./signed-contract-snapshot";
export { validateSignedContractSnapshot } from "./signed-contract-snapshot";
import { sendEmail, type EmailAttachment, type EmailResult } from "@/lib/notify/email";
import type { SignedContractSnapshot } from "@/lib/crm/public-quote";

export const CUSTOMER_SIGNED_CONTRACT_FROM = "805 Shutters <805@805shutters.com>";
export const CUSTOMER_SIGNED_CONTRACT_SUBJECT = "Thank you for choosing 805 Shutters — your signed contract";
const PAYLOAD_VERSION = "customer-signed-contract-ui-v2";
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

class FrozenPayloadError extends Error {}

function email(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
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
  const pdf = await buildSignedContractPdf(snapshot, claim.id);
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
