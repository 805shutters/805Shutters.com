import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
export type OwnedAction = {
  id: string;
  job_id: string | null;
  quote_id: string | null;
  bookkeeping_entry_id: string | null;
  task_type: string;
  title: string;
  owner: string;
  status: "open" | "blocked" | "done" | "canceled";
  due_on: string | null;
  due_at?: string | null;
  blocker: string | null;
  waiting_since: string | null;
  resolution: string | null;
  order_reference: string | null;
  notes: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  meta?: Record<string, unknown>;
};
export type OwnedActionChange = {
  id: string;
  expectedRevision: number;
  requestId: string;
  action: Partial<OwnedAction> & { change_reason?: string };
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function normalizeOwnedActionChange(input: OwnedActionChange) {
  if (
    !uuid.test(input.id) ||
    !uuid.test(input.requestId) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  )
    throw new CrmAuthError(400, "Action identifier and revision are required.");
  const a = input.action || {};
  const text = (value: unknown, max = 2000) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";
  const reference = (value: unknown) => {
    if (!value) return null;
    if (typeof value !== "string" || !uuid.test(value))
      throw new CrmAuthError(400, "Invalid linked record.");
    return value;
  };
  const status = a.status || "open";
  if (!["open", "blocked", "done", "canceled"].includes(status))
    throw new CrmAuthError(400, "Choose a valid action status.");
  const title = text(a.title, 300),
    owner = text(a.owner, 100) || (input.expectedRevision === 0 ? "Mike" : "");
  if (!title || !owner)
    throw new CrmAuthError(400, "Enter an action and owner.");
  const due = text(a.due_on, 10);
  if (
    due &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(due) ||
      !Number.isFinite(Date.parse(due + "T12:00:00Z")) ||
      new Date(due + "T12:00:00Z").toISOString().slice(0, 10) !== due)
  )
    throw new CrmAuthError(400, "Enter a valid due date.");
  const blocker = text(a.blocker),
    resolution = text(a.resolution),
    reason = text(a.change_reason);
  if (status === "blocked" && !blocker)
    throw new CrmAuthError(400, "Describe the blocker.");
  if (["done", "canceled"].includes(status) && !resolution)
    throw new CrmAuthError(
      400,
      "Record the resolution or cancellation reason.",
    );
  if (input.expectedRevision > 0 && !reason)
    throw new CrmAuthError(400, "Record why the action changed.");
  const payload = {
    job_id: reference(a.job_id),
    quote_id: reference(a.quote_id),
    bookkeeping_entry_id: reference(a.bookkeeping_entry_id),
    task_type:
      input.expectedRevision === 0
        ? "operational_action"
        : text(a.task_type, 60) || "operational_action",
    title,
    owner,
    status,
    due_on: due || null,
    blocker: blocker || null,
    resolution: resolution || null,
    notes: text(a.notes, 4000) || null,
    order_reference: text(a.order_reference, 300) || null,
    change_reason: reason || "Action created",
  };
  if (!payload.job_id && !payload.quote_id && !payload.bookkeeping_entry_id)
    throw new CrmAuthError(400, "Link the action to an exact job or order.");
  return payload;
}
export async function saveOwnedAction(
  supabase: SupabaseClient,
  input: OwnedActionChange,
  actor: string,
) {
  const payload = normalizeOwnedActionChange(input);
  const { data, error } = await supabase.rpc("crm_save_owned_action", {
    p_id: input.id,
    p_expected_revision: input.expectedRevision,
    p_request_id: input.requestId,
    p_payload: payload,
    p_actor: actor,
  });
  if (error)
    throw new CrmAuthError(
      error.message.includes("ACTION_CONFLICT") ? 409 : 502,
      error.message.includes("ACTION_CONFLICT")
        ? "This action changed. Refresh and review the latest revision before saving."
        : "The action was not saved. Your entries are retained; check the linked records and try again.",
    );
  return data as OwnedAction;
}
export function actionsForIdentity(
  actions: OwnedAction[],
  identity: {
    jobId: string | null;
    quoteId: string | null;
    bookkeepingId: string | null;
  },
) {
  return actions.filter((a) =>
    a.quote_id
      ? a.quote_id === identity.quoteId
      : a.bookkeeping_entry_id
        ? a.bookkeeping_entry_id === identity.bookkeepingId
        : a.job_id === identity.jobId && Boolean(identity.jobId),
  );
}
