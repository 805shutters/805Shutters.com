import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "./auth";
import { objectMeta } from "./measure-needed-state";
import type { CrmCustomerProduct } from "./types";

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
type Input = { step: "ordered" | "shipped"; records: { id: string; updatedAt: string }[]; quoteId?: string; jobId?: string; bookkeepingEntryId?: string };
export function parseProductCompletion(value: unknown): Input {
  const body = value as Partial<Input> | null;
  if (!body || !["ordered", "shipped"].includes(body.step || "") || !Array.isArray(body.records) || !body.records.length || body.records.length > 100) throw new CrmAuthError(400, "Choose a product group and an order or shipment step.");
  if (body.records.some(record => !record || typeof record.id !== "string" || !(uuid.test(record.id) || /^job-product-[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(record.id)) || typeof record.updatedAt !== "string" || !record.updatedAt || !Number.isFinite(Date.parse(record.updatedAt))) || new Set(body.records.map(record => record.id)).size !== body.records.length) throw new CrmAuthError(400, "Refresh to load the original product records.");
  for (const key of ["quoteId", "jobId", "bookkeepingEntryId"] as const) if (body[key] !== undefined && (typeof body[key] !== "string" || !uuid.test(body[key]!))) throw new CrmAuthError(400, "An exact CRM source is required.");
  if (!body.quoteId && !body.bookkeepingEntryId && !body.jobId) throw new CrmAuthError(400, "An exact CRM source is required.");
  const generated = body.records.filter(record => record.id.startsWith("job-product-"));
  if (generated.length && (body.records.length !== 1 || generated[0].id !== `job-product-${body.jobId}`)) throw new CrmAuthError(400, "Refresh to load the exact linked job.");
  return body as Input;
}

export async function completeProductMilestone(supabase: SupabaseClient, value: unknown, actor: { email: string; userId?: string }) {
  const input = parseProductCompletion(value);
  if (input.records[0].id.startsWith("job-product-")) {
    const { data: job, error: loadError } = await supabase.from("crm_jobs").select("*").eq("id", input.jobId!).maybeSingle();
    if (loadError) throw new CrmAuthError(502, "The linked job could not be loaded.");
    if (!job || objectMeta(job.meta).deleted_at) throw new CrmAuthError(404, "The linked job is no longer available.");
    const meta = objectMeta(job.meta);
    const productType = job.product_interest || "Window Treatments";
    const previous = objectMeta(meta.product_workflow_checks);
    const checks = previous.product_type === productType ? previous : {};
    if (objectMeta(checks[input.step]).at) return { recorded: true, step: input.step, productIds: [input.records[0].id] };
    if (job.updated_at !== input.records[0].updatedAt) throw new CrmAuthError(409, "This job changed. Refresh before trying again.");
    // Staff are recording an order that already happened. Readiness gates belong
    // to order submission; recording this fact must not clear or require a measure.
    const at = new Date().toISOString();
    const next = { ...meta, product_workflow_checks: { ...checks, product_type: productType, [input.step]: { at, by: actor.email, user_id: actor.userId || null, source: "staff_job_status" } } };
    const { data: saved, error: saveError } = await supabase.from("crm_jobs").update({ meta: next }).eq("id", job.id).eq("updated_at", job.updated_at).select("id").maybeSingle();
    if (saveError) throw new CrmAuthError(502, "The manual status could not be saved. Try again.");
    if (!saved) throw new CrmAuthError(409, "The job changed before the check could be saved. Refresh and try again.");
    return { recorded: true, step: input.step, productIds: [input.records[0].id] };
  }
  const { data, error } = await supabase.from("crm_customer_products").select("*").in("id", input.records.map(record => record.id));
  if (error) throw new CrmAuthError(502, "Product records could not be loaded.");
  const products = (data || []) as CrmCustomerProduct[];
  if (products.length !== input.records.length || products.some(product => objectMeta(product.meta).deleted_at)) throw new CrmAuthError(404, "A product was removed. Refresh the job before updating.");
  if (products.some(product => product.bookkeeping_entry_id ? product.bookkeeping_entry_id !== input.bookkeepingEntryId : product.quote_id ? product.quote_id !== input.quoteId : !product.job_id || product.job_id !== input.jobId) || new Set(products.map(product => product.product_type.trim().toLowerCase())).size !== 1) throw new CrmAuthError(409, "These products do not belong to the selected job and product type.");
  const done = (product: CrmCustomerProduct) => input.step === "ordered" ? Boolean(objectMeta(product.meta).ordered_at || product.status?.toLowerCase() === "ordered") : Boolean(objectMeta(product.meta).shipped_at || objectMeta(product.meta).received_at || ["shipped", "received", "delivered"].includes((product.status || "").toLowerCase()));
  for (const product of products) if (!done(product) && product.updated_at !== input.records.find(record => record.id === product.id)!.updatedAt) throw new CrmAuthError(409, "This product changed. Refresh before trying again.");
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
    for (const id of jobIds) {
      await parent("crm_jobs", id);
    }
  }
  const at = new Date().toISOString();
  for (const product of products) {
    if (done(product)) continue;
    const meta = objectMeta(product.meta);
    const next = { ...meta, [`${input.step}_at`]: at, workflow_checks: { ...objectMeta(meta.workflow_checks), [input.step]: { at, by: actor.email, user_id: actor.userId || null, source: "staff_job_status" } } };
    const { data: saved, error: saveError } = await supabase.from("crm_customer_products").update({ meta: next }).eq("id", product.id).eq("updated_at", product.updated_at).select("id").maybeSingle();
    if (saveError) throw new CrmAuthError(502, "The manual status could not be saved. Refresh to see any completed updates before retrying.");
    if (!saved) throw new CrmAuthError(409, "Not all products could be saved. Refresh to see any completed updates before retrying.");
  }
  return { recorded: true, step: input.step, productIds: products.map(product => product.id) };
}
