import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { sendNormanOrderReviewTelegram } from "@/lib/crm/vendor-orders/order-review-alerts";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type Preparation = Record<string, unknown> & {
  manufacturer?: unknown;
  productType?: unknown;
  status?: unknown;
  taskId?: unknown;
  payload?: unknown;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function preparation(meta: unknown): Preparation {
  return object(object(meta).vendor_order_preparation) as Preparation;
}

function withPreparation(meta: Record<string, unknown>, next: Preparation) {
  const plural = Array.isArray(meta.vendor_order_preparations)
    ? meta.vendor_order_preparations.map((item) => {
        const candidate = object(item);
        return candidate.taskId === next.taskId ? next : item;
      })
    : [next];
  return {
    ...meta,
    vendor_order_preparation: next,
    vendor_order_preparations: plural,
  };
}

function requireWorkerAccess(request: NextRequest) {
  const secret = process.env.NORMAN_ORDER_WORKER_SECRET?.trim();
  if (!secret) throw new CrmAuthError(503, "Norman order worker is not configured.");
  if ((request.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "Norman order worker is not authorized.");
  }
}

async function claimTask(supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>, requestedTaskId: string) {
  let query = supabase
    .from("crm_technical_measure_forms")
    .select("id,meta,submitted_at")
    .eq("status", "submitted")
    .eq("meta->vendor_order_preparation->>manufacturer", "Norman")
    .eq("meta->vendor_order_preparation->>productType", "roller")
    .eq("meta->vendor_order_preparation->>status", "queued")
    .order("submitted_at", { ascending: true })
    .limit(10);
  if (requestedTaskId) query = query.eq("meta->vendor_order_preparation->>taskId", requestedTaskId);
  const { data, error } = await query;
  if (error) throw new CrmAuthError(502, `Norman queue read failed: ${error.message}`);

  for (const row of data || []) {
    const meta = object(row.meta);
    const current = preparation(meta);
    if (typeof current.taskId !== "string" || !current.taskId || !current.payload) continue;
    const startedAt = new Date().toISOString();
    const next = { ...current, status: "processing", startedAt, message: "Norman Roller portal entry is in progress." };
    const { data: claimed, error: claimError } = await supabase
      .from("crm_technical_measure_forms")
      .update({ meta: withPreparation(meta, next) })
      .eq("id", row.id)
      .eq("meta->vendor_order_preparation->>status", "queued")
      .select("id")
      .maybeSingle();
    if (claimError) throw new CrmAuthError(502, `Norman queue claim failed: ${claimError.message}`);
    if (claimed) {
      await supabase
        .from("crm_vendor_order_drafts")
        .update({ status: "processing", started_at: startedAt, message: next.message })
        .eq("external_task_id", current.taskId);
      return {
        id: current.taskId,
        technical_measure_form_id: row.id,
        payload: current.payload,
      };
    }
  }
  return null;
}

async function completeTask(
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>,
  body: Record<string, unknown>,
) {
  const formId = typeof body.formId === "string" ? body.formId : "";
  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  const status = body.status === "review_ready" || body.status === "failed" ? body.status : "";
  if (!formId || !taskId || !status) throw new CrmAuthError(400, "A valid form, task, and completion status are required.");

  const { data: row, error: readError } = await supabase
    .from("crm_technical_measure_forms")
    .select("meta,customer_snapshot,quote_snapshot")
    .eq("id", formId)
    .maybeSingle();
  if (readError) throw new CrmAuthError(502, `Norman completion read failed: ${readError.message}`);
  if (!row) throw new CrmAuthError(404, "Norman measure task was not found.");
  const meta = object(row.meta);
  const current = preparation(meta);
  if (current.taskId !== taskId || current.status !== "processing") {
    throw new CrmAuthError(409, "Norman measure task is no longer processing.");
  }

  const completedAt = new Date().toISOString();
  const portalDraftId = typeof body.portalDraftId === "string" ? body.portalDraftId : null;
  const screenshotPath = typeof body.screenshotPath === "string" ? body.screenshotPath : null;
  const errorMessage = typeof body.errorMessage === "string" ? body.errorMessage.slice(0, 1000) : "";
  const next: Preparation = status === "review_ready"
    ? {
        ...current,
        status,
        reviewReadyAt: completedAt,
        portalDraftId,
        screenshotPath,
        review: object(body.review),
        message: "Norman Roller saved draft is ready for manual review. The order has not been placed.",
      }
    : {
        ...current,
        status,
        errorMessage,
        message: errorMessage || "Norman Roller portal entry failed.",
      };
  const { data: updated, error: updateError } = await supabase
    .from("crm_technical_measure_forms")
    .update({ meta: withPreparation(meta, next) })
    .eq("id", formId)
    .eq("meta->vendor_order_preparation->>status", "processing")
    .eq("meta->vendor_order_preparation->>taskId", taskId)
    .select("id")
    .maybeSingle();
  if (updateError) throw new CrmAuthError(502, `Norman completion update failed: ${updateError.message}`);
  if (!updated) throw new CrmAuthError(409, "Norman measure task completion lost its processing lock.");
  await supabase
    .from("crm_vendor_order_drafts")
    .update(status === "review_ready"
      ? {
          status,
          review_ready_at: completedAt,
          portal_draft_id: portalDraftId,
          screenshot_path: screenshotPath,
          message: next.message,
        }
      : {
          status,
          error_message: errorMessage,
          message: next.message,
        })
    .eq("external_task_id", taskId);

  if (status !== "review_ready") return { status, taskId, formId };

  const payload = object(current.payload);
  const header = object(payload.header);
  const customer = object(row.customer_snapshot);
  const quote = object(row.quote_snapshot);
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const alert = await sendNormanOrderReviewTelegram({
    formId,
    taskId,
    customerName: typeof customer.name === "string" ? customer.name : null,
    quoteNumber: typeof quote.quoteNumber === "string" ? quote.quoteNumber : null,
    poNumber: typeof header.poNumber === "string" ? header.poNumber : null,
    lineCount: lines.length,
    portalDraftId,
  });
  const alertStatus = {
    channel: "telegram",
    status: alert.result.sent ? "sent" : "failed",
    attemptedAt: new Date().toISOString(),
    messageId: alert.result.messageId || null,
    error: alert.result.error || alert.result.skipped || null,
  };
  const alertedPreparation = { ...next, reviewAlert: alertStatus };
  const { error: alertStatusError } = await supabase
    .from("crm_technical_measure_forms")
    .update({ meta: withPreparation(meta, alertedPreparation) })
    .eq("id", formId)
    .eq("meta->vendor_order_preparation->>status", "review_ready")
    .eq("meta->vendor_order_preparation->>taskId", taskId);
  if (alertStatusError) {
    console.error("Norman Telegram alert status could not be recorded", { formId, taskId, error: alertStatusError.message });
  }
  return { status, taskId, formId, alert: alertStatus };
}

export async function POST(request: NextRequest) {
  try {
    requireWorkerAccess(request);
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Dedicated Supabase database is not configured.");
    const body = object(await request.json().catch(() => ({})));
    if (body.action === "claim") {
      const taskId = typeof body.taskId === "string" ? body.taskId : "";
      return NextResponse.json({ task: await claimTask(supabase, taskId) });
    }
    if (body.action === "complete") return NextResponse.json(await completeTask(supabase, body));
    throw new CrmAuthError(400, "Unknown Norman worker action.");
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
