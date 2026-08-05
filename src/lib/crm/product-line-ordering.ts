import type { QuoteStatus } from "@mts/types/quote";

export type ProductLineOrderStatus = "outstanding" | "ordered" | "confirmed";

export interface ProductLineOrderEvent {
  entity_id: string | null;
  action: string;
  created_at: string;
  after_data?: Record<string, unknown> | null;
}

export interface ProductLineOrderState {
  id: string;
  roomName: string;
  productType: string;
  sortOrder: number;
  orderStatus: ProductLineOrderStatus;
  orderedAt: string | null;
  confirmedAt: string | null;
  manufacturerOrderRef: string | null;
}

interface ProductLine {
  id: string;
  room_name: string;
  product_type: string;
  sort_order: number;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isLegacyFullyOrdered(status: QuoteStatus) {
  return status === "ordered" || status === "received" || status === "installed";
}

export function resolveProductLineOrderStates({
  lines,
  events,
  quoteStatus,
  quoteOrderedAt,
  quoteOrderRef,
}: {
  lines: ProductLine[];
  events: ProductLineOrderEvent[];
  quoteStatus: QuoteStatus;
  quoteOrderedAt: string | null;
  quoteOrderRef: string | null;
}): ProductLineOrderState[] {
  const latestEventByLine = new Map<string, ProductLineOrderEvent>();

  for (const event of events) {
    if (!event.entity_id) continue;
    const previous = latestEventByLine.get(event.entity_id);
    if (!previous || event.created_at > previous.created_at) {
      latestEventByLine.set(event.entity_id, event);
    }
  }

  return [...lines]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((line) => {
      const event = latestEventByLine.get(line.id);
      const after = event?.after_data || {};
      const eventStatus = stringValue(after.orderStatus);
      const orderStatus: ProductLineOrderStatus =
        eventStatus === "confirmed" || event?.action === "sales_quote_line.confirmed"
          ? "confirmed"
          : eventStatus === "ordered" || event?.action === "sales_quote_line.ordered"
            ? "ordered"
            : isLegacyFullyOrdered(quoteStatus)
              ? "ordered"
              : "outstanding";

      return {
        id: line.id,
        roomName: line.room_name,
        productType: line.product_type,
        sortOrder: line.sort_order,
        orderStatus,
        orderedAt:
          stringValue(after.orderedAt) ||
          (orderStatus !== "outstanding" ? quoteOrderedAt || event?.created_at || null : null),
        confirmedAt: stringValue(after.confirmedAt),
        manufacturerOrderRef:
          stringValue(after.manufacturerOrderRef) ||
          (event ? null : isLegacyFullyOrdered(quoteStatus) ? quoteOrderRef : null),
      };
    });
}

export function deriveQuoteOrderPatch(
  quoteStatus: QuoteStatus,
  states: ProductLineOrderState[],
  now: string,
) {
  if (
    quoteStatus !== "sold" ||
    states.length === 0 ||
    states.some((state) => state.orderStatus === "outstanding")
  ) {
    return null;
  }

  const refs = states
    .map((state) => state.manufacturerOrderRef)
    .filter((value): value is string => Boolean(value));

  return {
    status: "ordered" as const,
    ordered_at: now,
    manufacturer_order_ref: [...new Set(refs)].join(", ") || null,
  };
}
