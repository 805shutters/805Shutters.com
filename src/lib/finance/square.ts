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

export function squareOrdersUrl(env: "sandbox" | "production" = squareEnvironment()): string {
  const baseUrl = env === "production" ? SQUARE_PRODUCTION_API_BASE : SQUARE_SANDBOX_API_BASE;
  return `${baseUrl}/v2/orders`;
}

export function getSquareWebhookConfig() {
  return {
    webhookUrl: squareWebhookUrl(),
    signingKey: squareWebhookSigningKey(),
  };
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
  quoteId?: string;
  jobId?: string;
  bookkeepingEntryId?: string;
  paymentType: "deposit" | "balance";
  buyerEmail?: string | null;
  idempotencyKey?: string;
  selectedLineIds?: string[];
};

export function squarePaymentLinkRequestBody(input: SquarePaymentLinkInput, locationId: string) {
  if (Boolean(input.quoteId) === Boolean(input.bookkeepingEntryId)) throw new Error("Identify exactly one quote or bookkeeping entry for payment.");
  const reference = input.bookkeepingEntryId || input.quoteId;
  return {
    idempotency_key: input.idempotencyKey || `805-${input.bookkeepingEntryId ? "entry" : "quote"}-${reference}-${input.paymentType}-${Date.now()}`,
    description: input.title,
    checkout_options: {
      allow_tipping: false,
      ask_for_shipping_address: false,
      // Digital wallets render as their own Web Payments SDK buttons on the
      // contract. Keep this hosted checkout path for manual card entry only.
      accepted_payment_methods: { apple_pay: false, google_pay: false },
    },
    pre_populated_data: input.buyerEmail ? { buyer_email: input.buyerEmail } : undefined,
    payment_note: `${input.bookkeepingEntryId ? "entry" : "quote"}:${reference} type:${input.paymentType}`,
    order: {
      location_id: locationId,
      reference_id: reference,
      metadata: {
        ...(input.bookkeepingEntryId ? { bookkeeping_entry_id: input.bookkeepingEntryId } : { quote_id: input.quoteId }),
        job_id: input.jobId,
        payment_type: input.paymentType,
        expected_amount_cents: String(input.amountCents),
        ...(input.selectedLineIds?.length ? { selected_line_ids: input.selectedLineIds.join(",") } : {}),
      },
      line_items: [{ name: input.title, quantity: "1", base_price_money: { amount: input.amountCents, currency: "USD" } }],
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
  currency: string | null;
  status?: string | null;
  bookkeepingEntryId?: string | null;
  quoteId: string | null;
  jobId: string | null;
  paymentType: string | null;
  orderId: string | null;
  customerId?: string | null;
  referenceId?: string | null;
  note?: string | null;
  paidAt: string | null;
  eventId: string | null;
  receiptUrl: string | null;
  refundedAmountCents: number;
};

// Square's TestWebhookSubscription endpoint sends this fixed, synthetic
// completed-payment fixture. It is not backed by a retrievable Square order and
// must never enter CRM reconciliation. Keep the match intentionally exact so a
// real payment can never be skipped because it merely resembles test data.
export function isSquareWebhookTestPayment(facts: SquarePaymentFacts): boolean {
  return (
    facts.squarePaymentId === "hYy9pRFVxpDsO1FB05SunFWUe9JZY" &&
    facts.orderId === "03O3USaPaAaFnI6kkwB1JxGgBsUZY" &&
    facts.amountCents === 100 &&
    facts.currency === "USD" &&
    facts.paidAt === "2020-11-22T21:16:51.086Z"
  );
}

export function extractSquarePaymentFacts(event: unknown): SquarePaymentFacts | null {
  const e = event as {
    type?: string;
    event_id?: string;
    eventId?: string;
    created_at?: string;
    createdAt?: string;
    data?: { object?: Record<string, unknown> | null };
  };
  const obj = e?.data?.object;
  if (!obj || typeof obj !== "object") return null;
  const order = obj.order as
    | {
        id?: string;
        reference_id?: string;
        referenceId?: string;
        metadata?: Record<string, string> | null;
      }
    | undefined;
  const payment = (obj.payment ?? obj.order ?? obj) as {
    id?: string;
    uid?: string;
    status?: string;
    total_money?: { amount?: number };
    total_money___amount?: number;
    amount_money?: { amount?: number; currency?: string };
    refunded_money?: { amount?: number };
    order_id?: string;
    orderId?: string;
    customer_id?: string;
    customerId?: string;
    reference_id?: string;
    referenceId?: string;
    created_at?: string;
    createdAt?: string;
    metadata?: Record<string, string> | null;
    receipt_url?: string;
    receiptUrl?: string;
    note?: string;
  };
  const id = payment.id || payment.uid;
  if (!id) return null;
  const amountCents = Number(payment.amount_money?.amount ?? payment.total_money?.amount ?? 0) || 0;
  const currency = payment.amount_money?.currency || null;
  const meta = payment.metadata ?? order?.metadata ?? {};
  const quoteId =
    meta.quote_id ||
    payment.reference_id ||
    payment.referenceId ||
    order?.reference_id ||
    order?.referenceId ||
    null;
  const paymentType = meta.payment_type ?? null;
  const jobId = meta.job_id || null;
  const orderId = payment.order_id || payment.orderId || order?.id || null;
  const paidAt = payment.created_at || payment.createdAt || e.created_at || e.createdAt || null;
  return {
    squarePaymentId: id,
    amountCents,
    currency,
    status: payment.status || null,
    quoteId,
    jobId,
    paymentType,
    orderId,
    customerId: payment.customer_id || payment.customerId || null,
    referenceId: payment.reference_id || payment.referenceId || null,
    note: payment.note || null,
    paidAt,
    eventId: e.event_id || e.eventId || null,
    receiptUrl: payment.receipt_url || payment.receiptUrl || null,
    refundedAmountCents: Number(payment.refunded_money?.amount || 0) || 0,
  };
}

export async function fetchSquarePaymentFacts(paymentId: string): Promise<SquarePaymentFacts> {
  const response = await squareApiFetch(`/v2/payments/${encodeURIComponent(paymentId)}`);
  const data = await squareJson<{ payment?: Record<string, unknown> }>(response, "Square payment lookup");
  const payment = data.payment;
  if (!payment) throw new Error("Square payment lookup returned no payment.");
  const facts = extractSquarePaymentFacts({
    type: "payment.updated",
    event_id: null,
    data: { object: { payment } },
  });
  if (!facts) throw new Error("Square payment lookup returned an invalid payment.");
  return facts;
}

export async function listRecentCompletedSquarePayments(
  beginTime: string,
  limit = 200,
): Promise<SquarePaymentFacts[]> {
  const collected: SquarePaymentFacts[] = [];
  let cursor = "";
  do {
    const query = new URLSearchParams({
      begin_time: beginTime,
      sort_order: "DESC",
      limit: String(Math.min(100, Math.max(1, limit - collected.length))),
    });
    if (cursor) query.set("cursor", cursor);
    const response = await squareApiFetch(`/v2/payments?${query.toString()}`);
    const data = await squareJson<{
      payments?: Record<string, unknown>[];
      cursor?: string;
    }>(response, "Square payments list");
    for (const payment of data.payments || []) {
      const facts = extractSquarePaymentFacts({
        type: "payment.updated",
        data: { object: { payment } },
      });
      if (facts?.status === "COMPLETED" && facts.refundedAmountCents === 0) collected.push(facts);
      if (collected.length >= limit) break;
    }
    cursor = collected.length < limit ? data.cursor || "" : "";
  } while (cursor);
  return collected;
}

export type SquareCustomerFacts = {
  customerId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export async function fetchSquareCustomerFacts(customerId: string): Promise<SquareCustomerFacts> {
  const response = await squareApiFetch(`/v2/customers/${encodeURIComponent(customerId)}`);
  const data = await squareJson<{
    customer?: {
      id?: string;
      given_name?: string;
      family_name?: string;
      company_name?: string;
      email_address?: string;
      phone_number?: string;
      address?: {
        address_line_1?: string;
        address_line_2?: string;
        locality?: string;
        administrative_district_level_1?: string;
        postal_code?: string;
      };
    };
  }>(response, "Square customer lookup");
  const customer = data.customer;
  if (!customer?.id) throw new Error("Square customer lookup returned no customer.");
  const personName = [customer.given_name, customer.family_name].filter(Boolean).join(" ").trim();
  const address = customer.address
    ? [
        customer.address.address_line_1,
        customer.address.address_line_2,
        customer.address.locality,
        customer.address.administrative_district_level_1,
        customer.address.postal_code,
      ].filter(Boolean).join(" ")
    : "";
  return {
    customerId: customer.id,
    name: customer.company_name || personName || null,
    email: customer.email_address || null,
    phone: customer.phone_number || null,
    address: address || null,
  };
}

export type SquareOrderFacts = {
  bookkeepingEntryId?: string | null;
  quoteId: string | null;
  jobId: string | null;
  paymentType: "deposit" | "balance" | null;
  expectedAmountCents: number | null;
  currency: string | null;
  selectedLineIds?: string[];
};

export async function fetchSquareOrderFacts(
  orderId: string,
): Promise<SquareOrderFacts> {
  const accessToken = squareAccessToken();
  if (!accessToken) throw new Error("Square is not configured (SQUARE_ACCESS_TOKEN).");

  const res = await fetch(`${squareOrdersUrl()}/${encodeURIComponent(orderId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Square-Version": SQUARE_VERSION,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Square order lookup failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    order?: {
      reference_id?: string | null;
      referenceId?: string | null;
      metadata?: Record<string, string> | null;
      total_money?: { amount?: number | null; currency?: string | null } | null;
    } | null;
  };
  const order = data.order;
  const meta = order?.metadata ?? {};
  const metadataAmount = Number(meta.expected_amount_cents);
  const orderAmount = Number(order?.total_money?.amount);
  const paymentType = meta.payment_type;
  return {
    ...(meta.bookkeeping_entry_id ? { bookkeepingEntryId: meta.bookkeeping_entry_id } : {}),
    quoteId: meta.quote_id || (meta.bookkeeping_entry_id ? null : order?.reference_id || order?.referenceId || null),
    jobId: meta.job_id || null,
    paymentType: paymentType === "deposit" || paymentType === "balance" ? paymentType : null,
    expectedAmountCents:
      Number.isSafeInteger(metadataAmount) && metadataAmount > 0
        ? metadataAmount
        : Number.isSafeInteger(orderAmount) && orderAmount > 0
          ? orderAmount
          : null,
    currency: order?.total_money?.currency || null,
    selectedLineIds: (meta.selected_line_ids || "").split(",").filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Card-on-file autopay (in-house payment plans): Customers + Cards + Payments.
// ---------------------------------------------------------------------------

export function squareApiBase(env: "sandbox" | "production" = squareEnvironment()): string {
  return env === "production" ? SQUARE_PRODUCTION_API_BASE : SQUARE_SANDBOX_API_BASE;
}

/** Square application id for the Web Payments SDK card form (safe to expose to the browser). */
export function squareApplicationId(): string {
  return squareEnvValue("SQUARE_APPLICATION_ID") || squareEnvValue("NEXT_PUBLIC_SQUARE_APPLICATION_ID");
}

export function squareWebSdkUrl(env: "sandbox" | "production" = squareEnvironment()): string {
  return env === "production" ? "https://web.squarecdn.com/v1/square.js" : "https://sandbox.web.squarecdn.com/v1/square.js";
}

async function squareApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = squareAccessToken();
  if (!accessToken) throw new Error("Square is not configured (SQUARE_ACCESS_TOKEN).");
  return fetch(`${squareApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {})
    }
  });
}

async function squareJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${label} failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

let resolvedSquareApplicationId = "";
let squareApplicationIdRequest: Promise<string> | null = null;

/** Resolve the browser-safe Square application ID. Prefer explicit config,
 * then use Square's authenticated token-status endpoint so protected Vercel
 * access tokens never need to be copied into a public environment variable. */
export async function resolveSquareApplicationId(): Promise<string> {
  const configured = squareApplicationId();
  if (configured) return configured;
  if (resolvedSquareApplicationId) return resolvedSquareApplicationId;
  if (squareApplicationIdRequest) return squareApplicationIdRequest;

  squareApplicationIdRequest = (async () => {
    try {
      const response = await squareApiFetch("/oauth2/token/status", { method: "POST" });
      const data = await squareJson<{ client_id?: string }>(response, "Square token status");
      const applicationId = String(data.client_id || "").trim();
      if (!/^sq0id[ps]-/.test(applicationId)) return "";
      resolvedSquareApplicationId = applicationId;
      return applicationId;
    } catch (error) {
      console.error("Square application ID could not be resolved from the configured access token", {
        error: error instanceof Error ? error.message : "Unknown Square token status error",
      });
      return "";
    } finally {
      squareApplicationIdRequest = null;
    }
  })();
  return squareApplicationIdRequest;
}

export type SquareWalletPaymentInput = {
  sourceId: string;
  verificationToken?: string | null;
  amountCents: number;
  title: string;
  quoteId: string;
  jobId: string;
  paymentType: "deposit" | "balance";
  walletType: "apple_pay" | "google_pay";
  idempotencyKey: string;
  selectedLineIds?: string[];
};

export type SquareWalletPayment = {
  paymentId: string;
  orderId: string;
  status: string;
  receiptUrl: string | null;
};

export function squareWalletOrderRequestBody(input: SquareWalletPaymentInput, locationId: string) {
  return {
    idempotency_key: `order-${input.idempotencyKey}`.slice(0, 192),
    order: {
      location_id: locationId,
      reference_id: input.quoteId.slice(0, 40),
      metadata: {
        quote_id: input.quoteId,
        job_id: input.jobId,
        payment_type: input.paymentType,
        wallet_type: input.walletType,
        expected_amount_cents: String(input.amountCents),
        ...(input.selectedLineIds?.length
          ? { selected_line_ids: input.selectedLineIds.join(",").slice(0, 255) }
          : {}),
      },
      line_items: [
        {
          name: input.title,
          quantity: "1",
          base_price_money: { amount: input.amountCents, currency: "USD" },
        },
      ],
    },
  };
}

export function squareWalletPaymentRequestBody(
  input: SquareWalletPaymentInput,
  locationId: string,
  orderId: string,
) {
  return {
    idempotency_key: `pay-${input.idempotencyKey}`.slice(0, 45),
    source_id: input.sourceId,
    verification_token: input.verificationToken || undefined,
    amount_money: { amount: input.amountCents, currency: "USD" },
    location_id: locationId,
    order_id: orderId,
    reference_id: input.quoteId.slice(0, 40),
    note: `${input.paymentType}:${input.quoteId}:${input.walletType}`.slice(0, 500),
    autocomplete: true,
  };
}

/** Process a one-time Apple Pay or Google Pay token from Square's Web
 * Payments SDK. The Square order carries the same authoritative CRM metadata
 * used by hosted card checkout so the verified webhook reconciliation path is
 * identical for all three payment methods. */
export async function createSquareWalletPayment(input: SquareWalletPaymentInput): Promise<SquareWalletPayment> {
  const locationId = squareLocationId();
  if (!squareAccessToken() || !locationId) {
    throw new Error("Square is not configured (SQUARE_ACCESS_TOKEN / SQUARE_LOCATION_ID).");
  }
  if (!input.sourceId || !(input.amountCents > 0)) {
    throw new Error("Square wallet payment requires a token and positive amount.");
  }

  const orderResponse = await squareApiFetch("/v2/orders", {
    method: "POST",
    body: JSON.stringify(squareWalletOrderRequestBody(input, locationId)),
  });
  const orderData = await squareJson<{ order?: { id?: string; total_money?: { amount?: number } } }>(
    orderResponse,
    "Square wallet order create",
  );
  const orderId = orderData.order?.id;
  if (!orderId) throw new Error("Square did not return an order id for this wallet payment.");
  if (Number(orderData.order?.total_money?.amount) !== input.amountCents) {
    throw new Error("Square wallet order total did not match the verified quote amount.");
  }

  const paymentResponse = await squareApiFetch("/v2/payments", {
    method: "POST",
    body: JSON.stringify(squareWalletPaymentRequestBody(input, locationId, orderId)),
  });
  const paymentData = await squareJson<{
    payment?: { id?: string; order_id?: string; status?: string; receipt_url?: string };
  }>(paymentResponse, "Square wallet payment");
  const payment = paymentData.payment;
  if (!payment?.id) throw new Error("Square did not return a wallet payment id.");
  const status = String(payment.status || "").toUpperCase();
  if (status !== "COMPLETED") {
    throw new Error(`Square wallet payment status ${status || "UNKNOWN"}.`);
  }
  return {
    paymentId: payment.id,
    orderId: payment.order_id || orderId,
    status,
    receiptUrl: payment.receipt_url || null,
  };
}

export async function createSquareCustomer(input: {
  givenName?: string | null;
  familyName?: string | null;
  emailAddress?: string | null;
  phoneNumber?: string | null;
  referenceId?: string | null;
  note?: string | null;
}): Promise<{ customerId: string }> {
  const res = await squareApiFetch("/v2/customers", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `805-cust-${input.referenceId || ""}-${Date.now()}`,
      given_name: input.givenName || undefined,
      family_name: input.familyName || undefined,
      email_address: input.emailAddress || undefined,
      phone_number: input.phoneNumber || undefined,
      reference_id: input.referenceId || undefined,
      note: input.note || undefined
    })
  });
  const data = await squareJson<{ customer?: { id?: string } }>(res, "Square customer create");
  if (!data.customer?.id) throw new Error("Square did not return a customer id.");
  return { customerId: data.customer.id };
}

