import { NextRequest, NextResponse } from "next/server";
import { CrmAuthError, crmAuthErrorResponse } from "@/lib/crm/auth";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type Preparation = Record<string, unknown> & {
  manufacturer?: unknown;
  productType?: unknown;
  status?: unknown;
  taskId?: unknown;
  payload?: unknown;
};

const supportedManufacturers = new Set(["Norman", "Onyx", "Lotus"]);

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function preparations(meta: unknown): Preparation[] {
  const source = object(meta);
  if (Array.isArray(source.vendor_order_preparations)) {
    return source.vendor_order_preparations
      .map((item) => object(item) as Preparation)
      .filter((item) => typeof item.taskId === "string");
  }
  const legacy = object(source.vendor_order_preparation) as Preparation;
  return typeof legacy.taskId === "string" ? [legacy] : [];
}

function withPreparation(metaValue: unknown, taskId: string, next: Preparation) {
  const meta = object(metaValue);
  const current = preparations(meta);
  const plural = current.map((item) => item.taskId === taskId ? next : item);
  const legacy = object(meta.vendor_order_preparation) as Preparation;
  return {
    ...meta,
    vendor_order_preparation: legacy.taskId === taskId ? next : meta.vendor_order_preparation,
    vendor_order_preparations: plural,
  };
}

function requireWorkerAccess(request: NextRequest) {
  const secret = (
    process.env.MANUFACTURER_ORDER_WORKER_SECRET
    || process.env.NORMAN_ORDER_WORKER_SECRET
    || ""
  ).trim();
  if (!secret) throw new CrmAuthError(503, "Manufacturer ordering worker is not configured.");
  if ((request.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    throw new CrmAuthError(401, "Manufacturer ordering worker is not authorized.");
  }
}

async function onyxPackets(
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>,
  quoteId: string,
) {
  const { data, error } = await supabase
    .from("crm_customer_contracts")
    .select("meta")
    .eq("external_source", "manufacturer_order_packet")
    .like("external_id", `onyx-order:${quoteId}:%`)
    .order("title");
  if (error) throw new CrmAuthError(502, `Onyx packet read failed: ${error.message}`);
  return (data || [])
    .map((row) => object(object(row.meta).current_packet))
    .filter((packet) => Object.keys(packet).length > 0);
}

async function claimTask(
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>,
  taskId: string,
  requestedManufacturer: string,
) {
  if (!taskId) throw new CrmAuthError(400, "A queued task identifier is required.");
  const { data: durable, error: durableError } = await supabase
    .from("crm_vendor_order_drafts")
    .select("id,external_task_id,technical_measure_form_id,crm_quote_id,manufacturer,product_type,status,payload")
    .eq("external_task_id", taskId)
    .maybeSingle();
  if (durableError) throw new CrmAuthError(502, `Manufacturer task read failed: ${durableError.message}`);
  if (durable) {
    const manufacturer = typeof durable.manufacturer === "string" ? durable.manufacturer : "";
    if (!supportedManufacturers.has(manufacturer)) {
      throw new CrmAuthError(409, "This manufacturer does not have an approved ordering queue.");
    }
    if (requestedManufacturer && manufacturer.toLowerCase() !== requestedManufacturer.toLowerCase()) {
      throw new CrmAuthError(409, "The requested manufacturer does not match the queued order.");
    }
    if (durable.status !== "queued") return null;
    const startedAt = new Date().toISOString();
    const message = `${manufacturer} portal draft entry is in progress.`;
    const { data: claimed, error: claimError } = await supabase
      .from("crm_vendor_order_drafts")
      .update({ status: "processing", started_at: startedAt, message, error_message: null })
      .eq("id", durable.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (claimError) throw new CrmAuthError(502, `Manufacturer queue claim failed: ${claimError.message}`);
    if (!claimed) return null;
    const payload = object(durable.payload);
    return {
      id: taskId,
      record_id: durable.id,
      manufacturer,
      product_type: durable.product_type,
      technical_measure_form_id: durable.technical_measure_form_id,
      payload: manufacturer === "Onyx"
        ? { ...payload, onyxPackets: await onyxPackets(supabase, durable.crm_quote_id) }
        : payload,
    };
  }

  // Compatibility path for tasks created before the durable queue migration.
  const { data, error } = await supabase
    .from("crm_technical_measure_forms")
    .select("id,quote_id,meta,submitted_at,updated_at")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true })
    .limit(500);
  if (error) throw new CrmAuthError(502, `Manufacturer queue read failed: ${error.message}`);

  for (const row of data || []) {
    const current = preparations(row.meta).find((item) => item.taskId === taskId);
    if (!current || current.status !== "queued") continue;
    const manufacturer = typeof current.manufacturer === "string" ? current.manufacturer : "";
    if (!supportedManufacturers.has(manufacturer)) {
      throw new CrmAuthError(409, "This manufacturer does not have an approved ordering queue.");
    }
    if (requestedManufacturer && manufacturer.toLowerCase() !== requestedManufacturer.toLowerCase()) {
      throw new CrmAuthError(409, "The requested manufacturer does not match the queued order.");
    }
    const startedAt = new Date().toISOString();
    const next = {
      ...current,
      status: "processing",
      startedAt,
      message: `${manufacturer} portal draft entry is in progress.`,
    };
    let update = supabase
      .from("crm_technical_measure_forms")
      .update({ meta: withPreparation(row.meta, taskId, next) })
      .eq("id", row.id)
      .eq("status", "submitted");
    if (row.updated_at) update = update.eq("updated_at", row.updated_at);
    const { data: claimed, error: claimError } = await update.select("id").maybeSingle();
    if (claimError) throw new CrmAuthError(502, `Manufacturer queue claim failed: ${claimError.message}`);
    if (!claimed) continue;

    await supabase
      .from("crm_vendor_order_drafts")
      .update({ status: "processing", started_at: startedAt, message: next.message })
      .eq("external_task_id", taskId);

    const payload = object(current.payload);
    return {
      id: taskId,
      manufacturer,
      product_type: current.productType,
      technical_measure_form_id: row.id,
      payload: manufacturer === "Onyx"
        ? { ...payload, onyxPackets: await onyxPackets(supabase, row.quote_id) }
        : payload,
    };
  }
  return null;
}

