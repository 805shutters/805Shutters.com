import { validProductTarget, scopedProductMeta, withScopedProductMeta, productManufacturerKey, normalizedProductLabel, type ProductTargetRecord } from './product-workflow-groups';
import { contractHeaderProducts } from "./contract-header-products";
import { isShipmentEvidence, type ShipmentEvidence } from "./shipment-evidence";
import { losAngelesDateString } from "@/lib/booking/availability";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
import { objectMeta } from "./measure-needed-state";
import type { CrmCustomerProduct } from "./types";
import { parseWholeJobRecordId, wholeJobWorkflowChecks, type WholeJobRecord } from "./whole-job-workflow";

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export type ProductCompletionInput = { shipment?: ShipmentEvidence; step: "ordered" | "shipped"; records: ProductTargetRecord[]; quoteId?: string; jobId?: string; bookkeepingEntryId?: string };

export function parseProductCompletion(value: unknown): ProductCompletionInput {
  const body = value as Partial<ProductCompletionInput> | null;
  if (!body || !["ordered", "shipped"].includes(body.step || "") || !Array.isArray(body.records) || !body.records.length || body.records.length > 100) throw new CrmAuthError(400, "Choose a product group and an order or shipment step.");
  if (body.records.some(record => !record || typeof record.id !== "string" || !(uuid.test(record.id) || /^job-product-[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(record.id) || parseWholeJobRecordId(record.id)) || typeof record.updatedAt !== "string" || !record.updatedAt || !Number.isFinite(Date.parse(record.updatedAt))) || new Set(body.records.map(record => record.id)).size !== body.records.length) throw new CrmAuthError(400, "Refresh to load the original product records.");
  if (body.records.some(record => record.productType !== undefined && (typeof record.productType !== "string" || !record.productType || record.productType.length > 150 || normalizedProductLabel(record.productType) !== record.productType))) throw new CrmAuthError(400, "Choose one exact product type.");
  for (const key of ["quoteId", "jobId", "bookkeepingEntryId"] as const) if (body[key] !== undefined && (typeof body[key] !== "string" || !uuid.test(body[key]!))) throw new CrmAuthError(400, "An exact CRM source is required.");
  if (!body.quoteId && !body.bookkeepingEntryId && !body.jobId) throw new CrmAuthError(400, "An exact CRM source is required.");
  const generated = body.records.filter(record => record.id.startsWith("job-product-"));
  if (generated.length && (body.records.length !== 1 || generated[0].id !== `job-product-${body.jobId}`)) throw new CrmAuthError(400, "Refresh to load the exact linked job.");
  const wholeJob = body.records.map(record => parseWholeJobRecordId(record.id)).filter(Boolean) as WholeJobRecord[];
  if (wholeJob.length && (body.records.length !== 1 || wholeJob.length !== 1 ||
    (wholeJob[0].kind === "job" && (body.jobId !== wholeJob[0].id || body.quoteId || body.bookkeepingEntryId)) ||
    (wholeJob[0].kind === "quote" && (body.quoteId !== wholeJob[0].id || body.bookkeepingEntryId)) ||
    (wholeJob[0].kind === "bookkeeping" && body.bookkeepingEntryId !== wholeJob[0].id))) throw new CrmAuthError(400, "Refresh to load the exact linked source.");
  if (body.shipment !== undefined && (body.step !== "shipped" || !isShipmentEvidence(body.shipment) || body.shipment.shippedOn > losAngelesDateString(new Date()) || body.records.some(record => !uuid.test(record.id) && !(parseWholeJobRecordId(record.id) && record.productType)))) throw new CrmAuthError(400, "Use a confirmed shipment date, the 805 shipping mailbox, and exact product records.");
  return { ...body, ...(body.shipment ? { shipment: { shippedOn: body.shipment.shippedOn, mailbox: body.shipment.mailbox, messageId: body.shipment.messageId, orderReference: body.shipment.orderReference.trim() } } : {}) } as ProductCompletionInput;
}

export async function loadWholeJobCompletionParent(supabase: SupabaseClient, input: ProductCompletionInput) {
  const target = parseWholeJobRecordId(input.records[0].id);
  if (!target) return null;
  const table = target.kind === "job" ? "crm_jobs" : target.kind === "quote" ? "crm_quotes" : "crm_quote_bookkeeping_entries";
  const { data: row, error } = await supabase.from(table).select("*").eq("id", target.id).maybeSingle();
  if (error) throw new CrmAuthError(502, "The linked source could not be loaded.");
  if (!row || objectMeta(row.meta).deleted_at || objectMeta(row.meta).bookkeeping_deleted_at) throw new CrmAuthError(404, "The linked source is no longer available.");
  if ((target.kind === "quote" && input.jobId && row.job_id !== input.jobId) ||
    (target.kind === "bookkeeping" && ((input.quoteId && row.quote_id !== input.quoteId) || (input.jobId && row.job_id !== input.jobId)))) throw new CrmAuthError(409, "The source does not belong to the selected job.");
  if (input.records[0].productType) {
    const field = target.kind === "quote" ? "quote_id" : target.kind === "bookkeeping" ? "bookkeeping_entry_id" : "job_id";
    const { data: contracts, error: contractError } = await supabase.from("crm_customer_contracts").select("*").eq(field, target.id);
    if (contractError) throw new CrmAuthError(502, "The signed product details could not be loaded.");
    let quote;
    if (target.kind === "quote" || row.quote_id) {
      const quoteId = target.kind === "quote" ? target.id : row.quote_id;
      const { data: loaded, error: quoteError } = await supabase.from("crm_quotes").select("*, lineItems:crm_quote_line_items(*, designs:crm_quote_designs!crm_quote_designs_line_item_id_fkey(*))").eq("id", quoteId).maybeSingle();
      if (quoteError || !loaded) throw new CrmAuthError(409, "The accepted quote could not be verified.");
      quote = loaded;
    }
    const exactContracts = (contracts || []).filter(contract => target.kind === "bookkeeping" || (!contract.bookkeeping_entry_id && (target.kind === "quote" || !contract.quote_id)));
    const evidence = contractHeaderProducts({ quote, contracts: exactContracts });
    if (!evidence.products.some(product => normalizedProductLabel(product.name) === input.records[0].productType)) throw new CrmAuthError(409, "This product is not in the signed sale. Refresh the job.");
  }
  return { target, table, row };
}

export async function completeProductMilestone(supabase: SupabaseClient, value: unknown, actor: { email: string; userId?: string }) {
  const input = parseProductCompletion(value);
  const wholeJob = await loadWholeJobCompletionParent(supabase, input);
  if (wholeJob) {
    const meta = objectMeta(wholeJob.row.meta);
    const target = input.records[0];
    const scoped = scopedProductMeta(meta, target);
    const checks = target.productType ? objectMeta(scoped.workflow_checks) : wholeJobWorkflowChecks(meta);
    const priorShipment = objectMeta(scoped.shipping_confirmation);
    if (input.shipment && priorShipment.shippedOn && (priorShipment.shippedOn !== input.shipment.shippedOn || priorShipment.orderReference !== input.shipment.orderReference)) throw new CrmAuthError(409, "A different shipment is already recorded. Review the source before changing it.");
    if (objectMeta(checks[input.step]).at && (!input.shipment || priorShipment.shippedOn)) return { recorded: true, step: input.step, productIds: [target.id] };
    if (wholeJob.row.updated_at !== input.records[0].updatedAt) throw new CrmAuthError(409, "This source changed. Refresh before trying again.");
    const at = new Date().toISOString();
    const check = { at, by: actor.email, user_id: actor.userId || null, source: input.shipment ? "shipping_email" : "staff_job_status" };
    const next = target.productType
      ? withScopedProductMeta(meta, target, { ...scoped, [`${input.step}_at`]: scoped[`${input.step}_at`] || at,
        ...(input.shipment ? { shipping_confirmation: { ...input.shipment, recordedAt: at, recordedBy: actor.email } } : {}),
        workflow_checks: { ...checks, [input.step]: objectMeta(checks[input.step]).at ? checks[input.step] : check } })
      : { ...meta, whole_job_workflow_checks: { ...checks, [input.step]: check } };
    const { data: saved, error } = await supabase.from(wholeJob.table).update({ meta: next }).eq("id", wholeJob.target.id).eq("updated_at", wholeJob.row.updated_at).select("id").maybeSingle();
    if (error) throw new CrmAuthError(502, "The manual status could not be saved. Try again.");
    if (!saved) throw new CrmAuthError(409, "The source changed before the check could be saved. Refresh and try again.");
    return { recorded: true, step: input.step, productIds: [input.records[0].id] };
  }
  if (input.records[0].id.startsWith("job-product-")) {
    const { data: job, error: loadError } = await supabase.from("crm_jobs").select("*").eq("id", input.jobId!).maybeSingle();
    if (loadError) throw new CrmAuthError(502, "The linked job could not be loaded.");
    if (!job || objectMeta(job.meta).deleted_at) throw new CrmAuthError(404, "The linked job is no longer available.");
    const meta = objectMeta(job.meta);
    const productType = typeof job.product_interest === "string" ? job.product_interest.trim() : "";
    if (!productType) throw new CrmAuthError(409, "This job has no product details. Refresh and use the whole-job check.");
    if (!validProductTarget(productType, input.records[0])) throw new CrmAuthError(409, "Choose a separate check for each product type.");
    const scoped = scopedProductMeta(meta, input.records[0]);
    const previous = input.records[0].productType ? objectMeta(scoped.workflow_checks) : objectMeta(meta.product_workflow_checks);
    const checks = input.records[0].productType || previous.product_type === productType ? previous : {};
    if (objectMeta(checks[input.step]).at) return { recorded: true, step: input.step, productIds: [input.records[0].id] };
    if (job.updated_at !== input.records[0].updatedAt) throw new CrmAuthError(409, "This job changed. Refresh before trying again.");
    // Staff are recording an order that already happened. Readiness gates belong
    // to order submission; recording this fact must not clear or require a measure.
    const at = new Date().toISOString();
    const check = { at, by: actor.email, user_id: actor.userId || null, source: "staff_job_status" };
    const next = input.records[0].productType
      ? withScopedProductMeta(meta, input.records[0], { ...scoped, [`${input.step}_at`]: at, workflow_checks: { ...checks, [input.step]: check } })
      : { ...meta, product_workflow_checks: { ...checks, product_type: productType, [input.step]: check } };
    const { data: saved, error: saveError } = await supabase.from("crm_jobs").update({ meta: next }).eq("id", job.id).eq("updated_at", job.updated_at).select("id").maybeSingle();
    if (saveError) throw new CrmAuthError(502, "The manual status could not be saved. Try again.");
    if (!saved) throw new CrmAuthError(409, "The job changed before the check could be saved. Refresh and try again.");
    return { recorded: true, step: input.step, productIds: [input.records[0].id] };
  }
  const { data, error } = await supabase.from("crm_customer_products").select("*").in("id", input.records.map(record => record.id));
  if (error) throw new CrmAuthError(502, "Product records could not be loaded.");
  const products = (data || []) as CrmCustomerProduct[];
  if (products.length !== input.records.length || products.some(product => objectMeta(product.meta).deleted_at)) throw new CrmAuthError(404, "A product was removed. Refresh the job before updating.");
  if (products.some(product => product.bookkeeping_entry_id ? product.bookkeeping_entry_id !== input.bookkeepingEntryId : product.quote_id ? product.quote_id !== input.quoteId : !product.job_id || product.job_id !== input.jobId) || products.some(product => !validProductTarget(product.product_type, input.records.find(record => record.id === product.id)!)) || new Set(products.map(product => JSON.stringify([input.records.find(record => record.id === product.id)!.productType || normalizedProductLabel(product.product_type), productManufacturerKey(product)]))).size !== 1) throw new CrmAuthError(409, "These products do not belong to the selected job and product type.");
  const targetFor = (product: CrmCustomerProduct) => input.records.find(record => record.id === product.id)!;
  const metaFor = (product: CrmCustomerProduct) => scopedProductMeta(product.meta, targetFor(product));
  const done = (product: CrmCustomerProduct) => {
    const meta = metaFor(product), status = targetFor(product).productType ? "" : (product.status || "").toLowerCase();
    return input.step === "ordered" ? Boolean(meta.ordered_at || status === "ordered") : Boolean(meta.shipped_at || meta.received_at || ["shipped", "received", "delivered"].includes(status));
  };
  const needsWrite = (product: CrmCustomerProduct) => {
    if (!input.shipment) return !done(product);
    const prior = objectMeta(metaFor(product).shipping_confirmation);
    if (prior.shippedOn && (prior.shippedOn !== input.shipment.shippedOn || prior.orderReference !== input.shipment.orderReference)) throw new CrmAuthError(409, "A different shipment is already recorded. Review the source before changing it.");
    return !prior.shippedOn;
  };
  for (const product of products) if (needsWrite(product) && product.updated_at !== input.records.find(record => record.id === product.id)!.updatedAt) throw new CrmAuthError(409, "This product changed. Refresh before trying again.");
  // Verify linked records without applying order-submission prerequisites.
  // A manual completion records an existing order; it does not place one.
  if (input.step === "ordered") {
    const jobIds = new Set<string>();
    const quoteIds = new Set<string>();
    const entryIds = new Set<string>();
    for (const product of products.filter(product => !done(product))) {
      if (product.job_id) jobIds.add(product.job_id);
      if (product.quote_id) quoteIds.add(product.quote_id);
      if (product.bookkeeping_entry_id) entryIds.add(product.bookkeeping_entry_id);
    }
    async function parent(table: string, id: string) {
      const { data: row, error: loadError } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
      if (loadError || !row || objectMeta(row.meta).deleted_at) throw new CrmAuthError(409, "The source job could not be verified. Refresh before ordering.");
      return row;
    }
    for (const id of entryIds) {
      const entry = await parent("crm_quote_bookkeeping_entries", id);
      if (entry.job_id) jobIds.add(entry.job_id);
      if (entry.quote_id) quoteIds.add(entry.quote_id);
    }
    for (const id of quoteIds) {
      const quote = await parent("crm_quotes", id);
      if (quote.job_id) jobIds.add(quote.job_id);
    }
    for (const id of jobIds) await parent("crm_jobs", id);
  }
  const at = new Date().toISOString();
  for (const product of products) {
    if (!needsWrite(product)) continue;
    const meta = metaFor(product);
    const next = { ...meta, ...(input.shipment ? { shipping_confirmation: { ...input.shipment, recordedAt: at, recordedBy: actor.email } } : {}), [`${input.step}_at`]: meta[`${input.step}_at`] || at, workflow_checks: { ...objectMeta(meta.workflow_checks), [input.step]: objectMeta(objectMeta(meta.workflow_checks)[input.step]).at ? objectMeta(meta.workflow_checks)[input.step] : { at, by: actor.email, user_id: actor.userId || null, source: input.shipment ? "shipping_email" : "staff_job_status" } } };
    const { data: saved, error: saveError } = await supabase.from("crm_customer_products").update({ meta: withScopedProductMeta(product.meta, targetFor(product), next) }).eq("id", product.id).eq("updated_at", product.updated_at).select("id").maybeSingle();
    if (saveError) throw new CrmAuthError(502, "The manual status could not be saved. Refresh to see any completed updates before retrying.");
    if (!saved) throw new CrmAuthError(409, "Not all products could be saved. Refresh to see any completed updates before retrying.");
  }
  return { recorded: true, step: input.step, productIds: products.map(product => product.id) };
}
