import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import {
  confidentNameMatch,
  exactCents,
  isPostedCheckStatus,
  isReversalStatus,
  mercuryPaymentRequestId,
  mergeJsonPatch,
  paidOn,
  readMercuryEvent,
  verifyMercurySignature,
} from "./mercury";

const raw = '{"id":"evt_test"}';
const now = 1795200000000;
const secret = "test-mercury-webhook-secret";

it("verifies hex HMAC over exact raw bytes without JSON normalization", () => {
  const bytes = Buffer.from('{ "label": "café" }\n');
  const hex = createHmac("sha256", secret).update(bytes).digest("hex");
  expect(verifyMercurySignature(bytes, hex, secret)).toBe(true);
  expect(verifyMercurySignature(bytes, hex.toUpperCase(), secret)).toBe(true);
  expect(verifyMercurySignature(Buffer.from('{"label":"café"}'), hex, secret)).toBe(false);
  for (const malformed of [hex.slice(2), hex + "00", "g".repeat(64), hex + "," ]) {
    expect(verifyMercurySignature(bytes, malformed, secret)).toBe(false);
  }
});

function signature(body = raw, timestamp = now / 1000, key = secret) {
  const digest = createHmac("sha256", key).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

it("accepts a valid Mercury signature and rejects bad, stale, and empty ones", () => {
  const header = signature();
  expect(verifyMercurySignature(raw, header, secret, now)).toBe(true);
  expect(verifyMercurySignature(raw, `t=${now / 1000},v1=${"ab".repeat(32)}`, secret, now)).toBe(false);
  expect(verifyMercurySignature(raw + " ", header, secret, now)).toBe(false);
  expect(verifyMercurySignature(raw, header, secret, now + 301_000)).toBe(false);
  expect(verifyMercurySignature(raw, "", secret, now)).toBe(false);
  expect(verifyMercurySignature(raw, header, "", now)).toBe(false);
});

it("reads a transaction merge patch and ignores other Mercury resources", () => {
  const created = readMercuryEvent({
    id: "evt-1",
    resourceType: "transaction",
    resourceId: "txn-1",
    operationType: "create",
    mergePatch: { amount: 10, status: "pending" },
  });
  expect(created).toMatchObject({
    kind: "transaction",
    event: { id: "evt-1", type: "transaction.created", resourceId: "txn-1" },
  });
  expect(readMercuryEvent({ id: "evt-2", resourceType: "checkingAccount", operationType: "update", mergePatch: {} }).kind).toBe(
    "ignore",
  );
  expect(readMercuryEvent({ resourceType: "transaction", operationType: "update", mergePatch: {} }).kind).toBe("invalid");
});

it("merges a partial transaction update onto the stored patch", () => {
  expect(
    mergeJsonPatch(
      { amount: 10, status: "pending", counterpartyName: "Jane Doe", note: "old" },
      { status: "sent", postedAt: "2026-11-27T18:30:00.000Z", note: null },
    ),
  ).toEqual({
    amount: 10,
    status: "sent",
    counterpartyName: "Jane Doe",
    postedAt: "2026-11-27T18:30:00.000Z",
  });
});

it("matches normalized names conservatively and never treats a different person as the same", () => {
  expect(confidentNameMatch("Jane Doe", "JANE DOE")).toBe(true);
  expect(confidentNameMatch("Jane Doe", "Jane Doe, Jr.")).toBe(true);
  expect(confidentNameMatch("Jane Doe", "Doe, Jane")).toBe(true);
  expect(confidentNameMatch("Jane Doe", "Jane Q. Doe")).toBe(true);
  expect(confidentNameMatch("Jane Doe", "J Doe")).toBe(true);
  expect(confidentNameMatch("Jane Doe", "John Doe")).toBe(false);
  expect(confidentNameMatch("Jane Smith", "Smith")).toBe(false);
  expect(confidentNameMatch("Jane Mary Doe", "Mary Jane Doe")).toBe(false);
  expect(confidentNameMatch("Jane Doe", "")).toBe(false);
});

it("derives one payment id and a Los Angeles posted date", () => {
  const transactionId = "1d3042b6-af63-11f0-89d2-3503f2fcfef7";
  expect(mercuryPaymentRequestId(transactionId)).toBe(mercuryPaymentRequestId(transactionId));
  expect(mercuryPaymentRequestId(transactionId)).toMatch(/^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  expect(paidOn("2026-11-27T18:30:00.000Z")).toBe("2026-11-27");
  expect(paidOn("2026-11-28T07:30:00.000Z")).toBe("2026-11-27");
  expect(exactCents("1250.50")).toBe(125050);
  expect(exactCents(1250.51)).toBe(125051);
});

it("treats sent and cleared as posted, and failed, reversed, returned, and cancelled as reversals", () => {
  expect(["sent", "cleared"].every((status) => isPostedCheckStatus(status))).toBe(true);
  expect(isPostedCheckStatus("pending")).toBe(false);
  expect(isPostedCheckStatus("blocked")).toBe(false);
  expect(["failed", "reversed", "returned", "cancelled", "canceled"].every((status) => isReversalStatus(status))).toBe(true);
  expect(isReversalStatus("blocked")).toBe(false);
});

it("adds bank credits without dropping or altering existing tables", () => {
  const names = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql"));
  const file = "20261128200000_crm_bank_credits.sql";
  expect(names.includes(file)).toBe(true);
  expect(file > "20261128120000_cfo_ledger_webhook_triggers.sql").toBe(true);
  const sql = readFileSync(`supabase/migrations/${file}`, "utf8").toLowerCase();
  expect(sql).toContain("create table public.crm_bank_credits");
  expect(sql).toContain("create table public.crm_mercury_events");
  expect(sql).toContain("mercury_transaction_id text not null");
  expect(sql).toContain("enable row level security");
  expect(sql).toContain("force row level security");
  expect(sql).toContain("grant select, insert, update, delete on public.crm_bank_credits to service_role");
  expect(sql).toContain("revoke all on public.crm_bank_credits from public, anon, authenticated, service_role");
  expect(sql).not.toMatch(/\bdrop\b/);
  expect(sql).not.toContain("alter table public.crm_quotes");
  expect(sql).not.toContain("alter table public.crm_quote_bookkeeping_payments");
  expect(sql).not.toContain("references public.");
});
