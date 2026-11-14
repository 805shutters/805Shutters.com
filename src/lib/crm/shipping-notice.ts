export type ShippingNotice = {
  manufacturer: "Norman" | "Onyx" | "Lotus";
  /** Order numbers the existing product-milestone path applies. Onyx X-prefix parts stay out of this list. */
  references: string[];
  shippedOn: string | null;
  carrier?: string;
  trackingNumber?: string;
  purchaseOrder?: string;
  /** Digit references plus Onyx X-prefix parts/remakes. Present only when that adds orders the milestone path does not use. */
  orderReferences?: string[];
  /** Lotus listed a real product under "not shipped yet". A freight-only section does not set this. */
  lotusUnshippedProducts?: boolean;
};

/** Order numbers for the quote-level shipped date. Product milestones keep using `references`. */
export function shippingOrderReferences(notice: ShippingNotice) {
  return notice.orderReferences?.length ? notice.orderReferences : notice.references;
}

function isoDate(year: string, month: string, day: string) {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normanPurchaseOrder(subject: string, text: string) {
  const body = /PO#\s*:\s*([^\n|]+)/i.exec(text)?.[1]?.trim();
  const fromSubject = /PO#\s*:\s*([^|]+)/i.exec(subject)?.[1]?.trim();
  const value = (body || fromSubject || "").replace(/\s+/g, " ").trim();
  if (!value || /^date\b/i.test(value)) return undefined;
  return value.slice(0, 120);
}

/** Freight charge lines are not unshipped product. A part number or a "Custom …" description is. */
function lotusHasUnshippedProduct(flat: string) {
  const section = /have not shipped yet:?\s*(.*?)(?:thank you for your order|attachments:|orders@lotusblind\.com|$)/i.exec(flat)?.[1] || "";
  if (!section.trim()) return false;
  const ignored = new Set(["item", "part", "no.", "no", "description", "qty", "uom", "notes", "ea", "-", "freight", "charge"]);
  for (const token of section.split(/\s+/)) {
    if (/^custom$/i.test(token)) return true;
    if (/^[A-Z][A-Z0-9-]{2,}$/.test(token) && !ignored.has(token.toLowerCase())) return true;
  }
  return false;
}

/** Only vendor dispatch templates qualify; order confirmations and delivery discussions do not. */
export function extractShippingNotice(subject: string, body: string, from: string): ShippingNotice | null {
  const sender = (/<([^>]+)>/.exec(from)?.[1] || from).trim().toLowerCase();
  const text = `${subject}\n${body}`.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/\r/g, "\n");
  const flat = text.replace(/\s+/g, " ").trim();
  const norman = sender.endsWith("@normanusa.com") && /shipping notification.*has shipped/i.test(subject);
  const onyx = sender === "orders@onyxshutters.com" && /^Onyx Shipping Notice$/i.test(subject.trim());
  const lotus = (sender === "system@sent-via.netsuite.com" || sender === "orders@lotusblind.com")
    && /lotus blind order fulfillment notification/i.test(subject);
  if (!norman && !onyx && !lotus) return null;
  if (lotus) {
    const order = /Order\s*#\s*(SO\d+)/i.exec(flat);
    const date = /On\s+(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*your Order\s*#/i.exec(flat);
    const purchaseOrder = (/Purchase Order\s*#\s*(.+?)\s+was shipped/i.exec(flat)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const carrier = /Carrier:\s*([^\n]+?)(?:\s+Tracking|\n|$)/i.exec(text)?.[1]?.trim();
    const trackingNumber = /Tracking\s*#\s*:?\s*([A-Za-z0-9-]+)/i.exec(flat)?.[1]?.trim();
    return {
      manufacturer: "Lotus",
      references: order ? [order[1]] : [],
      shippedOn: date ? isoDate(date[3], date[1], date[2]) : null,
      ...(carrier ? { carrier: carrier.slice(0, 250) } : {}),
      ...(trackingNumber ? { trackingNumber: trackingNumber.slice(0, 250) } : {}),
      ...(purchaseOrder ? { purchaseOrder } : {}),
      ...(lotusHasUnshippedProduct(flat) ? { lotusUnshippedProducts: true as const } : {}),
    };
  }
  const head = text.split(/SHIP OUT AT/i)[0];
  // Onyx plain text glues the order number to the side mark (52608251244CHE01-…).
  // A digit boundary still rejects a longer number. X-prefix parts are kept off `references`.
  const references = [...new Set(norman
    ? [...text.matchAll(/WO\s*#\s*:?\s*(\d{8,14})/gi)].map(match => match[1])
    : [...head.matchAll(/(?<!\d)(\d{11})(?!\d)/g)].map(match => match[1]))];
  const xRefs = onyx ? [...new Set([...head.matchAll(/(?<![A-Za-z0-9])(X\d{10})(?!\d)/g)].map(match => match[1]))] : [];
  const date = /(?:SHIP OUT AT|(?:actual\s+)?ship(?:ped|ping)?\s+date)\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(text);
  const shippedOn = date ? isoDate(date[3], date[1], date[2]) : null;
  const carrier = /(?:Carrier:|\bBY)\s*([^\n]+?)(?:\s+TRACKING|\n|$)/i.exec(text)?.[1]?.trim();
  const trackingNumber = /TRACKING\s*(?:Number|NO\.)\s*:?\s*([^\n]+?)(?:\s+https?:|\s+Please|\n|$)/i.exec(text)?.[1]?.trim();
  const purchaseOrder = norman ? normanPurchaseOrder(subject, text) : undefined;
  const orderReferences = [...references, ...xRefs.filter(ref => !references.includes(ref))];
  return {
    manufacturer: norman ? "Norman" : "Onyx",
    references,
    shippedOn,
    ...(carrier ? { carrier: carrier.slice(0, 250) } : {}),
    ...(trackingNumber ? { trackingNumber: trackingNumber.slice(0, 250) } : {}),
    ...(purchaseOrder ? { purchaseOrder } : {}),
    ...(orderReferences.length > references.length ? { orderReferences } : {}),
  };
}
