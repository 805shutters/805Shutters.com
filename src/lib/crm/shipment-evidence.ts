export type ShipmentEvidence = {
  /** Null means the vendor confirmed shipment without stating the dispatch date. */
  shippedOn: string | null;
  notifiedOn?: string;
  mailbox: "805@805shutters.com" | "805shutters@gmail.com";
  messageId: string;
  orderReference: string;
  carrier?: string;
  trackingNumber?: string;
};

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function isShipmentEvidence(value: unknown): value is ShipmentEvidence {
  if (!value || typeof value !== "object") return false;
  const item = value as ShipmentEvidence;
  return (validDate(item.shippedOn) || (item.shippedOn === null && validDate(item.notifiedOn)))
    && (item.notifiedOn === undefined || validDate(item.notifiedOn))
    && ["805@805shutters.com", "805shutters@gmail.com"].includes(item.mailbox)
    && typeof item.messageId === "string" && /^[a-zA-Z0-9_-]{8,200}$/.test(item.messageId)
    && typeof item.orderReference === "string" && item.orderReference.trim().length > 0 && item.orderReference.length <= 150
    && [item.carrier, item.trackingNumber].every(value => value === undefined || (typeof value === 'string' && value.length <= 250));
}
export function shipmentEvidence(meta: unknown): ShipmentEvidence[] {
  if (!meta || typeof meta !== "object") return [];
  const value = (meta as Record<string, unknown>).shipping_confirmation;
  return isShipmentEvidence(value) ? [value] : [];
}
export function shipmentDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
