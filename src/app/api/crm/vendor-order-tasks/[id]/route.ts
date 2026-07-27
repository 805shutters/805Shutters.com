import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";

export const runtime = "nodejs";

type Action = "start" | "review_ready" | "retry" | "confirm" | "cancel";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

const transitions: Record<Action, { from: string[]; to: string }> = {
  start: { from: ["queued", "review_ready"], to: "processing" },
  review_ready: { from: ["processing"], to: "review_ready" },
  retry: { from: ["needs_input", "processing", "review_ready", "failed"], to: "queued" },
  confirm: { from: ["review_ready"], to: "order_confirmed" },
  cancel: { from: ["needs_input", "queued", "processing", "review_ready"], to: "cancelled" },
};

async function syncLegacyMeasureMeta(
  supabase: Awaited<ReturnType<typeof requireCrmUser>>["supabase"],
  formId: string | null,
  externalTaskId: string,
  patch: Record<string, unknown>,
) {
  if (!formId) return;
  const { data: form } = await supabase
    .from("crm_technical_measure_forms")
    .select("meta")
    .eq("id", formId)
    .maybeSingle();
  if (!form) return;
  const meta = object(form.meta);
  const plural = Array.isArray(meta.vendor_order_preparations)
    ? meta.vendor_order_preparations.map((item) => {
        const preparation = object(item);
        return preparation.taskId === externalTaskId ? { ...preparation, ...patch } : item;
      })
    : [];
  const scalar = object(meta.vendor_order_preparation);
  const nextScalar = scalar.taskId === externalTaskId ? { ...scalar, ...patch } : scalar;
  await supabase
    .from("crm_technical_measure_forms")
    .update({
      meta: {
        ...meta,
        vendor_order_preparation: nextScalar,
        vendor_order_preparations: plural,
      },
    })
    .eq("id", formId);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const { id } = await context.params;
    const body = object(await request.json().catch(() => ({})));
    const action = String(body.action || "") as Action;
    const transition = transitions[action];
    if (!transition) throw new CrmAuthError(400, "A valid manufacturer-order action is required.");

    const { data: task, error: readError } = await supabase
      .from("crm_vendor_order_drafts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw new CrmAuthError(502, "The manufacturer task could not be loaded.");
    if (!task) throw new CrmAuthError(404, "The manufacturer task was not found.");
    if (!transition.from.includes(String(task.status))) {
      throw new CrmAuthError(409, `This task cannot move from ${task.status} to ${transition.to}.`);
    }

    const manufacturerOrderRef = typeof body.manufacturerOrderRef === "string"
      ? body.manufacturerOrderRef.trim()
      : "";
    if (action === "confirm" && !manufacturerOrderRef) {
      throw new CrmAuthError(409, "Enter the manufacturer order or confirmation number before confirming.");
    }
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: transition.to,
      message: action === "start"
        ? `${task.manufacturer} portal entry is in progress.`
        : action === "review_ready"
          ? `${task.manufacturer} order is ready for final review and approved submission.`
          : action === "retry"
            ? `${task.manufacturer} order has returned to the ready queue.`
            : action === "cancel"
              ? `${task.manufacturer} order task was cancelled.`
              : `${task.manufacturer} order ${manufacturerOrderRef} was confirmed.`,
    };
    if (action === "start") patch.started_at = now;
    if (action === "review_ready") patch.review_ready_at = now;
    if (action === "confirm") {
      patch.confirmed_at = now;
      patch.confirmed_by = user.id;
      patch.manufacturer_order_ref = manufacturerOrderRef;
      patch.confirmation_url = typeof body.confirmationUrl === "string" ? body.confirmationUrl.trim() || null : null;
      patch.confirmation_notes = typeof body.confirmationNotes === "string" ? body.confirmationNotes.trim() || null : null;
    }

    const { data: updated, error: updateError } = await supabase
      .from("crm_vendor_order_drafts")
      .update(patch)
      .eq("id", id)
      .eq("status", task.status)
      .select("*")
      .maybeSingle();
    if (updateError) throw new CrmAuthError(502, "The manufacturer task could not be updated.");
    if (!updated) throw new CrmAuthError(409, "The manufacturer task changed before this action completed.");

    await syncLegacyMeasureMeta(
      supabase,
      typeof task.technical_measure_form_id === "string" ? task.technical_measure_form_id : null,
      String(task.external_task_id || ""),
      patch,
    );

    if (action === "confirm") {
      const { data: remaining } = await supabase
        .from("crm_vendor_order_drafts")
        .select("id")
        .eq("crm_quote_id", task.crm_quote_id)
        .in("status", ["needs_input", "queued", "processing", "review_ready", "failed"]);
      if (!(remaining || []).length) {
        await Promise.all([
          supabase.from("crm_jobs").update({ status: "ordered" }).eq("id", task.crm_job_id),
          supabase.from("crm_quotes").update({ status: "ordered", ordered_at: now }).eq("id", task.crm_quote_id),
        ]);
      }
    }

    await recordCrmActivity(supabase, { email, userId: user.id }, {
      entityType: "job",
      entityId: task.crm_job_id,
      action: `vendor_order.${action}`,
      metadata: {
        taskId: id,
        externalTaskId: task.external_task_id,
        manufacturer: task.manufacturer,
        status: transition.to,
        manufacturerOrderRef: manufacturerOrderRef || null,
      },
    });
    return NextResponse.json({ task: updated });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
