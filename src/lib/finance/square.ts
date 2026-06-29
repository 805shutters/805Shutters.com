// Square Online Checkout integration for customer deposit/balance payments.
// Env (set in Vercel / .env.local):
//   SQUARE_ENV             "sandbox" | "production" (default sandbox)
//   SQUARE_ACCESS_TOKEN    OAuth access token (sandbox or production)
//   SQUARE_LOCATION_ID     Square location id
//   SQUARE_WEBHOOK_URL     The public URL Square calls (https://.../api/webhooks/square)
//   SQUARE_WEBHOOK_SIGNING_KEY  Webhook signature key (Square Developer Dashboard)
//
// Square uses separate API hosts for sandbox and production tokens.
import { createHmac, timingSafeEqual } from "node:crypto";

const SQUARE_VERSION = "2024-12-18";
const SQUARE_PRODUCTION_API_BASE = "https://connect.squareup.com";
const SQUARE_SANDBOX_API_BASE = "https://connect.squareupsandbox.com";

function squareEnvValue(key: string): string {
  return process.env[key]?.trim() || "";
}

export function squareEnvironment(): "sandbox" | "production" {
  return squareEnvValue("SQUARE_ENV") === "production" ? "production" : "sandbox";
}

export function squareAccessToken(): string {
  return squareEnvValue("SQUARE_ACCESS_TOKEN");
}

export function squareLocationId(): string {
  return squareEnvValue("SQUARE_LOCATION_ID");
}

export function squareWebhookUrl(): string {
  return squareEnvValue("SQUARE_WEBHOOK_URL");
}

export function squareWebhookSigningKey(): string {
  return squareEnvValue("SQUARE_WEBHOOK_SIGNING_KEY");
}

export function squarePaymentLinksUrl(env: "sandbox" | "production" = squareEnvironment()): string {
  const baseUrl = env === "production" ? SQUARE_PRODUCTION_API_BASE : SQUARE_SANDBOX_API_BASE;
  return `${baseUrl}/v2/online-checkout/payment-links`;
}

export function isSquareConfigured(): boolean {
  return Boolean(squareAccessToken() && squareLocationId());
}

export function dollarsToCents(dollars: number): number {
  return Math.round((Number(dollars) || 0) * 100);
}

/** Verify a Square webhook signature (x-square-hmacsha256-signature).
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
export type SquarePaymentLinkInput = {
  amountCents: number;
  title: string;
  quoteId: string;
  paymentType: "deposit" | "balance";
  buyerEmail?: string | null;
};

export function squarePaymentLinkRequestBody(input: SquarePaymentLinkInput, locationId: string) {
  return {
    idempotency_key: `805-quote-${input.quoteId}-${input.paymentType}-${Date.now()}`,
    description: input.title,
    checkout_options: { allow_tipping: false, ask_for_shipping_address: false },
    pre_populated_data: input.buyerEmail ? { buyer_email: input.buyerEmail } : undefined,
    payment_note: `quote:${input.quoteId} type:${input.paymentType}`,
    order: {
      location_id: locationId,
      reference_id: input.quoteId,
      metadata: { quote_id: input.quoteId, payment_type: input.paymentType },
      line_items: [{ name: input.title, base_price_money: { amount: input.amountCents, currency: "USD" } }],
    },
  };
}

/** Create a Square Online Checkout payment link for a fixed amount.
 *  The quote id + payment type ride in the order metadata so the webhook can
 *  reconcile the payment back to this quote. */
export async function createSquarePaymentLink(input: SquarePaymentLinkInput): Promise<SquarePaymentLink> {
  const accessToken = squareAccessToken();
  const locationId = squareLocationId();
  if (!accessToken || !locationId) throw new Error("Square is not configured (SQUARE_ACCESS_TOKEN / SQUARE_LOCATION_ID).");
  const res = await fetch(squarePaymentLinksUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(squarePaymentLinkRequestBody(input, locationId)),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Square payment link failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { payment_link?: { id?: string; url?: string }; paymentLink?: { id?: string; url?: string } };
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
};

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
    metadata?: Record<string, string> | null;
  };
  const id = payment.id || payment.uid;
  if (!id) return null;
  const amountCents =
    Number(payment.total_money?.amount ?? payment.amount_money?.amount ?? 0) || 0;
  const meta = payment.metadata ?? {};
  const quoteId = meta.quote_id || payment.reference_id || payment.referenceId || null;
  const paymentType = meta.payment_type ?? null;
  return { squarePaymentId: id, amountCents, quoteId, paymentType };
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
