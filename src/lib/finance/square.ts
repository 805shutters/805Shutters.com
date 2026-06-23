// Square Online Checkout integration for customer deposit/balance payments.
// Env (set in Vercel / .env.local):
//   SQUARE_ENV             "sandbox" | "production" (default sandbox)
//   SQUARE_ACCESS_TOKEN    OAuth access token (sandbox or production)
//   SQUARE_LOCATION_ID     Square location id
//   SQUARE_WEBHOOK_URL     The public URL Square calls (https://.../api/webhooks/square)
//   SQUARE_WEBHOOK_SIGNING_KEY  Webhook signature key (Square Developer Dashboard)
//
// The Square API host (connect.squareapis.com) is the same for sandbox + prod;
// the environment is determined by the access token.
import { createHmac, timingSafeEqual } from "node:crypto";

const SQUARE_VERSION = "2024-12-18";
export const SQUARE_ENV = process.env.SQUARE_ENV === "production" ? "production" : "sandbox";
export const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN || "";
export const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID || "";
export const SQUARE_WEBHOOK_URL = process.env.SQUARE_WEBHOOK_URL || "";
export const SQUARE_WEBHOOK_SIGNING_KEY = process.env.SQUARE_WEBHOOK_SIGNING_KEY || "";
const SQUARE_API_BASE = SQUARE_ENV === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";

export function isSquareConfigured(): boolean {
  return Boolean(SQUARE_ACCESS_TOKEN && SQUARE_LOCATION_ID);
}

export function dollarsToCents(dollars: number): number {
  return Math.round((Number(dollars) || 0) * 100);
}

/** Verify a Square webhook signature (x-square-hmac-signature).
 *  Pure + deterministic so it can be unit-tested. */
export function verifySquareWebhookSignature(
  webhookUrl: string,
  signingKey: string,
  rawBody: string,
  signature: string | null | undefined,
): boolean {
  if (!webhookUrl || !signingKey || !signature) return false;
  const expected = createHmac("sha256", signingKey).update(`${webhookUrl}${rawBody}`).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type SquarePaymentLink = { id: string; url: string };

/** Create a Square Online Checkout payment link for a fixed amount.
 *  The quote id + payment type ride in the order metadata so the webhook can
 *  reconcile the payment back to this quote. */
export async function createSquarePaymentLink(input: {
  amountCents: number;
  title: string;
  quoteId: string;
  paymentType: "deposit" | "balance";
  buyerEmail?: string | null;
}): Promise<SquarePaymentLink> {
  if (!isSquareConfigured()) throw new Error("Square is not configured (SQUARE_ACCESS_TOKEN / SQUARE_LOCATION_ID).");
  const res = await fetch(`${SQUARE_API_BASE}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idempotency_key: `805-quote-${input.quoteId}-${input.paymentType}-${Date.now()}`,
      description: input.title,
      checkout_options: { allow_tipping: false, ask_for_shipping_address: false },
      pre_populated_data: input.buyerEmail ? { buyer_email: input.buyerEmail } : undefined,
      payment_note: `quote:${input.quoteId} type:${input.paymentType}`,
      order: {
        location_id: SQUARE_LOCATION_ID,
        reference_id: input.quoteId,
        metadata: { quote_id: input.quoteId, payment_type: input.paymentType },
        line_items: [
          { name: input.title, quantity: "1", base_price_money: { amount: input.amountCents, currency: "USD" } },
        ],
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Square payment link failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    payment_link?: { id?: string; url?: string };
    paymentLink?: { id?: string; url?: string };
  };
  const link = data.payment_link ?? data.paymentLink;
  if (!link?.id || !link.url) throw new Error("Square did not return a payment link URL.");
  return { id: link.id, url: link.url };
}

/** Extract the payment facts from a Square webhook event. Square's payload shape
 *  can vary; this defensively pulls the payment id + amount + quote reference
 *  from the common locations. CONFIRM against a real sandbox payload on first run. */
export type SquarePaymentFacts = {
  squarePaymentId: string;
  amountCents: number;
  quoteId: string | null;
  paymentType: string | null;
  orderId: string | null;
};

function parsePaymentNote(note: unknown): { quoteId: string | null; paymentType: string | null } {
  if (typeof note !== "string") return { quoteId: null, paymentType: null };
  const quoteId = note.match(/(?:^|\s)quote:([^\s]+)/)?.[1] ?? null;
  const paymentType = note.match(/(?:^|\s)type:([^\s]+)/)?.[1] ?? null;
  return { quoteId, paymentType };
}

export function extractSquarePaymentFacts(event: unknown): SquarePaymentFacts | null {
  const e = event as { type?: string; data?: { object?: Record<string, unknown> | null } };
  const obj = e?.data?.object;
  if (!obj || typeof obj !== "object") return null;
  const payment = (obj.payment ?? obj.order ?? obj) as {
    id?: string;
    uid?: string;
    status?: string;
    total_money?: { amount?: number };
    total_money___amount?: number;
    amount_money?: { amount?: number };
    order_id?: string;
    reference_id?: string;
    referenceId?: string;
    note?: string;
    payment_note?: string;
    metadata?: Record<string, string> | null;
  };
  const id = payment.id || payment.uid;
  if (!id) return null;
  const amountCents =
    Number(payment.total_money?.amount ?? payment.amount_money?.amount ?? 0) || 0;
  const meta = payment.metadata ?? {};
  const note = parsePaymentNote(payment.note ?? payment.payment_note);
  const quoteId = meta.quote_id || payment.reference_id || payment.referenceId || note.quoteId || null;
  const paymentType = meta.payment_type ?? note.paymentType ?? null;
  const orderId = payment.order_id ?? null;
  return { squarePaymentId: id, amountCents, quoteId, paymentType, orderId };
}

export async function retrieveSquareOrderPaymentFacts(orderId: string): Promise<Partial<SquarePaymentFacts> | null> {
  if (!orderId || !SQUARE_ACCESS_TOKEN) return null;
  const res = await fetch(`${SQUARE_API_BASE}/v2/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    order?: {
      id?: string;
      reference_id?: string;
      referenceId?: string;
      metadata?: Record<string, string> | null;
      total_money?: { amount?: number };
    };
  };
  const order = data.order;
  if (!order) return null;
  const meta = order.metadata ?? {};
  return {
    orderId: order.id ?? orderId,
    quoteId: meta.quote_id || order.reference_id || order.referenceId || null,
    paymentType: meta.payment_type ?? null,
    amountCents: Number(order.total_money?.amount ?? 0) || 0,
  };
}

/** Is this a Square event we should record a payment for? */
export function isSquarePaidPaymentEvent(event: unknown): boolean {
  const e = event as { type?: string; data?: { object?: Record<string, unknown> | null } };
  if (!e?.type) return false;
  // Record on completed/approved payment events (ignore declines/refunds/pending).
  if (!/payment\.(updated|created|approved|completed)/i.test(e.type)) return false;
  const payment = (e.data?.object?.payment ?? e.data?.object) as { status?: string; card_details?: { status?: string } } | undefined;
  const status = String(payment?.status || payment?.card_details?.status || "").toUpperCase();
  // Square paid states: APPROVED, COMPLETED, CAPTURED. Skip PENDING/FAILED/CANCELED.
  return status === "" || ["APPROVED", "COMPLETED", "CAPTURED", "PAID"].includes(status);
}