async function completeTask(
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>,
  body: Record<string, unknown>,
) {
  const recordId = typeof body.recordId === "string" ? body.recordId : "";
  const formId = typeof body.formId === "string" ? body.formId : "";
  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  const status = body.status === "review_ready" || body.status === "failed" ? body.status : "";
  if (!taskId || !status || (!recordId && !formId)) {
    throw new CrmAuthError(400, "A valid queue record, task, and completion status are required.");
  }
  const completedAt = new Date().toISOString();
  const portalDraftId = typeof body.portalDraftId === "string" ? body.portalDraftId : null;
  const screenshotPath = typeof body.screenshotPath === "string" ? body.screenshotPath : null;
  const errorMessage = typeof body.errorMessage === "string" ? body.errorMessage.slice(0, 1000) : "";

  if (recordId) {
    const { data: durable, error: durableReadError } = await supabase
      .from("crm_vendor_order_drafts")
      .select("id,external_task_id,manufacturer,status")
      .eq("id", recordId)
      .eq("external_task_id", taskId)
      .maybeSingle();
    if (durableReadError) throw new CrmAuthError(502, `Manufacturer completion read failed: ${durableReadError.message}`);
    if (!durable) throw new CrmAuthError(404, "Manufacturer order task was not found.");
    if (durable.status !== "processing") {
      throw new CrmAuthError(409, "Manufacturer order task is no longer processing.");
    }
    const manufacturer = typeof durable.manufacturer === "string" ? durable.manufacturer : "Manufacturer";
    const message = status === "review_ready"
      ? `${manufacturer} saved draft is ready for manual review. The order has not been placed.`
      : errorMessage || `${manufacturer} portal entry failed.`;
    const patch = status === "review_ready"
      ? {
          status,
          review_ready_at: completedAt,
          portal_draft_id: portalDraftId,
          screenshot_path: screenshotPath,
          message,
          error_message: null,
        }
      : { status, error_message: errorMessage, message };
    const { data: updated, error: durableUpdateError } = await supabase
      .from("crm_vendor_order_drafts")
      .update(patch)
      .eq("id", recordId)
      .eq("status", "processing")
      .select("id")
      .maybeSingle();
    if (durableUpdateError) throw new CrmAuthError(502, `Manufacturer completion update failed: ${durableUpdateError.message}`);
    if (!updated) throw new CrmAuthError(409, "Manufacturer task completion lost its processing lock.");
    return { status, taskId, recordId };
  }

  const { data: row, error: readError } = await supabase
    .from("crm_technical_measure_forms")
    .select("meta,updated_at")
    .eq("id", formId)
    .maybeSingle();
  if (readError) throw new CrmAuthError(502, `Manufacturer completion read failed: ${readError.message}`);
  if (!row) throw new CrmAuthError(404, "Manufacturer order task was not found.");
  const current = preparations(row.meta).find((item) => item.taskId === taskId);
  if (!current || current.status !== "processing") {
    throw new CrmAuthError(409, "Manufacturer order task is no longer processing.");
  }

  const manufacturer = typeof current.manufacturer === "string" ? current.manufacturer : "Manufacturer";
  const next: Preparation = status === "review_ready"
    ? {
        ...current,
        status,
        reviewReadyAt: completedAt,
        portalDraftId,
        screenshotPath,
        review: object(body.review),
        message: `${manufacturer} saved draft is ready for manual review. The order has not been placed.`,
      }
    : {
        ...current,
        status,
        errorMessage,
        message: errorMessage || `${manufacturer} portal entry failed.`,
      };
  let update = supabase
    .from("crm_technical_measure_forms")
    .update({ meta: withPreparation(row.meta, taskId, next) })
    .eq("id", formId)
    .eq("status", "submitted");
  if (row.updated_at) update = update.eq("updated_at", row.updated_at);
  const { data: updated, error: updateError } = await update.select("id").maybeSingle();
  if (updateError) throw new CrmAuthError(502, `Manufacturer completion update failed: ${updateError.message}`);
  if (!updated) throw new CrmAuthError(409, "Manufacturer task completion lost its processing lock.");

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
      : { status, error_message: errorMessage, message: next.message })
    .eq("external_task_id", taskId);
  return { status, taskId, formId };
}

export async function POST(request: NextRequest) {
  try {
    requireWorkerAccess(request);
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new CrmAuthError(503, "Dedicated Supabase database is not configured.");
    const body = object(await request.json().catch(() => ({})));
    if (body.action === "claim") {
      return NextResponse.json({
        task: await claimTask(
          supabase,
          typeof body.taskId === "string" ? body.taskId : "",
          typeof body.manufacturer === "string" ? body.manufacturer : "",
        ),
      });
    }
    if (body.action === "complete") {
      return NextResponse.json(await completeTask(supabase, body));
    }
    throw new CrmAuthError(400, "Unknown manufacturer worker action.");
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
