import { productTargetIdentity, type ProductTargetRecord } from './product-workflow-groups';
import { objectMeta } from './measure-needed-state';

export type ProductOrderCost = { amount: number; reference: string; emailId: string | null; records: string[]; at: string; by: string; requestId: string };
export type ProductOrderInvoiceInput = { amount: number; reference: string; emailId?: string; includedInCogs: boolean; expectedUpdatedAt: string; requestId: string };
export function productOrderCosts(meta: unknown): Record<string, ProductOrderCost> {
  const value = objectMeta(objectMeta(meta).product_order_costs);
  return Object.fromEntries(Object.entries(value).filter(([, raw]) => {
    const row = objectMeta(raw);
    return !row.supersededAt && typeof row.amount === 'number' && Number.isFinite(row.amount) && row.amount >= 0 && Array.isArray(row.records);
  })) as Record<string, ProductOrderCost>;
}
export function orderCostKey(records: Pick<ProductTargetRecord, 'id' | 'productType'>[]) { return records.map(productTargetIdentity).sort().join('|'); }
/** Old combined allocations remain in audit history; their total is available to reallocate. */
export function sharedOrderCosts(meta: unknown, records: ProductTargetRecord[]) {
  const key = orderCostKey(records);
  const costs = productOrderCosts(meta);
  if (costs[key]) return {};
  return Object.fromEntries(Object.entries(costs).filter(([otherKey, cost]) => otherKey !== key && cost.records.some(id => records.some(record => record.id === id))));
}
export function availableOrderCost(total: number, meta: unknown, records: ProductTargetRecord[]) {
  const shared = Object.values(sharedOrderCosts(meta, records)).reduce((sum, cost) => sum + cost.amount, 0);
  return Math.max(0, Math.round((total - allocatedOrderCost(meta) + shared) * 100) / 100);
}
export function allocatedOrderCost(meta: unknown) { return Math.round(Object.values(productOrderCosts(meta)).reduce((sum, row) => sum + row.amount, 0) * 100) / 100; }
export function nextProductCogs(total: number, oldAmount: number | undefined, amount: number, included: boolean, allocated: number) {
  if (oldAmount !== undefined) return Math.round((total - oldAmount + amount) * 100) / 100;
  if (included) {
    if (amount > Math.round((total - allocated) * 100) / 100 + .005) throw new Error('This amount exceeds the existing unassigned cost. Refresh or enter it as a new cost.');
    return total;
  }
  return Math.round((total + amount) * 100) / 100;
}
