export type ShipmentEvidence = {
  shippedOn: string;
  mailbox: "805@805shutters.com";
  messageId: string;
  orderReference: string;
};

export function isShipmentEvidence(value: unknown): value is ShipmentEvidence {
  if (!value || typeof value !== "object") return false;
  const item = value as ShipmentEvidence;
  return typeof item.shippedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.shippedOn)
    && Number.isFinite(Date.parse(item.shippedOn))
    && new Date(item.shippedOn).toISOString().slice(0, 10) === item.shippedOn
    && item.mailbox === "805@805shutters.com"
    && typeof item.messageId === "string" && /^[a-zA-Z0-9_-]{8,200}$/.test(item.messageId)
    && typeof item.orderReference === "string" && item.orderReference.trim().length > 0 && item.orderReference.length <= 150;
}

export function shipmentEvidence(meta: unknown): ShipmentEvidence[] {
  if (!meta || typeof meta !== "object") return [];
  const value = (meta as Record<string, unknown>).shipping_confirmation;
  return isShipmentEvidence(value) ? [value] : [];
}

export function shipmentDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