export async function createSquareCardOnFile(input: {
  customerId: string;
  /** One-time payment token (cnon) from the Web Payments SDK card form. */
  sourceId: string;
  cardholderName?: string | null;
  referenceId?: string | null;
  idempotencyKey: string;
}): Promise<{ cardId: string; brand: string | null; last4: string | null }> {
  const res = await squareApiFetch("/v2/cards", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: input.idempotencyKey,
      source_id: input.sourceId,
      card: {
        customer_id: input.customerId,
        cardholder_name: input.cardholderName || undefined,
        reference_id: input.referenceId || undefined
      }
    })
  });
  const data = await squareJson<{ card?: { id?: string; card_brand?: string; last_4?: string } }>(res, "Square card save");
  if (!data.card?.id) throw new Error("Square did not return a card id.");
  return { cardId: data.card.id, brand: data.card.card_brand || null, last4: data.card.last_4 || null };
}

export type SquareChargeResult =
  | { ok: true; paymentId: string; receiptUrl: string | null }
  | { ok: false; error: string };

/** Merchant-initiated card-on-file charge for a payment-plan installment.
 *  Returns a result object instead of throwing on decline so the cron can
 *  record the failure and alert the shop. */
export async function chargeSquareCardOnFile(input: {
  customerId: string;
  cardId: string;
  amountCents: number;
  note: string;
  referenceId?: string | null;
  idempotencyKey: string;
}): Promise<SquareChargeResult> {
  const locationId = squareLocationId();
  if (!locationId) return { ok: false, error: "Square is not configured (SQUARE_LOCATION_ID)." };
  try {
    const res = await squareApiFetch("/v2/payments", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: input.idempotencyKey,
        source_id: input.cardId,
        customer_id: input.customerId,
        location_id: locationId,
        amount_money: { amount: input.amountCents, currency: "USD" },
        note: input.note.slice(0, 500),
        reference_id: input.referenceId ? input.referenceId.slice(0, 40) : undefined,
        autocomplete: true
      })
    });
    if (!res.ok) {
      const detail = await res.text();
      let message = `Square charge failed (${res.status})`;
      try {
        const parsed = JSON.parse(detail) as { errors?: Array<{ code?: string; detail?: string }> };
        const first = parsed.errors?.[0];
        if (first) message = `${first.code || "SQUARE_ERROR"}: ${first.detail || message}`;
      } catch {
        message = `${message}: ${detail.slice(0, 200)}`;
      }
      return { ok: false, error: message };
    }
    const data = (await res.json()) as { payment?: { id?: string; status?: string; receipt_url?: string } };
    const payment = data.payment;
    if (!payment?.id) return { ok: false, error: "Square did not return a payment id." };
    const status = String(payment.status || "").toUpperCase();
    if (status && !["COMPLETED", "APPROVED", "CAPTURED"].includes(status)) {
      return { ok: false, error: `Square payment status ${status}.` };
    }
    return { ok: true, paymentId: payment.id, receiptUrl: payment.receipt_url || null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Square charge threw." };
  }
}

/** Is this a Square event we should record a payment for? */
export function isSquarePaidPaymentEvent(event: unknown): boolean {
  const e = event as { type?: string; data?: { object?: Record<string, unknown> | null } };
  if (!e?.type) return false;
  // Record only completed payment events (ignore authorizations, declines, refunds, pending states).
  if (!/^payment\.updated$/i.test(e.type)) return false;
  const payment = (e.data?.object?.payment ?? e.data?.object) as {
    status?: string;
    card_details?: { status?: string };
    refunded_money?: { amount?: number };
  } | undefined;
  const status = String(payment?.status || payment?.card_details?.status || "").toUpperCase();
  return status === "COMPLETED" && Number(payment?.refunded_money?.amount || 0) === 0;
}
