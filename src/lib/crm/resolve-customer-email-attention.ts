import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
import { customerEmailNeedsAttention, customerEmailStatus, type CustomerEmailRecord } from "./customer-email-status";

const TABLE = "crm_customer_signed_contract_email_outbox";
const READ_FIELDS = "id,status,delivery_status,delivery_error,created_at,attention_resolved_at,attention_resolved_by,attention_resolved_note";
const NOTE_LIMIT = 500;

type AttentionRow = Pick<CustomerEmailRecord, "id" | "status" | "delivery_status" | "delivery_error" | "created_at" | "attention_resolved_at" | "attention_resolved_by" | "attention_resolved_note">;

export type ResolvedCustomerEmailAttention = {
  ok: true;
  idempotent: boolean;
  id: string;
  attention_resolved_at: string;
  attention_resolved_by: string | null;
  attention_resolved_note: string | null;
};

function cleanNote(note: unknown) {
  if (note == null || note === "") return null;
  if (typeof note !== "string") throw new CrmAuthError(400, "The handling note must be text.");
  const trimmed = note.trim();
  if (!trimmed) return null;
  if (trimmed.length > NOTE_LIMIT) throw new CrmAuthError(400, "The handling note is too long.");
  return trimmed;
}

function resolved(row: AttentionRow, idempotent: boolean): ResolvedCustomerEmailAttention {
  return {
    ok: true,
    idempotent,
    id: row.id,
    attention_resolved_at: row.attention_resolved_at || "",
    attention_resolved_by: row.attention_resolved_by ?? null,
    attention_resolved_note: row.attention_resolved_note ?? null,
  };
}

/** Records that staff handled one attention row. Does not send, claim, retry, or enqueue mail. */
export async function resolveCustomerEmailAttention(
  db: SupabaseClient,
  input: { id: string; note?: unknown; actor: string; now?: number },
) {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.id)) {
    throw new CrmAuthError(400, "Customer email id is required.");
  }
  const actor = input.actor.trim();
  if (!actor) throw new CrmAuthError(400, "A signed-in CRM user is required.");
  const note = cleanNote(input.note);
  const now = input.now ?? Date.now();

  const { data, error } = await db.from(TABLE).select(READ_FIELDS).eq("id", input.id).maybeSingle();
  if (error) throw new CrmAuthError(503, "Customer email could not be read.");
  const row = data as AttentionRow | null;
  if (!row) throw new CrmAuthError(404, "Customer email was not found.");
  if (row.attention_resolved_at) return resolved(row, true);
  if (customerEmailStatus(row) === "Delivered") throw new CrmAuthError(409, "This email is already delivered.");
  if (!customerEmailNeedsAttention(row, now)) throw new CrmAuthError(409, "This email is not in an attention state.");

  const patch: { attention_resolved_at: string; attention_resolved_by: string; attention_resolved_note: string | null } = {
    attention_resolved_at: new Date(now).toISOString(),
    attention_resolved_by: actor,
    attention_resolved_note: note,
  };
  const { data: saved, error: saveError } = await db.from(TABLE).update(patch).eq("id", row.id).is("attention_resolved_at", null)
    .select("id,attention_resolved_at,attention_resolved_by,attention_resolved_note").maybeSingle();
  if (saveError) throw new CrmAuthError(503, "Customer email attention could not be recorded.");
  if (saved) return { ok: true as const, idempotent: false, ...(saved as AttentionRow) };
  const { data: current, error: rereadError } = await db.from(TABLE).select(READ_FIELDS).eq("id", row.id).maybeSingle();
  const latest = current as AttentionRow | null;
  if (rereadError || !latest?.attention_resolved_at) throw new CrmAuthError(409, "Customer email attention changed before it could be recorded.");
  return resolved(latest, true);
}
