import { resolveManufacturerOrderForm } from "./vendor-orders/manufacturer-order-form-registry";

export const measureFilters = [
  "need_measure",
  "scheduled",
  "needs_order",
  "archive",
] as const;
export type MeasureFilter = (typeof measureFilters)[number];
export const measureFilterLabels: Record<MeasureFilter, string> = {
  need_measure: "Need Measure",
  scheduled: "Scheduled",
  needs_order: "Needs Order",
  archive: "Archive",
};
export type MeasureOrderGroup = {
  key: string;
  label: string;
  manufacturer: string;
  openingCount: number;
  lineIds: string[];
  ordered: boolean;
  orderedAt: string | null;
};
export type MeasureOrderSummary = {
  groups: MeasureOrderGroup[];
  orderedCount: number;
  totalCount: number;
  label: string;
  error: string | null;
};
export function orderObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
export function measureOrderSummary(
  lines: Array<Record<string, any>>,
  quote: Record<string, any>,
): MeasureOrderSummary {
  const groups = new Map<string, MeasureOrderGroup>();
  const stored = orderObject(orderObject(quote.meta).measure_product_orders);
  const legacyOrdered =
    ["ordered", "received", "installed", "paid_in_full", "completed"].includes(
      quote.status,
    ) || Boolean(quote.ordered_at);
  let error: string | null = lines.length
    ? null
    : "Open this measure and resolve its contract products before recording an order.";
  for (const line of lines) {
    const values = {
      ...orderObject(line.baseline),
      ...orderObject(line.current_values),
    };
    const route = resolveManufacturerOrderForm(values);
    if (!route) {
      error =
        "Open this measure and select the manufacturer and product for every opening before recording orders.";
      continue;
    }
    const group = groups.get(route.routing_key) || {
      key: route.routing_key,
      label: route.product_name,
      manufacturer: route.manufacturer,
      openingCount: 0,
      lineIds: [],
      ordered: false,
      orderedAt: null,
    };
    group.lineIds.push(String(line.id));
    group.openingCount += Math.max(1, Number(values.quantity) || 1);
    groups.set(group.key, group);
  }
  for (const group of groups.values()) {
    const saved = orderObject(stored[group.key]);
    const savedIds = Array.isArray(saved.lineIds) ? saved.lineIds : [];
    // Once granular tracking exists, a later added opening cannot inherit an old whole-quote status.
    group.ordered = Object.keys(stored).length
      ? group.lineIds.every((id) => savedIds.includes(id)) &&
        Boolean(saved.orderedAt)
      : legacyOrdered;
    group.orderedAt = group.ordered
      ? saved.orderedAt || quote.ordered_at || null
      : null;
  }
  const result = [...groups.values()];
  const orderedCount = result.filter((g) => g.ordered).length;
  return {
    groups: result,
    orderedCount,
    totalCount: result.length,
    error,
    label:
      orderedCount === 0
        ? "Not ordered"
        : orderedCount === result.length && !error
          ? `Ordered · ${orderedCount} of ${result.length}`
          : `Partially ordered · ${orderedCount} of ${result.length}`,
  };
}
export function measureFilter(form: Record<string, any>): MeasureFilter {
  const meta = orderObject(form.meta);
  if (meta.archived_at) return "archive";
  const orders = form.productOrders as MeasureOrderSummary | undefined;
  if (form.status === "submitted" || (orders?.orderedCount || 0) > 0)
    return "needs_order";
  if (orderObject(meta.measure_scheduling).status === "scheduled")
    return "scheduled";
  return "need_measure";
}
export function customerProductOrderLabel(meta: unknown): string | null {
  const progress = orderObject(orderObject(meta).measure_order_progress);
  return typeof progress.label === "string" ? progress.label : null;
}
