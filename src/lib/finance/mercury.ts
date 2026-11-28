import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Mercury signs `t=<unix>,v1=<hex>` over `${t}.${rawBody}` with HMAC-SHA256. */
export const MERCURY_SIGNATURE_HEADER = "mercury-signature";
export const MERCURY_WEBHOOK_SECRET_ENV = "MERCURY_WEBHOOK_SECRET";
const MAX_SKEW_SECONDS = 5 * 60;
const PAYMENT_NAMESPACE = "6c8f0a2e-5b41-4d7a-9e3c-8055de051001";

/** Published TransactionKind value for a deposited check. */
export const CHECK_DEPOSIT_KIND = "checkDeposit";

/**
 * Mercury's published statuses are pending, sent, cancelled, failed, reversed,
 * and blocked. `cleared` is accepted because a settled deposit was described
 * that way; it is not in the current enum. `blocked` is neither posted nor a
 * reversal.
 */
const POSTED_STATUSES = new Set(["sent", "cleared"]);
const REVERSAL_STATUSES = new Set(["failed", "reversed", "returned", "cancelled", "canceled"]);

const NAME_SUFFIXES = new Set([
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
  "v",
  "esq",
  "phd",
  "md",
  "inc",
  "llc",
  "ltd",
  "co",
  "company",
  "corp",
  "corporation",
]);

export type MercuryTransactionEvent = {
  id: string;
  type: "transaction.created" | "transaction.updated";
  resourceId: string;
  mergePatch: Record<string, unknown>;
};

export type MercuryRead =
  | { kind: "ignore" }
  | { kind: "invalid" }
  | { kind: "transaction"; event: MercuryTransactionEvent };

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Empty secret returns false. The route must reject a missing secret with
 * 503 before calling this, so a configuration gap is not reported as 401.
 */
export function verifyMercurySignature(
  raw: string,
  header: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (!secret || !header) return false;
  const parts = header.split(",").map((part) => {
    const index = part.indexOf("=");
    if (index === -1) return ["", ""] as const;
    return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
  });
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest();
  return parts.some(([key, value]) => {
    if (key !== "v1" || !/^[a-f0-9]{64}$/i.test(value)) return false;
    const provided = Buffer.from(value, "hex");
    return provided.length === expected.length && timingSafeEqual(expected, provided);
  });
}

function eventType(record: Record<string, unknown>): string | null {
  const resource = text(record.resourceType);
  const operation = text(record.operationType);
  if (resource && operation) {
    const verb =
      operation === "create" ? "created" : operation === "update" ? "updated" : operation === "delete" ? "deleted" : operation;
    return `${resource}.${verb}`;
  }
  return text(record.type) || text(record.eventType);
}

/** Mercury event bodies follow the Events API: resourceType, operationType, and mergePatch. */
export function readMercuryEvent(value: unknown): MercuryRead {
  if (!isPlainObject(value)) return { kind: "invalid" };
  const type = eventType(value);
  if (!type) return { kind: "invalid" };
  if (type !== "transaction.created" && type !== "transaction.updated") return { kind: "ignore" };
  const patchValue = value.mergePatch ?? value.merge_patch ?? {};
  if (!isPlainObject(patchValue)) return { kind: "invalid" };
  const id = text(value.id);
  const resourceId = text(value.resourceId) || text(value.resource_id) || text(patchValue.id);
  if (!id || !resourceId) return { kind: "invalid" };
  return {
    kind: "transaction",
    event: {
      id,
      type,
      resourceId,
      mergePatch: patchValue,
    },
  };
}

/** RFC 7396 JSON Merge Patch. Null deletes a key. Nested objects merge. */
export function mergeJsonPatch(target: unknown, patch: unknown): Record<string, unknown> {
  const base = isPlainObject(target) ? { ...target } : {};
  if (!isPlainObject(patch)) return base;
  for (const [key, value] of Object.entries(patch)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (value === null) {
      delete base[key];
      continue;
    }
    base[key] = isPlainObject(value) ? mergeJsonPatch(base[key], value) : value;
  }
  return base;
}

/** Cents, or null when the value is not a finite decimal amount. */
export function exactCents(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return null;
  const cents = Math.round(numeric * 100);
  if (Math.abs(numeric * 100 - cents) > 1e-6) return null;
  return cents;
}

export function isPostedCheckStatus(status: string | null): boolean {
  return status !== null && POSTED_STATUSES.has(status);
}

export function isReversalStatus(status: string | null): boolean {
  return status !== null && REVERSAL_STATUSES.has(status);
}

/** Posted date in America/Los_Angeles, which is how check receipts are dated. */
export function paidOn(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Deterministic payment id. The same Mercury transaction always requests the
 * same crm_quote_bookkeeping_payments id, so a retry cannot post twice.
 */
export function mercuryPaymentRequestId(transactionId: string): string {
  const namespace = Buffer.from(PAYMENT_NAMESPACE.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(namespace).update(transactionId, "utf8").digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function mercuryDepositNotes(transactionId: string): string {
  return `Mercury check deposit ${transactionId}`;
}

function nameTokens(value: string): string[] {
  const pieces = value.split(",");
  // "Doe, Jane Mary" is last-name-first. "Jane Doe, Jr." keeps its suffix.
  if (pieces.length === 2) {
    const leading = pieces[1].toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().split(/\s+/)[0];
    if (leading && !NAME_SUFFIXES.has(leading)) value = `${pieces[1]} ${pieces[0]}`;
  }
  const tokens = value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && NAME_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens;
}

function givenNamesAgree(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const initial = (short: string, full: string) => short.length === 1 && full.startsWith(short);
  if (!(left[0] === right[0] || initial(left[0], right[0]) || initial(right[0], left[0]))) return false;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.every((token, index) => {
    if (index === 0) return true;
    return longer.some((other) => other === token || (token.length === 1 && other.startsWith(token)));
  });
}

/**
 * Conservative name match. Equal normalized names, the same tokens in any
 * order, or the same last name plus an agreeing given name (including a
 * single initial). Last name alone, or the same amount with a different
 * name, is not a match.
 */
export function confidentNameMatch(customer: string, counterparty: string): boolean {
  const left = nameTokens(customer);
  const right = nameTokens(counterparty);
  if (left.length === 0 || right.length === 0) return false;
  if (left.join(" ") === right.join(" ")) return true;
  if (
    left.length === 2 &&
    right.length === 2 &&
    [...left].sort().join(" ") === [...right].sort().join(" ")
  ) {
    return true;
  }
  const lastLeft = left[left.length - 1];
  const lastRight = right[right.length - 1];
  if (lastLeft.length < 2 || lastLeft !== lastRight) return false;
  return givenNamesAgree(left.slice(0, -1), right.slice(0, -1));
}
