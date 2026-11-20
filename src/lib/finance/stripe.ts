import { createHmac, timingSafeEqual } from "node:crypto";

// Endive uses an allowlist over dynamically eligible Checkout payment methods.
export const STRIPE_API_VERSION = "2026-11-18.endive";
export type StripeObject = { id: string; [key: string]: unknown };
export function stripeConfig() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  const account = process.env.STRIPE_ACCOUNT_ID || "";
  const environment = process.env.STRIPE_ENV || "test";
  if (
    !["test", "live"].includes(environment) ||
    !/^acct_[A-Za-z0-9]+$/.test(account) ||
    !new RegExp(`^(sk|rk)_${environment}_`).test(key)
  )
    throw new Error(
      "Stripe account, environment and restricted server key must agree.",
    );
  if (environment === "live" && process.env.VERCEL_ENV !== "production")
    throw new Error("Live Stripe is restricted to production.");
  return { key, account, livemode: environment === "live", environment };
}
export function isStripeConfigured() {
  try {
    stripeConfig();
    return true;
  } catch {
    return false;
  }
}
export async function stripeRequest<T = StripeObject>(
  path: string,
  options: {
    method?: "GET" | "POST";
    form?: URLSearchParams;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  if (!/^\/v1\/[a-zA-Z0-9_/?=&%.[\]-]+$/.test(path))
    throw new Error("Invalid Stripe API path.");
  const { key } = stripeConfig();
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: options.method || "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(options.form
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
      ...(options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {}),
    },
    ...(options.form ? { body: options.form.toString() } : {}),
  });
  // Never echo provider bodies (which can contain customer data) or keys in errors.
  if (!response.ok)
    throw new Error(
      `Stripe request failed (${response.status}); verify provider status before retrying.`,
    );
  return response.json() as Promise<T>;
}
export async function verifyStripeAccount(collect = false) {
  const config = stripeConfig();
  const account = await stripeRequest("/v1/account");
  if (account.id !== config.account)
    throw new Error("Stripe key belongs to a different account.");
  if (collect && process.env.STRIPE_COLLECTION_ENABLED !== "true")
    throw new Error("Stripe collection is awaiting approved cutover.");
  if (
    collect &&
    config.livemode &&
    (!account.charges_enabled || !account.payouts_enabled)
  )
    throw new Error(
      "Stripe payments and payouts must be enabled before collection.",
    );
  return config;
}
export function verifyStripeSignature(
  raw: string,
  header: string,
  secret: string,
  now = Date.now(),
) {
  if (!secret) return false;
  const parts = header.split(",").map((v) => v.split("="));
  const timestamp = parts.find((p) => p[0] === "t")?.[1];
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest();
  return parts
    .filter((p) => p[0] === "v1" && /^[a-f0-9]{64}$/i.test(p[1] || ""))
    .some((p) => timingSafeEqual(expected, Buffer.from(p[1], "hex")));
}
export function objectId(value: unknown): string | null {
  return typeof value === "string"
    ? value
    : value && typeof value === "object" && "id" in value
      ? String(value.id)
      : null;
}
export function stripeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
