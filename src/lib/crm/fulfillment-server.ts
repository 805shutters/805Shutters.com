import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { CrmAuthError } from "./auth";
import { loadPublicQuoteById } from "./public-quote";
import type { FulfillmentScope } from "./fulfillment";
export async function loadPurchasedFulfillmentScope(
  db: SupabaseClient,
  quoteId: string,
): Promise<FulfillmentScope> {
  const pub = await loadPublicQuoteById(db, quoteId);
  if (!pub) throw new CrmAuthError(404, "Purchased quote not found.");
  const { data: quote, error } = await db
    .from("crm_quotes")
    .select("id,job_id,signed_at")
    .eq("id", quoteId)
    .single();
  if (error || !quote)
    throw new CrmAuthError(502, "Purchased linkage is unavailable.");
  if (!quote.signed_at)
    throw new CrmAuthError(
      409,
      "Verify the signed purchased scope before registering physical quantities.",
    );
  const lines = pub.lines.map((l) => ({
    id: l.id,
    room: l.room,
    quantity: l.quantity,
    productName: l.productName,
    styleName: l.styleName,
    options: l.options,
  }));
  if (
    !lines.length ||
    lines.some((l) => !Number.isSafeInteger(l.quantity) || l.quantity <= 0)
  )
    throw new CrmAuthError(
      409,
      "Purchased opening quantities need verification.",
    );
  return {
    quote_id: quote.id,
    job_id: quote.job_id,
    lines,
    source_revision: createHash("sha256")
      .update(JSON.stringify({ signedAt: quote.signed_at, lines }))
      .digest("hex"),
    verified_at: new Date().toISOString(),
  };
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function saveFulfillment(
  db: SupabaseClient,
  value: unknown,
  actor: string,
) {
  if (!value || typeof value !== "object")
    throw new CrmAuthError(400, "A fulfillment record is required.");
  const input = value as Record<string, unknown>,
    data = (input.payload || {}) as Record<string, unknown>;
  const text = (k: string, max = 2000) =>
    typeof data[k] === "string" ? (data[k] as string).trim().slice(0, max) : "";
  const reference = (k: string, required = false) => {
    const v = text(k);
    if ((required || v) && !uuid.test(v))
      throw new CrmAuthError(400, `Choose a valid ${k.replaceAll("_", " ")}.`);
    return v || null;
  };
  const date = (k: string) => {
    const v = text(k, 10);
    if (
      v &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        !Number.isFinite(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v)
    )
      throw new CrmAuthError(400, "Enter a valid business date.");
    return v || null;
  };
  if (
    !uuid.test(String(input.id)) ||
    !uuid.test(String(input.requestId)) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    Number(input.expectedRevision) < 0
  )
    throw new CrmAuthError(
      400,
      "A record identifier and current revision are required.",
    );
  const reason = text("reason");
  if (!reason)
    throw new CrmAuthError(
      400,
      "Record the evidence or reason for this change.",
    );
  const payload: Record<string, unknown> = {
    quote_id: reference("quote_id", true),
    job_id: reference("job_id", true),
    reason,
  };
  if (input.kind === "line") {
    const scope = await loadPurchasedFulfillmentScope(
      db,
      String(payload.quote_id),
    );
    if (scope.job_id !== payload.job_id)
      throw new CrmAuthError(409, "Quote and job do not match.");
    const source = scope.lines.find((l) => l.id === text("source_line_id"));
    const remake = reference("remake_of");
    const quantity = remake ? Number(data.quantity) : source?.quantity;
    if (
      !source ||
      !Number.isSafeInteger(quantity) ||
      Number(quantity) <= 0 ||
      Number(quantity) > source.quantity
    )
      throw new CrmAuthError(
        400,
        "Choose a purchased opening and valid remake quantity.",
      );
    const state = text("state") || "unprepared";
    if (
      !["unprepared", "submitted", "acknowledged", "canceled"].includes(state)
    )
      throw new CrmAuthError(400, "Choose an order state.");
    if (
      !text("vendor_name") ||
      (["submitted", "acknowledged"].includes(state) &&
        !text("vendor_order_ref"))
    )
      throw new CrmAuthError(400, "Record the vendor and order reference.");
    Object.assign(payload, {
      scope: { quote_id: scope.quote_id, job_id: scope.job_id, source_revision: scope.source_revision, lines: scope.lines },
      source_line_id: source.id,
      quantity,
      remake_of: remake,
      vendor_name: text("vendor_name", 200),
      vendor_order_ref: text("vendor_order_ref", 300),
      state,
      promised_on: date("promised_on"),
      hold_reason: text("hold_reason") || null,
    });
  } else if (input.kind === "movement") {
    if (
      !["shipped", "received", "damaged", "returned"].includes(text("kind")) ||
      !Number.isSafeInteger(data.quantity) ||
      Number(data.quantity) < 0
    )
      throw new CrmAuthError(400, "Choose a movement and whole quantity.");
    if (!text("evidence") || !date("occurred_on"))
      throw new CrmAuthError(
        400,
        "Record the actual date and supporting evidence.",
      );
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (date("occurred_on")! > today)
      throw new CrmAuthError(
        400,
        "Physical movements require an actual date, not a future promise.",
      );
    Object.assign(payload, {
      line_id: reference("line_id", true),
      kind: text("kind"),
      quantity: data.quantity,
      occurred_on: date("occurred_on"),
      evidence: text("evidence"),
      carrier_reference: text("carrier_reference", 300) || null,
      correction_of: reference("correction_of"),
    });
  } else if (input.kind === "visit") {
    const affected = Array.isArray(data.affected_line_ids)
      ? data.affected_line_ids
      : [];
    if (affected.some((id) => typeof id !== "string" || !uuid.test(id)))
      throw new CrmAuthError(400, "Choose valid affected openings.");
    const outcome = text("outcome");
    if (!["planned", "partial", "complete", "canceled"].includes(outcome))
      throw new CrmAuthError(400, "Choose the visit outcome.");
    const owner =
      text("owner", 100) ||
      (Number(input.expectedRevision) === 0 ? "Mike" : "");
    if (!owner) throw new CrmAuthError(400, "Assign a visit owner.");
    if (["complete", "canceled"].includes(outcome) && !text("resolution"))
      throw new CrmAuthError(
        400,
        "Record the resolution or cancellation reason.",
      );
    Object.assign(payload, {
      task_id: reference("task_id"),
      calendar_event_id: reference("calendar_event_id"),
      installer_form_id: reference("installer_form_id"),
      report_revision: data.report_revision || null,
      original_visit_id: reference("original_visit_id"),
      affected_line_ids: affected,
      owner,
      outcome,
      resolution: text("resolution") || null,
    });
  } else throw new CrmAuthError(400, "Unsupported operational record.");
  const { data: saved, error } = await db.rpc("crm_save_fulfillment", {
    p_kind: input.kind,
    p_id: input.id,
    p_expected_revision: input.expectedRevision,
    p_request_id: input.requestId,
    p_payload: payload,
    p_actor: actor,
  });
  if (error)
    throw new CrmAuthError(
      error.message.includes("FULFILLMENT_CONFLICT") ? 409 : 502,
      error.message.includes("FULFILLMENT_CONFLICT")
        ? "This record changed. Review the latest revision before saving."
        : "The record was not saved. Check its exact opening, appointment and report links; your entries are retained.",
    );
  return saved;
}
