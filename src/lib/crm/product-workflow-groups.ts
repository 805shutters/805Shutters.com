import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmAuthError } from './auth';
import { objectMeta } from './measure-needed-state';

export type ProductTargetRecord = { id: string; updatedAt: string; productType?: string };
/** A product can carry both the quote and its cost-entry link. Neither link is a sibling sale. */
export function productBelongsToSale(
  product: { quote_id?: string | null; bookkeeping_entry_id?: string | null; job_id?: string | null },
  target: { quoteId?: string; bookkeepingEntryId?: string; jobId?: string },
) {
  if (target.jobId && product.job_id && product.job_id !== target.jobId) return false;
  if (target.bookkeepingEntryId && product.bookkeeping_entry_id && product.bookkeeping_entry_id !== target.bookkeepingEntryId) return false;
  if (product.quote_id) return product.quote_id === target.quoteId;
  if (product.bookkeeping_entry_id) return product.bookkeeping_entry_id === target.bookkeepingEntryId;
  return Boolean(product.job_id && product.job_id === target.jobId);
}
/** Verify dual links before any cost or milestone write, including shipments. */
export async function verifyProductSaleLinks(db: SupabaseClient, products: { quote_id?: string | null; bookkeeping_entry_id?: string | null; job_id?: string | null }[]) {
  const entries = new Map<string, { quote_id?: string | null; job_id?: string | null }>();
  for (const product of products) {
    if (!product.bookkeeping_entry_id) continue;
    let entry = entries.get(product.bookkeeping_entry_id);
    if (!entry) {
      const { data, error } = await db.from('crm_quote_bookkeeping_entries').select('quote_id,job_id,meta').eq('id', product.bookkeeping_entry_id).maybeSingle();
      if (error || !data || objectMeta(data.meta).deleted_at || objectMeta(data.meta).bookkeeping_deleted_at) throw new CrmAuthError(409, 'The product financial link could not be verified.');
      entry = data; entries.set(product.bookkeeping_entry_id, data);
    }
    if ((product.quote_id && entry!.quote_id !== product.quote_id) || (product.job_id && entry!.job_id && entry!.job_id !== product.job_id)) throw new CrmAuthError(409, 'The product financial link belongs to another sale.');
  }
}
export const normalizedProductLabel = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

/** A legacy row may describe several products. Never copy its shared checks to each part. */
export function splitProductTypes(value: string): string[] {
  return [...new Map(value.split(/\s*(?:,|;|\+|&|\band\b)\s*/i).map(name => name.trim().replace(/\s+/g, ' ')).filter(Boolean).map(name => [normalizedProductLabel(name), name])).values()];
}

export function productTargetIdentity(record: Pick<ProductTargetRecord, 'id' | 'productType'>) {
  return record.productType ? `${record.id}#product:${encodeURIComponent(normalizedProductLabel(record.productType))}` : record.id;
}

export function validProductTarget(productType: string, target: ProductTargetRecord) {
  const types = splitProductTypes(productType);
  return types.length > 1
    ? Boolean(target.productType && types.some(type => normalizedProductLabel(type) === target.productType))
    : target.productType === undefined;
}

export function scopedProductMeta(meta: unknown, target: ProductTargetRecord): Record<string, unknown> {
  return target.productType ? objectMeta(objectMeta(objectMeta(meta).product_type_workflow)[target.productType]) : objectMeta(meta);
}

export function withScopedProductMeta(meta: unknown, target: ProductTargetRecord, next: Record<string, unknown>) {
  return target.productType ? { ...objectMeta(meta), product_type_workflow: { ...objectMeta(objectMeta(meta).product_type_workflow), [target.productType]: next } } : next;
}

export function productManufacturerKey(product: { supplier?: string | null }) {
  return normalizedProductLabel(product.supplier || '');
}
