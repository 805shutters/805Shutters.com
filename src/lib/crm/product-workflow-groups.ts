import { objectMeta } from './measure-needed-state';

export type ProductTargetRecord = { id: string; updatedAt: string; productType?: string };
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
